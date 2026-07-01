import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import { fetchDocSchema, handleFetchDoc } from "./tools/fetch-doc.js";
import { getErrorCodeSchema, handleGetErrorCode } from "./tools/get-error-code.js";
import { handleListDocs, listDocsSchema } from "./tools/list-docs.js";
import { handleListEndpoints, listEndpointsSchema } from "./tools/list-endpoints.js";
import { handleSearchDocs, searchDocsSchema } from "./tools/search-docs.js";
import type { ToolContext } from "./tools/types.js";

export function buildServer(ctx: ToolContext): Server {
  const server = new Server(
    { name: "nihaopay-api-mcp", version: ctx.serverVersion },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "search_docs",
        description: "Search Nihaopay v1.2 docs with BM25 + boosts.",
        inputSchema: zodToJsonSchema(searchDocsSchema) as Record<string, unknown>,
      },
      {
        name: "fetch_doc",
        description: "Retrieve full markdown for a doc_id.",
        inputSchema: zodToJsonSchema(fetchDocSchema) as Record<string, unknown>,
      },
      {
        name: "get_error_code",
        description: "Direct lookup for a Nihaopay error code (e.g. 400-23).",
        inputSchema: zodToJsonSchema(getErrorCodeSchema) as Record<string, unknown>,
      },
      {
        name: "list_endpoints",
        description: "Enumerate API endpoints with optional product/method filters.",
        inputSchema: zodToJsonSchema(listEndpointsSchema) as Record<string, unknown>,
      },
      {
        name: "list_docs",
        description:
          "Enumerate every doc_id in the catalog (with optional product/type/prefix filters). Use this when fetch_doc returns doc_not_found or before guessing a doc_id from a URL path.",
        inputSchema: zodToJsonSchema(listDocsSchema) as Record<string, unknown>,
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const args = req.params.arguments ?? {};
    switch (req.params.name) {
      case "search_docs": {
        const parsed = searchDocsSchema.parse(args);
        const result = await handleSearchDocs(parsed, ctx.bm25, {
          confidenceThreshold: ctx.confidenceThreshold,
          docCatalog: ctx.docCatalog,
        });
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }
      case "fetch_doc": {
        const parsed = fetchDocSchema.parse(args);
        const result = await handleFetchDoc(parsed, ctx.docCatalog);
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }
      case "get_error_code": {
        const parsed = getErrorCodeSchema.parse(args);
        const result = await handleGetErrorCode(parsed, ctx.accessors);
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }
      case "list_endpoints": {
        const parsed = listEndpointsSchema.parse(args);
        const result = await handleListEndpoints(parsed, ctx.accessors);
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }
      case "list_docs": {
        const parsed = listDocsSchema.parse(args);
        const result = await handleListDocs(parsed, ctx.docCatalog);
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }
      default:
        throw new Error(`Unknown tool: ${req.params.name}`);
    }
  });

  return server;
}
