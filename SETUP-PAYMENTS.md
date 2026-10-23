# Finish PayPal sandbox setup

The site promotes community-support donation subscriptions with Reserved held-back-capacity benefits, on one or both servers. All amounts are USD and charged in full each billing period.

| Offer | Monthly | Every 3 months | Every 6 months |
|---|---:|---:|---:|
| Reserved — one server | $4 | $11 | $21 |
| Reserved — both servers | $6 | $16.50 | $31.50 |
 The billing integration is implemented but has **not yet completed a real PayPal sandbox transaction**. No live payment endpoint exists in this release. Server access and Discord role assignment remain disconnected.

## 1. Start your public test address

Double-click **Start Cloudflare Preview.cmd**. It starts a temporary HTTPS tunnel to this computer's port 1026 and prints the address. Keep the window, computer and internet connection running. Anyone with the URL can view the site.

The tunnel client is already downloaded in `.local/` on the original computer. On another checkout, install `cloudflared` from [Cloudflare's official downloads](https://developers.cloudflare.com/tunnel/downloads/) or put the Windows executable at `.local/cloudflared.exe`. The client is not included in GitHub.

These temporary addresses change when the tunnel restarts. They are for testing, not production. For launch, use a stable domain with a named tunnel or move the backend to reliable hosting. Cloudflare Tunnel forwards traffic; it does not keep your website running when this PC is off.

## 2. Enter credentials on your computer

Double-click **Edit Local Settings.cmd**. This opens the ignored `.env` file in Notepad. Do not paste secrets into chat or GitHub.

Use your current public URL for `SITE_URL`, without a trailing slash. Leave `PAYPAL_ENVIRONMENT=sandbox`.

At [PayPal's developer dashboard](https://developer.paypal.com/dashboard/), use **Apps & Credentials → Sandbox**, create a REST app, and copy its **sandbox** Client ID and Secret into `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`. These are test application credentials, not your PayPal password or live credentials. Create/use a separate personal sandbox buyer for test purchases. Business account approval, bank withdrawal and merchant eligibility still need confirming before any live launch.

At the [Discord Developer Portal](https://discord.com/developers/applications), create an application and enter its Client ID and Client Secret into `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET`. Register exactly:

`YOUR_HTTPS_TEST_ADDRESS/auth/discord/callback`

The site requests only Discord identity. This does not install a role bot or grant server access.

The Cloudflare launcher restarts the local site when `.env` or the sandbox configuration file changes. Without that launcher, stop and start the website after edits.

## 3. Create the sandbox plans and webhook

Double-click **Set Up PayPal Sandbox.cmd**. It uses `SITE_URL` from `.env` to create a sandbox product, 6 exact USD plans covering both Reserved offers and 1-, 3- and 6-month billing, and the webhook. If setup fails, it preserves progress so you can retry.

Alternatively: `node setup-paypal.mjs --site-url YOUR_HTTPS_TEST_ADDRESS`.

The helper creates only the 6 current Reserved offer/period plans. The previous two offers were removed; there were no legacy subscription records or saved PayPal plan IDs at removal.

IDs are stored in ignored `.local/paypal-sandbox.json`. Secrets remain in `.env`. The webhook address is:

`YOUR_HTTPS_TEST_ADDRESS/api/paypal/webhook`

Restarting the tunnel changes the URL. Update `SITE_URL`, update Discord's redirect, and run the PayPal setup helper again to update the webhook. Do not use Cloudflare email access controls on the webhook path: PayPal needs to reach it directly.

## 4. Verify the full flow

- Open the HTTPS URL, sign in through Discord and choose a server/plan.
- Acknowledge sandbox recurring billing and approve using the separate PayPal sandbox buyer.
- Returning to the site does not prove payment; the server must verify the subscription with PayPal.
- Check the member area for provider status, covered servers and next renewal. Use **Check PayPal status** to reconcile missed notifications.
- Confirm webhook deliveries in PayPal's developer dashboard. Signature verification requires genuine sandbox events; the webhook simulator is not an end-to-end payment test.
- Cancel through the member area and verify cancellation in PayPal. Check duplicate clicks/events and failed renewals using sandbox tools.
- Refunds and reversals flag the record for review. No reserved slots or Discord roles are automatically granted by this release.

## Before accepting real money

Still required: explicit approval to implement/enable live payments; approved merchant account and withdrawal arrangements; final terms, privacy/refund and cancellation policies; verified reserved-slot capacity/allocation and Steam/game identity linking; Discord bot role syncing; production backups, monitoring and stable hosting. The current code rejects live mode rather than relying on a hidden button.

Back up `.local/accounts.sqlite` and `.local/payments.sqlite` with SQLite's backup tooling or stop the app before copying the database files. Do not commit them. Keep environment secrets separately and restrict who can access the PC.

The existing Sites preview is separate and remains a static presentation. The local Node backend is required for this payment flow; uploading only `dist/` cannot provide accounts, webhook verification or billing management.

References: [PayPal subscriptions](https://developer.paypal.com/api/subscriptions/v1), [webhook verification](https://developer.paypal.com/api/rest/webhooks/rest/), [Cloudflare Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).
