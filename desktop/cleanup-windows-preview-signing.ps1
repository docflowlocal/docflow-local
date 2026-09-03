$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
if ($env:GITHUB_ACTIONS -ne "true" -or $env:RUNNER_ENVIRONMENT -ne "github-hosted" -or $env:RUNNER_OS -ne "Windows") {
  throw "Preview signing cleanup is restricted to an ephemeral GitHub-hosted Windows runner"
}
$MetadataPath = Join-Path (Split-Path -Parent $PSScriptRoot) "build\windows-preview\certificate.json"
$Metadata = Get-Content -LiteralPath $MetadataPath -Raw | ConvertFrom-Json
$Thumbprint = $Metadata.sha1Thumbprint
if ($Thumbprint -notmatch '^[A-F0-9]{40}$') { throw "Invalid pinned certificate thumbprint" }
$PrivateKeyPath = "Cert:\CurrentUser\My\$Thumbprint"
if (Test-Path -LiteralPath $PrivateKeyPath) { Remove-Item -LiteralPath $PrivateKeyPath -Force -DeleteKey }
$TrustPath = "Cert:\LocalMachine\Root\$Thumbprint"
if (Test-Path -LiteralPath $TrustPath) { Remove-Item -LiteralPath $TrustPath -Force -Confirm:$false }
$PfxPath = Join-Path $env:RUNNER_TEMP "docflow-preview.pfx"
if (Test-Path -LiteralPath $PfxPath) { Remove-Item -LiteralPath $PfxPath -Force }
Write-Host "PREVIEW_SIGNING_CLEANED $Thumbprint"
