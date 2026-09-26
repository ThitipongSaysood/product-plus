import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { addCost, llmCategorize, llmTranslate, openRouterClient } from "../src/jobs/llm.js";

// OpenRouter is reached through the Anthropic SDK with a different base URL and a Bearer key. These tests
// pin the request the SDK actually builds, with a fake fetch — nothing leaves the machine.
type Seen = { url: string; headers: Record<string, string>; body: Record<string, unknown> };

function fakeFetch(usage: Record<string, unknown>, stopReason = "end_turn", text = '{"results":[{"i":0,"th":"สายนาฬิกา"}]}') {
  const seen: Seen[] = [];
  const fetch = async (url: string | URL | Request, init?: RequestInit) => {
    seen.push({ url: String(url), headers: Object.fromEntries(new Headers(init?.headers)), body: JSON.parse(String(init?.body)) });
    const message = {
      id: "msg_1",
      type: "message",
      role: "assistant",
      model: "anthropic/claude-sonnet-5",
      stop_reason: stopReason,
      stop_sequence: null,
      content: [{ type: "text", text }],
      usage,
    };
    return new Response(JSON.stringify(message), { status: 200, headers: { "content-type": "application/json" } });
  };
  return { fetch: fetch as typeof globalThis.fetch, seen };
}

const schema = z.object({ results: z.array(z.object({ i: z.number().int(), th: z.string() })) });
const saved = process.env.ANTHROPIC_API_KEY;
afterEach(() => {
  if (saved === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = saved;
});

describe("openRouterClient", () => {
  it("posts the Messages API to openrouter.ai with a Bearer key and the anthropic/ model id", async () => {
    process.env.ANTHROPIC_API_KEY = "must-not-leak";
    const { fetch, seen } = fakeFetch({ input_tokens: 10, output_tokens: 5, cost: 0.00123 });
    const api = openRouterClient("or-key", { fetch });
    const res = await api.client.messages.parse({
      model: api.model("claude-sonnet-5"),
      max_tokens: 64,
      messages: [{ role: "user", content: "x" }],
      output_config: { format: zodOutputFormat(schema), effort: "low" },
    });

    expect(seen).toHaveLength(1);
    expect(seen[0].url).toBe("https://openrouter.ai/api/v1/messages");
    expect(seen[0].headers.authorization).toBe("Bearer or-key");
    expect(seen[0].headers["x-api-key"]).toBeUndefined();
    expect(seen[0].headers["x-title"]).toBe("Product Plus");
    expect(seen[0].body.model).toBe("anthropic/claude-sonnet-5");
    expect(seen[0].body.output_config).toMatchObject({ effort: "low", format: { type: "json_schema" } });
    expect(res.parsed_output?.results[0]?.th).toBe("สายนาฬิกา");
    expect(api.costOf(res)).toBeCloseTo(0.00123);
  });

  it("reports no cost when the usage block has none", async () => {
    const { fetch } = fakeFetch({ input_tokens: 1, output_tokens: 1 });
    const api = openRouterClient("or-key", { fetch });
    const res = await api.client.messages.create({ model: api.model("claude-sonnet-5"), max_tokens: 8, messages: [{ role: "user", content: "x" }] });
    expect(api.costOf(res)).toBeNull();
  });
});

describe("addCost", () => {
  it("stays null only while both sides are unknown", () => {
    expect(addCost(null, null)).toBeNull();
    expect(addCost(null, 0.5)).toBe(0.5);
    expect(addCost(0.25, null)).toBe(0.25);
    expect(addCost(0.25, 0.5)).toBe(0.75);
  });
});

describe("cut-off answers", () => {
  it("fails a translate batch that hit max_tokens instead of keeping part of it", async () => {
    const { fetch, seen } = fakeFetch({ input_tokens: 10, output_tokens: 16_000, cost: 0.2 }, "max_tokens");
    const api = openRouterClient("or-key", { fetch });
    await expect(llmTranslate(api, [{ id: "p1", title: "苹果手表表带" }])).rejects.toThrow(/max_tokens/);
    expect(seen[0].body.max_tokens).toBe(16_000);
  });
});

describe("off-topic listings", () => {
  const taxonomy = [{ key: "material_silicone", en: "Silicone", th: "ซิลิโคน", zh: "硅胶", keywords: ["硅胶"] }];
  const items = [
    { id: "band", title: "硅胶表带 适用iwatch" },
    { id: "cookie", title: "苹果茉莉夹心饼干" },
    { id: "odd", title: "量身定制专属手环表带" },
  ];
  const answer = JSON.stringify({ results: [
    { i: 0, key: "material_silicone" }, { i: 1, key: "offtopic" }, { i: 2, key: "unclassified" },
  ] });

  // An invented key cannot reach this path: structured output limits the model to the enum (the SDK
  // rejects anything else); collect() still filters it on the cli path.
  it("keeps offtopic, drops unclassified, and tells the model the group", async () => {
    const { fetch, seen } = fakeFetch({ input_tokens: 10, output_tokens: 10, cost: 0.01 }, "end_turn", answer);
    const r = await llmCategorize({ kind: "api", api: openRouterClient("or-key", { fetch }) }, items, taxonomy, "Apple Watch bands");
    expect(Object.fromEntries(r.got)).toEqual({ band: "material_silicone", cookie: "offtopic" });
    const prompt = JSON.stringify(seen[0].body.messages);
    expect(prompt).toContain("Apple Watch bands");
    expect(JSON.stringify(seen[0].body.output_config)).toContain("offtopic");
  });
});
