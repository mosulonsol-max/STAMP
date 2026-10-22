# STAMP Private Intelligence

Private evidence archive for Solana STAMP (`EKtmPPLaCbEEKiwoHHtV7TsRsmPXs5CMGtQtZFSiinsc`).

- `data/STAMP_archive.json` — historical snapshots and forecast conditions.
- `docs/MONITORING_PROTOCOL.md` — verification, comparison, alert and decision rules.
- `.github/workflows/archive-validation.yml` — checks archive JSON on commits (does not fetch market data).

**Automation status (22 October 2026):** GitHub Actions is configured to run the research pipeline on a best-effort five-minute schedule. Successful scheduled runs have been verified. Results are archived in the private repository. Do not commit credentials or private wallet identifiers.

## Private dashboard

- **No-card option:** The scheduled workflow produces `dashboard/private-offline.html` and a GitHub Actions artifact named `stamp-private-dashboard`, viewable only after GitHub repository authentication. Download the latest artifact for an interactive, self-contained research snapshot.
- **Hosted option:** `src/private_dashboard.py` implements a password-protected, read-only dashboard with four timeframe charts, market depth, DEX liquidity, research model results, and health checks. It can poll the private GitHub repository with an optional read-only token.
- **Deployment:** See [Private dashboard setup and security](docs/PRIVATE_DASHBOARD.md). The free Render deployment was blocked by a billing-information requirement; no hosted service is yet live.

## Experimental ML
`src/model.py` implements a 1-hour gradient boosting regression model with a 60-sample forward holdout and zero-return baseline. It emits a conditional experimental range only when data sufficiency and a minimum validation threshold pass; otherwise it explicitly abstains. This is not a continuously retrained online agent, nor a guaranteed calibrated probability model.

## Gaps
Scheduled workflow has been verified running, but exact five-minute execution is not guaranteed. News/social feeds, verified on-chain burns, holder concentration, historical synchronized multi-asset return correlations, continuous ChatGPT synchronization and autonomous trading are not implemented. Github Actions scheduling is best effort, not uninterrupted 24/7 execution.
