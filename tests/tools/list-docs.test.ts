import { describe, expect, it } from "vitest";
import { loadDocCatalog } from "../../src/data/doc-catalog.ts";
import { handleListDocs, listDocsSchema } from "../../src/tools/list-docs.ts";

describe("list_docs tool", () => {
  it("returns every catalogued doc when no filters are provided", async () => {
    const catalog = await loadDocCatalog("assets/content");
    const result = await handleListDocs({}, catalog);
    expect(result.total).toBe(catalog.size);
    expect(result.docs.length).toBe(catalog.size);
    const ids = result.docs.map((d) => d.doc_id);
    expect(ids).toEqual([...ids].sort());
  });

  it("filters by product", async () => {
    const catalog = await loadDocCatalog("assets/content");
    const result = await handleListDocs({ product: "securepay" }, catalog);
    expect(result.docs.length).toBeGreaterThan(0);
    expect(result.docs.every((d) => d.product === "securepay")).toBe(true);
  });

  it("filters by doc_id prefix", async () => {
    const catalog = await loadDocCatalog("assets/content");
    const result = await handleListDocs({ prefix: "payment-products/securepay/" }, catalog);
    expect(result.docs.length).toBeGreaterThan(0);
    expect(result.docs.every((d) => d.doc_id.startsWith("payment-products/securepay/"))).toBe(true);
  });

  it("surfaces the dedicated wechat-miniprogram doc so agents do not have to guess from the URL path", async () => {
    const catalog = await loadDocCatalog("assets/content");
    const result = await handleListDocs({ prefix: "payment-products/securepay/" }, catalog);
    const ids = result.docs.map((d) => d.doc_id);
    // The doc Claude Desktop hallucinated ("...micropay") never existed;
    // the actual doc_id is wechat-miniprogram. list_docs must surface it.
    expect(ids).toContain("payment-products/securepay/wechat-miniprogram");
    expect(ids).not.toContain("payment-products/securepay/micropay");
  });

  it("schema accepts empty input", () => {
    expect(listDocsSchema.safeParse({}).success).toBe(true);
  });
});
