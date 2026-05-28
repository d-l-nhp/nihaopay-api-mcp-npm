import { readFile } from "node:fs/promises";
import matter from "gray-matter";
import { z } from "zod";
import type { DocCatalogEntry } from "../data/doc-catalog.js";

export const fetchDocSchema = z.object({
  doc_id: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-z0-9][a-z0-9/_-]*$/, "doc_id must be lowercase slug path"),
});

export type FetchDocArgs = z.infer<typeof fetchDocSchema>;
export type FetchDocResult =
  | {
      doc_id: string;
      title: string;
      type?: string;
      product?: string;
      status?: string;
      last_reviewed?: string;
      endpoint?: unknown;
      content: string;
    }
  | { error: "doc_not_found"; doc_id: string };

export async function handleFetchDoc(
  args: FetchDocArgs,
  docCatalog: ReadonlyMap<string, DocCatalogEntry>,
): Promise<FetchDocResult> {
  const entry = docCatalog.get(args.doc_id);
  if (!entry) return { error: "doc_not_found", doc_id: args.doc_id };
  const raw = await readFile(entry.path, "utf8");
  const parsed = matter(raw);
  const result: Extract<FetchDocResult, { content: string }> = {
    doc_id: args.doc_id,
    title: String(parsed.data["title"] ?? args.doc_id),
    content: parsed.content,
  };
  const type = parsed.data["type"];
  if (typeof type === "string") result.type = type;
  const product = parsed.data["product"];
  if (typeof product === "string") result.product = product;
  const status = parsed.data["status"];
  if (typeof status === "string") result.status = status;
  const lastReviewed = parsed.data["last_reviewed"];
  if (typeof lastReviewed === "string") result.last_reviewed = lastReviewed;
  const endpoint = parsed.data["endpoint"];
  if (endpoint !== undefined) result.endpoint = endpoint;
  return result;
}
