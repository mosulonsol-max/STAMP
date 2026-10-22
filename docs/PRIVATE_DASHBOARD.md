# STAMP Private Dashboard — Deployment & Access

The STAMP repository is **private**. The dashboard is read-only, and never places API keys or passwords in the Git repository.

## Working without a paid hosting account

Every successful monitoring run builds `dashboard/private-offline.html` and uploads it as a private GitHub Actions artifact named `stamp-private-dashboard` (retained for 7 days).

To view the latest private report:
1. Sign in to GitHub with an account authorized to access `mosulonsol-max/STAMP`.
2. Open **Actions → STAMP frequent monitoring → latest successful run**.
3. Download the **stamp-private-dashboard** artifact and unzip it.
4. Open `private-offline.html` in your browser.

The file is a fully self-contained snapshot, with interactive timeframe selection, charts, indicators, liquidity, model performance and pipeline health. It is **not a live page**; download a newer artifact to update the data. Treat downloaded copies as confidential.

## Private hosted dashboard

`src/private_dashboard.py` is a Python standard-library HTTP server with HTTPS-compatible HTTP Basic authentication. **Both** `DASHBOARD_USER` and `DASHBOARD_PASSWORD` must be present; otherwise the server refuses to start.

Example hosting configuration:
- Repository: private `mosulonsol-max/STAMP`
- Runtime: Python 3.11+
- Build command: `python -m compileall -q src/private_dashboard.py`
- Start command: `python src/private_dashboard.py`
- Health check: `/healthz` (no market data)
- Environment variables: `DASHBOARD_USER`, `DASHBOARD_PASSWORD` (long random value), optionally `GITHUB_READ_TOKEN`.
- The hosting platform must enforce HTTPS and restrict access to its deployment settings.

Without `GITHUB_READ_TOKEN`, the app serves data bundled into its most recent deployment and clearly labels it `deployment_snapshot`. Automatic redeployment on repository changes may update that snapshot but is not guaranteed to match the monitoring cadence.

With `GITHUB_READ_TOKEN`, the app requests current `data/*` artifacts from the **private** GitHub repository, caches responses for 90 seconds and marks market observations older than 15 minutes as `STALE`. Create a **fine-grained, read-only** GitHub token restricted to this repository and Contents: Read. Store it only in the hosting platform's encrypted environment variables. Do not commit it or paste it into issues or logs.

The frontend uses same-origin requests, so market data is only returned after authentication. Static assets and API endpoints require the same authentication. The health endpoint returns only `ok`.

**Limits:** Basic authentication is not multi-factor identity management; use a long unique password, HTTPS, and rotate credentials if exposed. GitHub Actions scheduling is best-effort. This dashboard is for research and does not place trades.

## Current deployment status

On 22 October 2026, an attempt to create the free Render service was rejected with **HTTP 402: payment information required**. No hosted Render service was created. The repository and private offline report are the working no-card option until hosting is authorized.
