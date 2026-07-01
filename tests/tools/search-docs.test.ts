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
      docCatalog: new Map(),
    });
    expect(result.results[0]?.doc_id).toBe("errors/list");
    expect(result.results[0]?.boost_reasons).toContain("error_code:400-23");
  });

  it("does not boost a code that only appears as a substring of a longer code", async () => {
    const index = buildBm25Index([
      { id: "errors/long-code", text: "Error 400-235 means something else entirely." },
      { id: "intro/welcome", text: "Welcome to Nihaopay signature guide." },
    ]);
    const result = await handleSearchDocs({ query: "what is 400-23", limit: 5 }, index, {
      confidenceThreshold: 0.5,
      docCatalog: new Map(),
    });
    const longCodeHit = result.results.find((r) => r.doc_id === "errors/long-code");
    expect(longCodeHit?.boost_reasons ?? []).not.toContain("error_code:400-23");
  });

  it("attaches a hint when top score is below threshold", async () => {
    const index = buildBm25Index([
      { id: "errors/list", text: "Error 400-23 means signature mismatch." },
    ]);
    const result = await handleSearchDocs({ query: "kubernetes", limit: 5 }, index, {
      confidenceThreshold: 0.5,
      docCatalog: new Map(),
    });
    expect(result.hint?.suggested_tool).toBe("rephrase");
  });

  it("filters results by product", async () => {
    const index = buildBm25Index([
      { id: "securepay/refund", text: "Refund a securepay transaction." },
      { id: "cardpay/refund", text: "Refund a cardpay transaction." },
    ]);
    const docCatalog = new Map([
      ["securepay/refund", { path: "/x", product: "securepay" }],
      ["cardpay/refund", { path: "/y", product: "cardpay" }],
    ]);
    const result = await handleSearchDocs(
      { query: "refund transaction", limit: 5, product: "cardpay" },
      index,
      { confidenceThreshold: 0.5, docCatalog },
    );
    expect(result.results.map((r) => r.doc_id)).toEqual(["cardpay/refund"]);
  });

  it("filters results by product case-insensitively", async () => {
    const index = buildBm25Index([
      { id: "securepay/refund", text: "Refund a securepay transaction." },
      { id: "cardpay/refund", text: "Refund a cardpay transaction." },
    ]);
    const docCatalog = new Map([
      ["securepay/refund", { path: "/x", product: "securepay" }],
      ["cardpay/refund", { path: "/y", product: "cardpay" }],
    ]);
    const result = await handleSearchDocs(
      { query: "refund transaction", limit: 5, product: "CardPay" },
      index,
      { confidenceThreshold: 0.5, docCatalog },
    );
    expect(result.results.map((r) => r.doc_id)).toEqual(["cardpay/refund"]);
  });
});
