$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$RootDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $RootDir

node desktop/release-signing-preflight-win.js
if ($LASTEXITCODE -ne 0) {
  throw "Signed Windows release preflight failed with exit code $LASTEXITCODE"
}

npm run test:desktop
if ($LASTEXITCODE -ne 0) {
  throw "Desktop tests failed with exit code $LASTEXITCODE"
}

npm run test:packages
if ($LASTEXITCODE -ne 0) {
  throw "Package consumer tests failed with exit code $LASTEXITCODE"
}

& ".\node_modules\.bin\electron-builder.cmd" `
  "--config" "desktop/electron-builder.win-release.cjs" `
  "--win" "nsis" "portable" `
  "--x64"
if ($LASTEXITCODE -ne 0) {
  throw "Signed Windows packaging failed with exit code $LASTEXITCODE"
}

powershell -NoProfile -ExecutionPolicy Bypass -File desktop/release-smoke-win.ps1
if ($LASTEXITCODE -ne 0) {
  throw "Packaged Windows release smoke failed with exit code $LASTEXITCODE"
}

$Version = (& node -p "require('./package.json').version").Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($Version)) {
  throw "Unable to read package version"
}

$ArtifactPaths = @(
  (Join-Path $RootDir "dist\DocFlow-Local-Setup-$Version-x64.exe"),
  (Join-Path $RootDir "dist\DocFlow-Local-$Version-Windows-x64.exe")
)
$Artifacts = @()
foreach ($ArtifactPath in $ArtifactPaths) {
  if (-not (Test-Path -LiteralPath $ArtifactPath -PathType Leaf)) {
    throw "Expected signed Windows artifact is missing: $ArtifactPath"
  }
  $Artifacts += Get-Item -LiteralPath $ArtifactPath
}

foreach ($Artifact in $Artifacts) {
  $Signature = Get-AuthenticodeSignature -LiteralPath $Artifact.FullName
  if (
    $Signature.Status -ne "Valid" -or
    $null -eq $Signature.SignerCertificate -or
    $Signature.SignerCertificate.Subject -eq $Signature.SignerCertificate.Issuer -or
    $Signature.SignerCertificate.Subject -match "DocFlow Local Community Preview" -or
    $null -eq $Signature.TimeStamperCertificate
  ) {
    throw "Authenticode verification failed for $($Artifact.Name): $($Signature.Status)"
  }
  Write-Host (
    "AUTHENTICODE_OK {0} signer={1} timestamp={2}" -f
    $Artifact.Name,
    $Signature.SignerCertificate.Thumbprint,
    $Signature.TimeStamperCertificate.Thumbprint
  )
}

$MetadataOutput = Join-Path $RootDir "dist\release-metadata-$Version-public-windows-x64"
& node "scripts/generate-release-metadata.js" `
  "--channel" "public" `
  "--platform" "windows" `
  "--arch" "x64" `
  "--output" $MetadataOutput
if ($LASTEXITCODE -ne 0) {
  throw "Windows release metadata generation failed with exit code $LASTEXITCODE"
}
