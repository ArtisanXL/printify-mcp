import { describe, expect, it } from "vitest";
import { z } from "zod";
import { buildTools, generate } from "../scripts/generate/generate.js";
import type { Overrides } from "../scripts/generate/overrides.js";

const none: Overrides = { nameOverrides: {}, toolsetOverrides: {} };

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
    expect(tool).toMatchObject({
      name: "create_thing",
      pathParams: ["id"],
      queryParams: ["dry-run"],
      hasBody: true,
    });
    const schema = inputSchema(tool!);
    const ok = { id: 1, "dry-run": "1", body: { inner: { n: 2 }, choice: { url: "http://x" } } };
    expect(schema.safeParse(ok).success).toBe(true);
    expect(schema.safeParse({ ...ok, body: { ...ok.body, choice: { contents: "abc" } } }).success).toBe(true);
    expect(schema.safeParse({ ...ok, body: { ...ok.body, choice: {} } }).success).toBe(false);
    expect(schema.safeParse({ ...ok, body: { inner: { n: "x" }, choice: { url: "u" } } }).success).toBe(false);
    expect(schema.safeParse({ ...ok, "dry-run": "2" }).success).toBe(false);
  });

  it("is deterministic", () => {
    const s = spec({ "/x": { get: { operationId: "getX", tags: ["T"] } }, "/y": { get: { operationId: "getY", tags: ["T"] } } });
    expect(generate(s, none, { methods: ["get"] })).toBe(generate(s, none, { methods: ["get"] }));
  });
});
