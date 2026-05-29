import test from "node:test";
import assert from "node:assert/strict";

import {
  createCodeBuddyAccount,
  importCodeBuddyAccounts,
  resolveCodeBuddyAccountHeaders,
  summarizeCodeBuddyAccount,
} from "../../codebuddy-account-pool.mjs";
import {
  buildCodeBuddyRunRequest,
  runCodeBuddyCompletion,
} from "../../codebuddy-provider.mjs";

test("CodeBuddy apiKey accounts resolve to api-key headers", async () => {
  const account = createCodeBuddyAccount({
    label: "CodeBuddy API Key",
    site: "global",
    apiKey: "sk-codebuddy-secret",
  });

  const summary = summarizeCodeBuddyAccount(account);
  assert.equal(summary.authType, "api_key");
  assert.equal(summary.hasCredentials, true);
  assert.equal(summary.site, "global");
  assert.equal(summary.baseUrl, "https://www.codebuddy.ai");
  assert.notEqual(summary.apiKeyPreview, "sk-codebuddy-secret");

  const headers = await resolveCodeBuddyAccountHeaders(account);
  assert.equal(headers["X-Api-Key"], "sk-codebuddy-secret");
  assert.equal(headers["x-codebuddy-request"], undefined);
  assert.equal(headers.authorization, undefined);
  assert.equal(headers.cookie, undefined);
});

test("CodeBuddy domestic apiKey accounts use the China cloud endpoint", async () => {
  const account = createCodeBuddyAccount({
    label: "CodeBuddy CN API Key",
    site: "domestic",
    apiKey: "ck-cn-secret",
  });

  const summary = summarizeCodeBuddyAccount(account);
  assert.equal(summary.site, "domestic");
  assert.equal(summary.internetEnvironment, "internal");
  assert.equal(summary.baseUrl, "https://www.codebuddy.cn");

  const headers = await resolveCodeBuddyAccountHeaders(account);
  assert.deepEqual(headers, {
    accept: "application/json",
    "content-type": "application/json",
    "X-Api-Key": "ck-cn-secret",
  });
});

test("CodeBuddy old token and cookie credentials are ignored without an apiKey", async () => {
  const account = createCodeBuddyAccount({
    label: "CodeBuddy Legacy",
    baseUrl: "https://www.codebuddy.ai",
    authToken: "7628910558898046500",
    refreshToken: "refresh-token-value",
    cookie: "codebuddy_session=secret",
    apiKeyHelper: "echo secret",
  });

  const summary = summarizeCodeBuddyAccount(account);
  assert.equal(summary.authType, "");
  assert.equal(summary.hasCredentials, false);
  assert.equal(summary.authTokenPreview, "");
  assert.equal(summary.refreshTokenPreview, "");
  assert.equal(summary.cookiePreview, "");

  await assert.rejects(
    resolveCodeBuddyAccountHeaders(account),
    /has no credentials/i,
  );
});

test("CodeBuddy import only accepts apiKey payloads", () => {
  const emptyResult = importCodeBuddyAccounts(
    { version: 1, provider: "codebuddy", nextIndex: 0, accounts: [] },
    { label: "No Key", authToken: "auth-token", refreshToken: "refresh-token", cookie: "codebuddy_session=secret" },
  );
  assert.equal(emptyResult.imported.length, 0);

  const result = importCodeBuddyAccounts(
    { version: 1, provider: "codebuddy", nextIndex: 0, accounts: [] },
    { label: "API Key Import", site: "domestic", apiKey: "sk-import-secret" },
  );
  assert.equal(result.imported.length, 1);
  assert.equal(result.imported[0].apiKey, "sk-import-secret");
  assert.equal(result.imported[0].authType, "api_key");
  assert.equal(result.imported[0].site, "domestic");
  assert.equal(result.imported[0].baseUrl, "https://www.codebuddy.cn");

  const jsonResult = importCodeBuddyAccounts(
    { version: 1, provider: "codebuddy", nextIndex: 0, accounts: [] },
    JSON.stringify({ accounts: [{ label: "JSON Key", apiKey: "sk-json-secret" }] }),
  );
  assert.equal(jsonResult.imported.length, 1);
  assert.equal(jsonResult.imported[0].apiKey, "sk-json-secret");
});

test("CodeBuddy cloud requests use chat completions format", async () => {
  const request = buildCodeBuddyRunRequest([{ role: "user", content: "Say hello" }], {
    baseUrl: "https://www.codebuddy.cn",
    headers: { "X-Api-Key": "ck-test" },
    model: "claude-sonnet-4.5",
    stream: true,
  });

  assert.equal(request.method, "POST");
  assert.equal(request.url, "https://www.codebuddy.cn/v2/chat/completions");
  assert.equal(request.headers["X-Api-Key"], "ck-test");
  assert.equal(request.headers["x-codebuddy-request"], undefined);
  assert.deepEqual(request.body.messages, [{ role: "user", content: "Say hello" }]);
  assert.equal(request.body.model, "claude-sonnet-4.5");
  assert.equal(request.body.stream, true);
  assert.equal(request.body.text, undefined);
  assert.equal(request.body.sender, undefined);
});

test("CodeBuddy cloud completion parses non-stream OpenAI responses", async () => {
  const calls = [];
  const result = await runCodeBuddyCompletion([{ role: "user", content: "Hi" }], {
    baseUrl: "https://www.codebuddy.ai",
    headers: { "X-Api-Key": "ck-test" },
    model: "claude-sonnet-4.5",
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ choices: [{ message: { content: "hello" }, finish_reason: "stop" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://www.codebuddy.ai/v2/chat/completions");
  assert.equal(JSON.parse(calls[0].init.body).stream, false);
  assert.equal(result.turn.text, "hello");
});

test("CodeBuddy apiKeyHelper and daemon-style accounts are not treated as usable credentials", async () => {
  const helperAccount = createCodeBuddyAccount({
    label: "CodeBuddy Helper",
    apiKeyHelper: "echo helper-token",
  });
  const daemonAccount = createCodeBuddyAccount({
    label: "CodeBuddy Daemon",
    useDaemonAuth: true,
  });

  assert.equal(summarizeCodeBuddyAccount(helperAccount).hasCredentials, false);
  assert.equal(summarizeCodeBuddyAccount(daemonAccount).hasCredentials, false);
  await assert.rejects(resolveCodeBuddyAccountHeaders(helperAccount), /has no credentials/i);
  await assert.rejects(resolveCodeBuddyAccountHeaders(daemonAccount), /has no credentials/i);
});
