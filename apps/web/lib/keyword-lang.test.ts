import { describe, expect, it } from "vitest";
import { languageMismatch } from "./keyword-lang";

describe("languageMismatch (web mirror of the api guard)", () => {
  it("matches the api rules", () => {
    expect(languageMismatch("1688", "Tempered Glass")).toBe(true);
    expect(languageMismatch("xhs", "iwatch钢化膜")).toBe(false);
    expect(languageMismatch("temu", "apple watch screen protector")).toBe(false);
    expect(languageMismatch("temu", "苹果手表钢化膜")).toBe(true);
  });
});
