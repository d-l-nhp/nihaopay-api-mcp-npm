import { readdir } from "node:fs/promises";
import { join } from "node:path";

// Skips the _data/ subdirectory (handled separately by loadAccessors).
export async function walk(dir: string, predicate: (path: string) => boolean): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "_data") continue;
      out.push(...(await walk(path, predicate)));
    } else if (predicate(path)) {
      out.push(path);
    }
  }
  return out;
}
