import { buildAdminClientUtils, buildAdminSharedStyles } from "./admin-shared.mjs";

export function buildDirectAdminHtml() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>CodeBuddy Proxy</title>
  <style>
    ${buildAdminSharedStyles()}

    .cb-status-strip {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 12px;
      background: var(--surface-alt);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 12px 16px;
      margin-bottom: 20px;
    }
    @media (max-width: 1100px) {
      .cb-status-strip { grid-template-columns: repeat(3, 1fr); }
    }
    @media (max-width: 640px) {
      .cb-status-strip { grid-template-columns: 1fr; }
    }
    .cb-status-item { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .cb-status-label {
      color: var(--text-secondary);
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .cb-status-val {
      color: var(--text);
      font-size: 13px;
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .cb-status-val.mono { font-family: var(--font-mono); font-size: 12px; }
    .cb-subsection {
      margin-top: 20px;
      padding-top: 16px;
      border-top: 1px dashed var(--border);
    }
    .cb-subsection-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
      margin-bottom: 12px;
    }
    .cb-subsection-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--text);
      letter-spacing: 0.02em;
    }
    .cb-subsection-title .tag,
    .cb-openai-title .tag,
    .cb-sub-panel-title .tag {
      color: var(--text-muted);
      font-size: 11px;
      font-weight: 400;
      margin-left: 8px;
      letter-spacing: 0.04em;
    }
    .cb-subsection-note { color: var(--text-muted); font-size: 12px; }
    .cb-flow { display: flex; flex-direction: column; gap: 18px; }
    .cb-sub-panel {
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 16px;
      background: var(--surface);
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .cb-sub-panel-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      border-bottom: 1px solid var(--border);
      padding-bottom: 10px;
      margin-bottom: 4px;
      min-height: 38px;
    }
    .cb-sub-panel-title { font-size: 13px; font-weight: 600; color: var(--text); }
    .cb-form-group { display: flex; flex-direction: column; gap: 12px; }
    .cb-compact-textarea {
      min-height: 72px !important;
      padding: 8px 10px;
      font-size: 12px;
      font-family: var(--font-mono);
      resize: vertical;
    }
    .cb-compact-box {
      min-height: 48px !important;
      padding: 8px 12px;
      font-size: 11px;
      line-height: 1.45;
      white-space: pre-wrap;
    }
    .cb-openai-card {
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--surface);
      padding: 14px 16px;
    }
    .cb-openai-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
      margin-bottom: 12px;
    }
    .cb-openai-title { font-size: 13px; font-weight: 600; }
    .cb-openai-note { color: var(--text-muted); font-size: 12px; }
    .cb-openai-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px 16px;
    }
    @media (max-width: 900px) {
      .cb-openai-grid { grid-template-columns: 1fr; }
    }
    .cb-info-callout {
      background: var(--info-bg);
      color: var(--info-text);
      border-radius: 6px;
      padding: 10px 12px;
      font-size: 12px;
    }
    .cb-callout-title { font-weight: 600; margin-bottom: 4px; }
    .cb-manual-details { margin-top: 8px; }
    .cb-manual-details summary {
      cursor: pointer;
      color: var(--text-secondary);
      font-size: 12px;
      font-weight: 500;
    }
    .cb-manual-details__body { margin-top: 10px; }
    .cb-btn-sm-manual { font-size: 12px; min-height: 32px; padding: 6px 12px; }
    .cb-action-row { gap: 8px; flex-wrap: wrap; }
    .cb-max-height-table {
      max-height: 320px;
      overflow: auto;
      border: 1px solid var(--border);
      border-radius: 6px;
    }
    .cb-dense-table { min-width: 1080px; }
    .cb-hint-text { color: var(--text-muted); font-size: 12px; margin-top: 8px; }
    .cb-probe-split {
      display: grid;
      grid-template-columns: 1.2fr 1fr auto;
      gap: 12px;
      align-items: end;
    }
    @media (max-width: 900px) {
      .cb-probe-split { grid-template-columns: 1fr; }
    }
    .cb-probe-result { margin-top: 12px; min-height: 88px; }
    .site-select, #cbOAuthSite {
      min-width: 280px;
      width: 100%;
      white-space: nowrap;
    }
    .site-select option, #cbOAuthSite option { white-space: nowrap; }
    .usage-cell { min-width: 150px; }
    .actions-cell { white-space: nowrap; }
    .actions-cell button {
      margin: 2px 4px 2px 0;
      min-height: 30px;
      padding: 4px 10px;
      font-size: 12px;
    }
    .table-wrap { overflow-x: auto; }
    .topbar .view-nav { display: none !important; }
    .usage-note {
      margin-top: 8px;
      color: var(--text-muted);
      font-size: 12px;
    }
    .oauth-site-field { min-width: 280px; }
  </style>
</head>
<body>
  <div class="login-wrap" id="loginView">
    <section class="login" data-motion>
      <div class="brand">
        <h1>CodeBuddy Proxy</h1>
      </div>
      <p>输入管理密码后，可管理账号池、OAuth 登录、模型列表、探针测试与 OpenAI 兼容接入。</p>
      <div class="login-divider">认证</div>
      <div class="field">
        <label for="adminPassword">管理密码</label>
        <input id="adminPassword" type="password" autocomplete="current-password" placeholder="输入管理密码" />
      </div>
      <div class="row" style="margin-top: 16px;">
        <button class="primary" id="loginBtn">进入控制台</button>
        <button class="ghost" id="rememberBtn" type="button">记住本浏览器</button>
      </div>
      <div class="toast-line" id="loginStatus" style="margin-top: 14px;">等待输入管理密码。</div>
      <div class="footerline">
        <span>CodeBuddy Proxy</span>
        <span id="loginYear"></span>
      </div>
    </section>
  </div>

  <header class="topbar hidden" id="topbar" data-motion>
    <div class="brand">
      <span class="brand-name">CodeBuddy Proxy</span>
      <span class="pill good" id="statusIndicator"><span id="statusIndicatorText">运行中</span></span>
    </div>
    <div class="topbar-actions">
      <button id="refreshBtn">刷新全部</button>
      <button class="primary" id="copyBaseBtn">复制 Base URL</button>
      <button class="ghost" id="logoutAdminBtn">退出</button>
    </div>
  </header>

  <main class="shell hidden" id="appView">
    <div class="content">
      <section class="panel" id="codebuddyPanel" data-motion>
        <div class="section-head">
          <h2>CodeBuddy Proxy <span class="h2-tag">CONTROL</span></h2>
          <div class="row" style="gap: 8px; flex-wrap: wrap;">
            <span class="pill muted" id="codebuddyConfigPill">未配置</span>
            <span class="pill muted" id="codebuddyAuthPill">未登录</span>
            <button type="button" class="ghost btn-sm" id="codebuddyRefreshBtn">刷新</button>
          </div>
        </div>
        <div id="codebuddyLoading" class="loading-overlay hidden">正在刷新 CodeBuddy 数据...</div>

        <div class="cb-status-strip" id="codebuddySummary">
          <div class="cb-status-item">
            <span class="cb-status-label">Provider</span>
            <span class="cb-status-val" id="codebuddyProvider" title="codebuddy">codebuddy</span>
          </div>
          <div class="cb-status-item">
            <span class="cb-status-label">Transport</span>
            <span class="cb-status-val mono" id="codebuddyTransport" title="protocol_direct">protocol_direct</span>
          </div>
          <div class="cb-status-item">
            <span class="cb-status-label">Auth Status</span>
            <span class="cb-status-val" id="cbAuthStatusText" title="未登录">未登录</span>
          </div>
          <div class="cb-status-item">
            <span class="cb-status-label">Chat Endpoint</span>
            <span class="cb-status-val mono" id="codebuddyBaseUrl" title="-">-</span>
          </div>
          <div class="cb-status-item">
            <span class="cb-status-label">Default Model</span>
            <span class="cb-status-val mono" id="codebuddyDefaultModel" title="codebuddy/auto">codebuddy/auto</span>
          </div>
          <div class="cb-status-item">
            <span class="cb-status-label">Model Source</span>
            <span class="cb-status-val" id="cbModelSourceText" title="/v3/config">/v3/config</span>
          </div>
        </div>

        <div class="cb-flow">
          <div class="cb-openai-card" id="cbOpenAiAccessCard">
            <div class="cb-openai-head">
              <span class="cb-openai-title">OpenAI 兼容接入 <span class="tag">CLIENT CONFIG</span></span>
              <span class="cb-openai-note">客户端使用网关 API Key；不会暴露 CodeBuddy OAuth token。</span>
            </div>
            <div class="cb-openai-grid">
              <div class="field">
                <label for="cbOpenAiBaseUrl">Base URL</label>
                <div class="copyline">
                  <input id="cbOpenAiBaseUrl" readonly placeholder="登录后自动生成" />
                  <button id="cbCopyOpenAiBaseUrl" type="button">复制</button>
                </div>
              </div>
              <div class="field">
                <label for="cbOpenAiChatUrl">Chat Completions Endpoint</label>
                <div class="copyline">
                  <input id="cbOpenAiChatUrl" readonly placeholder="登录后自动生成" />
                  <button id="cbCopyOpenAiChatUrl" type="button">复制</button>
                </div>
              </div>
              <div class="field">
                <label for="cbOpenAiApiKeyDisplay">API Key（网关层）</label>
                <div class="copyline">
                  <input id="cbOpenAiApiKeyDisplay" class="secret-input" type="password" readonly placeholder="API Key 未配置" />
                  <button id="cbCopyOpenAiApiKey" type="button">复制 API Key</button>
                </div>
              </div>
              <div class="field">
                <label for="cbOpenAiModel">推荐模型</label>
                <div class="copyline">
                  <input id="cbOpenAiModel" readonly value="codebuddy/auto" />
                  <button id="cbCopyOpenAiModel" type="button">复制模型</button>
                </div>
              </div>
            </div>
            <div class="secret-hint">OpenAI 客户端通常填 Base URL = 上方 /v1 地址，API Key = 网关密钥，model = codebuddy/auto 或模型列表中的 codebuddy/*。</div>
          </div>

          <div class="cb-subsection" style="margin-top: 0; padding-top: 0; border-top: none;">
            <div class="cb-subsection-head">
              <span class="cb-subsection-title">账号池 <span class="tag">ACCOUNTS</span></span>
              <span class="cb-subsection-note" id="codebuddyAccountSummary">总计 0 · 启用 0 · 禁用 0</span>
            </div>
            <div class="table-wrap">
              <table class="table dense cb-dense-table">
                <thead>
                  <tr>
                    <th>备注</th>
                    <th>类型</th>
                    <th>凭证</th>
                    <th>状态</th>
                    <th>站点</th>
                    <th>用量</th>
                    <th>过期</th>
                    <th>成功</th>
                    <th>失败</th>
                    <th>最后使用</th>
                    <th>最后错误</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody id="codebuddyAccountRows">
                  <tr><td colspan="12" class="muted">正在读取账号池...</td></tr>
                </tbody>
              </table>
            </div>
            <span class="cb-subsection-note" id="codebuddyAccountNote" style="margin-top: 6px; display: block;">正在加载...</span>
            <div class="usage-note">用量列显示剩余 / 总额 Credits（官网 /billing/meter/get-user-resource）；也可点官网套餐页核对。</div>
          </div>

          <div class="cb-sub-panel" id="codebuddyOAuthPanel">
            <div class="cb-sub-panel-head">
              <span class="cb-sub-panel-title">OAuth 认证 <span class="tag">RECOMMENDED</span></span>
            </div>
            <div class="cb-form-group">
              <div class="split">
                <div class="field">
                  <label for="cbOAuthLabel">账号备注</label>
                  <input id="cbOAuthLabel" placeholder="CodeBuddy" />
                </div>
                <div class="field oauth-site-field">
                  <label for="cbOAuthSite">站点</label>
                  <select id="cbOAuthSite" class="site-select">
                    <option value="domestic" selected>国内站 codebuddy.cn</option>
                    <option value="global">国外站 codebuddy.ai</option>
                  </select>
                </div>
              </div>
              <div class="row cb-action-row">
                <button class="primary" id="cbOAuthStartBtn" type="button">开始认证</button>
                <button id="cbOAuthOpenBtn" type="button" disabled>打开登录页</button>
                <button id="cbOAuthPollBtn" type="button" disabled>立即检查</button>
              </div>
              <div class="oauth-box cb-compact-box" id="cbOAuthStatusBox">尚未开始认证。点击「开始认证」后会自动打开 CodeBuddy 登录页并后台轮询。</div>
              <div class="cb-info-callout">
                <div class="cb-callout-title">OAuth 提示</div>
                <p>点击「开始认证」→ 在新窗口完成 CodeBuddy 登录后，本页会自动轮询并导入凭证。</p>
              </div>
            </div>
            <details class="cb-manual-details">
              <summary>手动 Token JSON 导入（备用）</summary>
              <div class="cb-manual-details__body">
                <div class="cb-form-group" style="padding-top: 8px;">
                  <div class="field">
                    <textarea id="cbOAuthManualInput" class="cb-compact-textarea" placeholder='粘贴完整 CodeBuddy token 响应 JSON，例如 {"code":0,"data":{"accessToken":"...","refreshToken":"...","expiresIn":3600}}。也可兼容 Bearer JWT。'></textarea>
                  </div>
                  <div class="row">
                    <button id="cbOAuthImportBtn" type="button" class="cb-btn-sm-manual">导入认证 JSON</button>
                  </div>
                  <div class="toast-line" id="cbOAuthToast" style="margin: 0; min-height: 12px; font-size: 11px;"></div>
                </div>
              </div>
            </details>
          </div>

          <div class="cb-sub-panel">
            <div class="cb-sub-panel-head">
              <span class="cb-sub-panel-title">模型列表 <span class="tag">/v3/config</span></span>
              <button type="button" class="ghost btn-sm" id="cbRefreshModelsBtn">刷新模型</button>
            </div>
            <div class="cb-form-group">
              <div class="cb-max-height-table">
                <table class="table dense cb-dense-table">
                  <thead>
                    <tr>
                      <th>模型 ID</th>
                      <th>上游 ID</th>
                      <th>名称</th>
                      <th>状态</th>
                    </tr>
                  </thead>
                  <tbody id="codebuddyModelRows">
                    <tr><td colspan="4" class="muted">正在读取模型列表...</td></tr>
                  </tbody>
                </table>
              </div>
              <div class="cb-hint-text" id="codebuddyModelNote">模型列表通过协议直连 GET /v3/config 获取，无需启动 CLI。</div>
            </div>
          </div>

          <div class="cb-subsection">
            <div class="cb-subsection-head">
              <span class="cb-subsection-title">探针测试 <span class="tag">PROBE</span></span>
            </div>
            <div class="cb-probe-split">
              <div class="field">
                <label for="cbProbeModel">探针模型</label>
                <select id="cbProbeModel">
                  <option value="codebuddy/auto">codebuddy/auto</option>
                </select>
              </div>
              <div class="field">
                <label for="cbProbeAccount">指定账号（可选）</label>
                <select id="cbProbeAccount">
                  <option value="">自动轮询启用账号</option>
                </select>
              </div>
              <button class="primary" id="cbProbeBtn">运行探针</button>
            </div>
            <pre class="probe-result cb-probe-result" id="cbProbeBox"><span class="probe-line muted">// 还没有运行探针。</span></pre>
          </div>
        </div>
      </section>
    </div>
  </main>

  <script>
    ${buildAdminClientUtils()}
    const ADMIN_API = '/direct-admin/api';
    const state = {
      password: localStorage.getItem('cursor_direct_admin_password') || '',
      remember: localStorage.getItem('cursor_direct_admin_remember') === '1',
      codebuddyOAuth: { session: null, pollTimer: null },
      status: null,
      clientBaseUrl: '',
      busy: false,
      accountsLoadError: '',
      usageByAccount: {},
      codebuddy: {
        status: null,
        accounts: null,
        models: [],
        modelsMeta: null,
        unsupported: false,
      },
    };
    const $ = (id) => document.getElementById(id);

    function kickoffMotion(root = document) {
      const reduce = prefersReducedMotion();
      const nodes = Array.from(root.querySelectorAll('[data-motion]'));
      nodes.forEach((node, index) => {
        node.classList.remove('css-enter');
        node.style.setProperty('--motion-delay', reduce ? '0ms' : String(Math.min(index * 60, 600)) + 'ms');
        requestAnimationFrame(() => node.classList.add('css-enter'));
      });
    }
    function setLoginVisible(visible) {
      $('loginView').classList.toggle('hidden', !visible);
      $('appView').classList.toggle('hidden', visible);
      $('topbar').classList.toggle('hidden', visible);
      requestAnimationFrame(() => kickoffMotion(visible ? $('loginView') : document));
    }
    function setInlineToast(id, text) {
      const node = $(id);
      if (node) node.textContent = text || '';
    }
    function setBusy(flag) {
      state.busy = flag;
      $('refreshBtn').disabled = flag;
      const cbRefresh = $('codebuddyRefreshBtn');
      if (cbRefresh) cbRefresh.disabled = flag;
      const cbRefreshModelsBtn = $('cbRefreshModelsBtn');
      if (cbRefreshModelsBtn) {
        const pool = (state.codebuddy.accounts && typeof state.codebuddy.accounts === 'object') ? state.codebuddy.accounts : {};
        const hasCreds = Boolean(pool.primary?.hasCredentials || (pool.enabledCount || 0) > 0);
        cbRefreshModelsBtn.disabled = flag || state.codebuddy.unsupported || !hasCreds;
      }
      const cbProbeBtn = $('cbProbeBtn');
      if (cbProbeBtn) cbProbeBtn.disabled = flag;
      const cbCopyOpenAiApiKey = $('cbCopyOpenAiApiKey');
      if (cbCopyOpenAiApiKey) cbCopyOpenAiApiKey.disabled = flag || !(state.status && state.status.apiKeyConfigured);
      const cbLoading = $('codebuddyLoading');
      if (cbLoading) cbLoading.classList.toggle('hidden', !flag);
    }
    function authHeaders() {
      return { 'X-Admin-Password': state.password, 'Authorization': 'Bearer ' + state.password };
    }
    async function api(path, options = {}) {
      const headers = Object.assign({}, options.headers || {}, authHeaders());
      const response = await fetch(ADMIN_API + path, {
        method: options.method || 'GET',
        headers,
        body: options.body,
      });
      const text = await response.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = text; }
      if (response.status === 401) throw new Error('管理密码不正确');
      if (!response.ok) {
        const message = data && data.error && data.error.message ? data.error.message : response.statusText;
        const error = new Error(message || '请求失败');
        error.status = response.status;
        error.data = data;
        throw error;
      }
      return data;
    }
    function renderStatusBadge(enabled) {
      return enabled
        ? '<span class="badge good">启用</span>'
        : '<span class="badge bad">禁用</span>';
    }
    function codeBuddyAuthTypeLabel(type, account) {
      if (account && account.source === 'cli_credential') return 'CLI Bearer';
      if (type === 'bearer') return 'Bearer';
      if (type === 'api_key') return 'API Key';
      return '-';
    }
    function codeBuddySiteLabel(site) {
      const normalized = String(site || '').toLowerCase();
      if (normalized === 'domestic') return '国内站';
      if (normalized === 'global') return '国外站';
      return site || '-';
    }
    function getCodeBuddyDefaultModel() {
      const meta = state.codebuddy.modelsMeta || {};
      const models = Array.isArray(state.codebuddy.models) ? state.codebuddy.models : [];
      const verified = models.filter((model) => model.verified);
      return meta.currentPublicModelId
        || (verified[0] && verified[0].id)
        || (models[0] && models[0].id)
        || 'codebuddy/auto';
    }
    function setInputValueAndTitle(id, value) {
      const node = $(id);
      if (!node) return;
      node.value = value || '';
      node.title = value || '';
    }
    function resolveBaseUrl() {
      return state.clientBaseUrl || (window.location.origin + '/v1');
    }
    function resolveCodeBuddyOpenAiBaseUrl() {
      return resolveBaseUrl().replace(/\\/+$/, '');
    }
    function resolveCodeBuddyChatCompletionsUrl() {
      return resolveCodeBuddyOpenAiBaseUrl() + '/chat/completions';
    }
    function renderCodeBuddyOpenAiAccess() {
      const card = $('cbOpenAiAccessCard');
      if (!card) return;
      const status = state.status || {};
      const baseUrl = resolveCodeBuddyOpenAiBaseUrl();
      const chatUrl = resolveCodeBuddyChatCompletionsUrl();
      const model = getCodeBuddyDefaultModel();
      setInputValueAndTitle('cbOpenAiBaseUrl', baseUrl);
      setInputValueAndTitle('cbOpenAiChatUrl', chatUrl);
      setInputValueAndTitle('cbOpenAiModel', model);
      const apiKeyInput = $('cbOpenAiApiKeyDisplay');
      if (apiKeyInput) {
        apiKeyInput.value = status.apiKeyConfigured ? (status.apiKeyPreview || '已配置 · 点击复制') : '';
        apiKeyInput.placeholder = status.apiKeyConfigured ? '' : 'API Key 未配置';
      }
      const copyApiKeyBtn = $('cbCopyOpenAiApiKey');
      if (copyApiKeyBtn) copyApiKeyBtn.disabled = state.busy || !status.apiKeyConfigured;
    }
    function codeBuddyLoggedInPill(value, account) {
      if (account && account.authType === 'bearer') return '<span class="pill good">OAuth</span>';
      if (account && account.authType === 'api_key') return '<span class="pill good">API Key</span>';
      if (account && account.hasCredentials) return '<span class="pill good">已配置</span>';
      if (value === true) return '<span class="pill good">是</span>';
      if (value === false) return '<span class="pill bad">否</span>';
      return '<span class="pill muted">-</span>';
    }
    function codeBuddyAccountLabel(account) {
      return account?.label || account?.userName || account?.userNickname || account?.id || '未命名账号';
    }
    function officialUsageUrl(site) {
      return String(site || '').toLowerCase() === 'global'
        ? 'https://www.codebuddy.ai/profile/plan'
        : 'https://www.codebuddy.cn/profile/plan';
    }
    function renderUsageCell(account) {
      const id = account.id || '';
      const usage = state.usageByAccount[id];
      const site = account.site || 'domestic';
      const official = officialUsageUrl(site);
      if (!usage) {
        return '<div class="usage-cell">' +
          '<button type="button" data-cb-action="usage" data-id="' + escapeHtml(id) + '">查余额</button> ' +
          '<a href="' + escapeHtml(official) + '" target="_blank" rel="noopener noreferrer">官网</a>' +
        '</div>';
      }
      if (usage.error) {
        return '<div class="usage-cell">' +
          '<span class="pill bad" title="' + escapeHtml(usage.error) + '">查询失败</span><br/>' +
          '<button type="button" data-cb-action="usage" data-id="' + escapeHtml(id) + '">重试</button> ' +
          '<a href="' + escapeHtml(official) + '" target="_blank" rel="noopener noreferrer">官网</a>' +
        '</div>';
      }
      const credits = usage.credits || {};
      const notify = usage.notify || {};
      const remaining = credits.unlimited ? '不限量' : (credits.remaining == null ? '-' : String(credits.remaining));
      const total = credits.unlimited ? '不限量' : (credits.total == null ? '-' : String(credits.total));
      const used = credits.used == null ? null : Number(credits.used);
      const percent = credits.percent;
      let level = 'good';
      if (!credits.unlimited && credits.total > 0) {
        const leftRatio = Number(credits.remaining) / Number(credits.total);
        if (leftRatio <= 0.05 || Number(credits.remaining) <= 0) level = 'bad';
        else if (leftRatio <= 0.2) level = 'warn';
      }
      if (notify.level === 'bad') level = 'bad';
      else if (notify.level === 'warn' && level === 'good') level = 'warn';
      const packageName = escapeHtml(credits.packageName || '');
      const cycle = [credits.cycleStartTime, credits.cycleEndTime].filter(Boolean).join(' ~ ');
      const hintParts = [
        packageName ? ('套餐 ' + packageName) : '',
        cycle ? ('周期 ' + cycle) : '',
        used != null ? ('已用 ' + used) : '',
        percent != null ? ('使用率 ' + percent + '%') : '',
        notify.label ? ('告警 ' + notify.label) : '',
      ].filter(Boolean);
      const hint = escapeHtml(hintParts.join(' · ') || usage.note || '');
      const link = escapeHtml(usage.officialUsageUrl || official);
      return '<div class="usage-cell">' +
        '<span class="pill ' + level + '" title="' + hint + '">' + escapeHtml(remaining + ' / ' + total) + '</span><br/>' +
        '<span class="muted" style="font-size:11px;">剩余 Credits</span><br/>' +
        '<button type="button" data-cb-action="usage" data-id="' + escapeHtml(id) + '">刷新</button> ' +
        '<a href="' + link + '" target="_blank" rel="noopener noreferrer">官网套餐</a>' +
      '</div>';
    }
    function renderCodeBuddySummary() {
      const status = state.codebuddy.status || {};
      const pool = (state.codebuddy.accounts && typeof state.codebuddy.accounts === 'object')
        ? state.codebuddy.accounts
        : (status.accounts && typeof status.accounts === 'object' ? status.accounts : {});
      const meta = state.codebuddy.modelsMeta || {};
      const unsupported = Boolean(state.codebuddy.unsupported || status.unsupported);
      const configured = !unsupported && Boolean(
        status.configured === true || pool.primary?.hasCredentials || (pool.enabledCount || 0) > 0,
      );
      const baseUrl = status.chatEndpoint || status.baseUrl || '-';
      const transport = status.transport || 'protocol_direct';
      const defaultModel = getCodeBuddyDefaultModel();

      const configPill = $('codebuddyConfigPill');
      configPill.textContent = unsupported ? '未接入' : (configured ? '已配置' : '未配置');
      configPill.className = 'pill ' + (unsupported ? 'warn' : (configured ? 'good' : 'muted'));

      const authPill = $('codebuddyAuthPill');
      const hasCreds = Boolean(pool.primary?.hasCredentials || (pool.enabledCount || 0) > 0);
      const primaryType = pool.primary?.authType || '';
      let authStatusText = '未登录';
      if (unsupported) {
        authPill.textContent = '接口未启用';
        authPill.className = 'pill muted';
        authStatusText = '未启用';
      } else if (hasCreds && primaryType === 'bearer') {
        authPill.textContent = 'OAuth 已登录';
        authPill.className = 'pill good';
        authStatusText = 'OAuth 已登录';
      } else if (hasCreds) {
        authPill.textContent = '凭证已配置';
        authPill.className = 'pill good';
        authStatusText = '凭证已配置';
      } else if (state.codebuddyOAuth.session && state.codebuddyOAuth.session.status === 'waiting') {
        authPill.textContent = '等待 OAuth';
        authPill.className = 'pill warn';
        authStatusText = '等待 OAuth...';
      } else {
        authPill.textContent = '未登录';
        authPill.className = 'pill warn';
        authStatusText = '未登录';
      }

      const authStatusNode = $('cbAuthStatusText');
      if (authStatusNode) {
        authStatusNode.textContent = authStatusText;
        authStatusNode.title = authStatusText;
      }
      const providerNode = $('codebuddyProvider');
      if (providerNode) {
        providerNode.textContent = status.provider || 'codebuddy';
        providerNode.title = status.provider || 'codebuddy';
      }
      const baseNode = $('codebuddyBaseUrl');
      baseNode.textContent = baseUrl;
      baseNode.title = baseUrl;
      const transportNode = $('codebuddyTransport');
      if (transportNode) {
        transportNode.textContent = transport;
        transportNode.title = transport;
      }
      const defaultModelNode = $('codebuddyDefaultModel');
      if (defaultModelNode) {
        defaultModelNode.textContent = defaultModel;
        defaultModelNode.title = defaultModel;
      }
      const sourceLabel = codeBuddyModelsSourceLabel(meta.modelsSource);
      const modelSourceNode = $('cbModelSourceText');
      if (modelSourceNode) {
        modelSourceNode.textContent = sourceLabel;
        modelSourceNode.title = sourceLabel;
      }

      const total = pool.count || 0;
      const enabled = pool.enabledCount || 0;
      const disabled = pool.disabledCount || (total - enabled) || 0;
      $('codebuddyAccountSummary').textContent = '总计 ' + total + ' 路 · 启用 ' + enabled + ' 路 · 禁用 ' + disabled;
      if (state.accountsLoadError) {
        $('codebuddyAccountNote').textContent = '账号池加载失败：' + state.accountsLoadError;
      } else {
        $('codebuddyAccountNote').textContent = unsupported
          ? '后端 CodeBuddy 管理接口未启用'
          : total
          ? ('共 ' + total + ' 个账号 · 启用 ' + enabled + ' · 禁用 ' + disabled)
          : '账号池为空，请先完成 OAuth 登录。';
      }
      $('statusIndicatorText').textContent = '运行中';
    }
    function renderCodeBuddyAccounts() {
      const pool = (state.codebuddy.accounts && typeof state.codebuddy.accounts === 'object') ? state.codebuddy.accounts : {};
      const accounts = Array.isArray(pool.accounts) ? pool.accounts : [];
      const tbody = $('codebuddyAccountRows');
      if (!tbody) return;
      if (state.codebuddy.unsupported) {
        tbody.innerHTML = '<tr><td colspan="12"><div class="empty-state">// CodeBuddy 后端管理接口尚未启用。</div></td></tr>';
        renderCodeBuddyProbeAccounts([]);
        return;
      }
      if (state.accountsLoadError) {
        tbody.innerHTML = '<tr><td colspan="12"><div class="empty-state">// 账号池加载失败：' + escapeHtml(state.accountsLoadError) + '</div></td></tr>';
        renderCodeBuddyProbeAccounts([]);
        return;
      }
      if (!accounts.length) {
        tbody.innerHTML = '<tr><td colspan="12"><div class="empty-state">// 账号池为空。请使用下方 OAuth 登录面板添加账号。</div></td></tr>';
      } else {
        tbody.innerHTML = accounts.map((account) => {
          const id = escapeHtml(account.id || '');
          const label = escapeHtml(account.label || '-');
          const authType = escapeHtml(codeBuddyAuthTypeLabel(account.authType, account));
          const site = escapeHtml(codeBuddySiteLabel(account.site));
          const lastErr = escapeHtml(truncateText(account.lastError || '-', 32));
          const expires = escapeHtml(fmtTime(account.tokenExpiresAt || account.accessTokenExpiresAt || 0));
          const enabled = account.enabled !== false;
          const actions = [
            enabled
              ? '<button type="button" class="warn" data-cb-action="disable" data-id="' + id + '">禁用</button>'
              : '<button type="button" class="primary" data-cb-action="enable" data-id="' + id + '">启用</button>',
            '<button type="button" data-cb-action="probe" data-id="' + id + '">探针</button>',
            '<button type="button" data-cb-action="refresh-token" data-id="' + id + '">刷新认证</button>',
            '<button type="button" class="danger" data-cb-action="delete" data-id="' + id + '">删除</button>',
          ].join('');
          return '<tr>' +
            '<td class="cell-wrap" title="' + label + '">' + label + '</td>' +
            '<td>' + authType + '</td>' +
            '<td>' + codeBuddyLoggedInPill(account.loggedIn, account) + '</td>' +
            '<td>' + renderStatusBadge(enabled) + '</td>' +
            '<td><span class="pill info">' + site + '</span></td>' +
            '<td>' + renderUsageCell(account) + '</td>' +
            '<td>' + expires + '</td>' +
            '<td>' + escapeHtml(String(account.successRequests || 0)) + '</td>' +
            '<td>' + escapeHtml(String(account.failedRequests || 0)) + '</td>' +
            '<td>' + escapeHtml(fmtTime(account.lastUsedAt)) + '</td>' +
            '<td class="cell-wrap" title="' + lastErr + '">' + lastErr + '</td>' +
            '<td class="actions-cell">' + actions + '</td>' +
          '</tr>';
        }).join('');
      }
      renderCodeBuddyProbeAccounts(accounts);
    }
    function renderCodeBuddyProbeAccounts(accounts) {
      const select = $('cbProbeAccount');
      if (!select) return;
      const current = select.value;
      const options = ['<option value="">自动轮询启用账号</option>'].concat(
        (accounts || []).map((account) => {
          const text = codeBuddyAccountLabel(account) + (account.enabled === false ? '（已禁用）' : '');
          return '<option value="' + escapeHtml(account.id || '') + '">' + escapeHtml(text) + '</option>';
        }),
      );
      select.innerHTML = options.join('');
      if (current && (accounts || []).some((item) => item.id === current)) select.value = current;
    }
    function codeBuddyModelsSourceLabel(source) {
      const map = {
        daemon_acp: 'CLI ACP',
        upstream: '/v3/config',
        upstream_config: '/v3/config',
        v3_config: '/v3/config',
        probe: '账号实测',
        site_catalog: '站点候选',
        configured: '环境变量',
        no_credentials: '未登录',
        fallback: '默认',
        error: '错误',
      };
      if (!source) return '/v3/config';
      return map[source] || source;
    }
    function renderCodeBuddyModels() {
      const tbody = $('codebuddyModelRows');
      if (!tbody) return;
      const meta = state.codebuddy.modelsMeta || {};
      const refreshBtn = $('cbRefreshModelsBtn');
      const pool = (state.codebuddy.accounts && typeof state.codebuddy.accounts === 'object') ? state.codebuddy.accounts : {};
      const hasCreds = Boolean(pool.primary?.hasCredentials || (pool.enabledCount || 0) > 0);
      const sourceLabel = codeBuddyModelsSourceLabel(meta.modelsSource);
      const modelSourceNode = $('cbModelSourceText');
      if (modelSourceNode) {
        modelSourceNode.textContent = sourceLabel;
        modelSourceNode.title = sourceLabel;
      }
      if (refreshBtn) refreshBtn.disabled = state.busy || state.codebuddy.unsupported || !hasCreds;
      if (state.codebuddy.unsupported) {
        tbody.innerHTML = '<tr><td colspan="4"><div class="empty-state">// CodeBuddy 后端模型接口尚未启用。</div></td></tr>';
        $('codebuddyModelNote').textContent = '接口未启用';
        return;
      }
      const models = Array.isArray(state.codebuddy.models) ? state.codebuddy.models : [];
      if (!models.length) {
        tbody.innerHTML = '<tr><td colspan="4"><div class="empty-state">// 尚无模型数据。请先完成 OAuth 登录，再点「刷新模型」（走 /v3/config）。</div></td></tr>';
        $('codebuddyModelNote').textContent = meta.message || '请先完成 OAuth 登录并刷新模型列表。';
      } else {
        tbody.innerHTML = models.map((model) => {
          const id = escapeHtml(model.id || '-');
          const upstream = escapeHtml(model.upstreamId || model.modelId || '-');
          const name = escapeHtml(model.name || model.displayName || model.id || '-');
          const statusPill = model.verified
            ? '<span class="pill good">已验证</span>'
            : '<span class="pill muted">候选</span>';
          return '<tr>' +
            '<td class="cell-mono" title="' + id + '">' + id + '</td>' +
            '<td class="cell-mono" title="' + upstream + '">' + upstream + '</td>' +
            '<td>' + name + '</td>' +
            '<td>' + statusPill + '</td>' +
          '</tr>';
        }).join('');
        const verifiedCount = models.filter((model) => model.verified).length;
        $('codebuddyModelNote').textContent = '共 ' + models.length + ' 个 · 已验证 ' + verifiedCount + ' · 来源 ' + sourceLabel
          + (meta.message ? (' · ' + meta.message) : '');
      }
      const select = $('cbProbeModel');
      if (select) {
        const current = select.value;
        const preferred = Array.from(new Set(
          [meta.currentPublicModelId]
            .concat(models.filter((model) => model.verified).map((model) => model.id))
            .filter(Boolean),
        ));
        const ids = Array.from(new Set(['codebuddy/auto'].concat(preferred, models.map((m) => m.id).filter(Boolean))));
        select.innerHTML = ids.map((id) => '<option value="' + escapeHtml(id) + '">' + escapeHtml(id) + '</option>').join('');
        select.value = ids.includes(current) ? current : (preferred[0] || ids[0] || 'codebuddy/auto');
      }
      renderCodeBuddyOpenAiAccess();
    }
    function renderCodeBuddyOAuth() {
      const session = state.codebuddyOAuth.session || {};
      const launchUrl = session.gatewayLaunchUrl || session.launchUrl || '';
      const externalUrl = session.externalAuthUrl || session.url || (session.login && session.login.url) || '';
      const loginUrl = launchUrl || externalUrl;
      const openBtn = $('cbOAuthOpenBtn');
      const pollBtn = $('cbOAuthPollBtn');
      if (openBtn) openBtn.disabled = !loginUrl && !launchUrl;
      if (pollBtn) pollBtn.disabled = !session.id || session.status === 'complete';
      const box = $('cbOAuthStatusBox');
      if (box) {
        box.textContent = [
          '状态: ' + (session.status || 'idle'),
          '站点: ' + (session.site || '-'),
          '会话 ID: ' + (session.id || '-'),
          '登录页: ' + (loginUrl || '-'),
          'authState: ' + (session.authState ? session.authState.slice(0, 12) + '...' : '-'),
          '错误: ' + (session.error || '-')
        ].join('\\n');
      }
    }
    function stopCodeBuddyOAuthPoll() {
      if (state.codebuddyOAuth.pollTimer) {
        clearInterval(state.codebuddyOAuth.pollTimer);
        state.codebuddyOAuth.pollTimer = null;
      }
    }
    function startCodeBuddyOAuthPoll() {
      stopCodeBuddyOAuthPoll();
      state.codebuddyOAuth.pollTimer = setInterval(function() {
        pollCodeBuddyOAuth(true).catch(function() {});
      }, 4000);
    }
    async function startCodeBuddyOAuth() {
      setInlineToast('cbOAuthToast', '// 正在启动 CodeBuddy OAuth...');
      const btn = $('cbOAuthStartBtn');
      if (btn) btn.disabled = true;
      stopCodeBuddyOAuthPoll();
      try {
        const label = (($('cbOAuthLabel') && $('cbOAuthLabel').value) || '').trim() || 'CodeBuddy OAuth';
        const site = (($('cbOAuthSite') && $('cbOAuthSite').value) || 'domestic').trim() || 'domestic';
        const payload = await api('/codebuddy/oauth/start', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ label, site }),
        });
        state.codebuddyOAuth.session = payload.session || null;
        if (state.codebuddyOAuth.session && state.codebuddyOAuth.session.authState) {
          try {
            sessionStorage.setItem('codebuddy_oauth_auth_state', state.codebuddyOAuth.session.authState);
            sessionStorage.setItem('codebuddy_oauth_site', state.codebuddyOAuth.session.site || 'domestic');
          } catch (_) {}
        }
        if (payload.accounts) state.codebuddy.accounts = payload.accounts;
        renderCodeBuddyOAuth();
        renderCodeBuddy();
        if (payload.session && payload.session.status === 'waiting') {
          setInlineToast('cbOAuthToast', '✓ 已打开登录页，完成登录后本页将自动导入凭证。');
          showToast('请在新窗口完成 CodeBuddy 登录', 'info');
          startCodeBuddyOAuthPoll();
          const manualInput = $('cbOAuthManualInput');
          if (manualInput) manualInput.value = '';
          const loginUrl = payload.session.gatewayLaunchUrl || payload.session.launchUrl || payload.session.url || payload.session.externalAuthUrl || '';
          if (loginUrl) window.open(loginUrl, '_blank', 'noopener,noreferrer');
          else showToast('未拿到登录链接，请点「打开登录页」', 'error');
          pollCodeBuddyOAuth(true).catch(function() {});
        } else {
          setInlineToast('cbOAuthToast', '✗ ' + (payload.session && payload.session.error ? payload.session.error : 'OAuth 启动失败'));
        }
      } catch (error) {
        setInlineToast('cbOAuthToast', '✗ ' + error.message);
        showToast('OAuth 启动失败：' + error.message, 'error');
      } finally {
        if (btn) btn.disabled = state.busy;
      }
    }
    function openCodeBuddyOAuthPage() {
      const session = state.codebuddyOAuth.session || {};
      const url = session.gatewayLaunchUrl || session.launchUrl || session.url || session.externalAuthUrl || '';
      if (!url) {
        showToast('请先生成 OAuth 登录', 'info');
        return;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    }
    async function submitCodeBuddyOAuthManual() {
      setInlineToast('cbOAuthToast', '// 正在导入 CodeBuddy 认证 JSON...');
      const btn = $('cbOAuthImportBtn');
      if (btn) btn.disabled = true;
      try {
        const input = (($('cbOAuthManualInput') && $('cbOAuthManualInput').value) || '').trim();
        if (!input) throw new Error('请先粘贴完整 token JSON、回调 URL 或 Bearer JWT。');
        const session = state.codebuddyOAuth.session || {};
        const site = session.site || (($('cbOAuthSite') && $('cbOAuthSite').value) || 'domestic');
        const payload = await api('/codebuddy/oauth/callback', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ callbackUrl: input, site }),
        });
        state.codebuddyOAuth.session = payload.session || state.codebuddyOAuth.session;
        if (payload.accounts) state.codebuddy.accounts = payload.accounts;
        renderCodeBuddyOAuth();
        renderCodeBuddy();
        if (payload.ok) {
          stopCodeBuddyOAuthPoll();
          try {
            sessionStorage.removeItem('codebuddy_oauth_auth_state');
            sessionStorage.removeItem('codebuddy_oauth_site');
          } catch (_) {}
          if ($('cbOAuthManualInput')) $('cbOAuthManualInput').value = '';
          setInlineToast('cbOAuthToast', '✓ CodeBuddy 认证 JSON 已导入账号池，协议直连可用。');
          showToast('CodeBuddy 凭证已导入', 'success');
          await refreshCodeBuddy(true);
          return;
        }
        if (payload.pending) {
          startCodeBuddyOAuthPoll();
          setInlineToast('cbOAuthToast', '// 已收到认证结果，继续检查 OAuth 状态...');
          showToast('已收到认证结果，继续检查登录状态', 'info');
          return;
        }
        const msg = payload.message || (payload.session && payload.session.error) || '认证 JSON 导入失败';
        setInlineToast('cbOAuthToast', '✗ ' + msg);
        showToast(msg, 'error');
      } catch (error) {
        setInlineToast('cbOAuthToast', '✗ ' + error.message);
        showToast('认证 JSON 导入失败：' + error.message, 'error');
      } finally {
        if (btn) btn.disabled = state.busy;
      }
    }
    async function pollCodeBuddyOAuth(silent) {
      const pollBtn = $('cbOAuthPollBtn');
      if (pollBtn && !silent) pollBtn.disabled = true;
      try {
        const session = state.codebuddyOAuth.session || {};
        let authState = session.authState || '';
        let site = session.site || 'domestic';
        try {
          if (!authState) authState = sessionStorage.getItem('codebuddy_oauth_auth_state') || '';
          if (!site) site = sessionStorage.getItem('codebuddy_oauth_site') || 'domestic';
        } catch (_) {}
        if (!authState) {
          throw new Error('缺少 authState：请重新点「开始认证」，并使用自动打开的带 state 的登录链接。');
        }
        if (!silent) setInlineToast('cbOAuthToast', '// 正在向 CodeBuddy 换取 Bearer（约 30 秒）...');
        const payload = await api('/codebuddy/oauth/poll', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            authState,
            site,
            burst: true,
            maxAttempts: silent ? 3 : 20,
            intervalMs: 2000,
          }),
        });
        state.codebuddyOAuth.session = payload.session || state.codebuddyOAuth.session;
        if (payload.accounts) state.codebuddy.accounts = payload.accounts;
        renderCodeBuddyOAuth();
        renderCodeBuddy();
        if (payload.ok) {
          stopCodeBuddyOAuthPoll();
          try {
            sessionStorage.removeItem('codebuddy_oauth_auth_state');
            sessionStorage.removeItem('codebuddy_oauth_site');
          } catch (_) {}
          setInlineToast('cbOAuthToast', '✓ 认证成功，协议直连凭证已导入账号池。');
          if (!silent) showToast('CodeBuddy 认证成功', 'success');
          await refreshCodeBuddy(true);
          return;
        }
        if (payload.pending) {
          if (!silent) {
            setInlineToast('cbOAuthToast', '// CodeBuddy 已登录？等待 token 同步中，请稍后再点检查或保持页面自动轮询');
            showToast('仍在等待 token（页面显示登录成功≠网关已拿到 Bearer）', 'info');
          }
          return;
        }
        if (!silent) stopCodeBuddyOAuthPoll();
        const msg = payload.message || (payload.session && payload.session.error) || 'OAuth 未完成';
        if (!silent) {
          setInlineToast('cbOAuthToast', '✗ ' + msg);
          showToast(msg, 'error');
        }
      } catch (error) {
        if (!silent) {
          setInlineToast('cbOAuthToast', '✗ ' + error.message);
          showToast('检查登录失败：' + error.message, 'error');
        }
      } finally {
        if (pollBtn) pollBtn.disabled = state.busy || !(state.codebuddyOAuth.session && state.codebuddyOAuth.session.id);
      }
    }
    function renderCodeBuddy() {
      renderCodeBuddyOpenAiAccess();
      renderCodeBuddySummary();
      renderCodeBuddyOAuth();
      renderCodeBuddyAccounts();
      renderCodeBuddyModels();
    }
    async function loadCodeBuddyModels(options) {
      const opts = options && typeof options === 'object' ? options : {};
      if (state.codebuddy.unsupported) {
        state.codebuddy.models = [];
        state.codebuddy.modelsMeta = null;
        return;
      }
      const path = opts.discover
        ? '/codebuddy/models?fresh=1&discover=1'
        : (opts.fresh ? '/codebuddy/models?fresh=1' : '/codebuddy/models');
      try {
        const payload = await api(path);
        state.codebuddy.modelsMeta = {
          modelsSource: payload?.modelsSource || '',
          message: payload?.message || '',
          currentModelId: payload?.currentModelId || '',
          currentPublicModelId: payload?.currentPublicModelId || '',
        };
        state.codebuddy.models = payload && Array.isArray(payload.models) ? payload.models : [];
      } catch (error) {
        state.codebuddy.models = [];
        state.codebuddy.modelsMeta = { modelsSource: 'error', message: error.message };
        const tbody = $('codebuddyModelRows');
        if (tbody) tbody.innerHTML = '<tr><td colspan="4" class="muted">' + escapeHtml(error.message) + '</td></tr>';
      }
    }
    async function refreshCodeBuddyModels(silent) {
      const btn = $('cbRefreshModelsBtn');
      if (btn) btn.disabled = true;
      if (!silent) setInlineToast('cbOAuthToast', '// 正在刷新 CodeBuddy 模型列表（/v3/config）...');
      try {
        await loadCodeBuddyModels({ fresh: true });
        renderCodeBuddy();
        if (!silent) {
          const sourceLabel = codeBuddyModelsSourceLabel(state.codebuddy.modelsMeta?.modelsSource);
          setInlineToast('cbOAuthToast', state.codebuddy.modelsMeta?.message || ('✓ 模型列表已刷新，来源：' + sourceLabel));
          showToast('模型列表已刷新', 'success');
        }
      } catch (error) {
        if (!silent) {
          setInlineToast('cbOAuthToast', '✗ 刷新模型失败：' + error.message);
          showToast('刷新模型失败：' + error.message, 'error');
        }
      } finally {
        renderCodeBuddyModels();
      }
    }
    async function refreshCodeBuddy(silent) {
      setBusy(true);
      try {
        const statusRes = await api('/codebuddy/status').catch((error) => ({ __error: error }));
        if (statusRes && statusRes.__error && statusRes.__error.status === 404) {
          state.codebuddy.unsupported = true;
          state.codebuddy.status = { provider: 'codebuddy', unsupported: true };
          state.codebuddy.accounts = { count: 0, enabledCount: 0, disabledCount: 0, accounts: [] };
          state.codebuddy.models = [];
          state.codebuddy.modelsMeta = null;
          state.codebuddyOAuth.session = null;
          state.accountsLoadError = '';
          renderCodeBuddy();
          if (!silent) showToast('CodeBuddy 后端管理接口未启用', 'info');
          return;
        }
        if (statusRes && statusRes.__error) throw statusRes.__error;

        const gatewayStatus = await api('/status').catch(() => null);
        if (gatewayStatus) {
          state.status = gatewayStatus;
          const apiBasePath = gatewayStatus.apiBasePath || '/v1';
          const configuredPublicBaseUrl = gatewayStatus.config && gatewayStatus.config.publicBaseUrl
            ? gatewayStatus.publicBaseUrl
            : '';
          state.clientBaseUrl = (configuredPublicBaseUrl || (window.location.origin + apiBasePath)).replace(/\\/+$/, '');
        }

        const [accountsRes, oauthRes] = await Promise.all([
          api('/codebuddy/accounts').catch((error) => ({ __error: error })),
          api('/codebuddy/oauth/session').catch((error) => ({ __error: error })),
        ]);
        if (accountsRes && accountsRes.__error) {
          state.accountsLoadError = accountsRes.__error.message || '账号池加载失败';
          if (!state.codebuddy.accounts) {
            state.codebuddy.accounts = { count: 0, enabledCount: 0, disabledCount: 0, accounts: [] };
          }
          if (!silent) showToast('账号池加载失败：' + state.accountsLoadError, 'error');
        } else {
          state.accountsLoadError = '';
          state.codebuddy.accounts = accountsRes;
        }
        state.codebuddy.unsupported = false;
        state.codebuddy.status = statusRes;
        if (oauthRes && !oauthRes.__error) state.codebuddyOAuth.session = oauthRes.session || null;
        await loadCodeBuddyModels({ fresh: true });
        renderCodeBuddy();
      } catch (error) {
        if (!silent) showToast('CodeBuddy 加载失败：' + error.message, 'error');
        const note = $('codebuddyAccountNote');
        if (note) note.textContent = '加载失败：' + error.message;
      } finally {
        setBusy(false);
      }
    }
    async function fetchAccountUsage(accountId) {
      const result = await api('/codebuddy/accounts/' + encodeURIComponent(accountId) + '/usage');
      state.usageByAccount[accountId] = result;
      renderCodeBuddyAccounts();
      const credits = result?.credits || {};
      const label = credits.display || credits.label || result?.notify?.label || '用量已更新';
      const level = (!credits.unlimited && Number(credits.remaining) <= 0)
        ? 'error'
        : (result?.notify?.level === 'bad' ? 'error' : 'success');
      showToast(label, level);
      return result;
    }
    async function codeBuddyAccountAction(accountId, action) {
      const accounts = (state.codebuddy.accounts && Array.isArray(state.codebuddy.accounts.accounts))
        ? state.codebuddy.accounts.accounts : [];
      const account = accounts.find((item) => item.id === accountId);
      if (action === 'delete') {
        const name = account ? codeBuddyAccountLabel(account) : accountId;
        if (!confirm('确认删除 CodeBuddy 账号「' + name + '」吗？此操作不可恢复。')) return;
        await api('/codebuddy/accounts/' + encodeURIComponent(accountId), { method: 'DELETE' });
        delete state.usageByAccount[accountId];
        showToast('CodeBuddy 账号已删除', 'success');
        await refreshCodeBuddy(true);
        return;
      }
      if (action === 'enable' || action === 'disable') {
        await api('/codebuddy/accounts/' + encodeURIComponent(accountId) + '/' + action, { method: 'POST' });
        showToast(action === 'enable' ? 'CodeBuddy 账号已启用' : 'CodeBuddy 账号已禁用', 'success');
        await refreshCodeBuddy(true);
        return;
      }
      if (action === 'refresh-token') {
        const result = await api('/codebuddy/accounts/' + encodeURIComponent(accountId) + '/refresh-token', { method: 'POST' });
        const expires = result?.account?.tokenExpiresAt || result?.account?.accessTokenExpiresAt;
        showToast(
          (result.refreshed ? '认证已刷新' : '认证仍有效') + (expires ? (' · 过期 ' + fmtTime(expires)) : ''),
          'success',
        );
        await refreshCodeBuddy(true);
        return;
      }
      if (action === 'usage') {
        try {
          await fetchAccountUsage(accountId);
        } catch (error) {
          state.usageByAccount[accountId] = { error: error.message };
          renderCodeBuddyAccounts();
          showToast('用量查询失败：' + error.message, 'error');
        }
        return;
      }
      if (action === 'probe') {
        const select = $('cbProbeAccount');
        if (select) select.value = accountId;
        await runCodeBuddyProbe();
      }
    }
    function renderCodeBuddyProbeResult(lines, variant) {
      const box = $('cbProbeBox');
      if (!box) return;
      box.classList.remove('ok', 'fail');
      if (variant) box.classList.add(variant);
      box.innerHTML = lines.map((line) => '<div class="probe-line">' + line + '</div>').join('');
    }
    async function runCodeBuddyProbe() {
      const model = ($('cbProbeModel').value || '').trim() || 'codebuddy/auto';
      const accountId = ($('cbProbeAccount').value || '').trim();
      renderCodeBuddyProbeResult(['<strong>状态</strong> 正在请求 ' + escapeHtml(model) + '...'], '');
      $('cbProbeBtn').disabled = true;
      try {
        const body = { model };
        if (accountId) body.accountId = accountId;
        const result = await api('/codebuddy/probe', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        const used = result.account ? codeBuddyAccountLabel(result.account) : (accountId || '自动轮询');
        renderCodeBuddyProbeResult([
          '<strong>模型</strong> ' + escapeHtml(result.model || model),
          '<strong>账号</strong> ' + escapeHtml(used),
          '<strong>耗时</strong> ' + escapeHtml(fmtMs(result.durationMs)),
          '<strong>输出</strong> ' + escapeHtml(result.text || '-'),
        ], 'ok');
        showToast('探针完成 · ' + fmtMs(result.durationMs), 'success');
      } catch (error) {
        renderCodeBuddyProbeResult([
          '<strong>状态</strong> 失败',
          '<strong>错误</strong> ' + escapeHtml(error.message),
        ], 'fail');
        showToast('探针失败：' + error.message, 'error');
      } finally {
        $('cbProbeBtn').disabled = state.busy;
      }
    }
    async function login() {
      state.password = $('adminPassword').value.trim();
      if (!state.password) {
        setInlineToast('loginStatus', '请先输入管理密码。');
        return;
      }
      try {
        await api('/status');
        if (state.remember) {
          localStorage.setItem('cursor_direct_admin_password', state.password);
          localStorage.setItem('cursor_direct_admin_remember', '1');
        } else {
          localStorage.removeItem('cursor_direct_admin_password');
          localStorage.removeItem('cursor_direct_admin_remember');
        }
        setLoginVisible(false);
        await refreshCodeBuddy(true);
        setInlineToast('loginStatus', '');
        showToast('已进入控制台', 'success');
      } catch (error) {
        setInlineToast('loginStatus', error.message);
        showToast('登录失败：' + error.message, 'error');
      }
    }
    async function copyBaseUrl(button) {
      await copyText(resolveCodeBuddyOpenAiBaseUrl(), 'Base URL', button instanceof HTMLElement ? button : undefined);
    }
    async function copyApiKey(button) {
      try {
        const result = await api('/client-config');
        if (result && result.apiKeyPreview) {
          const cbApiKeyDisplay = $('cbOpenAiApiKeyDisplay');
          if (cbApiKeyDisplay) cbApiKeyDisplay.value = result.apiKeyPreview;
        }
        if (!result || !result.apiKey) {
          showToast('API Key 未配置', 'error');
          return;
        }
        await copyText(result.apiKey, 'API Key', button instanceof HTMLElement ? button : undefined);
      } catch (error) {
        showToast('复制 API Key 失败：' + error.message, 'error');
      }
    }
    async function copyCodeBuddyOpenAiBaseUrl(button) {
      await copyText(resolveCodeBuddyOpenAiBaseUrl(), 'CodeBuddy Base URL', button instanceof HTMLElement ? button : undefined);
    }
    async function copyCodeBuddyChatUrl(button) {
      await copyText(resolveCodeBuddyChatCompletionsUrl(), 'Chat Completions Endpoint', button instanceof HTMLElement ? button : undefined);
    }
    async function copyCodeBuddyModel(button) {
      await copyText(getCodeBuddyDefaultModel(), '推荐模型', button instanceof HTMLElement ? button : undefined);
    }

    $('loginYear').textContent = String(new Date().getFullYear());
    $('loginBtn').addEventListener('click', login);
    $('adminPassword').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') login();
    });
    $('rememberBtn').addEventListener('click', () => {
      state.remember = !state.remember;
      $('rememberBtn').textContent = state.remember ? '已记住本浏览器' : '记住本浏览器';
      if (!state.remember) {
        localStorage.removeItem('cursor_direct_admin_password');
        localStorage.removeItem('cursor_direct_admin_remember');
      }
    });
    if (state.remember) $('rememberBtn').textContent = '已记住本浏览器';
    $('refreshBtn').addEventListener('click', () => refreshCodeBuddy(false).then(() => showToast('已刷新', 'success')).catch((error) => showToast('刷新失败：' + error.message, 'error')));
    $('copyBaseBtn').addEventListener('click', (e) => copyBaseUrl(e.currentTarget));
    $('logoutAdminBtn').addEventListener('click', () => {
      stopCodeBuddyOAuthPoll();
      state.password = '';
      localStorage.removeItem('cursor_direct_admin_password');
      setLoginVisible(true);
      setInlineToast('loginStatus', '已退出。');
    });
    const cbRefreshBtn = $('codebuddyRefreshBtn');
    if (cbRefreshBtn) cbRefreshBtn.addEventListener('click', () => refreshCodeBuddy(false).then(() => showToast('已刷新', 'success')).catch((error) => showToast('刷新失败：' + error.message, 'error')));
    const cbRefreshModelsBtn = $('cbRefreshModelsBtn');
    if (cbRefreshModelsBtn) cbRefreshModelsBtn.addEventListener('click', () => refreshCodeBuddyModels(false));
    const cbOAuthStartBtn = $('cbOAuthStartBtn');
    if (cbOAuthStartBtn) cbOAuthStartBtn.addEventListener('click', startCodeBuddyOAuth);
    const cbOAuthOpenBtn = $('cbOAuthOpenBtn');
    if (cbOAuthOpenBtn) cbOAuthOpenBtn.addEventListener('click', openCodeBuddyOAuthPage);
    const cbOAuthPollBtn = $('cbOAuthPollBtn');
    if (cbOAuthPollBtn) cbOAuthPollBtn.addEventListener('click', () => pollCodeBuddyOAuth(false));
    const cbOAuthImportBtn = $('cbOAuthImportBtn');
    if (cbOAuthImportBtn) cbOAuthImportBtn.addEventListener('click', submitCodeBuddyOAuthManual);
    const cbProbeBtn = $('cbProbeBtn');
    if (cbProbeBtn) cbProbeBtn.addEventListener('click', runCodeBuddyProbe);
    const cbCopyOpenAiBaseUrl = $('cbCopyOpenAiBaseUrl');
    if (cbCopyOpenAiBaseUrl) cbCopyOpenAiBaseUrl.addEventListener('click', (e) => copyCodeBuddyOpenAiBaseUrl(e.currentTarget));
    const cbCopyOpenAiChatUrl = $('cbCopyOpenAiChatUrl');
    if (cbCopyOpenAiChatUrl) cbCopyOpenAiChatUrl.addEventListener('click', (e) => copyCodeBuddyChatUrl(e.currentTarget));
    const cbCopyOpenAiApiKey = $('cbCopyOpenAiApiKey');
    if (cbCopyOpenAiApiKey) cbCopyOpenAiApiKey.addEventListener('click', (e) => copyApiKey(e.currentTarget));
    const cbCopyOpenAiModel = $('cbCopyOpenAiModel');
    if (cbCopyOpenAiModel) cbCopyOpenAiModel.addEventListener('click', (e) => copyCodeBuddyModel(e.currentTarget));

    document.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-cb-action]');
      if (!btn) return;
      const action = btn.getAttribute('data-cb-action');
      const id = btn.getAttribute('data-id');
      if (!action || !id) return;
      codeBuddyAccountAction(id, action).catch((error) => {
        showToast('操作失败：' + error.message, 'error');
      });
    });

    window.addEventListener('message', (event) => {
      if (!event.data || event.data.type !== 'codebuddy-oauth-callback') return;
      refreshCodeBuddy(true).then(function() {
        showToast(event.data.ok ? '登录回调已同步' : '登录回调未完成', event.data.ok ? 'success' : 'info');
      }).catch(() => {});
    });

    if (state.password) {
      setLoginVisible(false);
      refreshCodeBuddy(true).catch((error) => {
        setLoginVisible(true);
        setInlineToast('loginStatus', error.message || '自动登录失败');
      });
    } else {
      setLoginVisible(true);
    }
  </script>
</body>
</html>`;
}
