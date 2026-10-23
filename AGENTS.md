# Wardogs Zuid Afrika: ongoing project rules

On Satevo's PC the ongoing working folder is C:\Projects\Wardogs Zuid Afrika\App.
Use this folder for new work; old dated chat folders and OneDrive/Hermes/Antigravity copies are historical.
If working in another environment or an explicitly selected worktree, verify it is the intended repository before editing.

GitHub: https://github.com/satevo/wardogs-zuid-afrika

## Saving and synchronization
- Before editing, inspect the repository root, origin, current branch, working tree, and upstream. Preserve unrelated work.
- Use development for ordinary ongoing work. Use another feature branch only when the task calls for it. Do not make routine changes on the production branch.
- When online, fetch origin and compare histories before starting. Fast-forward a clean working branch when appropriate. Review divergence before integrating it; never discard local work or force-push to make histories match.
- Satevo authorizes descriptive commits and pushes to development or an appropriate feature branch after substantial, coherent work is complete and relevant checks pass. No extra confirmation is needed for these development checkpoints unless the user says otherwise. Do not commit unfinished work on a timer.
- Stage only intended files, review the staged diff, and preserve the configured Satevo author identity. Never commit credentials, local databases, browser data, personal user data, dependencies, caches, or generated output unless the repository intentionally tracks an output as editable source.
- Verify the remote branch contains the pushed commit before reporting it synced. If offline or authentication fails, preserve local work and report the unsynced state. Pull/push are explicit operations; no automatic background sync is implied.
- For instruction-only or documentation-only updates, review the text and use git diff --check; application tests are unnecessary unless behavior/configuration also changes.

## Publication
- A development checkpoint is separate from publication. Only publish when the user's request explicitly authorizes publication.
- Do not merge or push to the production branch, run a deployment, change Cloudflare settings, or trigger release announcements merely to save progress.
- Before an authorized publication, inspect the current deployment configuration and review exactly which changes will go live.

## Application
- Node.js 22+ local server and static site. dist contains tracked, editable source for this project; do not treat it as disposable build output.
- Local launcher: C:\Projects\Wardogs Zuid Afrika\Start Wardogs.cmd, serving http://localhost:1026/.
- Do not stop an existing listener just because it occupies the port. Identify it and obtain permission before stopping a server the current task did not start.
- For server/site behavior changes, run npm test. For Cloudflare packaging changes, also run npm run build:cloudflare and review the resulting source diff.
- Keep .env, .local databases/settings, tokens, and payment credentials out of Git. Use .env.example as a template, not as a source of working secrets.
- Do not enable live payments, send payments, or alter production accounts/settings as part of routine local testing.
- Cloudflare Pages production branch: main; root: repository root; build: npm run build:cloudflare; output: dist-cloudflare. These settings were observed on 23 October 2026; verify them before publication.
