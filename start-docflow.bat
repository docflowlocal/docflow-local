@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 goto :missing_node
where npm >nul 2>&1
if errorlevel 1 goto :missing_node

for /f "delims=" %%V in ('node -p "Number(process.versions.node.split('.')[0])" 2^>nul') do set "NODE_MAJOR=%%V"
if not defined NODE_MAJOR goto :missing_node
if %NODE_MAJOR% LSS 22 goto :old_node

if not exist "node_modules\.bin\electron.cmd" (
  echo First launch: installing DocFlow Local npm dependencies...
  call npm ci
  if errorlevel 1 goto :install_failed
)

echo Starting the DocFlow Local desktop client...
call npm run desktop
set "DOCFLOW_EXIT=%ERRORLEVEL%"
if not "%DOCFLOW_EXIT%"=="0" (
  echo.
  echo DocFlow Local failed to start. Exit code: %DOCFLOW_EXIT%
  pause
)
endlocal & exit /b %DOCFLOW_EXIT%

:missing_node
echo DocFlow Local requires Node.js 22 or later.
echo Install Node.js from https://nodejs.org/ and try again.
pause
endlocal & exit /b 1

:old_node
echo DocFlow Local requires Node.js 22 or later. Detected major version: %NODE_MAJOR%
pause
endlocal & exit /b 1

:install_failed
echo.
echo Dependency installation failed. Check your network and npm configuration,
echo then run "npm ci" manually in this folder.
pause
endlocal & exit /b 1
