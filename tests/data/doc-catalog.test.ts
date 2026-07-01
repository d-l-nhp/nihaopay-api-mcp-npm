import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadDocCatalog } from "../../src/data/doc-catalog.ts";

describe("loadDocCatalog", () => {
  afterEach(() => vi.restoreAllMocks());

  it("keeps the last-loaded entry and warns when two files share a frontmatter id", async () => {
    const dir = mkdtempSync(join(tmpdir(), "nihaopay-catalog-dup-"));
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "a.md"),
      "---\nid: shared/id\ntitle: First\nstatus: stable\n---\n\nBody A.\n",
    );
    writeFileSync(
      join(dir, "b.md"),
      "---\nid: shared/id\ntitle: Second\nstatus: stable\n---\n\nBody B.\n",
    );

    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const catalog = await loadDocCatalog(dir);

    expect(catalog.size).toBe(1);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('duplicate doc id "shared/id"'));
  });
});
