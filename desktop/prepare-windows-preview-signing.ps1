$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "windows-preview-certificate.ps1")

if ($env:GITHUB_ACTIONS -ne "true" -or $env:RUNNER_ENVIRONMENT -ne "github-hosted" -or $env:RUNNER_OS -ne "Windows") {
  throw "Preview key import and temporary trust are restricted to an ephemeral GitHub-hosted Windows runner"
}
$Pinned = Get-DocFlowPreviewCertificate
if ([string]::IsNullOrWhiteSpace($env:DOCFLOW_WIN_PREVIEW_PFX_BASE64) -or [string]::IsNullOrWhiteSpace($env:DOCFLOW_WIN_PREVIEW_PFX_PASSWORD)) {
  throw "Preview signing environment secrets are missing"
}
$PfxPath = Join-Path $env:RUNNER_TEMP "docflow-preview.pfx"
$Bytes = [Convert]::FromBase64String($env:DOCFLOW_WIN_PREVIEW_PFX_BASE64)
$Password = ConvertTo-SecureString $env:DOCFLOW_WIN_PREVIEW_PFX_PASSWORD -AsPlainText -Force
try {
  [System.IO.File]::WriteAllBytes($PfxPath, $Bytes)
  $PfxData = Get-PfxData -FilePath $PfxPath -Password $Password
  $EndEntityCertificates = @($PfxData.EndEntityCertificates)
  $OtherCertificates = @($PfxData.OtherCertificates | Where-Object { $null -ne $_ })
  if ($EndEntityCertificates.Count -ne 1 -or $OtherCertificates.Count -ne 0) {
    throw "Preview PFX must contain exactly the pinned end-entity certificate"
  }
  Assert-DocFlowPreviewCertificate -Certificate $EndEntityCertificates[0] -Metadata $Pinned.Metadata
  $Imported = @(Import-PfxCertificate -FilePath $PfxPath -Password $Password -CertStoreLocation "Cert:\CurrentUser\My")
  if ($Imported.Count -ne 1) { throw "Preview PFX must contain exactly one certificate" }
  Assert-DocFlowPreviewCertificate -Certificate $Imported[0] -Metadata $Pinned.Metadata -RequirePrivateKey
  Write-Host "PREVIEW_SIGNING_READY $($Pinned.Metadata.sha1Thumbprint)"
} finally {
  [Array]::Clear($Bytes, 0, $Bytes.Length)
  $Password.Dispose()
  Remove-Item -LiteralPath $PfxPath -Force -ErrorAction SilentlyContinue
}
