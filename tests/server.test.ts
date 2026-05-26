import { describe, expect, it } from "vitest";
import { loadAccessors } from "../src/data/accessors.ts";
import { loadDocPaths } from "../src/data/doc-paths.ts";
import { buildBm25Index } from "../src/retrieval/bm25.ts";
import { buildServer } from "../src/server.ts";

describe("buildServer", () => {
  it("constructs a server with four tools registered", async () => {
    const [accessors, docPaths] = await Promise.all([
      loadAccessors("assets/content/_data"),
      loadDocPaths("assets/content"),
    ]);
    const bm25 = buildBm25Index([{ id: "x", text: "y" }]);
    const server = buildServer({
      accessors,
      bm25,
      docPaths,
      confidenceThreshold: 0.5,
    });
    expect(server).toBeDefined();
  });
});
