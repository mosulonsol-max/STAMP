"use strict";
((root)=>{
 const durations={'15m':900000,'1h':3600000,'4h':14400000,'1d':86400000};
 function currencyList(catalog,search=''){
  const q=search.toUpperCase().replace(/\//g,'').trim();
  return [...new Set((catalog?.pairs||[]).filter(p=>typeof p==='string'&&/^[A-Z0-9]{1,22}USDT$/.test(p)))].sort().filter(p=>p.includes(q));
 }
 function projection(market,frame,now=Date.now(),model=null){
  const f=market?.research_forecasts?.[frame],step=durations[frame],fetched=Date.parse(market?.retrieved_at_utc),ref=Date.parse(f?.reference_at_utc),due=Date.parse(f?.due_at_utc);
  if(!f||!step||!Number.isFinite(fetched)||now-fetched>120000||fetched>now+5000||!Number.isFinite(ref)||ref>now||due<=now||due-ref!==step||!(Number(f.reference_price)>0)||!(Number(f.predicted_price)>0))return null;
  const closed=(market.candles?.[frame]||[]).filter(b=>b.t+step<=ref),returns=[];
  for(let i=1;i<closed.length;i++)if(closed[i].t-closed[i-1].t===step&&closed[i].c>0&&closed[i-1].c>0)returns.push(Math.log(closed[i].c/closed[i-1].c));
  const recent=returns.slice(-20);
  const neural=model?.version?.startsWith('neural_')&&model.weights;
  const lookbacks=[3,6,20];
  const mean=n=>recent.slice(-n).reduce((a,b)=>a+b,0)/n;
  const inputs=neural?lookbacks.map(n=>Math.tanh(100*mean(n))):[];
  const activation=(row,values)=>row[0]+values.reduce((sum,x,i)=>sum+x*row[i+1],0);
  const neuralDrift=neural?Math.max(-.05,Math.min(.05,activation(neural.output,neural.hidden.map(row=>Math.tanh(activation(row,inputs))))/100)):null;
  const usePeer=Number.isInteger(model?.lookback)&&model.lookback>=3&&model.lookback<=20&&recent.length>=model.lookback&&(neural?Number.isFinite(neuralDrift):Number.isFinite(model.scale));
  const lookback=usePeer?model.lookback:6,scale=usePeer?model.scale:1,available=recent.length>=lookback;
  const calculated=available?f.reference_price*Math.exp((usePeer&&neural?neuralDrift:scale*mean(lookback))):null;
  return {...f,predicted_price:usePeer?calculated:f.predicted_price,id:'current:'+market.venue+':'+market.symbol+'|'+frame+'|'+f.reference_at_utc,frame,venue:market.venue,recorded:false,outcome:null,model_version:usePeer?model.version:f.method,model_origin:usePeer?(model.origin||'peer'):'default',validation_at_issue:'current_projection',
   inputs:{available,source:market.venue+' closed spot candles',recent_log_returns:recent,lookback},
   calculation:{formula:usePeer&&neural?"Reference × exp(neural network output)":usePeer?`Reference × exp(${scale} × mean of last ${lookback} log returns)`:null,recomputed_price:calculated,matches_recorded:available&&(usePeer||Math.abs(calculated-f.predicted_price)<=Math.abs(f.predicted_price)*1e-9)},review:{status:'projection',reason:usePeer?(model.origin==='pair'?'computed_with_pair_model':'computed_with_peer_model'):'computed_from_current_closed_candles'}};
 }
 function active(engine,market,frame,now=Date.now()){
  const saved=engine?.latest?.[frame],matching=!market||market.venue==='MEXC';
  const learned=Date.parse(engine?.archive_updated_at_utc);
  const shared=engine?.symbol===market?.symbol&&learned<=now&&now-learned<600000;
  const model=shared?(market.venue==='MEXC'?engine.learning?.selected_models?.[frame]:null):null;
  const candidate=model?{...model,scale:model.scale??1,origin:'pair'}:shared?engine.learning?.peer_models?.[frame]:null;
  const live=projection(market,frame,now,candidate);
  if(saved&&!saved.outcome&&Date.parse(saved.reference_at_utc)<=now&&Date.parse(saved.due_at_utc)>now&&matching&&
    !(Date.parse(live?.reference_at_utc)>Date.parse(saved.reference_at_utc)))
   return {...saved,recorded:true,venue:'MEXC'};
  return live;
 }
 function pairMood(candles, now=Date.now()){
  const day=durations['1d'];
  const closed=(candles||[]).filter(bar=>Number.isFinite(bar?.t)&&bar.t+day<=now).slice(-29);
  if(closed.length!==29||now-(closed.at(-1).t+day)>=day||
    closed.some((bar,i)=>!Number.isFinite(bar.c)||bar.c<=0||(i>0&&bar.t-closed[i-1].t!==day)))return null;
  const returns=closed.slice(1).map((bar,i)=>Math.log(bar.c)-Math.log(closed[i].c));
  const recent=returns.slice(-14);
  const gains=recent.reduce((sum,r)=>sum+Math.max(0,r),0);
  const losses=recent.reduce((sum,r)=>sum+Math.max(0,-r),0);
  const rsi=gains+losses>0?100*gains/(gains+losses):50;
  const baseline=returns.slice(0,-7);
  const typical=Math.sqrt(7*baseline.reduce((sum,r)=>sum+r*r,0)/baseline.length);
  const momentum=returns.slice(-7).reduce((sum,r)=>sum+r,0);
  const scaled=typical>0?Math.tanh(momentum/typical):Math.sign(momentum);
  return {value:Math.round((rsi+50+50*scaled)/2),closedAt:closed.at(-1).t+day};
 }
 function chartRange(bars,record,frame,historical=false){
  const step=durations[frame]/1000,ref=Date.parse(record?.reference_at_utc)/1000,due=Date.parse(record?.due_at_utc)/1000;
  if(!bars.length&&!Number.isFinite(ref))return null;
  const last=bars.at(-1)?.time??ref;
  const from=historical&&Number.isFinite(ref)?ref-step*18:bars[Math.max(0,bars.length-24)]?.time??ref-step*8;
  const to=(historical?due:Math.max(last,Number.isFinite(due)?due:last))+step*4;
  return to>from?{from,to}:null;
 }
 const api={currencyList,projection,active,pairMood,chartRange};root.StampObservatory=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
