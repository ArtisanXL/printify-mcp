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
      expect(tools.map((t) => t.name)).toContain("retrieve_list_of_shops_in_a_printify_account");
      await h.client.callTool({ name: "retrieve_list_of_shops_in_a_printify_account", arguments: {} });
      expect(http.requests).toHaveLength(1);
      expect(http.requests[0].headers.authorization).toBe("Bearer t");
    } finally {
      await h.close();
    }
  });

  it("reads PRINTIFY_API_BASE from the environment, preserving a path prefix and trimming trailing slashes", async () => {
    const http = createFakeFetch({ body: [] });
    const h = await startHarnessFromEnv(
      { PRINTIFY_API_TOKEN: "t", PRINTIFY_API_BASE: "https://enterprise.printful.com/api/pfy/public/" },
      http,
    );
    try {
      await h.client.callTool({ name: "retrieve_list_of_shops_in_a_printify_account", arguments: {} });
      expect(http.requests[0].url).toBe("https://enterprise.printful.com/api/pfy/public/v1/shops.json");
    } finally {
      await h.close();
    }
  });

  it("defaults to api.printify.com when PRINTIFY_API_BASE is unset", async () => {
    const http = createFakeFetch({ body: [] });
    const h = await startHarnessFromEnv({ PRINTIFY_API_TOKEN: "t" }, http);
    try {
      await h.client.callTool({ name: "retrieve_list_of_shops_in_a_printify_account", arguments: {} });
      expect(http.requests[0].url).toBe("https://api.printify.com/v1/shops.json");
    } finally {
      await h.close();
    }
  });

  it.each([
    [undefined, true],
    ["", true],
    ["true", true],
    ["1", true],
    ["no", true],
    ["false", false],
    ["0", false],
  ])("PRINTIFY_READ_ONLY=%j -> read-only %s", async (value, readOnly) => {
    const h = await startHarnessFromEnv({ PRINTIFY_API_TOKEN: "t", PRINTIFY_READ_ONLY: value });
    try {
      const { tools } = await h.client.listTools();
      expect(tools.map((t) => t.name).includes("create_a_new_product")).toBe(!readOnly);
      expect(tools).toHaveLength(readOnly ? 28 : 53);
    } finally {
      await h.close();
    }
  });
});
