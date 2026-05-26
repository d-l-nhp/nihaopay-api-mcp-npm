import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadAccessors } from "./data/accessors.js";
import { loadDocPaths } from "./data/doc-paths.js";
import { loadBm25FromFile } from "./load-index.js";
import { buildServer } from "./server.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, "..");

async function main(): Promise<void> {
  const contentDir = resolve(PKG_ROOT, "assets/content");
  const dataDir = resolve(contentDir, "_data");
  const indexFile = resolve(PKG_ROOT, "assets/bm25-index.json");

  const [accessors, bm25, docPaths] = await Promise.all([
    loadAccessors(dataDir),
    loadBm25FromFile(indexFile),
    loadDocPaths(contentDir),
  ]);

  const server = buildServer({
    accessors,
    bm25,
    docPaths,
    confidenceThreshold: Number(process.env["NIHAOPAY_CONFIDENCE"] ?? "0.5"),
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("nihaopay-mcp boot failed:", err);
  process.exit(1);
});
