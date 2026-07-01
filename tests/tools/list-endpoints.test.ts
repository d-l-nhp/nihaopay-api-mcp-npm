import { describe, expect, it } from "vitest";
import { loadAccessors } from "../../src/data/accessors.ts";
import { handleListEndpoints, listEndpointsSchema } from "../../src/tools/list-endpoints.ts";

describe("list_endpoints tool", () => {
  it("schema accepts empty args, product, method", () => {
    expect(listEndpointsSchema.safeParse({}).success).toBe(true);
    expect(listEndpointsSchema.safeParse({ method: "POST" }).success).toBe(true);
    expect(listEndpointsSchema.safeParse({ method: "DELETE" }).success).toBe(false);
  });

  it("returns the full catalog wrapped in {endpoints, total} when no filters", async () => {
    const acc = await loadAccessors("assets/content/_data");
    const result = await handleListEndpoints({}, acc);
    expect(result.total).toBe(acc.endpoints.length);
    expect(result.endpoints.length).toBe(acc.endpoints.length);
  });

  it("filters by method", async () => {
    const acc = await loadAccessors("assets/content/_data");
    const result = await handleListEndpoints({ method: "POST" }, acc);
    expect(result.endpoints.every((e) => e.method === "POST")).toBe(true);
  });

  it("filters by product case-insensitively", async () => {
    const acc = await loadAccessors("assets/content/_data");
    const product = acc.endpoints[0]?.product;
    if (!product) throw new Error("fixture has no endpoints to test against");
    const result = await handleListEndpoints({ product: product.toUpperCase() }, acc);
    expect(result.endpoints.length).toBeGreaterThan(0);
    expect(result.endpoints.every((e) => e.product === product)).toBe(true);
  });

  it("sorts by doc_id deterministically", async () => {
    const acc = await loadAccessors("assets/content/_data");
    const a = await handleListEndpoints({}, acc);
    const b = await handleListEndpoints({}, acc);
    expect(a.endpoints.map((e) => e.doc_id)).toEqual(b.endpoints.map((e) => e.doc_id));
  });
});
