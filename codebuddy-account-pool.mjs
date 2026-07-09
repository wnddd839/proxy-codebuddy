import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

import { buildCodeBuddyDaemonHeaders, getCodeBuddyDaemonConfig } from "./codebuddy-cli-daemon.mjs";
import { decodeCodeBuddyJwtPayload } from "./codebuddy-oauth.mjs";
import { buildCodeBuddyCloudHeaders, buildCodeBuddyProtocolDirectHeaders, normalizeBaseUrl } from "./codebuddy-provider.mjs";

const DEFAULT_CODEBUDDY_ACCOUNTS_PATH = path.join(homedir(), ".codebuddy", "proxy-accounts.json");
const DEFAULT_CODEBUDDY_TRANSPORT = "protocol_direct";
const CODEBUDDY_SITE_CONFIG = {
  domestic: { site: "domestic", baseUrl: "https://www.codebuddy.cn", internetEnvironment: "domestic" },
  global: { site: "global", baseUrl: "https://www.codebuddy.ai", internetEnvironment: "public" },
};

function maskSecret(value, visible = 5) {
  const text = String(value || "");
  if (!text) return "";
  if (text.length <= visible * 2) return `${text.slice(0, Math.max(1, visible))}...`;
  return `${text.slice(0, visible)}...${text.slice(-visible)}`;
}

function hashSecret(value) {
  return createHash("sha256").update(String(value || "")).digest("hex").slice(0, 16);
}

function cloneJson(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function compactString(value) {
  return String(value || "").trim();
}

function normalizeCodeBuddyApiEndpoint(value) {
  const text = compactString(value);
  if (!text) return "";
  try {
    return new URL(text).toString().replace(/\/+$/, "");
  } catch {
    return text.replace(/\/+$/, "");
  }
}

function looksLikeCodeBuddySecretValue(value) {
  const text = compactString(value).replace(/^['"]|['"]$/g, "");
  if (!text) return false;
  if (/^\d{10,}$/.test(text)) return false;
  if (/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(text)) return false;
  if (text.length < 16) return false;
  if (/^eyJ[A-Za-z0-9_-]*\./.test(text)) return true;
  if (/[A-Za-z]/.test(text) && /[A-Za-z0-9]/.test(text)) return true;
  return false;
}

function normalizeAuthStatus(value) {
  const source = value && typeof value === "object" ? value : {};
  const loggedIn = typeof source.loggedIn === "boolean"
    ? source.loggedIn
    : typeof source.authenticated === "boolean"
      ? source.authenticated
      : null;
  return {
    loggedIn,
    userId: compactString(source.userId || source.user_id || source.id || ""),
    userName: compactString(source.userName || source.username || source.email || source.name || ""),
    userNickname: compactString(source.userNickname || source.nickname || source.displayName || ""),
    authMode: compactString(source.authMode || source.auth_mode || source.mode || ""),
    raw: source.raw && typeof source.raw === "object" ? cloneJson(source.raw) : undefined,
  };
}

function normalizeCodeBuddyAccountAuth(input) {
  const source = input && typeof input === "object" ? input : {};
  const bearerToken = compactString(
    source.bearerToken ||
    source.bearer_token ||
    source.accessToken ||
    source.access_token ||
    "",
  );
  const apiKey = compactString(
    source.apiKey || source.api_key || source.xApiKey || source.x_api_key || source["x-api-key"] || "",
  );
  const genericKey = compactString(source.key || "");
  return {
    apiKey: apiKey || (/^ck[_-]/i.test(genericKey) ? genericKey : ""),
    bearerToken: bearerToken || (genericKey.startsWith("eyJ") ? genericKey : ""),
    refreshToken: compactString(source.refreshToken || source.refresh_token || ""),
    tokenExpiresAt: Number(source.tokenExpiresAt || source.token_expires_at || 0),
    createdAtSec: Number(source.created_at || source.createdAt || 0),
    expiresInSec: Number(source.expires_in || source.expiresIn || 0),
  };
}

function resolveTokenExpiresAt(auth, source = {}) {
  if (auth.tokenExpiresAt > 0) return auth.tokenExpiresAt;
  const created = Number(source.created_at || source.createdAt || auth.createdAtSec || 0);
  const expiresIn = Number(source.expires_in || source.expiresIn || auth.expiresInSec || 0);
  if (!created || !expiresIn) return 0;
  const createdMs = created < 1e12 ? created * 1000 : created;
  return createdMs + expiresIn * 1000;
}

function getCredentialHash(auth) {
  return hashSecret(auth.bearerToken || auth.apiKey || "");
}

function getAuthType(auth) {
  if (auth.bearerToken) return "bearer";
  if (auth.apiKey) return "api_key";
  return "";
}

function normalizeCodeBuddySite(value) {
  const text = compactString(value).toLowerCase();
  if (["domestic", "cn", "china", "internal"].includes(text)) return "domestic";
  return "global";
}

function inferCodeBuddySite(source = {}) {
  if (source.site || source.codeBuddySite || source.codebuddy_site) {
    return normalizeCodeBuddySite(source.site || source.codeBuddySite || source.codebuddy_site);
  }
  const env = compactString(source.internetEnvironment || source.internet_environment || "").toLowerCase();
  if (env === "internal") return "domestic";
  const url = compactString(source.baseUrl || source.url || "").toLowerCase();
  if (url.includes("codebuddy.cn") || url.includes("copilot.tencent.com")) return "domestic";
  return "global";
}

function normalizeCodeBuddyTransport(value) {
  const text = compactString(value).toLowerCase();
  if (!text) return DEFAULT_CODEBUDDY_TRANSPORT;
  if (["protocol_direct", "protocol-direct", "direct", "cloud_direct", "cloud-direct"].includes(text)) return "protocol_direct";
  if (text === "cloud") return "cloud";
  if (["cli_daemon", "cli-daemon", "daemon"].includes(text)) return "cli_daemon";
  return DEFAULT_CODEBUDDY_TRANSPORT;
}

function hasCodeBuddyCredentials(account) {
  return Boolean(compactString(account?.apiKey || account?.bearerToken || ""));
}

function getCodeBuddyAccountsPath(options = {}) {
  return options.accountsPath || process.env.CODEBUDDY_PROXY_ACCOUNTS_PATH || DEFAULT_CODEBUDDY_ACCOUNTS_PATH;
}

function createEmptyCodeBuddyAccountsStore() {
  return { version: 1, provider: "codebuddy", nextIndex: 0, accounts: [] };
}

function normalizeStoredCodeBuddyAccount(raw) {
  if (!raw || typeof raw !== "object") return null;
  return createCodeBuddyAccount(raw, {
    id: raw.id,
    now: raw.updatedAt || raw.createdAt || Date.now(),
    preserveTimestamps: true,
  });
}

function parseCodeBuddyAccountsImportInput(input) {
  if (typeof input === "string") {
    const text = input.trim();
    if (!text) return [];
    return parseCodeBuddyAccountsImportInput(JSON.parse(text));
  }
  if (Array.isArray(input)) return input.flatMap(parseCodeBuddyAccountsImportInput);
  if (!input || typeof input !== "object") return [];
  if (typeof input.authJson === "string") {
    return parseCodeBuddyAccountsImportInput(input.authJson).map((account) => ({
      ...account,
      label: input.label || account.label,
      enabled: typeof input.enabled === "boolean" ? input.enabled : account.enabled,
    }));
  }
  if (Array.isArray(input.accounts)) return input.accounts.flatMap(parseCodeBuddyAccountsImportInput);
  return [input];
}

export function createCodeBuddyAccount(raw = {}, options = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  const now = Number(options.now || Date.now());
  const auth = normalizeCodeBuddyAccountAuth(source);
  const authStatus = normalizeAuthStatus({
    ...(source.authStatus || source.status || {}),
    userId: compactString(
      source.authStatus?.userId ||
      source.authStatus?.user_id ||
      source.user_id ||
      source.userId ||
      "",
    ),
    userName: compactString(
      source.authStatus?.userName ||
      source.authStatus?.user_name ||
      source.user_info?.name ||
      source.user_info?.email ||
      source.user_name ||
      "",
    ),
    userNickname: compactString(source.authStatus?.userNickname || source.user_info?.nickname || ""),
    authMode: compactString(source.authStatus?.authMode || source.auth_mode || ""),
    loggedIn: source.authStatus?.loggedIn !== false,
    authenticated: source.authStatus?.authenticated !== false,
  });
  const site = inferCodeBuddySite(source);
  const siteConfig = CODEBUDDY_SITE_CONFIG[site] || CODEBUDDY_SITE_CONFIG.global;
  const baseUrl = normalizeBaseUrl(source.baseUrl || source.url || siteConfig.baseUrl);
  const internetEnvironment = compactString(source.internetEnvironment || source.internet_environment || siteConfig.internetEnvironment);
  const apiEndpoint = normalizeCodeBuddyApiEndpoint(
    source.apiEndpoint || source.api_endpoint || source.chatEndpoint || source.endpoint || "",
  );
  const chatCompletionsPath = compactString(
    source.chatCompletionsPath || source.chat_completions_path || source.endpointPath || source.endpoint_path || "",
  );
  const domain = compactString(source.domain || source.xDomain || source["x-domain"] || "");
  const enterpriseId = compactString(source.enterpriseId || source.enterprise_id || source.tenantId || source.tenant_id || "");
  const tenantId = compactString(source.tenantId || source.tenant_id || enterpriseId || "");
  const departmentFullName = compactString(source.departmentFullName || source.department_full_name || source.departmentInfo || source.department_info || "");
  const inferredTransport = source.useDaemonAuth === true
    ? "cli_daemon"
    : auth.bearerToken
      ? DEFAULT_CODEBUDDY_TRANSPORT
      : auth.apiKey
        ? "cloud"
        : "cli_daemon";
  const transport = normalizeCodeBuddyTransport(
    source.transport || source.codeBuddyTransport || process.env.CURSOR_DIRECT_CODEBUDDY_TRANSPORT || inferredTransport,
  );
  const daemonBaseUrl = normalizeBaseUrl(
    source.daemonBaseUrl || source.daemon_base_url || source.serveUrl || source.serve_url || getCodeBuddyDaemonConfig().serveUrl,
  );
  const credentialHash = source.credentialHash || getCredentialHash(auth) || hashSecret(`${transport}|${daemonBaseUrl}`);
  const identity = authStatus.userId || authStatus.userName || source.subject || source.email || source.label || "";
  const id = compactString(
    options.id ||
    source.id ||
    hashSecret(`${identity}|${credentialHash}|${baseUrl}|${internetEnvironment}|${site}|${apiEndpoint}|${chatCompletionsPath}`),
  );
  const createdAt = Number(source.createdAt || (options.preserveTimestamps ? now : 0) || now);
  const updatedAt = Number(source.updatedAt || now);

  return {
    id,
    provider: "codebuddy",
    label: compactString(source.label || authStatus.userName || authStatus.userId || `CodeBuddy ${id.slice(0, 6)}`),
    enabled: source.enabled !== false && options.enabled !== false,
    source: compactString(options.source || source.source || "pool"),
    site,
    baseUrl,
    internetEnvironment,
    apiEndpoint,
    chatCompletionsPath,
    domain,
    enterpriseId,
    tenantId,
    departmentFullName,
    transport,
    daemonBaseUrl,
    authType: getAuthType(auth),
    useDaemonAuth: transport === "cli_daemon",
    apiKey: auth.apiKey,
    bearerToken: auth.bearerToken,
    refreshToken: auth.refreshToken,
    tokenExpiresAt: resolveTokenExpiresAt(auth, source),
    credentialHash,
    authStatus,
    createdAt,
    updatedAt,
    lastUsedAt: Number(source.lastUsedAt || 0),
    lastSelectedAt: Number(source.lastSelectedAt || 0),
    successRequests: Number(source.successRequests || 0),
    failedRequests: Number(source.failedRequests || 0),
    lastError: compactString(source.lastError || ""),
  };
}

export function normalizeCodeBuddyAccountsStore(store) {
  const input = store && typeof store === "object" ? store : createEmptyCodeBuddyAccountsStore();
  const accounts = (Array.isArray(input.accounts) ? input.accounts : [])
    .map(normalizeStoredCodeBuddyAccount)
    .filter(Boolean)
    .filter(hasCodeBuddyCredentials);
  const rawNext = Number.isInteger(input.nextIndex) ? input.nextIndex : 0;
  const nextIndex = accounts.length > 0 ? ((rawNext % accounts.length) + accounts.length) % accounts.length : 0;
  return { version: 1, provider: "codebuddy", nextIndex, accounts };
}

function isCodeBuddyAccountEligible(account, options = {}) {
  if (!account || account.enabled === false || !hasCodeBuddyCredentials(account)) return false;
  const preferredSite = compactString(options.site || options.codeBuddySite || "");
  if (preferredSite) {
    const accountSite = account.site || inferCodeBuddySite(account);
    if (normalizeCodeBuddySite(accountSite) !== normalizeCodeBuddySite(preferredSite)) return false;
  }
  const excludeAccountIds = Array.isArray(options.excludeAccountIds) ? options.excludeAccountIds : [];
  if (excludeAccountIds.includes(account.id)) return false;
  return true;
}

export function summarizeCodeBuddyAccount(account) {
  const authStatus = normalizeAuthStatus(account?.authStatus || {});
  const hasCreds = hasCodeBuddyCredentials(account);
  const loggedIn = hasCreds
    ? (typeof authStatus.loggedIn === "boolean" ? authStatus.loggedIn : true)
    : (typeof authStatus.loggedIn === "boolean" ? authStatus.loggedIn : false);
  const authType = account?.authType || getAuthType(normalizeCodeBuddyAccountAuth(account));
  return {
    id: account?.id || "",
    provider: "codebuddy",
    label: account?.label || "",
    enabled: account?.enabled !== false,
    source: account?.source || "pool",
    site: account?.site || inferCodeBuddySite(account || {}),
    baseUrl: account?.baseUrl || "",
    internetEnvironment: account?.internetEnvironment || "",
    apiEndpoint: account?.apiEndpoint || "",
    chatCompletionsPath: account?.chatCompletionsPath || "",
    domain: account?.domain || "",
    enterpriseId: account?.enterpriseId || "",
    tenantId: account?.tenantId || "",
    departmentFullName: account?.departmentFullName || "",
    transport: account?.transport || "cli_daemon",
    daemonBaseUrl: account?.daemonBaseUrl || "",
    authType,
    hasCredentials: hasCodeBuddyCredentials(account),
    loggedIn,
    userId: authStatus.userId,
    userName: authStatus.userName,
    userNickname: authStatus.userNickname,
    authMode: authStatus.authMode,
    authTokenPreview: "",
    bearerTokenPreview: hasCodeBuddyCredentials(account) ? maskSecret(account?.bearerToken, 6) : "",
    refreshTokenPreview: hasCodeBuddyCredentials(account) ? maskSecret(account?.refreshToken, 4) : "",
    apiKeyPreview: maskSecret(account?.apiKey, 6),
    apiKeyHelperPreview: "",
    cookiePreview: "",
    createdAt: Number(account?.createdAt || 0),
    updatedAt: Number(account?.updatedAt || 0),
    lastUsedAt: Number(account?.lastUsedAt || 0),
    lastSelectedAt: Number(account?.lastSelectedAt || 0),
    successRequests: Number(account?.successRequests || 0),
    failedRequests: Number(account?.failedRequests || 0),
    lastError: compactString(account?.lastError || ""),
    tokenExpiresAt: Number(account?.tokenExpiresAt || 0),
    tokenExpired: Number(account?.tokenExpiresAt || 0) > 0 && Number(account?.tokenExpiresAt || 0) <= Date.now(),
  };
}

export function summarizeCodeBuddyAccountsStore(store, options = {}) {
  const normalized = normalizeCodeBuddyAccountsStore(store);
  const accounts = normalized.accounts.map(summarizeCodeBuddyAccount);
  const enabledAccounts = accounts.filter((account) => account.enabled);
  const primary = enabledAccounts.find((account) => account.hasCredentials) || enabledAccounts[0] || accounts[0] || null;
  return {
    ok: true,
    provider: "codebuddy",
    version: normalized.version,
    nextIndex: normalized.nextIndex,
    accountsPath: getCodeBuddyAccountsPath(options),
    count: accounts.length,
    enabledCount: enabledAccounts.length,
    disabledCount: accounts.length - enabledAccounts.length,
    loggedIn: Boolean(
      enabledAccounts.some((account) => account.hasCredentials && account.loggedIn !== false),
    ),
    primary,
    accounts,
  };
}

export function importCodeBuddyAccounts(store, input, options = {}) {
  const now = Number(options.now || Date.now());
  const nextStore = normalizeCodeBuddyAccountsStore(store);
  const imported = [];

  for (const raw of parseCodeBuddyAccountsImportInput(input)) {
    const account = createCodeBuddyAccount(raw, { now });
    if (!hasCodeBuddyCredentials(account)) continue;
    const existingIndex = nextStore.accounts.findIndex((item) => (
      item.id === account.id ||
      (account.credentialHash && item.credentialHash === account.credentialHash) ||
      (account.authStatus.userId && item.authStatus?.userId === account.authStatus.userId)
    ));
    if (existingIndex >= 0) {
      const previous = nextStore.accounts[existingIndex];
      nextStore.accounts[existingIndex] = {
        ...previous,
        ...account,
        id: previous.id,
        createdAt: previous.createdAt || account.createdAt,
        successRequests: previous.successRequests || 0,
        failedRequests: previous.failedRequests || 0,
        lastUsedAt: previous.lastUsedAt || 0,
        lastSelectedAt: previous.lastSelectedAt || 0,
        lastError: "",
      };
      imported.push(nextStore.accounts[existingIndex]);
    } else {
      nextStore.accounts.push(account);
      imported.push(account);
    }
  }

  return {
    store: normalizeCodeBuddyAccountsStore(nextStore),
    imported,
    summaries: imported.map(summarizeCodeBuddyAccount),
  };
}

export function selectCodeBuddyAccount(store, options = {}) {
  const normalized = normalizeCodeBuddyAccountsStore(store);
  const now = Number(options.now || Date.now());
  const accountId = compactString(options.accountId || "");

  if (accountId) {
    const selectedIndex = normalized.accounts.findIndex((account) => account.id === accountId);
    if (selectedIndex < 0) throw new Error(`CodeBuddy account not found: ${accountId}`);
    const selected = normalized.accounts[selectedIndex];
    if (selected.enabled === false) throw new Error(`CodeBuddy account is disabled: ${accountId}`);
    if (!hasCodeBuddyCredentials(selected)) throw new Error(`CodeBuddy account has no credentials: ${accountId}`);
    const preferredSite = compactString(options.site || options.codeBuddySite || "");
    if (preferredSite) {
      const accountSite = selected.site || inferCodeBuddySite(selected);
      if (normalizeCodeBuddySite(accountSite) !== normalizeCodeBuddySite(preferredSite)) {
        throw new Error(
          `CodeBuddy account site mismatch: account=${accountSite}, configured=${normalizeCodeBuddySite(preferredSite)}`,
        );
      }
    }
    const accounts = normalized.accounts.slice();
    accounts[selectedIndex] = { ...selected, lastSelectedAt: now };
    return {
      source: "pool",
      account: accounts[selectedIndex],
      index: selectedIndex,
      store: { ...normalized, accounts },
    };
  }

  for (let offset = 0; offset < normalized.accounts.length; offset += 1) {
    const selectedIndex = (normalized.nextIndex + offset) % normalized.accounts.length;
    const selected = normalized.accounts[selectedIndex];
    if (!isCodeBuddyAccountEligible(selected, options)) continue;
    const accounts = normalized.accounts.slice();
    accounts[selectedIndex] = { ...selected, lastSelectedAt: now };
    return {
      source: "pool",
      account: accounts[selectedIndex],
      index: selectedIndex,
      store: {
        ...normalized,
        nextIndex: (selectedIndex + 1) % normalized.accounts.length,
        accounts,
      },
    };
  }

  throw new Error(
    compactString(options.site || options.codeBuddySite || "")
      ? `No enabled CodeBuddy accounts with credentials available for site=${normalizeCodeBuddySite(options.site || options.codeBuddySite)}`
      : "No enabled CodeBuddy accounts with credentials available",
  );
}

export function readCodeBuddyAccountsStore(options = {}) {
  const accountsPath = getCodeBuddyAccountsPath(options);
  if (!existsSync(accountsPath)) return createEmptyCodeBuddyAccountsStore();
  const raw = normalizeCodeBuddyAccountsStore(JSON.parse(readFileSync(accountsPath, "utf8")));
  const parsed = JSON.parse(readFileSync(accountsPath, "utf8"));
  const before = Array.isArray(parsed.accounts) ? parsed.accounts.length : 0;
  if (before !== raw.accounts.length) {
    writeCodeBuddyAccountsStore(raw, { accountsPath });
  }
  return raw;
}

export function writeCodeBuddyAccountsStore(store, options = {}) {
  const accountsPath = getCodeBuddyAccountsPath(options);
  const normalized = normalizeCodeBuddyAccountsStore(store);
  const allowShrink = options.allowShrink === true;
  if (!allowShrink && existsSync(accountsPath)) {
    try {
      const existing = normalizeCodeBuddyAccountsStore(JSON.parse(readFileSync(accountsPath, "utf8")));
      if (existing.accounts.length > 0 && normalized.accounts.length < existing.accounts.length) {
        throw new Error(
          `Refusing to shrink CodeBuddy accounts store from ${existing.accounts.length} to ${normalized.accounts.length} at ${accountsPath}`,
        );
      }
    } catch (error) {
      if (/Refusing to shrink CodeBuddy accounts store/.test(String(error?.message || error))) throw error;
      // Corrupt/unreadable existing file: allow overwrite with normalized store.
    }
  }
  mkdirSync(path.dirname(accountsPath), { recursive: true });
  writeFileSync(accountsPath, `${JSON.stringify(normalized, null, 2)}\n`, { mode: 0o600 });
  return normalized;
}

export function markCodeBuddyAccountResult(selection, ok, options = {}) {
  if (!selection || selection.source !== "pool" || !selection.account?.id) return;
  const accountsPath = getCodeBuddyAccountsPath(options);
  const store = readCodeBuddyAccountsStore({ accountsPath });
  const accounts = store.accounts.map((account) => {
    if (account.id !== selection.account.id) return account;
    return {
      ...account,
      lastUsedAt: Date.now(),
      successRequests: Number(account.successRequests || 0) + (ok ? 1 : 0),
      failedRequests: Number(account.failedRequests || 0) + (ok ? 0 : 1),
      lastError: ok ? "" : compactString(options.error || "unknown error").slice(0, 600),
    };
  });
  writeCodeBuddyAccountsStore({ ...store, accounts }, { accountsPath });
}

export async function resolveCodeBuddyAccountHeaders(account, options = {}) {
  const normalized = createCodeBuddyAccount(account || {});

  if (normalized.transport === "cli_daemon") {
    return buildCodeBuddyDaemonHeaders({
      gatewayPassword: options.gatewayPassword || getCodeBuddyDaemonConfig().gatewayPassword,
    });
  }

  if (normalized.transport === "protocol_direct") {
    if (!normalized.bearerToken) {
      throw new Error(`CodeBuddy protocol direct account has no OAuth bearer token: ${normalized.id}`);
    }
    return buildCodeBuddyProtocolDirectHeaders({
      bearerToken: normalized.bearerToken,
      baseUrl: normalized.baseUrl || options.baseUrl,
      apiEndpoint: normalized.apiEndpoint || options.apiEndpoint,
      chatCompletionsPath: normalized.chatCompletionsPath || options.chatCompletionsPath,
      site: normalized.site || options.site,
      internetEnvironment: normalized.internetEnvironment || options.internetEnvironment,
      userId: normalized.authStatus?.userId || options.userId || "",
      domain: normalized.domain || options.domain || "",
      enterpriseId: normalized.enterpriseId || options.enterpriseId || "",
      tenantId: normalized.tenantId || options.tenantId || "",
      departmentFullName: normalized.departmentFullName || options.departmentFullName || "",
    });
  }

  if (normalized.bearerToken) {
    const jwt = decodeCodeBuddyJwtPayload(normalized.bearerToken);
    const userId = String(
      jwt.sub || jwt.email || jwt.preferred_username || normalized.authStatus?.userId || "anonymous",
    ).trim();
    return buildCodeBuddyCloudHeaders({
      bearerToken: normalized.bearerToken,
      baseUrl: normalized.baseUrl || options.baseUrl,
      userId,
    });
  }

  if (normalized.apiKey) {
    return buildCodeBuddyCloudHeaders({
      apiKey: normalized.apiKey,
      baseUrl: normalized.baseUrl || options.baseUrl,
      userId: "anonymous",
    });
  }

  throw new Error(`CodeBuddy account has no credentials: ${normalized.id}`);
}

export {
  createEmptyCodeBuddyAccountsStore,
  getCodeBuddyAccountsPath,
  hasCodeBuddyCredentials,
};
