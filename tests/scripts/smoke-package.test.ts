import { describe, expect, it } from "vitest";
import { tarballPrefix } from "../../scripts/smoke-package.ts";

describe("tarballPrefix", () => {
  it("sanitizes scoped names the way npm pack does (@scope/name → scope-name-)", () => {
    expect(tarballPrefix("@aurfy/nihaopay-api-mcp")).toBe("aurfy-nihaopay-api-mcp-");
  });

  it("leaves unscoped names untouched", () => {
    expect(tarballPrefix("nihaopay-api-mcp")).toBe("nihaopay-api-mcp-");
  });
});
