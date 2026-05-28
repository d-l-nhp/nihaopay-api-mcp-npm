import { describe, expect, it } from "vitest";
import { applyBoosts } from "../../src/retrieval/boosts.ts";

describe("applyBoosts", () => {
  it("adds +0.10 when query mentions an error code matching the chunk", () => {
    const hits = [{ id: "chunk-1", score: 0.5, text: "Error 400-23 is documented here." }];
    const result = applyBoosts(hits, "what does error 400-23 mean");
    expect(result[0]?.score).toBeCloseTo(0.6, 5);
    expect(result[0]?.boost_reasons).toContain("error_code:400-23");
  });

  it("adds +0.10 when query mentions an endpoint path matching the chunk", () => {
    const hits = [
      { id: "chunk-2", score: 0.4, text: "Call POST /v1.2/transactions/refund with these fields." },
    ];
    const result = applyBoosts(hits, "how do I call /v1.2/transactions/refund");
    expect(result[0]?.score).toBeCloseTo(0.5, 5);
    expect(result[0]?.boost_reasons).toContain("endpoint:/v1.2/transactions/refund");
  });

  it("extracts the /v1.2/... path from a full nihaopay or muskpay URL in the query", () => {
    const hits = [
      {
        id: "chunk-2b",
        score: 0.4,
        text: "POST https://api.nihaopay.com/v1.2/transactions/micropay",
      },
    ];
    const result = applyBoosts(hits, "what is https://api.nihaopay.com/v1.2/transactions/micropay");
    expect(result[0]?.score).toBeCloseTo(0.5, 5);
    expect(result[0]?.boost_reasons).toContain("endpoint:/v1.2/transactions/micropay");
  });

  it("does not boost when no exact match exists", () => {
    const hits = [{ id: "chunk-3", score: 0.7, text: "Some unrelated content." }];
    const result = applyBoosts(hits, "refund");
    expect(result[0]?.score).toBeCloseTo(0.7, 5);
    expect(result[0]?.boost_reasons).toEqual([]);
  });

  it("re-sorts hits after applying boosts", () => {
    const hits = [
      { id: "a", score: 0.6, text: "ordinary text" },
      { id: "b", score: 0.55, text: "mentions 400-23 directly" },
    ];
    const result = applyBoosts(hits, "what about 400-23");
    expect(result[0]?.id).toBe("b");
  });

  it("multiplies synopsis chunks by 1.7x when the synopsis covers the query", () => {
    const hits = [
      { id: "body#1", score: 5.0, text: "long body chunk with wechat and mini program terms" },
      { id: "syn#2", score: 4.0, text: "wechat mini program payment", is_synopsis: true },
    ];
    const result = applyBoosts(hits, "wechat mini program");
    expect(result[0]?.id).toBe("syn#2");
    expect(result[0]?.score).toBeCloseTo(6.8, 5);
    expect(result[0]?.boost_reasons.some((r) => r.startsWith("synopsis:"))).toBe(true);
  });

  it("treats hyphenated synopsis tokens as their component words for the precision gate", () => {
    // Synopsis text only has "mini-program" (one BM25 token). Query has bare
    // "mini" and "program". Hyphen expansion lets the precision gate count
    // them as covered.
    const hits = [
      { id: "syn#4", score: 4.0, text: "wechat mini-program payment", is_synopsis: true },
    ];
    const result = applyBoosts(hits, "wechat mini program payment");
    expect(result[0]?.boost_reasons.some((r) => r.startsWith("synopsis:"))).toBe(true);
    expect(result[0]?.score).toBeCloseTo(6.8, 5);
  });

  it("does not boost a synopsis that matches only stopword-stripped fragments of the query", () => {
    // Query "how do I get a test account" → content tokens ["test", "account"].
    // The synopsis only contains "account", so ratio = 0.5 < 0.6 → no boost.
    const hits = [
      { id: "syn#3", score: 8.0, text: "withdrawal history account", is_synopsis: true },
    ];
    const result = applyBoosts(hits, "how do I get a test account");
    expect(result[0]?.score).toBeCloseTo(8.0, 5);
    expect(result[0]?.boost_reasons).toEqual([]);
  });
});
