# STAMP Private Intelligence

Private evidence archive for Solana STAMP (`EKtmPPLaCbEEKiwoHHtV7TsRsmPXs5CMGtQtZFSiinsc`).

- `data/STAMP_archive.json` — historical snapshots and forecast conditions.
- `docs/MONITORING_PROTOCOL.md` — verification, comparison, alert and decision rules.
- `.github/workflows/archive-validation.yml` — checks archive JSON on commits (does not fetch market data).

**Automation status (22 October 2026):** GitHub Actions is configured to run the research pipeline on a best-effort five-minute schedule. Successful scheduled runs have been verified. Results are archived in the private repository. Do not commit credentials or private wallet identifiers.

## Private dashboard

- **No-card option:** The scheduled workflow produces `dashboard/private-offline.html` and a GitHub Actions artifact named `stamp-private-dashboard`, viewable only after GitHub repository authentication. Download the latest artifact for an interactive, self-contained research snapshot.
- **Hosted dashboard:** [STAMP Private Intelligence on Vercel](https://stamp-one-opal.vercel.app) (Vercel Authentication + application credentials). The read-only dashboard includes four candle timeframes, market depth, DEX liquidity, audited model performance, a separately timestamped public MEXC quote and pipeline health. GitHub Actions bundles a compact private research snapshot into the Python function once per UTC hour, without any GitHub token. **Direct private GitHub polling is NOT enabled until `GITHUB_READ_TOKEN` is added to Vercel Production and a redeploy succeeds.** The token must be fine-grained and restricted to this repository with Contents: Read-only. [Owner setup and live verification](docs/DIRECT_GITHUB_CONNECTION.md).
- **Deployment:** Production builds have reported **READY** on Vercel. See [Vercel deployment status, security and remaining acceptance checks](docs/VERCEL_PRIVATE_DEPLOY.md). Remote authenticated page rendering is still unverified because the connected Vercel session returns 403 for protected URL checks; READY alone is not proof of an operational login.

## Research cycle
`src/prediction_engine.py` is the shared model path for 1h, 4h, 24h and 7d. Every cycle refits Ridge, gradient boosting and random forest on matured, contiguous hourly labels. Forward validation purges training labels that would cross a test boundary and uses nonoverlapping targets within each horizon. Long horizons can have very few validation outcomes; the dashboard shows that limitation numerically.

Experimental predictions remain visible when approval fails. Approval separately requires at least 100 forward outcomes, 10% lower MAE than no change, and a directional Wilson lower bound above 50%. These are research gates, not guarantees or calibrated trading probabilities. The first issued forecast is immutable; later results are joined to it and timely observations remain separate from approximate historical reconstruction.

The authenticated API refreshes public MEXC quotes, candles, depth and indicators independently of a private GitHub token. Market refreshes do **not** change the timestamp, validation or recorded result of archived forecasts. Scheduled runs persist the cumulative archive; private GitHub polling still requires an owner-configured `GITHUB_READ_TOKEN` if immediate access to every newly persisted result is wanted.

## Additional evidence
`src/evidence_sources.py` collects synchronized MEXC BTC/ETH/SOL/ZEC hourly returns, finalized Solana supply, positive-account owner counts and concentration, and a bounded scan for verified burn instructions. Each source has its own timestamp and error status. A supply decrease alone is not burn proof; large accounts can include pools and custody; a recent mint-address scan is not a complete burn history.

## Remaining limits
Five-minute GitHub scheduling is best effort. Exact-contract public news discovery archives first-seen and publication times; search mentions remain unverified. No authenticated social-news feed, complete historical burn index, verified STAMP derivative instrument, continuous ChatGPT synchronization or autonomous trading is connected. Developer-repository attribution remains unverified against the contract. Password changes use the existing Vercel environment-settings link and redeployment; there is no in-app credential store. See [requirements and acceptance evidence](docs/REQUIREMENTS_AUDIT.md).


## Compact chart interface and automatic model authority
The primary page contains STAMP, its MEXC reference quote, 24h change/turnover/high/low, and separately timestamped exact-mint DEX liquidity/market cap. Market cap is unavailable when the provider supplies only FDV. A self-hosted Lightweight Charts 5.0.9 chart supports zoom, pan, crosshair, nine closed-candle periods, and recorded forecast/observed outcome overlays. Approximate outcome measurements retain their actual measurement timestamp.

`src/model_governor.py` is the sole approval authority. It automatically compares each exact model version and horizon's forward validation with matured, nonoverlapping prospective outcomes, writes `data/model_registry.json`, and records promotion/demotion transitions in `data/model_decisions.jsonl`. Exact target-candle closes can count as prospective evidence only when the immutable forecast was issued before that target; approximate reconstructions cannot. The page displays this decision and cannot approve a model. Approval is for statistical forecasting research, without order execution.

### Market streaming and output validity

The private compact dashboard uses MEXC's public protobuf WebSocket for trades,
rolling `24H` ticker statistics and forming candles, with automatic reconnect and
independent quote-poll fallback. Provider publication rates and outages are shown;
zero network latency is not promised. Completed candles, liquidity and market
analytics refresh separately. Model forecasts retain immutable issue/target times.

Open “فحص الإنتاج وصلاحية النتائج والتوسع” for automatic output checks, per-horizon
forward/prospective evidence and the rollout verdict, or use the authenticated
`/api/assurance` endpoint. Operational health and research approval are separate.
STAMP-only evidence cannot approve a rollout to all pairs.

### Why the current models miss

See [the model error diagnosis](docs/MODEL_DIAGNOSIS.md). Run
`python src/model_diagnosis.py --output data/model_diagnosis.json` to replay
causal validation, compare simpler baselines and loss/feature controls, inspect
later-period errors, and reconcile stored scores with the current runtime.
The monitoring workflow records this autopsy after every research cycle.
Diagnostic experiments do not promote or replace a production model.

### V3: point-in-time multi-source model

See [the source-to-model contract](docs/MULTISOURCE_MODEL.md). The autonomous
research path trains robust multi-source challengers, selects on an earlier
period, scores later nonoverlapping targets, and learns from available verified
forecast outcomes. Every external value has an availability mask and timestamp.
The dashboard reports which source groups were available and which profile won.
Unavailable or unverified feeds stay explicit; a connection is not proof of
historical coverage or forecasting skill.
