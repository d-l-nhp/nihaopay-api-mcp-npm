import { readdir } from "node:fs/promises";
import { join } from "node:path";

export async function walk(dir: string, predicate: (path: string) => boolean): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  // Order must stay deterministic — loadDocCatalog's duplicate-id warning depends on it.
  const nested = await Promise.all(
    entries.map((entry): Promise<string[]> => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "_data") return Promise.resolve([]);
        return walk(path, predicate);
      }
      return Promise.resolve(predicate(path) ? [path] : []);
    }),
  );
  return nested.flat();
}
