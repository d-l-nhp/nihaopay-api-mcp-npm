import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import matter from "gray-matter";
import { walk } from "../../scripts/lib/walk.ts";

/**
 * Walk a content directory and build a map from frontmatter `id` to the file's
 * absolute path. fetch_doc uses this to resolve a doc_id without caring about
 * the numeric-prefix sort convention authors use on top-level subdirs.
 */
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
