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

- `list_shops` — list shops on the account
- `list_products` — list products in a shop

## Development

```sh
npm install
npm run build
PRINTIFY_API_TOKEN=... npm start
```

## License

MIT
