import assert from "node:assert/strict";
import test from "node:test";

import { buildCodeBuddyRunRequest } from "../../codebuddy-provider.mjs";

test("buildCodeBuddyRunRequest creates CodeBuddy cloud chat completions requests", () => {
  const request = buildCodeBuddyRunRequest([
    { role: "system", content: "Be brief." },
    { role: "user", content: [{ type: "text", text: "ping" }] },
  ], {
    baseUrl: "https://www.codebuddy.ai/",
    headers: { "X-Api-Key": "ck-test" },
    model: "claude-sonnet-4.5",
    stream: true,
  });

  assert.equal(request.method, "POST");
  assert.equal(request.url, "https://www.codebuddy.ai/v2/chat/completions");
  assert.equal(request.headers["X-Api-Key"], "ck-test");
  assert.equal(request.headers["x-codebuddy-request"], undefined);
  assert.equal(request.body.model, "claude-sonnet-4.5");
  assert.equal(request.body.stream, true);
  assert.deepEqual(request.body.messages, [
    { role: "system", content: "Be brief." },
    { role: "user", content: "ping" },
  ]);
  assert.equal(request.body.text, undefined);
  assert.equal(request.body.sender, undefined);
  assert.equal(request.body.payload, undefined);
});
