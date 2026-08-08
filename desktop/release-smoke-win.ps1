$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$appPath = Join-Path $root "dist\win-unpacked\DocFlow Local.exe"

if (-not (Test-Path -LiteralPath $appPath -PathType Leaf)) {
  throw "Packaged Windows application not found: $appPath"
}

$process = Start-Process `
  -FilePath $appPath `
  -ArgumentList "--docflow-release-smoke" `
  -NoNewWindow `
  -PassThru `
  -Wait

if ($process.ExitCode -ne 0) {
  throw "Packaged Windows release smoke failed with exit code $($process.ExitCode)"
}
