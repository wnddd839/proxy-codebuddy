import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCursorAgentArgs,
  extractCursorLoginUrl,
  parseCursorAboutOutput,
  parseCursorLoginStatus,
} from "../../cursor-gateway.mjs";
import { buildDirectAdminHtml } from "../../direct-admin-page.mjs";

test("extractCursorLoginUrl returns the loginDeepControl URL from wrapped CLI output", () => {
  const output = [
    "Starting login process...",
    "Open a browser and navigate to this link:",
    "https://cursor.com/loginDeepControl?challenge=abc",
    "  &uuid=123&mode=login&redirectTarget=cli",
  ].join("\n");

  assert.equal(
    extractCursorLoginUrl(output),
    "https://cursor.com/loginDeepControl?challenge=abc&uuid=123&mode=login&redirectTarget=cli",
  );
});

test("parseCursorLoginStatus detects unauthenticated status", () => {
  assert.deepEqual(parseCursorLoginStatus("Not logged in"), {
    loggedIn: false,
    message: "Not logged in",
  });
});

test("parseCursorAboutOutput extracts account fields", () => {
  const about = [
    "About Cursor CLI",
    "",
    "CLI Version         2026.05.24-dda726e",
    "Model               Auto",
    "Subscription Tier   Pro",
    "OS                  linux (x64)",
    "Terminal            unknown",
    "Shell               bash",
    "User Email          user@example.com",
  ].join("\n");

  assert.deepEqual(parseCursorAboutOutput(about), {
    cliVersion: "2026.05.24-dda726e",
    model: "Auto",
    subscriptionTier: "Pro",
    os: "linux (x64)",
    userEmail: "user@example.com",
  });
});

test("buildCursorAgentArgs trusts the configured workspace for headless calls", () => {
  const args = buildCursorAgentArgs("auto", { stream: true });

  assert.ok(args.includes("--print"));
  assert.ok(args.includes("--trust"));
});

test("buildCursorAgentArgs uses json output for non-stream requests", () => {
  const args = buildCursorAgentArgs("auto", { stream: false });

  assert.equal(args[args.indexOf("--output-format") + 1], "json");
  assert.equal(args.includes("--stream-partial-output"), false);
});

test("buildCursorAgentArgs uses stream-json output for streaming requests", () => {
  const args = buildCursorAgentArgs("auto", { stream: true });

  assert.equal(args[args.indexOf("--output-format") + 1], "stream-json");
  assert.ok(args.includes("--stream-partial-output"));
});

test("direct admin renders a masked API key copy control", () => {
  const html = buildDirectAdminHtml();

  assert.match(html, /id="apiKeyDisplay"/);
  assert.match(html, /type="password"/);
  assert.match(html, /id="copyApiKeyBtn"/);
  assert.doesNotMatch(html, /id="apiKeyPreview"/);
});

test("direct admin copies Base URL from page state instead of a transient input fallback", () => {
  const html = buildDirectAdminHtml();

  assert.match(html, /clientBaseUrl:/);
  assert.match(html, /function resolveBaseUrl/);
  assert.match(html, /state\.clientBaseUrl/);
  assert.doesNotMatch(html, /baseUrlInput'\)\.value \|\|/);
});

test("direct admin renders the dashboard header and runtime chips", () => {
  const html = buildDirectAdminHtml();

  assert.match(html, /class="dashboard-header"/);
  assert.match(html, /id="runtimeChips"/);
  assert.match(html, /CURSOR DIRECT GATEWAY/);
  assert.match(html, /OAuth/);
});

test("direct admin topbar exists with sticky positioning in CSS", () => {
  const html = buildDirectAdminHtml();

  // topbar element present
  assert.match(html, /class="topbar/);
  // sticky position defined in shared styles
  assert.match(html, /position:\s*sticky/);
});

test("direct admin renders metric-grid with metric cards", () => {
  const html = buildDirectAdminHtml();

  assert.match(html, /class="metric-grid"/);
  assert.match(html, /class="metric"/);
  assert.match(html, /id="metricTotal"/);
  assert.match(html, /id="metricEnabled"/);
  assert.match(html, /id="metricDisabled"/);
  assert.match(html, /id="metricLatency"/);
  assert.match(html, /id="metricRequests"/);
  assert.match(html, /id="metricBaseUrl"/);
});

test("direct admin has masked API key control (non-regression)", () => {
  const html = buildDirectAdminHtml();

  assert.match(html, /id="apiKeyDisplay"/);
  assert.match(html, /type="password"/);
  assert.match(html, /id="copyApiKeyBtn"/);
  assert.doesNotMatch(html, /id="apiKeyPreview"/);
});

test("direct admin defines resolveBaseUrl and state.clientBaseUrl", () => {
  const html = buildDirectAdminHtml();

  assert.match(html, /function resolveBaseUrl/);
  assert.match(html, /clientBaseUrl:/);
  assert.match(html, /state\.clientBaseUrl/);
});

test("direct admin renders import tabs with three modes (single, batch, oauth)", () => {
  const html = buildDirectAdminHtml();

  // tab structure
  assert.match(html, /class="import-tabs"/);
  assert.match(html, /id="importTabs"/);
  // three tab buttons
  assert.match(html, /data-tab="single"/);
  assert.match(html, /data-tab="batch"/);
  assert.match(html, /data-tab="oauth"/);
  // three tab panes
  assert.match(html, /id="importPaneSingle"/);
  assert.match(html, /id="importPaneBatch"/);
  assert.match(html, /id="importPaneOAuth"/);
});

test("direct admin renders probe result area", () => {
  const html = buildDirectAdminHtml();

  assert.match(html, /class="probe-result"/);
  assert.match(html, /id="probeBox"/);
  assert.match(html, /id="probeModel"/);
  assert.match(html, /id="probeBtn"/);
});

test("direct admin renders advanced debug details panel", () => {
  const html = buildDirectAdminHtml();

  assert.match(html, /<details class="advanced-panel"/);
  assert.match(html, /<summary>高级调试信息<\/summary>/);
  assert.match(html, /id="debugStatus"/);
  assert.match(html, /id="debugAccounts"/);
  assert.match(html, /id="debugOAuth"/);
});
