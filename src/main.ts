import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { createServer, parseReadOnly, type FetchLike } from "./server.js";

export interface MainDeps {
  fetch: FetchLike;
  transport: Transport;
  /** Called on fatal startup errors; must not return in production. */
  exit: (code: number) => never;
  error?: (message: string) => void;
}

/** Wires environment, fetch and transport into a server. Used by the stdio entry point. */
export async function main(env: NodeJS.ProcessEnv, deps: MainDeps): Promise<void> {
  const token = env.PRINTIFY_API_TOKEN;
  if (!token) {
    (deps.error ?? console.error)("PRINTIFY_API_TOKEN environment variable is required");
    deps.exit(1);
  }
  const server = createServer({ token, apiBase: env.PRINTIFY_API_BASE, readOnly: parseReadOnly(env.PRINTIFY_READ_ONLY) }, deps.fetch);
  await server.connect(deps.transport);
}
