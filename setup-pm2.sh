#!/bin/bash
set -e

echo "=== Growvia PM2 Setup ==="

cd "$(dirname "$0")"

# 1. Dependency & PM2
echo "[1/5] Installing dependencies & PM2..."
npm install
command -v pm2 >/dev/null 2>&1 || npm install -g pm2

# 2. Direktori log
echo "[2/5] Creating logs directory..."
mkdir -p logs

# 3. Cek tes sebelum start
echo "[3/5] Running tests..."
npm test

# 4. Start bot + webhook deploy (+ tunnel). Lihat DEPLOY.md untuk tunnel.
echo "[4/5] Starting Growvia under PM2..."
pm2 start ecosystem.config.js
pm2 save

# 5. Auto-start saat boot
echo "[5/5] Setting up PM2 startup (ikuti perintah yang ditampilkan)..."
pm2 startup

echo ""
echo "=== Setup Complete ==="
echo "Proses: growvia (bot), growvia-webhook (auto-deploy), growvia-tunnel (URL publik)"
echo ""
echo "Useful commands:"
echo "  pm2 list                  - List all processes"
echo "  pm2 logs growvia          - View bot logs"
echo "  pm2 restart growvia       - Restart bot"
echo "  pm2 delete growvia        - Delete bot from PM2"
