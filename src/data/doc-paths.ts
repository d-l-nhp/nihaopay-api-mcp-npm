import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import matter from "gray-matter";
import { walk } from "../utils/walk.js";

// doc_id → absolute path; indirection needed because content dirs use numeric sort prefixes.
export async function loadDocPaths(contentDir: string): Promise<Map<string, string>> {
  const files = await walk(contentDir, (p) => p.endsWith(".md"));
  const map = new Map<string, string>();
  for (const file of files) {
    const raw = await readFile(file, "utf8");
    const parsed = matter(raw);
    const id = parsed.data["id"];
    if (typeof id === "string" && id.length > 0) {
      map.set(id, resolve(file));
    }
  }
  return map;
}
