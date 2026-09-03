Set-StrictMode -Version Latest

function Get-DocFlowPreviewCertificate {
  $RootDir = Split-Path -Parent $PSScriptRoot
  $Directory = Join-Path $RootDir "build\windows-preview"
  $Metadata = Get-Content -LiteralPath (Join-Path $Directory "certificate.json") -Raw | ConvertFrom-Json
  if ($Metadata.certificateFile -ne "DocFlow-Local-Preview-CodeSigning.cer") {
    throw "Unexpected preview certificate filename"
  }
  $Path = Join-Path $Directory $Metadata.certificateFile
  $Certificate = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new($Path)
  Assert-DocFlowPreviewCertificate -Certificate $Certificate -Metadata $Metadata
  return @{ Metadata = $Metadata; Certificate = $Certificate; Path = $Path }
}

function Assert-DocFlowPreviewCertificate {
  param($Certificate, $Metadata, [switch]$RequirePrivateKey)
  $Hasher = [System.Security.Cryptography.SHA256]::Create()
  try {
    $Sha256 = [BitConverter]::ToString($Hasher.ComputeHash($Certificate.RawData)).Replace("-", "")
  } finally { $Hasher.Dispose() }
  $Eku = @($Certificate.Extensions | Where-Object { $_.Oid.Value -eq "2.5.29.37" })
  $Usage = @($Certificate.Extensions | Where-Object { $_.Oid.Value -eq "2.5.29.15" })
  $Constraints = @($Certificate.Extensions | Where-Object { $_.Oid.Value -eq "2.5.29.19" })
  if (
    $Metadata.purpose -ne "windows-self-signed-preview-only" -or
    $Metadata.publiclyTrusted -ne $false -or
    $Certificate.Subject -ne "CN=DocFlow Local Community Preview" -or
    $Certificate.Subject -ne $Metadata.subject -or
    $Certificate.Issuer -ne $Certificate.Subject -or
    $Certificate.Thumbprint -ne $Metadata.sha1Thumbprint -or
    $Sha256 -ne $Metadata.sha256Fingerprint -or
    $Certificate.NotBefore.ToUniversalTime() -gt [DateTime]::UtcNow -or
    $Certificate.NotAfter.ToUniversalTime() -le [DateTime]::UtcNow -or
    $Eku.Count -ne 1 -or $Eku[0].EnhancedKeyUsages.Count -ne 1 -or
    $Eku[0].EnhancedKeyUsages[0].Value -ne "1.3.6.1.5.5.7.3.3" -or
    $Usage.Count -ne 1 -or [string]$Usage[0].KeyUsages -ne "DigitalSignature" -or
    $Constraints.Count -ne 1 -or $Constraints[0].CertificateAuthority -or
    ($RequirePrivateKey -and -not $Certificate.HasPrivateKey)
  ) {
    throw "Preview certificate does not match the pinned code-signing identity"
  }
}
