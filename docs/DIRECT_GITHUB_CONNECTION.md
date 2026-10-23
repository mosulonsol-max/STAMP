# Direct private GitHub → STAMP Vercel dashboard

## Status and prerequisites

The GitHub repository `mosulonsol-max/STAMP` is **private**. The dashboard already implements a server-side GitHub Contents API reader in `src/private_dashboard.py`, but **a GitHub read token must be configured in Vercel** before live private-repository polling works. GitHub/Vercel Git integration alone deploys code; it does not automatically authorize deployed Python functions to read private GitHub data.

**Never** add a token to GitHub files, JavaScript, URLs, screenshots, public build logs, or this document. The dashboard's browser receives only derived analytics, not credentials.

## One-time owner setup (do not send token in chat)

1. Visit https://github.com/settings/personal-access-tokens/new and create a **fine-grained personal access token**.
2. Set resource owner to the owner of `mosulonsol-max/STAMP`, repository access to **Only select repositories → STAMP**, and repository permission **Contents: Read-only** (Metadata read is implicit). Set an appropriate expiration date. If the owner requires organization approval, approve the token before proceeding.
3. Visit https://vercel.com/ana-9143/stamp/settings/environment-variables and add:
   - Name: `GITHUB_READ_TOKEN`
   - Value: the new token (enter it **directly into Vercel**, not GitHub, chat, or a web form hosted by the dashboard)
   - Environment: **Production**; type **Sensitive** or **Encrypted**, if available
4. Redeploy the latest `main` commit to **Production** so the new environment variable becomes available. Vercel does not inject newly saved variables into existing running deployments.
5. Sign in at https://stamp-one-opal.vercel.app, open Settings → Connection diagnostics. Confirm `Direct GitHub: connected`, with research observation time changing after new scheduled GitHub runs. If `degraded`, inspect the reported failed file names. If `failed_fallback`, the dashboard is serving the older deployment snapshot, **not** current GitHub research.

## Verification semantics

- `connected`: the backend successfully read all required GitHub files for the current cached result.
- `degraded`: it successfully read `latest.json`, but one or more other source files failed.
- `failed` or `failed_fallback`: latest GitHub observation could not be loaded; a deployment snapshot may be shown instead.
- `not_checked`: token configured but no authenticated read has yet been observed.
- `not_configured`: no runtime token; the hourly deployment snapshot remains available.
- HTTP 401: token rejected or expired. HTTP 403: insufficient access/approval/rate limiting. HTTP 404: wrong repo path, repository not authorized, or file missing. The UI exposes status codes but never the token.

The backend caches successful GitHub API results for **90 seconds**. GitHub Actions monitoring is best-effort, not a guaranteed five-minute feed; the observation timestamp and STALE/FRESH indicator must be checked. A separate MEXC quote is fetched from a public API with its own timestamp and is not evidence that GitHub research is current.

The `/api/status` and `/api/diagnostics` endpoints require dashboard authentication. A successful `/healthz` and Vercel `READY` only establish that the app and embedded archive can be served; they do **not** prove the private GitHub API token is valid. Never call the system connected solely because an environment variable is present.

## Revocation and rotation

Revoke or rotate the token in GitHub Settings if it is exposed or expires. Replace `GITHUB_READ_TOKEN` directly in Vercel and redeploy. Read-only Contents access to only this repository is sufficient; never grant write, workflow, administration, or organization-wide permissions for dashboard reading.
