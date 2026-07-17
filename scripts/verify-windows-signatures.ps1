param(
    [string]$BundleDirectory = "src-tauri\target\x86_64-pc-windows-msvc\release\bundle"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$artifacts = Get-ChildItem -LiteralPath $BundleDirectory -Recurse -File |
    Where-Object { $_.Extension -in ".exe", ".msi" }

if (-not $artifacts) {
    throw "No Windows installer artifacts were found in $BundleDirectory."
}

foreach ($artifact in $artifacts) {
    $signature = Get-AuthenticodeSignature -LiteralPath $artifact.FullName
    if ($signature.Status -ne "Valid") {
        throw "Invalid Authenticode signature on $($artifact.FullName): $($signature.StatusMessage)"
    }

    Write-Host "Verified $($artifact.Name), publisher: $($signature.SignerCertificate.Subject)"
}

