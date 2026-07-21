#!/bin/zsh
cd "$(dirname "$0")" || exit 1

PYTHON_BIN="${DOCFLOW_PYTHON:-python3}"
if ! "$PYTHON_BIN" -c "import flask, openpyxl, reportlab" >/dev/null 2>&1; then
  if [ -x "/Users/anaconda3/bin/python3" ] && /Users/anaconda3/bin/python3 -c "import flask, openpyxl, reportlab" >/dev/null 2>&1; then
    PYTHON_BIN="/Users/anaconda3/bin/python3"
  else
    echo "DocFlow Local 缺少运行依赖。"
    echo "请先执行：python3 -m pip install -r requirements.txt"
    echo
    read "reply?按回车键关闭..."
    exit 1
  fi
fi

(sleep 1; open "http://127.0.0.1:4173") &
exec "$PYTHON_BIN" app.py
