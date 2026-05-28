import type { DocCatalogEntry } from "../data/doc-catalog.js";
import type { Accessors } from "../data/types.js";
import type { Bm25Index } from "../retrieval/types.js";

export type ToolContext = {
  accessors: Accessors;
  bm25: Bm25Index;
  docCatalog: ReadonlyMap<string, DocCatalogEntry>;
  confidenceThreshold: number;
};
