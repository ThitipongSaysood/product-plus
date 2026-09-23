import { describe, expect, it } from "vitest";
import { parseTaxonomy, taxonomyToText } from "./taxonomy";

describe("taxonomy text", () => {
  it("round-trips", () => {
    const list = [{ key: "style_beaded", en: "Beaded", th: "ลูกปัด", zh: "串珠", keywords: ["串珠", "水晶"] }];
    expect(parseTaxonomy(taxonomyToText(list)).entries).toEqual(list);
  });
  it("reports bad lines, accepts Chinese comma, skips comments", () => {
    const r = parseTaxonomy("# c\na | A | ก | 甲 | x，y\nBad Key | a | b | c\na | A | ก | 甲\nunclassified | u | u | u\nonly | two");
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0].keywords).toEqual(["x", "y"]);
    expect(r.errors.map((e) => e.reason)).toEqual(["key", "duplicate", "reserved", "columns"]);
  });
});
