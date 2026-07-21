@echo off
cd /d "%~dp0"
python -c "import flask, openpyxl, reportlab" >nul 2>&1
if errorlevel 1 (
  echo DocFlow Local is missing Python dependencies.
  echo Run: python -m pip install -r requirements.txt
  pause
  exit /b 1
)
start "" "http://127.0.0.1:4173"
python app.py
