import type {
  Bm25Index,
  IndexedDoc,
  SearchHit,
  SearchOptions,
} from "./types.js";

const BM25_K1 = 1.5;
const BM25_B = 0.75;

export function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}-]*/gu) ?? [];
}

export function buildBm25Index(docs: ReadonlyArray<IndexedDoc>): Bm25Index {
  const termFreqs: Array<Map<string, number>> = [];
  const docLengths: number[] = [];

  for (const doc of docs) {
    const tokens = tokenize(doc.text);
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    termFreqs.push(tf);
    docLengths.push(tokens.length);
  }

  const totalDocs = docs.length || 1;
  const totalLen = docLengths.reduce((a, n) => a + n, 0);
  const avgDocLength = totalLen / totalDocs;

  const df = new Map<string, number>();
  for (const tf of termFreqs) {
    for (const term of tf.keys()) {
      df.set(term, (df.get(term) ?? 0) + 1);
    }
  }

  // Okapi BM25 IDF with smoothing: ln((N - n + 0.5) / (n + 0.5) + 1).
  const idf = new Map<string, number>();
  for (const [term, n] of df) {
    idf.set(term, Math.log((totalDocs - n + 0.5) / (n + 0.5) + 1));
  }

  return {
    docs,
    termFreqs,
    docLengths,
    idf,
    avgDocLength,
    totalDocs,
  };
}

function scoreDoc(
  queryTokens: string[],
  docIdx: number,
  index: Bm25Index,
): number {
  const tf = index.termFreqs[docIdx];
  const len = index.docLengths[docIdx];
  if (!tf || len === undefined) return 0;

  const lenNorm = 1 - BM25_B + BM25_B * (len / (index.avgDocLength || 1));
  let score = 0;

  for (const term of queryTokens) {
    const termFreq = tf.get(term);
    if (!termFreq) continue;
    const idf = index.idf.get(term) ?? 0;
    if (idf === 0) continue;
    const numer = termFreq * (BM25_K1 + 1);
    const denom = termFreq + BM25_K1 * lenNorm;
    score += idf * (numer / denom);
  }

  return score;
}

export function search(
  index: Bm25Index,
  query: string,
  opts: SearchOptions,
): SearchHit[] {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  const scored: SearchHit[] = [];
  for (let i = 0; i < index.docs.length; i++) {
    const s = scoreDoc(queryTokens, i, index);
    if (s > 0) {
      const doc = index.docs[i];
      if (doc) scored.push({ id: doc.id, score: s });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, opts.limit);
}
