import { randomUUID } from "node:crypto";

import { createProviderTurnAccumulator } from "./provider-events.mjs";
import {
  buildCodeBuddyDaemonHeaders,
  ensureCodeBuddyDaemonRunning,
  getCodeBuddyDaemonConfig,
} from "./codebuddy-cli-daemon.mjs";
import { readCodeBuddyLocalCredential } from "./codebuddy-local-creds.mjs";

function normalizeBaseUrl(value) {
  const text = String(value || "").trim() || "http://127.0.0.1:8080";
  return text.replace(/\/+$/, "");
}

function extractTextContent(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => extractTextContent(part))
      .filter(Boolean)
      .join("\n");
  }
  if (content && typeof content === "object") {
    if (typeof content.text === "string") return content.text;
    if (typeof content.markdown === "string") return content.markdown;
    if (content.content != null) {
      return extractTextContent(content.content);
    }
  }
  return "";
}

function normalizeToolInput(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return JSON.parse(JSON.stringify(value));
  }
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {
      return { input: value };
    }
  }
  return {};
}

function parseJsonMaybe(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function createCodeBuddySseEventParser() {
  let buffer = "";
  let currentEvent = "message";
  let currentData = [];

  const flush = () => {
    const events = [];
    if (currentData.length === 0) return;
    const dataText = currentData.join("\n").trim();
    currentData = [];
    if (!dataText || dataText === "[DONE]") {
      currentEvent = "message";
      return events;
    }
    const data = parseJsonMaybe(dataText);
    events.push({ event: currentEvent, data });
    currentEvent = "message";
    return events;
  };

  const processLine = (rawLine) => {
    const line = String(rawLine || "").replace(/\r$/, "");
    if (!line.trim()) return flush() || [];
    if (line.startsWith("event:")) {
      currentEvent = line.slice(6).trim() || "message";
      return [];
    }
    if (line.startsWith("data:")) {
      currentData.push(line.slice(5).trimStart());
      return [];
    }
    return [];
  };

  return {
    push(chunk) {
      buffer += String(chunk || "");
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      const events = [];
      for (const line of lines) events.push(...processLine(line));
      return events;
    },
    finish() {
      const events = [];
      if (buffer) {
        events.push(...processLine(buffer));
        buffer = "";
      }
      events.push(...(flush() || []));
      return events;
    },
  };
}

function extractSseDataLines(raw) {
  const parser = createCodeBuddySseEventParser();
  return [...parser.push(raw), ...parser.finish()];
}

function normalizeCodeBuddyToolName(update) {
  return String(update?.name || update?.title || update?.toolName || update?.tool || "").trim();
}

function normalizeCodeBuddyModels(input = {}) {
  const root = input?.data && typeof input.data === "object" ? input.data : input;
  const modelRoot = root?.models && typeof root.models === "object" && !Array.isArray(root.models)
    ? root.models
    : root;
  let rows = Array.isArray(modelRoot?.models) ? modelRoot.models : Array.isArray(modelRoot) ? modelRoot : [];
  let allowed = null;
  if (Array.isArray(modelRoot?.availableModels)) {
    const objectRows = modelRoot.availableModels.filter((value) => value && typeof value === "object");
    if (objectRows.length > 0) {
      rows = objectRows;
    } else {
      allowed = new Set(modelRoot.availableModels.map((value) => String(value || "").trim()).filter(Boolean));
    }
  }

  return rows
    .map((row) => ({
      id: String(row?.id || row?.modelId || "").trim(),
      object: "model",
      name: String(row?.name || row?.label || row?.displayName || row?.id || "").trim(),
      owned_by: String(row?.vendor || row?.provider || "codebuddy"),
      supportsTools: Boolean(row?.supportsToolCall || row?.supportsTools),
      supportsImages: Boolean(row?.supportsImages || row?.supportsImage),
    }))
    .filter((row) => row.id)
    .filter((row) => !allowed || allowed.has(row.id));
}

function normalizeOpenAiMessage(message = {}) {
  const source = message && typeof message === "object" ? message : {};
  const normalized = JSON.parse(JSON.stringify(source));
  normalized.role = String(source?.role || "user").trim() || "user";
  normalized.content = normalizeCodeBuddyMessageContent(source?.content);
  return normalized;
}

function normalizeCodeBuddyContentPart(part) {
  if (typeof part === "string") return { type: "text", text: part };
  if (!part || typeof part !== "object") return null;
  if (typeof part.type === "string") {
    const normalized = JSON.parse(JSON.stringify(part));
    if (normalized.type === "text" && typeof normalized.text !== "string") {
      normalized.text = extractTextContent(normalized.content ?? normalized.value ?? "");
    }
    return normalized;
  }
  const text = extractTextContent(part);
  return text ? { type: "text", text } : null;
}

function normalizeCodeBuddyMessageContent(content) {
  if (Array.isArray(content)) {
    return content
      .map(normalizeCodeBuddyContentPart)
      .filter(Boolean);
  }
  const part = normalizeCodeBuddyContentPart(content);
  return part ? [part] : [];
}

function normalizeOpenAiMessages(messages = []) {
  return (Array.isArray(messages) ? messages : [])
    .map(normalizeOpenAiMessage)
    .filter((message) => (
      (Array.isArray(message.content) && message.content.length > 0) ||
      (Array.isArray(message.tool_calls) && message.tool_calls.length > 0) ||
      Boolean(message.tool_call_id || message.name)
    ));
}

function flattenCodeBuddyCloudContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) {
    const text = extractTextContent(content);
    return text;
  }
  const hasStructured = content.some((part) => part && typeof part === "object" && part.type && part.type !== "text");
  if (hasStructured) return content;
  const text = content
    .map((part) => (typeof part === "string" ? part : (part?.type === "text" ? String(part.text || "") : extractTextContent(part))))
    .filter(Boolean)
    .join("");
  return text;
}

function formatCodeBuddyCloudMessage(message = {}) {
  const role = String(message?.role || "user").trim() || "user";
  const out = { role };
  if (Array.isArray(message?.tool_calls) && message.tool_calls.length > 0) {
    out.tool_calls = message.tool_calls;
  }
  if (message.tool_call_id) out.tool_call_id = message.tool_call_id;
  if (message.name) out.name = message.name;
  const flat = flattenCodeBuddyCloudContent(message.content);
  if (typeof flat === "string") {
    out.content = flat;
  } else if (flat != null) {
    out.content = flat;
  } else {
    out.content = "";
  }
  return out;
}

export function ensureCodeBuddyUpstreamMessages(messages = []) {
  const normalized = normalizeOpenAiMessages(messages).map(formatCodeBuddyCloudMessage);
  // Upstream global chat often returns 11101 for user-only payloads (e.g. Sub2API
  // connection tests that send just "hi"). Inject a minimal system message.
  const hasSystem = normalized.some((message) => String(message?.role || "").toLowerCase() === "system");
  if (!hasSystem && normalized.length > 0) {
    return [
      { role: "system", content: "You are a helpful assistant." },
      ...normalized,
    ];
  }
  return normalized;
}

export function isCodeBuddyUpstreamDebugEnabled() {
  const value = String(
    process.env.CURSOR_DIRECT_CODEBUDDY_DEBUG_REQUEST ||
    process.env.CODEBUDDY_DEBUG_REQUEST ||
    "",
  ).trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(value);
}

export function summarizeCodeBuddyUpstreamRequest(request = {}) {
  const headers = request.headers && typeof request.headers === "object" ? request.headers : {};
  const safeHeaders = {};
  for (const [key, value] of Object.entries(headers)) {
    if (/authorization|api-key|cookie|secret|token/i.test(key)) {
      safeHeaders[key] = "<redacted>";
    } else {
      safeHeaders[key] = value;
    }
  }
  return {
    method: request.method || "POST",
    url: request.url || "",
    headers: safeHeaders,
    body: request.body && typeof request.body === "object" ? request.body : {},
  };
}

function logCodeBuddyUpstreamRequest(request = {}) {
  if (!isCodeBuddyUpstreamDebugEnabled()) return;
  console.error("[codebuddy-upstream]", JSON.stringify(summarizeCodeBuddyUpstreamRequest(request)));
}

function resolveCodeBuddyHost(baseUrl) {
  try {
    return new URL(normalizeBaseUrl(baseUrl)).host || "www.codebuddy.ai";
  } catch {
    return "www.codebuddy.ai";
  }
}

function isCodeBuddyDomesticTarget(options = {}) {
  const site = String(options.site || options.codeBuddySite || "").trim().toLowerCase();
  const internetEnvironment = String(options.internetEnvironment || options.internet_environment || "").trim().toLowerCase();
  const baseUrl = String(options.baseUrl || "").trim().toLowerCase();
  return (
    ["domestic", "cn", "china", "internal", "ioa"].includes(site) ||
    ["domestic", "cn", "china", "internal", "ioa"].includes(internetEnvironment) ||
    baseUrl.includes("codebuddy.cn") ||
    baseUrl.includes("copilot.tencent.com")
  );
}

function joinCodeBuddyChatEndpoint(baseUrl, path = "/v2/chat/completions") {
  const base = normalizeBaseUrl(baseUrl);
  let suffix = normalizeCodeBuddyChatCompletionsPath(path);
  if (base.endsWith("/v2") && suffix.startsWith("/v2/")) {
    suffix = suffix.slice(3);
  }
  return `${base}${suffix}`;
}

export function resolveCodeBuddyProtocolDirectBaseUrl(options = {}) {
  const configured = String(options.baseUrl || "").trim();
  if (configured) {
    const normalized = normalizeBaseUrl(configured);
    const host = resolveCodeBuddyHost(normalized);
    if (host === "www.codebuddy.cn" || host.endsWith(".codebuddy.cn")) {
      return "https://copilot.tencent.com";
    }
    return normalized;
  }
  return isCodeBuddyDomesticTarget(options) ? "https://copilot.tencent.com" : "https://www.codebuddy.ai";
}

export function resolveCodeBuddyProtocolDirectEndpoint(options = {}) {
  const endpoint = String(options.apiEndpoint || options.endpoint || options.chatEndpoint || "").trim();
  if (endpoint) return endpoint.replace(/\/+$/, "");
  return joinCodeBuddyChatEndpoint(
    resolveCodeBuddyProtocolDirectBaseUrl(options),
    options.chatCompletionsPath || options.endpointPath || "/v2/chat/completions",
  );
}

function resolveCodeBuddyProtocolDirectDomain(options = {}) {
  const explicit = String(options.domain || options.xDomain || options["x-domain"] || "").trim();
  if (explicit) return explicit;
  try {
    return new URL(resolveCodeBuddyProtocolDirectEndpoint(options)).host;
  } catch {
    return isCodeBuddyDomesticTarget(options) ? "copilot.tencent.com" : "www.codebuddy.ai";
  }
}

function normalizeCodeBuddyTransportAlias(value) {
  const text = String(value || "").trim().toLowerCase();
  if (["protocol_direct", "protocol-direct", "direct", "cloud_direct", "cloud-direct"].includes(text)) return "protocol_direct";
  if (text === "cloud") return "cloud";
  if (["cli_daemon", "cli-daemon", "daemon"].includes(text)) return "cli_daemon";
  return "";
}

export function buildCodeBuddyProtocolDirectHeaders(options = {}) {
  const bearerToken = String(options.bearerToken || options.bearer_token || options.token || "").trim();
  const domain = resolveCodeBuddyProtocolDirectDomain(options);
  const requestId = String(options.requestId || randomUUID().replace(/-/g, ""));
  const headers = {
    accept: "text/event-stream, application/json",
    "content-type": "application/json",
    "x-requested-with": "XMLHttpRequest",
    "x-stainless-arch": "x64",
    "x-stainless-lang": "js",
    "x-stainless-os": process.platform === "win32" ? "Windows" : (process.platform === "darwin" ? "MacOS" : "Linux"),
    "x-stainless-package-version": "5.10.1",
    "x-stainless-retry-count": "0",
    "x-stainless-runtime": "node",
    "x-stainless-runtime-version": process.version,
    "x-conversation-id": String(options.conversationId || randomUUID()),
    "x-conversation-request-id": String(options.conversationRequestId || requestId),
    "x-conversation-message-id": String(options.conversationMessageId || randomUUID().replace(/-/g, "")),
    "x-request-id": requestId,
    "x-agent-intent": "craft",
    "x-ide-type": "CLI",
    "x-ide-name": "CLI",
    "x-ide-version": String(options.ideVersion || "1.0.7"),
    "x-domain": domain,
    "user-agent": `CLI/${String(options.ideVersion || "1.0.7")} CodeBuddy/${String(options.ideVersion || "1.0.7")}`,
    "x-product": "SaaS",
    "x-user-id": String(options.userId || options.user_id || "anonymous"),
  };
  if (options.enterpriseId) {
    headers["x-enterprise-id"] = String(options.enterpriseId);
    headers["x-tenant-id"] = String(options.tenantId || options.enterpriseId);
  }
  if (options.departmentFullName) headers["x-department-info"] = String(options.departmentFullName);
  if (bearerToken) headers.authorization = `Bearer ${bearerToken}`;
  return headers;
}

/** Headers aligned with Sliverkiss/CodeBuddy2api cloud client (not local daemon). */
export function buildCodeBuddyCloudHeaders(options = {}) {
  const bearerToken = String(options.bearerToken || options.bearer_token || "").trim();
  const apiKey = String(options.apiKey || "").trim();
  const legacyToken = !bearerToken && !apiKey ? String(options.token || "").trim() : "";
  const useApiKey = Boolean(
    apiKey ||
    (legacyToken && /^ck[_-]/i.test(legacyToken)),
  );
  const authToken = bearerToken || (useApiKey ? (apiKey || legacyToken) : legacyToken);
  const domain = resolveCodeBuddyHost(options.baseUrl || "https://www.codebuddy.ai");
  const headers = {
    accept: "application/json",
    "content-type": "application/json",
    "x-requested-with": "XMLHttpRequest",
    "x-stainless-arch": "x64",
    "x-stainless-lang": "js",
    "x-stainless-os": process.platform === "win32" ? "Windows" : (process.platform === "darwin" ? "MacOS" : "Linux"),
    "x-stainless-package-version": "5.10.1",
    "x-stainless-retry-count": "0",
    "x-stainless-runtime": "node",
    "x-stainless-runtime-version": process.version,
    "x-conversation-id": String(options.conversationId || randomUUID()),
    "x-conversation-request-id": String(options.conversationRequestId || randomUUID().replace(/-/g, "")),
    "x-conversation-message-id": String(options.conversationMessageId || randomUUID().replace(/-/g, "")),
    "x-request-id": String(options.requestId || randomUUID().replace(/-/g, "")),
    "x-agent-intent": "craft",
    "x-ide-type": "CLI",
    "x-ide-name": "CLI",
    "x-ide-version": "1.0.7",
    "x-domain": domain,
    "user-agent": "CLI/1.0.7 CodeBuddy/1.0.7",
    "x-product": "SaaS",
    "x-user-id": String(options.userId || "anonymous"),
  };
  if (authToken) {
    headers.authorization = `Bearer ${authToken}`;
    if (useApiKey) {
      headers["X-API-Key"] = apiKey || legacyToken;
    }
  }
  headers["X-CodeBuddy-Request"] = "1";
  return headers;
}

export function createCodeBuddyHeaders(options = {}) {
  const headers = {
    accept: "application/json",
    "content-type": "application/json",
  };

  if (options.exemptRequestHeader !== true && options.includeRequestHeader !== false) {
    headers["x-codebuddy-request"] = "1";
  }

  if (options.token) {
    headers.authorization = `Bearer ${String(options.token).trim()}`;
  }

  return headers;
}

function normalizeCodeBuddyChatCompletionsPath(value) {
  const text = String(value || "/v2/chat/completions").trim();
  if (!text) return "/v2/chat/completions";
  return text.startsWith("/") ? text : `/${text}`;
}

function resolveCodeBuddyChatEndpoint(options = {}) {
  const endpoint = String(options.apiEndpoint || options.endpoint || options.chatEndpoint || "").trim();
  if (endpoint) return endpoint.replace(/\/+$/, "");
  return `${normalizeBaseUrl(options.baseUrl)}${normalizeCodeBuddyChatCompletionsPath(
    options.chatCompletionsPath || options.endpointPath,
  )}`;
}

export function buildCodeBuddyRunRequest(messages = [], options = {}) {
  const bearerToken = String(options.bearerToken || "").trim();
  const apiKey = String(options.apiKey || "").trim();
  const token = String(options.token || "").trim();
  const transport = normalizeCodeBuddyTransportAlias(options.transport || options.codeBuddyTransport || "");
  const protocolDirect = transport === "protocol_direct";
  const baseHeaders = protocolDirect
    ? buildCodeBuddyProtocolDirectHeaders({
      ...options,
      bearerToken: bearerToken || token,
    })
    : bearerToken || apiKey || token
    ? buildCodeBuddyCloudHeaders({
      bearerToken,
      apiKey,
      token: bearerToken ? "" : token,
      baseUrl: options.baseUrl,
      conversationId: options.conversationId,
      conversationRequestId: options.conversationRequestId,
      conversationMessageId: options.conversationMessageId,
      requestId: options.requestId,
      userId: options.userId,
    })
    : createCodeBuddyHeaders({ token: options.token, includeRequestHeader: options.includeRequestHeader });
  const normalizedMessages = ensureCodeBuddyUpstreamMessages(messages);
  const maxCompletionTokens = Number(options.maxCompletionTokens ?? options.maxTokens ?? 0);
  const stream = options.stream !== false && options.stream !== "false";
  const request = {
    method: "POST",
    url: protocolDirect ? resolveCodeBuddyProtocolDirectEndpoint(options) : resolveCodeBuddyChatEndpoint(options),
    headers: {
      ...baseHeaders,
      ...(options.headers && typeof options.headers === "object" ? options.headers : {}),
    },
    body: {
      model: options.model || "auto",
      messages: normalizedMessages,
      stream,
      ...(protocolDirect && stream ? { stream_options: { include_usage: true } } : {}),
      ...(maxCompletionTokens > 0 ? { max_completion_tokens: maxCompletionTokens } : {}),
      ...(options.tools ? { tools: options.tools } : {}),
      ...(options.toolChoice ? { tool_choice: options.toolChoice } : {}),
    },
  };
  logCodeBuddyUpstreamRequest(request);
  return request;
}

function createProviderEventFromAcpUpdate(update = {}, sessionId = "") {
  const sessionUpdate = String(update?.sessionUpdate || update?.type || "").trim();
  if (sessionUpdate === "agent_message_chunk") {
    const text = extractTextContent(update.content ?? update.text ?? update.delta ?? "");
    return text ? [{
      type: "text_delta",
      text,
      source: "codebuddy_acp",
      sessionId,
    }] : [];
  }

  if (sessionUpdate === "agent_thought_chunk") {
    const text = extractTextContent(update.content ?? update.text ?? update.delta ?? "");
    return text ? [{
      type: "thinking_delta",
      text,
      source: "codebuddy_acp",
      sessionId,
    }] : [];
  }

  if (sessionUpdate === "tool_call") {
    const toolName = normalizeCodeBuddyToolName(update);
    return [{
      type: "tool_use",
      id: String(update?.toolCallId || update?.tool_call_id || update?.id || `call_${Date.now()}`),
      name: toolName,
      input: normalizeToolInput(update.rawInput ?? update.input ?? update.arguments ?? {}),
      source: "codebuddy_acp",
      status: update?.status || "pending",
    }];
  }

  if (sessionUpdate === "tool_call_update") {
    const content = extractTextContent(update.content ?? update.result ?? update.output ?? "");
    if (content) {
      return [{
        type: "tool_result",
        tool_use_id: String(update?.toolCallId || update?.tool_call_id || update?.id || ""),
        content,
        source: "codebuddy_acp",
        status: update?.status || "",
      }];
    }
    return [{
      type: "tool_call_delta",
      index: 0,
      id: String(update?.toolCallId || update?.tool_call_id || update?.id || ""),
      name: toolNameOrFallback(update),
      input: normalizeToolInput(update.rawInput ?? update.input ?? update.arguments ?? {}),
      source: "codebuddy_acp",
      status: update?.status || "",
    }];
  }

  if (sessionUpdate === "session_end" || sessionUpdate === "agent_message_end") {
    return [{ type: "turn_ended", source: "codebuddy_acp", sessionId }];
  }

  return [];
}

function toolNameOrFallback(update = {}) {
  const name = normalizeCodeBuddyToolName(update);
  return name || "tool";
}

export function mapCodeBuddyAcpMessageToProviderEvents(message = {}) {
  const sessionId = String(message?.params?.sessionId || message?.params?.session_id || "");
  if (message?.error && typeof message.error === "object") {
    const text = firstTextValue(
      message.error.message,
      message.error.reason,
      message.error.detail,
      message.error.description,
      message.error.code != null ? `CodeBuddy ACP error (${message.error.code})` : "",
    );
    return [{
      type: "upstream_error",
      message: text || "CodeBuddy ACP error",
      source: "codebuddy_acp",
    }];
  }

  if (String(message?.method || "").trim() === "session/update") {
    const update = message?.params?.update || message?.params?.sessionUpdate || {};
    return createProviderEventFromAcpUpdate(update, sessionId);
  }

  if (message && typeof message === "object" && message.result && typeof message.result === "object") {
    const stopReason = String(message.result.stopReason || message.result.stop_reason || "").trim();
    if (stopReason) {
      return [{ type: "turn_ended", stopReason, source: "codebuddy_acp" }];
    }
  }

  return [];
}

function unwrapCodeBuddyPayload(data) {
  if (!data || typeof data !== "object") return data;
  if (data.jsonrpc || data.method) return data;
  if (data.data && typeof data.data === "object") return unwrapCodeBuddyPayload(data.data);
  if (data.result && typeof data.result === "object") return unwrapCodeBuddyPayload(data.result);
  return data;
}

function firstTextValue(...values) {
  for (const value of values) {
    const text = extractTextContent(value).trim();
    if (text) return text;
  }
  return "";
}

function isCodeBuddyErrorStatus(value) {
  const text = String(value || "").trim().toLowerCase();
  return ["error", "failed", "failure", "timeout", "timed_out"].includes(text);
}

function describeCodeBuddySseError(data = {}) {
  const error = data?.error;
  if (typeof error === "string" && error.trim()) return withCodeBuddyErrorHint(error.trim(), data, 0);
  if (error && typeof error === "object") {
    const text = firstTextValue(error.message, error.msg, error.reason, error.detail, error.description, error.error);
    if (text) return withCodeBuddyErrorHint(text, data, 0);
  }
  const text = firstTextValue(data.message, data.msg, data.reason, data.detail, data.description, data.statusText);
  if (text) return withCodeBuddyErrorHint(text, data, 0);
  if (data.code != null) return withCodeBuddyErrorHint(`CodeBuddy upstream error (${data.code})`, data, 0);
  return "CodeBuddy upstream error";
}

function mapOpenAiLikeDeltaToProviderEvents(payload = {}) {
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const delta = choices[0]?.delta || choices[0]?.message || {};
  const events = [];
  const text = firstTextValue(delta.content, delta.text);
  if (text) events.push({ type: "text_delta", text, source: "codebuddy_openai" });

  const toolCalls = Array.isArray(delta.tool_calls) ? delta.tool_calls : [];
  for (const toolCall of toolCalls) {
    events.push({
      type: "tool_call_delta",
      index: Number.isInteger(toolCall.index) ? toolCall.index : 0,
      id: typeof toolCall.id === "string" ? toolCall.id : "",
      name: typeof toolCall.function?.name === "string" ? toolCall.function.name : "",
      argumentsDelta: typeof toolCall.function?.arguments === "string" ? toolCall.function.arguments : "",
      source: "codebuddy_openai",
    });
  }

  const finishReason = choices[0]?.finish_reason || choices[0]?.finishReason;
  if (finishReason) {
    events.push({
      type: "turn_ended",
      stopReason: String(finishReason) === "tool_calls" ? "tool_use" : String(finishReason),
      source: "codebuddy_openai",
    });
  }
  return events;
}

function mapOpenAiLikeMessageToProviderEvents(payload = {}) {
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const message = choices[0]?.message || choices[0]?.delta || {};
  const events = [];
  const text = firstTextValue(message.content, message.text, payload.output_text);
  if (text) events.push({ type: "text_delta", text, source: "codebuddy_openai" });

  const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  for (const toolCall of toolCalls) {
    events.push({
      type: "tool_use",
      id: typeof toolCall.id === "string" ? toolCall.id : `call_${Date.now()}`,
      name: typeof toolCall.function?.name === "string" ? toolCall.function.name : "",
      input: normalizeToolInput(toolCall.function?.arguments ?? {}),
      source: "codebuddy_openai",
    });
  }

  const finishReason = choices[0]?.finish_reason || choices[0]?.finishReason;
  if (finishReason) events.push({ type: "turn_ended", stopReason: String(finishReason), source: "codebuddy_openai" });
  return events;
}

export function mapCodeBuddySseEventToProviderEvents(sseEvent = {}) {
  const data = unwrapCodeBuddyPayload(sseEvent.data);
  if (!data || typeof data !== "object") {
    const text = firstTextValue(data);
    return text ? [{ type: "text_delta", text, source: "codebuddy_sse" }] : [];
  }

  const acpEvents = mapCodeBuddyAcpMessageToProviderEvents(data);
  if (acpEvents.length > 0) return acpEvents;

  if (Array.isArray(data.choices)) return mapOpenAiLikeDeltaToProviderEvents(data);

  const kind = String(data.sessionUpdate || data.type || data.event || sseEvent.event || "").trim();
  const status = String(data.status || data.state || "").trim();
  if (kind !== "tool_result" && (data.error || kind === "error" || isCodeBuddyErrorStatus(status))) {
    return [{
      type: "upstream_error",
      message: describeCodeBuddySseError(data),
      source: "codebuddy_sse",
    }];
  }
  if (kind === "agent_message_chunk" || kind === "message" || kind === "text_delta" || kind === "delta") {
    const text = firstTextValue(data.content, data.text, data.delta, data.message);
    return text ? [{ type: "text_delta", text, source: "codebuddy_sse" }] : [];
  }
  if (kind === "agent_thought_chunk" || kind === "thinking_delta") {
    const text = firstTextValue(data.content, data.text, data.delta, data.thought);
    return text ? [{ type: "thinking_delta", text, source: "codebuddy_sse" }] : [];
  }
  if (kind === "tool_call" || kind === "tool_use") {
    return [{
      type: "tool_use",
      id: String(data.toolCallId || data.tool_call_id || data.id || `call_${Date.now()}`),
      name: normalizeCodeBuddyToolName(data),
      input: normalizeToolInput(data.rawInput ?? data.input ?? data.arguments ?? data.args ?? {}),
      source: "codebuddy_sse",
    }];
  }
  if (kind === "tool_call_delta") {
    return [{
      type: "tool_call_delta",
      index: Number.isInteger(data.index) ? data.index : 0,
      id: String(data.toolCallId || data.tool_call_id || data.id || ""),
      name: normalizeCodeBuddyToolName(data),
      argumentsDelta: typeof data.argumentsDelta === "string" ? data.argumentsDelta : "",
      input: normalizeToolInput(data.input ?? data.rawInput ?? {}),
      source: "codebuddy_sse",
    }];
  }
  if (kind === "tool_result") {
    return [{
      type: "tool_result",
      tool_use_id: String(data.toolCallId || data.tool_call_id || data.tool_use_id || data.id || ""),
      content: firstTextValue(data.content, data.result, data.output),
      source: "codebuddy_sse",
      status: String(data.status || ""),
    }];
  }
  if (kind === "session_end" || kind === "done" || kind === "completed" || kind === "agent_message_end") {
    return [{ type: "turn_ended", source: "codebuddy_sse" }];
  }

  return [];
}

export function parseCodeBuddySseEvents(text = "") {
  return extractSseDataLines(text);
}

async function readResponseText(response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

async function readJsonResponse(response) {
  const text = await readResponseText(response);
  if (!text.trim()) return {};
  const parsed = parseJsonMaybe(text);
  return parsed && typeof parsed === "object" ? parsed : {};
}

function getCodeBuddyErrorHint(payload = {}, status = 0, messageText = "") {
  const code = payload?.code;
  const combined = [
    payload?.msg,
    payload?.message,
    payload?.error,
    messageText,
  ].map((value) => (typeof value === "string" ? value : "")).join("\n");
  if (code === 11140 || /request illegal/i.test(combined)) {
    return "For cli_daemon, verify the CodeBuddy account and daemon region match (domestic/global), set CURSOR_DIRECT_CODEBUDDY_SITE and CODEBUDDY_INTERNET_ENVIRONMENT accordingly, then restart codebuddy --serve. If transport=cloud, this credential likely cannot call /v2/chat/completions directly.";
  }
  if (status === 401 || /invalid_secret/i.test(String(payload?.message || ""))) {
    return "认证失败：勿同时发送重复的 x-api-key 头；仅使用 Bearer 与 X-API-Key 各一份。";
  }
  return "";
}

function withCodeBuddyErrorHint(message, payload = {}, status = 0) {
  const text = String(message || "").trim();
  const hint = getCodeBuddyErrorHint(payload, status, text);
  return hint && !text.includes(hint) ? `${text} - ${hint}` : text;
}

function getCodeBuddyErrorMessage(payload = {}, fallback = "CodeBuddy upstream error", status = 0) {
  let message = fallback;
  if (payload?.error && typeof payload.error === "object") {
    message = String(payload.error.message || payload.error.code || fallback);
  } else if (typeof payload?.error === "string") {
    message = payload.error;
  } else if (typeof payload?.message === "string") {
    message = payload.message;
  } else if (payload?.code != null && payload?.msg) {
    message = `${payload.msg} (code ${payload.code})`;
  }
  return withCodeBuddyErrorHint(message, payload, status);
}

function extractCodeBuddyRunId(payload = {}) {
  const root = unwrapCodeBuddyPayload(payload);
  return String(
    root?.runId ||
    root?.run_id ||
    root?.id ||
    root?.run?.id ||
    root?.run?.runId ||
    "",
  ).trim();
}

function extractCodeBuddyStreamUrl(payload = {}, options = {}) {
  const root = unwrapCodeBuddyPayload(payload);
  const url = String(root?.streamUrl || root?.stream_url || root?.urls?.stream || "").trim();
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  return `${normalizeBaseUrl(options.baseUrl)}${url.startsWith("/") ? "" : "/"}${url}`;
}

async function readCodeBuddyStreamResponse(response, options = {}) {
  const parser = createCodeBuddySseEventParser();
  const accumulator = options.accumulator || createProviderTurnAccumulator();
  const started = Date.now();
  let bytes = 0;
  let eventCount = 0;
  let deltaCount = 0;
  const pushText = (text) => {
    if (!text) return;
    deltaCount += 1;
    options.onDelta?.(text);
  };
  const pushProviderEvents = (providerEvents) => {
    for (const event of providerEvents) {
      accumulator.push(event);
      options.onEvent?.(event);
      if (event.type === "text_delta") pushText(event.text ?? event.delta ?? "");
    }
  };
  const pushSseEvents = (sseEvents) => {
    for (const sseEvent of sseEvents) {
      eventCount += 1;
      pushProviderEvents(mapCodeBuddySseEventToProviderEvents(sseEvent));
    }
  };

  if (!response.body || typeof response.body.getReader !== "function") {
    const text = await readResponseText(response);
    bytes += Buffer.byteLength(text, "utf8");
    pushSseEvents(parser.push(text));
    pushSseEvents(parser.finish());
    return { turn: accumulator.snapshot(options), durationMs: Date.now() - started, bytes, eventCount, deltaCount };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value?.byteLength || 0;
    pushSseEvents(parser.push(decoder.decode(value, { stream: true })));
  }
  const trailing = decoder.decode();
  if (trailing) pushSseEvents(parser.push(trailing));
  pushSseEvents(parser.finish());

  return { turn: accumulator.snapshot(options), durationMs: Date.now() - started, bytes, eventCount, deltaCount };
}

function hasCodeBuddyAssistantOutput(turn = {}) {
  return Boolean(
    String(turn?.text || "").trim() ||
    (Array.isArray(turn?.toolUses) && turn.toolUses.length > 0)
  );
}

function assertCodeBuddyAssistantOutput(streamResult = {}, options = {}) {
  if (options.requireOutput === false) return;
  const turn = streamResult.turn || {};
  if (hasCodeBuddyAssistantOutput(turn)) return;
  const eventCount = Number(streamResult.eventCount || 0);
  const detail = eventCount > 0 ? ` after ${eventCount} SSE event(s)` : " before any SSE event";
  throw new Error(`CodeBuddy CLI stream completed with no assistant output${detail}; check CodeBuddy CLI authentication state.`);
}

export function resolveCodeBuddyTransport(options = {}) {
  const explicit = normalizeCodeBuddyTransportAlias(options.transport || options.codeBuddyTransport || "");
  if (explicit) return explicit;
  const env = compactText(
    process.env.CURSOR_DIRECT_CODEBUDDY_TRANSPORT ||
    process.env.CODEBUDDY_TRANSPORT ||
    "cli_daemon",
  ).toLowerCase();
  const envTransport = normalizeCodeBuddyTransportAlias(env);
  if (envTransport) return envTransport;
  if (env === "cloud") return "cloud";
  if (options.forceCloud === true) return "cloud";
  if (options.forceProtocolDirect === true) return "protocol_direct";
  if (options.apiEndpoint && /\/v2\/chat\/completions/i.test(String(options.apiEndpoint))) {
    return options.preferCloud === true ? "cloud" : "cli_daemon";
  }
  return "cli_daemon";
}

function compactText(value) {
  return String(value || "").trim();
}

function messagesToCliRunText(messages = []) {
  const normalized = ensureCodeBuddyUpstreamMessages(messages);
  const parts = [];
  for (const message of normalized) {
    const role = compactText(message?.role || "user");
    const content = extractTextContent(message?.content ?? message?.text ?? "");
    if (!content) continue;
    parts.push(`${role}: ${content}`);
  }
  return parts.join("\n\n").trim();
}

function resolveCodeBuddyDaemonSenderContext(options = {}) {
  const directUserId = compactText(options.userId || options.senderId || options.user_id || "");
  if (directUserId) {
    return {
      userId: directUserId,
      senderName: compactText(options.senderName || options.userName || "Gateway"),
    };
  }
  const local = readCodeBuddyLocalCredential(options);
  if (local.ok) {
    const credential = local.credential || {};
    const userId = compactText(credential.user_id || credential.userId || "");
    const userInfo = credential.user_info && typeof credential.user_info === "object"
      ? credential.user_info
      : {};
    if (userId) {
      return {
        userId,
        senderName: compactText(
          options.senderName ||
          userInfo.name ||
          userInfo.nickname ||
          userInfo.email ||
          "Gateway",
        ),
      };
    }
  }
  return {
    userId: "cursor-direct-gateway",
    senderName: compactText(options.senderName || "Gateway"),
  };
}

function resolveCodeBuddyDaemonRunTimeoutMs(options = {}) {
  const value = Number(
    options.runTimeoutMs ??
    options.daemonRunTimeoutMs ??
    process.env.CURSOR_DIRECT_CODEBUDDY_RUN_TIMEOUT_MS ??
    process.env.CODEBUDDY_RUN_TIMEOUT_MS ??
    0,
  );
  if (!Number.isFinite(value) || value < 0) return 0;
  return value;
}

export function resolveCodeBuddyDaemonProtocol(options = {}) {
  const explicit = compactText(
    options.daemonProtocol ||
    options.cliDaemonProtocol ||
    process.env.CURSOR_DIRECT_CODEBUDDY_DAEMON_PROTOCOL ||
    process.env.CODEBUDDY_DAEMON_PROTOCOL ||
    "",
  ).toLowerCase();
  if (["runs", "run", "gateway"].includes(explicit)) return "runs";
  if (["acp", "agent_client_protocol"].includes(explicit)) return "acp";
  return "runs";
}

export function buildCodeBuddyDaemonRunBody(messages = [], options = {}) {
  const text = messagesToCliRunText(messages);
  if (!text) throw new Error("CodeBuddy CLI run requires at least one non-empty message");
  const sender = resolveCodeBuddyDaemonSenderContext(options);
  const messageId = compactText(options.messageId) || randomUUID();
  const conversationId = compactText(options.conversationId || options.sessionId) || messageId;
  const conversationType = compactText(options.conversationType) || "direct";
  const body = {
    id: messageId,
    type: compactText(options.messageType) || "text",
    text,
    sender: {
      id: sender.userId,
      name: sender.senderName,
    },
    source: {
      platform: "generic",
      sender: {
        id: sender.userId,
        name: sender.senderName,
      },
      conversation: {
        id: conversationId,
        type: conversationType,
      },
    },
    payload: {
      text,
    },
  };
  const timeoutMs = resolveCodeBuddyDaemonRunTimeoutMs(options);
  if (timeoutMs > 0) body.timeoutMs = timeoutMs;
  const model = compactText(options.model || "");
  if (model && model !== "auto") body.model = model.replace(/^codebuddy\//i, "");
  return body;
}

async function collectCodeBuddySseEvents(response) {
  const parser = createCodeBuddySseEventParser();
  let bytes = 0;
  let text = "";
  const events = [];
  const push = (chunk) => {
    if (!chunk) return;
    text += chunk;
    bytes += Buffer.byteLength(chunk, "utf8");
    events.push(...parser.push(chunk));
  };

  if (!response.body || typeof response.body.getReader !== "function") {
    push(await readResponseText(response));
  } else {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      push(decoder.decode(value, { stream: true }));
    }
    push(decoder.decode());
  }
  events.push(...parser.finish());
  return { events, text, bytes };
}

function getCodeBuddyAcpRpcMessage(events = [], rpcId) {
  const target = String(rpcId);
  for (const event of events) {
    const data = unwrapCodeBuddyPayload(event?.data);
    if (data && typeof data === "object" && String(data.id) === target) return data;
  }
  return null;
}

function getCodeBuddyAcpErrorMessage(payload = {}, fallback = "CodeBuddy ACP error") {
  const error = payload?.error;
  if (typeof error === "string" && error.trim()) return error.trim();
  if (error && typeof error === "object") {
    return firstTextValue(
      error.message,
      error.reason,
      error.detail,
      error.description,
      error.code != null ? `CodeBuddy ACP error (${error.code})` : "",
    ) || fallback;
  }
  return firstTextValue(payload?.message, payload?.msg, payload?.detail, payload?.description) || fallback;
}

async function readCodeBuddyAcpRpcResponse(response, rpcId, method = "request") {
  const collected = await collectCodeBuddySseEvents(response);
  if (!response.ok) {
    const parsed = parseJsonMaybe(collected.text);
    const message = parsed && typeof parsed === "object"
      ? getCodeBuddyAcpErrorMessage(parsed, `${method} failed`)
      : (collected.text.trim() || `${method} failed`);
    throw new Error(`CodeBuddy ACP ${method} failed with ${response.status}: ${message.slice(0, 400)}`);
  }

  const rpcMessage = getCodeBuddyAcpRpcMessage(collected.events, rpcId);
  if (!rpcMessage) {
    throw new Error(`CodeBuddy ACP ${method} returned no JSON-RPC response`);
  }
  if (rpcMessage.error) {
    throw new Error(`CodeBuddy ACP ${method} failed: ${getCodeBuddyAcpErrorMessage(rpcMessage).slice(0, 400)}`);
  }
  return {
    result: rpcMessage.result || {},
    events: collected.events,
    bytes: collected.bytes,
  };
}

async function postCodeBuddyAcpRpc(baseUrl, headers, rpcId, method, params, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const response = await fetchImpl(`${baseUrl}/api/v1/acp`, {
    method: "POST",
    headers: {
      ...headers,
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: rpcId,
      method,
      params: params || {},
    }),
    signal: options.signal,
  });
  return readCodeBuddyAcpRpcResponse(response, rpcId, method);
}

async function disconnectCodeBuddyAcp(baseUrl, headers, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  try {
    await fetchImpl(`${baseUrl}/api/v1/acp`, {
      method: "DELETE",
      headers,
      signal: options.signal,
    });
  } catch {
    // best-effort cleanup
  }
}

export async function listCodeBuddyDaemonModelsViaAcp(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new Error("fetch is not available for CodeBuddy provider");

  const ensureDaemon = options.ensureDaemonImpl || ensureCodeBuddyDaemonRunning;
  const daemonConfig = getCodeBuddyDaemonConfig(options);
  await ensureDaemon({
    ...options,
    serveUrl: options.daemonBaseUrl || options.serveUrl || daemonConfig.serveUrl,
    autoStart: options.autoStartDaemon !== false,
  });

  const baseUrl = normalizeBaseUrl(options.daemonBaseUrl || options.serveUrl || daemonConfig.serveUrl);
  const baseHeaders = {
    ...buildCodeBuddyDaemonHeaders({
      gatewayPassword: options.gatewayPassword || daemonConfig.gatewayPassword,
    }),
    ...(options.headers && typeof options.headers === "object" ? options.headers : {}),
  };
  const connectResponse = await fetchImpl(`${baseUrl}/api/v1/acp/connect`, {
    method: "POST",
    headers: {
      ...baseHeaders,
      accept: "application/json",
    },
    signal: options.signal,
  });
  const connectPayload = await readJsonResponse(connectResponse);
  if (!connectResponse.ok) {
    throw new Error(`CodeBuddy ACP connect failed with ${connectResponse.status}: ${getCodeBuddyErrorMessage(connectPayload, "connect failed", connectResponse.status).slice(0, 400)}`);
  }
  const connectionId = compactText(connectPayload.connectionId || connectPayload.data?.connectionId || "");
  if (!connectionId) throw new Error("CodeBuddy ACP connect returned no connectionId");

  const acpHeaders = {
    ...baseHeaders,
    "acp-connection-id": connectionId,
  };
  let rpcId = 1;
  try {
    await postCodeBuddyAcpRpc(baseUrl, acpHeaders, rpcId++, "initialize", {
      protocolVersion: 1,
      clientInfo: { name: "cursor-direct-gateway", version: "1.0.0" },
      clientCapabilities: {},
    }, { fetchImpl, signal: options.signal });

    const session = await postCodeBuddyAcpRpc(baseUrl, acpHeaders, rpcId++, "session/new", {
      cwd: compactText(options.cwd || daemonConfig.cwd || process.cwd()),
      mcpServers: [],
    }, { fetchImpl, signal: options.signal });
    const result = session.result || {};
    const modelPayload = result.models && typeof result.models === "object" ? result.models : result;
    return {
      ok: true,
      models: normalizeCodeBuddyModels(modelPayload),
      currentModelId: compactText(
        modelPayload.currentModelId ||
        modelPayload.currentModel?.id ||
        modelPayload.currentModel?.modelId ||
        "",
      ),
      sessionId: compactText(result.sessionId || result.session_id || ""),
      connectionId,
    };
  } finally {
    await disconnectCodeBuddyAcp(baseUrl, acpHeaders, { fetchImpl, signal: options.signal });
  }
}

export async function runCodeBuddyCompletionViaDaemonAcp(messages = [], options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new Error("fetch is not available for CodeBuddy provider");

  const text = messagesToCliRunText(messages);
  if (!text) throw new Error("CodeBuddy ACP run requires at least one non-empty message");

  const daemonConfig = getCodeBuddyDaemonConfig(options);
  await ensureCodeBuddyDaemonRunning({
    ...options,
    serveUrl: options.daemonBaseUrl || options.serveUrl || daemonConfig.serveUrl,
    autoStart: options.autoStartDaemon !== false,
  });

  const baseUrl = normalizeBaseUrl(options.daemonBaseUrl || options.serveUrl || daemonConfig.serveUrl);
  const baseHeaders = {
    ...buildCodeBuddyDaemonHeaders({
      gatewayPassword: options.gatewayPassword || daemonConfig.gatewayPassword,
    }),
    ...(options.headers && typeof options.headers === "object" ? options.headers : {}),
  };

  const connectResponse = await fetchImpl(`${baseUrl}/api/v1/acp/connect`, {
    method: "POST",
    headers: {
      ...baseHeaders,
      accept: "application/json",
    },
    signal: options.signal,
  });
  const connectPayload = await readJsonResponse(connectResponse);
  if (!connectResponse.ok) {
    throw new Error(`CodeBuddy ACP connect failed with ${connectResponse.status}: ${getCodeBuddyErrorMessage(connectPayload, "connect failed", connectResponse.status).slice(0, 400)}`);
  }
  const connectionId = compactText(connectPayload.connectionId || connectPayload.data?.connectionId || "");
  if (!connectionId) throw new Error("CodeBuddy ACP connect returned no connectionId");

  const acpHeaders = {
    ...baseHeaders,
    "acp-connection-id": connectionId,
  };
  let rpcId = 1;
  const started = Date.now();
  try {
    await postCodeBuddyAcpRpc(baseUrl, acpHeaders, rpcId++, "initialize", {
      protocolVersion: 1,
      clientInfo: { name: "cursor-direct-gateway", version: "1.0.0" },
      clientCapabilities: {},
    }, { fetchImpl, signal: options.signal });

    const session = await postCodeBuddyAcpRpc(baseUrl, acpHeaders, rpcId++, "session/new", {
      cwd: compactText(options.cwd || daemonConfig.cwd || process.cwd()),
      mcpServers: [],
    }, { fetchImpl, signal: options.signal });
    const sessionId = compactText(session.result?.sessionId || session.result?.session_id || "");
    if (!sessionId) throw new Error("CodeBuddy ACP session/new returned no sessionId");

    const model = compactText(options.model || "");
    const upstreamModel = model.replace(/^codebuddy\//i, "");
    if (upstreamModel && upstreamModel !== "auto") {
      await postCodeBuddyAcpRpc(baseUrl, acpHeaders, rpcId++, "session/set_model", {
        sessionId,
        modelId: upstreamModel,
      }, { fetchImpl, signal: options.signal });
    }

    const promptResponse = await fetchImpl(`${baseUrl}/api/v1/acp`, {
      method: "POST",
      headers: {
        ...acpHeaders,
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: rpcId++,
        method: "session/prompt",
        params: {
          sessionId,
          prompt: [{ type: "text", text }],
        },
      }),
      signal: options.signal,
    });
    if (!promptResponse.ok) {
      const payload = await readJsonResponse(promptResponse);
      throw new Error(`CodeBuddy ACP session/prompt failed with ${promptResponse.status}: ${getCodeBuddyErrorMessage(payload, "prompt failed", promptResponse.status).slice(0, 400)}`);
    }

    const streamResult = await readCodeBuddyStreamResponse(promptResponse, {
      prompt: text,
      onDelta: options.onDelta,
      onEvent: options.onEvent,
    });
    if (streamResult.turn.errors.length > 0) {
      throw new Error(streamResult.turn.errors[0]);
    }
    assertCodeBuddyAssistantOutput(streamResult, { requireOutput: options.requireOutput });
    return {
      ...streamResult,
      status: promptResponse.status,
      model: options.model || "auto",
      transport: "cli_daemon",
      daemonProtocol: "acp",
      runId: sessionId,
      durationMs: Date.now() - started,
    };
  } finally {
    await disconnectCodeBuddyAcp(baseUrl, acpHeaders, { fetchImpl, signal: options.signal });
  }
}

async function runCodeBuddyCompletionViaDaemonRuns(messages = [], options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new Error("fetch is not available for CodeBuddy provider");

  const daemonConfig = getCodeBuddyDaemonConfig(options);
  await ensureCodeBuddyDaemonRunning({
    ...options,
    serveUrl: options.daemonBaseUrl || options.serveUrl || daemonConfig.serveUrl,
    autoStart: options.autoStartDaemon !== false,
  });

  const baseUrl = normalizeBaseUrl(options.daemonBaseUrl || options.serveUrl || daemonConfig.serveUrl);
  const headers = {
    ...buildCodeBuddyDaemonHeaders({
      gatewayPassword: options.gatewayPassword || daemonConfig.gatewayPassword,
    }),
    ...(options.headers && typeof options.headers === "object" ? options.headers : {}),
  };
  const started = Date.now();
  const runBody = buildCodeBuddyDaemonRunBody(messages, options);
  const createResponse = await fetchImpl(`${baseUrl}/api/v1/runs`, {
    method: "POST",
    headers,
    body: JSON.stringify(runBody),
    signal: options.signal,
  });
  const createPayload = await readJsonResponse(createResponse);
  if (!createResponse.ok) {
    throw new Error(`CodeBuddy CLI run failed with ${createResponse.status}: ${getCodeBuddyErrorMessage(createPayload, "", createResponse.status).slice(0, 400)}`);
  }
  const runId = extractCodeBuddyRunId(createPayload);
  if (!runId) {
    throw new Error(`CodeBuddy CLI run returned no runId: ${JSON.stringify(createPayload).slice(0, 200)}`);
  }

  const streamResponse = await fetchImpl(`${baseUrl}/api/v1/runs/${encodeURIComponent(runId)}/stream`, {
    method: "GET",
    headers: {
      ...headers,
      accept: "text/event-stream, application/json",
    },
    signal: options.signal,
  });
  if (!streamResponse.ok) {
    const errorPayload = await readJsonResponse(streamResponse);
    throw new Error(`CodeBuddy CLI stream failed with ${streamResponse.status}: ${getCodeBuddyErrorMessage(errorPayload, "", streamResponse.status).slice(0, 400)}`);
  }

  const streamResult = await readCodeBuddyStreamResponse(streamResponse, {
    prompt: runBody.text,
    onDelta: options.onDelta,
    onEvent: options.onEvent,
  });
  if (streamResult.turn.errors.length > 0) {
    throw new Error(streamResult.turn.errors[0]);
  }
  assertCodeBuddyAssistantOutput(streamResult, { requireOutput: options.requireOutput });
  return {
    ...streamResult,
    status: streamResponse.status,
    model: options.model || "auto",
    transport: "cli_daemon",
    daemonProtocol: "runs",
    runId,
  };
}

export async function runCodeBuddyCompletionViaDaemon(messages = [], options = {}) {
  const protocol = resolveCodeBuddyDaemonProtocol(options);
  if (protocol === "runs") return runCodeBuddyCompletionViaDaemonRuns(messages, options);
  return runCodeBuddyCompletionViaDaemonAcp(messages, options);
}

export async function runCodeBuddyCompletion(messages = [], options = {}) {
  const transport = resolveCodeBuddyTransport(options);
  if (transport === "cli_daemon") {
    return runCodeBuddyCompletionViaDaemon(messages, options);
  }

  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new Error("fetch is not available for CodeBuddy provider");

  const started = Date.now();
  const request = buildCodeBuddyRunRequest(messages, options);
  const stream = request.body.stream !== false;
  const runResponse = await fetchImpl(request.url, {
    method: request.method,
    headers: request.headers,
    body: JSON.stringify(request.body),
    signal: options.signal,
  });

  if (!runResponse.ok) {
    const errorText = await readResponseText(runResponse);
    let errorPayload = {};
    try {
      errorPayload = errorText ? JSON.parse(errorText) : {};
    } catch {
      errorPayload = {};
    }
    throw new Error(`CodeBuddy chat completion failed with ${runResponse.status}: ${getCodeBuddyErrorMessage(errorPayload, errorText, runResponse.status).slice(0, 400)}`);
  }

  if (!stream) {
    const payload = await readJsonResponse(runResponse);
    const accumulator = createProviderTurnAccumulator();
    let eventCount = 0;
    let deltaCount = 0;
    for (const event of mapOpenAiLikeMessageToProviderEvents(payload)) {
      eventCount += 1;
      accumulator.push(event);
      options.onEvent?.(event);
      if (event.type === "text_delta") {
        deltaCount += 1;
        options.onDelta?.(event.text ?? "");
      }
    }
    return {
      turn: accumulator.snapshot({ prompt: JSON.stringify(request.body.messages) }),
      durationMs: Date.now() - started,
      bytes: 0,
      eventCount,
      deltaCount,
      status: runResponse.status,
      model: request.body.model,
    };
  }

  const streamResult = await readCodeBuddyStreamResponse(runResponse, {
    prompt: JSON.stringify(request.body.messages),
    onDelta: options.onDelta,
    onEvent: options.onEvent,
  });
  if (streamResult.turn.errors.length > 0) {
    throw new Error(streamResult.turn.errors[0]);
  }
  return {
    ...streamResult,
    status: runResponse.status,
    model: request.body.model,
    transport: "cloud",
  };
}

export {
  normalizeCodeBuddyModels,
  normalizeBaseUrl,
};
