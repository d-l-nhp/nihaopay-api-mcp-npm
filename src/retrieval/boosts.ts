import { tokenize } from "./bm25.js";

const ERROR_CODE_RE = /\b([1-5]\d{2}-\d{2,3})\b/g;
// Matches Nihaopay's path shape (e.g. /v1.2/transactions/micropay) whether
// the user pastes a bare path or a full URL like
// https://api.nihaopay.com/v1.2/... or https://api.muskpay.io/v1.2/...
// The extracted substring is the path only, which is the form that appears
// inside indexed chunk text — so h.text.includes(ep) matches either form.
const ENDPOINT_RE = /(\/v\d+(?:\.\d+)?\/[\w\-/]+)/g;
const BOOST = 0.1;
// Synopsis chunks are short by design but carry the highest-signal terms
// (title, tags, summary, quirks, endpoint). Without a multiplier they lose
// on raw term frequency to longer body chunks of less-relevant docs.
const SYNOPSIS_MULTIPLIER = 1.7;
// Gate the multiplier on match-quality so a synopsis only gets boosted when
// it covers most of the query's content terms. Prevents short, dense synopses
// from winning queries where they only share a single common term (e.g.
// "test account" → withdrawal-history's "account").
const SYNOPSIS_PRECISION_THRESHOLD = 0.6;

const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "of",
  "to",
  "in",
  "on",
  "at",
  "by",
  "for",
  "with",
  "from",
  "into",
  "as",
  "how",
  "what",
  "where",
  "when",
  "why",
  "which",
  "who",
  "do",
  "does",
  "did",
  "i",
  "you",
  "we",
  "they",
  "it",
  "me",
  "and",
  "or",
  "but",
  "if",
  "then",
  "so",
  "than",
  "such",
  "can",
  "could",
  "should",
  "would",
  "may",
  "might",
  "will",
  "this",
  "that",
  "these",
  "those",
  "any",
  "all",
  "some",
  "get",
  "use",
  "using",
]);

function contentTokens(query: string): string[] {
  return tokenize(query).filter((t) => !STOPWORDS.has(t));
}

// Hyphen-expand so a synopsis containing "mini-program" satisfies a query
// term "mini" or "program". BM25 scoring itself keeps the original tokens.
function expandHyphens(tokens: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const t of tokens) {
    out.add(t);
    if (t.includes("-")) for (const p of t.split("-")) if (p) out.add(p);
  }
  return out;
}

function matchRatio(text: string, queryTokens: ReadonlyArray<string>): number {
  if (queryTokens.length === 0) return 0;
  const present = expandHyphens(tokenize(text));
  const expandedQuery = expandHyphens(queryTokens);
  let matched = 0;
  for (const t of expandedQuery) if (present.has(t)) matched++;
  return matched / expandedQuery.size;
}

export type Hit = { id: string; score: number; text: string; is_synopsis?: boolean };
export type BoostedHit = Hit & { boost_reasons: string[] };

export function applyBoosts(hits: ReadonlyArray<Hit>, query: string): BoostedHit[] {
  const queryCodes = [...query.matchAll(ERROR_CODE_RE)]
    .map((m) => m[1])
    .filter((s): s is string => Boolean(s));
  const queryEndpoints = [...query.matchAll(ENDPOINT_RE)]
    .map((m) => m[1])
    .filter((s): s is string => Boolean(s));
  const queryContent = contentTokens(query);

  const boosted = hits.map((h): BoostedHit => {
    const reasons: string[] = [];
    let score = h.score;
    if (h.is_synopsis) {
      const ratio = matchRatio(h.text, queryContent);
      if (ratio >= SYNOPSIS_PRECISION_THRESHOLD) {
        score *= SYNOPSIS_MULTIPLIER;
        reasons.push(`synopsis:${ratio.toFixed(2)}`);
      }
    }
    for (const code of queryCodes) {
      if (h.text.includes(code)) {
        score += BOOST;
        reasons.push(`error_code:${code}`);
      }
    }
    for (const ep of queryEndpoints) {
      if (h.text.includes(ep)) {
        score += BOOST;
        reasons.push(`endpoint:${ep}`);
      }
    }
    return { ...h, score, boost_reasons: reasons };
  });

  return [...boosted].sort((a, b) => b.score - a.score);
}
