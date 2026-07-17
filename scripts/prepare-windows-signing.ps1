param(
    [string]$CertificateBase64 = $env:WINDOWS_CERTIFICATE_BASE64,
    [string]$CertificatePassword = $env:WINDOWS_CERTIFICATE_PASSWORD,
    [string]$TimestampUrl = "http://timestamp.digicert.com"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if ([string]::IsNullOrWhiteSpace($CertificateBase64)) {
    throw "WINDOWS_CERTIFICATE_BASE64 is required. Refusing to publish an unsigned Windows release."
}

if ([string]::IsNullOrWhiteSpace($CertificatePassword)) {
    throw "WINDOWS_CERTIFICATE_PASSWORD is required. Refusing to publish an unsigned Windows release."
}

$pfxPath = Join-Path $env:RUNNER_TEMP "markitdown-code-signing.pfx"
[IO.File]::WriteAllBytes($pfxPath, [Convert]::FromBase64String($CertificateBase64))

$securePassword = ConvertTo-SecureString $CertificatePassword -AsPlainText -Force
$certificate = Import-PfxCertificate `
    -FilePath $pfxPath `
    -CertStoreLocation Cert:\CurrentUser\My `
    -Password $securePassword

if (-not $certificate.HasPrivateKey) {
    throw "The imported code-signing certificate has no private key."
}

if ($certificate.NotAfter -le (Get-Date)) {
    throw "The code-signing certificate expired on $($certificate.NotAfter.ToString('u'))."
}

$signTool = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin\*\x64\signtool.exe" |
    Sort-Object { [version]$_.Directory.Parent.Name } -Descending |
    Select-Object -First 1

if (-not $signTool) {
    throw "signtool.exe was not found on the Windows runner."
}

$converterPath = Join-Path $PSScriptRoot "..\src-tauri\resources\document_converter.exe"
& $signTool.FullName sign /sha1 $certificate.Thumbprint /fd SHA256 /tr $TimestampUrl /td SHA256 $converterPath
if ($LASTEXITCODE -ne 0) {
    throw "Signing document_converter.exe failed with exit code $LASTEXITCODE."
}

& $signTool.FullName verify /pa /all $converterPath
if ($LASTEXITCODE -ne 0) {
    throw "Signature verification failed for document_converter.exe."
}

$overridePath = Join-Path $PSScriptRoot "..\src-tauri\tauri.windows-signing.conf.json"
@{
    bundle = @{
        windows = @{
            certificateThumbprint = $certificate.Thumbprint
            digestAlgorithm = "sha256"
            timestampUrl = $TimestampUrl
        }
    }
} | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $overridePath -Encoding utf8

Write-Host "Prepared Windows signing with certificate $($certificate.Thumbprint)."

