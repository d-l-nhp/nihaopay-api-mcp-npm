# nihaopay-api-mcp

NihaoPay API MCP server npm package.

## Install

```bash
npm install -g nihaopay-api-mcp
```

## Usage

### Claude Code

```bash
claude mcp add nihaopay-docs -- nihaopay-mcp
```

### OpenCode

Add to `opencode.json`:

```json
{
  "mcp": {
    "nihaopay-docs": {
      "type": "local",
      "command": ["nihaopay-mcp"],
      "enabled": true
    }
  }
}
```

### VSCode

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "nihaopay-docs": {
      "type": "stdio",
      "command": "nihaopay-mcp"
    }
  }
}
```

### Claude Desktop

```json
{
  "mcpServers": {
    "nihaopay-docs": { "command": "nihaopay-mcp" }
  }
}
```

## Tools

- `search_docs`
- `fetch_doc`
- `get_error_code`
- `list_endpoints`
- `list_docs`

## Env

Min node version: 22

## License

MIT
