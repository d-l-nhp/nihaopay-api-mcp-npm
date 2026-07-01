import { describe, expect, it } from "vitest";
import { chunkMarkdown } from "../../scripts/lib/chunker.ts";

const fixture = `---
doc_id: test/sample
title: Sample
status: stable
---

# Top

Lead paragraph.

## Section A

Para A1.

### Sub

Para sub1.

## Section B

\`\`\`ts
const x = 1;
\`\`\`
`;

describe("chunker", () => {
  it("splits at H2/H3 and keeps code blocks atomic", () => {
    const chunks = chunkMarkdown("test/sample", fixture);
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    const codeChunk = chunks.find((c) => c.text.includes("const x = 1"));
    expect(codeChunk).toBeDefined();
    expect(codeChunk?.text).toContain("```ts");
    expect(codeChunk?.text).toContain("```");
    expect(codeChunk?.is_code).toBe(true);
  });

  it("attaches breadcrumbs for nested headings", () => {
    const chunks = chunkMarkdown("test/sample", fixture);
    const sub = chunks.find((c) => c.heading === "Sub");
    expect(sub?.breadcrumbs).toEqual(["Top", "Section A", "Sub"]);
  });

  it("does not carry sentence overlap across a section boundary", () => {
    const raw = `---
doc_id: test/sections
title: Sections
status: stable
---

## Error Handling

This returns error 400-23.

## Refunds

Refunds are processed within 24 hours.
`;
    const chunks = chunkMarkdown("test/sections", raw);
    const refunds = chunks.find((c) => c.heading === "Refunds");
    expect(refunds?.text).not.toContain("400-23");
  });

  it("splits a single prose block that alone exceeds maxTokens", () => {
    const sentences = Array.from(
      { length: 40 },
      (_, i) => `This is filler sentence number ${i} about the refund process.`,
    ).join(" ");
    const raw = `---
doc_id: test/long
title: Long
status: stable
---

## Only Section

${sentences}
`;
    const chunks = chunkMarkdown("test/long", raw, {
      paraTarget: 100,
      maxTokens: 150,
      overlapSentences: 0,
    });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.text.length).toBeLessThan(150 * 4);
    }
  });

  it("hard-splits a single unbroken sentence that alone exceeds maxTokens", () => {
    // A comma-heavy list with no internal sentence-ending punctuation — this
    // stays one giant "sentence" per splitSentences, so the greedy grouper in
    // splitOversizedProse can't shrink it via sentence boundaries alone and
    // must fall back to hardSplitByTokenWindow.
    const items = Array.from({ length: 600 }, (_, i) => `sku_${i}`).join(", ");
    const longSentence = `Supported item codes include ${items} and nothing else.`;
    const raw = `---
doc_id: test/long-sentence
title: LongSentence
status: stable
---

## Only Section

Intro sentence here. ${longSentence} Trailing sentence here.
`;
    const maxTokens = 150;
    const chunks = chunkMarkdown("test/long-sentence", raw, {
      paraTarget: maxTokens,
      maxTokens,
      overlapSentences: 0,
    });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(Math.ceil(c.text.length / 4)).toBeLessThanOrEqual(maxTokens);
    }
  });
});
