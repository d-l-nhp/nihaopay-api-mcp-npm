import { describe, expect, it } from "vitest";
import { buildHint } from "../../src/retrieval/confidence.ts";

describe("buildHint", () => {
  it("returns null when top score clears threshold and query has no special shape", () => {
    expect(buildHint({ topScore: 1.2, query: "anything", threshold: 0.5 })).toBeNull();
  });

  it("suggests get_error_code even when search score is strong (pattern-first)", () => {
    const hint = buildHint({ topScore: 100, query: "what about 400-23", threshold: 0.5 });
    expect(hint?.suggested_tool).toBe("get_error_code");
    expect(hint?.suggested_arg).toBe("400-23");
  });

  it("suggests list_endpoints even when search score is strong (pattern-first)", () => {
    const hint = buildHint({
      topScore: 100,
      query: "calling /v1.2/transactions/refund",
      threshold: 0.5,
    });
    expect(hint?.suggested_tool).toBe("list_endpoints");
  });

  it("suggests get_error_code when query mentions an error code shape", () => {
    const hint = buildHint({ topScore: 0.1, query: "tell me about 400-23", threshold: 0.5 });
    expect(hint?.suggested_tool).toBe("get_error_code");
    expect(hint?.suggested_arg).toBe("400-23");
  });

  it("suggests list_endpoints when query mentions an endpoint path shape", () => {
    const hint = buildHint({
      topScore: 0.2,
      query: "how to use /v1.2/transactions/refund",
      threshold: 0.5,
    });
    expect(hint?.suggested_tool).toBe("list_endpoints");
  });

  it("suggests list_endpoints for a full URL on either nihaopay or muskpay host", () => {
    const a = buildHint({
      topScore: 0.2,
      query: "https://api.nihaopay.com/v1.2/transactions/micropay",
      threshold: 0.5,
    });
    expect(a?.suggested_tool).toBe("list_endpoints");
    const b = buildHint({
      topScore: 0.2,
      query: "https://api.muskpay.io/v1.2/cardpay/checkout",
      threshold: 0.5,
    });
    expect(b?.suggested_tool).toBe("list_endpoints");
  });

  it("falls back to a rephrase hint when no specific tool fits", () => {
    const hint = buildHint({ topScore: 0.0, query: "random words", threshold: 0.5 });
    expect(hint?.suggested_tool).toBe("rephrase");
    expect(hint?.message).toMatch(/rephrase/i);
  });
});
