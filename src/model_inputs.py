"""Point-in-time, exact-mint model inputs. Never backfill a current snapshot into history.

Closed exchange candles may reconstruct historical market features, explicitly
labelled as such. Snapshot features require observed AND available timestamps.
Missing/stale/unverified inputs become zero WITH a separate availability mask,
not a measured zero. Existing raw evidence remains untouched.
"""
import bisect,datetime as dt,hashlib,json,math,pathlib,statistics,re
from market_overview import summarize,CONTRACT
HOUR=3600000
GROUPS={
 'regime':['volatility_24','volatility_ratio','range_pct','close_vs_mean20','volume_ratio','momentum_6h','rsi14'],
 'market':[s+'_'+v for s in ('BTC','ETH','SOL','ZEC') for v in ('return_1h','return_24h','correlation_24h')],
 'ticker':['return_since_closed_reference','change_24h','turnover_log','high_low_range'],
 'orderbook':['spread_bps','imbalance_50bps','imbalance_200bps','bid_depth_log','ask_depth_log'],
 'trades':['taker_buy_fraction','net_flow_ratio','window_minutes'],
 'dex':['liquidity_log','market_cap_log','pool_count_log'],
 'onchain':['supply_log','holders_log','top20_share','verified_recent_burn_log'],
 'news':['verified_events_24h_log','unverified_mentions_24h_log']+['verified_text_'+str(i) for i in range(8)]+['discovery_text_'+str(i) for i in range(8)],
 'project':['verified_repository_events_log'],
 'macro':['BTC_change24','ETH_change24','SOL_change24','ZEC_change24'],
 'derivatives':['open_interest_log','funding_rate'],
 'feedback':['recent_log_mae','recent_baseline_mae','recent_direction_accuracy','verified_outcomes_log','last_outcome_age_hours']}
TTL={'ticker':900,'orderbook':900,'trades':900,'dex':3600,'onchain':21600,'news':21600,'project':86400,'macro':3600,'derivatives':900}
SCHEMA='asof_multi_source_v1'
NAMES=[g+'.'+k+suffix for g,keys in GROUPS.items() for k in keys for suffix in ('','__available')]
def number(v):
 try:
  x=float(v);return x if v is not None and not isinstance(v,bool) and math.isfinite(x) else None
 except (ValueError,TypeError,OverflowError):return None
def ms(s):
 try:
  t=dt.datetime.fromisoformat(str(s).replace('Z','+00:00'));return int(t.timestamp()*1000) if t.tzinfo else None
 except (ValueError,TypeError,OverflowError):return None
def iso(t):return dt.datetime.fromtimestamp(t/1000,dt.timezone.utc).isoformat()
def log(v):
 v=number(v);return math.log1p(v) if v is not None and v>=0 else None
def read_json(path,default):
 try:return json.loads(path.read_text())
 except (OSError,ValueError):return default
def events(path):
 if not path.exists():return
 with path.open() as stream:
  for line in stream:
   try:
    row=json.loads(line)
    if isinstance(row,dict):yield row
   except ValueError:continue

def text_signal(entries):
 """Stateless text hashing; no vocabulary fitted on future headlines or labels."""
 values=[0.]*8;tokens=[t for e in entries for t in re.findall(r'[^\W_]+',str(e.get('title') or e.get('text') or '').lower(),flags=re.UNICODE) if len(t)>2]
 for token in tokens:values[int(hashlib.sha256(token.encode()).hexdigest()[:8],16)%8]+=1
 norm=math.sqrt(sum(v*v for v in values))
 return [v/norm for v in values] if norm else values

def extract(snapshot,available_at):
 """Capture after collection completes; retrieval start never becomes availability."""
 raw=snapshot.get('raw') or {};a=snapshot.get('analysis') or {};rows=[]
 if raw.get('contract')!=CONTRACT:return rows
 def add(group,observed,values,status='measured',reason=None,source=None):
  observed=ms(observed);available=ms(available_at)
  if not observed or not available or observed>available:return
  values={k:number(values.get(k)) for k in GROUPS[group]}
  row=dict(schema=SCHEMA,contract=CONTRACT,group=group,observed_ms=observed,available_ms=available,
    values=values,status=status,reason=reason,source=source)
  row['id']=hashlib.sha256(json.dumps(row,sort_keys=True).encode()).hexdigest();rows.append(row)
 mexc=raw.get('mexc') or {};ticker=mexc.get('ticker') or {};q=ticker.get('data') or {}
 if not isinstance(q,dict) or q.get('symbol')!='STAMPUSDT':q={};ticker=dict(ticker,error='symbol_not_verified')
 price=number(q.get('lastPrice'));hi=number(q.get('highPrice'));lo=number(q.get('lowPrice'))
 add('ticker',ticker.get('retrieved_at_utc'),{'return_since_closed_reference':price,'change_24h':q.get('priceChangePercent'),'turnover_log':log(q.get('quoteVolume')),'high_low_range':(hi-lo)/price if price and hi is not None and lo is not None else None},'unavailable' if ticker.get('error') else 'measured',source='MEXC ticker; raw price normalized against reference at vector construction')
 book=a.get('order_book_features') or {};depth=book.get('depth_200bps') or {}
 add('orderbook',(mexc.get('book') or {}).get('retrieved_at_utc'),{'spread_bps':book.get('spread_bps'),'imbalance_50bps':(book.get('depth_50bps') or {}).get('imbalance'),'imbalance_200bps':depth.get('imbalance'),'bid_depth_log':log(depth.get('bid_notional_usdt')),'ask_depth_log':log(depth.get('ask_notional_usdt'))},'measured' if book.get('status')=='snapshot' else 'unavailable',source='MEXC depth snapshot')
 trade=a.get('recent_executed_trades') or {};buy=number(trade.get('aggressive_buy_notional_usdt'));sell=number(trade.get('aggressive_sell_notional_usdt'));last=number(trade.get('last_trade_ms'));first=number(trade.get('first_trade_ms'))
 add('trades',iso(last) if last else None,{'taker_buy_fraction':trade.get('taker_buy_fraction'),'net_flow_ratio':(buy-sell)/(buy+sell) if buy is not None and sell is not None and buy+sell>0 else None,'window_minutes':(last-first)/60000 if last and first else None},source='MEXC limited executed trade sample')
 dex=raw.get('dex') or {};d=summarize(dex.get('data'),dex.get('retrieved_at_utc'))
 add('dex',dex.get('retrieved_at_utc'),{'liquidity_log':log(d['liquidity_usd']),'market_cap_log':log(d['market_cap_usd']),'pool_count_log':log(d['pools'])},d['status'],source='DexScreener exact mint, pool deduplication')
 chain=a.get('onchain') or {}
 if chain.get('contract')!=CONTRACT:chain={}
 total=number(chain.get('supply_raw'));dec=number(chain.get('decimals'));holders=chain.get('holders') or {};burns=chain.get('burns') or {};top=chain.get('top_wallets') or []
 amounts=[number(b.get('amount_raw')) for b in burns.get('events',[])];burn=sum(v for v in amounts if v is not None) if burns.get('status')=='partial_recent_scan' else None
 add('onchain',chain.get('retrieved_at_utc'),{'supply_log':log(total/10**dec) if total is not None and dec is not None and 0<=dec<=30 else None,'holders_log':log(holders.get('count')) if holders.get('status')=='measured' else None,'top20_share':sum(number(w.get('supply_share')) or 0 for w in top) if top and all(number(w.get('supply_share')) is not None for w in top) else None,'verified_recent_burn_log':log(burn/10**dec) if burn is not None and dec is not None and 0<=dec<=30 else None},chain.get('status','unavailable'),reason='Recent verified burns only; no full burn history is inferred',source='Solana finalized exact mint')
 news=a.get('news') or {};discovery=news.get('discovery') or {};cut=ms(available_at)
 def recent(items,field):return sum(1 for e in items if ms(e.get(field)) is not None and cut-86400000<=ms(e[field])<=cut)
 verified=[e for e in news.get('verified_causal_events',[]) if e.get('verification_status')=='verified' and e.get('contract')==CONTRACT]
 mentions=[e for e in discovery.get('mentions',[]) if e.get('query_contract')==CONTRACT]
 def known_recent(e):
  seen=ms(e.get('first_seen_at_utc'));published=ms(e.get('publication_at_utc'))
  return seen is not None and cut-86400000<=seen<=cut and (published is None or cut-86400000<=published<=cut)
 verified=[e for e in verified if known_recent(e)];mentions=[e for e in mentions if known_recent(e)]
 verified_text=text_signal(verified);discovery_text=text_signal(mentions)
 add('news',news.get('retrieved_at_utc'),{'verified_events_24h_log':log(recent(verified,'first_seen_at_utc')) if news.get('status') in ('partial','measured') else None,'unverified_mentions_24h_log':log(recent(mentions,'first_seen_at_utc')) if discovery.get('status')=='searched' else None,**{'verified_text_'+str(i):v if verified else None for i,v in enumerate(verified_text)},**{'discovery_text_'+str(i):v if discovery.get('status')=='searched' else None for i,v in enumerate(discovery_text)}},'partial' if discovery.get('status')=='searched' else 'unavailable',reason='Verified text and unverified discovery text are separate stateless hashed features; unverified text is search activity, never truth, sentiment or price causality',source='Exact-contract discovery and verified evidence registry')
 project=raw.get('project') or {};verified_repo=news.get('repository_attribution')=='verified_against_contract'
 add('project',project.get('retrieved_at_utc'),{'verified_repository_events_log':log(len(project.get('data') or [])) if verified_repo and not project.get('error') else None},'measured' if verified_repo and not project.get('error') else 'excluded_unverified',reason=None if verified_repo else 'Repository identity not verified against the mint',source='Verified project repository only')
 macro=raw.get('macro') or {};coins={v.get('id'):v for v in macro.get('data') or [] if isinstance(v,dict)}
 valid_coins={c:v for c,v in coins.items() if ms(v.get('last_updated')) is not None and 0<=cut-ms(v['last_updated'])<=3600000}
 provider_times=[ms(v['last_updated']) for v in valid_coins.values()]
 add('macro',iso(min(provider_times)) if provider_times else macro.get('retrieved_at_utc'),{s+'_change24':number((valid_coins.get(c) or {}).get('change_24h'))/100 if number((valid_coins.get(c) or {}).get('change_24h')) is not None else None for s,c in [('BTC','bitcoin'),('ETH','ethereum'),('SOL','solana'),('ZEC','zcash')]},'unavailable' if macro.get('error') else 'measured',source='CoinGecko broad crypto snapshot with provider update times; not Fed macro data')
 deriv=(a.get('market_context') or {}).get('derivatives') or {};verified_deriv=deriv.get('verified_contract')==CONTRACT and deriv.get('status')=='measured'
 add('derivatives',deriv.get('retrieved_at_utc') or available_at,{'open_interest_log':log(deriv.get('open_interest')) if verified_deriv else None,'funding_rate':deriv.get('funding_rate') if verified_deriv else None},'measured' if verified_deriv else 'unavailable',reason=None if verified_deriv else 'No derivative instrument verified against the mint',source='Verified derivative instrument only')
 return rows

def capture(root,now=None):
 data=root/'data';snapshot=read_json(data/'latest.json',{});now=now or dt.datetime.now(dt.timezone.utc);rows=extract(snapshot,now.isoformat())
 path=data/'model_input_events.jsonl';known={r.get('id') for r in events(path)};new=[]
 # The same observed source is not made new by repeatedly collecting the snapshot.
 existing={(r.get('group'),r.get('observed_ms'),json.dumps(r.get('values'),sort_keys=True),r.get('status')) for r in events(path)}
 for r in rows:
  key=(r['group'],r['observed_ms'],json.dumps(r['values'],sort_keys=True),r['status'])
  if r['id'] not in known and key not in existing:new.append(r);existing.add(key)
 data.mkdir(exist_ok=True)
 with path.open('a') as f:
  for r in new:f.write(json.dumps(r,allow_nan=False)+'\n')
 return len(new)

def backfill(root):
 """Import existing observation snapshots using conservative completion bounds.
 Legacy book/trade summaries are known by the last raw retrieval in that same
 sequential monitor call. Missing time evidence is excluded, never guessed.
 """
 path=root/'data/model_input_events.jsonl'
 if (root/'data/model_input_migration.json').exists() or not (root/'data/observations.jsonl').exists():return
 seen={r.get('id') for r in events(path)};count=0
 with path.open('a') as f:
  for obs in events(root/'data/observations.jsonl'):
   stamps=[ms((obs.get(k) or {}).get('retrieved_at_utc')) for k in ('mexc_ticker','dex','project','macro')]
   stamps=[t for t in stamps if t is not None]
   if not stamps or ms(obs.get('at')) is None:continue
   completion=max(stamps)
   # The old monitor made these calls sequentially. A recorded later DEX
   # response bounds book/trades collection; no source timestamp is invented.
   snapshot={'raw':{'contract':CONTRACT,'mexc':{'ticker':obs.get('mexc_ticker') or {},'book':{'retrieved_at_utc':obs.get('at')}},**{k:obs.get(k) or {} for k in ('dex','project','macro')}},'analysis':{'order_book_features':obs.get('order_book_features') or {},'recent_executed_trades':obs.get('recent_executed_trades') or {}}}
   if ms((obs.get('dex') or {}).get('retrieved_at_utc')) is None:snapshot['analysis'].pop('order_book_features',None);snapshot['analysis'].pop('recent_executed_trades',None)
   for row in extract(snapshot,iso(completion)):
    if row['id'] not in seen:row['migration']='conservative sequential observation completion';f.write(json.dumps(row,allow_nan=False)+'\n');seen.add(row['id']);count+=1
 (root/'data/model_input_migration.json').write_text(json.dumps({'schema':SCHEMA,'imported_events':count,'policy':'never backdate current onchain or news snapshots'})+'\n')

class Inputs:
 def __init__(self,root):
  self.root=root;self.by={};self.cache={};self.journal=list(events(root/'data/forecast_journal.jsonl'))
  for r in events(root/'data/model_input_events.jsonl'):
   if r.get('contract')==CONTRACT and r.get('schema')==SCHEMA and r.get('group') in TTL and isinstance(r.get('available_ms'),int) and isinstance(r.get('observed_ms'),int) and r['observed_ms']<=r['available_ms']:self.by.setdefault(r['group'],[]).append(r)
  for g,rs in self.by.items():rs.sort(key=lambda r:r['available_ms'])
  self.times={g:[r['available_ms'] for r in rs] for g,rs in self.by.items()}
  self.context={s:read_json(root/'data/context_candles'/(s+'.json'),[]) for s in ('BTC','ETH','SOL','ZEC')}
 def at(self,group,cut):
  index=bisect.bisect_right(self.times.get(group,[]),cut)-1
  if index<0:return None,'no_point_in_time_observation'
  latest=self.by[group][index]
  for r in reversed(self.by[group][:index+1]):
   if cut-r['observed_ms']>TTL[group]*1000:continue
   if r['status'] in ('measured','partial') and any(number((r.get('values') or {}).get(k)) is not None for k in GROUPS[group]):
    return r,None if r is latest else 'using_prior_valid_observation_within_source_TTL'
  if cut-latest['observed_ms']>TTL[group]*1000:return None,'stale'
  return None,latest.get('reason') or latest['status']
 def values(self,cs,i):
  cut=cs[i]['t']+HOUR;key=(cs[0]['t'],cut)
  if key in self.cache:return self.cache[key]
  w=cs[max(0,i-48):i+1];returns=[math.log(b['c']/a['c']) for a,b in zip(w,w[1:]) if b['t']-a['t']==HOUR]
  last=returns[-24:];prior=returns[-48:-24];v=statistics.pstdev(last) if len(last)>=20 else None;pv=statistics.pstdev(prior) if len(prior)>=20 else None
  c=cs[i]['c'];mean=sum(x['c'] for x in w[-20:])/20;volume=sum(x['v'] for x in w[-21:-1])/20
  gains=sum(max(r,0) for r in last[-14:]);losses=sum(max(-r,0) for r in last[-14:])
  values={'regime':dict(zip(GROUPS['regime'],[v,v/pv if v is not None and pv else None,(cs[i]['h']-cs[i]['l'])/c,c/mean-1,cs[i]['v']/volume if volume else None,sum(last[-6:]),gains/(gains+losses) if gains+losses else .5]))};status={'regime':{'status':'derived_completed_candles','available_features':sum(number(x) is not None for x in values['regime'].values())}}
  market={}
  stamp={b['t']+HOUR:math.log(b['c']/a['c']) for a,b in zip(cs[max(0,i-25):i+1],cs[max(0,i-25)+1:i+1]) if b['t']-a['t']==HOUR}
  for symbol,all_cs in self.context.items():
   valid={b['t']:b for b in all_cs if isinstance(b,dict) and number(b.get('t')) is not None and b['t']+HOUR<=cut and number(b.get('c')) is not None and b['c']>0}
   def ret(hours):
    a=valid.get(cut-(hours+1)*HOUR);b=valid.get(cut-HOUR)
    return math.log(b['c']/a['c']) if a and b and all(cut-k*HOUR in valid for k in range(1,hours+2)) else None
   rs={t+HOUR:math.log(b['c']/valid[t-HOUR]['c']) for t,b in valid.items() if t-HOUR in valid and t+HOUR in stamp};keys=sorted(rs.keys()&stamp.keys())[-24:];corr=None
   if len(keys)>=20:
    xs=[rs[k] for k in keys];ys=[stamp[k] for k in keys];xm=statistics.mean(xs);ym=statistics.mean(ys);den=math.sqrt(sum((x-xm)**2 for x in xs)*sum((y-ym)**2 for y in ys));corr=sum((x-xm)*(y-ym) for x,y in zip(xs,ys))/den if den else None
   market.update({symbol+'_return_1h':ret(1),symbol+'_return_24h':ret(24),symbol+'_correlation_24h':corr})
  values['market']=market;status['market']={'status':'historical_closed_candle_reconstruction','available_features':sum(number(x) is not None for x in market.values()),'policy':'recompute returns/correlations using only exact closed candles at or before reference; no current correlation backfill'}
  for g in TTL:
   r,reason=self.at(g,cut);vals=dict(r['values']) if r else {}
   if g=='ticker' and number(vals.get('return_since_closed_reference')) is not None:vals['return_since_closed_reference']=math.log(vals['return_since_closed_reference']/c) if vals['return_since_closed_reference']>0 else None
   values[g]=vals;status[g]={'status':'used' if r else 'missing','reason':reason,'available_features':sum(number(vals.get(k)) is not None for k in GROUPS[g]),'source':r.get('source') if r else None,'observed_utc':iso(r['observed_ms']) if r else None,'available_utc':iso(r['available_ms']) if r else None}
  feedback,count=self.feedback(cut);values['feedback']=feedback;status['feedback']={'status':'verified_prospective_journal' if count else 'missing','available_features':sum(number(v) is not None for v in feedback.values()),'verified_outcomes':count,'policy':'Only v3 hourly forecasts; outcome evaluation must have been available by the feature time; no reconstructed future feedback'}
  self.cache[key]=(values,status);return values,status
 def vector(self,cs,i,drop=None):
  vals,_=self.values(cs,i);out=[]
  for g,keys in GROUPS.items():
   for k in keys:
    v=number(vals[g].get(k)) if g!=drop else None
    out.extend([max(-1000000,min(1000000,v)) if v is not None else 0.,1. if v is not None else 0.])
  return out
 def feedback(self,cut):
  fs={e.get('id'):e for e in self.journal if e.get('event')=='forecast' and e.get('horizon')=='1h' and str(e.get('model_version','')).startswith('context_walk_forward_v3_')}
  verified={}
  for e in self.journal:
   f=fs.get(e.get('forecast_id'))
   if e.get('event')!='outcome' or not f:continue
   available=ms(e.get('evaluated_at_utc'));due=ms(f.get('due_at_utc'));measured=ms(e.get('measurement_time_utc'));issued=ms(f.get('created_at_utc'));reference=ms(f.get('reference_at_utc'))
   if None in (available,due,measured,issued,reference) or not reference<=issued<due<=cut or not measured<=available<=cut:continue
   offset=abs(measured-due)
   if not (e.get('status')=='evaluated' and offset<=120000 or e.get('status')=='evaluated_historical' and offset==0 and e.get('price_source')=='MEXC_15m_completed_candle'):continue
   base=number(f.get('reference_price'));actual=number(e.get('actual_price'));pred=number(f.get('predicted_log_return'))
   if base is None or actual is None or pred is None or min(base,actual)<=0:continue
   ret=math.log(actual/base);verified[f['id']]=(reference,due,abs(ret-pred),abs(ret),None if ret==0 or pred==0 else (ret>0)==(pred>0))
  independent=[];end=0
  for r in sorted(verified.values()):
   if r[0]>=end:independent.append(r);end=r[1]
  rows=independent[-20:];directions=[r[4] for r in rows if r[4] is not None]
  return ({'recent_log_mae':statistics.mean(r[2] for r in rows),'recent_baseline_mae':statistics.mean(r[3] for r in rows),'recent_direction_accuracy':statistics.mean(directions) if directions else None,'verified_outcomes_log':log(len(rows)),'last_outcome_age_hours':(cut-rows[-1][1])/HOUR} if rows else {}),len(rows)
 def inventory(self,cut):
  result={}
  for group in TTL:
   row,reason=self.at(group,cut);index=bisect.bisect_right(self.times.get(group,[]),cut)-1
   observed=self.by[group][index] if index>=0 else None
   result[group]={'status':'available' if row else 'missing','reason':reason,'source':observed.get('source') if observed else None,'observed_utc':iso(observed['observed_ms']) if observed else None,'available_utc':iso(observed['available_ms']) if observed else None,'nonmissing_features':sum(number((row.get('values') or {}).get(k)) is not None for k in GROUPS[group]) if row else 0}
  return result
 def manifest(self,cs,i):
  _,status=self.values(cs,i);return {'schema':SCHEMA,'reference_utc':iso(cs[i]['t']+HOUR),'features':10+len(NAMES),'groups':status,'policy':'Available timestamps <= closed reference; explicit availability masks; no future or unverified truth backfill'}
