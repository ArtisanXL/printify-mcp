# Contributing

Thanks for your interest in improving printify-mcp!

## Setup

```sh
git clone https://github.com/ArtisanXL/printify-mcp.git
cd printify-mcp
npm install
npm run build
```

Test locally with an MCP client by pointing it at `node /path/to/printify-mcp/dist/index.js`
and setting `PRINTIFY_API_TOKEN`.

## Pull Requests

1. Fork and create a branch from `main`.
2. Keep changes focused; one feature/fix per PR.
3. Make sure `npm run typecheck` and `npm run build` pass.
4. Update `README.md` and `CHANGELOG.md` when behavior changes.

Never commit API keys or tokens. Use environment variables or a local `.env` (git-ignored).

By contributing you agree that your contributions are licensed under the MIT License.
