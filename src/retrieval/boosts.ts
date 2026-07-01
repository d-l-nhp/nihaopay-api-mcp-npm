import { tokenize } from "./bm25.js";
import { ENDPOINT_RE as ENDPOINT_BASE, ERROR_CODE_RE as ERROR_CODE_BASE } from "./patterns.js";

// Endpoint match extracts the path only, matching the form stored in chunk
// text — so a bare path or a full pasted URL both hit.
const ERROR_CODE_RE = new RegExp(ERROR_CODE_BASE.source, "g");
const ENDPOINT_RE = new RegExp(ENDPOINT_BASE.source, "g");
const BOOST = 0.1;
// Synopses are short but term-dense; without a multiplier they lose on raw
// frequency to longer body chunks from less-relevant docs.
const SYNOPSIS_MULTIPLIER = 1.7;
// Gated on match ratio so a short synopsis can't win by sharing just one
// term (e.g. "test account" → withdrawal-history's "account").
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

// Only used for match-ratio gating, not BM25 scoring — a synopsis with
// "mini-program" should still satisfy a query term "mini" or "program".
function expandHyphens(tokens: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const t of tokens) {
    out.add(t);
    if (t.includes("-")) for (const p of t.split("-")) if (p) out.add(p);
  }
  return out;
}

// Plain .includes() would match "400-23" inside "400-235", or one endpoint
// path inside a longer sibling path. leadExclude/trailExclude are the chars
// barred from touching the match (empty = unchecked); endpoints only guard
// the trailing side since a "/vN/..." path is unambiguous regardless of prefix.
function includesLiteral(
  text: string,
  literal: string,
  leadExclude: string,
  trailExclude: string,
): boolean {
  const escaped = literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const lead = leadExclude ? `(?<![${leadExclude}])` : "";
  const trail = trailExclude ? `(?![${trailExclude}])` : "";
  return new RegExp(`${lead}${escaped}${trail}`).test(text);
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
      if (includesLiteral(h.text, code, "\\w", "\\w")) {
        score += BOOST;
        reasons.push(`error_code:${code}`);
      }
    }
    for (const ep of queryEndpoints) {
      if (includesLiteral(h.text, ep, "", "\\w\\-")) {
        score += BOOST;
        reasons.push(`endpoint:${ep}`);
      }
    }
    return { ...h, score, boost_reasons: reasons };
  });

  return [...boosted].sort((a, b) => b.score - a.score);
}
