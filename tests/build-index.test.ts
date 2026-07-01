import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildIndex } from "../scripts/build-index.ts";

describe("buildIndex", () => {
  afterEach(() => vi.restoreAllMocks());

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

  it("excludes commented-out H2 headings from the synopsis chunk", async () => {
    const root = mkdtempSync(join(tmpdir(), "nihaopay-buildidx-comment-"));
    mkdirSync(join(root, "content"), { recursive: true });
    writeFileSync(
      join(root, "content", "sample.md"),
      "---\nid: test/commented\ntitle: Sample\nstatus: stable\n---\n\n" +
        "<!--\n## Deprecated Flow\n-->\n\n## Current Flow\n\nBody text.\n",
    );
    const outFile = join(root, "bm25-index.json");
    await buildIndex({ contentDir: join(root, "content"), outFile });
    const json = JSON.parse(readFileSync(outFile, "utf8"));
    const synopsis = json.chunks.find(
      (c: { doc_id: string; heading: string }) =>
        c.doc_id === "test/commented" && c.heading === "[Synopsis]",
    );
    expect(synopsis?.text).toContain("Current Flow");
    expect(synopsis?.text).not.toContain("Deprecated Flow");
  });

  it("warns and produces zero chunks for a doc with minimal frontmatter and an empty body", async () => {
    const root = mkdtempSync(join(tmpdir(), "nihaopay-buildidx-empty-"));
    mkdirSync(join(root, "content"), { recursive: true });
    // No title/summary/tags/endpoint/product/quirks, and no body content at all
    // (not even a heading — a heading-only body still produces a non-empty header
    // chunk, since extractH2Headings feeds heading text into it regardless of
    // whether content follows).
    writeFileSync(join(root, "content", "thin.md"), "---\nid: test/thin\nstatus: stable\n---\n");
    const outFile = join(root, "bm25-index.json");
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await buildIndex({ contentDir: join(root, "content"), outFile });
    const json = JSON.parse(readFileSync(outFile, "utf8"));
    const docIds = new Set(json.chunks.map((c: { doc_id: string }) => c.doc_id));
    expect(docIds.has("test/thin")).toBe(false);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("test/thin"));
  });
});
