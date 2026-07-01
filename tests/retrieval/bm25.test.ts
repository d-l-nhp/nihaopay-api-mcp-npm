import { describe, expect, it } from "vitest";
import { buildBm25Index, search } from "../../src/retrieval/bm25.ts";

const docs = [
  { id: "ipn-mechanics", text: "IPN signature uses MD5. Verify by reconstructing the string." },
  { id: "auto-debit", text: "Auto debit contract signing uses a different signature." },
  { id: "refunds", text: "Issue a refund via POST /api/refund." },
];

describe("BM25 in-process index", () => {
  it("ranks the most relevant doc highest for a multi-term query", () => {
    const index = buildBm25Index(docs);
    const results = search(index, "IPN signature MD5", { limit: 3 });
    expect(results[0]?.id).toBe("ipn-mechanics");
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it("returns empty array when no terms match", () => {
    const index = buildBm25Index(docs);
    const results = search(index, "kubernetes pods", { limit: 5 });
    expect(results).toEqual([]);
  });

  it("scores are deterministic across runs", () => {
    const index = buildBm25Index(docs);
    const a = search(index, "refund", { limit: 1 });
    const b = search(index, "refund", { limit: 1 });
    expect(a).toEqual(b);
  });
});
