# Windows code signing with SignPath

The release workflow is ready for SignPath Foundation's GitHub integration. It remains in an explicit unsigned fallback mode until the application is approved and every required repository value is configured.

## Architecture

Windows signing is intentionally split into two requests:

1. Build `markitdown.exe` and the hash-locked, CI-generated `document_converter.exe`; upload both as a GitHub Actions artifact; request manual SignPath approval and signing.
2. Replace the local files with the signed copies, build MSI and NSIS installers, upload the installers as another GitHub Actions artifact, and request manual SignPath approval and signing.
3. Verify Authenticode signatures and publish only the returned installer files. When SignPath settings are absent, the workflow publishes the generated installers without signatures and emits a prominent warning.

This structure ensures that both the installed executables and their outer installers can be signed. The pre-sign artifacts exist on GitHub before each request, and every build job upstream of the requests uses a GitHub-hosted runner.

## GitHub configuration after approval

Create one Actions secret:

- `SIGNPATH_API_TOKEN`

Create these Actions variables:

- `SIGNPATH_ORGANIZATION_ID`
- `SIGNPATH_PROJECT_SLUG`
- `SIGNPATH_SIGNING_POLICY_SLUG`
- `SIGNPATH_EXECUTABLES_ARTIFACT_CONFIGURATION_SLUG`
- `SIGNPATH_INSTALLERS_ARTIFACT_CONFIGURATION_SLUG`

The two artifact configurations should accept the default ZIP artifact created by `actions/upload-artifact@v7`:

- Executable configuration: `markitdown.exe` and `document_converter.exe`, both Authenticode-signed.
- Installer configuration: one `.msi` and one NSIS `.exe`, both Authenticode-signed.

Do not add placeholder or partial values. The workflow enables signing only when all six values are present; otherwise it takes the unsigned fallback path.

Install the SignPath GitHub App as instructed by SignPath and link the repository to the SignPath project. Configure the signing policy for manual approval, restrict the project to GitHub's trusted build system, and require GitHub-hosted runners.

## Locked converter build

The converter executable is not tracked in Git. On Windows CI, Python 3.12 installs every package from `requirements-converter.lock` using `pip --require-hashes`, then PyInstaller executes `src-tauri/resources/document_converter.spec`. To reproduce the build environment on Windows:

```powershell
./scripts/build-document-converter.ps1
```

The lock is target-specific: CPython 3.12 on Windows x64. `requirements-converter.in` records the two direct build inputs. Dependency updates must be resolved for that target, reviewed, and committed with new hashes rather than editing only the top-level version.

## Verification

The workflow verifies returned files before upload. A release can also be checked manually:

```powershell
Get-AuthenticodeSignature .\MarkitDown_0.3.0_x64-setup.exe |
  Format-List Status,SignerCertificate,TimeStamperCertificate
```

For a SignPath-signed build, the result must be `Valid`, the signer subject must contain `SignPath Foundation`, and a timestamp certificate must be present. See the repository's [Code Signing Policy](../CODE_SIGNING_POLICY.md) for governance and incident handling.
