import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generate } from "./generate.js";
import { overrides } from "./overrides.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const spec = JSON.parse(readFileSync(resolve(root, "spec/openapi.json"), "utf8"));

const code = generate(spec, overrides, { methods: ["get", "post", "put", "delete", "patch"] });

const out = resolve(root, "src/generated/tools.ts");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, code);
console.log(`Wrote ${out}`);
