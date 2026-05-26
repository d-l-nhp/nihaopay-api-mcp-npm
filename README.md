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

## Versioning

The npm package version mirrors the docs tag. `nihaopay-api-mcp@1.2.5` bundles the docs at `nihaopay-api-docs` tag `v1.2.5`.

## Node compatibility

Node 22+ (lowest currently-supported LTS as of release).

## License

MIT.
