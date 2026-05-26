const ERROR_CODE_RE = /\b([1-5]\d{2}-\d{2,3})\b/g;
const ENDPOINT_RE = /(\/api\/[\w\-/]+)/g;
const BOOST = 0.1;

export type Hit = { id: string; score: number; text: string };
export type BoostedHit = Hit & { boost_reasons: string[] };

export function applyBoosts(hits: ReadonlyArray<Hit>, query: string): BoostedHit[] {
  const queryCodes = [...query.matchAll(ERROR_CODE_RE)]
    .map((m) => m[1])
    .filter((s): s is string => Boolean(s));
  const queryEndpoints = [...query.matchAll(ENDPOINT_RE)]
    .map((m) => m[1])
    .filter((s): s is string => Boolean(s));

  const boosted = hits.map((h): BoostedHit => {
    const reasons: string[] = [];
    let score = h.score;
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
