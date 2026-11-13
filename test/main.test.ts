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
    ["FALSE", false],
    [" false ", false],
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

  describe("PRINTIFY_TOOLSETS", () => {
    const names = async (env: NodeJS.ProcessEnv) => {
      const h = await startHarnessFromEnv({ PRINTIFY_API_TOKEN: "t", PRINTIFY_READ_ONLY: "false", ...env });
      try {
        const { tools } = await h.client.listTools();
        return tools.map((t) => t.name);
      } finally {
        await h.close();
      }
    };

    it("registers every toolset by default, for unset, empty and blank values", async () => {
      for (const v of [undefined, "", "  ", " , "]) expect(await names({ PRINTIFY_TOOLSETS: v })).toHaveLength(53);
    });

    it("filters to the named toolsets (catalog,products)", async () => {
      const n = await names({ PRINTIFY_TOOLSETS: "catalog,products" });
      expect(n).toHaveLength(14 + 10);
      expect(n).toContain("create_a_new_product");
      expect(n).not.toContain("retrieve_list_of_shops_in_a_printify_account");
    });

    it("tolerates whitespace, case and empty entries", async () => {
      expect(await names({ PRINTIFY_TOOLSETS: " Shops , ,shops," })).toHaveLength(2);
    });

    it.each([
      ["shops", 1, 1],
      ["catalog", 14, 0],
      ["products", 3, 7],
      ["orders", 3, 9],
      ["personalization", 2, 2],
      ["support_requests", 2, 0],
      ["uploads", 2, 2],
      ["webhooks", 1, 4],
    ])("toolset %s has %i read and %i write tools", async (toolset, read, write) => {
      expect(await names({ PRINTIFY_TOOLSETS: toolset, PRINTIFY_READ_ONLY: "true" })).toHaveLength(read);
      expect(await names({ PRINTIFY_TOOLSETS: toolset })).toHaveLength(read + write);
    });

    it("composes with default Read-only Mode (PRINTIFY_READ_ONLY unset)", async () => {
      const n = await names({ PRINTIFY_TOOLSETS: "products", PRINTIFY_READ_ONLY: undefined });
      expect(n).toHaveLength(3);
      expect(n).not.toContain("create_a_new_product");
    });

    it("fails startup on an unknown toolset, listing the valid names", async () => {
      const errors: string[] = [];
      const [, transport] = InMemoryTransport.createLinkedPair();
      await expect(
        main({ PRINTIFY_API_TOKEN: "t", PRINTIFY_TOOLSETS: "catalog,bogus" }, {
          fetch: createFakeFetch().fetch,
          transport,
          exit: (code) => {
            throw new ExitCalled(code);
          },
          error: (m) => errors.push(m),
        }),
      ).rejects.toMatchObject({ code: 1 });
      const msg = errors.join("\n");
      expect(msg).toContain('Unknown toolset "bogus"');
      for (const n of ["shops", "catalog", "products", "orders", "personalization", "support_requests", "uploads", "webhooks"]) {
        expect(msg).toContain(n);
      }
    });

    it("pluralises the error when several toolsets are unknown", async () => {
      const errors: string[] = [];
      const [, transport] = InMemoryTransport.createLinkedPair();
      await expect(
        main({ PRINTIFY_API_TOKEN: "t", PRINTIFY_TOOLSETS: "bogus,nope" }, {
          fetch: createFakeFetch().fetch,
          transport,
          exit: (code) => {
            throw new ExitCalled(code);
          },
          error: (m) => errors.push(m),
        }),
      ).rejects.toMatchObject({ code: 1 });
      expect(errors.join("\n")).toContain('Unknown toolsets "bogus", "nope"');
    });
  });
});
