import { describe, expect, it } from "vitest";
import { loadDocCatalog } from "../../src/data/doc-catalog.ts";
import { fetchDocSchema, handleFetchDoc } from "../../src/tools/fetch-doc.ts";

describe("fetch_doc tool", () => {
  it("returns title and content for a known doc_id", async () => {
    const docCatalog = await loadDocCatalog("assets/content");
    const result = await handleFetchDoc({ doc_id: "reference/ipn-mechanics" }, docCatalog);
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.doc_id).toBe("reference/ipn-mechanics");
      expect(result.content).toContain("#");
    }
  });

  it("returns doc_not_found for an unknown doc_id", async () => {
    const docCatalog = await loadDocCatalog("assets/content");
    const result = await handleFetchDoc({ doc_id: "nope/missing" }, docCatalog);
    expect(result).toEqual({ error: "doc_not_found", doc_id: "nope/missing" });
  });

  it("rejects path-traversal-shaped doc_ids", () => {
    expect(fetchDocSchema.safeParse({ doc_id: "../etc/passwd" }).success).toBe(false);
  });
});
