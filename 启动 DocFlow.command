#!/bin/zsh
set -u

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT" || exit 1

wait_before_exit() {
  echo
  read "reply?按回车键关闭..."
}

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "DocFlow Local 需要 Node.js 22 或更高版本。"
  echo "请从 https://nodejs.org/ 安装 Node.js 后重试。"
  wait_before_exit
  exit 1
fi

NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])" 2>/dev/null || echo 0)"
if [[ "$NODE_MAJOR" -lt 22 ]]; then
  echo "当前 Node.js 版本为 $(node --version)，DocFlow Local 建议使用 Node.js 22 或更高版本。"
  wait_before_exit
  exit 1
fi

if [[ ! -x "node_modules/.bin/electron" ]]; then
  echo "首次启动：正在安装 DocFlow Local 的 npm 依赖..."
  if ! npm ci; then
    echo
    echo "依赖安装失败。请检查网络和 npm 配置，然后在此目录手动运行 npm ci。"
    wait_before_exit
    exit 1
  fi
fi

echo "正在启动 DocFlow Local 桌面客户端..."
npm run desktop
STATUS=$?

if [[ "$STATUS" -ne 0 ]]; then
  echo
  echo "DocFlow Local 启动失败，退出码：$STATUS"
  wait_before_exit
fi

exit "$STATUS"
