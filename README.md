# Wardogs Zuid Afrika

Public Cloudflare Pages site: **https://wardogs-zuid-afrika.pages.dev**. Linked GitHub repository: **https://github.com/satevo/wardogs-zuid-afrika**. Pushes to `main` deploy automatically. See [DEPLOY-CLOUDFLARE.md](DEPLOY-CLOUDFLARE.md) for the build settings and account/billing migration status.

Pre-launch community website for two South African Wardogs servers. Each supports 100 players, with 50 supporter-reserved slots on Server 01 and 90 on Server 02.

## Launch locally

1. Install Node.js 22 or newer if it is not already installed.
2. Double-click **Start Wardogs.cmd**.
3. The browser opens **http://localhost:1026**. Keep the launcher window open while using the site.

No package installation or build is required. Alternatively, run `npm start` in this folder. Use `npm run serve` to start without opening a browser.

To stop, double-click **Stop Wardogs.cmd**, run `npm stop`, or press Ctrl+C in the launcher window. If already running, the Start launcher opens the existing instance. A different application using port 1026 will be left alone.

The server listens only on this computer. It does not expose the site to the internet or home network, set up a domain, change router/firewall rules or start automatically at Windows login. Stopping it does not affect sites on ports 1024 or 1025.

## Edit the site

- `dist/content.js`: servers, Discord link, announcements and demo players.
- `dist/offers.json`: reserved-slot donation offers, prices and billing periods.
- `dist/app.js`: pages, copy and interactions.
- `dist/styles.css`: styling and responsive layout.
- `dist/mark.svg`: editable community emblem.

Save changes and refresh the browser. All routes use hashes, such as `http://localhost:1026/#memberships`.

## What is connected

Navigation, server filters, Discord links, FAQs and demo interactions work. Stats and player profiles are fictional. Discord sign-in and member sessions are implemented but require configuration. Staff editing, payments, reserved-slot access and Discord role syncing are not connected. No checkout can charge money.

Community-support donation subscriptions are priced in USD, with Reserved held-back capacity on one or both servers. Each renews every 1, 3 or 6 months at the full displayed period amount.

| Offer | Monthly | Every 3 months | Every 6 months |
|---|---:|---:|---:|
| Reserved — one server | $4 | $11 | $21 |
| Reserved — both servers | $6 | $16.50 | $31.50 |
 PayPal USD subscriptions are implemented in sandbox-only mode; sandbox credentials and a real sandbox transaction are still outstanding.

## Files and credentials

Only `dist/` is served to the browser. Local runtime information is stored in ignored `.local/` and removed on normal shutdown. Keep credentials in an ignored environment file or hosting secret store; never put them in `dist/`. No live payment credentials are included.

The `.openai/hosting.json` file belongs to the existing separate Sites preview. It is not required for local hosting, and pushing to development saves a checkpoint; pushing to main automatically publishes to Cloudflare Pages. The detailed roadmap is in `LAUNCH-PLAN.txt`.

## Discord sign-in configuration

Copy `.env.example` to `.env`. Create a Discord application, register the exact callback `http://localhost:1026/auth/discord/callback`, and enter its client ID and secret in `.env` locally. Restart the local server. Use the matching HTTPS callback and SITE_URL for public hosting. Never send private keys in chat.

Sessions and member identities are stored in the ignored `.local/accounts.sqlite` database; this persists across restarts. Do not delete it to stop the server. Back it up securely before hosting real accounts. OAuth tokens are not stored.

PayPal is selected for fixed USD subscriptions. Cloudflare test tunnelling is implemented; configure sandbox credentials and complete genuine sandbox renewal/cancellation testing. Live payments remain disabled.

## PayPal sandbox and Cloudflare

Read [SETUP-PAYMENTS.md](SETUP-PAYMENTS.md) for the complete connection steps. The Start Cloudflare Preview launcher provides a temporary HTTPS address and restarts the backend when local settings change. Use Edit Local Settings to enter private credentials on this computer, then Set Up PayPal Sandbox to create all 6 USD offer/period plans and webhook. Temporary tunnel URLs change when restarted; update callbacks and webhooks accordingly.

Billing code verifies plans and webhook signatures, associates subscriptions with the signed-in Discord identity, prevents duplicate checkout clicks and checks ownership for refresh/cancellation. No live endpoint exists. Automated tests use mocked provider responses; a genuine sandbox purchase has not yet been verified.

Offer source: `dist/offers.json`. Run `npm run sync:offers` after editing it to regenerate browser data. Backend plan validation reads that same source. Only the two Reserved donation offers and their 6 billing combinations are supported. The previous two offers were removed. Benefits and automatic role/game access remain unconnected.

## Prepare for 1-grid / Plesk hosting

The hosted entry point is `app.cjs`. It serves the tracked `dist/` assets and connects the existing account and PayPal sandbox services. The Windows local launcher still uses `local-server.mjs` on port 1026. These are separate startup modes.

Plesk settings after a hosting release has been approved:

| Setting | Value |
| --- | --- |
| Node.js | Latest patched 22.x, at least 22.13.0; or supported newer LTS after testing |
| Application mode | Production |
| Application root | The deployed repository folder containing app.cjs and package.json |
| Document root | The dist folder inside that application root |
| Startup file | app.cjs |
| Build step | npm run sync:offers (no external dependencies to install) |

Do not set the document root to the repository root. Server files, Git metadata, environment files and databases must stay outside the public document root. The hosted server also refuses private paths and local control endpoints. Plesk may serve static files directly, so setting its document root correctly is essential.

In Node.js custom environment variables, set `SITE_URL=https://www.wardogssa.co.za`, `PAYPAL_ENVIRONMENT=sandbox` and `WARDOGS_DATA_DIR` to an absolute private directory outside both dist and the Git deployment folder. Use the actual account path from 1-grid, not a sample path. Keep this directory persistent across deployments; it contains accounts.sqlite, payments.sqlite and optionally paypal-sandbox.json. If omitted, storage defaults to the ignored .local directory in the application folder; confirm that deployments preserve it before using it. Back up the private data securely and test restoration. Run one application instance with this SQLite database; multiple hosts require a shared database design.

The hosting platform manages the listener through Passenger / PORT; do not configure it to use the local PC's port 1026. Do not add a public runtime or stop endpoint. The hosted entry does not load a local .env file: configure secrets in the hosting panel. No configured sign-in or payment credentials are required to display the site.

Connect GitHub using a read-only deployment key if Plesk offers it. Keep automatic deployments off during setup. The hosting files are prepared on development; do not point the live domain at that branch for testing. Verify the intended release commit and hosting settings before any production deployment. A temporary test domain must have its own HTTPS certificate and matching SITE_URL and Discord callback; do not treat a Plesk preview URL as working OAuth without checking it.

After installing the approved release, enable Node.js, restart the app and check /api/health and /api/session through the hosting preview or a local hosts-file override. Verify that /.env, /.git/config, /.local/accounts.sqlite and /__local/stop are inaccessible. Verify the two Reserved offers on all three billing periods. Check restart persistence, sign-in, logout and secure cookies. When testing the www origin against 1-grid before DNS cutover, use its certificate and preserve the www Host header; a mismatched preview hostname is deliberately rejected.

For sandbox setup, enter Discord application credentials and register exactly https://www.wardogssa.co.za/auth/discord/callback (or the matching temporary test origin). Enter PayPal sandbox credentials only. The setup helper supports WARDOGS_DATA_DIR so plan IDs can be saved in the same persistent private folder. Run it through the hosting terminal with the same environment variables, then restart the app. It creates/updates sandbox products, six plans and the webhook: this is an explicit provider action, not part of ordinary application startup. Complete real sandbox purchase, webhook, cancellation and renewal checks before proposing live payments. Reserved-slot and Discord role syncing are still unconnected.

Only after the hosted release passes checks and cutover is authorized should www DNS change from Cloudflare Pages to the destination specified by 1-grid. Keep Cloudflare as a rollback option during the migration. Do not remove mail records or nameservers to move only the website. Setting up non-www redirects and HTTPS is a separate hosting setting to verify, not something this app changes automatically.

References: [1-grid Node.js setup](https://1grid.co.za/knowledge/plesk-setting-up-support-for-nodejs-applications/), [Plesk application settings](https://docs.plesk.com/en-US/obsidian/administrator-guide/website-management/hosting-nodejs-applications.76652/), [Node.js 22 SQLite runtime requirements](https://nodejs.org/download/release/v22.13.0/docs/api/cli.html).
