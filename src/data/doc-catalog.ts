import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import matter from "gray-matter";
import { walk } from "../utils/walk.js";

export type DocCatalogEntry = {
  path: string;
  title?: string;
  summary?: string;
  product?: string;
  type?: string;
  status?: string;
  tags?: ReadonlyArray<string>;
};

export async function loadDocCatalog(contentDir: string): Promise<Map<string, DocCatalogEntry>> {
  const files = await walk(contentDir, (p) => p.endsWith(".md"));
  // Map is built in file order, not read-completion order, so the duplicate-id
  // warning below is deterministic.
  const contents = await Promise.all(
    files.map(async (file) => ({ file, raw: await readFile(file, "utf8") })),
  );
  const map = new Map<string, DocCatalogEntry>();
  for (const { file, raw } of contents) {
    const parsed = matter(raw);
    const id = parsed.data["id"];
    if (typeof id !== "string" || id.length === 0) continue;
    const entry: DocCatalogEntry = { path: resolve(file) };
    const title = parsed.data["title"];
    if (typeof title === "string") entry.title = title;
    const summary = parsed.data["summary"];
    if (typeof summary === "string") entry.summary = summary;
    const product = parsed.data["product"];
    if (typeof product === "string") entry.product = product;
    const type = parsed.data["type"];
    if (typeof type === "string") entry.type = type;
    const status = parsed.data["status"];
    if (typeof status === "string") entry.status = status;
    const tags = parsed.data["tags"];
    if (Array.isArray(tags) && tags.every((t): t is string => typeof t === "string")) {
      entry.tags = tags;
    }
    const existing = map.get(id);
    if (existing) {
      console.error(
        `nihaopay-mcp: duplicate doc id "${id}" — ${file} shadows ${existing.path}, which is now unreachable`,
      );
    }
    map.set(id, entry);
  }
  return map;
}
