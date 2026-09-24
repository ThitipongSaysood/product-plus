import { describe, expect, it } from "vitest";
import { brandMarks } from "../src/domain/brand.js";

describe("brandMarks", () => {
  it("stays silent on the compatibility phrasing 91% of real titles use", () => {
    expect(brandMarks("适用苹果Watch Ultra 9876543210代se手表带硅胶")).toEqual([]);
    expect(brandMarks("适用苹果手表iWatch Ultra SE系列女士14mm三珠不锈钢金属表带")).toEqual([]);
    expect(brandMarks("适用苹果手表带7/8/9/10一珠小蛮腰蝴蝶扣表带 华为gt4表带高级感")).toEqual([]);
    expect(brandMarks("Apple Watch / Samsung Galaxy Watch strap")).toEqual([]);
  });

  it("flags a band that claims to BE a sports or luxury brand", () => {
    // The one real listing in the group that carries an apparel mark.
    expect(brandMarks("适用苹果Watch Ultra 9876543210代se耐克Nike编织纯色手表带硅胶")).toEqual(["Nike"]);
    expect(brandMarks("爱马仕风格真皮表带")).toEqual(["Hermès"]);
    expect(brandMarks("迪士尼卡通表带 儿童")).toEqual(["Disney"]);
  });

  it("reports every distinct mark it finds, in list order", () => {
    expect(brandMarks("nike adidas 迪士尼 表带")).toEqual(["Nike", "Adidas", "Disney"]);
  });

  it("does not fire on substrings of ordinary words", () => {
    expect(brandMarks("Luxury Vintage band")).toEqual([]); // "LV" must not match inside a word
    expect(brandMarks("coachman leather strap")).toEqual([]);
    expect(brandMarks("supremely soft silicone")).toEqual([]);
  });

  it("handles missing titles", () => {
    expect(brandMarks(null)).toEqual([]);
    expect(brandMarks("")).toEqual([]);
  });

  it("is not defeated by a mark sitting next to the compatibility phrase it strips", () => {
    // The strip replaces with a space rather than deleting, so 苹果Nike cannot become a new word.
    expect(brandMarks("苹果Nike表带")).toEqual(["Nike"]);
  });
});
