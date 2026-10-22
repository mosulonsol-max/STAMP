# STAMP monitoring protocol

Contract: `EKtmPPLaCbEEKiwoHHtV7TsRsmPXs5CMGtQtZFSiinsc` (Solana).

1. Read prior archive and previous forecast conditions before new research.
2. Capture source URL, observed timestamp, event timestamp, timezone, instrument, venue, and pool identifier if applicable.
3. Classify as verified new event, historical reference, unverified report, or unavailable data.
4. For MEXC: distinguish reference last price from executable bid/ask; order-book snapshots can vanish and are not filled volume.
5. For DEX: compare only the same pool for liquidity changes; never conflate CEX and DEX volumes.
6. Compute 15m/1h/4h/1d indicators and ATR ranges only from adequate *completed* timestamped candles.
7. Compute BTC/ETH/SOL/ZEC correlations only from synchronized return samples with sample size and uncertainty.
8. Verify whale transactions and burns by on-chain transaction signatures and wallet addresses before attribution.
9. Forecast register: issue time, source observations, horizon, conditions, invalidation, eventual evaluation and reason for any revised recommendation.
10. Alert thresholds: 5%/1h, 10%/4h, confirmed high-volume breakout, >=20% same-pool liquidity shift, verified large exchange transfer/burn, GitHub commit or verified listing; thresholds prompt investigation, not automatic trading decisions.
11. If fresh data is missing, report insufficient evidence and do not fabricate certainty.
12. Portfolio baseline from user-specified monitoring prompt: 9,602,826 tokens at $0.00034885; reconcile conflicting past holdings before definitive portfolio guidance. Never commit private wallet identifiers or secrets.
