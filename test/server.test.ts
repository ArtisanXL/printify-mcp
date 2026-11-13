import { afterEach, describe, expect, it } from "vitest";
import { createFakeFetch, resultText, startHarness, type Harness } from "./support/harness.js";

let h: Harness | undefined;
afterEach(async () => {
  await h?.close();
  h = undefined;
});

describe("list_shops", () => {
  it("is listed", async () => {
    h = await startHarness();
    const { tools } = await h.client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["list_products", "list_shops"]);
  });

  it("GETs /shops.json with bearer auth and returns pretty-printed JSON", async () => {
    const http = createFakeFetch({ body: [{ id: 1, title: "My Shop" }] });
    h = await startHarness({}, http);
    const res = await h.client.callTool({ name: "list_shops", arguments: {} });
    expect(http.requests).toHaveLength(1);
    expect(http.requests[0]).toMatchObject({
      method: "GET",
      url: "https://api.printify.com/v1/shops.json",
      headers: { authorization: "Bearer test-token", "user-agent": "printify-mcp" },
    });
    expect(res.isError).toBeFalsy();
    expect(resultText(res)).toBe(JSON.stringify([{ id: 1, title: "My Shop" }], null, 2));
  });

  it("returns an error result on a non-2xx response", async () => {
    h = await startHarness({}, createFakeFetch({ status: 401, body: "nope" }));
    const res = await h.client.callTool({ name: "list_shops", arguments: {} });
    expect(res.isError).toBe(true);
    expect(resultText(res)).toContain("Printify API 401: nope");
  });
});

describe("list_products", () => {
  it("defaults to page 1", async () => {
    const http = createFakeFetch({ body: { data: [] } });
    h = await startHarness({}, http);
    const res = await h.client.callTool({ name: "list_products", arguments: { shop_id: "42" } });
    expect(http.requests[0]).toMatchObject({
      method: "GET",
      url: "https://api.printify.com/v1/shops/42/products.json?page=1",
      headers: { authorization: "Bearer test-token" },
    });
    expect(JSON.parse(resultText(res))).toEqual({ data: [] });
  });

  it("passes the page argument", async () => {
    const http = createFakeFetch();
    h = await startHarness({}, http);
    await h.client.callTool({ name: "list_products", arguments: { shop_id: "42", page: 3 } });
    expect(http.requests[0]!.url).toBe("https://api.printify.com/v1/shops/42/products.json?page=3");
  });

  it("rejects a missing shop_id without calling Printify", async () => {
    const http = createFakeFetch();
    h = await startHarness({}, http);
    const res = await h.client.callTool({ name: "list_products", arguments: {} });
    expect(res.isError).toBe(true);
    expect(http.requests).toHaveLength(0);
  });
});
