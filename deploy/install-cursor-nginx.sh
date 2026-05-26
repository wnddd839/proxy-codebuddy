#!/usr/bin/env bash
set -euo pipefail

if ! command -v nginx >/dev/null 2>&1; then
  sudo apt-get update
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y nginx
fi

sudo install -o root -g root -m 0644 /tmp/cursor-nginx.conf /etc/nginx/conf.d/cursor-nginx.conf
sudo rm -f /etc/nginx/sites-enabled/default

if systemctl list-unit-files --type=service | grep -q '^cursor-direct-gateway.service'; then
  sudo systemctl restart cursor-direct-gateway
fi

sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl reload nginx || sudo systemctl restart nginx

systemctl is-active nginx
