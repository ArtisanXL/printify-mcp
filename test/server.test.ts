import { afterEach, describe, expect, it } from "vitest";
import { createFakeFetch, resultText, startHarness, type Harness } from "./support/harness.js";

let h: Harness | undefined;
afterEach(async () => {
  await h?.close();
  h = undefined;
});

async function call(name: string, args: Record<string, unknown> = {}, http = createFakeFetch()) {
  h = await startHarness({}, http);
  const res = await h.client.callTool({ name, arguments: args });
  return { res, req: http.requests[0], http };
}

describe("tool listing", () => {
  it("exposes every GET Operation, read-only annotated, with descriptions and schemas", async () => {
    h = await startHarness();
    const { tools } = await h.client.listTools();
    expect(tools).toHaveLength(27);
    for (const t of tools) {
      expect(t.annotations?.readOnlyHint, t.name).toBe(true);
      expect(t.description, t.name).toBeTruthy();
      expect(t.name.length, t.name).toBeLessThanOrEqual(49);
    }
    const names = tools.map((t) => t.name);
    expect(names).toContain("list_blueprint_print_providers");
    expect(names).toContain("list_blueprint_variants");
    expect(names).not.toContain("list_shops");
    expect(names).not.toContain("list_products");
  });

  it("carries exact spec parameter names in the input schema", async () => {
    h = await startHarness();
    const { tools } = await h.client.listTools();
    const t = tools.find((x) => x.name === "list_blueprint_variants")!;
    expect(Object.keys(t.inputSchema.properties!)).toEqual([
      "blueprint_id",
      "print_provider_id",
      "show-out-of-stock",
    ]);
    expect(t.inputSchema.required).toEqual(["blueprint_id", "print_provider_id"]);
  });
});

describe("authentication and response handling", () => {
  it("sends bearer auth and a generic User-Agent, returning pretty-printed JSON", async () => {
    const body = [{ id: 1, title: "My Shop" }];
    const { res, req } = await call(
      "retrieve_list_of_shops_in_a_printify_account",
      {},
      createFakeFetch({ body }),
    );
    expect(req).toMatchObject({
      method: "GET",
      url: "https://api.printify.com/v1/shops.json",
      headers: { authorization: "Bearer test-token", "user-agent": "printify-mcp" },
    });
    expect(res.isError).toBeFalsy();
    expect(resultText(res)).toBe(JSON.stringify(body, null, 2));
  });

  it("returns an error result on a non-2xx response", async () => {
    const { res } = await call(
      "retrieve_list_of_shops_in_a_printify_account",
      {},
      createFakeFetch({ status: 401, body: "nope" }),
    );
    expect(res.isError).toBe(true);
    expect(resultText(res)).toContain("401");
    expect(resultText(res)).toContain("nope");
  });

  it("rejects invalid arguments without calling Printify", async () => {
    const { res, http } = await call("retrieve_a_list_of_products", {});
    expect(res.isError).toBe(true);
    expect(http.requests).toHaveLength(0);
  });
});

// One representative GET per Toolset area.
describe.each([
  ["shops", "retrieve_list_of_shops_in_a_printify_account", {}, "/v1/shops.json"],
  [
    "catalog",
    "retrieve_a_specific_blueprint",
    { blueprint_id: 5 },
    "/v1/catalog/blueprints/5.json",
  ],
  [
    "catalog (V2 shipping)",
    "retrieve_economy_shipping_method_information",
    { blueprint_id: 5, print_provider_id: 9 },
    "/v2/catalog/blueprints/5/print_providers/9/shipping/economy.json",
  ],
  [
    "products",
    "retrieve_a_product",
    { shop_id: 1, product_id: "abc" },
    "/v1/shops/1/products/abc.json",
  ],
  [
    "orders",
    "get_order_details_by_id",
    { shop_id: 1, order_id: "o 1" },
    "/v1/shops/1/orders/o%201.json",
  ],
  [
    "personalization",
    "retrieve_personalization_options",
    { shop_id: 1, product_id: "p" },
    "/v1/shops/1/products/p/personalization_options.json",
  ],
  [
    "support requests",
    "get_order_support_request_by_id",
    { shop_id: 1, order_id: "o", supportRequestId: "sr" },
    "/v1/shops/1/orders/o/support-requests/sr",
  ],
  ["uploads", "retrieve_an_uploaded_image_by_id", { image_id: "img" }, "/v1/uploads/img.json"],
  ["webhooks", "retrieve_a_list_of_webhooks", { shop_id: 1 }, "/v1/shops/1/webhooks.json"],
])("%s", (_area, tool, args, path) => {
  it(`${tool} GETs ${path}`, async () => {
    const { res, req } = await call(tool, args);
    expect(req).toMatchObject({
      method: "GET",
      url: `https://api.printify.com${path}`,
      headers: { authorization: "Bearer test-token" },
    });
    expect(res.isError).toBeFalsy();
  });
});

describe("query parameters", () => {
  it("sends hyphenated query params under their exact spec name", async () => {
    const { req } = await call("list_blueprint_variants", {
      blueprint_id: 5,
      print_provider_id: 9,
      "show-out-of-stock": "1",
    });
    expect(req!.url).toBe(
      "https://api.printify.com/v1/catalog/blueprints/5/print_providers/9/variants.json?show-out-of-stock=1",
    );
  });

  it("omits unset query params and sends set ones", async () => {
    const { req } = await call("retrieve_a_list_of_products", { shop_id: 42, page: 3, limit: 10 });
    expect(req!.url).toBe("https://api.printify.com/v1/shops/42/products.json?limit=10&page=3");
    const none = await call("retrieve_a_list_of_products", { shop_id: 42 });
    expect(none.req!.url).toBe("https://api.printify.com/v1/shops/42/products.json");
  });
});
