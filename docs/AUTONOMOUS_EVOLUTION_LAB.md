# Autonomous evolution research laboratory

This branch adds three research components:
- `autonomous_selector.py`: drift-aware, deterministic selection using the earlier chronological selection phase.
- `algorithm_evolution.py`: bounded estimator/shrinkage genomes, scored using previously generated causal predictions.
- `evolution_lab.py`: declarative numeric expression search over existing point-in-time inputs, without arbitrary generated Python execution.

## Security and isolation
The expression evaluator only interprets an allowlisted tree with bounded depth and nodes. It cannot run arbitrary code, import modules, access the network, change repository files, or spend money. This is **language-level isolation**, NOT an operating-system/container sandbox, nor protection from resource exhaustion if deployed without process-level quotas. All research functions have explicit candidate limits.

## Validation and deployment
Run `python -m unittest discover -s tests -p 'test_*evolution*.py'` and `python -m unittest discover -s tests -p 'test_autonomous_selector.py'`, followed by the existing repository's full test and browser suites. Verify temporal availability, forward refit costs, and external feed quality. The research lab is not yet wired into the scheduled runner, has not been independently validated on production data, and has no automatic promotion privileges.

Any proposed genome must undergo a separate untouched holdout, prospective journal validation, and model-governor decision. Research search metrics must not be presented as approved forecasting performance. Candidate generation is bounded rather than arbitrary self-modifying code.

## Remaining implementation
- Convert existing point-in-time Inputs.values outputs into matured chronological lab rows with source timestamps and missingness masks.
- Add adaptive source/indicator discovery with explicit provenance and independent prospective tests.
- Run research in a constrained worker/container with CPU/memory/time budgets, audit logs, and kill/restart controls.
- Add a persistent immutable genome registry, challenger/champion promotion and rollback only through governor checks.
- Add CI with full tests, model-data replay, and authenticated browser validation before merging to main.
