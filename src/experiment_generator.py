"""Generate reproducible, sandbox-only model-change proposals from lab evidence.

Never edits source, commits to GitHub, approves forecasts, or executes trades.
Each proposal is a typed hyperparameter mutation for an existing candidate family.
"""
import argparse
import datetime as dt
import hashlib
import json
import pathlib
from autonomous_lab import evaluate_lab, ROOT

ALLOWED={
 "hist_absolute": {"max_iter":(20,40,60),"max_leaf_nodes":(5,7,11),
                   "l2_regularization":(5,10,20)},
 "forest_absolute":{"n_estimators":(12,16,24),"max_depth":(3,4,5),
                    "min_samples_leaf":(8,12,16)},
 "market_absolute":{"max_iter":(20,40,60),"max_leaf_nodes":(5,7,11)},
 "technical_absolute":{"max_iter":(20,40,60),"max_leaf_nodes":(5,7,11)},
}
DEFAULTS={"hist_absolute":{"max_iter":40,"max_leaf_nodes":7,"l2_regularization":10},
          "forest_absolute":{"n_estimators":16,"max_depth":4,"min_samples_leaf":12},
          "market_absolute":{"max_iter":40,"max_leaf_nodes":7},
          "technical_absolute":{"max_iter":40,"max_leaf_nodes":7}}
def proposals(lab):
    """Deterministic generation; one variable changed per experiment."""
    output=[]
    for decision in lab.get("experiments",[]):
        if decision.get("action") not in ("revise_in_sandbox","continue_sandbox"):
            continue
        family=decision.get("candidate")
        if family not in ALLOWED:continue
        for name,values in ALLOWED[family].items():
            base=DEFAULTS[family][name]
            for value in values:
                if value==base:continue
                params={**DEFAULTS[family],name:value}
                record={"horizon":decision["horizon"],"family":family,
                        "parameters":params,"changed_parameter":name,
                        "baseline_value":base,"candidate_value":value,
                        "status":"proposed_untrained","production_eligible":False,
                        "evaluation_required":["time_purged_walk_forward",
                          "independent_later_holdout","prospective_outcomes",
                          "runtime_and_dataflow_checks"]}
                canonical=json.dumps({k:record[k] for k in ("horizon","family","parameters")},sort_keys=True)
                record["id"]=hashlib.sha256(canonical.encode()).hexdigest()[:16]
                output.append(record)
    return output

def generate(root=ROOT):
    lab=evaluate_lab(root)
    return {"generated_at_utc":dt.datetime.now(dt.timezone.utc).isoformat(),
            "source_lab_state":lab["flow"]["state"],
            "generation":"deterministic_single_parameter_mutations_v1",
            "experiments":proposals(lab),
            "warning":"Proposed only; execution/training and out-of-sample results not yet performed."}

if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--output",type=pathlib.Path,required=True)
    args=p.parse_args()
    out=generate()
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(out,indent=2)+"\n")
    print(json.dumps({"generated":len(out["experiments"]),"flow":out["source_lab_state"]}))
