import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { dispatch, type FetchLike } from "./dispatcher.js";
import { tools } from "./generated/tools.js";

export type { FetchLike };

export interface ServerConfig {
  /** Printify personal access token. */
  token: string;
  /** API base URL (no version prefix: Operation paths already carry `/v1`, `/v2`). */
  apiBase?: string;
  /** Read-only Mode: when true (the default) Write Tools are not registered. */
  readOnly?: boolean;
}

/** `PRINTIFY_READ_ONLY`: on unless exactly `false` or `0`. */
export function parseReadOnly(value: string | undefined): boolean {
  const v = value?.trim().toLowerCase();
  return !(v === "false" || v === "0");
}

export const DEFAULT_API_BASE = "https://api.printify.com";
export const SERVER_VERSION = "0.1.0";

export function createServer(config: ServerConfig, fetchImpl: FetchLike): McpServer {
  const ctx = {
    token: config.token,
    // Strip trailing slashes so `${apiBase}${path}` never doubles the slash.
    apiBase: (config.apiBase?.trim() || DEFAULT_API_BASE).replace(/\/+$/, ""),
    fetch: fetchImpl,
  };
  const server = new McpServer({ name: "printify-mcp", version: SERVER_VERSION });

  const readOnly = config.readOnly ?? true;
  for (const tool of tools) {
    if (readOnly && tool.write) continue;
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
