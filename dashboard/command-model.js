"use strict";
((root)=>{
 const durations={'15m':900000,'1h':3600000,'4h':14400000,'1d':86400000};
 function currencyList(catalog,search=''){
  const q=search.toUpperCase().replace(/\//g,'').trim();
  return [...new Set((catalog?.pairs||[]).filter(p=>typeof p==='string'&&/^[A-Z0-9]{1,22}USDT$/.test(p)))].sort().filter(p=>p.includes(q));
 }
 function projection(market,frame,now=Date.now()){
  const f=market?.research_forecasts?.[frame],step=durations[frame],fetched=Date.parse(market?.retrieved_at_utc),ref=Date.parse(f?.reference_at_utc),due=Date.parse(f?.due_at_utc);
  if(!f||!step||!Number.isFinite(fetched)||now-fetched>120000||fetched>now+5000||!Number.isFinite(ref)||ref>now||due<=now||due-ref!==step||!(Number(f.reference_price)>0)||!(Number(f.predicted_price)>0))return null;
  const closed=(market.candles?.[frame]||[]).filter(b=>b.t+step<=now),returns=[];
  for(let i=1;i<closed.length;i++)if(closed[i].t-closed[i-1].t===step&&closed[i].c>0&&closed[i-1].c>0)returns.push(Math.log(closed[i].c/closed[i-1].c));
  const recent=returns.slice(-20),available=recent.length>=6,calculated=available?f.reference_price*Math.exp(recent.slice(-6).reduce((a,b)=>a+b,0)/6):null;
  return {...f,id:'current:'+market.venue+':'+market.symbol+'|'+frame+'|'+f.reference_at_utc,frame,venue:market.venue,recorded:false,outcome:null,model_version:f.method,validation_at_issue:'current_projection',
   inputs:{available,source:market.venue+' closed spot candles',recent_log_returns:recent,lookback:6},
   calculation:{recomputed_price:calculated,matches_recorded:available&&Math.abs(calculated-f.predicted_price)<=Math.abs(f.predicted_price)*1e-9},review:{status:'projection',reason:'computed_from_current_closed_candles'}};
 }
 function active(engine,market,frame,now=Date.now()){
  const saved=engine?.latest?.[frame],matching=!market||market.venue==='MEXC';
  if(saved&&!saved.outcome&&Date.parse(saved.reference_at_utc)<=now&&Date.parse(saved.due_at_utc)>now&&matching)return {...saved,recorded:true,venue:'MEXC'};
  return projection(market,frame,now);
 }
 function chartRange(bars,record,frame,historical=false){
  const step=durations[frame]/1000,ref=Date.parse(record?.reference_at_utc)/1000,due=Date.parse(record?.due_at_utc)/1000;
  if(!bars.length&&!Number.isFinite(ref))return null;
  const last=bars.at(-1)?.time??ref;
  const from=historical&&Number.isFinite(ref)?ref-step*18:bars[Math.max(0,bars.length-55)]?.time??ref-step*8;
  const to=(historical?due:Math.max(last,Number.isFinite(due)?due:last))+step*4;
  return to>from?{from,to}:null;
 }
 const api={currencyList,projection,active,chartRange};root.StampObservatory=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
