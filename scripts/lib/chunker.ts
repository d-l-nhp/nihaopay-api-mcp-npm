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
  paraTarget: number;
  maxTokens: number;
  /** Prose-to-prose only — atomic chunks (code/table) never get overlap. */
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

export function stripHtmlComments(text: string): string {
  return text.replace(/<!--[\s\S]*?-->/g, "").trim();
}

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
      if (i < lines.length) i++;
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
  /** Full heading path including this section's own heading, e.g. ["Top", "Sub"]. */
  path: string[];
  heading: string;
  blocks: ContentBlock[];
};

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

// Last resort for text with no sentence boundaries left (long URL, hex blob,
// enum list) that still exceeds `target`. Window size matches approxTokens'
// 4-chars-per-token heuristic exactly.
function hardSplitByTokenWindow(text: string, target: number): string[] {
  const maxChars = target * 4;
  if (text.length <= maxChars) return [text];

  const out: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length);
    if (end < text.length) {
      let breakAt = end;
      while (breakAt > start && !/\s/.test(text[breakAt] ?? "")) breakAt--;
      if (breakAt > start) end = breakAt;
    }
    const piece = text.slice(start, end).trim();
    if (piece.length > 0) out.push(piece);
    start = end;
    while (start < text.length && /\s/.test(text[start] ?? "")) start++;
  }
  return out;
}

// Groups sentences up to `target` tokens per piece; called when a single prose
// block alone exceeds maxTokens and has no sibling to split across instead.
function splitOversizedProse(text: string, target: number): string[] {
  const sentences = splitSentences(text);
  let out: string[];

  if (sentences.length <= 1) {
    out = [text];
  } else {
    out = [];
    let buf: string[] = [];
    let bufTokens = 0;
    for (const s of sentences) {
      const t = approxTokens(s);
      if (buf.length > 0 && bufTokens + t > target) {
        out.push(buf.join(" "));
        buf = [];
        bufTokens = 0;
      }
      buf.push(s);
      bufTokens += t;
    }
    if (buf.length > 0) out.push(buf.join(" "));
  }

  return out.flatMap((piece) =>
    approxTokens(piece) > target ? hardSplitByTokenWindow(piece, target) : [piece],
  );
}

type SectionChunk = {
  text: string;
  atomic: boolean;
  atomicKind?: "code" | "table";
};

function chunkSection(section: Section, opts: ChunkerOptions): SectionChunk[] {
  if (section.blocks.length === 0) return [];

  const totalText = section.blocks
    .map((b) => b.text)
    .join("\n\n")
    .trim();
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
      text: pending
        .map((b) => b.text)
        .join("\n\n")
        .trim(),
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
    if (approxTokens(block.text) > opts.maxTokens) {
      flushPending();
      for (const piece of splitOversizedProse(block.text, opts.paraTarget)) {
        result.push({ text: piece, atomic: false });
      }
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

/** Strips frontmatter; frontmatter values are reattached by the build-index caller. */
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

  for (const section of sections) {
    let prevText: string | null = null;
    let prevAtomic = false;
    for (const sc of chunkSection(section, opts)) {
      let text = sc.text;
      if (prevText !== null && !prevAtomic && !sc.atomic && opts.overlapSentences > 0) {
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
