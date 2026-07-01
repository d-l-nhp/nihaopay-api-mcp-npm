import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadAccessors } from "./data/accessors.js";
import { loadDocCatalog } from "./data/doc-catalog.js";
import { loadBm25FromFile } from "./load-index.js";
import { buildServer } from "./server.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, "..");

async function readPackageVersion(): Promise<string> {
  const raw = await readFile(resolve(PKG_ROOT, "package.json"), "utf8");
  const parsed = JSON.parse(raw) as { version?: string };
  return parsed.version ?? "0.0.0";
}

const DEFAULT_CONFIDENCE_THRESHOLD = 4.0;

export function readConfidenceThreshold(): number {
  const raw = process.env["NIHAOPAY_CONFIDENCE"];
  if (raw === undefined) return DEFAULT_CONFIDENCE_THRESHOLD;
  const parsed = Number(raw);
  if (Number.isNaN(parsed)) {
    console.error(
      `nihaopay-mcp: NIHAOPAY_CONFIDENCE="${raw}" is not a number, falling back to ${DEFAULT_CONFIDENCE_THRESHOLD}`,
    );
    return DEFAULT_CONFIDENCE_THRESHOLD;
  }
  return parsed;
}

async function main(): Promise<void> {
  const contentDir = resolve(PKG_ROOT, "assets/content");
  const dataDir = resolve(contentDir, "_data");
  const indexFile = resolve(PKG_ROOT, "assets/bm25-index.json");

  const [accessors, bm25, docCatalog, serverVersion] = await Promise.all([
    loadAccessors(dataDir),
    loadBm25FromFile(indexFile),
    loadDocCatalog(contentDir),
    readPackageVersion(),
  ]);

  const server = buildServer({
    accessors,
    bm25,
    docCatalog,
    serverVersion,
    // Calibrated against this corpus: good matches score 7-35, weak/off-topic ones 0-3.
    confidenceThreshold: readConfidenceThreshold(),
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("nihaopay-mcp boot failed:", err);
  process.exit(1);
});
