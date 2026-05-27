import type { Accessors } from "../data/types.js";
import type { Bm25Index } from "../retrieval/types.js";

export type ToolContext = {
  accessors: Accessors;
  bm25: Bm25Index;
  docPaths: ReadonlyMap<string, string>;
  confidenceThreshold: number;
};
