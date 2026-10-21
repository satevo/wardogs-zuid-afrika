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

Navigation, server filters, Discord links, FAQs and demo interactions work. Stats and player profiles are fictional. Account controls demonstrate future behaviour. Staff editing, payments, reserved-slot access and Discord role syncing are not connected. No checkout can charge money.

Memberships: One Server $3 / roughly R50; Both Servers $5 / R90. One-server coverage and monthly billing are preview assumptions. USD and ZAR are proposed pricing options; final currency and terms must be confirmed before sales.

## Files and credentials

Only `dist/` is served to the browser. Local runtime information is stored in ignored `.local/` and removed on normal shutdown. Keep credentials in an ignored environment file or hosting secret store; never put them in `dist/`. No live payment credentials are included.

The `.openai/hosting.json` file belongs to the existing separate Sites preview. It is not required for local hosting, and pushing this repository does not automatically publish or deploy anything. The detailed roadmap is in `LAUNCH-PLAN.txt`.
