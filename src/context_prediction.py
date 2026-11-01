"""Causal multi-source forecasts with robust loss and separate model selection.

First select a candidate on earlier forward predictions, then score it on a later
nonoverlapping segment. Each test timestamp refits only already-matured labels,
matching live hourly refits. The no-change candidate prevents forced noisy moves.
"""
import datetime as dt,hashlib,json,math,platform,importlib.metadata
import numpy as np
from threadpoolctl import threadpool_limits
from prediction_engine import clean,features,HORIZONS,HOUR
from research_engine import wilson_interval
from model_inputs import NAMES,GROUPS,SCHEMA,Inputs
from autonomous_selector import choose_candidate
VERSION='context_walk_forward_v3'
HIST={'loss':'absolute_error','max_iter':40,'max_leaf_nodes':7,'l2_regularization':10,'random_state':42}
FOREST={'criterion':'absolute_error','n_estimators':16,'max_depth':4,'min_samples_leaf':12,'random_state':42,'n_jobs':1}
SPEC={'hist':HIST,'forest':FOREST,'selection_maximum':160,'maximum_selection_phase':40,'minimum_later_tests_for_approval':100,'profiles':['full','market_and_regime','regime','no_change']}
BASE_NAMES=['return_lag_'+str(j) for j in (0,1,2,3,5,12,23)]+['range','volume_log','return_6h']
class Zero:
 def fit(self,x,y):return self
 def predict(self,x):return np.zeros(len(x))
class Profile:
 def __init__(self,model,groups):
  self.model=model;self.columns=list(range(10))+[10+i for i,name in enumerate(NAMES) if name.split('.')[0] in groups]
 def fit(self,x,y):self.model.fit(x[:,self.columns],y);return self
 def predict(self,x):return self.model.predict(x[:,self.columns])
 @property
 def feature_importances_(self):
  raw=getattr(self.model,'feature_importances_',None)
  if raw is None:return None
  values=np.zeros(10+len(NAMES));values[self.columns]=raw;return values

def factories():
 from sklearn.ensemble import HistGradientBoostingRegressor,RandomForestRegressor
 return {'no_change':Zero,
  'hist_absolute':lambda:HistGradientBoostingRegressor(**HIST),
  'forest_absolute':lambda:RandomForestRegressor(**FOREST),
  'market_absolute':lambda:Profile(HistGradientBoostingRegressor(**HIST),{'regime','market'}),
  'technical_absolute':lambda:Profile(HistGradientBoostingRegressor(**HIST),{'regime'})}
def rows_for(cs,hours,inputs):
 rows=[];skipped=0
 for i in range(25,len(cs)-hours):
  f=features(cs,i)
  if f is None or any(b['t']-a['t']!=HOUR for a,b in zip(cs[i:i+hours+1],cs[i+1:i+hours+1])):skipped+=1;continue
  rows.append(dict(x=f+inputs.vector(cs,i),y=math.log(cs[i+hours]['c']/cs[i]['c']),feature_ms=cs[i]['t']+HOUR,target_ms=cs[i+hours]['t']+HOUR))
 return rows,skipped

def score(actual,pred):
 a=np.array(actual);p=np.array(pred);e=np.abs(a-p);b=np.abs(a);direction=(a!=0)&(p!=0);n=int(direction.sum());correct=int(((a[direction]>0)==(p[direction]>0)).sum());low,high=wilson_interval(correct,n)
 mae=float(e.mean());base=float(b.mean())
 return dict(samples=len(a),mae=mae,baseline_mae=base,skill_vs_zero=1-mae/base if base else None,
  direction_samples=n,direction_accuracy=correct/n if n else None,direction_wilson_95=[low,high],
  empirical_abs_log_error_p90=float(np.quantile(e,.9)),eligible=len(a)>=100 and n>=100 and base>0 and mae<base*.9 and low is not None and low>.5)

@threadpool_limits.wrap(limits=1)
def evaluate(cs,horizon,now,inputs,include_diagnostics=False):
 cs=clean(cs,int(now.timestamp()*1000));hours=HORIZONS[horizon];rows,skipped=rows_for(cs,hours,inputs)
 runtime={'python':platform.python_version(),**{n:importlib.metadata.version(n) for n in ('numpy','scikit-learn','scipy')}}
 signature=hashlib.sha256(json.dumps({'schema':SCHEMA,'names':BASE_NAMES+NAMES,'engine':VERSION,'spec':SPEC,'runtime':runtime},sort_keys=True).encode()).hexdigest()[:12]
 report=dict(at_utc=now.isoformat(),horizon=horizon,engine=VERSION,feature_schema=SCHEMA,feature_signature=signature,runtime=runtime,
  samples=len(rows),skipped_gap_windows=skipped,data_quality='gaps_present' if skipped else 'contiguous_windows',
  status='insufficient_data',selected_model=None,champion=None,forecast=None,challengers={},folds=[],validation_samples=0,
  promotion_gate=dict(min_validation_samples=100,min_mae_improvement_vs_zero=.1,wilson_95_lower_direction_accuracy_gt=.5),
  source_access=inputs.inventory(int(now.timestamp()*1000)),
  policy='Robust absolute-error loss; earlier model selection, later forward scoring; refit at every test point; availability masks; independent prospective approval still required')
 if cs and len(cs)>=26:report['input_manifest']=inputs.manifest(cs,len(cs)-1)
 if len(rows)<120:report['reason']='Need at least 120 matured labels';return report
 selected=[];last=math.inf
 for i in range(len(rows)-1,-1,-1):
  r=rows[i]
  if r['target_ms']>last:continue
  if sum(p['target_ms']<=r['feature_ms'] and p['feature_ms']<r['feature_ms'] for p in rows[:i])<100:break
  selected.append(i);last=r['feature_ms']
  if len(selected)==160:break
 selected.reverse()
 if len(selected)<2:report['reason']='Insufficient chronological selection/test windows';return report
 selection_count=min(40,len(selected)-100) if len(selected)>=120 else max(1,len(selected)//3)
 makers=factories();pred={k:[] for k in makers};actual=[];trace=[]
 for position,index in enumerate(selected):
  row=rows[index];cut=row['feature_ms'];train=[r for r in rows if r['feature_ms']<cut and r['target_ms']<=cut]
  x=np.array([r['x'] for r in train]);y=np.array([r['y'] for r in train]);z=np.array([row['x']]);actual.append(row['y'])
  fold=dict(train_samples=len(train),test_samples=1,train_last_target_ms=max(r['target_ms'] for r in train),test_first_feature_ms=cut,test_last_target_ms=row['target_ms'])
  report['folds'].append(fold)
  for name,factory in makers.items():
   try:
    model=factory();model.fit(x,y);p=float(model.predict(z)[0]);
    if not math.isfinite(p):raise ValueError('nonfinite')
    pred[name].append(p)
    trace.append(dict(model=name,feature_ms=cut,target_ms=row['target_ms'],actual_log_return=row['y'],predicted_log_return=p,phase='selection' if position<selection_count else 'evaluation'))
   except Exception as exc:pred[name].append(None);report.setdefault('errors',{})[name]=type(exc).__name__
 valid={k:v for k,v in pred.items() if all(vv is not None for vv in v)}
 selection={k:score(actual[:selection_count],v[:selection_count]) for k,v in valid.items()}
 chosen,automatic_selection=choose_candidate(actual[:selection_count],{k:v[:selection_count] for k,v in valid.items()});report['automatic_selection']=automatic_selection;report['selection']={'samples':selection_count,'candidates':selection,'selected_model':chosen,'selection_last_target_ms':rows[selected[selection_count-1]]['target_ms'],'evaluation_first_feature_ms':rows[selected[selection_count]]['feature_ms'],'policy':'Candidate chosen before later scores are computed; no choice from later holdout'}
 report['selected_feature_groups']=[] if chosen=='no_change' else ['regime'] if chosen=='technical_absolute' else ['regime','market'] if chosen=='market_absolute' else list(GROUPS)
 report['challengers']={k:score(actual[selection_count:],v[selection_count:]) for k,v in valid.items()}
 selected_score=report['challengers'][chosen];n=len(actual)-selection_count
 report.update(validation_samples=n,selected_model=chosen,champion=chosen if selected_score['eligible'] else None,status='validated_champion' if selected_score['eligible'] else 'no_validated_champion',baseline_mae=selected_score['baseline_mae'],reason='Later forward tests and independent prospective outcomes determine approval; no change is selected automatically when earlier candidates add error')
 report['validation_trace']=trace
 # Keep compact per-group histories so coverage is measurable, not guessed.
 indices=[next(i for i,c in enumerate(cs) if c['t']+HOUR==r['feature_ms']) for r in (rows[j] for j in selected[selection_count:])]
 vectors=[inputs.vector(cs,i) for i in indices]
 report['feature_coverage']={g:dict(evaluation_points=len(indices),points_with_data=sum(any(v[j+1] for j,nm in enumerate(NAMES) if nm.startswith(g+'.') and not nm.endswith('__available')) for v in vectors)) for g in GROUPS}
 latest=features(cs,len(cs)-1);ref=cs[-1]['t']+HOUR;due=ref+hours*HOUR;report['asof_candle_close_ms']=ref
 if latest is None or int(now.timestamp()*1000)-ref>HOUR or due<=int(now.timestamp()*1000):report['inference_status']='stale_or_disconnected_latest_window';return report
 model=makers[chosen]();model.fit(np.array([r['x'] for r in rows]),np.array([r['y'] for r in rows]));p=float(model.predict(np.array([latest+inputs.vector(cs,len(cs)-1)]))[0])
 if not math.isfinite(p) or abs(p)>5:report['inference_status']='invalid_prediction';return report
 reference=cs[-1]['c'];error=selected_score['empirical_abs_log_error_p90']
 report['forecast']=dict(created_at_utc=now.isoformat(),reference_at_utc=dt.datetime.fromtimestamp(ref/1000,dt.timezone.utc).isoformat(),due_at_utc=dt.datetime.fromtimestamp(due/1000,dt.timezone.utc).isoformat(),horizon=horizon,source_candle=str(cs[-1]['t']),reference_price=reference,predicted_log_return=p,predicted_price=reference*math.exp(p),empirical_error_range=[reference*math.exp(max(-10,p-error)),reference*math.exp(min(10,p+error))],range_label='Empirical later-test error band, not calibrated coverage',model_version=VERSION+'_'+signature+'_'+chosen+'_'+horizon,forecast_class='research_unvalidated',approval_passed=False,validation_samples=n,feature_signature=signature,input_reference_utc=report['input_manifest']['reference_utc'])
 report['model_group_importance']=group_importance(model)
 return report

def group_importance(model):
 importance=getattr(model,'feature_importances_',None)
 if importance is None:return {'status':'not_available_for_selected_estimator','policy':'No invented fixed weights or causal explanation'}
 groups={'base_ohlcv':float(sum(importance[:10]))}
 for group in GROUPS:groups[group]=float(sum(importance[10+i] for i,name in enumerate(NAMES) if name.startswith(group+'.')))
 return {'status':'learned_split_importance','groups':groups,'warning':'Training split importance, not causal contribution or out-of-sample benefit'}
