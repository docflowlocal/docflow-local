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
  -PassThru

$timeoutMs = 60000
try {
  # Cache the native handle so Windows PowerShell 5.1 retains the exit code.
  $null = $process.Handle
  Write-Host "DOCFLOW_PACKAGED_SMOKE_PROCESS_START pid=$($process.Id) timeoutMs=$timeoutMs"
  if (-not $process.WaitForExit($timeoutMs)) {
    Write-Host "DOCFLOW_PACKAGED_SMOKE_PROCESS_TIMEOUT pid=$($process.Id)"
    try {
      & "$env:SystemRoot\System32\taskkill.exe" /PID $process.Id /T /F | Out-Host
      if (-not $process.WaitForExit(5000)) {
        Write-Warning "Packaged smoke process did not exit after tree termination"
      }
    } catch {
      Write-Warning "Unable to confirm packaged smoke process-tree termination"
    }
    throw "Packaged Windows release smoke process timed out after $timeoutMs ms"
  }
  $exitCode = $process.ExitCode
  Write-Host "DOCFLOW_PACKAGED_SMOKE_PROCESS_EXIT pid=$($process.Id) exitCode=$exitCode"
  if ($null -eq $exitCode -or $exitCode -ne 0) {
    throw "Packaged Windows release smoke failed with exit code $exitCode"
  }
} finally {
  $process.Dispose()
}
