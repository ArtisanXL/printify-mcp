import { createRequire } from "node:module";
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

describe("server info", () => {
  it("reports the package.json version", async () => {
    h = await startHarness();
    const pkg = createRequire(import.meta.url)("../package.json") as { version: string };
    expect(h.client.getServerVersion()?.version).toBe(pkg.version);
  });
});

describe("tool listing", () => {
  it("exposes every read-only Operation (GETs plus the shipping-cost POST), read-only annotated, with descriptions and schemas", async () => {
    h = await startHarness();
    const { tools } = await h.client.listTools();
    expect(tools).toHaveLength(28);
    for (const t of tools) {
      expect(t.annotations?.readOnlyHint, t.name).toBe(true);
      expect(t.annotations?.destructiveHint, t.name).toBe(false);
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

describe("dispatcher robustness", () => {
  const SHOPS = "retrieve_list_of_shops_in_a_printify_account";

  it("returns status and JSON error body as an error result", async () => {
    const { res } = await call(SHOPS, {}, createFakeFetch({ status: 422, body: { errors: { reason: "bad" } } }));
    expect(res.isError).toBe(true);
    expect(resultText(res)).toContain("422");
    expect(resultText(res)).toContain("bad");
  });

  it("does not retry on 429", async () => {
    const { res, http } = await call(SHOPS, {}, createFakeFetch({ status: 429, body: "slow down" }));
    expect(res.isError).toBe(true);
    expect(resultText(res)).toContain("429");
    expect(resultText(res)).toContain("slow down");
    expect(http.requests).toHaveLength(1);
  });

  it("reports success with the status for an empty 204 body", async () => {
    const { res } = await call(SHOPS, {}, createFakeFetch({ status: 204 }));
    expect(res.isError).toBeFalsy();
    expect(resultText(res)).toContain("204");
    expect(resultText(res).toLowerCase()).toContain("success");
  });

  it("returns a non-JSON body as raw text", async () => {
    const { res } = await call(SHOPS, {}, createFakeFetch({ body: "plain <text>" }));
    expect(res.isError).toBeFalsy();
    expect(resultText(res)).toBe("plain <text>");
  });

  it("uses a custom apiBase, keeping its path prefix", async () => {
    const http = createFakeFetch();
    h = await startHarness({ apiBase: "https://enterprise.printful.com/api/pfy/public" }, http);
    await h.client.callTool({ name: SHOPS, arguments: {} });
    expect(http.requests[0].url).toBe("https://enterprise.printful.com/api/pfy/public/v1/shops.json");
  });

  it("strips trailing slashes from apiBase", async () => {
    const http = createFakeFetch();
    h = await startHarness({ apiBase: "https://example.test/prefix//" }, http);
    await h.client.callTool({ name: SHOPS, arguments: {} });
    expect(http.requests[0].url).toBe("https://example.test/prefix/v1/shops.json");
  });

  it("treats a whitespace-only apiBase as unset", async () => {
    const http = createFakeFetch();
    h = await startHarness({ apiBase: "   " }, http);
    await h.client.callTool({ name: SHOPS, arguments: {} });
    expect(http.requests[0].url).toBe("https://api.printify.com/v1/shops.json");
  });

  it("returns an error result with method and URL when fetch throws, without leaking the token", async () => {
    const http = createFakeFetch();
    const failing = (async () => {
      throw new Error("connect ECONNREFUSED test-token");
    }) as unknown as typeof fetch;
    h = await startHarness({ token: "test-token" }, { ...http, fetch: failing });
    const res = await h.client.callTool({ name: SHOPS, arguments: {} });
    expect(res.isError).toBe(true);
    const t = resultText(res);
    expect(t).toContain("GET https://api.printify.com/v1/shops.json");
    expect(t).toContain("ECONNREFUSED");
    expect(t).not.toContain("test-token");
  });

  it("returns an error with the status for a non-2xx empty body", async () => {
    const { res } = await call(SHOPS, {}, createFakeFetch({ status: 500 }));
    expect(res.isError).toBe(true);
    expect(resultText(res)).toContain("500");
  });

  it("reports success for a 200 with an empty body", async () => {
    const { res } = await call(SHOPS, {}, createFakeFetch({ status: 200 }));
    expect(res.isError).toBeFalsy();
    expect(resultText(res).toLowerCase()).toContain("success");
  });

  it("reports success for a whitespace-only 2xx body", async () => {
    const { res } = await call(SHOPS, {}, createFakeFetch({ status: 200, body: "  \n " }));
    expect(res.isError).toBeFalsy();
    expect(resultText(res).toLowerCase()).toContain("success");
  });
});

describe("Read-only Mode and Write Tools", () => {
  const PAID = ["submit_an_order", "submit_a_printify_express_order", "send_an_existing_order_to_production"];
  const DESTRUCTIVE_EXTRA = ["cancel_an_order", "cancel_an_order_line_item", "archive_an_uploaded_image"];
  const DELETES = ["delete_a_product", "delete_a_webhook", "disconnect_a_shop"];

  async function list(config: Parameters<typeof startHarness>[0]) {
    h = await startHarness(config);
    return (await h.client.listTools()).tools;
  }

  it("offers only read-only Tools by default, including the shipping-cost POST", async () => {
    const tools = await list({});
    expect(tools).toHaveLength(28);
    expect(tools.map((t) => t.name)).toContain("calculate_the_shipping_cost_of_an_order");
    expect(tools.map((t) => t.name)).not.toContain("create_a_new_product");
    for (const t of tools) expect(t.annotations?.readOnlyHint, t.name).toBe(true);
  });

  it("offers all 53 Tools when Read-only Mode is off, with explicit annotations", async () => {
    const tools = await list({ readOnly: false });
    expect(tools).toHaveLength(53);
    const destructive = tools.filter((t) => t.annotations?.destructiveHint).map((t) => t.name).sort();
    expect(destructive).toEqual([...PAID, ...DESTRUCTIVE_EXTRA, ...DELETES].sort());
    for (const t of tools) {
      expect(typeof t.annotations?.readOnlyHint, t.name).toBe("boolean");
      expect(typeof t.annotations?.destructiveHint, t.name).toBe("boolean");
    }
    const by = (n: string) => tools.find((t) => t.name === n)!;
    expect(by("update_a_product").annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });
    expect(by("create_a_new_product").annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });
    expect(by("calculate_the_shipping_cost_of_an_order").annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
  });

  it("prefixes Paid Tools and notes sales-channel-only Tools", async () => {
    const tools = await list({ readOnly: false });
    for (const n of PAID) {
      expect(tools.find((t) => t.name === n)!.description, n).toMatch(/^PAID: this call can charge your Printify account/);
    }
    expect(tools.filter((t) => t.description?.startsWith("PAID")).map((t) => t.name).sort()).toEqual([...PAID].sort());
    for (const n of [
      "set_product_publish_status_to_succeeded",
      "set_product_publish_status_to_failed",
      "notify_that_a_product_has_been_unpublished",
    ]) {
      expect(tools.find((t) => t.name === n)!.description, n).toMatch(/custom sales channel/i);
    }
  });

  const cases: [string, string, Record<string, unknown>, string, string, unknown?][] = [
    ["shops", "disconnect_a_shop", { shop_id: 5 }, "DELETE", "/v1/shops/5/connection.json"],
    ["products", "update_a_product", { shop_id: 5, product_id: "p1", body: { title: "T" } }, "PUT", "/v1/shops/5/products/p1.json", { title: "T" }],
    ["products", "create_a_new_product", { shop_id: 5, body: { title: "T", description: "D", blueprint_id: 3, print_provider_id: 4, variants: [], print_areas: [] } }, "POST", "/v1/shops/5/products.json", { title: "T", description: "D", blueprint_id: 3, print_provider_id: 4, variants: [], print_areas: [] }],
    ["orders", "request_an_order_reprint", { shop_id: 5, order_id: "o1", body: { reason: "wrong_design", description: "d", line_items: [{ line_item_id: "l", quantity: 1 }] } }, "POST", "/v1/shops/5/orders/o1/support-requests/reprint", { reason: "wrong_design", description: "d", line_items: [{ line_item_id: "l", quantity: 1 }] }],
    ["personalization", "create_a_personalization_configuration", { shop_id: 5, product_id: "p1", body: { variant_id: 1, items: [{ field_id: "f", type: "textbox", input: { text: "x" } }] } }, "POST", "/v1/shops/5/products/p1/personalization.json", { variant_id: 1, items: [{ field_id: "f", type: "textbox", input: { text: "x" } }] }],
    ["uploads", "upload_an_image", { body: { file_name: "a.png", url: "http://x/a.png" } }, "POST", "/v1/uploads/images.json", { file_name: "a.png", url: "http://x/a.png" }],
    ["webhooks", "modify_a_webhook", { shop_id: 5, webhook_id: "w", body: { url: "http://h" } }, "PUT", "/v1/shops/5/webhooks/w.json", { url: "http://h" }],
    ["webhooks", "create_a_new_webhook", { shop_id: 5, body: { topic: "product:created", url: "http://h" } }, "POST", "/v1/shops/5/webhooks.json", { topic: "product:created", url: "http://h" }],
    ["webhooks", "delete_a_webhook", { shop_id: 5, webhook_id: "w", host: "h.example" }, "DELETE", "/v1/shops/5/webhooks/w.json?host=h.example"],
    ["orders", "calculate_the_shipping_cost_of_an_order", { shop_id: 5, body: { line_items: [], address_to: { country: "US" } } }, "POST", "/v1/shops/5/orders/shipping.json", { line_items: [], address_to: { country: "US" } }],
  ];
  it.each(cases)("%s: %s sends the right method, URL and JSON body", async (_ts, name, args, method, path, body) => {
    // calculate_the_shipping_cost works in Read-only Mode; the rest need it off.
    const http = createFakeFetch();
    h = await startHarness({ readOnly: name.startsWith("calculate") ? undefined : false }, http);
    const res = await h.client.callTool({ name, arguments: args });
    expect(res.isError, resultText(res)).toBeFalsy();
    const req = http.requests[0]!;
    expect(req.method).toBe(method);
    expect(req.url).toBe(`https://api.printify.com${path}`);
    if (body === undefined) expect(req.body).toBeUndefined();
    else {
      expect(JSON.parse(req.body!)).toEqual(body);
      expect(req.headers["content-type"]).toBe("application/json");
    }
  });
});
