# Cursor Proxy

OpenAI 兼容网关：把 **Cursor Direct** 与 **CodeBuddy 协议直连** 收成一套可自建的 `/v1` 服务，附带管理台、账号池和 NewAPI 接入。

**产品页：** [https://wnddd839.github.io/cursor-proxy/](https://wnddd839.github.io/cursor-proxy/)  
**仓库：** [https://github.com/wnddd839/cursor-proxy](https://github.com/wnddd839/cursor-proxy)

> 仅在你拥有账号授权、并符合相关服务条款与合规要求的场景中使用。  
> **不要**把 refresh token、管理密码或 API key 提交到仓库。

---

## 它能做什么

| 能力 | 说明 |
| --- | --- |
| OpenAI 兼容 API | `GET /v1/models`、`POST /v1/chat/completions` |
| Cursor Direct | 直连 Cursor 上游，账号池轮询，模型别名（如 `auto`） |
| CodeBuddy 协议直连 | 默认 `protocol_direct`，OAuth 登录后走协议；模型列表来自 `/v3/config` |
| 真实 Credits | 管理台调用官网 `/billing/meter/get-user-resource`，展示剩余 / 总额 |
| 管理台 | `/direct-admin/` — OAuth、启用/禁用、刷新 token、用量查询 |
| 部署 | Node 直跑 / Docker Compose / Nginx + systemd |

默认站点为 **国内站** `codebuddy.cn`（`CURSOR_DIRECT_CODEBUDDY_SITE=domestic`）。

---

## 快速开始

需要 **Node.js ≥ 20**。

```bash
git clone https://github.com/wnddd839/cursor-proxy.git
cd cursor-proxy
cp .env.example .env
# 编辑 .env：填入 API Key 与管理台密码

export CURSOR_DIRECT_API_KEY="replace-with-a-long-random-key"
export CURSOR_DIRECT_ADMIN_PASSWORD="replace-with-a-long-admin-password"
export CURSOR_DIRECT_REQUIRE_API_KEY=true

npm start
```

默认地址：

```text
API:   http://127.0.0.1:32126/v1
Admin: http://127.0.0.1:32126/direct-admin/
```

Docker：

```bash
cp .env.example .env
docker compose up -d --build
```

公网入口（Compose 默认）：

```text
http://<server-ip>:32124/v1
http://<server-ip>:32124/direct-admin/
```

---

## CodeBuddy（协议直连）

管理台品牌为 **CodeBuddy Proxy**。推荐流程：

1. 打开 `/direct-admin/`，进入 CodeBuddy 面板  
2. 站点选择 **国内站 codebuddy.cn**（默认已选）  
3. 点击「开始认证」完成 OAuth，凭证写入账号池  
4. 「刷新模型」走协议 `GET /v3/config`（无需 `codebuddy --serve`）  
5. 用量列可查询官网 Credits（剩余 / 总额）

客户端调用示例：

```text
POST http://<host>:32126/v1/chat/completions
Authorization: Bearer <CURSOR_DIRECT_API_KEY>
model: codebuddy/auto
```

常用环境变量：

```text
CURSOR_DIRECT_CODEBUDDY_TRANSPORT=protocol_direct
CURSOR_DIRECT_CODEBUDDY_SITE=domestic
CURSOR_DIRECT_CODEBUDDY_INTERNET_ENVIRONMENT=internal
CURSOR_DIRECT_CODEBUDDY_BASE_URL=https://www.codebuddy.cn
```

账号池写盘带保护：非显式删除时拒绝缩减账号列表；token 刷新失败只记录 `lastError`，不会清空整个 `accounts[]`。

---

## NewAPI 接入

在 NewAPI 中新增 OpenAI 兼容渠道：

```text
Base URL: http://<server-ip>:32124/v1
API Key:  <CURSOR_DIRECT_API_KEY>
模型:     auto / codebuddy/auto / 管理台刷新得到的上游模型名
```

---

## 项目结构

```text
cursor-direct-gateway.mjs    主网关 + 管理 API
direct-admin-page.mjs        管理台（CodeBuddy Proxy）
admin-shared.mjs             管理台共享样式与工具
codebuddy-provider.mjs       CodeBuddy 协议 / 传输适配
codebuddy-account-pool.mjs   账号池与写盘保护
codebuddy-models.mjs         模型列表（/v3/config）
codebuddy-oauth.mjs          OAuth
codebuddy-local-creds.mjs    本地凭证
codebuddy-cli-daemon.mjs     CLI daemon（可选）
direct-tool-bridge.mjs       工具桥接
provider-events.mjs          事件 → OpenAI/Claude 响应
cursor-gateway.mjs           cursor-agent CLI 兼容网关
deploy/                      systemd / Nginx
compose.yaml                 Docker Compose
docs/                        GitHub Pages 产品页
```

---

## 安全

- 仓库已忽略 `.env`、`*.env`（除 `.env.example`）、账号 JSON 等  
- 生产环境务必设置强随机 `CURSOR_DIRECT_API_KEY` 与 `CURSOR_DIRECT_ADMIN_PASSWORD`  
- 不要把含密钥的 `cursor-direct-gateway.env` 提交或公开分享  

---

## 致谢

- [Nomadcxx/opencode-cursor](https://github.com/Nomadcxx/opencode-cursor)  
- [router-for-me/CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI)  
- [Quorinex/Kiro-Go](https://github.com/Quorinex/Kiro-Go)  
- NewAPI 社区生态  

## License

BSD-3-Clause（见根目录 `LICENSE`）。
