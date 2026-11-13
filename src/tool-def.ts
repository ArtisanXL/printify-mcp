import type { ZodType } from "zod";

/** One generated Tool: everything the runtime needs to expose and dispatch an Operation. */
export interface ToolDef {
  /** MCP Tool name (snake_case operationId, or an override). */
  name: string;
  operationId: string;
  /** Upper-case HTTP method. */
  method: string;
  /** Path template as in the spec, e.g. `/v1/shops/{shop_id}/products.json`. */
  path: string;
  description: string;
  /** Toolset name derived from the spec tag. */
  toolset: string;
  /** Spec names of path parameters (also the top-level argument names). */
  pathParams: readonly string[];
  /** Spec names of query parameters (also the top-level argument names). */
  queryParams: readonly string[];
  /** When true, the request body is the `body` argument. */
  hasBody: boolean;
  /** Write Tool: only registered when Read-only Mode is off. */
  write: boolean;
  annotations: { readOnlyHint: boolean; destructiveHint?: boolean };
  /** Zod raw shape: path/query params by exact spec name, plus `body`. */
  inputSchema: Record<string, ZodType>;
}
