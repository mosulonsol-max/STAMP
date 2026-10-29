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
