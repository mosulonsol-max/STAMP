# STAMP — Private Vercel Dashboard: deployment and security

Updated: 2026-10-22 UTC.

## Verified

- Vercel project `stamp` exists, connected to the **private** GitHub repository `mosulonsol-max/STAMP`.
- Production domain: https://stamp-one-opal.vercel.app
- Vercel has reported **READY** production deployments for the dashboard.
- Vercel Authentication is enabled for the project's `.vercel.app` domains.
- `DASHBOARD_USER` and `DASHBOARD_PASSWORD` are configured as encrypted Vercel environment variables for production and preview.
- GitHub Actions is running the monitor, tests, model research, forecast audit, and archiving. Successful workflow health records exist.
- The server checks Basic credentials before serving `/`, `/assets/*`, or `/api/dashboard`. Local HTTP integration tests cover anonymous 401 and authenticated API 200.
- A separate **public MEXC 24-hour ticker quote** is fetched at request time, cached for 90 seconds and displayed separately from the research snapshot. The quote is marked unavailable when the source fails, and the browser marks it stale after 3 minutes.
- The technical indicators, model research, liquidity history and archived order-book analysis are from **the GitHub snapshot bundled into the deployment**, not from the fresh MEXC quote. Their timestamps and stale status are shown.

## Remaining verification and access limitations

- **Not independently verified:** remote end-to-end authorized login, authenticated JSON response, or live browser rendering. The Vercel connector's protected URL fetch and runtime log APIs returned HTTP **403** for the project/team. A READY deployment is not proof of an operational authenticated website.
- **Not configured:** `GITHUB_READ_TOKEN`. The backend supports polling the private repository, but no secret can be derived from the existing GitHub connector. Without it, the archived research is only as recent as the last successful deployment. A data-only commit can be ignored to conserve free-tier builds.
- The original dashboard password was shared in chat and should be rotated in Vercel by the owner. Do not copy it into code, documentation, issues or logs.

## Owner action to enable automatic private research polling

1. Open https://github.com/settings/personal-access-tokens and create a **fine-grained** personal access token.
2. Resource owner: `mosulonsol-max`; repository access: **Only select repositories → STAMP**; permissions: **Contents → Read-only**. Use a limited expiry.
3. Open Vercel → `stamp` → **Settings → Environment Variables**. Add `GITHUB_READ_TOKEN` as a sensitive value for **Production** (and Preview if desired). Never paste the token into a chat.
4. Redeploy production to apply the new environment variable.
5. After login, confirm the source reads `Private GitHub · automatic polling`, and that the research observation timestamp advances as GitHub Actions updates. Backend cache duration is 90 seconds; this is not exchange tick streaming.
6. Rotate `DASHBOARD_PASSWORD` to a unique password you generate and save privately. Redeploy once to apply the change.

## Acceptance tests before calling the hosted site fully operational

- [x] Private GitHub repo connected and Vercel build READY.
- [x] Vercel Authentication enabled; encrypted application credentials set.
- [x] Local tests: anonymous UI/API requests return 401; authenticated API request returns 200.
- [x] Public quote and historical research displayed with independent timestamps in code.
- [x] Model forecast scores disclose validation size and promotion eligibility.
- [ ] Remote GET `/`, `/assets/app.js`, `/api/dashboard` verified to reject unauthenticated requests.
- [ ] Remote authenticated page and JSON verified to render with nonempty data.
- [ ] `GITHUB_READ_TOKEN` configured, rotated and tested without leaking it.
- [ ] Original chat-exposed application password rotated.

## Free-tier operation

The Vercel project uses an Ignored Build Step to skip most data-only Git commits, reducing build usage. A deployment snapshot may therefore lag behind the 5-minute GitHub Actions research schedule. The public MEXC quote remains independent and has its own freshness indicator. Avoid exposing private research through public static files or unauthenticated data endpoints.

The server uses HTTP Basic auth behind HTTPS; Vercel Authentication provides a separate protection layer. Basic auth alone does not provide MFA. The `/healthz` endpoint returns only `ok` and does not expose market data.
