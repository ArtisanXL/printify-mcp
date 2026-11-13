import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { main } from "../src/main.js";
import { createFakeFetch, startHarnessFromEnv } from "./support/harness.js";

class ExitCalled extends Error {
  constructor(public code: number) {
    super(`exit ${code}`);
  }
}

describe("startup", () => {
  it("exits with an error when PRINTIFY_API_TOKEN is missing", async () => {
    const errors: string[] = [];
    const [, transport] = InMemoryTransport.createLinkedPair();
    await expect(
      main({}, {
        fetch: createFakeFetch().fetch,
        transport,
        exit: (code) => {
          throw new ExitCalled(code);
        },
        error: (m) => errors.push(m),
      }),
    ).rejects.toMatchObject({ code: 1 });
    expect(errors.join("\n")).toContain("PRINTIFY_API_TOKEN");
  });

  it("starts when the token is set and serves tools", async () => {
    const http = createFakeFetch({ body: [] });
    const h = await startHarnessFromEnv({ PRINTIFY_API_TOKEN: "t" }, http);
    try {
      const { tools } = await h.client.listTools();
      expect(tools.map((t) => t.name)).toContain("list_shops");
      await h.client.callTool({ name: "list_shops", arguments: {} });
      expect(http.requests).toHaveLength(1);
      expect(http.requests[0].headers.authorization).toBe("Bearer t");
    } finally {
      await h.close();
    }
  });
});
