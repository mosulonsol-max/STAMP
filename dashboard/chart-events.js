"use strict";
(() => {
 const kinds={
  buy:{label:["صفقة شراء كبيرة","Large buy execution"],color:"#5ad9a4",position:"belowBar",shape:"arrowUp"},
  sell:{label:["صفقة بيع كبيرة","Large sell execution"],color:"#ff909d",position:"aboveBar",shape:"arrowDown"},
  liquidity_add:{label:["إضافة سيولة","Liquidity deposit"],color:"#8cc8fb",position:"belowBar",shape:"square"},
  liquidity_remove:{label:["سحب سيولة","Liquidity withdrawal"],color:"#f1c781",position:"aboveBar",shape:"square"},
  burn:{label:["حرق توكنات","Token burn"],color:"#c4a7ff",position:"aboveBar",shape:"circle"}
 };
 const sources={
  workflow:["دورة الرصد الخلفية","Background monitoring"],
  worker:["محرك الأزواج المستقل","Autonomous pair engine"],
  mexc_ticker:["MEXC · السعر","MEXC · ticker"],
  mexc_candles:["MEXC · شموع 15 دقيقة","MEXC · 15m candles"],
  mexc_orderbook:["MEXC · دفتر الأوامر","MEXC · order book"],
  mexc_trades:["MEXC · الصفقات المنفذة","MEXC · executed trades"],
  dexscreener:["DexScreener · مجمّعات ستامب","DexScreener · STAMP pools"],
  pumpswap:["Solana · معاملات PumpSwap","Solana · PumpSwap transactions"]
 };
 const statuses={
  ok:["متاح","Available"],empty:["متاح · العينة فارغة","Available · empty sample"],
  partial:["تغطية جزئية","Partial coverage"],degraded:["يحتاج مراجعة","Degraded"],
  unavailable:["غير متاح","Unavailable"],unchecked:["بانتظار الفحص","Not yet checked"]
 };
 const kind=event=>event.kind==="trade"?event.side:event.kind;
 const el=id=>document.getElementById(id);
 const time=value=>Number.isFinite(value)?new Date(value).toISOString():null;
 const iso=value=>time(value)||"";
 const esc=value=>String(value??"—").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

 function align(records,bars,pair,duration){
  const aligned=[];
  for(const event of records){
   if(event?.symbol!==pair||!Number.isFinite(event.time_ms)||!Object.hasOwn(kinds,kind(event)))continue;
   let from=0,to=bars.length;
   while(from<to){
    const mid=(from+to)>>>1;
    if(bars[mid].t<=event.time_ms)from=mid+1;
    else to=mid;
   }
   const bar=bars[from-1];
   if(bar&&event.time_ms<bar.t+duration)aligned.push({event,bar});
  }
  return aligned;
 }

 function markers(aligned){
  const grouped=new Map();
  for(const {event,bar} of aligned){
   const type=kind(event),key=bar.t+"|"+type,style=kinds[type];
   const group=grouped.get(key)||{time:bar.t/1000,position:style.position,color:style.color,shape:style.shape,count:0};
   group.count++;
   grouped.set(key,group);
  }
  return [...grouped.values()].sort((a,b)=>a.time-b.time)
   .map(({count,...marker})=>count===1?marker:{...marker,text:String(count)});
 }

 function sourceLink(event){
  if(event.kind==="trade"&&/^[A-Z0-9]{1,22}USDT$/.test(event.symbol)){
   return "https://www.mexc.com/exchange/"+event.symbol.replace(/USDT$/,"_USDT");
  }
  if(/^[1-9A-HJ-NP-Za-km-z]{85,88}$/.test(event.signature||"")){
   return "https://solscan.io/tx/"+event.signature;
  }
  return "";
 }

 function tradeCoverage(sample,copy,stamp){
  if(sample?.status==="empty")return copy("MEXC · العينة المستلمة بلا صفقات","MEXC · returned sample has no trades");
  if(sample?.status!=="ok")return "";
  return "MEXC · "+copy("أكبر","Largest")+" "+sample.selected_count+" / "+sample.sample_count+" · "+
   stamp(iso(sample.first_ms))+" → "+stamp(iso(sample.last_ms));
 }

 function coverage(payload,state,copy,stamp,offline){
  const parts=[];
  if(state==="loading")parts.push(copy("جارٍ جلب عينة الصفقات","Loading executions"));
  if(state==="unavailable"||payload?.trades?.status==="unavailable")parts.push(copy("عينة MEXC المباشرة غير متاحة","Live MEXC sample unavailable"));
  const latest=state==="unavailable"?"":tradeCoverage(payload?.trades,copy,stamp);
  if(latest)parts.push(latest);
  const archived=tradeCoverage(payload?.archived_trades,copy,stamp);
  if(archived&&!latest)parts.push(copy("مؤرشف","Archived")+" · "+archived);
  const lp=payload?.liquidity;
  if(lp?.status==="ok"||lp?.status==="partial"){
   parts.push("PumpSwap · "+copy("معاملات مفحوصة","Transactions inspected")+" "+lp.inspected_count+" / "+lp.returned_count+
    (lp.last_ms?(" · "+stamp(iso(lp.first_ms))+" → "+stamp(iso(lp.last_ms))):"")+
    (lp.status==="partial"?(" · "+copy("تغطية جزئية","Partial coverage")):""));
  }else if(payload?.symbol==="STAMPUSDT"){
   parts.push("PumpSwap · "+(lp?copy("الفحص غير متاح","Check unavailable"):copy("بانتظار أول فحص خلفي","Awaiting first background check")));
  }
  return parts.join("  |  ")||copy(offline?"لا توجد عينة مؤرشفة":"بانتظار عينة الصفقات",offline?"No archived sample":"Waiting for executions");
 }

 function renderList({aligned,payload,state,selected,copy,stamp,offline,replay}){
  const list=el("chartEventList"),line=el("eventCoverage"),empty=el("eventEmpty");
  if(!list)return;
  const summary=replay?copy("الأحداث الموثقة حتى وقت إعادة العرض","Verified events through the replay cursor"):coverage(payload,state,copy,stamp,offline);
  if(line.textContent!==summary)line.textContent=summary;
  const filtered=selected===null?aligned:aligned.filter(entry=>entry.bar.t===selected);
  const selection=el("eventSelection");
  selection.hidden=selected===null;
  el("eventAll").hidden=selected===null;
  if(selected!==null)selection.textContent=copy("شمعة","Candle")+" · "+stamp(iso(selected));
  const content=filtered.map(({event,bar})=>{
   const style=kinds[kind(event)],label=copy(...style.label),href=sourceLink(event);
   const amount=event.kind==="trade"&&Number.isFinite(event.notional)?new Intl.NumberFormat("en-US",{maximumFractionDigits:2}).format(event.notional)+" USDT":"";
   return '<li><button type="button" data-event-candle="'+bar.t+'" class="event-focus">'+
    '<span class="event-kind event-'+kind(event)+'">'+esc(label)+'</span>'+
    '<time dir="ltr" class="event-time" datetime="'+iso(event.time_ms)+'">'+esc(stamp(event.time_ms,true))+'</time>'+
    (amount?'<span dir="ltr" class="event-amount">'+esc(amount)+'</span>':"")+'</button>'+
    (href?'<a href="'+href+'" target="_blank" rel="noopener noreferrer" class="event-source" dir="ltr">'+esc(event.source)+' ↗</a>':"")+'</li>';
  }).join("");
  if(list._content!==content){list.innerHTML=content;list._content=content}
  empty.hidden=filtered.length>0;
  if(!empty.hidden)empty.textContent=state==="loading"?copy("جارٍ البحث عن أحداث داخل الشموع","Looking for events on the chart"):
   selected===null?copy("لا توجد أحداث موثقة ضمن الشموع المعروضة","No verified events within the loaded candles"):
   copy("لا توجد أحداث موثقة لهذه الشمعة","No verified events on this candle");

 }

 function renderOperations(report,copy,stamp,offline){
  const body=el("operationsSources");
  if(!body)return;
  const updated=report?.checked_utc;
  const now=Date.now();
  const stampText=updated?copy("آخر دورة رصد","Last monitoring run")+" · "+stamp(updated):
   copy("بانتظار أول سجل تشغيل","Awaiting first operations record");
  const checked=el("operationsChecked");
  if(checked.textContent!==stampText)checked.textContent=stampText;
  const stateLabel=status=>copy(...(statuses[status]||statuses.unchecked));
  const table=Object.entries(sources).map(([name,label])=>{
   const state=report?.sources?.[name]||{},status=state.status||"unchecked";
   const age=now-Date.parse(state.observed_utc);
   const delayed=Number.isFinite(age)&&age>75*60*1000;
   const source=esc(copy(...label));
   const title=name==="workflow"&&/^\d+$/.test(state.run_id||"")?
    '<a target="_blank" rel="noopener noreferrer" href="https://github.com/mosulonsol-max/STAMP/actions/runs/'+state.run_id+'">'+source+' ↗</a>':source;
   const badge=esc(delayed?copy("فحص قديم","Check delayed")+" · "+stateLabel(status):stateLabel(status));
   return '<tr data-operation-source="'+name+'"><th scope="row">'+title+'</th>'+
    '<td><span class="operation-state '+(!delayed&&(status==="ok"||status==="empty")?"fresh":"stale")+'">'+badge+'</span></td>'+
    '<td dir="ltr">'+esc(stamp(state.observed_utc))+'</td><td dir="ltr">'+esc(stamp(state.last_ok_utc))+'</td></tr>';
  }).join("");
  if(body._content!==table){body.innerHTML=table;body._content=table}
  const incidents=(report?.incidents||[]).filter(event=>Object.hasOwn(sources,event.source));
  const list=el("operationsIncidents");
  const log=incidents.map(event=>'<li><strong>'+esc(copy(...sources[event.source]))+'</strong><span>'+
   esc(stateLabel(event.from))+' → '+esc(stateLabel(event.to))+'</span><time dir="ltr">'+esc(stamp(event.observed_utc))+'</time></li>').join("");
  if(list._content!==log){list.innerHTML=log;list._content=log}
  const empty=el("operationsEmpty");
  empty.hidden=incidents.length>0;
  empty.textContent=updated?copy("لا توجد تغيّرات مسجلة ضمن فترة الرصد المتاحة","No status changes recorded in the observed period"):
   copy(offline?"سجل التشغيل غير متاح في هذه النسخة":"بانتظار دورة الرصد الخلفية","No background operations record available yet");
 }

 window.StampEvents={align,markers,renderList,renderOperations};
})();
