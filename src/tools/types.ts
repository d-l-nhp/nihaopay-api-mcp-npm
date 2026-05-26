import type { Accessors } from "../data/types.ts";
import type { Bm25Index } from "../retrieval/types.ts";

export type ToolContext = {
  accessors: Accessors;
  bm25: Bm25Index;
  /** Map from frontmatter `id` to absolute file path; built at boot via loadDocPaths. */
  docPaths: ReadonlyMap<string, string>;
  confidenceThreshold: number;
};
