<p align="center">
  <img src="docs/logo.svg" width="72" height="72" alt="CodeBuddy Proxy" />
</p>

<h1 align="center">CodeBuddy Proxy</h1>

<p align="center">
  <strong>把 CodeBuddy 变成 OpenAI 兼容的 <code>/v1</code> 渠道</strong><br/>
  协议直连 · OAuth 登录 · 账号池 · 管理台 · NewAPI 即插即用
</p>

<p align="center">
  <a href="https://wnddd839.github.io/proxy-codebuddy/"><img src="https://img.shields.io/badge/Product-Page-c45c26?style=flat-square" alt="Product Page" /></a>
  <a href="https://github.com/wnddd839/proxy-codebuddy/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-BSD--3--Clause-2f6b5a?style=flat-square" alt="License" /></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-%E2%89%A520-12140f?style=flat-square" alt="Node" /></a>
  <img src="https://img.shields.io/badge/Transport-protocol__direct-3a4034?style=flat-square" alt="protocol_direct" />
</p>

<p align="center">
  <a href="https://wnddd839.github.io/proxy-codebuddy/">产品页</a> ·
  <a href="#快速开始">快速开始</a> ·
  <a href="#接入">接入 NewAPI</a> ·
  <a href="https://github.com/wnddd839/proxy-codebuddy">GitHub</a>
</p>

---

## 这是什么

**CodeBuddy Proxy** 是一个专注 CodeBuddy 的自建反代：

用你自己的 CodeBuddy 账号（OAuth），对外提供标准 OpenAI 兼容接口。  
管理台里加账号、看 Credits、刷模型；客户端 / NewAPI 只认 `/v1`。

> 本项目**只做 CodeBuddy**。不是 Cursor 反代，也不是多厂商聚合网关。

仅限你拥有授权、且符合服务条款与合规要求的场景。  
**不要**把 token、管理密码、API Key 提交进仓库。

---

## 为什么用它

|  |  |
| :--- | :--- |
| **协议直连** | 默认 `protocol_direct`，OAuth 后直连上游，不依赖 `codebuddy --serve` |
| **真实余额** | 管理台拉官网 Credits，显示「剩余 / 总额」，不是假状态 |
| **模型列表** | 走协议 `/v3/config`，点一下刷新即可 |
| **账号池** | 多账号轮询；写盘防误清空；刷新失败只记错误 |
| **国内站默认** | 开箱 `codebuddy.cn`，也可切国际站 |
| **OpenAI 形状** | `GET /v1/models` · `POST /v1/chat/completions` |

---

## 快速开始

```bash
git clone https://github.com/wnddd839/proxy-codebuddy.git
cd proxy-codebuddy
cp .env.example .env
```

编辑 `.env`，至少设置：

```bash
CURSOR_DIRECT_API_KEY=你的长随机密钥
CURSOR_DIRECT_ADMIN_PASSWORD=你的管理台密码
CURSOR_DIRECT_REQUIRE_API_KEY=true
```

```bash
npm start
```

| | |
| :--- | :--- |
| API | `http://127.0.0.1:32126/v1` |
| 管理台 | `http://127.0.0.1:32126/direct-admin/` |

Docker：

```bash
cp .env.example .env
docker compose up -d --build
# 公网入口默认 :32124
```

打开管理台 → OAuth 登录 CodeBuddy → 刷新模型 → 开始调用。

---

## 接入

**任意 OpenAI 兼容客户端 / NewAPI**

```text
Base URL   http://<host>:32126/v1
API Key    与 .env 中 CURSOR_DIRECT_API_KEY 相同
Model      codebuddy/auto  或管理台刷新出的模型名
```

```bash
curl http://127.0.0.1:32126/v1/chat/completions \
  -H "Authorization: Bearer $CURSOR_DIRECT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"codebuddy/auto","messages":[{"role":"user","content":"你好"}]}'
```

---

## 产品页

更完整的介绍与视觉说明：

**[https://wnddd839.github.io/proxy-codebuddy/](https://wnddd839.github.io/proxy-codebuddy/)**

---

## License

[BSD-3-Clause](LICENSE)

灵感与参考：[CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) · [Kiro-Go](https://github.com/Quorinex/Kiro-Go) · NewAPI 生态
