# GitHub-only monitoring operations
- Data collection uses public REST endpoints in src/monitor.py, with explicit source/error metadata.
- GitHub Actions cron every five minutes is best effort; execution can be delayed, skipped, or suspended.
- GitHub-hosted runners are ephemeral; src/worker.py is for a persistent host and is NOT used by this configuration.
- data/latest.json holds the latest successful job's output; data/observations.jsonl is append-only across successful commits.
- Check Actions tab and data/last_workflow_attempt_utc.txt for recent runs; an attempt timestamp is NOT proof that collection succeeded.
- Missing market feeds, order book gaps, stale candles and missing calibrated model predictions must be surfaced, not fabricated.
- Historical full-depth order-book reconstruction cannot be inferred from periodic snapshots.
- On-chain transfers, news/social ingestion, live WebSockets, long-term correlation calculations, and chat-message mirroring are not yet implemented.
- Never commit tokens or private keys. No automated trading.
