use reqwest::Url;
use sha2::{Digest, Sha256};

use super::model::RemoteDocumentPath;

pub fn validate_endpoint(raw: &str) -> Result<Url, String> {
    let endpoint = raw.trim();
    let url = Url::parse(endpoint).map_err(|_| "WebDAV endpoint is not a valid URL".to_string())?;

    if !matches!(url.scheme(), "http" | "https") {
        return Err("WebDAV endpoint must use HTTP or HTTPS".to_string());
    }
    if url.host_str().is_none() {
        return Err("WebDAV endpoint must include a host".to_string());
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("WebDAV endpoint must not contain credentials".to_string());
    }
    if url.query().is_some() || url.fragment().is_some() {
        return Err("WebDAV endpoint must not contain a query or fragment".to_string());
    }

    Ok(url)
}

pub fn normalize_remote_root(raw: &str) -> Result<String, String> {
    let root = raw.trim();
    if root.is_empty() {
        return Err("WebDAV remote root is required".to_string());
    }
    if root.contains(['?', '#', '\\']) {
        return Err("WebDAV remote root contains an unsafe character".to_string());
    }
    if !has_valid_percent_escapes(root) {
        return Err("WebDAV remote root contains invalid percent encoding".to_string());
    }

    let mut encoded_segments = Vec::new();
    for segment in root.split('/').filter(|segment| !segment.is_empty()) {
        let decoded = urlencoding::decode(segment)
            .map_err(|_| "WebDAV remote root contains invalid percent encoding".to_string())?;
        if matches!(decoded.as_ref(), "." | "..")
            || decoded.contains(['/', '\\', '?', '#'])
            || decoded.chars().any(char::is_control)
        {
            return Err("WebDAV remote root contains an unsafe path segment".to_string());
        }
        encoded_segments.push(urlencoding::encode(&decoded).into_owned());
    }

    if encoded_segments.is_empty() {
        Ok("/".to_string())
    } else {
        Ok(format!("/{}", encoded_segments.join("/")))
    }
}

pub fn map_remote_document(
    local_path: &str,
    workspace_roots: &[String],
    remote_root: &str,
) -> Result<RemoteDocumentPath, String> {
    let remote_root = normalize_remote_root(remote_root)?;
    let local = LocalPath::parse(local_path)?;
    let display_name = local
        .segments
        .last()
        .cloned()
        .ok_or_else(|| "Local document path must include a file name".to_string())?;

    let workspaces: Vec<_> = workspace_roots
        .iter()
        .filter_map(|candidate| LocalPath::parse(candidate).ok())
        .collect();
    let workspace = workspaces
        .iter()
        .filter(|candidate| candidate.contains(&local))
        .max_by_key(|candidate| (candidate.segments.len(), candidate.identity().len()));

    let (document_id, current_path) = if let Some(workspace) = workspace {
        let relative_segments = &local.segments[workspace.segments.len()..];
        if relative_segments.is_empty() {
            return Err("Workspace document path must include a relative file name".to_string());
        }

        let relative_identity = local.identity_segments(relative_segments);
        let identity = format!("{}\0{}", workspace.identity(), relative_identity);
        let document_id = short_digest(identity.as_bytes());
        let mut workspace_segment = workspace.workspace_remote_segment();
        let workspace_identity = workspace.identity();
        let duplicate_name = workspaces.iter().any(|candidate| {
            candidate.identity() != workspace_identity
                && candidate.workspace_remote_segment() == workspace_segment
        });
        if duplicate_name {
            workspace_segment.push('-');
            workspace_segment.push_str(&root_discriminator(workspace));
        }
        let mut remote_segments = Vec::with_capacity(relative_segments.len() + 1);
        remote_segments.push(workspace_segment);
        remote_segments.extend(
            relative_segments
                .iter()
                .map(|segment| local.encode_remote_segment(segment)),
        );
        let current_path = append_remote_segments(&remote_root, &remote_segments);
        (document_id, current_path)
    } else {
        let stable_id = short_digest(local.identity().as_bytes());
        let current_path = append_remote_segments(
            &remote_root,
            &[
                "Standalone".to_string(),
                stable_id.clone(),
                local.encode_remote_segment(&display_name),
            ],
        );
        (stable_id, current_path)
    };

    let history_base = append_remote_segments(
        &remote_root,
        &[
            ".zeditor-history".to_string(),
            "documents".to_string(),
            document_id.clone(),
        ],
    );

    Ok(RemoteDocumentPath {
        document_id,
        display_name,
        current_path,
        manifest_path: format!("{history_base}/manifest.json"),
        versions_dir: format!("{history_base}/versions"),
    })
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

pub fn deterministic_version_id(created_at: &str, sha256: &str) -> String {
    short_digest(format!("{created_at}\0{sha256}").as_bytes())
}

fn short_digest(bytes: &[u8]) -> String {
    sha256_hex(bytes)[..24].to_string()
}

fn encode_segment(segment: &str) -> String {
    urlencoding::encode(segment).into_owned()
}

fn has_valid_percent_escapes(value: &str) -> bool {
    let bytes = value.as_bytes();
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            if index + 2 >= bytes.len()
                || !bytes[index + 1].is_ascii_hexdigit()
                || !bytes[index + 2].is_ascii_hexdigit()
            {
                return false;
            }
            index += 3;
        } else {
            index += 1;
        }
    }
    true
}

fn root_discriminator(path: &LocalPath) -> String {
    sha256_hex(path.identity().as_bytes())[..8].to_string()
}

fn append_remote_segments(root: &str, segments: &[String]) -> String {
    let suffix = segments.join("/");
    if root == "/" {
        format!("/{suffix}")
    } else {
        format!("{root}/{suffix}")
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PathFlavor {
    Posix,
    Windows,
}

#[derive(Debug, Clone)]
struct LocalPath {
    flavor: PathFlavor,
    prefix: String,
    segments: Vec<String>,
}

impl LocalPath {
    fn parse(raw: &str) -> Result<Self, String> {
        let path = raw.trim();
        if path.is_empty() {
            return Err("Local document path is required".to_string());
        }

        let normalized;
        let (flavor, prefix, raw_segments): (PathFlavor, String, Vec<&str>) =
            if is_windows_drive_path(path) {
                normalized = path.replace('\\', "/");
                let prefix = normalized
                    .get(..2)
                    .ok_or_else(|| "Windows paths must include a drive".to_string())?;
                let remainder = normalized
                    .get(2..)
                    .and_then(|value| value.strip_prefix('/'))
                    .ok_or_else(|| "Windows drive paths must be absolute".to_string())?;
                (
                    PathFlavor::Windows,
                    prefix.to_lowercase(),
                    remainder.split('/').collect(),
                )
            } else if is_windows_unc_path(path) {
                normalized = path.replace('\\', "/");
                let remainder = normalized
                    .strip_prefix("//")
                    .ok_or_else(|| "UNC paths must start with two separators".to_string())?;
                let parts: Vec<_> = remainder
                    .split('/')
                    .filter(|part| !part.is_empty())
                    .collect();
                if parts.len() < 2 {
                    return Err("UNC paths must include a server and share".to_string());
                }
                (
                    PathFlavor::Windows,
                    format!("//{}/{}", parts[0], parts[1]).to_lowercase(),
                    parts[2..].to_vec(),
                )
            } else if let Some(remainder) = path.strip_prefix('/') {
                (
                    PathFlavor::Posix,
                    "/".to_string(),
                    remainder.split('/').collect(),
                )
            } else {
                return Err("Local document path must be absolute".to_string());
            };

        let mut segments = Vec::new();
        for segment in raw_segments {
            match segment {
                "" | "." => {}
                ".." => {
                    if segments.pop().is_none() {
                        return Err("Local document path escapes its root".to_string());
                    }
                }
                _ => segments.push(segment.to_string()),
            }
        }

        Ok(Self {
            flavor,
            prefix,
            segments,
        })
    }

    fn contains(&self, other: &Self) -> bool {
        self.flavor == other.flavor
            && self.component_eq(&self.prefix, &other.prefix)
            && self.segments.len() <= other.segments.len()
            && self
                .segments
                .iter()
                .zip(&other.segments)
                .all(|(left, right)| self.component_eq(left, right))
    }

    fn component_eq(&self, left: &str, right: &str) -> bool {
        match self.flavor {
            PathFlavor::Windows => left.to_lowercase() == right.to_lowercase(),
            PathFlavor::Posix => left == right,
        }
    }

    fn identity(&self) -> String {
        let segments = self.identity_segments(&self.segments);
        if self.prefix == "/" {
            format!("/{segments}")
        } else if segments.is_empty() {
            self.prefix.clone()
        } else {
            format!("{}/{segments}", self.prefix)
        }
    }

    fn identity_segments(&self, segments: &[String]) -> String {
        let joined = segments.join("/");
        match self.flavor {
            PathFlavor::Windows => joined.to_lowercase(),
            PathFlavor::Posix => joined,
        }
    }

    fn encode_remote_segment(&self, segment: &str) -> String {
        match self.flavor {
            PathFlavor::Windows => encode_segment(&segment.to_lowercase()),
            PathFlavor::Posix => encode_segment(segment),
        }
    }

    fn workspace_remote_segment(&self) -> String {
        self.segments
            .last()
            .map(|segment| self.encode_remote_segment(segment))
            .unwrap_or_else(|| format!("root-{}", root_discriminator(self)))
    }
}

fn is_windows_drive_path(path: &str) -> bool {
    let bytes = path.as_bytes();
    bytes.len() >= 3
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && matches!(bytes[2], b'/' | b'\\')
}

fn is_windows_unc_path(path: &str) -> bool {
    path.starts_with("\\\\") || path.starts_with("//")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_endpoint_rejects_embedded_credentials() {
        assert!(validate_endpoint("https://user:secret@example.com/dav").is_err());
    }

    #[test]
    fn normalize_remote_root_rejects_traversal_query_and_fragment() {
        assert!(normalize_remote_root("/Zeditor/../private").is_err());
        assert!(normalize_remote_root("/Zeditor?folder=private").is_err());
        assert!(normalize_remote_root("/Zeditor#private").is_err());
    }

    #[test]
    fn normalize_remote_root_rejects_malformed_percent_escapes() {
        for root in ["/Zeditor/%", "/Zeditor/%2", "/Zeditor/%GG"] {
            assert!(normalize_remote_root(root).is_err(), "accepted {root}");
        }
    }

    #[test]
    fn maps_workspace_document_to_workspace_relative_remote_path() {
        let mapped = map_remote_document(
            "C:\\notes\\docs\\note.md",
            &["C:\\notes".to_string()],
            "/Zeditor",
        )
        .expect("workspace mapping");

        assert_eq!(mapped.current_path, "/Zeditor/notes/docs/note.md");
    }

    #[test]
    fn maps_standalone_document_without_exposing_parent_path() {
        let mapped = map_remote_document("C:\\private\\note.md", &[], "/Zeditor")
            .expect("standalone mapping");

        assert!(mapped.current_path.starts_with("/Zeditor/Standalone/"));
        assert!(mapped.current_path.ends_with("/note.md"));
        assert!(!mapped.current_path.to_ascii_lowercase().contains("private"));
    }

    #[test]
    fn selects_the_longest_containing_workspace_root() {
        let mapped = map_remote_document(
            "C:\\notes\\docs\\note.md",
            &["C:\\notes".to_string(), "C:\\notes\\docs".to_string()],
            "/Zeditor",
        )
        .expect("longest workspace mapping");

        assert_eq!(mapped.current_path, "/Zeditor/docs/note.md");
    }

    #[test]
    fn workspace_containment_respects_component_boundaries() {
        let mapped = map_remote_document(
            "/work/project-copy/note.md",
            &["/work/project".to_string()],
            "/Zeditor",
        )
        .expect("standalone boundary mapping");

        assert!(mapped.current_path.starts_with("/Zeditor/Standalone/"));
    }

    #[test]
    fn posix_backslash_is_preserved_inside_one_encoded_file_name() {
        let mapped = map_remote_document("/work/foo\\bar.md", &["/work".to_string()], "/Zeditor")
            .expect("POSIX backslash mapping");

        assert_eq!(mapped.display_name, "foo\\bar.md");
        assert_eq!(mapped.current_path, "/Zeditor/work/foo%5Cbar.md");
    }

    #[test]
    fn posix_root_workspace_uses_a_non_empty_deterministic_segment() {
        let first = map_remote_document("/work/note.md", &["/".to_string()], "/Zeditor")
            .expect("root workspace mapping");
        let second = map_remote_document("/work/note.md", &["/".to_string()], "/Zeditor")
            .expect("stable root workspace mapping");

        assert!(first.current_path.starts_with("/Zeditor/root-"));
        assert!(first.current_path.ends_with("/work/note.md"));
        assert!(!first.current_path.contains("//"));
        assert_eq!(first.current_path, second.current_path);
    }

    #[test]
    fn duplicate_workspace_names_receive_stable_root_discriminators() {
        let roots = vec!["/a/project".to_string(), "/b/project".to_string()];
        let first = map_remote_document("/a/project/note.md", &roots, "/Zeditor")
            .expect("first duplicate workspace");
        let second = map_remote_document("/b/project/note.md", &roots, "/Zeditor")
            .expect("second duplicate workspace");
        let repeated = map_remote_document("/a/project/note.md", &roots, "/Zeditor")
            .expect("stable duplicate workspace");

        assert_ne!(first.current_path, second.current_path);
        assert!(first.current_path.starts_with("/Zeditor/project-"));
        assert!(second.current_path.starts_with("/Zeditor/project-"));
        assert_eq!(first.current_path, repeated.current_path);
    }

    #[test]
    fn windows_casing_aliases_emit_the_same_identity_and_remote_path() {
        let upper =
            map_remote_document("C:\\Notes\\Doc.md", &["C:\\Notes".to_string()], "/Zeditor")
                .expect("uppercase Windows mapping");
        let lower =
            map_remote_document("c:\\notes\\doc.md", &["c:\\notes".to_string()], "/Zeditor")
                .expect("lowercase Windows mapping");

        assert_eq!(upper.document_id, lower.document_id);
        assert_eq!(upper.current_path, lower.current_path);
        assert_eq!(upper.current_path, "/Zeditor/notes/doc.md");
    }

    #[test]
    fn generated_segments_are_encoded_and_document_ids_are_short_hex() {
        let mapped = map_remote_document(
            "/work/My Notes/hello world#.md",
            &["/work/My Notes".to_string()],
            "/Zeditor",
        )
        .expect("encoded workspace mapping");

        assert_eq!(
            mapped.current_path,
            "/Zeditor/My%20Notes/hello%20world%23.md"
        );
        assert_eq!(mapped.document_id.len(), 24);
        assert!(mapped
            .document_id
            .chars()
            .all(|character| character.is_ascii_hexdigit()));
    }
}
