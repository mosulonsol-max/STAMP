"""Saved v3 forward error replay and controlled feature-group ablations.

Ablations refit on three chronological blocks to bound cost, and are explicitly
not the per-point production score or a gate for selecting on the same holdout.
"""
import datetime as dt,json,hashlib
import numpy as np
from threadpoolctl import threadpool_limits
from prediction_engine import clean,HORIZONS
from model_inputs import Inputs,GROUPS,NAMES
from context_prediction import rows_for,factories,score,VERSION
from model_governor import journal_metrics,read_events

@threadpool_limits.wrap(limits=1)
def diagnose(root,saved,now,source_commit):
 raw=(root/'data/candles/1h.json').read_bytes();cs=clean(json.loads(raw),int(now.timestamp()*1000));inputs=Inputs(root);events=read_events(root/'data/forecast_journal.jsonl');result={}
 for h,r in saved['horizons'].items():
  trace=[x for x in r.get('validation_trace',[]) if x.get('phase')=='evaluation' and x['model']==r['selected_model']]
  actual=[x['actual_log_return'] for x in trace];pred=[x['predicted_log_return'] for x in trace]
  reproduced=score(actual,pred) if actual else None
  row={'engine':r.get('engine'),'selected_model':r['selected_model'],'selection':r.get('selection'),
    'saved_metrics':r.get('challengers',{}).get(r['selected_model']),'reproduced_metrics':reproduced,
    'input_manifest':r.get('input_manifest'),'source_access':r.get('source_access'),'source_access_checked_at_utc':r.get('last_reassessment_at_utc'),'feature_coverage':r.get('feature_coverage'),
    'learned_group_importance':r.get('model_group_importance'),
    'prospective':journal_metrics(events,(r.get('forecast') or {}).get('model_version'),h,now)}
  if reproduced and len(trace)>=20:
   rows,_=rows_for(cs,HORIZONS[h],inputs);by={(x['feature_ms'],x['target_ms']):x for x in rows};test=[by[(t['feature_ms'],t['target_ms'])] for t in trace if (t['feature_ms'],t['target_ms']) in by]
   # Fixed model family, full vs group deletion, same 3 purged blocks.
   family=r['selected_model'] if r['selected_model']!='no_change' else 'forest_absolute';variants={};values=[]
   profiles=['full','base_only']+list(GROUPS)
   for profile in profiles:
    prediction=[];actual=[]
    keep=[j for j,n in enumerate(NAMES) if profile=='base_only' or n.startswith(profile+'.')]
    for block in [list(x) for x in np.array_split(np.array(test,dtype=object),min(3,len(test))) if len(x)]:
     cutoff=block[0]['feature_ms'];train=[x for x in rows if x['feature_ms']<cutoff and x['target_ms']<=cutoff];x=np.array([x['x'] for x in train]);z=np.array([x['x'] for x in block]);y=np.array([x['y'] for x in train])
     if profile!='full':x[:,[10+i for i in keep]]=0;z[:,[10+i for i in keep]]=0
     model=factories()[family]();model.fit(x,y);prediction.extend(map(float,model.predict(z)));actual.extend(t['y'] for t in block)
    variants[profile]=score(actual,prediction)
   full=variants['full']['mae']
   row['group_ablation']={'model_family':family,'refit_blocks':3,'metrics':variants,'group_deletion_relative_error':{g:variants[g]['mae']/full-1 if full else None for g in GROUPS},'interpretation':'Positive deletion error suggests useful group in this diagnostic window; negative suggests harm. Exploratory only, not causal evidence or candidate selection. Coverage must be checked before interpreting absent groups.'}
  result[h]=row
 return {'generated_at_utc':dt.datetime.now(dt.timezone.utc).isoformat(),'replay_asof_utc':now.isoformat(),'source_commit':source_commit,'engine':VERSION,'runtime':saved.get('runtime'),'data_quality':{'valid_closed_rows':len(cs),'missing_hour_intervals':sum(b['t']-a['t']!=3600000 for a,b in zip(cs,cs[1:]))},'candles_sha256':hashlib.sha256(raw).hexdigest(),'horizons':result,'policy':'Reconcile stored per-point evaluation trace; measure group deletions on separate coarse replay; preserve automatic prospective gates and model identity'}
