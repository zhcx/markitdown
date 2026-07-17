param(
    [string]$Python = "python",
    [string]$OutputDirectory = ""
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$lockPath = Join-Path $repoRoot "requirements-converter.lock"
$specPath = Join-Path $repoRoot "src-tauri\resources\document_converter.spec"

if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
    $OutputDirectory = Join-Path $repoRoot "src-tauri\resources"
}

$OutputDirectory = [IO.Path]::GetFullPath($OutputDirectory)
$workParent = if ([string]::IsNullOrWhiteSpace($env:RUNNER_TEMP)) {
    Join-Path $repoRoot ".converter-build"
} else {
    Join-Path $env:RUNNER_TEMP "markitdown-converter"
}
$workPath = Join-Path $workParent "pyinstaller-work"
$converterPath = Join-Path $OutputDirectory "document_converter.exe"

New-Item -ItemType Directory -Force -Path $OutputDirectory, $workPath | Out-Null

& $Python -m pip install `
    --disable-pip-version-check `
    --only-binary=:all: `
    --require-hashes `
    -r $lockPath
if ($LASTEXITCODE -ne 0) {
    throw "Installing hash-locked converter dependencies failed with exit code $LASTEXITCODE."
}

& $Python -m PyInstaller `
    --clean `
    --noconfirm `
    --distpath $OutputDirectory `
    --workpath $workPath `
    $specPath
if ($LASTEXITCODE -ne 0) {
    throw "Building document_converter.exe failed with exit code $LASTEXITCODE."
}

if (-not (Test-Path -LiteralPath $converterPath -PathType Leaf)) {
    throw "PyInstaller completed without producing $converterPath."
}

$artifact = Get-Item -LiteralPath $converterPath
$digest = (Get-FileHash -LiteralPath $converterPath -Algorithm SHA256).Hash.ToLowerInvariant()
Write-Host "Built $($artifact.FullName) ($($artifact.Length) bytes, sha256:$digest)."
