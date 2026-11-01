"""Bounded, auditable algorithm evolution. Never executes generated source code.

The search space is declarative: each genome selects an existing estimator,
causal feature profile, and a shrinkage coefficient. All proposals are
deterministic and versioned. Independent prospective approval remains outside.
"""
from dataclasses import dataclass,asdict
from itertools import product
import hashlib,json
import numpy as np

@dataclass(frozen=True)
class Genome:
    estimator: str
    profile: str
    shrinkage: float

ESTIMATORS=("hist_absolute","forest_absolute","market_absolute","technical_absolute","no_change")
PROFILES=("all","market_and_regime","regime")
SHRINKAGES=(0.0,0.25,0.5,0.75,1.0)

def candidates():
    """Bounded variants; no-change is always an available fallback."""
    for estimator,profile,shrinkage in product(ESTIMATORS,PROFILES,SHRINKAGES):
        if estimator=="no_change" and (profile!="all" or shrinkage!=0.0):
            continue
        if estimator!="no_change" and shrinkage==0.0:
            continue
        yield Genome(estimator,profile,shrinkage)

def version(genome):
    return hashlib.sha256(json.dumps(asdict(genome),sort_keys=True).encode()).hexdigest()[:16]

def evaluate_genomes(actual,predictions):
    """Score matured, earlier selection observations only.

    predictions maps estimator names to already causally evaluated forecasts.
    No in-sample fitted predictions or later holdout are accepted as evidence.
    """
    from autonomous_selector import choose_candidate
    y=np.asarray(actual,dtype=float)
    proposals={}
    genomes={}
    for genome in candidates():
        base=predictions.get(genome.estimator)
        if base is None:
            continue
        p=np.asarray(base,dtype=float)
        if p.shape!=y.shape or not np.all(np.isfinite(p)):
            continue
        key=version(genome)
        proposals[key]=(p*genome.shrinkage).tolist()
        genomes[key]=asdict(genome)
    if not proposals:
        raise ValueError("No causally evaluated candidate predictions")
    winner,audit=choose_candidate(y,proposals)
    return {"selected_genome":genomes[winner],"selected_version":winner,
            "selection_audit":audit,"evaluated_genomes":len(proposals),
            "research_only":True,"production_approval":False}
