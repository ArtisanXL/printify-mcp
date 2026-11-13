/** Minimal JSON Schema (OpenAPI 3.0) -> zod source converter. Emits TypeScript source text. */
export type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export type RefResolver = (ref: string) => Json;

const str = (s: string) => JSON.stringify(s);

/** Resolves `$ref` (local `#/...` pointers) against the document. */
export function makeResolver(doc: Json): RefResolver {
  return (ref) => {
    if (!ref.startsWith("#/")) throw new Error(`Unsupported $ref: ${ref}`);
    let node = doc;
    for (const part of ref.slice(2).split("/")) {
      node = node?.[part.replace(/~1/g, "/").replace(/~0/g, "~")];
    }
    if (node === undefined) throw new Error(`Unresolvable $ref: ${ref}`);
    return node;
  };
}

/** Follows `$ref` chains to a concrete node. */
export function deref(node: Json, resolve: RefResolver): Json {
  const seen = new Set<string>();
  while (node && typeof node === "object" && typeof node.$ref === "string") {
    if (seen.has(node.$ref)) throw new Error(`Circular $ref: ${node.$ref}`);
    seen.add(node.$ref);
    node = resolve(node.$ref);
  }
  return node;
}

export function schemaToZod(schema: Json, resolve: RefResolver, stack: string[] = []): string {
  if (schema === true || schema === undefined || schema === null) return "z.any()";
  if (typeof schema.$ref === "string") {
    if (stack.includes(schema.$ref)) return "z.any()"; // recursive type: stay permissive
    return schemaToZod(resolve(schema.$ref), resolve, [...stack, schema.$ref]);
  }
  let code = baseToZod(schema, resolve, stack);
  if (schema.nullable === true) code += ".nullable()";
  return code;
}

function mergeAllOf(schema: Json, resolve: RefResolver, stack: string[]): Json {
  const merged: Json = { type: "object", properties: {}, required: [] };
  for (const part of schema.allOf) {
    const p = deref(part, resolve);
    const sub = p.allOf ? mergeAllOf(p, resolve, stack) : p;
    Object.assign(merged.properties, sub.properties ?? {});
    merged.required.push(...(sub.required ?? []));
    if (sub.nullable) merged.nullable = true;
  }
  const { allOf: _a, ...rest } = schema;
  return {
    ...rest,
    ...merged,
    properties: { ...merged.properties, ...(schema.properties ?? {}) },
    required: [...merged.required, ...(schema.required ?? [])],
  };
}

function baseToZod(schema: Json, resolve: RefResolver, stack: string[]): string {
  if (schema.allOf) return schemaToZod(mergeAllOf(schema, resolve, stack), resolve, stack);
  const union = schema.oneOf ?? schema.anyOf;
  if (union) {
    const members = union.map((m: Json) => schemaToZod(m, resolve, stack));
    return members.length === 1 ? members[0] : `z.union([${members.join(", ")}])`;
  }
  if (schema.enum) {
    const values: unknown[] = schema.enum;
    if (values.length > 0 && values.every((v) => typeof v === "string")) {
      return `z.enum([${values.map((v) => str(v as string)).join(", ")}])`;
    }
    const lits = values.map((v) => `z.literal(${JSON.stringify(v)})`);
    return lits.length === 1 ? lits[0]! : `z.union([${lits.join(", ")}])`;
  }
  switch (schema.type) {
    case "string": {
      let c = "z.string()";
      if (typeof schema.minLength === "number") c += `.min(${schema.minLength})`;
      if (typeof schema.maxLength === "number") c += `.max(${schema.maxLength})`;
      return c;
    }
    case "integer":
    case "number": {
      let c = schema.type === "integer" ? "z.number().int()" : "z.number()";
      if (typeof schema.minimum === "number") c += `.min(${schema.minimum})`;
      if (typeof schema.maximum === "number") c += `.max(${schema.maximum})`;
      return c;
    }
    case "boolean":
      return "z.boolean()";
    case "array": {
      let c = `z.array(${schemaToZod(schema.items, resolve, stack)})`;
      if (typeof schema.minItems === "number") c += `.min(${schema.minItems})`;
      if (typeof schema.maxItems === "number") c += `.max(${schema.maxItems})`;
      return c;
    }
  }
  if (schema.type === "object" || schema.properties) {
    const props: Record<string, Json> = schema.properties ?? {};
    const names = Object.keys(props);
    if (names.length === 0) {
      const ap = schema.additionalProperties;
      const valueType = ap && typeof ap === "object" ? schemaToZod(ap, resolve, stack) : "z.any()";
      return `z.record(z.string(), ${valueType})`;
    }
    const required = new Set<string>(schema.required ?? []);
    const fields = names.map((n) => {
      let c = schemaToZod(props[n], resolve, stack);
      if (!required.has(n)) c += ".optional()";
      const d = describe(props[n], resolve);
      if (d) c += `.describe(${str(d)})`;
      return `${str(n)}: ${c}`;
    });
    // Loose: never silently strip fields the spec does not (fully) describe.
    return `z.looseObject({ ${fields.join(", ")} })`;
  }
  return "z.any()";
}

/** Description of a (possibly $ref'd) schema node. */
export function describe(schema: Json, resolve: RefResolver): string | undefined {
  const node = deref(schema, resolve);
  const d = schema?.description ?? node?.description;
  return typeof d === "string" && d.trim() ? d.trim() : undefined;
}
