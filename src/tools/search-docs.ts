import { z } from "zod";
import type { DocCatalogEntry } from "../data/doc-catalog.js";
import { search } from "../retrieval/bm25.js";
import { applyBoosts } from "../retrieval/boosts.js";
import { type Hint, buildHint } from "../retrieval/confidence.js";
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

export type SearchOptions = {
  confidenceThreshold: number;
  docCatalog: ReadonlyMap<string, DocCatalogEntry>;
};

// BM25 chunks carry no product field, so filtering by product means
// cross-referencing the doc catalog by the chunk's bare doc_id.
function bareDocId(chunkId: string): string {
  return chunkId.split("#")[0] ?? chunkId;
}

export async function handleSearchDocs(
  args: SearchDocsArgs,
  index: Bm25Index,
  opts: SearchOptions,
): Promise<SearchDocsResult> {
  // With a product filter, fetch everything — a narrow over-fetch could drop
  // every hit for that product before the filter runs.
  const rawLimit = args.product ? index.totalDocs : args.limit * 2;
  const raw = search(index, args.query, { limit: rawLimit });
  const docsById = new Map(index.docs.map((d) => [d.id, d]));
  const enriched = raw
    .map((h) => {
      const doc = docsById.get(h.id);
      return {
        id: h.id,
        score: h.score,
        text: doc?.text ?? "",
        is_synopsis: doc?.is_synopsis ?? false,
      };
    })
    .filter(
      (h) =>
        !args.product ||
        opts.docCatalog.get(bareDocId(h.id))?.product?.toLowerCase() === args.product.toLowerCase(),
    );
  const boosted = applyBoosts(enriched, args.query).slice(0, args.limit);
  const results = boosted.map((b) => ({
    doc_id: bareDocId(b.id),
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
