# SignPath Foundation Application — MarkitDown

This document contains copy-ready English application material. Replace only the two explicitly marked applicant fields before submission at <https://signpath.org/apply>.

## Applicant details

- **Applicant full name:** `[APPLICANT MUST FILL: legal/full name]`
- **Applicant email address:** `[APPLICANT MUST FILL: monitored email address]`
- **GitHub account:** `zhcx`
- **Project role:** Project owner, maintainer, committer, reviewer, and release approver

## Project details

- **Project name:** MarkitDown
- **Repository:** <https://github.com/zhcx/markitdown>
- **Project website:** <https://github.com/zhcx/markitdown>
- **Release/download page:** <https://github.com/zhcx/markitdown/releases>
- **License:** MIT License
- **License file:** <https://github.com/zhcx/markitdown/blob/main/LICENSE>
- **Privacy policy:** <https://github.com/zhcx/markitdown/blob/main/PRIVACY.md>
- **Code signing policy:** <https://github.com/zhcx/markitdown/blob/main/CODE_SIGNING_POLICY.md>
- **Build workflow:** <https://github.com/zhcx/markitdown/blob/main/.github/workflows/build.yml>
- **Primary language/technology:** TypeScript, React, Rust, Tauri, and Python
- **Supported platforms:** Windows x64, macOS Intel/Apple Silicon, and Linux x64

## Short project description

MarkitDown is a free, open-source, local-first Markdown desktop editor built with Tauri. It provides multi-tab editing, live preview, document conversion, export, optional user-configured AI assistance, web search, and image-hosting integrations. The complete application source and release workflow are public under the MIT License.

## Why code signing is requested

MarkitDown distributes Windows MSI and NSIS installers. Because the project currently has no trusted Authenticode certificate, Windows and browser reputation systems may show an unknown-publisher warning even for artifacts built by the official GitHub Actions workflow. We are requesting SignPath Foundation code signing so users can verify publisher identity and artifact integrity and so the project can establish a consistent Windows reputation without distributing or storing a private signing key.

## Windows artifacts to be signed

The project requests a two-stage signing configuration:

1. **Inner executable stage:** the Tauri application executable (`markitdown.exe`) and the CI-built document converter (`document_converter.exe`).
2. **Installer stage:** the final Windows x64 MSI package and NSIS setup executable.

Both stages originate from the same GitHub-hosted workflow run and release commit. Each release request will require manual approval.

## Build and provenance statement

All binaries are verifiably built from public source in GitHub Actions using GitHub-hosted runners. Node dependencies are installed from `package-lock.json`, Rust dependencies from `Cargo.lock`, and the Windows Python converter from a complete Python 3.12/Windows x64 lock file containing exact versions and SHA-256 package hashes. The converter executable is not stored in the repository. A checked-in PyInstaller specification defines its contents.

The workflow first builds and uploads the inner executables, submits them to SignPath, and then packages the signed executables into MSI and NSIS installers. The installers are uploaded and submitted in a second SignPath request. Only artifacts returned by SignPath and verified by the workflow are intended for signed releases.

## Governance and signing controls

- **Committers and reviewers:** `zhcx` — <https://github.com/zhcx>
- **Signing approvers:** `zhcx` — <https://github.com/zhcx>
- Multi-factor authentication will be enabled for every repository and SignPath account with release or signing authority.
- Signed releases require manual approval and must correspond to an official, immutable version tag.
- The public code signing policy documents provenance, roles, verification, privacy, and incident response.
- MarkitDown signs only its own project artifacts and contains no proprietary project component.

## Privacy statement

MarkitDown does not operate maintainer-controlled analytics, advertising, telemetry, or user-account services. Documents are processed locally unless a user deliberately invokes a configured third-party integration such as an AI provider, web search service, image host, or GitHub update check. Those direct user-selected transfers and local credential storage are disclosed in the public privacy policy. Signing transfers only release artifacts and related build metadata to GitHub and SignPath.

## Required SignPath attribution

The public code signing policy contains the required attribution and clearly labels the current pending status:

> Free code signing provided by SignPath.io, certificate by SignPath Foundation

## Submission checklist

Before submitting:

- Fill in the applicant full name and monitored email address above.
- Enable multi-factor authentication on GitHub and the SignPath account.
- Confirm that `LICENSE`, `PRIVACY.md`, `CODE_SIGNING_POLICY.md`, the locked converter build, and the two-stage workflow are visible on the default branch.
- Confirm that at least one public release and its source tag remain available.
- Do not claim that existing unsigned artifacts are signed.

After acceptance, configure the SignPath identifiers as GitHub Actions variables and the API token as a GitHub Actions secret, then run a new immutable release tag through the manually approved two-stage flow.
