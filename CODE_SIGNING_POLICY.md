# Code Signing Policy

## Status

SignPath Foundation enrollment is currently pending. Until the integration is approved and enabled, Windows release files may be unsigned and GitHub release notes must identify them as such.

After enrollment is enabled, the required attribution will be:

> Free code signing provided by SignPath.io, certificate by SignPath Foundation

Signed releases will display **SignPath Foundation** as the certificate publisher. This does not imply endorsement of MarkitDown by SignPath Foundation.

## Scope and provenance

Only official MarkitDown release artifacts produced from this public repository by the checked-in GitHub Actions workflow are eligible for signing. All upstream build jobs use GitHub-hosted runners. The Windows converter is built in CI from its public Python source, a reviewed PyInstaller specification, and a complete version-and-hash-locked dependency file; no prebuilt converter executable is committed.

The planned two-stage process covers the main Windows application only:

1. GitHub Actions builds the MarkitDown application executable, uploads it to GitHub, and submits it to SignPath.
2. After the application executable is signed, GitHub Actions creates the MSI and NSIS installers, uploads them to GitHub, and submits the installers to SignPath.
3. Only the returned, verified artifacts are attached to an official release. If SignPath is not configured, the workflow follows the explicitly labelled unsigned fallback.

The optional Windows document-converter module is distributed separately and is not currently submitted to SignPath or Authenticode-signed. Its installer enforces an Ed25519-signed release manifest and SHA-256 verification before activation.

The Git commit and release tag remain the source of truth for every build. Release tags must be immutable; corrections are published under a new version instead of moving an existing tag.

## Roles and approval

- **Committers and reviewers:** [zhcx](https://github.com/zhcx)
- **Approvers:** [zhcx](https://github.com/zhcx)

Every signed release requires manual approval in SignPath. The approver checks that the request comes from the official GitHub Actions workflow, refers to the intended immutable release tag and commit, and contains only expected MarkitDown artifacts. Repository and SignPath accounts used for these roles must have multi-factor authentication enabled.

Role assignments will be updated here before additional maintainers receive signing authority. A person must not approve an unexplained or unexpected signing request.

## Release verification

Users can verify a downloaded Windows file in PowerShell:

```powershell
Get-AuthenticodeSignature .\MarkitDown_0.3.0_x64-setup.exe |
  Format-List Status,SignerCertificate,TimeStamperCertificate
```

For a signed release, `Status` must be `Valid`, the signer must be `SignPath Foundation`, and a trusted timestamp must be present. Checksums published with a release should also be compared before execution.

## Privacy and incident response

The application privacy terms are in [PRIVACY.md](PRIVACY.md). Build artifacts and signing metadata are transferred to GitHub and SignPath only as part of an official release request.

Suspected key misuse, compromised maintainer accounts, unexpected signing requests, or incorrectly signed artifacts must be reported through a private GitHub security advisory at <https://github.com/zhcx/markitdown/security/advisories/new>. Affected releases will be withdrawn, SignPath will be notified, and a corrected release will use a new immutable version tag.
