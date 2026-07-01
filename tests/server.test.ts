import { describe, expect, it } from "vitest";
import { loadAccessors } from "../src/data/accessors.ts";
import { loadDocCatalog } from "../src/data/doc-catalog.ts";
import { buildBm25Index } from "../src/retrieval/bm25.ts";
import { buildServer } from "../src/server.ts";

describe("buildServer", () => {
  it("constructs a server with the expected tool set registered", async () => {
    const [accessors, docCatalog] = await Promise.all([
      loadAccessors("assets/content/_data"),
      loadDocCatalog("assets/content"),
    ]);
    const bm25 = buildBm25Index([{ id: "x", text: "y" }]);
    const server = buildServer({
      accessors,
      bm25,
      docCatalog,
      confidenceThreshold: 0.5,
      serverVersion: "0.0.0-test",
    });
    expect(server).toBeDefined();
  });
});
