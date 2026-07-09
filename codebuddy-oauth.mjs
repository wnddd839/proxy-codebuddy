import { randomBytes, randomUUID } from "node:crypto";

import { normalizeBaseUrl } from "./codebuddy-provider.mjs";

const PLUGIN_AUTH_STATE_PATH = "/v2/plugin/auth/state";
const PLUGIN_AUTH_TOKEN_PATH = "/v2/plugin/auth/token";
const PLUGIN_AUTH_TOKEN_REFRESH_PATH = "/v2/plugin/auth/token/refresh";

const SITE_PLUGIN_BASE = {
  global: "https://www.codebuddy.ai",
  domestic: "https://www.codebuddy.cn",
};

let lastPluginAuthState = "";

export function resolveCodeBuddyPluginBaseUrl(site = "global") {
  const normalized = String(site || "global").toLowerCase();
  if (["domestic", "cn", "china", "internal"].includes(normalized)) {
    return SITE_PLUGIN_BASE.domestic;
  }
  return SITE_PLUGIN_BASE.global;
}

function buildPluginAuthStartHeaders(baseUrl) {
  const domain = new URL(baseUrl).host;
  const requestId = randomUUID().replace(/-/g, "");
  return {
    accept: "application/json, text/plain, */*",
    "content-type": "application/json",
    "cache-control": "no-cache",
    pragma: "no-cache",
    connection: "close",
    "x-requested-with": "XMLHttpRequest",
    "x-domain": domain,
    "x-no-authorization": "true",
    "x-no-user-id": "true",
    "x-no-enterprise-id": "true",
    "x-no-department-info": "true",
    "user-agent": "CLI/1.0.8 CodeBuddy/1.0.8",
    "x-product": "SaaS",
    "x-request-id": requestId,
  };
}

function buildPluginAuthPollHeaders(baseUrl) {
  const domain = new URL(baseUrl).host;
  const requestId = randomUUID().replace(/-/g, "");
  const spanId = randomBytes(4).toString("hex");
  return {
    accept: "application/json, text/plain, */*",
    "cache-control": "no-cache",
    pragma: "no-cache",
    connection: "close",
    "x-requested-with": "XMLHttpRequest",
    "x-request-id": requestId,
    b3: `${requestId}-${spanId}-1-`,
    "x-b3-traceid": requestId,
    "x-b3-parentspanid": "",
    "x-b3-spanid": spanId,
    "x-b3-sampled": "1",
    "x-no-authorization": "true",
    "x-no-user-id": "true",
    "x-no-enterprise-id": "true",
    "x-no-department-info": "true",
    "x-domain": domain,
    "user-agent": "CLI/1.0.8 CodeBuddy/1.0.8",
    "x-product": "SaaS",
  };
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function findBearerTokenDeep(value, depth = 0) {
  if (depth > 8 || value == null) return "";
  if (typeof value === "string") {
    const text = value.trim();
    if (/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\./.test(text)) return text;
    return "";
  }
  if (typeof value !== "object") return "";
  for (const key of ["accessToken", "access_token", "bearerToken", "bearer_token", "token"]) {
    const found = findBearerTokenDeep(value[key], depth + 1);
    if (found) return found;
  }
  for (const nested of Object.values(value)) {
    const found = findBearerTokenDeep(nested, depth + 1);
    if (found) return found;
  }
  return "";
}

function extractTokenDataFromPollPayload(payload = {}) {
  const data = payload?.data && typeof payload.data === "object" ? payload.data : payload;
  const accessToken = String(
    data.accessToken ||
    data.access_token ||
    data.token ||
    payload.accessToken ||
    payload.access_token ||
    findBearerTokenDeep(payload) ||
    "",
  ).trim();
  if (!accessToken) return null;
  return {
    bearerToken: accessToken,
    accessToken,
    tokenType: data.tokenType || data.token_type || "Bearer",
    expiresIn: Number(data.expiresIn || data.expires_in || 0),
    refreshExpiresIn: Number(data.refreshExpiresIn || data.refresh_expires_in || 0),
    refreshToken: String(data.refreshToken || data.refresh_token || payload.refreshToken || payload.refresh_token || "").trim(),
    sessionState: String(data.sessionState || data.session_state || "").trim(),
    scope: String(data.scope || "").trim(),
    domain: String(data.domain || "").trim(),
  };
}

function buildPluginAuthRefreshHeaders(endpoint, options = {}) {
  const domain = new URL(endpoint).host;
  const requestId = randomUUID().replace(/-/g, "");
  const spanId = randomBytes(4).toString("hex");
  const headers = {
    accept: "application/json, text/plain, */*",
    "content-type": "application/json",
    "cache-control": "no-cache",
    pragma: "no-cache",
    connection: "close",
    "x-requested-with": "XMLHttpRequest",
    "x-request-id": requestId,
    b3: `${requestId}-${spanId}-1-`,
    "x-b3-traceid": requestId,
    "x-b3-parentspanid": "",
    "x-b3-spanid": spanId,
    "x-b3-sampled": "1",
    "x-domain": domain,
    "x-refresh-token": compactText(options.refreshToken || options.refresh_token || ""),
    "x-auth-refresh-source": "plugin",
    "user-agent": "CLI/1.0.8 CodeBuddy/1.0.8",
    "x-product": "SaaS",
  };
  const accessToken = compactText(options.accessToken || options.access_token || options.bearerToken || options.bearer_token || "");
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  return headers;
}

function resolveCodeBuddyOAuthTokenEndpoint(options = {}) {
  const accessPayload = decodeCodeBuddyJwtPayload(
    options.accessToken || options.access_token || options.bearerToken || options.bearer_token || "",
  );
  const issuer = compactText(options.issuer || accessPayload.iss || "");
  if (/^https?:\/\//i.test(issuer)) {
    return `${issuer.replace(/\/+$/, "")}/protocol/openid-connect/token`;
  }
  const baseUrl = normalizeBaseUrl(options.baseUrl || resolveCodeBuddyPluginBaseUrl(options.site));
  return `${baseUrl}/auth/realms/copilot/protocol/openid-connect/token`;
}

function resolveCodeBuddyPluginRefreshEndpoint(options = {}) {
  const explicit = compactText(options.refreshEndpoint || options.refresh_endpoint || "");
  if (/^https?:\/\//i.test(explicit)) return explicit.replace(/\/+$/, "");

  const tokenEndpoint = compactText(options.tokenEndpoint || options.token_endpoint || "");
  if (tokenEndpoint && !/\/protocol\/openid-connect\/token(?:$|\?)/i.test(tokenEndpoint)) {
    if (/^https?:\/\//i.test(tokenEndpoint)) return tokenEndpoint.replace(/\/+$/, "");
  }

  const baseUrl = normalizeBaseUrl(options.baseUrl || resolveCodeBuddyPluginBaseUrl(options.site));
  const path = explicit || PLUGIN_AUTH_TOKEN_REFRESH_PATH;
  if (/^\/v2(?:\/|$)/.test(path) && /\/v2$/i.test(baseUrl)) {
    return `${baseUrl}${path.slice(3)}`;
  }
  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

function shouldUseOidcRefresh(options = {}) {
  if (String(options.refreshMode || options.refresh_mode || "").toLowerCase() === "oidc") return true;
  const endpoint = compactText(options.tokenEndpoint || options.token_endpoint || "");
  return /\/protocol\/openid-connect\/token(?:$|\?)/i.test(endpoint);
}

function resolveCodeBuddyCredentialExpiresAt(credential = {}) {
  const direct = Number(credential.tokenExpiresAt || credential.token_expires_at || 0);
  if (direct > 0) return direct;
  const created = Number(credential.created_at || credential.createdAt || 0);
  const expiresIn = Number(credential.expires_in || credential.expiresIn || 0);
  if (created > 0 && expiresIn > 0) {
    const createdMs = created < 1e12 ? created * 1000 : created;
    return createdMs + expiresIn * 1000;
  }
  const token = String(
    credential.bearerToken || credential.bearer_token || credential.accessToken || credential.access_token || "",
  ).trim();
  const jwt = decodeCodeBuddyJwtPayload(token);
  const exp = Number(jwt.exp || 0);
  return exp > 0 ? exp * 1000 : 0;
}

export function shouldRefreshCodeBuddyCredential(credential = {}, options = {}) {
  const source = credential && typeof credential === "object" ? credential : {};
  const refreshToken = compactText(source.refreshToken || source.refresh_token || "");
  if (!refreshToken) return false;
  if (options.force === true) return true;
  const expiresAt = resolveCodeBuddyCredentialExpiresAt(source);
  if (!expiresAt) return false;
  const now = Number(options.now || Date.now());
  const refreshWindowMs = Number(options.refreshWindowMs ?? 10 * 60 * 1000);
  return expiresAt - now <= refreshWindowMs;
}

export async function refreshCodeBuddyOAuthToken(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new Error("fetch is not available for CodeBuddy token refresh");
  const accessToken = compactText(
    options.accessToken || options.access_token || options.bearerToken || options.bearer_token || "",
  );
  const refreshToken = compactText(options.refreshToken || options.refresh_token || "");
  if (!refreshToken) throw new Error("CodeBuddy credential has no refresh token");

  if (!shouldUseOidcRefresh(options)) {
    const endpoint = resolveCodeBuddyPluginRefreshEndpoint(options);
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: buildPluginAuthRefreshHeaders(endpoint, {
        accessToken,
        refreshToken,
      }),
      body: "{}",
      signal: options.signal,
    });
    const payload = await readJsonResponse(response);
    const tokenData = extractTokenDataFromPollPayload(payload);
    if (!response.ok || (!tokenData?.bearerToken && payload?.code && payload.code !== 0)) {
      const message = payload?.error_description || payload?.error || payload?.msg || payload?.message || `HTTP ${response.status}`;
      throw new Error(`CodeBuddy token refresh failed with ${response.status}: ${String(message).slice(0, 200)}`);
    }
    if (!tokenData?.bearerToken) {
      const message = payload?.msg || payload?.message || "no access token";
      throw new Error(`CodeBuddy token refresh returned no access token: ${String(message).slice(0, 200)}`);
    }
    if (!tokenData.refreshToken) tokenData.refreshToken = refreshToken;
    return tokenData;
  }

  const jwt = decodeCodeBuddyJwtPayload(accessToken);
  const endpoint = options.tokenEndpoint || options.token_endpoint || resolveCodeBuddyOAuthTokenEndpoint({
    ...options,
    accessToken,
  });
  const form = new URLSearchParams();
  form.set("grant_type", "refresh_token");
  form.set("client_id", compactText(options.clientId || options.client_id || jwt.azp || "console"));
  form.set("refresh_token", refreshToken);

  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      accept: "application/json, text/plain, */*",
      "content-type": "application/x-www-form-urlencoded",
      "cache-control": "no-cache",
      pragma: "no-cache",
      "x-requested-with": "XMLHttpRequest",
      "user-agent": "CLI/1.0.8 CodeBuddy/1.0.8",
    },
    body: form.toString(),
    signal: options.signal,
  });
  const payload = await readJsonResponse(response);
  if (!response.ok) {
    const message = payload?.error_description || payload?.error || payload?.msg || payload?.message || `HTTP ${response.status}`;
    throw new Error(`CodeBuddy token refresh failed with ${response.status}: ${String(message).slice(0, 200)}`);
  }
  const tokenData = extractTokenDataFromPollPayload(payload);
  if (!tokenData?.bearerToken) {
    throw new Error("CodeBuddy token refresh returned no access token");
  }
  if (!tokenData.refreshToken) tokenData.refreshToken = refreshToken;
  return tokenData;
}

function isPollPendingPayload(payload = {}) {
  const msg = String(payload?.msg || payload?.message || "");
  return payload?.code === 11217 || /login\s*ing/i.test(msg) || /waiting/i.test(msg);
}

async function requestCodeBuddyPluginAuthState(fetchImpl, baseUrl, nonce) {
  const url = `${baseUrl}${PLUGIN_AUTH_STATE_PATH}?platform=CLI&nonce=${nonce}`;
  const response = await fetchImpl(url, {
    method: "POST",
    headers: buildPluginAuthStartHeaders(baseUrl),
    body: JSON.stringify({ nonce }),
  });
  const payload = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(`CodeBuddy auth/state failed with ${response.status}: ${JSON.stringify(payload).slice(0, 200)}`);
  }
  if (payload?.code !== 0 || !payload?.data) {
    throw new Error(payload?.msg || `CodeBuddy auth/state error (code ${payload?.code ?? "unknown"})`);
  }
  const authState = String(payload.data.state || "").trim();
  const authUrl = String(payload.data.authUrl || "").trim();
  if (!authState || !authUrl) {
    throw new Error("CodeBuddy auth/state returned empty state or authUrl");
  }
  return { authState, authUrl, payload };
}

export async function startCodeBuddyPluginAuth(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const baseUrl = normalizeBaseUrl(options.baseUrl || resolveCodeBuddyPluginBaseUrl(options.site));
  const nonce = randomBytes(8).toString("hex");
  let { authState, authUrl } = await requestCodeBuddyPluginAuthState(fetchImpl, baseUrl, nonce);
  if (lastPluginAuthState && authState === lastPluginAuthState) {
    const retryNonce = randomBytes(8).toString("hex");
    const retry = await requestCodeBuddyPluginAuthState(fetchImpl, baseUrl, retryNonce);
    if (retry.authState && retry.authState !== authState) {
      authState = retry.authState;
      authUrl = retry.authUrl;
    }
  }
  lastPluginAuthState = authState;
  return {
    ok: true,
    baseUrl,
    site: options.site || "global",
    authState,
    authUrl,
    tokenEndpoint: `${baseUrl}${PLUGIN_AUTH_TOKEN_PATH}?state=${encodeURIComponent(authState)}`,
    expiresIn: 1800,
    pollIntervalMs: 5000,
  };
}

export async function pollCodeBuddyPluginAuth(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const authState = String(options.authState || "").trim();
  if (!authState) {
    return { status: "error", message: "missing auth state" };
  }
  const baseUrl = normalizeBaseUrl(options.baseUrl || resolveCodeBuddyPluginBaseUrl(options.site));
  const url = `${baseUrl}${PLUGIN_AUTH_TOKEN_PATH}?state=${encodeURIComponent(authState)}`;
  const response = await fetchImpl(url, {
    method: "GET",
    headers: buildPluginAuthPollHeaders(baseUrl),
  });
  const payload = await readJsonResponse(response);
  if (!response.ok) {
    return {
      status: "error",
      message: `token poll HTTP ${response.status}`,
      payload,
    };
  }
  if (isPollPendingPayload(payload)) {
    return {
      status: "pending",
      message: String(payload.msg || "waiting for login"),
      code: payload.code,
    };
  }
  const tokenData = extractTokenDataFromPollPayload(payload);
  if (tokenData) {
    return {
      status: "success",
      message: "authenticated",
      tokenData,
      payload,
    };
  }
  return {
    status: "unknown",
    message: String(payload?.msg || payload?.message || `unknown auth status (code ${payload?.code ?? "n/a"})`),
    code: payload?.code,
    payload,
  };
}

export function decodeCodeBuddyJwtPayload(token = "") {
  const text = String(token || "").trim();
  const parts = text.split(".");
  if (parts.length < 2) return {};
  let payloadPart = parts[1];
  const pad = payloadPart.length % 4;
  if (pad) payloadPart += "=".repeat(4 - pad);
  try {
    const json = Buffer.from(payloadPart.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return {};
  }
}

export function buildCodeBuddyCliCredentialFromTokenData(tokenData = {}, options = {}) {
  const bearerToken = String(
    tokenData.bearerToken || tokenData.accessToken || tokenData.access_token || tokenData.bearer_token || "",
  ).trim();
  if (!bearerToken) {
    throw new Error("CodeBuddy OAuth returned empty access token");
  }
  const jwt = decodeCodeBuddyJwtPayload(bearerToken);
  const userId = String(
    jwt.email || jwt.preferred_username || jwt.sub || tokenData.userId || tokenData.user_id || "",
  ).trim();
  const userName = String(jwt.name || jwt.preferred_username || jwt.email || userId || "").trim();
  const site = options.site || "global";
  const expiresIn = Number(tokenData.expiresIn || tokenData.expires_in || 0);
  const createdAt = Math.floor(Date.now() / 1000);
  const userInfo = {
    sub: compactText(jwt.sub || ""),
    email: compactText(jwt.email || ""),
    preferred_username: compactText(jwt.preferred_username || ""),
    name: compactText(jwt.name || ""),
    given_name: compactText(jwt.given_name || ""),
    family_name: compactText(jwt.family_name || ""),
    exp: jwt.exp,
    iat: jwt.iat,
    scope: compactText(jwt.scope || tokenData.scope || ""),
    session_state: compactText(jwt.sid || tokenData.sessionState || tokenData.session_state || ""),
  };
  for (const key of Object.keys(userInfo)) {
    if (userInfo[key] === "" || userInfo[key] == null) delete userInfo[key];
  }
  return {
    label: compactText(options.label || userName || userId || "CodeBuddy"),
    site,
    bearer_token: bearerToken,
    refresh_token: String(tokenData.refreshToken || tokenData.refresh_token || "").trim(),
    created_at: createdAt,
    expires_in: expiresIn,
    user_id: userId || "unknown",
    user_info: userInfo,
    token_type: String(tokenData.tokenType || tokenData.token_type || "Bearer").trim(),
    scope: compactText(tokenData.scope || ""),
    domain: compactText(tokenData.domain || ""),
    session_state: compactText(tokenData.sessionState || tokenData.session_state || ""),
    source: "cli_credential",
    authStatus: {
      loggedIn: true,
      authenticated: true,
      userId,
      userName,
      userNickname: String(jwt.nickname || jwt.name || "").trim(),
      authMode: "cli_oauth",
    },
  };
}

export function buildCodeBuddyOAuthAccountFromTokenData(tokenData = {}, options = {}) {
  const cli = buildCodeBuddyCliCredentialFromTokenData(tokenData, options);
  return {
    ...cli,
    bearerToken: cli.bearer_token,
    refreshToken: cli.refresh_token,
    tokenExpiresAt: cli.created_at && cli.expires_in ? cli.created_at * 1000 + cli.expires_in * 1000 : 0,
  };
}

function compactText(value) {
  return String(value || "").trim();
}
