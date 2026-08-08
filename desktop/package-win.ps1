param(
  [switch]$DirectoryOnly
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$builder = Join-Path $root "node_modules\.bin\electron-builder.cmd"

if (-not (Test-Path -LiteralPath $builder -PathType Leaf)) {
  throw "electron-builder is not installed. Run npm ci first."
}

Push-Location $root
try {
  & $builder "--win" "dir" "--x64"
  if ($LASTEXITCODE -ne 0) {
    throw "electron-builder directory packaging failed with exit code $LASTEXITCODE"
  }

  & powershell "-NoProfile" "-ExecutionPolicy" "Bypass" "-File" "desktop/release-smoke-win.ps1"
  if ($LASTEXITCODE -ne 0) {
    throw "Packaged Windows release smoke failed with exit code $LASTEXITCODE"
  }

  if (-not $DirectoryOnly) {
    & $builder "--win" "--x64"
    if ($LASTEXITCODE -ne 0) {
      throw "electron-builder installer packaging failed with exit code $LASTEXITCODE"
    }
  }
}
finally {
  Pop-Location
}
