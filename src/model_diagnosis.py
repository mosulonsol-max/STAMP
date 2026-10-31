"""Reproducible model autopsy. Diagnostic experiments never promote a model.

Replays the exact production folds, separates selection from a later holdout,
and compares losses/features under fixed causal training boundaries. This is
research on one archive, not independent prospective proof of an improvement.
"""
import datetime as dt,hashlib,json,math,pathlib
import numpy as np
from prediction_engine import evaluate,clean,dataset,factories,HORIZONS,HOUR
from model_governor import journal_metrics,read_events
ROOT=pathlib.Path(__file__).resolve().parents[1]
def metrics(actual,pred):
    if not len(actual):return dict(samples=0)
    a=np.array(actual);p=np.array(pred);errors=np.abs(a-p);baseline=np.abs(a)
    direction=(a!=0)&(p!=0)
    return dict(samples=len(a),mae=float(errors.mean()),baseline_mae=float(baseline.mean()),
        skill_vs_zero=float(1-errors.mean()/baseline.mean()) if baseline.mean()>0 else None,
        signed_bias=float((p-a).mean()),predicted_mean=float(p.mean()),actual_mean=float(a.mean()),
        predicted_median=float(np.median(p)),actual_median=float(np.median(a)),
        direction_accuracy=float(((a[direction]>0)==(p[direction]>0)).mean()) if direction.any() else None,
        beats_zero_fraction=float((errors<baseline).mean()),
        error_larger_than_actual_move_fraction=float((errors>baseline).mean()))
def experiments(cs,report,h):
    from sklearn.ensemble import HistGradientBoostingRegressor,RandomForestRegressor
    rows,_=dataset(cs,HORIZONS[h]);predictions={};actual=[];times=[]
    # Production hyperparameters retained; change one factor per named comparison.
    makers=factories()
    variants={**{k:(v,False,None) for k,v in makers.items()},
        'training_median':(None,False,'median'),'training_mean':(None,False,'mean'),
        'hgb_absolute_loss':(lambda:HistGradientBoostingRegressor(loss='absolute_error',max_iter=60,max_leaf_nodes=7,l2_regularization=10,random_state=42),False,None),
        'rf_absolute_loss':(lambda:RandomForestRegressor(criterion='absolute_error',n_estimators=40,max_depth=5,min_samples_leaf=8,random_state=42,n_jobs=1),False,None),
        'ridge_without_volume':(makers['ridge'],True,None),'rf_without_volume':(makers['random_forest'],True,None)}
    for fold in report['folds']:
        cutoff=fold['test_first_feature_ms'];end=fold['test_last_target_ms']
        train=[r for r in rows if r['feature_ms']<cutoff and r['target_ms']<=cutoff]
        # Recover the actual nonoverlapping test points from production traces.
        keys={(r['feature_ms'],r['target_ms']) for r in report['validation_trace'] if r['model']==report['selected_model'] and cutoff<=r['feature_ms'] and r['target_ms']<=end}
        test=[r for r in rows if (r['feature_ms'],r['target_ms']) in keys]
        x=np.array([r['x'] for r in train]);y=np.array([r['y'] for r in train]);z=np.array([r['x'] for r in test])
        actual.extend(r['y'] for r in test);times.extend(r['feature_ms'] for r in test)
        for name,(factory,no_volume,constant) in variants.items():
            if constant:p=np.repeat(np.median(y) if constant=='median' else np.mean(y),len(test))
            else:
                m=factory();m.fit(np.delete(x,8,axis=1) if no_volume else x,y);p=m.predict(np.delete(z,8,axis=1) if no_volume else z)
            predictions.setdefault(name,[]).extend(map(float,p))
    # Fixed shrinkage controls illustrate whether nonzero forecasts add error.
    for name in makers:
        for weight in (.25,.5):predictions[name+'_shrink_'+str(weight)]=[v*weight for v in predictions[name]]
    n=len(actual);split=n*2//3
    selection={k:metrics(actual[:split],p[:split]) for k,p in predictions.items()}
    chosen=min(makers,key=lambda k:selection[k]['mae']) if split else None
    trace=[r for r in report['validation_trace'] if r['model']==report['selected_model']]
    selected_predictions=[r['predicted_log_return'] for r in trace];selected_actual=[r['actual_log_return'] for r in trace]
    threshold=float(np.quantile(np.abs(selected_actual),.9));large=[i for i,a in enumerate(selected_actual) if abs(a)>=threshold];small=[i for i,a in enumerate(selected_actual) if abs(a)<threshold]
    concentration=sum(abs(selected_actual[i]-selected_predictions[i]) for i in large)/sum(abs(a-p) for a,p in zip(selected_actual,selected_predictions))
    return dict(exploratory_only=True,production_metrics_replay={k:metrics(actual,predictions[k]) for k in makers},
        variants={k:dict(full=metrics(actual,p),later_holdout=metrics(actual[split:],p[split:])) for k,p in predictions.items()},
        later_time_holdout=dict(selection_samples=split,holdout_samples=n-split,selected_on_earlier_only=chosen,
            **metrics(actual[split:],predictions[chosen][split:])) if chosen else None,
        selected_error_by_move_size=dict(top_decile_threshold_log_return=threshold,top_decile_error_share=concentration,
            top_decile=metrics([selected_actual[i] for i in large],[selected_predictions[i] for i in large]),
            other=metrics([selected_actual[i] for i in small],[selected_predictions[i] for i in small])),
        time_coverage=dict(first_feature_ms=min(times),last_feature_ms=max(times)),
        note='Later holdout was not used to select the production candidate in this replay. Variant comparisons remain exploratory; no thresholds or model state are changed.')

def diagnose(root=ROOT,now=None,source_commit=None):
    raw=(root/'data/candles/1h.json').read_bytes();source=json.loads(raw)
    saved=json.loads((root/'data/learning_controller.json').read_text())
    now=now or dt.datetime.fromisoformat(saved['at_utc'].replace('Z','+00:00'))
    if saved.get('engine')=='context_walk_forward_v3':
        from context_diagnosis import diagnose as context_diagnose
        return context_diagnose(root,saved,now,source_commit)
    cs=clean(source,int(now.timestamp()*1000));events=read_events(root/'data/forecast_journal.jsonl')
    if len(cs)<3:return dict(status='insufficient_data',source_commit=source_commit,valid_closed_rows=len(cs))
    findings=[];out={};runtime=None
    for h in HORIZONS:
        r=evaluate(cs,h,now,include_diagnostics=True)
        runtime=r['runtime']
        prior=(saved.get('horizons') or {}).get(h) or {}
        comparison={name:dict(saved_mae=(prior.get('challengers') or {}).get(name,{}).get('mae'),replayed_mae=m['mae']) for name,m in r['challengers'].items()}
        for m in comparison.values():m['matches']=m['saved_mae'] is not None and math.isclose(m['saved_mae'],m['replayed_mae'],rel_tol=1e-8,abs_tol=1e-12)
        row=dict(reproduction=dict(saved_selected_model=prior.get('selected_model'),replayed_selected_model=r['selected_model'],saved_runtime=prior.get('runtime'),metrics=comparison),training_labels=r['samples'],validation_samples=r['validation_samples'],selected_model=r['selected_model'],
            forward_metrics=r['challengers'],asof_candle_close_ms=r.get('asof_candle_close_ms'),
            folds=r['folds'],prospective=journal_metrics(events,(r.get('forecast') or {}).get('model_version'),h,now))
        if r.get('validation_trace'):row['experiments']=experiments(cs,r,h)
        out[h]=row
        if any(not m['matches'] for m in comparison.values()):findings.append(dict(code='saved_metrics_not_fully_reproduced',horizon=h,evidence=comparison,interpretation='Dependency/runtime differences are a plausible cause. Stored reports lack runtime versions, so attribution is not proven.'))
        if r['validation_samples']<100:findings.append(dict(code='insufficient_independent_long_horizon_tests',horizon=h,evidence=r['validation_samples']))
    changes=np.diff([c['t'] for c in cs]);returns=np.diff(np.log([c['c'] for c in cs]))
    last120=returns[-120:];earlier=returns[:-120]
    quality=dict(raw_rows=len(source),valid_closed_rows=len(cs),discarded_or_duplicate_rows=len(source)-len(cs),
        missing_hour_intervals=int(np.sum(changes!=HOUR)),first_open_ms=cs[0]['t'],last_close_ms=cs[-1]['t']+HOUR,
        hourly_move_quantiles={str(q):float(np.quantile(np.abs(returns),q)) for q in (.5,.9,.99)},
        recent120_mean_abs_return=float(np.mean(abs(last120))),earlier_mean_abs_return=float(np.mean(abs(earlier))),
        max_abs_hourly_log_return=float(max(abs(returns))),
        available_history_days=(cs[-1]['t']-cs[0]['t']+HOUR)/HOUR/24)
    findings.extend([dict(code='narrow_input_scope',evidence='All candidates consume only 10 features from STAMP hourly OHLCV; orderbook, DEX liquidity, BTC/ETH, holders and news are collected but not model inputs.'),
        dict(code='training_loss_differs_from_approval_metric',evidence='All three production estimators default to squared error; approval evaluates absolute error.'),
        dict(code='model_selection_reuses_validation',evidence='The best of three is selected on the same forward scores reported for eligibility; prospective approval remains separately gated.'),
        dict(code='retraining_is_not_error_learning',evidence='Each cycle refits matured OHLCV labels. Journal forecast errors are used for approval, not model features, weights or model selection.'),
        dict(code='validation_refit_cadence_differs_from_live',evidence='Three models are fitted once per block; live research refits after every completed hourly candle.')])
    return dict(generated_at_utc=dt.datetime.now(dt.timezone.utc).isoformat(),replay_asof_utc=now.isoformat(),source_commit=source_commit,
        runtime=runtime,candles_sha256=hashlib.sha256(raw).hexdigest(),data_quality=quality,horizons=out,findings=findings,
        limitation='Exploratory diagnosis of a single pair and snapshot. No model is changed or approved; neither repeated backtests nor the later holdout are prospective proof.')
if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser();parser.add_argument('--root',type=pathlib.Path,default=ROOT);parser.add_argument('--source-commit');parser.add_argument('--output',type=pathlib.Path,required=True);args=parser.parse_args()
    report=diagnose(args.root,source_commit=args.source_commit);args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'report':str(args.output),'data_quality':report.get('data_quality',{'status':report.get('status','reported')})}))
