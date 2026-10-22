# Vercel deployment — STAMP private dashboard

## Current state
The Vercel connector is authorized for the user's personal account, but the Vercel account currently reports **zero linked GitHub namespaces**. The account's default team scope is not authorized for the connector. The STAMP repository remains private. A production deployment has not been created.

## One-time action in Vercel (GitHub integration)
1. Open https://vercel.com/new and sign in to the intended personal Vercel account.
2. Under **Import Git Repository**, connect GitHub and grant the Vercel GitHub app access to **only** `mosulonsol-max/STAMP` (or the minimal appropriate repository scope).
3. Select that repository, name the project `stamp-private-intelligence`, and use the repository root as the project root.
4. In the project's **Environment Variables**, set **DASHBOARD_USER** and **DASHBOARD_PASSWORD** as encrypted variables for Production and Preview **before** making the deployment available. Generate a unique strong password in your own password manager. Never add credentials to GitHub source files.
5. The Python function `api/index.py` delegates to `src/private_dashboard.py`. `vercel.json` routes all paths through that authenticated function. Confirm that `/`, `/assets/app.js`, `/assets/style.css`, and `/api/dashboard` all return HTTP 401 without valid credentials.
6. Optionally set `GITHUB_READ_TOKEN` to a fine-grained read-only token for the private STAMP repository (Contents: Read), to refresh archived research without redeploying. This secret is not available from the ChatGPT GitHub connection; create and store it in Vercel directly.
7. Confirm the deployed URL uses HTTPS. Check the displayed source indicator: `private_github_api` means GitHub polling, `deployment_snapshot` means only bundled data from the last deploy.

## Performance and build cost
The GitHub Actions monitoring job may push data updates about every five minutes. **Do not trigger a full Vercel deployment for every data-only commit**, particularly on the free Hobby plan. Set Vercel's Ignored Build Step to skip data-only commits (e.g. `git diff --quiet HEAD^ HEAD -- api src/private_dashboard.py dashboard/private.html dashboard/private.css dashboard/private.js vercel.json`; validate this on your account). Use the optional read-only token to refresh dashboard data at runtime instead.

The repository's root `requirements.txt` contains ML dependencies; monitor Vercel's Python function size and build limits on first deployment. If the Python runtime cannot be packaged within the free limits, move the web-only runtime into a separate minimal deployment root without the ML dependencies.

## Security limitations
HTTP Basic authentication requires HTTPS and a unique strong password; it does not provide MFA or fine-grained access control. The endpoint `/healthz` returns only the literal `ok` without authentication. No credentials are committed. Do not expose the private offline HTML snapshot in a public static folder. If deployment protection is available on the chosen plan, enable it as an additional layer.

## Acceptance checklist
- [ ] GitHub repository connected to Vercel
- [ ] Environment credentials saved privately
- [ ] Deployment READY
- [ ] Anonymous requests to UI, assets and API return 401
- [ ] Authorized login returns the dashboard
- [ ] The data timestamp and stale indicator reflect actual stored research
- [ ] Optional private GitHub token enables 90-second polling
- [ ] Latest GitHub Actions tests are green
