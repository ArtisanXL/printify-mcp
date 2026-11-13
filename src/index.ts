#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { main } from "./main.js";

await main(process.env, {
  fetch: globalThis.fetch,
  transport: new StdioServerTransport(),
  exit: (code) => process.exit(code),
});
