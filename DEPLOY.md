# Deploying Stuck in Line

One Node process serves the site and the WebSocket on the same origin, so there is a single deployment.
It must run as **one always-on instance** (the line is held in memory).

## Fly.io (recommended; Sydney region, close to Perth)
    fly auth login
    fly launch --copy-config --no-deploy   # accept fly.toml; keep the app name or change it
    fly deploy
    fly scale count 1
    fly certs add stuckinline.com
    fly certs add www.stuckinline.com

## Cloudflare DNS (stuckinline.com)
Fly prints the target for each cert. Add in Cloudflare DNS:
- `A`/`AAAA` for `stuckinline.com` -> Fly IPs (`fly ips list`), or `CNAME` -> `stuckinline.fly.dev`
- `CNAME www` -> `stuckinline.fly.dev`
Set the records to **DNS only (grey cloud)** until the Fly certificate issues; the orange proxy also works afterwards with SSL mode "Full" (WebSockets are supported).

## Env vars (`fly secrets set` / `[env]`)
TICK_MS (60000), INITIAL_NPCS (800), NPC_FADE_PLAYERS (50), GRACE_MS (30000), MAX_PLAYERS (5000).
