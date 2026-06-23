#!/bin/bash
set -e

APP_DIR="${APP_DIR:-$HOME/card-battle-game}"
REPO="${REPO:-https://github.com/4rwhp75h84-alt/card-battle-game.git}"
PORT="${PORT:-3000}"

echo "==> 安装 Node.js (如已安装可跳过)..."
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
  sudo yum install -y nodejs || sudo apt-get install -y nodejs
fi

echo "==> 拉取代码..."
if [ -d "$APP_DIR/.git" ]; then
  cd "$APP_DIR"
  git pull
else
  git clone "$REPO" "$APP_DIR"
  cd "$APP_DIR"
fi

echo "==> 安装依赖..."
npm install --production

echo "==> 安装 PM2 (进程守护)..."
if ! command -v pm2 >/dev/null 2>&1; then
  sudo npm install -g pm2
fi

echo "==> 启动服务..."
pm2 delete card-battle-game 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save
pm2 startup | tail -1 | bash 2>/dev/null || true

echo ""
echo "============================================"
echo " 部署完成！"
echo " 手机访问: http://你的公网IP:${PORT}"
echo " 查看状态: pm2 status"
echo " 查看日志: pm2 logs card-battle-game"
echo "============================================"
echo ""
echo "别忘了在阿里云控制台 -> 安全组 放行 TCP ${PORT} 端口"
