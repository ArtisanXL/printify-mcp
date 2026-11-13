import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const URL_ = "https://developers.printify.com/openapi.json";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const res = await fetch(URL_);
if (!res.ok) throw new Error(`Fetching ${URL_} failed: HTTP ${res.status}`);
const spec = await res.json();

const out = resolve(root, "spec/openapi.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(spec, null, 2) + "\n");
console.log(`Wrote ${out}. Run \`npm run generate\` next.`);
