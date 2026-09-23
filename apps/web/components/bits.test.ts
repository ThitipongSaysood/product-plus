import { describe, expect, it } from "vitest";
import type { ChangeEvent } from "@pp/contracts";
import { makeT } from "@/i18n";
import { eventText } from "./bits";

const ev = (kind: ChangeEvent["kind"], detail: Record<string, unknown> | null): ChangeEvent =>
  ({ id: "e", kind, occurredAt: "2026-09-24T00:00:00Z", productId: "p", productTitle: null, platform: "douyin", imageId: null, detail });

describe("eventText uses {from,to}", () => {
  const t = makeT("en");
  it("sales surge = to − from", () => expect(eventText(t, ev("sales_surge", { from: 1000, to: 1420, period: "30d" }))).toBe("Sold +420"));
  it("rank climb = from − to", () => expect(eventText(t, ev("rank_up", { from: 30, to: 8 }))).toBe("Rank up 22"));
  it("price drop % = (from − to) / from", () => expect(eventText(t, ev("price_drop", { from: 40, to: 30 }))).toBe("Price down 25%"));
  it("missing detail shows —", () => expect(eventText(t, ev("rank_up", null))).toBe("Rank up —"));
});
