import { describe, expect, it } from "vitest";
import { safeFrom } from "./back-link";

describe("safeFrom", () => {
  it("allows list pages with query", () => expect(safeFrom("/products?pg=a&page=2")).toBe("/products?pg=a&page=2"));
  it("rejects external / protocol-relative / unknown", () => {
    for (const v of ["https://evil.com", "//evil.com", "/\\evil.com", "/settings/system", "", undefined]) expect(safeFrom(v)).toBeNull();
  });
});
