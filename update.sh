#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "==> 拉取最新代码..."
git pull

echo "==> 安装依赖..."
npm install --production

echo "==> 重启游戏..."
pm2 restart card-battle-game || PORT=80 pm2 start server.js --name card-battle-game
pm2 save

echo ""
pm2 status
echo "更新完成！"
