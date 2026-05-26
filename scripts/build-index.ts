import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import matter from "gray-matter";
import { walk } from "../src/utils/walk.ts";
import { type Chunk, chunkMarkdown } from "./lib/chunker.ts";

export type BuildIndexOptions = {
  contentDir: string;
  outFile: string;
  includeDrafts?: boolean;
};

export async function buildIndex(opts: BuildIndexOptions): Promise<void> {
  const includeDrafts = opts.includeDrafts ?? false;
  const files = await walk(opts.contentDir, (p) => p.endsWith(".md"));
  const chunks: Chunk[] = [];
  const hash = createHash("sha256");

  for (const file of files.sort()) {
    const raw = await readFile(file, "utf8");
    const parsed = matter(raw);
    if (!includeDrafts && parsed.data["status"] === "draft") continue;
    const docId = String(parsed.data["id"] ?? "");
    if (!docId) throw new Error(`Missing id in frontmatter: ${file}`);
    const fileChunks = chunkMarkdown(docId, raw);
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
