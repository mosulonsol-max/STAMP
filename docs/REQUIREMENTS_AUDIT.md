# STAMP requirements audit — 30 October 2026

The owner requested full operation of the existing dashboard: useful explanations, forecasts even when wrong, charted predictions versus reality, historical validation, and automatic correction/retraining. An experimental output must not be presented as an approved model.

| Requirement | Implementation | Evidence or remaining limit |
| --- | --- | --- |
| Candles beneath live price, more timeframes | Existing nine-period chart retained | Only contiguous completed exchange bars; CSV export |
| Useful market explanation | `evidence_brief.py`, market evidence panel | Facts carry source/time; interpretations are labeled; no invented catalyst |
| 1h/4h/24h/7d predictions | One `prediction_engine.py` path | Experimental points are visible even if approval fails; validation size, MAE and uncertainty shown |
| Honest model approval | Same gates used by research and UI | 100 forward outcomes, >=10% MAE gain, Wilson lower bound >50%; no forced champion |
| Compare predictions with actual prices | Append-only journal, audit cards, comparison chart | Timely ticks and retrospective candle outcomes remain distinct |
| Retraining and error correction | Refit three candidates on newly matured labels every cycle | Model changes/new labels recorded; no claim that a score change proves improvement |
| Prevent future-data leakage | Purged training targets and nonoverlapping validation targets | Regression tests check time boundaries and disconnected data |
| Fresh market display without a GitHub token | Public request-time refresh with bounded parallel fetches | Model/journal timestamps remain unchanged; failed sources retain their error status |
| Persistent collection and execution | Serialized push/schedule/manual monitoring | Code updates run the full pipeline and persist results; scheduled execution is best effort |
| BTC/ETH/SOL/ZEC correlation | Exact hourly log-return timestamp join | No forward fill; sample size and uncertainty; unavailable if provider fails |
| Holders, supply and concentration | Finalized JSON-RPC owner aggregation | Positive-account owners, including pools/custody; API availability varies |
| Burns with transaction proof | Verify successful exact-mint burn instructions | Bounded recent scan; full historical index remains incomplete |
| News by exact contract | Public exact-contract search, persistent first-seen archive, explicit identity/verification status | Authenticated social feed and verified developer attribution remain missing |
| OI/funding | Explicit unavailable status | No derivative instrument verified against the mint; spot volume is not substituted |
| Login/security/password changes | Existing session protection and Vercel settings link retained | Password change requires owner environment update and redeployment; no in-app store |

Source acquisition, forecast generation, persistence, API rendering and deployment health are separate checks. A green build or a successful workflow does not establish that every provider returned usable data or that a forecast is accurate.

Local acceptance includes 61 deterministic/unit/HTTP/runtime checks. The GitHub Chromium workflow additionally verifies login, the actual API, rendering, a mobile viewport, and saves screenshots. Production remains subject to its separate authenticated verification; do not infer it solely from READY.

## Current compact interface acceptance
- The main page has one market summary followed by one interactive candle chart.
- Statistics retain their venue, quote unit and observation times; DEX liquidity is not order-book depth or traded volume.
- Model status is read only from the internal model governor, with a recorded automatic reason and state history.
- The engine automatically demotes a model if its validation or recent prospective performance fails the same evidence policy.
- Predictions use their target timestamp; measured outcomes use their measurement timestamp. Historical approximation is labeled in the expandable audit.
- Existing news/burn coverage limitations above are unchanged; redesign does not claim they are complete.

## Live market delivery and output assurance — 2026-10-30

- The former 90-second browser timer and 90-second combined response cache caused visible lag. The dashboard now connects directly to the official MEXC public binary WebSocket, with aggregated trade updates (100ms channel), rolling 24H mini-ticker updates (provider cadence ~3s), and selected native candle updates (~1s). Decoder schema tags are checked against `mexcdevelop/websocket-proto`.
- The stream is public market data only. CSP permits only the exact MEXC secure WebSocket origin in addition to same-origin HTTP. Subscription validation, symbol isolation, finite OHLC checks, provider timestamps, stale-frame rejection, bounded parsing, reconnect backoff and page lifecycle handling are implemented.
- Independent quote polling targets every 2 seconds when streamed prices are unavailable; in-flight requests do not overlap. Healthy streaming uses occasional REST reconciliation. Full market/liquidity/closed candles refresh every 15 seconds with a 10-second server response cache. These are target cadences, not zero-latency guarantees: upstream publication, network availability, rate limits, background-tab throttling and request duration still apply.
- Forming candles are explicitly labelled and remain separate from completed candle archives and model evaluation. A partial candle is never silently promoted to a definitive close. Newly fetched market data never retimestamps a forecast or model approval.
- Each completed scheduled research cycle now rebuilds the hosted research snapshot; the previous once-per-hour snapshot gate was removed. GitHub scheduling and Vercel deployment remain best effort, not continuous workers. A production deployment becoming ready is not evidence that predictions are profitable.
- Authenticated `/api/assurance` and the dashboard expose per-horizon numeric consistency, causal timestamps, exact horizon, matching model decision, decision freshness, expired targets, independent prospective sample counts, error improvement vs the no-change baseline, directional confidence intervals, and overdue unverified outcomes in the recent journal. Missing/failed/stale evidence cannot become approved merely because the price is live.
- All-pair rollout remains blocked: a single STAMP model cannot establish generalization. Independent per-pair validation and prospective journals, symbol-isolated model/storage state, and multi-pair load/reconnect/rate-limit evidence are still required. This release does not claim that a multi-pair engine or execution profitability has been validated.

## Multi-source research engine V3

The production research entry point now uses `context_prediction.py` and the
point-in-time `model_inputs.py` event archive. It includes market correlations,
regime shifts, order book, executed trades, DEX liquidity, finalized on-chain
measurements, separately labelled verified/discovery text, broad crypto context,
and already-available verified forecast-error feedback. Identity-unverified
project/derivative data is explicitly excluded until verified. Historical data
without defensible availability times is not manufactured. See
`MULTISOURCE_MODEL.md` for the exact source, expiry, selection, validation,
versioning and remaining coverage constraints.
