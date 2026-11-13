import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { main } from "../src/main.js";
import { createFakeFetch } from "./support/harness.js";

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

  it("starts when the token is set", async () => {
    const [, transport] = InMemoryTransport.createLinkedPair();
    await main({ PRINTIFY_API_TOKEN: "t" }, {
      fetch: createFakeFetch().fetch,
      transport,
      exit: () => {
        throw new Error("should not exit");
      },
    });
  });
});
