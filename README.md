# STAMP Private Intelligence

Private evidence archive for Solana STAMP (`EKtmPPLaCbEEKiwoHHtV7TsRsmPXs5CMGtQtZFSiinsc`).

- `data/STAMP_archive.json` — historical snapshots and forecast conditions.
- `docs/MONITORING_PROTOCOL.md` — verification, comparison, alert and decision rules.
- `.github/workflows/archive-validation.yml` — checks archive JSON on commits (does not fetch market data).

**Automation status:** The archive is stored on GitHub and can be read/updated during connected ChatGPT sessions. No continuous chat-to-GitHub synchronization or hourly market-data ingestion is configured yet. A scheduled authenticated worker is required for unattended ingestion. Do not commit credentials or private wallet identifiers.

## Experimental ML
`src/model.py` implements a 1-hour gradient boosting regression model with a 60-sample forward holdout and zero-return baseline. It emits a conditional experimental range only when data sufficiency and a minimum validation threshold pass; otherwise it explicitly abstains. This is not a continuously retrained online agent, nor a guaranteed calibrated probability model.

## Gaps
Scheduled workflow not yet verified running. News/social feeds, verified on-chain burns, holder concentration, historical synchronized multi-asset return correlations, continuous ChatGPT synchronization and autonomous trading are not implemented. Github Actions scheduling is best effort, not uninterrupted 24/7 execution.
