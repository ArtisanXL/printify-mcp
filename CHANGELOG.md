# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.0] - 2026-11-13

### Changed

- **BREAKING:** the hand-written `list_shops` and `list_products` Tools were removed. Use `retrieve_list_of_shops_in_a_printify_account` and `retrieve_a_list_of_products` instead.
- **BREAKING (new defaults):** the server now starts in Read-only Mode, so Write Tools are not offered unless `PRINTIFY_READ_ONLY` is `false` or `0`. All Toolsets are enabled unless `PRINTIFY_TOOLSETS` narrows them.
- The server now reports the version from `package.json`.

### Added

- Full Printify Public API coverage: 53 Tools generated from a committed Spec Snapshot (`spec/openapi.json`), named as the snake_case `operationId` (two long names are overridden).
- Read-only Mode (`PRINTIFY_READ_ONLY`, default on) with MCP tool annotations (`readOnlyHint`, `destructiveHint`). 28 Tools are read-only, including `calculate_the_shipping_cost_of_an_order`.
- Toolsets and the `PRINTIFY_TOOLSETS` filter: `catalog`, `orders`, `personalization`, `products`, `shops`, `support_requests`, `uploads`, `webhooks`.
- Paid Tools (`submit_an_order`, `submit_a_printify_express_order`, `send_an_existing_order_to_production`) are marked destructive and described with a `PAID:` prefix.
- `upload_an_image` accepts `file_path` (absolute or `~/` path) as an alternative to `url` or `contents`.
- `PRINTIFY_API_BASE` to override the API base URL (whitespace and trailing slashes are trimmed).
- Weekly spec-refresh workflow that regenerates the Tools from Printify's current spec.

## 0.1.0 (not published)

### Added

- Initial MCP server with `list_shops` and `list_products` tools.

[Unreleased]: https://github.com/ArtisanXL/printify-mcp/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/ArtisanXL/printify-mcp/releases/tag/v0.2.0
