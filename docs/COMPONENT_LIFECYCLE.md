# Autonomous component lifecycle controller

A component moves through discovered -> quarantined -> tested -> shadow -> eligible -> active -> retired. Failed candidates move to rejected. No untested component is allowed to modify production forecasts.

## Automated evaluation
- Discover candidates from an allowlisted declarative feature/model registry.
- Validate schemas, point-in-time provenance, freshness and missingness.
- Run deterministic unit tests, historical forward-only replay, later untouched holdout and prospective shadow forecasts.
- Compare with the incumbent and zero-change baseline on error, uncertainty, directional reliability, resource use and availability.
- Promote only with independent prospective evidence and the existing model-governor gate. Demote on regression, stale data or runtime failures.
- Persist immutable decision records, candidate fingerprints, metrics and rollback target.
- Apply a bounded compute budget, deadlines and a circuit breaker; keep the incumbent if evidence is insufficient.

## Security boundaries
Never execute arbitrary generated code or automatically merge GitHub changes solely because a backtest improves. Candidate expressions are allowlisted and data-only. Infrastructure deployments require separate CI checks, scoped credentials and rollback controls. Credentials, payments and repository permissions must not be created or expanded by the agent.

## Current implementation status
The declarative search and chronological research lab exist on this development branch. The scheduler integration, independent container isolation, durable champion/challenger registry, and automatic GitHub release pipeline are NOT implemented or verified. This document is a release contract, not evidence of production readiness.
