import { deref, describe, makeResolver, schemaToZod, type Json } from "./schema.js";
import type { Overrides } from "./overrides.js";

/** 64 (MCP client name limit) minus `mcp__printify__`. */
export const MAX_TOOL_NAME_LENGTH = 64 - "mcp__printify__".length;

const HTTP_METHODS = ["get", "put", "post", "delete", "patch", "head", "options"] as const;

export interface GenerateOptions {
  /** Lower-case HTTP methods to emit Tools for. */
  methods: readonly string[];
}

export function toSnakeCase(s: string): string {
  return s
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

interface Param {
  name: string;
  in: "path" | "query";
  required: boolean;
  zod: string;
}

interface ToolModel {
  name: string;
  operationId: string;
  method: string;
  path: string;
  description: string;
  toolset: string;
  pathParams: string[];
  queryParams: string[];
  hasBody: boolean;
  annotations: { readOnlyHint: boolean; destructiveHint: boolean };
  shape: string[]; // `"key": <zod source>` lines
}

/** Builds the Tool models for the selected Operations. Throws on any spec/override inconsistency. */
export function buildTools(spec: Json, overrides: Overrides, options: GenerateOptions): ToolModel[] {
  const resolve = makeResolver(spec);

  // Validate overrides against ALL Operations, not just the selected methods.
  const allOperationIds = new Set<string>();
  const allTags = new Set<string>();
  for (const item of Object.values<Json>(spec.paths ?? {})) {
    for (const m of HTTP_METHODS) {
      if (item[m]?.operationId) allOperationIds.add(item[m].operationId);
      if (item[m]) allTags.add(item[m].tags?.[0] ?? "");
    }
  }
  for (const key of Object.keys(overrides.toolsetOverrides)) {
    if (!allTags.has(key)) throw new Error(`Toolset override key "${key}" matches no Operation tag in the spec`);
  }
  const idKeys: [string, string[]][] = [
    ["nameOverrides", Object.keys(overrides.nameOverrides)],
    ["readOnlyExceptions", overrides.readOnlyExceptions],
    ["destructive", overrides.destructive],
    ["paid", overrides.paid],
    ["notes", Object.keys(overrides.notes)],
  ];
  for (const [category, keys] of idKeys) {
    for (const key of keys) {
      if (!allOperationIds.has(key)) {
        throw new Error(`Override key "${key}" (${category}) matches no operationId in the spec`);
      }
    }
  }

  const tools: ToolModel[] = [];
  const names = new Map<string, string>();
  for (const [path, item] of Object.entries<Json>(spec.paths ?? {})) {
    for (const method of HTTP_METHODS) {
      const op = item[method];
      if (!op || !options.methods.includes(method)) continue;
      const operationId: string | undefined = op.operationId;
      if (!operationId) throw new Error(`${method.toUpperCase()} ${path} has no operationId`);

      const name = overrides.nameOverrides[operationId] ?? toSnakeCase(operationId);
      if (name.length > MAX_TOOL_NAME_LENGTH) {
        throw new Error(
          `Tool name "${name}" (${name.length} chars) for operationId ${operationId} exceeds ` +
            `${MAX_TOOL_NAME_LENGTH}; add a nameOverrides entry`,
        );
      }
      const clash = names.get(name);
      if (clash) throw new Error(`Tool name "${name}" is used by both ${clash} and ${operationId}`);
      names.set(name, operationId);

      const params = collectParams(item.parameters ?? [], op.parameters ?? [], resolve, operationId);
      const shape: string[] = [];
      for (const p of params) {
        shape.push(`${JSON.stringify(p.name)}: ${p.zod}`);
      }
      let hasBody = false;
      if (op.requestBody) {
        const rb = deref(op.requestBody, resolve);
        const media = rb.content?.["application/json"];
        if (!media?.schema) {
          throw new Error(`${operationId}: request body has no application/json schema`);
        }
        {
          hasBody = true;
          if (params.some((p) => p.name === "body")) {
            throw new Error(`${operationId}: a parameter named "body" collides with the request body`);
          }
          let c = schemaToZod(media.schema, resolve);
          if (rb.required !== true) c += ".optional()";
          const d = rb.description ?? describe(media.schema, resolve);
          if (d) c += `.describe(${JSON.stringify(String(d).trim())})`;
          shape.push(`"body": ${c}`);
        }
      }

      const paid = overrides.paid.includes(operationId);
      const write = method !== "get" && !overrides.readOnlyExceptions.includes(operationId);
      const destructive =
        write && (method === "delete" || paid || overrides.destructive.includes(operationId));
      let description = String(op.description ?? op.summary ?? operationId).trim();
      if (paid) description = `PAID: this call can charge your Printify account. ${description}`;
      const note = overrides.notes[operationId];
      if (note) description = `${description}\n\n${note}`;

      const tag: string = op.tags?.[0] ?? "";
      tools.push({
        name,
        operationId,
        method: method.toUpperCase(),
        path,
        description,
        toolset: overrides.toolsetOverrides[tag] ?? toSnakeCase(tag),
        pathParams: params.filter((p) => p.in === "path").map((p) => p.name),
        queryParams: params.filter((p) => p.in === "query").map((p) => p.name),
        hasBody,
        annotations: { readOnlyHint: !write, destructiveHint: destructive },
        shape,
      });
    }
  }
  return tools.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

function collectParams(pathLevel: Json[], opLevel: Json[], resolve: ReturnType<typeof makeResolver>, opId: string): Param[] {
  const byKey = new Map<string, Param>();
  for (const raw of [...pathLevel, ...opLevel]) {
    const p = deref(raw, resolve);
    if (p.in !== "path" && p.in !== "query") continue; // header/cookie params are not exposed
    let zod = schemaToZod(p.schema, resolve);
    const required = p.in === "path" || p.required === true;
    if (!required) zod += ".optional()";
    const d = p.description ?? describe(p.schema, resolve);
    if (d) zod += `.describe(${JSON.stringify(String(d).trim())})`;
    byKey.set(`${p.in}:${p.name}`, { name: p.name, in: p.in, required, zod });
  }
  const params = [...byKey.values()];
  const seen = new Set<string>();
  for (const p of params) {
    if (seen.has(p.name)) throw new Error(`${opId}: parameter name "${p.name}" is used twice`);
    seen.add(p.name);
  }
  return params;
}

/** Emits the TypeScript source for the generated module. Deterministic. */
export function emit(tools: ToolModel[]): string {
  const lines: string[] = [
    "// GENERATED by `npm run generate` from spec/openapi.json and scripts/generate/overrides.ts.",
    "// Do not edit by hand.",
    'import { z } from "zod";',
    'import type { ToolDef } from "../tool-def.js";',
    "",
    "export const tools: readonly ToolDef[] = [",
  ];
  for (const t of tools) {
    lines.push(
      "  {",
      `    name: ${JSON.stringify(t.name)},`,
      `    operationId: ${JSON.stringify(t.operationId)},`,
      `    method: ${JSON.stringify(t.method)},`,
      `    path: ${JSON.stringify(t.path)},`,
      `    description: ${JSON.stringify(t.description)},`,
      `    toolset: ${JSON.stringify(t.toolset)},`,
      `    pathParams: ${JSON.stringify(t.pathParams)},`,
      `    queryParams: ${JSON.stringify(t.queryParams)},`,
      `    hasBody: ${t.hasBody},`,
      `    annotations: ${JSON.stringify(t.annotations)},`,
      "    inputSchema: {",
      ...t.shape.map((s) => `      ${s},`),
      "    },",
      "  },",
    );
  }
  lines.push("];", "");
  const names = [...new Set(tools.map((t) => t.toolset))].sort();
  lines.push(
    "/** Every Toolset name present in `tools`, derived from the spec tags. */",
    `export const toolsetNames: readonly string[] = ${JSON.stringify(names)};`,
    "",
  );
  return lines.join("\n");
}

export function generate(spec: Json, overrides: Overrides, options: GenerateOptions): string {
  return emit(buildTools(spec, overrides, options));
}
