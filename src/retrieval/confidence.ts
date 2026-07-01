import { ENDPOINT_RE, ERROR_CODE_RE } from "./patterns.js";

export type Hint = {
  suggested_tool: "get_error_code" | "list_endpoints" | "rephrase";
  suggested_arg?: string;
  message: string;
};

export type BuildHintArgs = { topScore: number; query: string; threshold: number };

// Query shape overrides score — small-corpus BM25 gives misleading mid-range
// scores; threshold only gates the "rephrase" fallback.
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
