import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export type FetchLike = typeof fetch;

export interface ServerConfig {
  /** Printify personal access token. */
  token: string;
  /** API base URL including version prefix. */
  apiBase?: string;
}

export const DEFAULT_API_BASE = "https://api.printify.com/v1";
export const SERVER_VERSION = "0.1.0";

export function createServer(config: ServerConfig, fetchImpl: FetchLike): McpServer {
  const apiBase = config.apiBase ?? DEFAULT_API_BASE;

  async function printify(path: string): Promise<unknown> {
    const res = await fetchImpl(`${apiBase}${path}`, {
      headers: {
        Authorization: `Bearer ${config.token}`,
        "User-Agent": "printify-mcp",
      },
    });
    if (!res.ok) {
      throw new Error(`Printify API ${res.status}: ${await res.text()}`);
    }
    return res.json();
  }

  const asText = (data: unknown) => ({
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  });

  const server = new McpServer({ name: "printify-mcp", version: SERVER_VERSION });

  server.registerTool(
    "list_shops",
    { description: "List Printify shops for the authenticated account" },
    async () => asText(await printify("/shops.json")),
  );

  server.registerTool(
    "list_products",
    {
      description: "List products in a Printify shop",
      inputSchema: {
        shop_id: z.string().describe("Printify shop ID"),
        page: z.number().int().positive().optional(),
      },
    },
    async ({ shop_id, page }) =>
      asText(await printify(`/shops/${shop_id}/products.json?page=${page ?? 1}`)),
  );

  return server;
}
