# Deploying Stuck in Line

Production runs on **Cloudflare Workers**: the client is served as static assets and one Durable Object holds the global line
(one instance for everyone, in memory; the line resets only if Cloudflare restarts that object).
The game itself is `src/core.js`. `worker/index.js` is the Cloudflare host; `server.js` is the same game on Node for local development and tests.

## One-off setup
1. In Cloudflare, create an API token from the "Edit Cloudflare Workers" template and note your Account ID.
2. In GitHub (repo Settings, Secrets and variables, Actions) add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
3. Push to `main` (or run the "Deploy to Cloudflare" workflow). It tests, builds `dist/` and deploys with Wrangler.
   Until the domain is switched, the site is live at the `stuckinline.<your-subdomain>.workers.dev` address printed in the workflow log.

## Switching stuckinline.com over
1. In Cloudflare DNS, delete the existing `stuckinline.com` and `www` records that point at Railway.
2. Uncomment the `routes` block at the bottom of `wrangler.toml`, commit and push. Cloudflare creates the records and certificates itself.
3. Once it loads, stop the Railway service.

## Commands
    npm start             # Node host on http://localhost:3000
    npm test              # brand check + server tests
    npm run dev:worker    # the Cloudflare build locally (wrangler dev)
    npm run deploy        # build dist/ and deploy by hand (needs the two env vars above)

## Settings
Optional `[vars]` in `wrangler.toml`: TICK_MS (60000), INITIAL_NPCS (800), NPC_FADE_PLAYERS (50), GRACE_MS (30000), MAX_PLAYERS (5000).

## Other hosts
`Dockerfile` still runs the Node host (any container host, including Railway). It must be a single always-on instance.
