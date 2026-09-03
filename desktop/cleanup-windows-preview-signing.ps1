$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
if ($env:GITHUB_ACTIONS -ne "true" -or $env:RUNNER_ENVIRONMENT -ne "github-hosted" -or $env:RUNNER_OS -ne "Windows") {
  throw "Preview signing cleanup is restricted to an ephemeral GitHub-hosted Windows runner"
}
$MetadataPath = Join-Path (Split-Path -Parent $PSScriptRoot) "build\windows-preview\certificate.json"
$Metadata = Get-Content -LiteralPath $MetadataPath -Raw | ConvertFrom-Json
$Thumbprint = $Metadata.sha1Thumbprint
if ($Thumbprint -notmatch '^[A-F0-9]{40}$') { throw "Invalid pinned certificate thumbprint" }
foreach ($Store in @("My", "Root")) {
  $Path = "Cert:\CurrentUser\$Store\$Thumbprint"
  if (Test-Path -LiteralPath $Path) {
    if ($Store -eq "My") { Remove-Item -LiteralPath $Path -Force -DeleteKey }
    else { Remove-Item -LiteralPath $Path -Force }
  }
}
$PfxPath = Join-Path $env:RUNNER_TEMP "docflow-preview.pfx"
if (Test-Path -LiteralPath $PfxPath) { Remove-Item -LiteralPath $PfxPath -Force }
Write-Host "PREVIEW_SIGNING_CLEANED $Thumbprint"
