"""Evaluate challengers on chronological and subsequently observed outcomes."""
import math

DEFAULT = {"lookback": 6, "scale": 1.0, "version": "causal_6_return_momentum"}
BASELINE = {"lookback": 6, "scale": 0.0, "version": "no_change"}
CANDIDATES = [
    {"lookback": n, "scale": scale,
     "version": f"{family}_{n}"}
    for n in (3, 6, 12, 20)
    for family, scale in (("momentum", 1.0), ("damped", .5), ("reversal", -.5))
]
MIN_FORWARD = 20


def drift(returns, model):
    n = model["lookback"]
    return model.get("scale", 1.0) * sum(returns[-n:]) / n


def samples(rows):
    for record in rows:
        actual = math.log(float(record["outcome"]["actual_price"]) / float(record["reference_price"]))
        yield record["features"]["recent_returns"], actual


def model_error(rows, model):
    return sum((actual - drift(returns, model)) ** 2
               for returns, actual in samples(rows)) / len(rows)


def observed_errors(rows):
    errors, wrong = [], 0
    for record in rows:
        reference = float(record["reference_price"])
        predicted = math.log(float(record["predicted_price"]) / reference)
        actual = math.log(float(record["outcome"]["actual_price"]) / reference)
        errors.append(predicted - actual)
        wrong += ((predicted > 0) - (predicted < 0)) != ((actual > 0) - (actual < 0))
    return {"samples": len(rows), "signed_log_bias": sum(errors) / len(rows),
            "direction_miss_rate": wrong / len(rows),
            "rmse_log": math.sqrt(sum(error ** 2 for error in errors) / len(rows)),
            "baseline_rmse_log": math.sqrt(model_error(rows, BASELINE))}


def compare(rows, candidate, incumbent):
    error = model_error(rows, candidate)
    current = model_error(rows, incumbent)
    baseline = model_error(rows, BASELINE)
    return {"samples": len(rows), "candidate_mse": error, "incumbent_mse": current,
            "baseline_mse": baseline,
            "passes": error < .95 * current and error < .95 * baseline}


def advance(rows, incumbent, state, now):
    """Keep a candidate fixed until independent, later forecasts are measured."""
    report = observed_errors(rows)
    pending = state.get("pending")
    if incumbent.get("forward_samples"):
        actual_rows = [row for row in rows if row.get("model_version") == incumbent["version"]
                       and row["reference_at_utc"] >= incumbent["selected_at_utc"]][-MIN_FORWARD:]
        if len(actual_rows) == MIN_FORWARD:
            recent = observed_errors(actual_rows)
            if recent["rmse_log"] > 1.05 * recent["baseline_rmse_log"]:
                return {**BASELINE, "selected_at_utc": now, "approved_for": "research_only"}, {
                    **report, "status": "rolled_back_to_baseline",
                    "last_tested_reference": rows[-1]["reference_at_utc"],
                }
    if pending:
        report["error_hypothesis"] = state.get("error_hypothesis", "unconfirmed")
        report["tested_model"] = pending["model"]["version"]
        forward = [row for row in rows if row["reference_at_utc"] >= pending["proposed_at_utc"]]
        if len(forward) < MIN_FORWARD:
            return incumbent, {**report, "status": "shadow_evaluation", "pending": pending,
                               "forward_samples": len(forward)}
        result = compare(forward[:MIN_FORWARD], pending["model"], incumbent)
        if result["passes"]:
            return {**pending["model"], "selected_at_utc": now,
                    "holdout_samples": pending["holdout"]["samples"],
                    "forward_samples": result["samples"], "approved_for": "research_only"}, {
                        **report, "status": "promoted", "forward": result,
                        "last_tested_reference": rows[-1]["reference_at_utc"],
                    }
        return incumbent, {**report, "status": "shadow_rejected", "forward": result,
                           "last_tested_reference": rows[-1]["reference_at_utc"]}
    if state.get("last_tested_reference") == rows[-1]["reference_at_utc"]:
        return incumbent, {**state, **report}
    split = int(len(rows) * .7)
    test = rows[split:]
    # Outcomes used for training must have matured before the first holdout issue.
    cutoff = test[0]["reference_at_utc"]
    train = [row for row in rows[:split] if row.get("due_at_utc", cutoff) <= cutoff]
    if not train:
        return incumbent, {**report, "status": "insufficient_chronological_samples"}
    challenger = min(CANDIDATES, key=lambda model: model_error(train, model))
    result = compare(test, challenger, incumbent)
    report["tested_model"] = challenger["version"]
    report["error_hypothesis"] = {
        "momentum": "mismatched_lookback",
        "damped": "momentum_magnitude_too_high",
        "reversal": "momentum_direction_not_persistent",
    }[challenger["version"].rsplit("_", 1)[0]] if result["passes"] else "no_supported_model_change"
    if not result["passes"]:
        return incumbent, {**report, "status": "retain_incumbent", "holdout": result,
                           "last_tested_reference": rows[-1]["reference_at_utc"]}
    return incumbent, {**report, "status": "shadow_evaluation", "forward_samples": 0,
                       "pending": {"model": challenger, "proposed_at_utc": now, "holdout": result}}


def shared_models(groups):
    """Transfer models only when they beat both baselines on multiple other pairs."""
    from collections import defaultdict

    evidence = defaultdict(dict)
    for (pair, frame), rows in groups.items():
        if len(rows) < 30:
            continue
        recent = sorted(rows, key=lambda row: row["reference_at_utc"])[-30:]
        baseline = model_error(recent, BASELINE)
        reference = min(baseline, model_error(recent, DEFAULT))
        if reference <= 0:
            continue
        evidence[frame][pair] = [
            min(4.0, model_error(recent, model) / reference) for model in CANDIDATES
        ]

    defaults, per_pair = {}, {}
    for frame, donors in evidence.items():
        totals = [sum(scores[i] for scores in donors.values()) for i in range(len(CANDIDATES))]
        wins = [sum(scores[i] < .95 for scores in donors.values()) for i in range(len(CANDIDATES))]

        def select(excluded=None):
            count = len(donors) - int(excluded is not None)
            if count < 5:
                return None
            ratios = [(value - (excluded[i] if excluded is not None else 0)) / count
                      for i, value in enumerate(totals)]
            supported = [i for i, ratio in enumerate(ratios) if ratio < .95
                         and (wins[i] - int(excluded is not None and excluded[i] < .95)) / count >= .65]
            if not supported:
                return None
            index = min(supported, key=ratios.__getitem__)
            return {**CANDIDATES[index], "peer_count": count, "relative_error": ratios[index]}

        if model := select():
            defaults[frame] = model
        for pair, scores in donors.items():
            per_pair[pair+"|"+frame] = select(scores)
    return defaults, per_pair


def transferred_model(data, pair, frame):
    overrides = data.get("peer_model_overrides") or {}
    return overrides.get(pair+"|"+frame, (data.get("peer_models") or {}).get(frame))
