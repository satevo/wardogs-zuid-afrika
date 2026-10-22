# Wardogs Zuid Afrika

Pre-launch community website for two South African Wardogs servers. Each supports 100 players, with 50 supporter-reserved slots on Server 01 and 90 on Server 02.

## Launch locally

1. Install Node.js 22 or newer if it is not already installed.
2. Double-click **Start Wardogs.cmd**.
3. The browser opens **http://localhost:1026**. Keep the launcher window open while using the site.

No package installation or build is required. Alternatively, run `npm start` in this folder. Use `npm run serve` to start without opening a browser.

To stop, double-click **Stop Wardogs.cmd**, run `npm stop`, or press Ctrl+C in the launcher window. If already running, the Start launcher opens the existing instance. A different application using port 1026 will be left alone.

The server listens only on this computer. It does not expose the site to the internet or home network, set up a domain, change router/firewall rules or start automatically at Windows login. Stopping it does not affect sites on ports 1024 or 1025.

## Edit the site

- `dist/content.js`: servers, Discord link, announcements, membership prices and demo players.
- `dist/app.js`: pages, copy and interactions.
- `dist/styles.css`: styling and responsive layout.
- `dist/mark.svg`: editable community emblem.

Save changes and refresh the browser. All routes use hashes, such as `http://localhost:1026/#memberships`.

## What is connected

Navigation, server filters, Discord links, FAQs and demo interactions work. Stats and player profiles are fictional. Discord sign-in and member sessions are implemented but require configuration. Staff editing, payments, reserved-slot access and Discord role syncing are not connected. No checkout can charge money.

Memberships are now priced in USD: One Server $3/month; Both Servers $5/month. PayPal USD subscriptions are implemented in sandbox-only mode; sandbox credentials and a real sandbox transaction are still outstanding.

## Files and credentials

Only `dist/` is served to the browser. Local runtime information is stored in ignored `.local/` and removed on normal shutdown. Keep credentials in an ignored environment file or hosting secret store; never put them in `dist/`. No live payment credentials are included.

The `.openai/hosting.json` file belongs to the existing separate Sites preview. It is not required for local hosting, and pushing this repository does not automatically publish or deploy anything. The detailed roadmap is in `LAUNCH-PLAN.txt`.

## Discord sign-in configuration

Copy `.env.example` to `.env`. Create a Discord application, register the exact callback `http://localhost:1026/auth/discord/callback`, and enter its client ID and secret in `.env` locally. Restart the local server. Use the matching HTTPS callback and SITE_URL for public hosting. Never send private keys in chat.

Sessions and member identities are stored in the ignored `.local/accounts.sqlite` database; this persists across restarts. Do not delete it to stop the server. Back it up securely before hosting real accounts. OAuth tokens are not stored.

PayPal is selected for fixed USD subscriptions. Cloudflare test tunnelling is implemented; configure sandbox credentials and complete genuine sandbox renewal/cancellation testing. Live payments remain disabled.

## PayPal sandbox and Cloudflare

Read [SETUP-PAYMENTS.md](SETUP-PAYMENTS.md) for the complete connection steps. The Start Cloudflare Preview launcher provides a temporary HTTPS address and restarts the backend when local settings change. Use Edit Local Settings to enter private credentials on this computer, then Set Up PayPal Sandbox to create the two USD monthly plans and webhook. Temporary tunnel URLs change when restarted; update callbacks and webhooks accordingly.

Billing code verifies plans and webhook signatures, associates subscriptions with the signed-in Discord identity, prevents duplicate checkout clicks and checks ownership for refresh/cancellation. No live endpoint exists. Automated tests use mocked provider responses; a genuine sandbox purchase has not yet been verified.
