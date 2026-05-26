import { describe, expect, it } from "vitest";
import { loadAccessors } from "../../src/data/accessors.ts";

describe("loadAccessors", () => {
  it("loads error-codes, endpoints, customs, enums from a content/_data directory", async () => {
    const accessors = await loadAccessors("assets/content/_data");
    expect(accessors.errorCodes.size).toBeGreaterThan(0);
    expect(accessors.endpoints.length).toBeGreaterThan(0);
  });

  it("listEndpoints filters by method", async () => {
    const accessors = await loadAccessors("assets/content/_data");
    const post = accessors.endpoints.filter((e) => e.method === "POST");
    expect(post.every((e) => e.method === "POST")).toBe(true);
  });

  it("throws on missing _data directory", async () => {
    await expect(loadAccessors("/nonexistent/path")).rejects.toThrow();
  });
});
