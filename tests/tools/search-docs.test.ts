import { describe, expect, it } from "vitest";
import { buildBm25Index } from "../../src/retrieval/bm25.ts";
import { handleSearchDocs, searchDocsSchema } from "../../src/tools/search-docs.ts";

describe("search_docs tool", () => {
  it("schema enforces limit bounds", () => {
    expect(searchDocsSchema.safeParse({ query: "x", limit: 0 }).success).toBe(false);
    expect(searchDocsSchema.safeParse({ query: "x", limit: 11 }).success).toBe(false);
    expect(searchDocsSchema.safeParse({ query: "x", limit: 5 }).success).toBe(true);
  });

  it("returns results with boost reasons when query mentions an error code", async () => {
    const index = buildBm25Index([
      { id: "errors/list", text: "Error 400-23 means signature mismatch." },
      { id: "intro/welcome", text: "Welcome to Nihaopay." },
    ]);
    const result = await handleSearchDocs({ query: "what is 400-23", limit: 5 }, index, {
      confidenceThreshold: 0.5,
    });
    expect(result.results[0]?.doc_id).toBe("errors/list");
    expect(result.results[0]?.boost_reasons).toContain("error_code:400-23");
  });

  it("attaches a hint when top score is below threshold", async () => {
    const index = buildBm25Index([
      { id: "errors/list", text: "Error 400-23 means signature mismatch." },
    ]);
    const result = await handleSearchDocs({ query: "kubernetes", limit: 5 }, index, {
      confidenceThreshold: 0.5,
    });
    expect(result.hint?.suggested_tool).toBe("rephrase");
  });
});
