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
});
