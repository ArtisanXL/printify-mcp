import { describe, expect, it } from "vitest";
import { z } from "zod";
import { buildTools, generate } from "../scripts/generate/generate.js";
import type { Overrides } from "../scripts/generate/overrides.js";

const none: Overrides = {
  nameOverrides: {},
  toolsetOverrides: {},
  readOnlyExceptions: [],
  destructive: [],
  paid: [],
  notes: {},
};

function spec(paths: object, components: object = {}) {
  return { openapi: "3.0.3", paths, components };
}

/** Evaluates a generated Tool's input schema source. */
function inputSchema(tool: { shape: string[] }) {
  return new Function("z", `return z.object({ ${tool.shape.join(", ")} });`)(z) as z.ZodType;
}

describe("generator", () => {
  it("fails on an over-long Tool name without an override", () => {
    const long = "retrieveAListOfAllPrintProvidersThatFulfillOrdersForASpecificBlueprint";
    const s = spec({ "/x": { get: { operationId: long, tags: ["T"] } } });
    expect(() => generate(s, none, { methods: ["get"] })).toThrow(/exceeds 49/);
    expect(() =>
      generate(s, { ...none, nameOverrides: { [long]: "list_things" } }, { methods: ["get"] }),
    ).not.toThrow();
  });

  it("fails on an override key matching no operationId", () => {
    const s = spec({ "/x": { get: { operationId: "getX", tags: ["T"] } } });
    expect(() =>
      generate(s, { ...none, nameOverrides: { nope: "n" } }, { methods: ["get"] }),
    ).toThrow(/nope/);
  });

  it("fails on a toolsetOverrides key matching no Operation tag", () => {
    const s = spec({ "/x": { get: { operationId: "getX", tags: ["T"] } } });
    expect(() =>
      generate(s, { ...none, toolsetOverrides: { Nope: "n" } }, { methods: ["get"] }),
    ).toThrow(/Nope/);
    expect(() =>
      generate(s, { ...none, toolsetOverrides: { T: "n" } }, { methods: ["get"] }),
    ).not.toThrow();
  });

  it("fails on a request body without an application/json schema", () => {
    const s = spec({
      "/x": {
        post: {
          operationId: "postX",
          tags: ["T"],
          requestBody: { content: { "multipart/form-data": { schema: { type: "object" } } } },
        },
      },
    });
    expect(() => generate(s, none, { methods: ["post"] })).toThrow(/postX.*application\/json/);
  });

  it("resolves $refs in parameters, request bodies and nested schemas", () => {
    const s = spec(
      {
        "/things/{id}": {
          post: {
            operationId: "createThing",
            tags: ["Things"],
            parameters: [{ $ref: "#/components/parameters/id" }, { $ref: "#/components/parameters/dry-run" }],
            requestBody: { $ref: "#/components/requestBodies/thing" },
          },
        },
      },
      {
        parameters: {
          id: { name: "id", in: "path", required: true, schema: { type: "integer" } },
          "dry-run": { name: "dry-run", in: "query", schema: { type: "string", enum: ["0", "1"] } },
        },
        requestBodies: {
          thing: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/Thing" } } },
          },
        },
        schemas: {
          Thing: {
            type: "object",
            required: ["inner", "choice"],
            properties: {
              inner: { $ref: "#/components/schemas/Inner" },
              choice: {
                oneOf: [
                  { type: "object", required: ["url"], properties: { url: { type: "string" } } },
                  { type: "object", required: ["contents"], properties: { contents: { type: "string" } } },
                ],
              },
            },
          },
          Inner: { type: "object", required: ["n"], properties: { n: { type: "number" } } },
        },
      },
    );
    const [tool] = buildTools(s, none, { methods: ["post"] });
    expect(tool!.name).toBe("create_thing");
    const schema = inputSchema(tool!);
    const ok = { id: 1, "dry-run": "1", body: { inner: { n: 2 }, choice: { url: "http://x" } } };
    expect(schema.safeParse(ok).success).toBe(true);
    expect(schema.safeParse({ ...ok, body: { ...ok.body, choice: { contents: "abc" } } }).success).toBe(true);
    expect(schema.safeParse({ ...ok, body: { ...ok.body, choice: {} } }).success).toBe(false);
    expect(schema.safeParse({ ...ok, body: { inner: { n: "x" }, choice: { url: "u" } } }).success).toBe(false);
    expect(schema.safeParse({ ...ok, "dry-run": "2" }).success).toBe(false);
  });

  it("fails on an unknown key in every operationId override category", () => {
    const s = spec({ "/x": { post: { operationId: "postX", tags: ["T"] } } });
    for (const category of ["readOnlyExceptions", "destructive", "paid"] as const) {
      expect(() => generate(s, { ...none, [category]: ["nope"] }, { methods: ["post"] }), category).toThrow(/nope/);
      expect(() => generate(s, { ...none, [category]: ["postX"] }, { methods: ["post"] }), category).not.toThrow();
    }
    expect(() => generate(s, { ...none, notes: { nope: "n" } }, { methods: ["post"] })).toThrow(/nope/);
    expect(() => generate(s, { ...none, notes: { postX: "n" } }, { methods: ["post"] })).not.toThrow();
  });

  it("converts a oneOf request body into a union that accepts each variant", () => {
    const s = spec({
      "/u": {
        post: {
          operationId: "upload",
          tags: ["T"],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  oneOf: [
                    { type: "object", required: ["file_name", "url"], properties: { file_name: { type: "string" }, url: { type: "string" } } },
                    { type: "object", required: ["file_name", "contents"], properties: { file_name: { type: "string" }, contents: { type: "string" } } },
                  ],
                },
              },
            },
          },
        },
      },
    });
    const [tool] = buildTools(s, none, { methods: ["post"] });
    const schema = inputSchema(tool!);
    expect(schema.safeParse({ body: { file_name: "a", url: "u" } }).success).toBe(true);
    expect(schema.safeParse({ body: { file_name: "a", contents: "c" } }).success).toBe(true);
    expect(schema.safeParse({ body: { file_name: "a" } }).success).toBe(false);
  });

  it("classifies by method with overrides, and prefixes Paid descriptions", () => {
    const s = spec({
      "/a": { get: { operationId: "getA", tags: ["T"] }, post: { operationId: "quote", tags: ["T"] }, put: { operationId: "putA", tags: ["T"] }, delete: { operationId: "delA", tags: ["T"] } },
      "/b": { post: { operationId: "pay", description: "Pay it", tags: ["T"] } },
      "/c": { post: { operationId: "cancelC", tags: ["T"] } },
    });
    const o = { ...none, readOnlyExceptions: ["quote"], paid: ["pay"], destructive: ["cancelC"], notes: { putA: "Channel only." } };
    const by = Object.fromEntries(buildTools(s, o, { methods: ["get", "post", "put", "delete"] }).map((t) => [t.operationId, t]));
    expect(by.getA!.annotations).toEqual({ readOnlyHint: true, destructiveHint: false });
    expect(by.quote!.annotations).toEqual({ readOnlyHint: true, destructiveHint: false });
    expect(by.putA!.annotations).toEqual({ readOnlyHint: false, destructiveHint: false });
    expect(by.delA!.annotations).toEqual({ readOnlyHint: false, destructiveHint: true });
    expect(by.pay!.annotations).toEqual({ readOnlyHint: false, destructiveHint: true });
    expect(by.cancelC!.annotations).toEqual({ readOnlyHint: false, destructiveHint: true });
    expect(by.pay!.description).toMatch(/^PAID: .*charge.*Pay it/);
    expect(by.putA!.description).toMatch(/Channel only\./);
  });

  it("is deterministic", () => {
    const s = spec({ "/x": { get: { operationId: "getX", tags: ["T"] } }, "/y": { get: { operationId: "getY", tags: ["T"] } } });
    expect(generate(s, none, { methods: ["get"] })).toBe(generate(s, none, { methods: ["get"] }));
  });
});
