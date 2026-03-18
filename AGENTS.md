# Repository Guidelines

## Project Structure & Module Organization
This repository has two execution paths. `worker/index.js` is the Cloudflare Worker entrypoint and should be treated as the primary deployment target. `src/` contains the older Node.js RSS monitor (`index.js`, `monitor.js`, `rss-parser.js`, `feishu-notifier.js`, `storage.js`) used for local runs and fallback workflows. Persistent local state lives in `data/pushed-items.json`. Deployment settings and cron schedules are defined in `wrangler.toml`. Keep secrets in `.env` for local runs and Wrangler secrets for Workers; do not commit real credentials.

## Build, Test, and Development Commands
- `npm start`: run the Node monitor from `src/index.js` in production mode.
- `npm test`: run the Node test mode (`node src/index.js --test`) and send the latest item once.
- `npm run dev`: start the Cloudflare Worker locally with Wrangler.
- `npm run deploy`: deploy `worker/index.js` to Cloudflare Workers.
- `npm run tail`: stream Worker logs from Cloudflare.
Use `curl http://localhost:8787/check` or `/test` when validating Worker endpoints locally.

## Coding Style & Naming Conventions
The codebase uses ES modules and plain JavaScript. Follow the existing style: 2-space indentation, semicolons, single quotes, `camelCase` for functions and variables, and `UPPER_SNAKE_CASE` for top-level constants such as API URLs or keyword lists. Keep modules focused; add helper functions near the workflow they support instead of creating broad utility files.

## Testing Guidelines
There is no formal test framework configured. Validate changes with targeted runtime checks: `npm test` for the Node path and `npm run dev` plus endpoint checks for the Worker path. If you add coverage, place tests beside the module they exercise or in a new `test/` directory and document the command in `package.json`.

## Commit & Pull Request Guidelines
Recent history uses short, imperative commit subjects, for example `Remove .env.bak from repository`. Keep commits scoped to one change. PRs should include a concise description, deployment impact, required env or KV changes, and sample logs or screenshots when notification payloads or HTTP endpoints change.

## Security & Configuration Tips
Never commit populated `.env` files, webhook URLs, or Cloudflare identifiers beyond the placeholders already tracked. When changing schedules or KV bindings, update both `wrangler.toml` and the README so operations stay aligned.
