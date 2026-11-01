"""Autonomous sandbox authority for STAMP research experiments.

Accepts evaluator output only, classifies outcomes, persists audit decisions.
Never permits modifying production forecasts, trading, repository secrets or CI.
"""
import datetime as dt,json,pathlib
from autonomous_lab import ROOT

def decide(evaluation):
    rows=evaluation.get("results") or []
    decided=[]
    for row in rows:
        skill=row.get("skill_vs_zero")
        n=row.get("test_samples",0)
        if row.get("status")!="sandbox_evaluated":
            state="quarantined";reason="invalid_or_incomplete_evaluation"
        elif n<100:
            state="needs_more_forward_tests";reason="less_than_100_forward_tests"
        elif not isinstance(skill,(int,float)) or skill<0.10:
            state="revise";reason="insufficient_out_of_sample_skill"
        else:
            state="prospective_shadow";reason="passes_research_screen_only"
        decided.append({"id":row.get("id"),"horizon":row.get("horizon"),
          "family":row.get("family"),"decision":state,"reason":reason,
          "evaluation_samples":n,"skill_vs_zero":skill,
          "approved_for_production":False,
          "next_action":("rebuild_experiment" if state in ("quarantined","revise") else
                         "expand_forward_validation" if state=="needs_more_forward_tests" else
                         "collect_independent_prospective_outcomes")})
    return {"created_at_utc":dt.datetime.now(dt.timezone.utc).isoformat(),
      "authority":"sandbox_governor_v1",
      "capabilities":["generate","evaluate","quarantine","revise","shadow_recommend"],
      "forbidden":["live_orders","production_model_override","secret_access","arbitrary_code_execution"],
      "decisions":decided}

def run(root=ROOT):
    d=root/"data"
    evaluated=json.loads((d/"lab_evaluations.json").read_text())
    output=decide(evaluated)
    (d/"lab_decisions.json").write_text(json.dumps(output,indent=2)+"\n")
    return output

if __name__=="__main__":
    result=run()
    print(json.dumps({"sandbox_decisions":len(result["decisions"]),"authority":result["authority"]}))
