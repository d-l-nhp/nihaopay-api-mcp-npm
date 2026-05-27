import { readFile } from "node:fs/promises";
import matter from "gray-matter";
import { describe, expect, it } from "vitest";
import { loadAccessors } from "../../src/data/accessors.ts";
import { walk } from "../../src/utils/walk.ts";

const CONTENT_DIR = "assets/content";
const DATA_DIR = "assets/content/_data";

// Catalog entries that intentionally lack backing markdown (aspirational
// catalog — see endpoints.yaml header). Update as docs land; the test
// ratchets to prevent silent regression in either direction.
// Baseline reset 2026-05-27 after the full content snapshot landed markdown for all prior entries.
const KNOWN_UNBACKED_DOC_IDS = new Set<string>([]);

async function loadEndpointMarkdown(): Promise<{ id: string; file: string }[]> {
  const files = await walk(CONTENT_DIR, (p) => p.endsWith(".md"));
  const out: { id: string; file: string }[] = [];
  for (const file of files) {
    const parsed = matter(await readFile(file, "utf8"));
    if (parsed.data["type"] === "endpoint") {
      const id = parsed.data["id"];
      if (typeof id !== "string" || id.length === 0) {
        throw new Error(`${file}: type=endpoint but missing/empty 'id' frontmatter`);
      }
      out.push({ id, file });
    }
  }
  return out;
}

describe("endpoint catalog integrity", () => {
  it("every endpoint markdown file has a matching catalog entry", async () => {
    const accessors = await loadAccessors(DATA_DIR);
    const catalogIds = new Set(accessors.endpoints.map((e) => e.doc_id));
    const docs = await loadEndpointMarkdown();

    const orphans = docs.filter((d) => !catalogIds.has(d.id));
    expect(
      orphans,
      `endpoint markdown without endpoints.yaml entry:\n${orphans
        .map((o) => `  - ${o.id} (${o.file})`)
        .join("\n")}`,
    ).toEqual([]);
  });

  it("unbacked catalog entries match the recorded baseline", async () => {
    const accessors = await loadAccessors(DATA_DIR);
    const docs = await loadEndpointMarkdown();
    const backedIds = new Set(docs.map((d) => d.id));

    const unbacked = accessors.endpoints.map((e) => e.doc_id).filter((id) => !backedIds.has(id));

    const surprises = unbacked.filter((id) => !KNOWN_UNBACKED_DOC_IDS.has(id));
    expect(
      surprises,
      `catalog entry added without markdown — add doc or update KNOWN_UNBACKED_DOC_IDS:\n${surprises
        .map((s) => `  - ${s}`)
        .join("\n")}`,
    ).toEqual([]);

    const filledIn = [...KNOWN_UNBACKED_DOC_IDS].filter((id) => backedIds.has(id));
    expect(
      filledIn,
      `markdown landed for previously-unbacked doc_ids — remove from KNOWN_UNBACKED_DOC_IDS:\n${filledIn
        .map((s) => `  - ${s}`)
        .join("\n")}`,
    ).toEqual([]);
  });
});
