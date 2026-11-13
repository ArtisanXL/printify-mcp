# @artisanxl/printify-mcp

MCP server for the [Printify API](https://developers.printify.com/). It exposes every Printify Public API Operation as a Tool (53 in total), safely read-only by default.

## Setup

Create a Printify personal access token, then register the server under the name `printify`.

Claude Code:

```sh
claude mcp add printify --env PRINTIFY_API_TOKEN=<your-token> -- npx -y @artisanxl/printify-mcp
```

Claude Desktop (`claude_desktop_config.json`) or any client using `mcpServers`:

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

To also allow Write Tools, add `"PRINTIFY_READ_ONLY": "false"` to `env`.

## Environment variables

| Variable | Default | Meaning |
| --- | --- | --- |
| `PRINTIFY_API_TOKEN` | none (required) | Printify personal access token. The server exits if it is missing. |
| `PRINTIFY_READ_ONLY` | on | Read-only Mode. Only `false` or `0` (case-insensitive, whitespace trimmed) turns it off; any other value keeps it on. |
| `PRINTIFY_TOOLSETS` | all | Comma-separated Toolset names to offer (case-insensitive, whitespace trimmed). An unknown name is a startup error that lists the valid ones. |
| `PRINTIFY_API_BASE` | `https://api.printify.com` | API base URL, without a version prefix. Whitespace and trailing slashes are trimmed. |

See `.env.example`.

## Tool naming

Each Tool exposes exactly one Operation and is named as the snake_case form of its `operationId` in Printify's OpenAPI document, for example `retrieve_list_of_shops_in_a_printify_account` or `retrieve_a_list_of_products`.

MCP clients prefix Tool names with the server name (for example `mcp__printify__<tool>`) and limit the result to 64 characters. Tool names are therefore kept to 49 characters or fewer, assuming the server is registered as `printify`. If you register it under a longer name, long Tools may exceed your client's limit. Two Operations have names that are too long, so they are overridden:

| Tool | Operation |
| --- | --- |
| `list_blueprint_print_providers` | `retrieveAListOfAllPrintProvidersThatFulfillOrdersForASpecificBlueprint` |
| `list_blueprint_variants` | `retrieveAListOfVariantsOfABlueprintFromASpecificPrintProvider` |

Tools are generated from a committed Spec Snapshot (`spec/openapi.json`); see `docs/adr/`.

## Read-only Mode

By default only read-only Tools (28) are offered; Write Tools are not registered at all. Set `PRINTIFY_READ_ONLY=false` to offer all 53. Every Tool carries MCP annotations: `readOnlyHint` is true for read-only Tools, and `destructiveHint` is true for deletes, cancellations, archiving, disconnecting a shop, and Paid Tools. `calculate_the_shipping_cost_of_an_order` is a POST but changes nothing, so it stays available in Read-only Mode.

## Toolsets

`PRINTIFY_TOOLSETS` limits which Toolsets are offered, for example `PRINTIFY_TOOLSETS=catalog,products,uploads`. It combines with Read-only Mode: a Tool must be in an enabled Toolset and, in Read-only Mode, be read-only.

| Toolset | Contents |
| --- | --- |
| `catalog` | Blueprints, print providers, variants, size guides and shipping information |
| `orders` | Listing, details, submitting (including Printify Express), sending to production, cancelling, address changes and shipping-cost calculation for orders, plus the refund, reprint and address-change support-request POSTs |
| `personalization` | Personalization options, configuration and previews |
| `products` | Listing, retrieving, creating, updating, deleting and publishing products, and GPSR information |
| `shops` | Listing shops and disconnecting a shop |
| `support_requests` | Reading order support requests (the creating POSTs are in `orders`) |
| `uploads` | Listing, retrieving, uploading and archiving images |
| `webhooks` | Listing, creating, modifying, deleting and simulating webhooks |

## Paid Tools

These Write Tools can charge your Printify account:

- `submit_an_order`
- `submit_a_printify_express_order`
- `send_an_existing_order_to_production`

Their descriptions start with `PAID: this call can charge your Printify account.` and they have `destructiveHint: true`, so clients can ask for confirmation. They are only available with `PRINTIFY_READ_ONLY=false`.

## Sales-channel-only Tools

`set_product_publish_status_to_succeeded`, `set_product_publish_status_to_failed` and `notify_that_a_product_has_been_unpublished` are for custom sales channel integrations. Their descriptions say that regular merchants should not call them. They are Write Tools.

## Uploading an image from a file path

`upload_an_image` takes `url`, `contents` (base64) or `file_path` in its `body`; exactly one is required. `file_path` must be an absolute path on the machine running the server, or start with `~/` (expanded to the home directory). The file is read and sent base64-encoded, and `file_name` defaults to the file's basename. With `url` or `contents`, `file_name` is required.

## Development

```sh
npm install
npm run refresh-spec   # re-download spec/openapi.json
npm run generate       # regenerate src/generated/tools.ts (deterministic)
npm run typecheck && npm run build && npm test
PRINTIFY_API_TOKEN=... npm start
```

Hand-maintained naming, Toolset, destructive and Paid Tool decisions live in `scripts/generate/overrides.ts`. See `CONTRIBUTING.md`.

## License

MIT
