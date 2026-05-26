import type { Accessors } from "../data/types.ts";
import type { Bm25Index } from "../retrieval/types.ts";

export type ToolContext = {
  accessors: Accessors;
  bm25: Bm25Index;
  contentDir: string;
  confidenceThreshold: number;
};
