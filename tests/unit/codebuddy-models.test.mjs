import test from "node:test";
import assert from "node:assert/strict";

import {
  buildOpenAiModelsListResponse,
  findOpenAiModelById,
  toCodeBuddyPublicModelId,
  toOpenAiModelObject,
} from "../../codebuddy-models.mjs";

test("toCodeBuddyPublicModelId normalizes bare and prefixed ids", () => {
  assert.equal(toCodeBuddyPublicModelId("auto"), "codebuddy/auto");
  assert.equal(toCodeBuddyPublicModelId("codebuddy/gpt-5.4"), "codebuddy/gpt-5.4");
  assert.equal(toCodeBuddyPublicModelId("codebuddy:claude-sonnet"), "codebuddy/claude-sonnet");
  assert.equal(toCodeBuddyPublicModelId(""), "codebuddy/auto");
});

test("toOpenAiModelObject matches OpenAI Models API shape", () => {
  const model = toOpenAiModelObject(
    { id: "gpt-5.4", name: "GPT-5.4", owned_by: "codebuddy" },
    { created: 1700000000 },
  );
  assert.equal(model.object, "model");
  assert.equal(model.id, "codebuddy/gpt-5.4");
  assert.equal(model.created, 1700000000);
  assert.equal(model.owned_by, "codebuddy");
  assert.equal(model.display_name, "GPT-5.4");
  assert.equal(model.parent, null);
});

test("buildOpenAiModelsListResponse returns object=list and dedupes", () => {
  const payload = buildOpenAiModelsListResponse(
    [
      { id: "auto", name: "Auto" },
      { id: "codebuddy/auto", name: "Auto again" },
      { id: "claude-sonnet", name: "Sonnet" },
    ],
    { created: 1700000001 },
  );
  assert.equal(payload.object, "list");
  assert.equal(payload.data.length, 2);
  assert.deepEqual(
    payload.data.map((row) => row.id).sort(),
    ["codebuddy/auto", "codebuddy/claude-sonnet"],
  );
  for (const row of payload.data) {
    assert.equal(row.object, "model");
    assert.equal(row.owned_by, "codebuddy");
    assert.equal(row.created, 1700000001);
  }
});

test("buildOpenAiModelsListResponse falls back to codebuddy/auto when empty", () => {
  const payload = buildOpenAiModelsListResponse([], { created: 42 });
  assert.equal(payload.data.length, 1);
  assert.equal(payload.data[0].id, "codebuddy/auto");
});

test("findOpenAiModelById accepts bare, public, and case-insensitive ids", () => {
  const models = [
    { id: "auto", name: "Auto" },
    { id: "gpt-5.4", name: "GPT-5.4" },
  ];
  assert.equal(findOpenAiModelById(models, "codebuddy/gpt-5.4")?.id, "codebuddy/gpt-5.4");
  assert.equal(findOpenAiModelById(models, "gpt-5.4")?.id, "codebuddy/gpt-5.4");
  assert.equal(findOpenAiModelById(models, "CODEBUDDY/AUTO")?.id, "codebuddy/auto");
  assert.equal(findOpenAiModelById(models, "missing"), null);
});
