# Cloudflare Pages deployment

Website: **https://wardogs-zuid-afrika.pages.dev**

Repository: **https://github.com/satevo/wardogs-zuid-afrika**

The Cloudflare Pages project is connected directly to this GitHub repository. Pushes to `main` trigger a production build and deployment. Local edits appear online after they are committed, pushed and the Cloudflare build succeeds. No deployment token needs to be stored in the repository.

## Project settings

- Project: `wardogs-zuid-afrika`
- Repository: `satevo/wardogs-zuid-afrika`
- Production branch: `main`
- Root directory: repository root (blank)
- Build command: `npm run build:cloudflare`
- Output directory: `dist-cloudflare`
- Preview-branch deployments: disabled
- Configuration: `wrangler.jsonc` and `.cloudflare/project.json`

The build regenerates the browser donation catalog and copies an explicit list of public files. Environment files, local databases, server scripts and tunnel configuration are never included in the output. A 404 page prevents missing private paths from falling back to the homepage.

## What this deployment provides

The public pre-launch homepage, server listings/details, announcements, Discord links and donation offer information run on Cloudflare without requiring this computer or a tunnel to stay online. Stats remain labelled demo data. Donation pricing and the billing-period selector work.

**The Node/SQLite account and payment backend has not been migrated to Cloudflare.** Pages returns explicit unconfigured status for account/billing endpoints and refuses payment writes. Live payments are disabled. Local account databases, sessions and credentials are not uploaded or shared with Pages.

To connect accounts and sandbox billing on this domain, migrate the Node handlers to Pages Functions/Workers and use Cloudflare D1 or another durable backend. Store credentials in Cloudflare secrets, configure the exact Discord callback and PayPal webhook for this domain, provision the 12 sandbox plans, and complete end-to-end verification before opening checkout. The existing local backend and tunnel launcher remain available for development.

## Verify before pushing

Run `npm test` and `npm run build:cloudflare`. After pushing, check the Cloudflare deployment status and visit the permanent site. The build folder is generated and ignored by Git.

The separate earlier ChatGPT Sites preview does not auto-update from this Pages connection.
