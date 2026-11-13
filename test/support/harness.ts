import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { main } from "../../src/main.js";
import { createServer, type ServerConfig } from "../../src/server.js";

export interface RecordedRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | undefined;
}

export interface CannedResponse {
  status?: number;
  /** Objects are JSON-encoded; strings are sent raw; undefined means empty body. */
  body?: unknown;
  headers?: Record<string, string>;
}

export type Responder = CannedResponse | ((req: RecordedRequest) => CannedResponse);

export interface FakeFetch {
  fetch: typeof fetch;
  requests: RecordedRequest[];
  /** Queue a response for the next request (FIFO). Unqueued requests get the default. */
  respondWith(...responses: Responder[]): void;
}

/** Recording fake `fetch`. Default response is 200 with `{}`. */
export function createFakeFetch(defaultResponse: Responder = { body: {} }): FakeFetch {
  const requests: RecordedRequest[] = [];
  const queue: Responder[] = [];
  const fake = async (input: string | URL | Request, init?: RequestInit) => {
    const isRequest = input instanceof Request;
    const headers: Record<string, string> = {};
    // Request headers first; init.headers override, matching fetch semantics.
    if (isRequest) input.headers.forEach((v, k) => (headers[k] = v));
    new Headers(init?.headers).forEach((v, k) => (headers[k] = v));
    let body: string | undefined;
    if (init?.body != null) {
      if (typeof init.body !== "string") {
        throw new Error(`Fake fetch only supports string bodies, got ${Object.prototype.toString.call(init.body)}`);
      }
      body = init.body;
    } else if (isRequest && input.body !== null) {
      body = await input.clone().text();
    }
    const req: RecordedRequest = {
      method: init?.method ?? (isRequest ? input.method : "GET"),
      url: isRequest ? input.url : String(input),
      headers,
      body,
    };
    requests.push(req);
    const r = queue.shift() ?? defaultResponse;
    const canned = typeof r === "function" ? r(req) : r;
    const text =
      canned.body === undefined
        ? undefined
        : typeof canned.body === "string"
          ? canned.body
          : JSON.stringify(canned.body);
    const resHeaders = { ...(typeof canned.body === "object" ? { "content-type": "application/json" } : {}), ...canned.headers };
    return new Response(text, { status: canned.status ?? 200, headers: resHeaders });
  };
  return {
    fetch: fake as typeof fetch,
    requests,
    respondWith: (...rs) => void queue.push(...rs),
  };
}

export interface Harness {
  client: Client;
  http: FakeFetch;
  close(): Promise<void>;
}

/** Real MCP client connected to a factory-built server over an in-memory transport. */
export async function startHarness(
  config: Partial<ServerConfig> = {},
  http: FakeFetch = createFakeFetch(),
): Promise<Harness> {
  const server = createServer({ token: "test-token", ...config }, http.fetch);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return {
    client,
    http,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

/** Concatenated text of a tool result's text content. */
export function resultText(result: unknown): string {
  return ((result as { content?: unknown }).content as { type: string; text?: string }[])
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("");
}

export interface EnvHarness {
  client: Client;
  http: FakeFetch;
  close(): Promise<void>;
}

/** Boots the real `main()` with the given env and connects an MCP client to it. */
export async function startHarnessFromEnv(
  env: NodeJS.ProcessEnv,
  http: FakeFetch = createFakeFetch(),
): Promise<EnvHarness> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await main(env, {
    fetch: http.fetch,
    transport: serverTransport,
    exit: (code) => {
      throw new Error(`main() exited with code ${code}`);
    },
  });
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await client.connect(clientTransport);
  return {
    client,
    http,
    // Closing the client closes the linked server transport too.
    close: () => client.close(),
  };
}
