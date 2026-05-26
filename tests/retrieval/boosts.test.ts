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
    const hits = [{ id: "chunk-2", score: 0.4, text: "Call POST /api/refund with these fields." }];
    const result = applyBoosts(hits, "how do I call /api/refund");
    expect(result[0]?.score).toBeCloseTo(0.5, 5);
    expect(result[0]?.boost_reasons).toContain("endpoint:/api/refund");
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
});
