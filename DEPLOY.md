# Deploying Stuck in Line

Production runs on **Cloudflare Workers**: the client is served as static assets and one Durable Object holds the global line
(one instance for everyone, in memory; the line resets only if Cloudflare restarts that object).
The game itself is `src/core.js`. `worker/index.js` is the Cloudflare host; `server.js` is the same game on Node for local development and tests.

## One-off setup
1. In Cloudflare, create an API token from the "Edit Cloudflare Workers" template and note your Account ID.
2. In GitHub (repo Settings, Secrets and variables, Actions) add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
3. Push to `main` (or run the "Deploy to Cloudflare" workflow). It tests, builds `dist/` and deploys with Wrangler.
   Until the domain is switched, the site is live at the `stuckinline.<your-subdomain>.workers.dev` address printed in the workflow log.

## Domain
stuckinline.com and www.stuckinline.com are attached to the Worker through the `routes` block in `wrangler.toml` (switched over from Railway on 6 October 2026).
The old Railway CNAME was removed; the leftover `_railway-verify` TXT record is harmless.

## Commands
    npm start             # Node host on http://localhost:3000
    npm test              # brand check + server tests
    npm run dev:worker    # the Cloudflare build locally (wrangler dev)
    npm run deploy        # build dist/ and deploy by hand (needs the two env vars above)

## Settings
Optional `[vars]` in `wrangler.toml`: TICK_MS (60000), INITIAL_NPCS (200), NPC_FADE_PLAYERS (50), GRACE_MS (30000), MAX_PLAYERS (5000).

## Other hosts
`Dockerfile` still runs the Node host (any container host, including Railway). It must be a single always-on instance.

## Paid skip (Stripe)
A confirmed payment moves the paying player to the front of the line.
1. The home screen button opens the Stripe payment link with `?client_reference_id=<player token>` added in `public/main.js`.
2. In Stripe, Developers, Webhooks, add the endpoint `https://stuckinline.com/stripe-webhook` for the events `checkout.session.completed` and `checkout.session.async_payment_succeeded`.
3. Copy that endpoint's signing secret (starts with `whsec_`) and store it on the Worker: `npx wrangler secret put STRIPE_WEBHOOK_SECRET` (or Cloudflare, Workers, stuckinline, Settings, Variables and Secrets). Never commit it.
4. In the payment link settings, set "After payment" to redirect to `https://stuckinline.com/`.
`worker/index.js` checks the Stripe signature, requires a paid AUD amount of at least A$5 (`SKIP_MIN_CENTS`), then calls `skipToFront` in `src/core.js`. Retried webhooks never skip twice. A payment made while the player is disconnected is applied when that token next joins. The state lives in the Durable Object's memory like the rest of the line.
