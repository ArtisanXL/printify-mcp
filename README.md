# @artisanxl/printify-mcp

MCP server for the [Printify API](https://developers.printify.com/).

## Usage

```json
{
  "mcpServers": {
    "printify": {
      "command": "npx",
      "args": ["-y", "@artisanxl/printify-mcp"],
      "env": { "PRINTIFY_API_TOKEN": "<your-token>" }
    }
  }
}
```

## Tools

Every read-only (GET) Printify Public API Operation is exposed as a Tool, named after its snake_case `operationId` (for example `retrieve_list_of_shops_in_a_printify_account`, `retrieve_a_list_of_products`). The Tools are generated from a committed snapshot of Printify's OpenAPI document (`spec/openapi.json`). The hand-written `list_shops` and `list_products` Tools were removed.

## Development

```sh
npm install
npm run refresh-spec   # re-download spec/openapi.json
npm run generate       # regenerate src/generated/tools.ts (deterministic)
npm run build
PRINTIFY_API_TOKEN=... npm start
```

## License

MIT
