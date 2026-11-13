#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_BASE = "https://api.printify.com/v1";
const token = process.env.PRINTIFY_API_TOKEN;

if (!token) {
  console.error("PRINTIFY_API_TOKEN environment variable is required");
  process.exit(1);
}

async function printify(path: string): Promise<unknown> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
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

const server = new McpServer({ name: "printify-mcp", version: "0.1.0" });

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

await server.connect(new StdioServerTransport());
