import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifySession } from "./proxy";

// Same format the api issues (apps/api/src/common/http.ts issueSession).
const issue = (password: string, exp: number) => `${exp}.${createHmac("sha256", password).update(`pp-session-v1|${exp}`).digest("hex")}`;
const now = Date.UTC(2026, 8, 24);
const nowS = now / 1000;

describe("proxy session cookie", () => {
  it("accepts a valid unexpired cookie", async () => {
    expect(await verifySession(issue("pw", nowS + 3600), "pw", now)).toBe(true);
  });
  it("rejects expired, wrong password, far-future, tampered and old-format cookies", async () => {
    expect(await verifySession(issue("pw", nowS - 1), "pw", now)).toBe(false);
    expect(await verifySession(issue("other", nowS + 3600), "pw", now)).toBe(false);
    expect(await verifySession(issue("pw", nowS + 400 * 86400), "pw", now)).toBe(false);
    expect(await verifySession(issue("pw", nowS + 3600).replace(/^\d+/, String(nowS + 7200)), "pw", now)).toBe(false);
    expect(await verifySession(createHmac("sha256", "pw").update("pp-session-v1").digest("hex"), "pw", now)).toBe(false);
  });
});
