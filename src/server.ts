import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { dispatch, type FetchLike } from "./dispatcher.js";
import { tools } from "./generated/tools.js";

export type { FetchLike };

export interface ServerConfig {
  /** Printify personal access token. */
  token: string;
  /** API base URL (no version prefix: Operation paths already carry `/v1`, `/v2`). */
  apiBase?: string;
}

export const DEFAULT_API_BASE = "https://api.printify.com";
export const SERVER_VERSION = "0.1.0";

export function createServer(config: ServerConfig, fetchImpl: FetchLike): McpServer {
  const ctx = {
    token: config.token,
    apiBase: config.apiBase ?? DEFAULT_API_BASE,
    fetch: fetchImpl,
  };
  const server = new McpServer({ name: "printify-mcp", version: SERVER_VERSION });

  for (const tool of tools) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: tool.annotations,
      },
      async (args: Record<string, unknown>) => dispatch(tool, args, ctx),
    );
  }

  return server;
}
