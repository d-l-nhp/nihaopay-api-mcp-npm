import type { Chunk } from "./chunker.ts";

export type DocFrontmatter = {
  id: string;
  title?: string;
  summary?: string;
  product?: string;
  type?: string;
  tags?: ReadonlyArray<string>;
  quirks?: ReadonlyArray<string>;
  endpoint?: {
    method?: string;
    path?: string;
  };
};

// Concentrates frontmatter plus H2 section names into one high-signal chunk —
// covers disambiguating terms (e.g. "Integration") that live only in a
// section title and would otherwise be diluted across body chunks.
export function buildHeaderChunk(
  fm: DocFrontmatter,
  sectionHeadings: ReadonlyArray<string> = [],
): Chunk | null {
  const parts: string[] = [];

  if (fm.title) parts.push(fm.title);
  if (fm.endpoint?.method && fm.endpoint?.path) {
    parts.push(`${fm.endpoint.method} ${fm.endpoint.path}`);
  } else if (fm.endpoint?.path) {
    parts.push(fm.endpoint.path);
  }
  if (fm.tags?.length) parts.push(fm.tags.join(" "));
  if (fm.summary) parts.push(fm.summary);
  if (sectionHeadings.length) parts.push(sectionHeadings.join(" "));
  if (fm.quirks?.length) parts.push(fm.quirks.join(" "));
  if (fm.product) parts.push(fm.product);

  const text = parts.join("\n").trim();
  if (text.length === 0) return null;

  return {
    doc_id: fm.id,
    heading: "[Synopsis]",
    breadcrumbs: ["[Synopsis]"],
    text,
    is_code: false,
    is_table: false,
  };
}
