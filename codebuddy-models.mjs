import {
  buildCodeBuddyCloudHeaders,
  buildCodeBuddyProtocolDirectHeaders,
  listCodeBuddyDaemonModelsViaAcp,
  normalizeBaseUrl,
  normalizeCodeBuddyModels,
  resolveCodeBuddyProtocolDirectBaseUrl,
  runCodeBuddyCompletion,
} from "./codebuddy-provider.mjs";

const UPSTREAM_MODEL_CONFIG_PATH = "/v3/config";
const UPSTREAM_MODEL_LIST_PATHS = [
  UPSTREAM_MODEL_CONFIG_PATH,
  "/v2/models",
  "/v2/plugin/models",
  "/v1/models",
  "/api/v1/models",
];

const AUTO_MODEL = { id: "auto", name: "Auto", supportsTools: true };

export const CODEBUDDY_SITE_MODEL_CATALOG = {
  global: [AUTO_MODEL],
  domestic: [AUTO_MODEL],
};

function normalizeSite(site = "global") {
  const text = String(site || "global").toLowerCase();
  if (["domestic", "cn", "china", "internal"].includes(text)) return "domestic";
  return "global";
}

function isProtocolDirectTransport(transport = "") {
  const text = String(transport || "").trim().toLowerCase();
  return ["protocol_direct", "protocol-direct", "direct", "cloud_direct", "cloud-direct"].includes(text);
}

function resolveModelDiscoveryBaseUrl(options = {}) {
  if (isProtocolDirectTransport(options.transport)) {
    return resolveCodeBuddyProtocolDirectBaseUrl(options);
  }
  return normalizeBaseUrl(options.baseUrl);
}

function buildModelDiscoveryHeaders(options = {}) {
  if (options.headers && typeof options.headers === "object") {
    return options.headers;
  }
  if (isProtocolDirectTransport(options.transport)) {
    return buildCodeBuddyProtocolDirectHeaders({
      bearerToken: options.bearerToken,
      apiKey: options.apiKey,
      token: options.token,
      baseUrl: options.baseUrl,
      site: options.site,
      internetEnvironment: options.internetEnvironment,
      userId: options.userId,
      enterpriseId: options.enterpriseId,
      tenantId: options.tenantId,
      departmentFullName: options.departmentFullName,
      domain: options.domain,
    });
  }
  return buildCodeBuddyCloudHeaders({
    bearerToken: options.bearerToken,
    apiKey: options.apiKey,
    token: options.token,
    baseUrl: options.baseUrl,
    userId: options.userId,
  });
}

export function getCodeBuddySiteModelCatalog(site = "global") {
  return CODEBUDDY_SITE_MODEL_CATALOG[normalizeSite(site)] || CODEBUDDY_SITE_MODEL_CATALOG.global;
}

export function toCodeBuddyPublicModelId(upstreamId = "") {
  const cleaned = String(upstreamId || "").trim();
  if (!cleaned || cleaned === "default") return "codebuddy/auto";
  if (/^codebuddy(?:\/|:)/i.test(cleaned)) return cleaned.replace(/^codebuddy:/i, "codebuddy/");
  return `codebuddy/${cleaned}`;
}

export function toCodeBuddyAdminModels(rows = [], options = {}) {
  const verifiedIds = options.verifiedIds instanceof Set
    ? options.verifiedIds
    : new Set(Array.isArray(options.verifiedIds) ? options.verifiedIds : []);
  const source = String(options.source || "catalog");
  const allVerified = source === "upstream" || source === "probe" || source === "v3_config" || source === "daemon_acp";

  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const upstreamId = String(row?.id || row?.modelId || "").trim();
      if (!upstreamId) return null;
      const publicId = toCodeBuddyPublicModelId(upstreamId);
      const verified = allVerified || verifiedIds.has(upstreamId);
      return {
        id: publicId,
        modelId: upstreamId,
        upstreamId,
        name: String(row?.name || row?.displayName || upstreamId).trim() || upstreamId,
        displayName: String(row?.displayName || row?.name || upstreamId).trim() || upstreamId,
        object: "model",
        owned_by: "codebuddy",
        supportsTools: row?.supportsTools !== false,
        supportsImages: Boolean(row?.supportsImages),
        verified,
        source,
      };
    })
    .filter(Boolean);
}

function extractModelsFromConfigPayload(payload = {}) {
  const root = payload?.data && typeof payload.data === "object" ? payload.data : payload;
  const rows = normalizeCodeBuddyModels(root?.models ? { models: root.models } : payload);
  if (rows.length > 0) {
    return {
      models: rows,
      agents: Array.isArray(root?.agents) ? root.agents : [],
    };
  }
  return { models: [], agents: [] };
}

export async function fetchCodeBuddyModelsViaV3Config(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const headers = buildModelDiscoveryHeaders(options);
  const candidates = [];
  const primary = resolveModelDiscoveryBaseUrl(options);
  if (primary) candidates.push(primary);
  if (!primary.includes("copilot.tencent.com")) {
    candidates.push("https://copilot.tencent.com");
  }

  let lastError = "";
  for (const baseUrl of candidates) {
    try {
      const response = await fetchImpl(`${normalizeBaseUrl(baseUrl)}${UPSTREAM_MODEL_CONFIG_PATH}`, {
        method: "GET",
        headers,
        signal: options.signal,
      });
      if (!response.ok) {
        lastError = `HTTP ${response.status}`;
        continue;
      }
      const payload = await response.json();
      const extracted = extractModelsFromConfigPayload(payload);
      if (extracted.models.length > 0) {
        return {
          ok: true,
          models: extracted.models,
          agents: extracted.agents,
          source: "v3_config",
          endpoint: UPSTREAM_MODEL_CONFIG_PATH,
          configBaseUrl: baseUrl,
        };
      }
    } catch (error) {
      lastError = String(error instanceof Error ? error.message : error).slice(0, 240);
    }
  }

  return {
    ok: false,
    models: [],
    source: "v3_config",
    endpoint: UPSTREAM_MODEL_CONFIG_PATH,
    error: lastError,
  };
}

export async function fetchCodeBuddyUpstreamModelList(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const baseUrl = resolveModelDiscoveryBaseUrl(options);
  const headers = buildModelDiscoveryHeaders(options);

  const v3 = await fetchCodeBuddyModelsViaV3Config(options);
  if (v3.ok) return v3;

  for (const path of UPSTREAM_MODEL_LIST_PATHS) {
    if (path === UPSTREAM_MODEL_CONFIG_PATH) continue;
    try {
      const response = await fetchImpl(`${normalizeBaseUrl(baseUrl)}${path}`, {
        method: "GET",
        headers,
        signal: options.signal,
      });
      if (!response.ok) continue;
      const payload = await response.json();
      const models = normalizeCodeBuddyModels(payload);
      if (models.length > 0) {
        return {
          ok: true,
          models,
          source: "upstream",
          endpoint: path,
        };
      }
    } catch {
      // try next path
    }
  }

  return { ok: false, models: [], source: "none" };
}

function buildProbeCompletionOptions(options = {}) {
  const transport = options.transport || "protocol_direct";
  const headers = buildModelDiscoveryHeaders({ ...options, transport });

  return {
    transport,
    site: options.site,
    internetEnvironment: options.internetEnvironment,
    baseUrl: options.baseUrl,
    apiEndpoint: options.apiEndpoint,
    chatCompletionsPath: options.chatCompletionsPath,
    bearerToken: options.bearerToken,
    apiKey: options.apiKey,
    token: options.token,
    userId: options.userId,
    headers,
    fetchImpl: options.fetchImpl,
    signal: options.signal,
    stream: false,
    maxCompletionTokens: 8,
  };
}

export async function discoverCodeBuddyModelsByProbe(options = {}) {
  const candidates = Array.isArray(options.candidates) && options.candidates.length
    ? options.candidates
    : getCodeBuddySiteModelCatalog(options.site);
  const completionOptions = buildProbeCompletionOptions(options);
  const verified = [];
  const errors = [];
  const probeMessages = [{ role: "user", content: "Reply with exactly: OK" }];
  const concurrency = Math.max(1, Math.min(Number(options.concurrency || 3), 6));
  const queue = candidates.map((row) => (
    typeof row === "string" ? { id: row, name: row } : row
  ));

  async function worker() {
    while (queue.length > 0) {
      const candidate = queue.shift();
      if (!candidate) return;
      const modelId = String(candidate.id || "").trim();
      if (!modelId) continue;
      try {
        await runCodeBuddyCompletion(probeMessages, {
          ...completionOptions,
          model: modelId,
        });
        verified.push(candidate);
      } catch (error) {
        errors.push({
          modelId,
          message: String(error instanceof Error ? error.message : error).slice(0, 240),
        });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, candidates.length || 1) }, () => worker()));

  return {
    ok: verified.length > 0,
    verified,
    errors,
    source: "probe",
  };
}

export async function listCodeBuddyModelsForAccount(options = {}) {
  const site = normalizeSite(options.site || "global");
  const catalog = getCodeBuddySiteModelCatalog(site);
  const transport = String(options.transport || "protocol_direct").trim().toLowerCase();
  const useDaemon = transport === "cli_daemon";
  const useCliModelDiscovery = useDaemon ||
    options.modelDiscovery === "cli_acp" ||
    options.useCliModelDiscovery === true;
  const hasCredentials = Boolean(
    String(options.bearerToken || "").trim() ||
    String(options.apiKey || "").trim() ||
    String(options.token || "").trim(),
  );

  if (!hasCredentials && !useDaemon) {
    return {
      ok: false,
      site,
      models: toCodeBuddyAdminModels([{ id: "auto", name: "Auto" }], {
        source: "fallback",
        verifiedIds: ["auto"],
      }),
      modelsSource: "no_credentials",
      message: "Complete CodeBuddy OAuth login before listing models.",
    };
  }

  if (options.discover) {
    const discovered = await discoverCodeBuddyModelsByProbe({
      ...options,
      site,
      transport,
      candidates: catalog,
    });
    const verifiedRows = discovered.verified.length > 0
      ? discovered.verified
      : [{ id: "auto", name: "Auto" }];
    return {
      ok: true,
      site,
      models: toCodeBuddyAdminModels(verifiedRows, {
        source: "probe",
        verifiedIds: new Set(verifiedRows.map((row) => row.id)),
      }),
      modelsSource: "probe",
      probeErrors: discovered.errors,
      message: discovered.verified.length
        ? `Verified ${discovered.verified.length} model(s) with live probes.`
        : "No catalog model passed probe; kept auto only.",
    };
  }

  if (useCliModelDiscovery) {
    let daemonError = "";
    try {
      const daemon = await listCodeBuddyDaemonModelsViaAcp({
        daemonBaseUrl: options.daemonBaseUrl,
        serveUrl: options.daemonBaseUrl,
        gatewayPassword: options.gatewayPassword,
        cwd: options.cwd,
        fetchImpl: options.fetchImpl,
        ensureDaemonImpl: options.ensureDaemonImpl,
        signal: options.signal,
        autoStartDaemon: options.autoStartDaemon,
      });
      const rows = daemon.models.length > 0 ? daemon.models : [{ id: "auto", name: "Auto" }];
      return {
        ok: true,
        site,
        models: toCodeBuddyAdminModels(rows, { source: "daemon_acp" }),
        modelsSource: "daemon_acp",
        currentModelId: daemon.currentModelId || "auto",
        currentPublicModelId: toCodeBuddyPublicModelId(daemon.currentModelId || "auto"),
        message: daemon.models.length > 0
          ? `Loaded ${daemon.models.length} model(s) from CodeBuddy CLI ACP session metadata.`
          : "CodeBuddy CLI ACP returned no model list; kept auto only.",
      };
    } catch (error) {
      daemonError = String(error instanceof Error ? error.message : error).slice(0, 240);
    }

    const upstream = await fetchCodeBuddyUpstreamModelList({ ...options, site, transport });
    if (upstream.ok) {
      return {
        ok: true,
        site,
        models: toCodeBuddyAdminModels(upstream.models, { source: upstream.source || "upstream" }),
        modelsSource: upstream.source || "upstream",
        upstreamEndpoint: upstream.endpoint,
        message: daemonError
          ? `CLI ACP failed (${daemonError}); loaded models from ${upstream.endpoint || upstream.source}.`
          : undefined,
      };
    }
  }

  const upstream = await fetchCodeBuddyUpstreamModelList({ ...options, site, transport });
  if (upstream.ok) {
    return {
      ok: true,
      site,
      models: toCodeBuddyAdminModels(upstream.models, { source: upstream.source || "upstream" }),
      modelsSource: upstream.source || "upstream",
      upstreamEndpoint: upstream.endpoint,
      message: upstream.source === "v3_config"
        ? `Loaded ${upstream.models.length} model(s) from ${upstream.endpoint}.`
        : undefined,
    };
  }

  return {
    ok: true,
    site,
    models: toCodeBuddyAdminModels(catalog, {
      source: "site_catalog",
      verifiedIds: new Set(["auto"]),
    }),
    modelsSource: "site_catalog",
    message: upstream.error
      ? `CodeBuddy model config fetch failed (${upstream.error}). Showing auto only.`
      : "CodeBuddy model config unavailable; showing auto only.",
  };
}
