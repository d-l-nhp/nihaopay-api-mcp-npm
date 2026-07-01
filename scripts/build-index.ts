import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import matter from "gray-matter";
import { walk } from "../src/utils/walk.ts";
import { type Chunk, chunkMarkdown, stripHtmlComments } from "./lib/chunker.ts";
import { type DocFrontmatter, buildHeaderChunk } from "./lib/header-chunk.ts";

export type BuildIndexOptions = {
  contentDir: string;
  outFile: string;
  includeDrafts?: boolean;
};

// Strips backticks so a heading like "Obtaining `open_id`" tokenizes the
// same as its prose mentions elsewhere.
function extractH2Headings(body: string): string[] {
  const out: string[] = [];
  for (const line of stripHtmlComments(body).split("\n")) {
    const m = line.match(/^##\s+(.+?)\s*$/);
    if (m?.[1]) out.push(m[1].replace(/`/g, ""));
  }
  return out;
}

export async function buildIndex(opts: BuildIndexOptions): Promise<void> {
  const includeDrafts = opts.includeDrafts ?? false;
  const files = await walk(opts.contentDir, (p) => p.endsWith(".md"));
  const chunks: Chunk[] = [];
  const hash = createHash("sha256");

  // Sorted-file order keeps chunk sequence and content_hash deterministic.
  const contents = await Promise.all(
    files.sort().map(async (file) => ({ file, raw: await readFile(file, "utf8") })),
  );
  for (const { file, raw } of contents) {
    const parsed = matter(raw);
    if (!includeDrafts && parsed.data["status"] === "draft") continue;
    const docId = String(parsed.data["id"] ?? "");
    if (!docId) throw new Error(`Missing id in frontmatter: ${file}`);
    const sectionHeadings = extractH2Headings(parsed.content);
    const header = buildHeaderChunk(
      { ...(parsed.data as DocFrontmatter), id: docId },
      sectionHeadings,
    );
    if (header) {
      chunks.push(header);
      hash.update(JSON.stringify(header));
    }
    const fileChunks = chunkMarkdown(docId, raw);
    if (!header && fileChunks.length === 0) {
      console.error(
        `nihaopay-mcp: doc "${docId}" (${file}) produced zero index chunks — it will be listed and fetchable but unreachable by search_docs`,
      );
    }
    for (const c of fileChunks) {
      chunks.push(c);
      hash.update(JSON.stringify(c));
    }
  }

  const out = {
    version: 1,
    content_hash: hash.digest("hex"),
    built_at: new Date().toISOString(),
    chunks,
  };
  await writeFile(opts.outFile, JSON.stringify(out));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const contentDir = process.argv[2] ?? "assets/content";
  const outFile = process.argv[3] ?? "assets/bm25-index.json";
  await buildIndex({ contentDir, outFile });
  console.log(`Wrote ${outFile}`);
}
