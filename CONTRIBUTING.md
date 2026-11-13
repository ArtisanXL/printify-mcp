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
3. Make sure `npm run typecheck`, `npm run build` and `npm test` pass.
4. Update `README.md` and `CHANGELOG.md` when behavior changes.

## Generated code and the Spec Snapshot

`src/generated/` is derived from `spec/openapi.json` (the Spec Snapshot). Do not edit it by hand.

- After changing the generator or the Spec Snapshot, run `npm run generate` and commit the result. CI regenerates and fails on any diff.
- `npm run refresh-spec` downloads Printify's current spec into `spec/openapi.json`; follow it with `npm run generate`.
- A weekly workflow (`.github/workflows/spec-refresh.yml`, also runnable manually) does both and opens a PR on the `chore/spec-refresh` branch only when something changed. It runs typecheck/build/test itself, because PRs created with the default `GITHUB_TOKEN` do not trigger CI. Maintainers can set a `SPEC_REFRESH_TOKEN` secret (PAT or GitHub App token) so the PR also triggers CI, and must allow Actions to create pull requests in the repo settings if relying on `GITHUB_TOKEN`.

Never commit API keys or tokens. Use environment variables or a local `.env` (git-ignored).

By contributing you agree that your contributions are licensed under the MIT License.
