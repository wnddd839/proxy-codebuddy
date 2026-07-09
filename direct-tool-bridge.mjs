import { randomUUID } from "node:crypto";

const EXEC_TOOL_ALIASES = {
  read: ["read_file", "Read", "read", "ReadFile", "filesystem_read", "view_file", "file_read"],
  write: ["write_file", "Write", "write", "edit_file", "search_replace", "apply_patch", "str_replace"],
  ls: ["list_dir", "LS", "List", "ls", "list", "glob_file_search", "list_files"],
  grep: ["grep", "Grep", "search_files", "codebase_search", "ripgrep"],
  shell: ["Bash", "Shell", "bash", "shell", "run_terminal_cmd", "execute_command", "terminal", "run_command"],
  fetch: ["Fetch", "WebFetch", "fetch", "webfetch", "web_fetch", "http_get"],
  delete: ["delete_file", "Delete", "delete", "remove_file"],
  mcp: ["mcp", "use_mcp_tool", "call_mcp_tool"],
};

const PATH_KEYS = ["path", "file_path", "target_file", "filePath", "filepath"];
const COMMAND_KEYS = ["command", "cmd", "script"];
const URL_KEYS = ["url", "uri", "href"];

function normalizeTools(tools) {
  if (!Array.isArray(tools)) return [];
  return tools
    .filter((tool) => tool && typeof tool.name === "string" && tool.name.trim())
    .map((tool) => ({
      name: tool.name.trim(),
      description: typeof tool.description === "string" ? tool.description : "",
      input_schema: tool.input_schema && typeof tool.input_schema === "object"
        ? tool.input_schema
        : { type: "object", properties: {} },
    }));
}

function normalizeToolChoice(toolChoice) {
  if (!toolChoice || typeof toolChoice !== "object") return null;
  const type = typeof toolChoice.type === "string" ? toolChoice.type : "";
  if (type === "auto" || !type) return { type: "auto" };
  if (type === "none") return { type: "none" };
  if (type === "any") return { type: "any" };
  if (type === "tool" && typeof toolChoice.name === "string" && toolChoice.name.trim()) {
    return { type: "tool", name: toolChoice.name.trim() };
  }
  return null;
}

function pickToolByAliasGroup(tools, group) {
  const aliases = EXEC_TOOL_ALIASES[group] || [];
  const aliasSet = new Set(aliases.map((a) => a.toLowerCase()));
  for (const tool of tools) {
    if (aliasSet.has(tool.name.toLowerCase())) return tool.name;
  }
  return "";
}

function firstSchemaKey(properties, candidates) {
  for (const key of candidates) {
    if (Object.prototype.hasOwnProperty.call(properties, key)) return key;
  }
  for (const key of Object.keys(properties)) {
    const lower = key.toLowerCase();
    if (candidates.some((c) => lower.includes(c.toLowerCase()))) return key;
  }
  return candidates[0] || "";
}


function sanitizeToolArgString(value) {
  return String(value ?? "").trim().replace(/^[`"']+|[`"']+$/g, "");
}

function sanitizeToolPath(value, fallback = "") {
  const raw = sanitizeToolArgString(value);
  const cleaned = raw.split(/[:\r\n]/)[0].trim();
  return cleaned || fallback;
}

function getToolByName(tools, name) {
  return tools.find((tool) => tool.name === name) || null;
}

function buildInputFromExec(event, toolName, tools) {
  const tool = getToolByName(tools, toolName);
  const properties = tool?.input_schema?.properties || {};
  const input = {};
  const type = String(event?.type || "");

  if (type.includes("read") || type.includes("write") || type.includes("delete") || type.includes("ls")) {
    const key = firstSchemaKey(properties, PATH_KEYS);
    if (key) input[key] = event.path || "";
  }
  if (type.includes("shell") || type.includes("background_shell")) {
    const cmdKey = firstSchemaKey(properties, COMMAND_KEYS);
    if (cmdKey) input[cmdKey] = event.command || "";
    const cwdKey = Object.keys(properties).find((k) => /cwd|working.?dir/i.test(k));
    if (cwdKey && event.workingDirectory) input[cwdKey] = event.workingDirectory;
  }
  if (type.includes("fetch")) {
    const urlKey = firstSchemaKey(properties, URL_KEYS);
    if (urlKey) input[urlKey] = event.url || "";
  }
  if (type.includes("grep")) {
    const patternKey = Object.keys(properties).find((k) => /pattern|query|regex/i.test(k)) || "pattern";
    const pathKey = firstSchemaKey(properties, PATH_KEYS);
    if (patternKey) input[patternKey] = event.pattern || "";
    if (pathKey && event.path) input[pathKey] = event.path;
  }
  if (type.includes("mcp")) {
    const nameKey = Object.keys(properties).find((k) => /name|tool/i.test(k));
    if (nameKey) input[nameKey] = event.mcpTool || "";
  }

  return input;
}

function inferInputFromPrompt(toolName, input, prompt) {
  const next = { ...input };
  const lower = String(toolName || "").toLowerCase();
  const text = String(prompt || "");

  const hasPath = PATH_KEYS.some((k) => {
    const v = next[k];
    return typeof v === "string" && v.trim();
  });
  const isReadLikeTool = /^(read|view)(_|$|-)/i.test(lower) || lower === "read" || lower === "readfile";
  if (!hasPath && isReadLikeTool && !/write|edit|patch|delete/i.test(lower)) {
    const match = text.match(/(?:read|open|load|查看|读取)\s+[`"']?([^\s`"']+)/i)
      || text.match(/\b([./\w-]+\.(?:json|ts|tsx|js|mjs|py|md|txt|yaml|yml|toml|go|rs|html|css))\b/i)
      || text.match(/\b(package\.json|README\.md|Cargo\.toml)\b/i);
    if (match) {
      const key = PATH_KEYS.find((k) => Object.prototype.hasOwnProperty.call(next, k)) || "path";
      next[key] = match[1];
    }
  }

  const hasCommand = COMMAND_KEYS.some((k) => {
    const v = next[k];
    return typeof v === "string" && v.trim();
  });
  if (!hasCommand && /bash|shell|terminal|command|run_terminal/i.test(lower)) {
    const match = text.match(/(?:run|execute|执行)\s+[`"']([^`"']+)[`"']/i)
      || text.match(/\b(ls(?:\s+-[a-zA-Z]+)*|cat|pwd|npm|git|curl|echo|find|grep)\b[^\n]*/i)
      || text.match(/(?:command|命令)[:：]\s*([^\n]+)/i);
    if (match) {
      const key = COMMAND_KEYS.find((k) => Object.prototype.hasOwnProperty.call(next, k)) || "command";
      next[key] = (match[1] || match[0]).trim();
    }
  }

  const contentKeys = ["content", "contents", "text", "body", "data"];
  const hasContent = contentKeys.some((k) => {
    const v = next[k];
    return typeof v === "string" && v.trim();
  });
  if (!hasContent && /write|create|save/i.test(lower)) {
    const fence = text.match(/```(?:html|css|javascript|json)?\s*([\s\S]*?)```/i);
    if (fence) {
      const key = contentKeys.find((k) => Object.prototype.hasOwnProperty.call(next, k)) || "content";
      next[key] = fence[1].trim();
    }
  }
  if (!hasPath && /write|create|save/i.test(lower)) {
    const match = text.match(/(?:path|file_path)\s*[=:]\s*[`"']?([^\s`"']+)/i)
      || text.match(/(?:create|write|save)\s+[`"']?([^\s`"']+)/i)
      || text.match(/\b([a-z0-9_./-]+\.(?:html|css|js|mjs|json|md|txt))\b/i);
    if (match) {
      const key = PATH_KEYS.find((k) => Object.prototype.hasOwnProperty.call(next, k)) || "path";
      next[key] = match[1];
    }
  }

  const hasLsPath = PATH_KEYS.some((k) => {
    const v = next[k];
    return typeof v === "string" && v.trim();
  });
  if (!hasLsPath && /list_dir|list.?dir|ls\b/i.test(lower)) {
    const match = text.match(/(?:list|ls|列出|目录)\s+[`"']?([^\s`"']+)/i)
      || text.match(/(?:in|under|at)\s+[`"']?([./\w-]+)[`"']?/i);
    if (match) {
      const key = PATH_KEYS.find((k) => Object.prototype.hasOwnProperty.call(next, k)) || "path";
      next[key] = match[1];
    }
  }

  return next;
}

export function toOpenAiToolCallId(id) {
  const raw = String(id || "").trim();
  if (!raw) return `call_${randomUUID().replace(/-/g, "")}`;
  if (raw.startsWith("call_")) return raw;
  return `call_${raw.replace(/^toolu_/, "")}`;
}

export function buildNativeToolUseFromExec(event, options = {}) {
  if (!event || typeof event !== "object") return null;
  const tools = normalizeTools(options.tools);
  const choice = normalizeToolChoice(options.toolChoice);
  if (!tools.length || choice?.type === "none") return null;

  const type = String(event.type || "");
  let group = "";
  if (type.includes("read")) group = "read";
  else if (type.includes("write")) group = "write";
  else if (type.includes("delete")) group = "delete";
  else if (type.includes("ls")) group = "ls";
  else if (type.includes("grep")) group = "grep";
  else if (type.includes("shell") || type.includes("background_shell")) group = "shell";
  else if (type.includes("fetch")) group = "fetch";
  else if (type.includes("mcp")) group = "mcp";
  if (!group) return null;

  const toolName = pickToolByAliasGroup(tools, group);
  if (!toolName) return null;
  if (choice?.type === "tool" && toolName !== choice.name) return null;

  let input = buildInputFromExec(event, toolName, tools);
  input = inferInputFromPrompt(toolName, input, options.prompt || "");

  return {
    id: toOpenAiToolCallId(`toolu_${randomUUID().replace(/-/g, "")}`),
    name: toolName,
    input,
    source: "cursor_native",
    eventType: event.type,
  };
}

export function findNativeToolUseInEvents(events = [], options = {}) {
  for (const event of Array.isArray(events) ? events : []) {
    const toolUse = buildNativeToolUseFromExec(event, options);
    if (toolUse) return toolUse;
  }
  return null;
}

export function normalizeToolUseForClient(toolUse, options = {}) {
  if (!toolUse) return null;
  const tools = normalizeTools(options.tools);
  const tool = getToolByName(tools, toolUse.name);
  let input = toolUse.input && typeof toolUse.input === "object" ? { ...toolUse.input } : {};

  if (tool) {
    const remapped = buildInputFromExec(
      {
        type: toolUse.eventType || "",
        path: input.path || input.file_path || input.target_file || "",
        command: input.command || input.cmd || "",
        url: input.url || "",
        workingDirectory: input.working_directory || input.cwd || "",
        pattern: input.pattern || input.query || "",
      },
      toolUse.name,
      tools,
    );
    input = { ...remapped, ...input };
    for (const [key, value] of Object.entries(input)) {
      if (value === "" || value == null) delete input[key];
    }
  }

  input = inferInputFromPrompt(toolUse.name, input, options.prompt || "");

  for (const key of [...PATH_KEYS, ...COMMAND_KEYS, ...URL_KEYS, "content", "contents", "text"]) {
    if (typeof input[key] === "string") {
      input[key] = key === "path" || PATH_KEYS.includes(key)
        ? sanitizeToolPath(input[key], input[key])
        : sanitizeToolArgString(input[key]);
    }
  }

  return {
    ...toolUse,
    id: toOpenAiToolCallId(toolUse.id),
    input,
  };
}

export function synthesizeForcedToolUse(options = {}) {
  const tools = normalizeTools(options.tools);
  const choice = normalizeToolChoice(options.toolChoice);
  if (choice?.type !== "tool" || !choice.name) return null;
  const tool = getToolByName(tools, choice.name);
  if (!tool) return null;
  let input = inferInputFromPrompt(choice.name, {}, options.prompt || "");
  const required = Array.isArray(tool.input_schema?.required) ? tool.input_schema.required : [];
  const missingRequired = required.filter((key) => {
    const value = input[key];
    return !(typeof value === "string" ? value.trim() : value != null && value !== "");
  });
  if (missingRequired.length > 0) return null;
  return {
    id: toOpenAiToolCallId(`toolu_${randomUUID().replace(/-/g, "")}`),
    name: choice.name,
    input,
    source: "synthesized",
  };
}

export function synthesizeAnyToolUse(options = {}) {
  const tools = normalizeTools(options.tools);
  const choice = normalizeToolChoice(options.toolChoice);
  if (choice?.type !== "any" || tools.length !== 1) return null;
  return synthesizeForcedToolUse({
    ...options,
    toolChoice: { type: "tool", name: tools[0].name },
  });
}

export function shouldBridgeClientTools(options = {}) {
  const tools = normalizeTools(options.tools);
  const choice = normalizeToolChoice(options.toolChoice);
  return tools.length > 0 && choice?.type !== "none";
}

export function buildOpenAiToolsPromptLite(tools = [], toolChoice = null) {
  const normalized = normalizeTools(tools);
  const choice = normalizeToolChoice(toolChoice);
  if (!normalized.length || choice?.type === "none") return "";
  const choiceLine = choice?.type === "tool"
    ? `You must call function "${choice.name}" now.`
    : choice?.type === "any"
      ? "You must call exactly one listed function now."
      : "When the user asks to read files, run commands, search, or fetch URLs, call the matching function instead of describing what you would do.";
  const toolHints = normalized.map((t) => {
    const n = t.name.toLowerCase();
    if (/read|view|file/.test(n)) return `${t.name}: use for reading files; always pass the target path.`;
    if (/bash|shell|terminal|command/.test(n)) return `${t.name}: use for shell commands; pass the full command string.`;
    if (/list|ls|dir/.test(n)) return `${t.name}: use for directory listings; pass the directory path.`;
    if (/grep|search|ripgrep/.test(n)) return `${t.name}: use for code/text search; pass pattern and optional path.`;
    if (/write|edit|patch/.test(n)) return `${t.name}: use for writing or editing files.`;
    if (/fetch|web|http/.test(n)) return `${t.name}: use for HTTP fetches; pass the URL.`;
    return `${t.name}: use when its description matches the task.`;
  });
  return [
    "TOOL_USE_MODE:",
    "The client executes tools locally. When a tool is needed, reply with ONLY one JSON object and no markdown or prose:",
    '{"tool_calls":[{"id":"call_<unique>","type":"function","function":{"name":"<exact function name>","arguments":{...}}}]}',
    "Rules:",
    "- Use exact function names from the list below.",
    "- arguments must be a JSON object matching the function schema.",
    "- Infer required arguments from the user message; never emit empty required fields when the value is obvious.",
    "- Do not claim you cannot run tools; the client runs them after you emit tool_calls.",
    "- If the user asks to create/write/save a new file, call the write tool (not read) with full content.",
    choiceLine,
    "Per-function hints:",
    ...toolHints,
    "Functions:",
    JSON.stringify(normalized.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.input_schema },
    }))),
  ].join("\n");
}
