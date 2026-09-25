import { describe, expect, it } from "vitest";
import { BROAD_PATH, cleanPathDecisions, fromPlatformMap, mapDecision, mappingSafe, type PathBrief } from "../src/domain/categorize.js";

// Real split of 1688 › 数码、电脑 > 智能设备 > 智能手表表带 on 2026-09-25 (40 listings).
const BANDS: PathBrief = {
  platform: "1688",
  path: "数码、电脑 > 智能设备 > 智能手表表带",
  count: 40,
  titles: [],
  ruleSplit: { material_metal: 26, material_nylon: 5, material_silicone: 5, material_leather: 2, unclassified: 2 },
};
const CASES: PathBrief = { platform: "douyin", path: "3C数码及配件 > 智能设备 > 智能手表保护壳", count: 6, titles: [], ruleSplit: { accessory_case: 5, unclassified: 1 } };
const KEYS = ["material_metal", "material_silicone", "accessory_case"];

describe("broad platform paths", () => {
  const map = new Map([
    ["1688|数码、电脑 > 智能设备", BROAD_PATH],
    ["1688|数码、电脑 > 智能设备 > 智能手表保护壳", "accessory_case"],
  ]);

  it("a broad path stops layer 1 and leaves the listing to the rules", () => {
    expect(fromPlatformMap("1688", ["数码、电脑", "智能设备", "智能手表表带"], map)).toBeNull();
    expect(mapDecision("1688", ["数码、电脑", "智能设备", "智能手表表带"], map)).toBe(BROAD_PATH);
  });

  it("a longer mapped prefix under a broad one still wins", () => {
    expect(fromPlatformMap("1688", ["数码、电脑", "智能设备", "智能手表保护壳"], map)).toBe("accessory_case");
  });
});

describe("mappingSafe", () => {
  it("refuses a key most rule-sorted listings disagree with", () => {
    expect(mappingSafe("material_metal", BANDS.ruleSplit)).toBe(false); // 12 of 38 sorted elsewhere
  });
  it("allows a key the rules agree with, ignoring unclassified", () => {
    expect(mappingSafe("accessory_case", CASES.ruleSplit)).toBe(true);
  });
  it("allows any key when the rules sorted nothing", () => {
    expect(mappingSafe("material_metal", { unclassified: 4 })).toBe(true);
  });
});

describe("cleanPathDecisions", () => {
  it("keeps a safe map and a broad call, each with its reason", () => {
    const out = cleanPathDecisions(
      [
        { i: 0, decision: "broad", reasonTh: "หมวดกว้าง" },
        { i: 1, decision: "map", key: "accessory_case", reasonTh: "เคสโดยเฉพาะ" },
      ],
      [BANDS, CASES],
      KEYS,
    );
    expect(out).toEqual([
      { platform: "1688", path: BANDS.path, count: 40, categoryKey: null, reasonTh: "หมวดกว้าง" },
      { platform: "douyin", path: CASES.path, count: 6, categoryKey: "accessory_case", reasonTh: "เคสโดยเฉพาะ" },
    ]);
  });

  it("turns an unsafe map into broad with the guard's reason", () => {
    const [d] = cleanPathDecisions([{ i: 0, decision: "map", key: "material_metal", reasonTh: "โลหะเยอะสุด" }], [BANDS], KEYS);
    expect(d).toMatchObject({ categoryKey: null, reasonTh: "catmap.guardBroad" });
  });

  it("an unknown key is not mapped; unknown indexes, bad decisions and repeats are skipped", () => {
    const out = cleanPathDecisions(
      [{ i: 1, decision: "map", key: "material_gold" }, { i: 7, decision: "broad" }, { i: 0, decision: "maybe" }, { i: 1, decision: "broad" }],
      [BANDS, CASES],
      KEYS,
    );
    expect(out).toEqual([{ platform: "douyin", path: CASES.path, count: 6, categoryKey: null, reasonTh: "" }]);
  });
});
