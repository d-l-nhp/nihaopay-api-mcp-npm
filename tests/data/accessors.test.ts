import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
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

  describe("duplicate error codes", () => {
    afterEach(() => vi.restoreAllMocks());

    it("keeps the last entry and warns when error-codes.yaml has a duplicate code", async () => {
      const dir = mkdtempSync(join(tmpdir(), "nihaopay-accessors-dup-"));
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "error-codes.yaml"),
        "codes:\n  - code: 400-23\n    message: first\n  - code: 400-23\n    message: second\n",
      );
      writeFileSync(join(dir, "endpoints.yaml"), "endpoints: []\n");
      writeFileSync(join(dir, "customs.yaml"), "{}\n");
      writeFileSync(join(dir, "enums.yaml"), "{}\n");

      const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const accessors = await loadAccessors(dir);

      expect(accessors.errorCodes.get("400-23")?.message).toBe("second");
      expect(spy).toHaveBeenCalledWith(expect.stringContaining("duplicate error code"));
    });
  });
});
