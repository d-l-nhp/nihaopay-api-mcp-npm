import matter from "gray-matter";

export type Chunk = {
  doc_id: string;
  heading: string;
  breadcrumbs: string[];
  text: string;
  is_code: boolean;
  is_table: boolean;
};

export type ChunkerOptions = {
  /** Token target for split chunks. */
  paraTarget: number;
  /** Maximum tokens before forcing a split. */
  maxTokens: number;
  /** Sentences of overlap prepended from prior chunk (prose-to-prose only). */
  overlapSentences: number;
};

export const DEFAULT_CHUNKER_OPTIONS: ChunkerOptions = {
  paraTarget: 600,
  maxTokens: 800,
  overlapSentences: 1,
};

type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "prose"; text: string }
  | { kind: "code"; text: string }
  | { kind: "table"; text: string };

function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function isHeading(line: string): { level: number; text: string } | null {
  const m = line.match(/^(#{1,6})\s+(.+?)\s*$/);
  if (!m || !m[1] || !m[2]) return null;
  return { level: m[1].length, text: m[2].trim() };
}

function isTableLine(line: string): boolean {
  return /^\s*\|/.test(line);
}

function isBlank(line: string): boolean {
  return line.trim() === "";
}

function stripHtmlComments(text: string): string {
  return text.replace(/<!--[\s\S]*?-->/g, "").trim();
}

/** Parse markdown body into a flat sequence of blocks. Headings are preserved as their own blocks. */
export function parseBlocks(body: string): Block[] {
  const lines = body.split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";

    if (isBlank(line)) {
      i++;
      continue;
    }

    const h = isHeading(line);
    if (h) {
      blocks.push({ kind: "heading", level: h.level, text: h.text });
      i++;
      continue;
    }

    if (line.startsWith("```")) {
      const start = i;
      i++;
      while (i < lines.length && !(lines[i] ?? "").startsWith("```")) i++;
      if (i < lines.length) i++; // consume closing fence
      blocks.push({ kind: "code", text: lines.slice(start, i).join("\n") });
      continue;
    }

    if (isTableLine(line)) {
      const start = i;
      while (i < lines.length) {
        const cur = lines[i] ?? "";
        if (isTableLine(cur)) {
          i++;
          continue;
        }
        break;
      }
      blocks.push({ kind: "table", text: lines.slice(start, i).join("\n") });
      continue;
    }

    const start = i;
    while (i < lines.length) {
      const cur = lines[i] ?? "";
      if (isBlank(cur) || isHeading(cur) || cur.startsWith("```") || isTableLine(cur)) break;
      i++;
    }
    const text = lines.slice(start, i).join("\n").trim();
    if (text.length > 0) blocks.push({ kind: "prose", text });
  }

  return blocks;
}

type ContentBlock = Block & { kind: "prose" | "code" | "table" };

type Section = {
  /** Heading path from root to this section's heading, e.g. ["Top", "Section A", "Sub"]. */
  path: string[];
  /** This section's own (deepest) heading. */
  heading: string;
  /** Non-heading content blocks belonging to this section, in order. */
  blocks: ContentBlock[];
};

/**
 * Group blocks into sections using a true heading stack: a heading at level N
 * pops everything ≥ N from the stack, then pushes itself. Content blocks are
 * attached to the deepest open heading.
 */
export function groupSections(blocks: Block[]): Section[] {
  const sections: Section[] = [];
  const stack: Array<{ level: number; text: string }> = [];
  let current: Section | null = null;

  const openSection = () => {
    current = {
      path: stack.map((s) => s.text),
      heading: stack[stack.length - 1]?.text ?? "(intro)",
      blocks: [],
    };
  };

  const finalize = () => {
    if (current && current.blocks.length > 0) sections.push(current);
    current = null;
  };

  for (const block of blocks) {
    if (block.kind === "heading") {
      finalize();
      while (stack.length > 0 && (stack[stack.length - 1]?.level ?? 0) >= block.level) {
        stack.pop();
      }
      stack.push({ level: block.level, text: block.text });
      openSection();
      continue;
    }
    if (!current) {
      // Content before any heading — synthetic intro bucket.
      current = { path: ["(intro)"], heading: "(intro)", blocks: [] };
    }
    current.blocks.push(block);
  }

  finalize();
  return sections;
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z"'(\[])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function lastNSentences(text: string, n: number): string {
  if (n <= 0) return "";
  return splitSentences(text).slice(-n).join(" ");
}

type SectionChunk = {
  text: string;
  /** True when this chunk is a single atomic block (code or table). */
  atomic: boolean;
  /** Kind of the single block when atomic; undefined for prose-mix chunks. */
  atomicKind?: "code" | "table";
};

function chunkSection(section: Section, opts: ChunkerOptions): SectionChunk[] {
  if (section.blocks.length === 0) return [];

  const totalText = section.blocks.map((b) => b.text).join("\n\n").trim();
  const totalTokens = approxTokens(totalText);

  if (totalTokens <= opts.maxTokens) {
    const onlyBlock = section.blocks.length === 1 ? section.blocks[0] : undefined;
    const atomicKind =
      onlyBlock && (onlyBlock.kind === "code" || onlyBlock.kind === "table")
        ? onlyBlock.kind
        : undefined;
    return [
      {
        text: totalText,
        atomic: atomicKind !== undefined,
        ...(atomicKind ? { atomicKind } : {}),
      },
    ];
  }

  const result: SectionChunk[] = [];
  let pending: ContentBlock[] = [];

  const flushPending = () => {
    if (pending.length === 0) return;
    result.push({
      text: pending.map((b) => b.text).join("\n\n").trim(),
      atomic: false,
    });
    pending = [];
  };

  const pendingTokens = () => approxTokens(pending.map((b) => b.text).join("\n\n"));

  for (const block of section.blocks) {
    if (block.kind !== "prose") {
      flushPending();
      result.push({ text: block.text, atomic: true, atomicKind: block.kind });
      continue;
    }
    if (pendingTokens() + approxTokens(block.text) > opts.paraTarget && pending.length > 0) {
      flushPending();
    }
    pending.push(block);
  }

  flushPending();
  return result;
}

/**
 * Chunk a raw markdown document (with optional YAML frontmatter) into the
 * minimal Chunk shape the retrieval layer consumes. Frontmatter is stripped;
 * its values get reattached to chunks downstream in build-index.ts.
 */
export function chunkMarkdown(
  docId: string,
  raw: string,
  opts: ChunkerOptions = DEFAULT_CHUNKER_OPTIONS,
): Chunk[] {
  const { content } = matter(raw);
  const body = stripHtmlComments(content);
  const blocks = parseBlocks(body);
  const sections = groupSections(blocks);

  const chunks: Chunk[] = [];
  let prevText: string | null = null;
  let prevAtomic = false;

  for (const section of sections) {
    for (const sc of chunkSection(section, opts)) {
      let text = sc.text;
      if (
        prevText !== null &&
        !prevAtomic &&
        !sc.atomic &&
        opts.overlapSentences > 0
      ) {
        const overlap = lastNSentences(prevText, opts.overlapSentences);
        if (overlap.length > 0) text = `${overlap}\n\n${sc.text}`;
      }
      text = text.trim();
      if (text.length === 0) continue;

      chunks.push({
        doc_id: docId,
        heading: section.heading,
        breadcrumbs: section.path,
        text,
        is_code: sc.atomic && sc.atomicKind === "code",
        is_table: sc.atomic && sc.atomicKind === "table",
      });
      prevText = text;
      prevAtomic = sc.atomic;
    }
  }

  return chunks;
}
