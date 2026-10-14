#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# 店小C · 服务器一键部署脚本（Ubuntu 22.04 / Debian 12 通用）
#
# 前提：代码已上传到服务器（如 /opt/dianxiaoc），且 server/.env 已按
#       deploy/.env.production.example 填好（AUTH_SECRET、LLM key）。
#
# 用法：
#   cd /opt/dianxiaoc/deploy
#   chmod +x deploy.sh
#   ./deploy.sh
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

# 项目根目录 = 本脚本所在目录的上一级
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$DEPLOY_DIR")"
WEB_ROOT="/var/www/dianxiaoc"

echo "==> 项目目录：$ROOT_DIR"

# 1. 安装 Node 22（若没有）
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d. -f1 | tr -d 'v')" -lt 22 ]; then
  echo "==> 安装 Node.js 22（node:sqlite 需要 ≥22.5）"
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
node -v

# 2. 安装 pm2 / nginx
command -v pm2 >/dev/null 2>&1 || sudo npm install -g pm2
command -v nginx >/dev/null 2>&1 || sudo apt-get update && sudo apt-get install -y nginx

# 3. 后端依赖
echo "==> 安装后端依赖"
cd "$ROOT_DIR/server"
[ -d node_modules ] || npm install --omit=dev

# 4. 前端构建（同域模式：VITE_API_BASE 为空，见 store-app/.env.production）
echo "==> 安装前端依赖并构建"
cd "$ROOT_DIR/store-app"
[ -d node_modules ] || npm install
npm run build

# 5. 发布静态文件
echo "==> 发布前端到 $WEB_ROOT"
sudo mkdir -p "$WEB_ROOT"
sudo rm -rf "${WEB_ROOT:?}"/*
sudo cp -r "$ROOT_DIR/store-app/dist/." "$WEB_ROOT/"

# 6. 启动/重启后端（PM2）
echo "==> 用 PM2 启动后端"
mkdir -p "$DEPLOY_DIR/logs"
pm2 start "$DEPLOY_DIR/ecosystem.config.cjs" || pm2 restart dianxiaoc-server
pm2 save
sudo env PATH="$PATH" pm2 startup systemd -u "$USER" --hp "$HOME" || true

# 7. 安装 Nginx 站点（仅当不存在；首次部署）
NGX_SITE="/etc/nginx/sites-available/dianxiaoc"
if [ ! -f "$NGX_SITE" ]; then
  echo "==> 安装 Nginx 站点配置（记得把 server_name 改成你的域名！）"
  sudo cp "$DEPLOY_DIR/nginx.conf.example" "$NGX_SITE"
  sudo ln -sf "$NGX_SITE" /etc/nginx/sites-enabled/dianxiaoc
  sudo nginx -t
  sudo systemctl reload nginx
  echo "    随后执行：sudo certbot --nginx -d 你的域名   配置 HTTPS"
else
  sudo nginx -t && sudo systemctl reload nginx
fi

# 8. 每日 03:30 自动重置演示数据（幂等：先清后加）
echo "==> 配置每日数据重置 cron"
CRON_LINE="30 3 * * * cd $ROOT_DIR/server && $(command -v node) $DEPLOY_DIR/scripts/reset-data.mjs >> $DEPLOY_DIR/logs/reset.log 2>&1"
( crontab -l 2>/dev/null | grep -v "reset-data.mjs" ; echo "$CRON_LINE" ) | crontab -

# 9. 自检
sleep 2
echo "==> 本机健康检查："
curl -s http://127.0.0.1:3000/health && echo

echo ""
echo "============================================================"
echo " 部署完成。接下来："
echo "  1) 编辑 $NGX_SITE 把 server_name 改成域名，nginx -t && reload"
echo "  2) sudo certbot --nginx -d 你的域名"
echo "  3) 云安全组只放行 22/80/443，不要放行 3000"
echo "  4) 浏览器打开 https://你的域名 ，用 liqiang/123456 等三账号验证"
echo "============================================================"
