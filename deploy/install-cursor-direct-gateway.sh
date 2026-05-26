#!/usr/bin/env bash
set -euo pipefail

run_user="${CURSOR_PROXY_USER:-ubuntu}"
run_group="${CURSOR_PROXY_GROUP:-$run_user}"
app_dir="${CURSOR_DIRECT_APP_DIR:-/opt/cursor-direct-gateway}"
env_file="$app_dir/cursor-direct-gateway.env"
node_bin="${CURSOR_PROXY_NODE_BIN:-$(command -v node || true)}"

read_env_value() {
  local key="$1"
  if [[ -f "$env_file" ]]; then
    sudo awk -F= -v key="$key" '$1 == key { print substr($0, index($0, $2)); exit }' "$env_file"
  fi
}

api_key="${CURSOR_DIRECT_API_KEY:-$(read_env_value CURSOR_DIRECT_API_KEY)}"
if [[ -z "$api_key" ]]; then
  echo "CURSOR_DIRECT_API_KEY is required. Example:" >&2
  echo "  CURSOR_DIRECT_API_KEY='replace-with-a-long-random-key' bash /tmp/install-cursor-direct-gateway.sh" >&2
  exit 1
fi

admin_password="${CURSOR_DIRECT_ADMIN_PASSWORD:-$(read_env_value CURSOR_DIRECT_ADMIN_PASSWORD)}"
if [[ -z "$admin_password" ]]; then
  admin_password="$api_key"
fi

host="${CURSOR_DIRECT_HOST:-127.0.0.1}"
port="${CURSOR_DIRECT_PORT:-32126}"
auth_path="${CURSOR_DIRECT_AUTH_PATH:-/home/$run_user/.config/cursor/auth.json}"
accounts_path="${CURSOR_DIRECT_ACCOUNTS_PATH:-/home/$run_user/.config/cursor/direct-accounts.json}"
api_base_url="${CURSOR_DIRECT_API_BASE_URL:-https://api2.cursor.sh}"
agent_host="${CURSOR_DIRECT_AGENT_HOST:-agentn.api5.cursor.sh}"
client_version="${CURSOR_DIRECT_CLIENT_VERSION:-cli-2026.05.24-dda726e}"
idle_ms="${CURSOR_DIRECT_IDLE_MS:-1200}"
timeout_ms="${CURSOR_DIRECT_TIMEOUT_MS:-60000}"
log_level="${CURSOR_DIRECT_LOG_LEVEL:-info}"

if ! id "$run_user" >/dev/null 2>&1; then
  echo "System user '$run_user' does not exist. Set CURSOR_PROXY_USER if needed." >&2
  exit 1
fi
if [[ -z "$node_bin" ]]; then
  echo "node binary not found. Install Node.js or set CURSOR_PROXY_NODE_BIN." >&2
  exit 1
fi

sudo mkdir -p "$app_dir"
sudo install -o "$run_user" -g "$run_group" -m 0644 /tmp/cursor-direct-gateway.mjs "$app_dir/cursor-direct-gateway.mjs"
sudo install -o "$run_user" -g "$run_group" -m 0644 /tmp/direct-admin-page.mjs "$app_dir/direct-admin-page.mjs"
sudo install -o "$run_user" -g "$run_group" -m 0644 /tmp/admin-shared.mjs "$app_dir/admin-shared.mjs"
sudo tee /etc/systemd/system/cursor-direct-gateway.service >/dev/null <<EOF
[Unit]
Description=Cursor Direct Gateway
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$run_user
Group=$run_group
WorkingDirectory=$app_dir
EnvironmentFile=$env_file
ExecStart=$node_bin $app_dir/cursor-direct-gateway.mjs
Restart=always
RestartSec=3
KillSignal=SIGTERM

[Install]
WantedBy=multi-user.target
EOF

sudo -u "$run_user" mkdir -p "$(dirname "$auth_path")" "$(dirname "$accounts_path")"

sudo tee "$env_file" >/dev/null <<EOF
CURSOR_DIRECT_HOST=$host
CURSOR_DIRECT_PORT=$port
CURSOR_DIRECT_REQUIRE_API_KEY=true
CURSOR_DIRECT_AUTH_PATH=$auth_path
CURSOR_DIRECT_ACCOUNTS_PATH=$accounts_path
CURSOR_DIRECT_API_BASE_URL=$api_base_url
CURSOR_DIRECT_AGENT_HOST=$agent_host
CURSOR_DIRECT_CLIENT_VERSION=$client_version
CURSOR_DIRECT_IDLE_MS=$idle_ms
CURSOR_DIRECT_TIMEOUT_MS=$timeout_ms
CURSOR_DIRECT_LOG_LEVEL=$log_level
CURSOR_DIRECT_API_KEY=$api_key
CURSOR_DIRECT_ADMIN_PASSWORD=$admin_password
EOF

sudo chown "$run_user:$run_group" "$env_file"
sudo chmod 600 "$env_file"
sudo systemctl daemon-reload
sudo systemctl enable cursor-direct-gateway
sudo systemctl restart cursor-direct-gateway
systemctl is-active cursor-direct-gateway
