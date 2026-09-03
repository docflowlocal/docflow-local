param([switch]$SkipTests)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot "windows-preview-certificate.ps1")

if ($env:OS -ne "Windows_NT") { throw "Windows Self-Signed Preview must be built on Windows" }
$RootDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $RootDir
$Pinned = Get-DocFlowPreviewCertificate
$SigningCertificate = Get-Item -LiteralPath "Cert:\CurrentUser\My\$($Pinned.Metadata.sha1Thumbprint)" -ErrorAction Stop
Assert-DocFlowPreviewCertificate -Certificate $SigningCertificate -Metadata $Pinned.Metadata -RequirePrivateKey

if (-not $SkipTests) {
  npm run test:desktop
  if ($LASTEXITCODE -ne 0) { throw "Desktop tests failed with exit code $LASTEXITCODE" }
  npm run test:release
  if ($LASTEXITCODE -ne 0) { throw "Release tests failed with exit code $LASTEXITCODE" }
}

$Version = (& node -p "require('./package.json').version").Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($Version)) { throw "Unable to read package version" }
if ($Version -notmatch '^[0-9]+\.[0-9]+\.[0-9]+-preview\.[0-9]+$') { throw "Self-signed builds require an explicit preview version" }
$Expected = @(
  (Join-Path $RootDir "dist\DocFlow-Local-Setup-$Version-x64-Self-Signed-Preview.exe"),
  (Join-Path $RootDir "dist\DocFlow-Local-$Version-Windows-x64-Self-Signed-Preview.exe")
)
foreach ($Path in $Expected) { Remove-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue }

$env:SIGNTOOL_TIMEOUT = "120000"
Write-Host "PREVIEW_PACKAGING_START version=$Version signtoolTimeoutMs=$env:SIGNTOOL_TIMEOUT"
& ".\node_modules\.bin\electron-builder.cmd" `
  "--config" "desktop/electron-builder.win-self-signed-preview.cjs" `
  "--win" "nsis" "portable" "--x64" "--publish" "never"
if ($LASTEXITCODE -ne 0) { throw "Self-signed Windows packaging failed with exit code $LASTEXITCODE" }
Write-Host "PREVIEW_PACKAGING_COMPLETE version=$Version"

Write-Host "PREVIEW_SMOKE_START version=$Version"
powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File desktop/release-smoke-win.ps1
if ($LASTEXITCODE -ne 0) { throw "Packaged Windows release smoke failed with exit code $LASTEXITCODE" }
Write-Host "PREVIEW_SMOKE_COMPLETE version=$Version"

$LocalesDir = Join-Path $RootDir "dist\win-unpacked\locales"
$ExpectedLocales = @("en-US.pak", "zh-CN.pak")
$ActualLocales = @(Get-ChildItem -LiteralPath $LocalesDir -Filter "*.pak" -File | ForEach-Object { $_.Name } | Sort-Object)
$Difference = Compare-Object -ReferenceObject ($ExpectedLocales | Sort-Object) -DifferenceObject $ActualLocales
if ($Difference) { throw "Windows package locales are not exactly English and Simplified Chinese: $($ActualLocales -join ', ')" }

# Trust is added only after signing to avoid ambiguous certificate-store selection.
# It exists only on the ephemeral build runner, never in the installer or app.
if ($env:GITHUB_ACTIONS -eq "true" -and $env:RUNNER_ENVIRONMENT -eq "github-hosted" -and $env:RUNNER_OS -eq "Windows") {
  Write-Host "PREVIEW_TRUST_START store=LocalMachine/Root"
  Import-Certificate -FilePath $Pinned.Path -CertStoreLocation "Cert:\LocalMachine\Root" -Confirm:$false | Out-Null
  $TrustedCertificate = Get-Item -LiteralPath "Cert:\LocalMachine\Root\$($Pinned.Metadata.sha1Thumbprint)" -ErrorAction Stop
  Assert-DocFlowPreviewCertificate -Certificate $TrustedCertificate -Metadata $Pinned.Metadata
  Write-Host "PREVIEW_TRUST_READY store=LocalMachine/Root thumbprint=$($Pinned.Metadata.sha1Thumbprint)"
}

$ArtifactPaths = @($Expected[0], $Expected[1], (Join-Path $RootDir "dist\win-unpacked\DocFlow Local.exe"))
$Signtool = Get-Command "signtool.exe" -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source
if (-not $Signtool) {
  $SdkRoot = Join-Path ${env:ProgramFiles(x86)} "Windows Kits\10\bin"
  $Signtool = Get-ChildItem -LiteralPath $SdkRoot -Directory |
    Sort-Object Name -Descending |
    ForEach-Object { Join-Path $_.FullName "x64\signtool.exe" } |
    Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } |
    Select-Object -First 1
}
if (-not $Signtool) { throw "signtool.exe was not found" }

$Verification = @()
Write-Host "PREVIEW_VERIFY_START artifacts=$($ArtifactPaths.Count)"
foreach ($Path in $ArtifactPaths) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "Expected signed artifact is missing: $Path" }
  Write-Host "PREVIEW_VERIFY_FILE_START $(Split-Path -Leaf $Path)"
  $Signature = Get-AuthenticodeSignature -LiteralPath $Path
  if (
    $Signature.Status -ne "Valid" -or $null -eq $Signature.SignerCertificate -or
    $Signature.SignerCertificate.Thumbprint -ne $Pinned.Metadata.sha1Thumbprint -or
    $null -eq $Signature.TimeStamperCertificate
  ) { throw "Pinned self-signed Authenticode verification failed for ${Path}: $($Signature.Status)" }
  Assert-DocFlowPreviewCertificate -Certificate $Signature.SignerCertificate -Metadata $Pinned.Metadata
  & $Signtool "verify" "/pa" "/all" "/v" "/tw" $Path | Out-Host
  if ($LASTEXITCODE -ne 0) { throw "signtool verification failed for $Path" }
  $Hash = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
  $Verification += [ordered]@{
    name = Split-Path -Leaf $Path
    sha256 = $Hash
    authenticodeStatus = [string]$Signature.Status
    signerThumbprint = $Signature.SignerCertificate.Thumbprint
    timestampThumbprint = $Signature.TimeStamperCertificate.Thumbprint
  }
  Write-Host "SELF_SIGNED_PREVIEW_OK $(Split-Path -Leaf $Path) sha256=$Hash"
}
Write-Host "PREVIEW_VERIFY_COMPLETE artifacts=$($Verification.Count)"
$Utf8NoBom = [System.Text.UTF8Encoding]::new($false)
$VerificationJson = (([ordered]@{ schemaVersion = 1; artifacts = $Verification } | ConvertTo-Json -Depth 5) -replace "`r`n", "`n") + "`n"
[System.IO.File]::WriteAllText((Join-Path $RootDir "dist\windows-self-signed-preview-verification.json"), $VerificationJson, $Utf8NoBom)

& node scripts/generate-windows-self-signed-preview-metadata.js
if ($LASTEXITCODE -ne 0) { throw "Preview metadata generation failed with exit code $LASTEXITCODE" }
