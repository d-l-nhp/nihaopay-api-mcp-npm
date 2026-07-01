import { resolve } from "node:path";
import { loadDocCatalog } from "../src/data/doc-catalog.ts";
import type { DocCatalogEntry } from "../src/data/doc-catalog.ts";
import { loadBm25FromFile } from "../src/load-index.ts";
import { handleSearchDocs } from "../src/tools/search-docs.ts";

const CONFIDENCE_THRESHOLD = Number(process.env["NIHAOPAY_CONFIDENCE"] ?? "4.0");

type Assertion =
  | { kind: "topDoc"; docId: string }
  | { kind: "topDocInRank"; docId: string; maxRank: number }
  | { kind: "hasBoost"; reasonPrefix: string }
  | { kind: "hintTool"; tool: "get_error_code" | "list_endpoints" | "rephrase" };

type Case = {
  name: string;
  query: string;
  assertions: Assertion[];
};

const CASES: Case[] = [
  // payment-mode-chooser legitimately competes here (it routes WeChat
  // queries), so top-3 rather than top-1.
  {
    name: "wechat mini program payment → wechat-miniprogram (in top 3)",
    query: "wechat mini program payment",
    assertions: [
      {
        kind: "topDocInRank",
        docId: "payment-products/securepay/wechat-miniprogram",
        maxRank: 3,
      },
      { kind: "hasBoost", reasonPrefix: "synopsis:" },
    ],
  },
  {
    name: "wechat payment → wechat-miniprogram (in top 3, synopsis boost)",
    query: "wechat payment",
    assertions: [
      {
        kind: "topDocInRank",
        docId: "payment-products/securepay/wechat-miniprogram",
        maxRank: 3,
      },
      { kind: "hasBoost", reasonPrefix: "synopsis:" },
    ],
  },
  {
    name: "wx.requestPayment → wechat-miniprogram",
    query: "wx.requestPayment",
    assertions: [{ kind: "topDoc", docId: "payment-products/securepay/wechat-miniprogram" }],
  },
  {
    name: "what is micropay → wechat-miniprogram",
    query: "what is micropay",
    assertions: [{ kind: "topDoc", docId: "payment-products/securepay/wechat-miniprogram" }],
  },
  {
    name: "wechat mini program integration → wechat-miniprogram (H2 headings fix)",
    query: "wechat mini program integration",
    assertions: [{ kind: "topDoc", docId: "payment-products/securepay/wechat-miniprogram" }],
  },
  {
    name: "wechat mini program JSAPI MINI_APP integration → wechat-miniprogram in top 3",
    query: "wechat mini program JSAPI MINI_APP integration",
    assertions: [
      {
        kind: "topDocInRank",
        docId: "payment-products/securepay/wechat-miniprogram",
        maxRank: 3,
      },
    ],
  },

  {
    name: "how do I get a test account → testing/testing",
    query: "how do I get a test account",
    assertions: [{ kind: "topDoc", docId: "testing/testing" }],
  },
  {
    name: "cardpay test cards → testing/testing synopsis",
    query: "cardpay test cards",
    assertions: [
      { kind: "topDoc", docId: "testing/testing" },
      { kind: "hasBoost", reasonPrefix: "synopsis:" },
    ],
  },

  {
    name: "auto debit signing → auto-debit/signing",
    query: "auto debit signing",
    assertions: [{ kind: "topDoc", docId: "payment-products/auto-debit/signing" }],
  },
  {
    name: "refund a transaction → operations/refund",
    query: "refund a transaction",
    assertions: [{ kind: "topDoc", docId: "operations/refund" }],
  },
  {
    name: "how to issue a refund → operations/refund",
    query: "how to issue a refund",
    assertions: [{ kind: "topDoc", docId: "operations/refund" }],
  },

  {
    name: "POST /v1.2/contract/sign → auto-debit/signing with endpoint boost",
    query: "POST /v1.2/contract/sign",
    assertions: [
      { kind: "topDoc", docId: "payment-products/auto-debit/signing" },
      { kind: "hasBoost", reasonPrefix: "endpoint:/v1.2/contract/sign" },
    ],
  },
  {
    name: "full muskpay URL → cardpay/gateway-checkout",
    query: "https://api.muskpay.io/v1.2/cardpay/checkout",
    assertions: [
      { kind: "topDoc", docId: "payment-products/cardpay/gateway-checkout" },
      { kind: "hasBoost", reasonPrefix: "endpoint:/v1.2/cardpay/checkout" },
    ],
  },
  {
    name: "full nihaopay URL → wechat-miniprogram in top 3",
    query: "https://api.nihaopay.com/v1.2/transactions/micropay what is this",
    assertions: [
      {
        kind: "topDocInRank",
        docId: "payment-products/securepay/wechat-miniprogram",
        maxRank: 3,
      },
      { kind: "hasBoost", reasonPrefix: "endpoint:/v1.2/transactions/micropay" },
    ],
  },

  {
    name: "truly off-topic query → rephrase hint",
    query: "purple elephant zebra",
    assertions: [{ kind: "hintTool", tool: "rephrase" }],
  },
  // 423-12, not e.g. 600-12 — ERROR_CODE_RE requires the code to start with 1-5.
  {
    name: "query with error-code shape → get_error_code hint (pattern-first)",
    query: "what about 423-12",
    assertions: [{ kind: "hintTool", tool: "get_error_code" }],
  },
  {
    name: "query with endpoint path shape → list_endpoints hint (pattern-first)",
    query: "what does /v1.2/totally-not-a-real-endpoint do",
    assertions: [{ kind: "hintTool", tool: "list_endpoints" }],
  },
];

type CaseResult = {
  name: string;
  ok: boolean;
  failures: string[];
  topDoc: string | undefined;
  topScore: number | undefined;
};

async function runCase(
  c: Case,
  bm25: Awaited<ReturnType<typeof loadBm25FromFile>>,
  docCatalog: ReadonlyMap<string, DocCatalogEntry>,
): Promise<CaseResult> {
  const res = await handleSearchDocs({ query: c.query, limit: 5 }, bm25, {
    confidenceThreshold: CONFIDENCE_THRESHOLD,
    docCatalog,
  });
  const failures: string[] = [];

  for (const a of c.assertions) {
    if (a.kind === "topDoc") {
      const top = res.results[0]?.doc_id;
      if (top !== a.docId) failures.push(`expected top doc ${a.docId}, got ${top ?? "(empty)"}`);
    } else if (a.kind === "topDocInRank") {
      const rank = res.results.findIndex((r) => r.doc_id === a.docId);
      if (rank < 0 || rank >= a.maxRank) {
        failures.push(
          `expected ${a.docId} within top ${a.maxRank}, got rank ${rank < 0 ? "absent" : rank + 1}`,
        );
      }
    } else if (a.kind === "hasBoost") {
      const found = res.results.some((r) =>
        r.boost_reasons.some((reason) => reason.startsWith(a.reasonPrefix)),
      );
      if (!found) failures.push(`expected any result to carry boost ${a.reasonPrefix}*`);
    } else if (a.kind === "hintTool") {
      const tool = res.hint?.suggested_tool;
      if (tool !== a.tool) failures.push(`expected hint tool ${a.tool}, got ${tool ?? "(none)"}`);
    }
  }

  return {
    name: c.name,
    ok: failures.length === 0,
    failures,
    topDoc: res.results[0]?.doc_id,
    topScore: res.results[0]?.score,
  };
}

async function main(): Promise<void> {
  const indexFile = resolve("assets/bm25-index.json");
  const [bm25, docCatalog] = await Promise.all([
    loadBm25FromFile(indexFile),
    loadDocCatalog(resolve("assets/content")),
  ]);

  const results: CaseResult[] = [];
  for (const c of CASES) results.push(await runCase(c, bm25, docCatalog));

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;

  for (const r of results) {
    const marker = r.ok ? "PASS" : "FAIL";
    const top = r.topDoc ? `${r.topDoc} @ ${r.topScore?.toFixed(2)}` : "(no match)";
    console.log(`[${marker}] ${r.name}`);
    console.log(`        top: ${top}`);
    for (const f of r.failures) console.log(`        - ${f}`);
  }

  console.log(`\n${passed}/${results.length} passed (${failed} failing)`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("eval-smoke failed:", err);
  process.exit(1);
});
