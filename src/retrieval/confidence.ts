const ERROR_CODE_RE = /\b([1-5]\d{2}-\d{2,3})\b/;
const ENDPOINT_RE = /\/v\d+(?:\.\d+)?\/[\w\-/]+/;

export type Hint = {
  suggested_tool: "get_error_code" | "list_endpoints" | "rephrase";
  suggested_arg?: string;
  message: string;
};

export type BuildHintArgs = { topScore: number; query: string; threshold: number };

// Pattern-first hint: when the query *shape* points at a dedicated tool, suggest
// it regardless of BM25 score. BM25 in a small corpus often returns mid-range
// scores for off-topic queries on incidental token overlap — so a pure
// score-threshold approach misses cases the agent would benefit from routing.
// The threshold only gates the generic "rephrase" fallback.
export function buildHint(args: BuildHintArgs): Hint | null {
  const codeMatch = args.query.match(ERROR_CODE_RE);
  if (codeMatch?.[1]) {
    return {
      suggested_tool: "get_error_code",
      suggested_arg: codeMatch[1],
      message: `Query references error code ${codeMatch[1]}; get_error_code returns the canonical entry directly.`,
    };
  }

  if (ENDPOINT_RE.test(args.query)) {
    return {
      suggested_tool: "list_endpoints",
      message: "Query mentions an endpoint path; list_endpoints returns the catalog with filters.",
    };
  }

  if (args.topScore >= args.threshold) return null;

  return {
    suggested_tool: "rephrase",
    message:
      "No strong match — rephrase the query with concrete product or endpoint names, or call list_endpoints to explore.",
  };
}
