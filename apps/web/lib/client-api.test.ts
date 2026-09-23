import { afterEach, describe, expect, it, vi } from "vitest";
import { send } from "./client-api";

describe("send", () => {
  afterEach(() => vi.unstubAllGlobals());
  it.each(["POST", "PUT", "PATCH", "DELETE"] as const)("%s always sends JSON content-type and a JSON body", async (m) => {
    const f = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", f);
    await send(m, "/api/x");
    const init = (f.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>)["content-type"]).toBe("application/json");
    expect(init.body).toBe("{}");
  });
  it("GET sends no body", async () => {
    const f = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", f);
    await send("GET", "/api/x");
    expect((f.mock.calls[0] as unknown as [string, RequestInit])[1].body).toBeUndefined();
  });
  it("maps api error keys and network failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"error":"errors.contentType"}', { status: 415 })));
    expect(await send("POST", "/api/x", {})).toEqual({ error: "errors.contentType" });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
    expect(await send("POST", "/api/x", {})).toEqual({ error: "errors.apiDown" });
  });
});
