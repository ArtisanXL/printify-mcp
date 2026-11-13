import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { dispatch, type FetchLike } from "./dispatcher.js";
import { assertExtensionsMatch, extensionFor } from "./extensions.js";
import { tools, toolsetNames } from "./generated/tools.js";

export type { FetchLike };

export interface ServerConfig {
  /** Printify personal access token. */
  token: string;
  /** API base URL (no version prefix: Operation paths already carry `/v1`, `/v2`). */
  apiBase?: string;
  /** Read-only Mode: when true (the default) Write Tools are not registered. */
  readOnly?: boolean;
  /** Toolsets to offer; undefined or empty means all. Unknown names throw. */
  toolsets?: readonly string[];
}

/**
 * `PRINTIFY_TOOLSETS`: comma-separated Toolset names. Entries are trimmed and
 * lower-cased; empty entries are ignored; unset/blank means all (undefined).
 * Throws on an unknown name, listing the valid ones.
 */
export function parseToolsets(value: string | undefined): string[] | undefined {
  const names = (value ?? "")
    .split(",")
    .map((n) => n.trim().toLowerCase())
    .filter((n) => n !== "");
  if (names.length === 0) return undefined;
  assertKnownToolsets(names);
  return names;
}

function assertKnownToolsets(names: readonly string[]): void {
  const unknown = names.filter((n) => !toolsetNames.includes(n));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown toolset${unknown.length > 1 ? "s" : ""} ${unknown.map((n) => `"${n}"`).join(", ")}. Valid toolsets: ${toolsetNames.join(", ")}`,
    );
  }
}

/** `PRINTIFY_READ_ONLY`: on unless `false` or `0` (case-insensitive, trimmed). */
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
  assertExtensionsMatch(tools.map((t) => t.operationId));
  const server = new McpServer({ name: "printify-mcp", version: SERVER_VERSION });

  const readOnly = config.readOnly ?? true;
  const enabled = config.toolsets && config.toolsets.length > 0 ? config.toolsets : undefined;
  if (enabled) assertKnownToolsets(enabled);
  for (const tool of tools) {
    if (enabled && !enabled.includes(tool.toolset)) continue;
    if (readOnly && !tool.annotations.readOnlyHint) continue;
    const ext = extensionFor(tool);
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: { ...tool.inputSchema, ...ext?.inputSchema },
        annotations: tool.annotations,
      },
      async (args: Record<string, unknown>) => {
        if (!ext) return dispatch(tool, args, ctx);
        const prepared = await ext.prepare(args);
        if ("error" in prepared) return { content: [{ type: "text" as const, text: prepared.error }], isError: true };
        return dispatch(tool, prepared.args, ctx);
      },
    );
  }

  return server;
}
