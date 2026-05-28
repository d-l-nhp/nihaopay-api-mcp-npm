import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadAccessors } from "./data/accessors.js";
import { loadDocCatalog } from "./data/doc-catalog.js";
import { loadBm25FromFile } from "./load-index.js";
import { buildServer } from "./server.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, "..");

async function main(): Promise<void> {
  const contentDir = resolve(PKG_ROOT, "assets/content");
  const dataDir = resolve(contentDir, "_data");
  const indexFile = resolve(PKG_ROOT, "assets/bm25-index.json");

  const [accessors, bm25, docCatalog] = await Promise.all([
    loadAccessors(dataDir),
    loadBm25FromFile(indexFile),
    loadDocCatalog(contentDir),
  ]);

  const server = buildServer({
    accessors,
    bm25,
    docCatalog,
    // Calibrated against this corpus's post-boost BM25 score distribution
    // (good matches land 7-35, weak/off-topic matches land 0-3). Below this
    // value the confidence hint fires — suggesting get_error_code,
    // list_endpoints, or rephrase depending on the query shape.
    confidenceThreshold: Number(process.env["NIHAOPAY_CONFIDENCE"] ?? "4.0"),
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("nihaopay-mcp boot failed:", err);
  process.exit(1);
});
