import { z } from "zod";
import { search } from "../retrieval/bm25.js";
import { applyBoosts } from "../retrieval/boosts.js";
import { buildHint, type Hint } from "../retrieval/confidence.js";
import type { Bm25Index } from "../retrieval/types.js";

export const searchDocsSchema = z.object({
  query: z.string().min(1).max(512),
  product: z.string().optional(),
  limit: z.number().int().min(1).max(10).default(5),
});

export type SearchDocsArgs = z.infer<typeof searchDocsSchema>;
export type SearchDocsResult = {
  results: Array<{
    doc_id: string;
    score: number;
    boost_reasons: string[];
    snippet: string;
  }>;
  hint: Hint | null;
};

export type SearchOptions = { confidenceThreshold: number };

export async function handleSearchDocs(
  args: SearchDocsArgs,
  index: Bm25Index,
  opts: SearchOptions,
): Promise<SearchDocsResult> {
  const limit = args.limit;
  // Over-fetch so boost re-sorting has signal beyond the top-k cutoff.
  const raw = search(index, args.query, { limit: limit * 2 });
  const enriched = raw.map((h) => {
    const doc = index.docs.find((d) => d.id === h.id);
    return { id: h.id, score: h.score, text: doc?.text ?? "" };
  });
  const boosted = applyBoosts(enriched, args.query).slice(0, limit);
  const results = boosted.map((b) => ({
    // BM25 ids are chunk-level ("doc_id#chunkIdx") to keep the corpus distinct;
    // strip the suffix when returning to the agent so doc_ids round-trip into fetch_doc.
    doc_id: b.id.split("#")[0] ?? b.id,
    score: Number(b.score.toFixed(4)),
    boost_reasons: b.boost_reasons,
    snippet: b.text.slice(0, 240),
  }));
  const hint = buildHint({
    topScore: results[0]?.score ?? 0,
    query: args.query,
    threshold: opts.confidenceThreshold,
  });
  return { results, hint };
}
