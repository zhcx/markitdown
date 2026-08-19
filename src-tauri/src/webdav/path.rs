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

    let workspace = workspace_roots
        .iter()
        .filter_map(|candidate| LocalPath::parse(candidate).ok())
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
        let workspace_name = workspace.display_name();
        let mut remote_segments = Vec::with_capacity(relative_segments.len() + 1);
        remote_segments.push(encode_segment(&workspace_name));
        remote_segments.extend(
            relative_segments
                .iter()
                .map(|segment| encode_segment(segment)),
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
                encode_segment(&display_name),
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

        let normalized = path.replace('\\', "/");
        let (flavor, prefix, raw_segments): (PathFlavor, String, Vec<&str>) =
            if is_windows_drive_path(&normalized) {
                (
                    PathFlavor::Windows,
                    normalized[..2].to_ascii_lowercase(),
                    normalized[3..].split('/').collect(),
                )
            } else if normalized.starts_with("//") {
                let parts: Vec<_> = normalized[2..]
                    .split('/')
                    .filter(|part| !part.is_empty())
                    .collect();
                if parts.len() < 2 {
                    return Err("UNC paths must include a server and share".to_string());
                }
                (
                    PathFlavor::Windows,
                    format!("//{}/{}", parts[0], parts[1]).to_ascii_lowercase(),
                    parts[2..].to_vec(),
                )
            } else if normalized.starts_with('/') {
                (
                    PathFlavor::Posix,
                    "/".to_string(),
                    normalized[1..].split('/').collect(),
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
            PathFlavor::Windows => left.eq_ignore_ascii_case(right),
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
            PathFlavor::Windows => joined.to_ascii_lowercase(),
            PathFlavor::Posix => joined,
        }
    }

    fn display_name(&self) -> String {
        self.segments.last().cloned().unwrap_or_else(|| {
            self.prefix
                .trim_matches('/')
                .trim_end_matches(':')
                .to_string()
        })
    }
}

fn is_windows_drive_path(path: &str) -> bool {
    let bytes = path.as_bytes();
    bytes.len() >= 3 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':' && bytes[2] == b'/'
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
}
