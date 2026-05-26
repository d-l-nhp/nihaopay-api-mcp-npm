import { describe, expect, it } from "vitest";
import { loadAccessors } from "../../src/data/accessors.ts";
import { handleListEndpoints, listEndpointsSchema } from "../../src/tools/list-endpoints.ts";

describe("list_endpoints tool", () => {
  it("schema accepts empty args, product, method", () => {
    expect(listEndpointsSchema.safeParse({}).success).toBe(true);
    expect(listEndpointsSchema.safeParse({ method: "POST" }).success).toBe(true);
    expect(listEndpointsSchema.safeParse({ method: "DELETE" }).success).toBe(false);
  });

  it("returns the full catalog when no filters", async () => {
    const acc = await loadAccessors("assets/content/_data");
    const result = await handleListEndpoints({}, acc);
    expect(result.length).toBe(acc.endpoints.length);
  });

  it("filters by method", async () => {
    const acc = await loadAccessors("assets/content/_data");
    const result = await handleListEndpoints({ method: "POST" }, acc);
    expect(result.every((e) => e.method === "POST")).toBe(true);
  });

  it("sorts by doc_id deterministically", async () => {
    const acc = await loadAccessors("assets/content/_data");
    const a = await handleListEndpoints({}, acc);
    const b = await handleListEndpoints({}, acc);
    expect(a.map((e) => e.doc_id)).toEqual(b.map((e) => e.doc_id));
  });
});
