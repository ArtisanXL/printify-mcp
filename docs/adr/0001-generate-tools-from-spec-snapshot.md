# Generate Tools from a committed Spec Snapshot

We expose every Printify Public API Operation as its own Tool, generated at build time from a Spec Snapshot committed to the repo; the generated TypeScript is committed too. This mirrors the sibling `etsy-mcp` project. Hand-writing ~53 Tools doesn't track Printify's changes; loading the spec at runtime removes type safety and adds a network dependency at startup; a single generic `call_endpoint` Tool gives agents no per-Operation schema to reason with. Committing both snapshot and output makes every upstream API change a reviewable diff (refreshed by a weekly PR job, with CI verifying the output is in sync).

## Consequences

- Tool names follow `operationId` (snake_case), which broke the two hand-written 0.1.x tool names (released as 0.2.0).
- Two `operationId`s exceed the length MCP clients allow once prefixed, so a small name-override table exists; the generator fails on any new over-long name without an override, rather than truncating silently.
- Human judgement the spec can't express (Write Tool exceptions such as the read-only shipping-cost POST, Paid Tool marking, sales-channel-only notes) lives in one override file next to the generator.
- Image upload gains a hand-written `file_path` input — the only deviation from pure generation.
- Tool count is managed with Toolsets (derived from spec tags) and Read-only Mode rather than by merging Operations into fewer Tools.
