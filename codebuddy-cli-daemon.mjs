import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

function normalizeBaseUrl(value) {
  const text = String(value || "").trim() || "http://127.0.0.1:8080";
  return text.replace(/\/+$/, "");
}

let managedDaemon = null;

function compactText(value) {
  return String(value || "").trim();
}

function normalizeRegionToken(value) {
  return compactText(value).toLowerCase().replace(/_/g, "-");
}

function resolveCodeBuddyDaemonInternetEnvironment(options = {}) {
  const explicit = normalizeRegionToken(
    options.internetEnvironment ||
    options.internet_environment ||
    process.env.CURSOR_DIRECT_CODEBUDDY_INTERNET_ENVIRONMENT ||
    process.env.CODEBUDDY_INTERNET_ENVIRONMENT ||
    process.env.CODEBUDDY_COPILOT_INTERNET_ENVIRONMENT ||
    process.env.CODEBUDDY_INTERNET_ENVIROMENT ||
    "",
  );
  if (["internal", "ioa"].includes(explicit)) return explicit;
  if (["domestic", "cn", "china"].includes(explicit)) return "internal";
  if (["public", "global", "intl", "international"].includes(explicit)) return "public";

  const site = normalizeRegionToken(
    options.site ||
    options.codeBuddySite ||
    process.env.CURSOR_DIRECT_CODEBUDDY_SITE ||
    process.env.CODEBUDDY_SITE ||
    "",
  );
  if (["domestic", "cn", "china", "internal", "ioa"].includes(site)) {
    return site === "ioa" ? "ioa" : "internal";
  }
  if (["global", "public", "intl", "international"].includes(site)) return "public";

  const baseUrl = compactText(options.baseUrl || options.url || "").toLowerCase();
  if (baseUrl.includes("copilot.tencent.com")) return "internal";
  if (baseUrl.includes("codebuddy.cn")) return "internal";
  return "public";
}

function isChinaCodeBuddyEnvironment(environment) {
  return ["domestic", "internal", "ioa"].includes(normalizeRegionToken(environment));
}

function normalizeCodeBuddyDaemonBaseUrl(value, internetEnvironment) {
  const baseUrl = compactText(value).replace(/\/+$/, "");
  if (!baseUrl) {
    if (internetEnvironment === "internal") return "https://copilot.tencent.com/v2";
    return "";
  }
  if (
    internetEnvironment === "internal" &&
    /^https?:\/\/(?:www\.)?codebuddy\.cn(?:\/|$)/i.test(baseUrl)
  ) {
    return "https://copilot.tencent.com/v2";
  }
  return baseUrl;
}

export function resolveCodeBuddyDaemonBin(options = {}) {
  const bin = compactText(
    options.bin ||
    process.env.CURSOR_DIRECT_CODEBUDDY_BIN ||
    process.env.CODEBUDDY_BIN ||
    "codebuddy",
  );
  if (bin && bin !== "codebuddy") return bin;

  const existsImpl = options.existsImpl || existsSync;
  const execPath = compactText(options.execPath || process.execPath);
  if (execPath) {
    const pathApi = execPath.includes("\\") ? path.win32 : path.posix;
    const sibling = pathApi.join(pathApi.dirname(execPath), process.platform === "win32" && pathApi === path.win32 ? "codebuddy.cmd" : "codebuddy");
    if (existsImpl(sibling)) return sibling;
    const unixSibling = pathApi.join(pathApi.dirname(execPath), "codebuddy");
    if (unixSibling !== sibling && existsImpl(unixSibling)) return unixSibling;
  }
  return bin || "codebuddy";
}

export function buildCodeBuddyDaemonEnv(options = {}) {
  const env = { ...(options.baseEnv || process.env) };
  const internetEnvironment = resolveCodeBuddyDaemonInternetEnvironment(options);
  const baseUrl = normalizeCodeBuddyDaemonBaseUrl(
    options.baseUrl ||
    options.daemonBaseUrl ||
    options.url ||
    env.CURSOR_DIRECT_CODEBUDDY_DAEMON_BASE_URL ||
    env.CODEBUDDY_DAEMON_BASE_URL ||
    "",
    internetEnvironment,
  );

  env.CODEBUDDY_INTERNET_ENVIRONMENT = internetEnvironment;
  env.CODEBUDDY_COPILOT_INTERNET_ENVIRONMENT = internetEnvironment;
  env.CODEBUDDY_INTERNET_ENVIROMENT = internetEnvironment;

  if (isChinaCodeBuddyEnvironment(internetEnvironment)) {
    env.CODEBUDDY_CN = "1";
  } else {
    delete env.CODEBUDDY_CN;
  }

  if (baseUrl) {
    env.CODEBUDDY_BASE_URL = baseUrl;
  } else {
    delete env.CODEBUDDY_BASE_URL;
  }
  return env;
}

export function getCodeBuddyDaemonConfig(options = {}) {
  const serveUrl = normalizeBaseUrl(
    options.serveUrl ||
    process.env.CURSOR_DIRECT_CODEBUDDY_SERVE_URL ||
    process.env.CODEBUDDY_SERVE_URL ||
    "http://127.0.0.1:8080",
  );
  let port = Number(options.port || process.env.CURSOR_DIRECT_CODEBUDDY_SERVE_PORT || process.env.CODEBUDDY_SERVE_PORT || 0);
  if (!port) {
    try {
      port = Number(new URL(serveUrl).port || 8080);
    } catch {
      port = 8080;
    }
  }
  const bin = compactText(options.bin || process.env.CURSOR_DIRECT_CODEBUDDY_BIN || process.env.CODEBUDDY_BIN || "codebuddy");
  return {
    serveUrl,
    port,
    bin: resolveCodeBuddyDaemonBin({ bin, execPath: options.execPath }),
    gatewayPassword: compactText(
      options.gatewayPassword ||
      process.env.CURSOR_DIRECT_CODEBUDDY_GATEWAY_PASSWORD ||
      process.env.CODEBUDDY_GATEWAY_PASSWORD ||
      "",
    ),
    autoStart: options.autoStart !== false && String(
      process.env.CURSOR_DIRECT_CODEBUDDY_SERVE_AUTOSTART ??
      process.env.CODEBUDDY_SERVE_AUTOSTART ??
      "1",
    ) !== "0",
    cwd: compactText(options.cwd || process.env.CURSOR_DIRECT_CODEBUDDY_SERVE_CWD || process.cwd()),
    site: compactText(options.site || options.codeBuddySite || process.env.CURSOR_DIRECT_CODEBUDDY_SITE || process.env.CODEBUDDY_SITE || ""),
    internetEnvironment: resolveCodeBuddyDaemonInternetEnvironment(options),
    baseUrl: compactText(
      options.baseUrl ||
      options.daemonBaseUrl ||
      process.env.CURSOR_DIRECT_CODEBUDDY_DAEMON_BASE_URL ||
      process.env.CODEBUDDY_DAEMON_BASE_URL ||
      "",
    ),
  };
}

export function buildCodeBuddyDaemonHeaders(options = {}) {
  const headers = {
    accept: "application/json",
    "content-type": "application/json",
    "x-codebuddy-request": "1",
  };
  const password = compactText(options.gatewayPassword);
  if (password) headers.authorization = `Bearer ${password}`;
  return headers;
}

export async function checkCodeBuddyDaemonHealth(options = {}) {
  const config = getCodeBuddyDaemonConfig(options);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const url = `${config.serveUrl}/api/v1/health`;
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: buildCodeBuddyDaemonHeaders(config),
      signal: options.signal,
    });
    if (!response.ok) {
      return { ok: false, url, status: response.status, message: `health HTTP ${response.status}` };
    }
    const payload = await response.json().catch(() => ({}));
    return { ok: true, url, status: response.status, payload };
  } catch (error) {
    return {
      ok: false,
      url,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

function stopManagedDaemon() {
  if (!managedDaemon?.child || managedDaemon.child.exitCode != null) {
    managedDaemon = null;
    return;
  }
  try {
    managedDaemon.child.kill("SIGTERM");
  } catch {
    // ignore
  }
  managedDaemon = null;
}

export function stopCodeBuddyDaemon() {
  const pid = managedDaemon?.child?.pid || null;
  stopManagedDaemon();
  return { ok: true, pid };
}

export function spawnCodeBuddyServe(options = {}) {
  const config = getCodeBuddyDaemonConfig(options);
  const args = ["--serve", "--port", String(config.port)];
  const sessionId = compactText(options.sessionId);
  if (sessionId) args.push("--session-id", sessionId);

  const child = spawn(config.bin, args, {
    cwd: config.cwd,
    env: buildCodeBuddyDaemonEnv(config),
    stdio: ["ignore", "pipe", "pipe"],
  });

  managedDaemon = {
    child,
    config,
    startedAt: Date.now(),
    stdout: "",
    stderr: "",
    error: null,
  };
  child.stdout?.on("data", (chunk) => {
    managedDaemon.stdout += String(chunk || "");
  });
  child.stderr?.on("data", (chunk) => {
    managedDaemon.stderr += String(chunk || "");
  });
  child.on("exit", () => {
    if (managedDaemon?.child === child) managedDaemon = null;
  });
  child.on("error", (error) => {
    if (managedDaemon?.child === child) managedDaemon.error = error;
  });

  return { child, config, state: managedDaemon };
}

export async function ensureCodeBuddyDaemonRunning(options = {}) {
  const config = getCodeBuddyDaemonConfig(options);
  const existing = await checkCodeBuddyDaemonHealth({ ...options, serveUrl: config.serveUrl });
  if (existing.ok) {
    return { ok: true, started: false, config, health: existing };
  }
  if (!options.autoStart && config.autoStart === false) {
    throw new Error(
      `CodeBuddy CLI 服务未运行（${config.serveUrl}）。请在本机执行: codebuddy --serve --port ${config.port}`,
    );
  }

  if (!options.autoStart && !config.autoStart) {
    throw new Error(`CodeBuddy CLI 服务未运行: ${existing.message || "health check failed"}`);
  }

  const bin = config.bin;
  if (bin.includes("/") || bin.includes("\\")) {
    if (!existsSync(bin)) throw new Error(`找不到 CodeBuddy 可执行文件: ${bin}`);
  }

  stopManagedDaemon();
  const spawned = spawnCodeBuddyServe(options);
  const deadline = Date.now() + Math.max(5000, Number(options.startupTimeoutMs || 45000));
  let lastHealth = existing;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 800));
    const spawnError = spawned.state?.error || (managedDaemon?.child === spawned.child ? managedDaemon?.error : null);
    if (spawnError) {
      const message = spawnError instanceof Error ? spawnError.message : String(spawnError);
      throw new Error(`codebuddy --serve 启动失败: ${message}`);
    }
    if (spawned.child.exitCode != null) {
      const detail = compactText(managedDaemon?.stderr || managedDaemon?.stdout).slice(0, 300);
      throw new Error(`codebuddy --serve 启动失败 (exit ${spawned.child.exitCode})${detail ? `: ${detail}` : ""}`);
    }
    lastHealth = await checkCodeBuddyDaemonHealth({ ...options, serveUrl: config.serveUrl });
    if (lastHealth.ok) {
      return { ok: true, started: true, config, health: lastHealth, pid: spawned.child.pid };
    }
  }
  throw new Error(
    `等待 CodeBuddy CLI 服务就绪超时（${config.serveUrl}）。${lastHealth.message || ""}`.trim(),
  );
}

export function summarizeCodeBuddyDaemonStatus(health = {}, config = getCodeBuddyDaemonConfig()) {
  return {
    ok: Boolean(health.ok),
    serveUrl: config.serveUrl,
    port: config.port,
    bin: config.bin,
    site: config.site || "",
    internetEnvironment: config.internetEnvironment || "",
    managedPid: managedDaemon?.child?.pid || null,
    health: health.payload || null,
    message: health.ok ? "CLI 服务可用" : (health.message || "CLI 服务不可用"),
  };
}
