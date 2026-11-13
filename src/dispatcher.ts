import type { ToolDef } from "./tool-def.js";

export type FetchLike = typeof fetch;

export interface DispatchContext {
  token: string;
  /** Base URL; the Operation path is appended as a string (a path prefix is preserved). */
  apiBase: string;
  fetch: FetchLike;
}

export interface ToolResult {
  [key: string]: unknown;
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

const text = (t: string, isError = false): ToolResult => ({
  content: [{ type: "text", text: t }],
  ...(isError ? { isError: true } : {}),
});

/** Turns one Tool call into one Printify HTTP request. No retries. */
export async function dispatch(
  tool: ToolDef,
  args: Record<string, unknown>,
  ctx: DispatchContext,
): Promise<ToolResult> {
  let path = tool.path;
  for (const name of tool.pathParams) {
    path = path.replaceAll(`{${name}}`, encodeURIComponent(String(args[name])));
  }

  const query = new URLSearchParams();
  for (const name of tool.queryParams) {
    const v = args[name];
    if (v === undefined || v === null) continue;
    for (const item of Array.isArray(v) ? v : [v]) query.append(name, String(item));
  }
  const qs = query.toString();

  const headers: Record<string, string> = {
    Authorization: `Bearer ${ctx.token}`,
    "User-Agent": "printify-mcp",
  };
  const init: RequestInit = { method: tool.method, headers };
  if (tool.hasBody && args.body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(args.body);
  }

  const url = `${ctx.apiBase}${path}${qs ? `?${qs}` : ""}`;
  let res: Response;
  let raw: string;
  try {
    res = await ctx.fetch(url, init);
    raw = await res.text();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Defensive: never let the bearer token leak into a result.
    const safe = ctx.token ? message.replaceAll(ctx.token, "[redacted]") : message;
    return text(`Request failed: ${tool.method} ${url}: ${safe}`, true);
  }
  if (!res.ok) return text(`Printify API ${res.status}: ${raw}`, true);
  if (raw.trim() === "") return text(`HTTP ${res.status}: success (no response body)`);
  try {
    return text(JSON.stringify(JSON.parse(raw), null, 2));
  } catch {
    return text(raw);
  }
}
