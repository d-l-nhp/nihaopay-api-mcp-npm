import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

async function main(): Promise<void> {
  const server = new Server(
    { name: "nihaopay-api-mcp", version: "0.0.0" },
    { capabilities: { tools: {} } },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("nihaopay-mcp boot failed:", err);
  process.exit(1);
});
