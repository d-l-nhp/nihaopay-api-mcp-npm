import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildIndex } from "../scripts/build-index.ts";

describe("buildIndex", () => {
  it("emits a deterministic JSON index from a content tree", async () => {
    const root = mkdtempSync(join(tmpdir(), "nihaopay-buildidx-"));
    mkdirSync(join(root, "content", "test"), { recursive: true });
    writeFileSync(
      join(root, "content", "test", "sample.md"),
      "---\nid: test/sample\ntitle: Sample\nstatus: stable\n---\n\n# H\n\nBody.\n",
    );
    const outFile = join(root, "bm25-index.json");
    await buildIndex({ contentDir: join(root, "content"), outFile });
    const json = JSON.parse(readFileSync(outFile, "utf8"));
    expect(json.chunks.length).toBeGreaterThan(0);
    expect(json.content_hash).toBeTypeOf("string");
  });

  it("excludes status:draft files", async () => {
    const root = mkdtempSync(join(tmpdir(), "nihaopay-buildidx-draft-"));
    mkdirSync(join(root, "content"), { recursive: true });
    writeFileSync(
      join(root, "content", "draft.md"),
      "---\nid: test/draft\ntitle: D\nstatus: draft\n---\n\n# H\n\nB.\n",
    );
    writeFileSync(
      join(root, "content", "stable.md"),
      "---\nid: test/stable\ntitle: S\nstatus: stable\n---\n\n# H\n\nB.\n",
    );
    const outFile = join(root, "bm25-index.json");
    await buildIndex({ contentDir: join(root, "content"), outFile });
    const json = JSON.parse(readFileSync(outFile, "utf8"));
    const docIds = new Set(json.chunks.map((c: { doc_id: string }) => c.doc_id));
    expect(docIds.has("test/stable")).toBe(true);
    expect(docIds.has("test/draft")).toBe(false);
  });
});
