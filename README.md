# STAMP Private Intelligence

Private evidence archive for Solana STAMP (`EKtmPPLaCbEEKiwoHHtV7TsRsmPXs5CMGtQtZFSiinsc`).

- `data/STAMP_archive.json` — historical snapshots and forecast conditions.
- `docs/MONITORING_PROTOCOL.md` — verification, comparison, alert and decision rules.
- `.github/workflows/archive-validation.yml` — checks archive JSON on commits (does not fetch market data).

**Automation status:** The archive is stored on GitHub and can be read/updated during connected ChatGPT sessions. No continuous chat-to-GitHub synchronization or hourly market-data ingestion is configured yet. A scheduled authenticated worker is required for unattended ingestion. Do not commit credentials or private wallet identifiers.
