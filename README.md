# Cursor Proxy

一个面向自有 Cursor 账号的 OpenAI-compatible 代理网关。这个仓库已经**移除了 OpenCode 插件能力**，现在的定位很明确：把账号、鉴权、管理台、Docker 部署和 NewAPI 接入都收拢成一个独立网关项目。

> 只在你拥有账号授权、并符合相关服务条款与公司合规要求的场景中使用。
> 不要把个人凭证、refresh token、管理密码或 API key 提交到仓库。

## 功能

- `GET /v1/models`
- `POST /v1/chat/completions`
- Cursor Direct Gateway，多账号轮询与账号池管理
- CPA 式单页管理台，支持导入、启用、禁用、刷新、删除和 OAuth 登录
- CLI Gateway 兼容入口，保留 `cursor-agent` 路线
- systemd + Nginx + Docker Compose 部署

## 目录

```text
cursor-direct-gateway.mjs          Cursor Direct 网关与管理 API
direct-admin-page.mjs              Direct Gateway 单页管理台
admin-shared.mjs                   管理台共享样式与前端工具
cursor-gateway.mjs                 cursor-agent CLI 网关
deploy/cursor-direct-gateway.service
deploy/cursor-nginx.conf
deploy/cursor-nginx.docker.conf
deploy/install-cursor-direct-gateway.sh
deploy/install-cursor-nginx.sh
compose.yaml
Dockerfile
tests/unit/cursor-direct-gateway.test.mjs
tests/unit/cursor-gateway-admin.test.mjs
```

## 要求

- Node.js 20+，推荐 22+
- 仅使用 Direct Gateway 时，不需要额外依赖
- 如需 CLI Gateway，再安装 `cursor-agent`

## 本地运行

```bash
npm install
export CURSOR_DIRECT_API_KEY="replace-with-a-long-random-key"
export CURSOR_DIRECT_ADMIN_PASSWORD="replace-with-a-long-admin-password"
export CURSOR_DIRECT_REQUIRE_API_KEY=true
node ./cursor-direct-gateway.mjs
```

默认端口：

```text
API:   http://127.0.0.1:32126/v1
Admin: http://127.0.0.1:32126/direct-admin/
Health: http://127.0.0.1:32126/health
```

### 添加账号

打开管理台后，使用管理密码登录即可：

```text
http://127.0.0.1:32126/direct-admin/
```

可直接导入：

- 单个 `auth.json`
- 批量 JSON
- OAuth 登录回调

账号池默认写到：

```text
~/.config/cursor/direct-accounts.json
```

## Docker 部署

1. 复制环境文件：

```bash
cp .env.example .env
```

2. 填好 `.env` 后启动：

```bash
docker compose up -d --build
```

3. 访问：

```text
http://<server-ip>:32124/v1
http://<server-ip>:32124/direct-admin/
```

如果你不想暴露 80/443，就直接用高位端口。这个方案默认只开一个公网端口，Nginx 负责分流到网关和管理台。

## NewAPI 接入

在 NewAPI 中新增一个 OpenAI 兼容渠道：

```text
Base URL: http://<server-ip>:32124/v1
API Key: 你在 .env 里配置的 CURSOR_DIRECT_API_KEY
模型: auto / composer-2-fast / composer-2.5-fast
```

如果你直接连内网端口，也可以用：

```text
http://127.0.0.1:32126/v1
```

## Direct Gateway 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `CURSOR_DIRECT_HOST` | `127.0.0.1` | 监听地址 |
| `CURSOR_DIRECT_PORT` | `32126` | 监听端口 |
| `CURSOR_DIRECT_API_KEY` | 空 | `/v1` 调用密钥 |
| `CURSOR_DIRECT_REQUIRE_API_KEY` | 根据 API key 自动判断 | 是否强制鉴权 |
| `CURSOR_DIRECT_ADMIN_PASSWORD` | API key 或空 | 管理台密码 |
| `CURSOR_DIRECT_AUTH_PATH` | `~/.config/cursor/auth.json` | 单账号 auth 文件 |
| `CURSOR_DIRECT_ACCOUNTS_PATH` | auth 目录下 `direct-accounts.json` | 多账号池文件 |
| `CURSOR_DIRECT_API_BASE_URL` | `https://api2.cursor.sh` | Cursor 上游 base |
| `CURSOR_DIRECT_AGENT_HOST` | `agentn.api5.cursor.sh` | Cursor Agent host |
| `CURSOR_DIRECT_CLIENT_VERSION` | `cli-2026.05.24-dda726e` | 上游版本标识 |
| `CURSOR_DIRECT_IDLE_MS` | `1200` | 流式空闲收尾时间 |
| `CURSOR_DIRECT_TIMEOUT_MS` | `60000` | 单次请求超时 |
| `CURSOR_DIRECT_MODELS_CACHE_TTL_MS` | `300000` | 模型缓存时间 |
| `CURSOR_DIRECT_LOG_LEVEL` | `info` | 日志等级 |

## 管理 API

所有 `/direct-admin/api/*` 接口都需要管理密码：

```text
X-Admin-Password: <CURSOR_DIRECT_ADMIN_PASSWORD>
Authorization: Bearer <CURSOR_DIRECT_ADMIN_PASSWORD>
```

常用接口：

```text
GET    /direct-admin/api/status
GET    /direct-admin/api/accounts
POST   /direct-admin/api/accounts/import
POST   /direct-admin/api/accounts/:id/enable
POST   /direct-admin/api/accounts/:id/disable
POST   /direct-admin/api/accounts/:id/refresh-token
DELETE /direct-admin/api/accounts/:id
GET    /direct-admin/api/oauth/session
POST   /direct-admin/api/oauth/start
POST   /direct-admin/api/oauth/callback
GET    /direct-admin/api/models
POST   /direct-admin/api/probe
```

## 服务器部署

如果你更喜欢 systemd + Nginx 的方式，可以直接用仓库里的脚本。

### Direct Gateway

把这几个文件上传到服务器的 `/tmp`：

```bash
scp cursor-direct-gateway.mjs direct-admin-page.mjs admin-shared.mjs \
  deploy/install-cursor-direct-gateway.sh \
  user@server:/tmp/
```

执行：

```bash
CURSOR_DIRECT_API_KEY="replace-with-a-long-random-key" \
CURSOR_DIRECT_ADMIN_PASSWORD="replace-with-a-long-admin-password" \
bash /tmp/install-cursor-direct-gateway.sh
```

### Nginx

```bash
scp deploy/cursor-nginx.conf user@server:/tmp/
sudo install -o root -g root -m 0644 /tmp/cursor-nginx.conf /etc/nginx/conf.d/cursor-nginx.conf
sudo nginx -t
sudo systemctl reload nginx
```

## CLI Gateway

仓库里仍保留 `cursor-gateway.mjs`，用于 `cursor-agent` 路线：

```bash
export CURSOR_GATEWAY_API_KEY="replace-with-a-long-random-key"
export CURSOR_GATEWAY_ADMIN_PASSWORD="replace-with-a-long-admin-password"
npm run gateway
```

## 测试

```bash
npm run check
npm test
```

## 致谢

- [Nomadcxx/opencode-cursor](https://github.com/Nomadcxx/opencode-cursor)
  这是本仓库最早期的来源之一，早期的 Cursor 集成思路来自这里；本 fork 现在已经去掉 OpenCode 插件定位。
- [router-for-me/CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI)
  参考了 CLI 中转、网关化和部署组织方式。
- [Quorinex/Kiro-Go](https://github.com/Quorinex/Kiro-Go)
  参考了账号池、管理台和网关式部署体验。
- NewAPI 社区生态
  本项目的 `/v1` 兼容接口主要面向 NewAPI 接入。

## License

本仓库按根目录 `LICENSE` 中的 BSD-3-Clause 许可发布。请在遵守上游项目许可证的前提下使用和再分发。
