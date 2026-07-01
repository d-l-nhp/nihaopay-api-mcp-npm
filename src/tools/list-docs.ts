import { z } from "zod";
import type { DocCatalogEntry } from "../data/doc-catalog.js";

export const listDocsSchema = z.object({
  product: z.string().optional(),
  type: z.string().optional(),
  prefix: z.string().optional(),
});

export type ListDocsArgs = z.infer<typeof listDocsSchema>;

export type ListDocsEntry = {
  doc_id: string;
  title?: string;
  product?: string;
  type?: string;
  summary?: string;
};

export type ListDocsResult = {
  docs: ReadonlyArray<ListDocsEntry>;
  total: number;
};

export async function handleListDocs(
  args: ListDocsArgs,
  docCatalog: ReadonlyMap<string, DocCatalogEntry>,
): Promise<ListDocsResult> {
  const matches: ListDocsEntry[] = [];
  for (const [docId, entry] of docCatalog) {
    if (args.product && entry.product?.toLowerCase() !== args.product.toLowerCase()) continue;
    if (args.type && entry.type?.toLowerCase() !== args.type.toLowerCase()) continue;
    if (args.prefix && !docId.startsWith(args.prefix)) continue;
    const item: ListDocsEntry = { doc_id: docId };
    if (entry.title) item.title = entry.title;
    if (entry.product) item.product = entry.product;
    if (entry.type) item.type = entry.type;
    if (entry.summary) item.summary = entry.summary;
    matches.push(item);
  }
  matches.sort((a, b) => a.doc_id.localeCompare(b.doc_id));
  return { docs: matches, total: matches.length };
}
