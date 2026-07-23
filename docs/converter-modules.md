# Optional document converter modules

MarkitDown distributes document conversion separately from the desktop installer. The desktop app downloads only the native module matching the current target, verifies it, and installs it below the application data directory.

## Supported targets

- `x86_64-pc-windows-msvc`
- `x86_64-apple-darwin`
- `aarch64-apple-darwin`
- `x86_64-unknown-linux-gnu`

Each `converter-v*` tag must match `src-tauri/resources/converter_version.txt`. The dedicated GitHub Actions workflow restores the frozen `converter/uv.lock`, builds all four native executables, tests protocol version 1, and publishes four ZIP archives.

## Release trust

The Windows converter is intentionally not Authenticode/SignPath-signed at this stage. This does not disable application-level integrity checks:

1. Each archive contains `module.json`, `module.sig`, and one native executable.
2. `module.sig` is an Ed25519 signature over the exact `module.json` bytes.
3. `module.json` contains the executable SHA-256.
4. The stable channel manifest is separately signed and contains every archive SHA-256 and size.
5. The desktop app verifies all of those values and runs `--version-json` before activation.

Generate a release key pair locally:

```powershell
node scripts/generate-converter-signing-key.mjs
```

Configure `private-key.base64` as the `CONVERTER_SIGNING_PRIVATE_KEY` GitHub Actions secret. Configure `public-key.base64` as the `CONVERTER_MANIFEST_PUBLIC_KEY` Actions variable used while building the desktop application. The private key must never be committed or printed in CI logs.

## Local build

```powershell
uv sync --project converter --frozen --group build
uv run --project converter pyinstaller --clean --noconfirm `
  --distpath converter-dist `
  --workpath converter-work `
  src-tauri/resources/document_converter.spec
```

Run `document_converter --version-json` before packaging. For an explicit developer fallback, install the dependencies yourself and set `MARKITDOWN_PYTHON`; the desktop app never searches for Python automatically.
