import { readFile } from "node:fs/promises";
import { buildBm25Index } from "./retrieval/bm25.js";
import type { Bm25Index, IndexedDoc } from "./retrieval/types.js";

export type StoredChunk = {
  doc_id: string;
  heading: string;
  breadcrumbs: string[];
  text: string;
  is_code: boolean;
  is_table: boolean;
};

export type StoredIndex = {
  version: number;
  content_hash: string;
  built_at: string;
  chunks: StoredChunk[];
};

export async function loadBm25FromFile(path: string): Promise<Bm25Index> {
  const raw = await readFile(path, "utf8");
  const stored = JSON.parse(raw) as StoredIndex;
  if (stored.version !== 1) {
    throw new Error(`Unsupported index version ${stored.version}`);
  }
  const docs: IndexedDoc[] = stored.chunks.map((c, i) => ({
    // Chunk-level id so identical doc_ids stay distinct in the BM25 corpus.
    // search_docs strips the suffix after '#' before returning doc_id to the agent.
    id: `${c.doc_id}#${i}`,
    text: c.text,
  }));
  return buildBm25Index(docs);
}
