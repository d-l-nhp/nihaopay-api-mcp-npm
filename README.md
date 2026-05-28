# nihaopay-api-mcp

Local MCP server for Nihaopay v1.2 payment-API documentation. Bundles a snapshot of [`nihaopay-api-docs`](https://github.com/nihaopay/nihaopay-api-docs) at publish time; runs fully offline.

## Install

```bash
npm install -g nihaopay-api-mcp
```

## Add to Claude Desktop

```json
{
  "mcpServers": {
    "nihaopay-docs": { "command": "nihaopay-mcp" }
  }
}
```

## Tools

- `search_docs` — natural-language search across the documentation.
- `fetch_doc` — full markdown for a doc by `doc_id`.
- `get_error_code` — direct lookup for `400-23`-style codes.
- `list_endpoints` — endpoint catalog, filterable by product/method.
- `list_docs` — enumerate every `doc_id` with optional `product`/`type`/`prefix` filters; call this when `fetch_doc` returns `doc_not_found`.

## Developing locally

The published package bundles `assets/content/` and `assets/bm25-index.json` from a docs snapshot. **Both are gitignored** in this repo — a fresh `git clone` won't have any docs to serve. After cloning:

```bash
pnpm install
pnpm fetch-docs     # populates assets/content/ from nihaopay-api-docs
pnpm build-index    # generates assets/bm25-index.json from the content
pnpm test           # 49 tests
pnpm eval:smoke     # retrieval-quality bench (15 labeled queries)
pnpm build          # tsc → dist/
```

`pnpm build-package` runs `prepack` and produces the redistributable `.tgz` with `dist/`, `bin/`, and the regenerated `assets/` payload.

## Versioning

The npm package version mirrors the docs tag. `nihaopay-api-mcp@1.2.5` bundles the docs at `nihaopay-api-docs` tag `v1.2.5`.

## Node compatibility

Node 22+ (lowest currently-supported LTS as of release).

## License

MIT.
