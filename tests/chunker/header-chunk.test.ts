import { describe, expect, it } from "vitest";
import { buildHeaderChunk } from "../../scripts/lib/header-chunk.ts";

describe("buildHeaderChunk", () => {
  it("concentrates title, summary, tags, quirks, and endpoint path into one chunk", () => {
    const chunk = buildHeaderChunk({
      id: "payment-products/securepay/wechat-miniprogram",
      title: "WeChat Mini-Program Payment",
      type: "endpoint",
      product: "securepay",
      summary: "POST /v1.2/transactions/micropay — pre-pay request for WeChat Mini-Programs.",
      tags: ["payment", "wechatpay", "mini-program", "wx-request-payment"],
      quirks: ["open_id_required_via_wx_login_first"],
      endpoint: { method: "POST", path: "/v1.2/transactions/micropay" },
    });
    expect(chunk).not.toBeNull();
    expect(chunk?.heading).toBe("[Synopsis]");
    expect(chunk?.text).toContain("WeChat Mini-Program Payment");
    expect(chunk?.text).toContain("POST /v1.2/transactions/micropay");
    expect(chunk?.text).toContain("mini-program");
    expect(chunk?.text).toContain("wx-request-payment");
    expect(chunk?.text).toContain("open_id_required_via_wx_login_first");
  });

  it("returns null when frontmatter has no indexable fields", () => {
    expect(buildHeaderChunk({ id: "stub/empty" })).toBeNull();
  });

  it("handles endpoint path without method", () => {
    const chunk = buildHeaderChunk({
      id: "x/y",
      title: "T",
      endpoint: { path: "/v1.2/foo" },
    });
    expect(chunk?.text).toContain("/v1.2/foo");
    expect(chunk?.text).not.toContain("undefined");
  });

  it("appends section headings so terms living only in an H2 are indexed", () => {
    const chunk = buildHeaderChunk(
      { id: "x/y", title: "WeChat Mini-Program Payment", tags: ["wechatpay"] },
      ["Definition", "Integration flow", "Obtaining open_id"],
    );
    expect(chunk?.text).toContain("Integration flow");
    expect(chunk?.text).toContain("Obtaining open_id");
  });
});
