"use strict";
(() => {
const $=id=>document.getElementById(id),fmt=new Intl.NumberFormat("en-US",{maximumFractionDigits:4});
const number=v=>v==null||!Number.isFinite(Number(v))?"—":fmt.format(Number(v));
const price=v=>v==null||!Number.isFinite(Number(v))?"—":Number(v).toLocaleString("en-US",{maximumFractionDigits:Number(v)<.01?10:4});
const utc=v=>{const n=Date.parse(v);return Number.isFinite(n)?new Date(n).toISOString().replace('T',' ').replace('.000Z',' UTC').replace(/\.\d+Z$/,' UTC'):"Unverified time"};
const age=v=>{const t=Date.parse(v);return Number.isFinite(t)?Math.max(0,(Date.now()-t)/1000):Infinity};
const set=(id,v)=>{$(id).textContent=v};
const element=(tag,text,cls)=>{const e=document.createElement(tag);e.textContent=text;if(cls)e.className=cls;return e};
let pair="BTCUSDT",frame="1h",engine=null,market=null,selected=null,stage="collect",epoch=0,engineFailed=false,rotate=false,angle=.1;
let chart,series,predicted,actualLine,catalog={pairs:['BTCUSDT','ETHUSDT','SOLUSDT','STAMPUSDT','ZECUSDT']},lastQuote=null,venuePinned=false;
const Model=window.StampObservatory;
const pending=new Map(),MS={"15m":900000,"1h":3600000,"4h":14400000,"1d":86400000};
const stages=[{id:"collect",name:"Collection",short:"Closed candles",color:"#64dce1"},{id:"compute",name:"Calculation",short:"Recorded returns",color:"#69bbc9"},{id:"forecast",name:"Forecast",short:"Issued output",color:"#e9b976"},{id:"verify",name:"Verification",short:"Measured outcome",color:"#a6d59a"},{id:"learn",name:"Learning",short:"Holdout selection",color:"#b9b2e5"}];
async function request(path,key,timeout=14000){
 pending.get(key)?.abort();const ctl=new AbortController();pending.set(key,ctl);const timer=setTimeout(()=>ctl.abort(),timeout);
 try{const r=await fetch(path,{credentials:"same-origin",cache:"no-store",signal:ctl.signal});if(r.status===401){location.href="/login";throw Error("Sign in required")}if(!r.ok)throw Error("Source returned "+r.status);return await r.json()}
 finally{clearTimeout(timer);if(pending.get(key)===ctl)pending.delete(key)}
}
function activeRecord(){return selected?{...selected,recorded:true,venue:'MEXC'}:Model.active(engine,market,frame)}
function notify(text,state){set('notice',text);$('notice').dataset.state=state}
function facts(rows){$('stageFacts').replaceChildren();for(const [label,value] of rows){$('stageFacts').append(element('dt',label),element('dd',value))}}
function renderInspector(){
 const r=activeRecord(),e=engine,valid=!!e&&!engineFailed&&age(e.archive_updated_at_utc)<600;
 const config=stages.find(s=>s.id===stage);set('stageLabel',config.name.toUpperCase());set('stageTitle',config.short);set('stageExtra',"");
 for(const b of $('stageControls').children)b.setAttribute('aria-pressed',String(b.dataset.stage===stage));
 if(!e){
  if(r&&(stage==='compute'||stage==='forecast')){set('stageSummary','Current projection computed from the selected venue’s closed candles. It has not yet been saved or measured by the worker.');facts([['Source',r.inputs.source],['Model',r.model_version],['Reference',price(r.reference_price)],['Forecast',price(r.predicted_price)],['Target time',utc(r.due_at_utc)],['Recomputed',r.calculation.matches_recorded?'Matches calculation':'Unverified']])}
  else{set('stageSummary','Saved worker evidence is unavailable. Current venue projections remain in the forecast cards.');facts([])}draw();return}

 if(stage==='collect'){
  set('stageSummary',"The worker rotates through the discovered MEXC USDT universe. The selected record uses closed candle prices; the live chart has its own source and timestamp.");
  facts([["Universe",number(e.coverage.universe)+" pairs"],["Selected market",e.symbol],["Latest batch",e.collection.processed_in_last_batch?"Included in latest batch":"Not in latest batch"],["Batch completed",utc(e.collection.last_batch_at_utc)],["Collection error",e.collection.last_error||"None recorded for this batch"],["Record's input features",r?.inputs.available?number(r.inputs.recent_log_returns.length)+" recorded log returns":"Unavailable for this record"]]);
 }else if(stage==='compute'){
  set('stageSummary',r?.recorded===false?'Recompute the current projection from this venue’s closed candle returns. These inputs have not yet been saved as a worker record.':'Inspect the calculation behind the selected forecast. Its original returns are saved with the record and can be independently recomputed.');
  facts([["Record",r?.id||"No forecast"],["Model",r?.model_version||"Unavailable"],["Input source",r?.inputs.source||"Unavailable"],["Lookback",r?.inputs.lookback?number(r.inputs.lookback)+" returns":"Unavailable"],["Recomputed price",price(r?.calculation.recomputed_price)],[r?.recorded===false?"Matches computed projection":"Matches recorded output",r?.calculation.matches_recorded===true?"Yes":r?.calculation.matches_recorded===false?"No · investigate":"Cannot verify · original features missing"]]);
  set('stageExtra',r?.inputs.available?"Saved log returns: "+r.inputs.recent_log_returns.map(x=>Number(x).toFixed(6)).join(', '):"Historical records without saved features cannot be reconstructed reliably.");
 }else if(stage==='forecast'){
  set('stageSummary',r?.recorded===false?'Current projection from the selected venue. Its target and reference times are shown below; measurement has not occurred.':'This is an immutable issued forecast from the worker archive. Changing the chart interval selects the corresponding horizon.');
  facts([["Record",r?.id||"No record"],["Issued",utc(r?.reference_at_utc)],["Target time",utc(r?.due_at_utc)],["Reference",price(r?.reference_price)],["Predicted",price(r?.predicted_price)],["Status at issue",r?.validation_at_issue||"Unavailable"]]);
 }else if(stage==='verify'){
  set('stageSummary',"After the target time, the worker looks for the matching closed candle and compares squared log error with the unchanged-price baseline. Accepted means lower error, not a profitable trade.");
  facts([["Verified outcomes",number(e.coverage.settled)],["Selected record",r?.review.status||"Unavailable"],["Actual price",price(r?.outcome?.actual_price)],["Measurement saved",utc(r?.outcome?.measured_at_utc)],["Forecast squared error",r?.outcome?Number(r.outcome.squared_log_error).toExponential(5):"Awaiting measurement"],["Baseline squared error",r?.outcome?Number(r.outcome.baseline_squared_log_error).toExponential(5):"Awaiting measurement"]]);
 }else{
  const model=e.learning.selected_models[frame],report=e.learning.adaptation?.[frame];set('stageSummary',e.learning.policy);
  facts([["Selected model · this horizon",model?.version||"No replacement selected"],["Selected at",utc(model?.selected_at_utc)],["Holdout samples",number(model?.holdout_samples)],["Shared model",e.learning.peer_models?.[frame]?.version||"No eligible peer model"],["Peer pairs",number(e.learning.peer_models?.[frame]?.peer_count)],["Adaptation",report?.status?.replaceAll("_"," ")||"Collecting evidence"],["Directional misses",report?(report.direction_miss_rate*100).toFixed(1)+"%":"—"],["Signed log bias",report?(report.signed_log_bias*100).toFixed(3)+"%":"—"],["Forward outcomes",number(report?.forward_samples??report?.forward?.samples)],["Error hypothesis",(report?.error_hypothesis||"Unconfirmed").replaceAll("_"," ")],["Next automatic action",String(e.learning.next_action||"Unverified").replaceAll('_',' ')],["Trading approval",e.trading_approved?"Approved":"No live execution approved"]]);
  set('stageExtra',"Observed books, global sessions and public buy/sell samples currently provide context. They are excluded from this forecast formula.");
 }
 if(!valid)set('stageExtra',$('stageExtra').textContent+' · Worker evidence is delayed or unavailable. Last saved state: '+utc(e.archive_updated_at_utc));draw();
}
function targetRate(record){
 if(!record||record.venue!=='MEXC'||record.outcome)return 'Target hit rate: unavailable for this record.';
 const rate=engine?.target_rates?.[record.frame]?.[record.model_version];
 if(rate?.rate==null)return 'Target hit rate: insufficient evidence ('+(rate?.samples||0)+'/30 verified results).';
 return 'Historical target hit rate: '+(rate.rate*100).toFixed(1)+'% ('+rate.hits+'/'+rate.samples+
  ' within ±1% of target at expiry).';
}
function renderOutput(){
 const r=activeRecord(),v=r?.venue==='MEXC'?(engine?.validation?.[r?.frame||frame]||{}):{};
 set('recordKind',selected?'HISTORICAL RESULT':r?.recorded===false?'CURRENT CANDLE PROJECTION':'SAVED UPCOMING FORECAST');
 const change=r?100*(r.predicted_price/r.reference_price-1):null;
 set('forecastDirection',r?(change>=0?'Up ':'Down ')+(change>=0?'+':'')+change.toFixed(3)+'% · '+(r.venue||'MEXC')+' · '+r.frame:'No current forecast · checking source data');
 set('outputTitle',selected?'Measured forecast':'Forecast');set('recordId',r?.id||'No current forecast. Expired records remain in the history below.');
 set('outputState',String(r?.review.status||'NO RECORD').toUpperCase());$('outputState').dataset.state=r?.review.status||'unknown';
 for(const [id,value] of [['reference',r?.reference_price],['prediction',r?.predicted_price],['actual',r?.outcome?.actual_price]])set(id,price(value));
 set('issued','Issued '+utc(r?.reference_at_utc));set('due','Target '+utc(r?.due_at_utc));set('measured',r?.outcome?'Measured '+utc(r.outcome.measured_at_utc):r&&age(r.due_at_utc)<1?'Target not yet reached':'Awaiting matching target candle');
 const reasons={computed_with_pair_model:"Computed from this pair’s closed candles using its selected model. This projection is awaiting measurement.",computed_with_peer_model:"Computed from this venue’s closed candles using a model supported by other pairs. Local performance is still unverified.",computed_from_current_closed_candles:'Computed now from '+(r?.venue||'selected venue')+' closed candles. This projection has not yet been measured. Historical worker validation applies only to its saved MEXC models.',outperformed_no_change_baseline:'The forecast had lower squared price error than the unchanged-price baseline.',did_not_outperform_no_change_baseline:'The forecast did not beat the unchanged-price baseline.',integrity_or_chronology_failure:'The record failed integrity or chronology checks.',awaiting_verified_target_candle:'The worker is waiting for a verified target candle.'};
 set('targetRate',targetRate(r));
 const newsEffect=r?.news_effect;const reviewText=reasons[r?.review.reason]||'No saved automatic review for this record.';set('outputReason',reviewText+(newsEffect?.used_in_directional_forecast?' Validated news adjustment applied '+(Number(newsEffect.applied_log_return_adjustment)*100).toFixed(3)+'% in log return.':newsEffect?' News was recorded as an input. Its directional effect was not enabled at issue.':''));set('model',r?.model_version||'Unavailable');
 set('formula',r?.inputs.available?(r.calculation.formula||'Reference × exp(mean of the last '+r.inputs.lookback+' saved log returns)') :'Original calculation inputs are unavailable.');
 set('recompute',r?.calculation.matches_recorded===true?(r.recorded===false?'Recomputed from current source candles · matches projection':'Recomputed from saved inputs · matches recorded prediction'):r?.calculation.matches_recorded===false?'Calculation mismatch · investigate':'Cannot independently reproduce this historical record');
 const performance=r?.venue==='MEXC'?engine?.target_rates?.[r.frame]?.[r.model_version]:null;
 set('pairPerformance',performance?.direction_accuracy!=null?
  'Direction '+(100*performance.direction_accuracy).toFixed(1)+'% · mean price error '+performance.mean_price_error_pct.toFixed(2)+'% · '+performance.samples+' audited results for this model':'');
 const saved=engine?.latest?.[r?.frame||frame];
 const report=engine?.learning?.adaptation?.[r?.frame||frame];
 set('forecastDiagnosis',report?.error_hypothesis?
  'Model review: '+report.error_hypothesis.replaceAll('_',' ')+(report.status?' · '+report.status.replaceAll('_',' '):''):'');
 set('lastPairForecast',saved?'Latest archived reference '+worldTime(saved.reference_at_utc)+' Baghdad':'');
 const skill=v.observed_skill;set('skill',skill==null?'Insufficient evidence':(skill>=0?'+':'')+(skill*100).toFixed(2)+'%');
 set('quality',(v.observed_samples??0)+' verified samples · '+(v.status||'unverified').replaceAll('_',' ')+'. Positive skill means lower error than unchanged price. This is separate from the selected record’s review.');
 renderInspector();renderChart();
}
function savedAt(e){return e?.collection?.last_batch_at_utc||e?.archive_updated_at_utc}
function archiveFresh(e){return age(savedAt(e))<600}
function renderEngine(){
 const e=engine;if(!e)return;
 set('recordCount',number(e.coverage.pair_records));set('settledCount',number(e.coverage.settled));set('recordTime',number(e.coverage.archive_records)+' records across '+number(e.coverage.universe)+' discovered pairs');
 const c=e.coverage.decisions;set('decisions',number(c.accepted)+' accepted · '+number(c.rejected)+' rejected · '+number(c.pending)+' pending'+(e.coverage.invalid_outcomes?' · '+number(e.coverage.invalid_outcomes)+' excluded by audit':''));
 const fresh=archiveFresh(e),starting=!e.worker.last_success_utc&&e.worker.running;
 set('workerState',engineFailed?'Connection interrupted':!fresh?'Evidence delayed':
  starting?'Processing after restart':e.worker.running?'Processing':'Between cycles');
 set('workerTime',(e.storage==='postgres'?'PostgreSQL':'Temporary storage')+' · last saved '+utc(savedAt(e)));
 notify(engineFailed?'Worker refresh failed. Saved evidence remains visible with its original timestamp.':fresh?'Archive available for '+pair+'.':'Worker evidence is delayed. Inspect the last saved record and its timestamps.',''+(fresh?'ok':'error'));
 set('historySummary',e.coverage.settled+' verified outcomes · latest 16 shown');$('history').replaceChildren();
 for(const r of [...e.recent_outcomes].reverse()){
  const tr=document.createElement('tr');tr.append(element('td',pair+' / '+r.frame),element('td',utc(r.reference_at_utc)),element('td',price(r.predicted_price)),element('td',price(r.outcome?.actual_price)));
  const decision=element('td',r.review.status);decision.dataset.state=r.review.status;tr.append(decision);
  const td=document.createElement('td'),button=element('button','Open record');button.type='button';button.addEventListener('click',()=>{selected=r;frame=r.frame;$('frame').value=frame;stage='compute';if(market?.venue!=='MEXC'){pending.get('market')?.abort();pending.delete('market');pending.get('quote')?.abort();pending.delete('quote');market=null;lastQuote=null;$('venue').value='MEXC';venuePinned=true;set('quote','—');set('quoteTime','Loading MEXC candles for the saved record…');loadMarket()}renderOutput();$('marketWorkspace').scrollIntoView({block:'start'})});td.append(button);tr.append(td);$('history').append(tr);
 }
 if(!e.recent_outcomes.length){const tr=document.createElement('tr'),td=element('td','No verified outcomes for this market yet.');td.colSpan=6;tr.append(td);$('history').append(tr)}
 $('contract').replaceChildren();for(const [title,key] of [['Used in this model','used'],['Observed as context','observed_only'],['Not implemented in this engine','not_implemented']]){const ul=document.createElement('ul');for(const text of e.input_contract[key])ul.append(element('li',text));$('contract').append(element('h3',title),ul)}
 renderOutput();set('lastRefresh','Worker fetched '+utc(e.generated_utc));
}
async function loadEngine(){if(pending.has('engine')||document.hidden)return;const version=epoch;
 try{const d=await request('/api/engine-state?symbol='+encodeURIComponent(pair),'engine');if(version!==epoch)return;if(d.symbol!==pair||d.source!=='worker_recorded_computation')throw Error('Invalid worker evidence');const previous=engine;engine=d;engineFailed=false;observeArchive(previous,d);if(selected){selected=d.recent_outcomes.find(r=>r.id===selected.id)||selected}renderEngine()}
 catch(e){if(version!==epoch)return;engineFailed=true;if(engine)renderEngine();else{notify('Saved worker history unavailable · '+e.message+'. Current venue projections load independently.','loading');set('workerState','Unavailable');renderInspector()}}
}
let forecastArrowPoints=[];
function attachForecastArrow(){
 const renderer={draw(target){
  if(forecastArrowPoints.length!==2)return;
  const [start,end]=forecastArrowPoints.map(point=>({
   x:chart.timeScale().timeToCoordinate(point.time),y:predicted.priceToCoordinate(point.value)
  }));
  if([start.x,start.y,end.x,end.y].some(value=>value===null))return;
  target.useMediaCoordinateSpace(({context:ctx,mediaSize})=>{
   const {width,height}=mediaSize;
   if(end.x<0||end.x>width||end.y<0||end.y>height)return;
   const angle=Math.atan2(end.y-start.y,end.x-start.x),size=13;
   const direction=Math.sign(forecastArrowPoints[1].value-forecastArrowPoints[0].value);
   const caption=(direction>0?'↑ ':direction<0?'↓ ':'→ ')+'Target '+price(forecastArrowPoints[1].value);
   ctx.save();ctx.lineCap='round';
   ctx.strokeStyle='#ffd185';ctx.fillStyle='#ffd185';ctx.lineWidth=3;
   ctx.beginPath();ctx.moveTo(start.x,start.y);ctx.lineTo(end.x,end.y);ctx.stroke();
   ctx.beginPath();ctx.moveTo(end.x,end.y);
   for(const offset of [-.48,.48])ctx.lineTo(end.x-size*Math.cos(angle+offset),end.y-size*Math.sin(angle+offset));
   ctx.closePath();ctx.fill();
   ctx.font='bold 13px system-ui';
   const w=ctx.measureText(caption).width+16;
   const x=Math.max(2,Math.min(width-w-2,end.x-w/2));
   const y=Math.max(2,Math.min(height-26,end.y+(end.y<31?10:-31)));
   ctx.fillStyle='#241c12';ctx.fillRect(x,y,w,24);
   ctx.strokeStyle='#ffd185';ctx.lineWidth=1;ctx.strokeRect(x,y,w,24);
   ctx.fillStyle='#fff0ce';ctx.textBaseline='middle';ctx.fillText(caption,x+8,y+12);
   ctx.restore();
  });
 }};
 predicted.attachPrimitive({paneViews:()=>[{zOrder:()=> 'top',renderer:()=>renderer}]});
}
function initChart(){if(chart||!window.LightweightCharts)return;const L=window.LightweightCharts;
 chart=L.createChart($('priceChart'),{autoSize:true,layout:{background:{type:'solid',color:'#101c26'},textColor:'#9ab2c4',attributionLogo:false},grid:{vertLines:{color:'#20313d'},horzLines:{color:'#20313d'}},timeScale:{timeVisible:true},rightPriceScale:{borderColor:'#34505f'},handleScale:{pinch:true,mouseWheel:true},handleScroll:{pressedMouseMove:true,horzTouchDrag:true}});
 series=chart.addSeries(L.CandlestickSeries,{upColor:'#67c9c7',downColor:'#d28294',wickUpColor:'#67c9c7',wickDownColor:'#d28294',borderVisible:false,priceFormat:{type:'price',precision:8,minMove:.00000001}});
 predicted=chart.addSeries(L.LineSeries,{color:'#edbb74',lineVisible:false,priceLineVisible:false,lastValueVisible:false,priceFormat:{type:'price',precision:8,minMove:.00000001}});attachForecastArrow();actualLine=chart.addSeries(L.LineSeries,{color:'#8addb0',lineWidth:2,pointMarkersVisible:true,priceLineVisible:false,lastValueVisible:false});
}
let chartView='';function renderChart(){initChart();const rows=market?.candles?.[frame]||[];const bars=rows.filter(c=>c.t<=Date.now()).map(c=>({time:Math.floor(c.t/1000),open:c.o,high:c.h,low:c.l,close:c.c}));
 if(!chart){set('chartStatus','Chart library unavailable. Recorded prices remain in the evidence panel.');return}
 series.setData(bars);const r=activeRecord(),ref=Date.parse(r?.reference_at_utc)/1000,due=Date.parse(r?.due_at_utc)/1000;
 const points=r&&Number.isFinite(ref)&&Number.isFinite(due)&&due>ref?[{time:ref,value:r.reference_price},{time:due,value:r.predicted_price}]:[];forecastArrowPoints=points;predicted.setData(points);actualLine.setData(points.length&&r?.outcome?[{time:ref,value:r.reference_price},{time:due,value:r.outcome.actual_price}]:[]);
 const key=pair+'|'+frame+'|'+(r?.id||'none')+'|'+String(!!bars.length);if(chartView!==key){const range=Model.chartRange(bars,r,frame,!!selected);if(range){chart.timeScale().setVisibleRange(range);chartView=key}}
 set('chartTitle',pair.replace('USDT',' / USDT')+' · '+(market?.venue||r?.venue||'—')+' · '+frame);
 set('chartStatus',bars.length?'Candles: '+market.source+' · fetched '+utc(market.retrieved_at_utc)+'. Last candle may be forming; forecasts use closed candles only. '+(r?'Forecast '+(r.venue||'MEXC')+' · issued '+utc(r.reference_at_utc)+' · target '+utc(r.due_at_utc):'No upcoming forecast from fresh candles.')+(selected&&bars[0].time>due?' Historical result predates the candle window.':''):'Current candles unavailable. '+(r?'The saved reference and target are drawn.':'No forecast can be plotted until data arrives.'));
}
function applyQuote(value,venue,fetched,provider){
 if(!(Number(value)>0)||venue!==market?.venue)return;
 const providerMs=Date.parse(provider),fetchedMs=Date.parse(fetched);
 if(!Number.isFinite(fetchedMs)||fetchedMs>Date.now()+5000)return;
 if(lastQuote?.venue===venue&&Number.isFinite(providerMs)&&Number.isFinite(lastQuote.providerMs)&&providerMs<lastQuote.providerMs)return;
 if(lastQuote?.venue===venue&&fetchedMs<lastQuote.fetchedMs)return;
 const isNewExecution=Number.isFinite(providerMs)&&providerMs<=Date.now()+5000&&Date.now()-providerMs<60000&&lastQuote?.venue===venue&&providerMs>lastQuote.providerMs;
 lastQuote={value:Number(value),venue,providerMs,fetchedMs};
 if(isNewExecution)signal(['quote','collect'],colors.cyan,venue+' reported a newer quote',new Date(providerMs).toISOString());set('quote',price(value));paintQuote();
 const tail=market.candles?.[frame]?.at(-1);if(tail&&providerMs>=tail.t&&providerMs<tail.t+MS[frame]&&tail.t+MS[frame]>Date.now()){tail.c=Number(value);tail.h=Math.max(tail.h,tail.c);tail.l=Math.min(tail.l,tail.c);series?.update({time:Math.floor(tail.t/1000),open:tail.o,high:tail.h,low:tail.l,close:tail.c})}
}
function paintQuote(){if(!lastQuote)return;const stale=Date.now()-lastQuote.fetchedMs>20000;const timed=Number.isFinite(lastQuote.providerMs);const oldProvider=timed&&Date.now()-lastQuote.providerMs>60000;
 $('quote').dataset.state=stale||oldProvider?'stale':'current';set('quoteTime',lastQuote.venue+' Spot · '+(stale||oldProvider?'DELAYED · ':'')+(timed?'exchange '+utc(new Date(lastQuote.providerMs).toISOString()):'exchange time unavailable')+' · fetched '+utc(new Date(lastQuote.fetchedMs).toISOString()));$('quoteTime').dataset.state=stale||oldProvider?'error':'ok';}
async function loadMarket(){if(pending.has('market')||document.hidden)return;const version=epoch,venue=$('venue').value;
 try{const d=await request('/api/assets/snapshot?symbol='+encodeURIComponent(pair)+(venue?'&venue='+encodeURIComponent(venue):''),'market',30000);if(version!==epoch)return;if(d.symbol!==pair||venue&&d.venue!==venue)throw Error('Mismatched market source');const previousMarket=market;market=d;$('venue').value=d.venue;drawPairMood();
 for(const horizon of Object.keys(MS)){
  const current=Model.active(engine,d,horizon);
  const prior=previousMarket?.research_forecasts?.[horizon];
  if(current?.recorded===false&&Date.parse(current.reference_at_utc)>Date.parse(prior?.reference_at_utc||'1970-01-01'))
   signal(['collect','compute','forecast',horizon],colors.amber,'Projection calculated · '+horizon,current.reference_at_utc);
 }
 const close=d.ticker?.closeTime;applyQuote(d.ticker?.lastPrice,d.venue,d.retrieved_at_utc,close?new Date(Number(close)).toISOString():null);renderOutput();
 }catch(e){if(version===epoch){set('quoteTime','Selected venue unavailable · '+e.message);$('quoteTime').dataset.state='error';set('chartStatus','Current source unavailable. No replacement venue was selected.');if(!market){set('quote','—');renderOutput()}}}
}
async function loadQuote(){if(!market||pending.has('quote')||document.hidden)return;const version=epoch,venue=market.venue;
 try{const d=await request('/api/assets/quote?symbol='+encodeURIComponent(pair)+'&venue='+encodeURIComponent(venue),'quote',13000);if(version!==epoch)return;if(d.symbol!==pair||d.venue!==venue)throw Error('Mismatched quote');applyQuote(d.price,d.venue,d.retrieved_at_utc,d.provider_at_utc)}
 catch{paintQuote()}}
function renderCurrencyList(){
 const previous=$('pairSelect').value,rows=Model.currencyList(catalog,$('pair').value);
 const typed=$('pair').value.toUpperCase().replace(/\//g,'').trim();if(!rows.length&&/^[A-Z0-9]{1,22}USDT$/.test(typed))rows.push(typed);$('pairSelect').replaceChildren();
 if(!rows.length){const o=element('option','No matching currencies');o.value='';$('pairSelect').append(o);return}
 for(const symbol of rows){const venues=catalog.venues?.[symbol]||[];const o=element('option',symbol.replace('USDT',' / USDT')+(venues.length?' · '+venues.join(', '):' · listing unverified'));o.value=symbol;$('pairSelect').append(o)}
 const exact=typed.endsWith('USDT')?typed:typed+'USDT';if(typed&&rows.includes(exact))$('pairSelect').value=exact;else if(rows.includes(previous))$('pairSelect').value=previous;else if(rows.includes(pair))$('pairSelect').value=pair;
 set('catalogStatus',rows.length+' matching markets · '+Model.currencyList(catalog).length+' exchange / watched USDT symbols'+(catalog.retrieved_at_utc?' · fetched '+utc(catalog.retrieved_at_utc):' · starter list; refreshing exchange catalogs'));
}
async function loadCatalog(){if(pending.has('universe'))return;set('catalogStatus','Loading connected exchange listings…');$('retryCatalog').hidden=true;
 try{const d=await request('/api/assets/universe','universe',25000);if(!Model.currencyList(d).length)throw Error('Empty exchange catalog');d.pairs=[...new Set([...d.pairs,...catalog.pairs.filter(p=>['BTCUSDT','ETHUSDT','SOLUSDT','STAMPUSDT','ZECUSDT',pair].includes(p))])];catalog=d;renderCurrencyList()}
 catch(e){set('catalogStatus','Exchange list unavailable · '+e.message+'. Starter markets remain selectable.');$('retryCatalog').hidden=false}}
let worldExchange, worldEpoch=0, worldSessions=[];
let worldCalendarAt=0, rankingRefreshAfter=0;
const FAVORITES_KEY='stamp_favorite_pairs';
let favorites=[];
function readFavorites(){
 try{
  const saved=JSON.parse(localStorage.getItem(FAVORITES_KEY)||'[]');
  favorites=Model.currencyList({pairs:Array.isArray(saved)?saved:[]});
 }catch{favorites=[]}
}
function renderFavorites(){
 const menu=$('favoriteSelect'),button=$('assetFavorite'),saved=favorites.includes(pair);
 const placeholder=element('option',favorites.length?'Choose a favorite':'No saved favorites');
 placeholder.value='';
 menu.replaceChildren(placeholder,...favorites.map(symbol=>{
  const option=element('option',symbol.replace(/USDT$/,' / USDT'));option.value=symbol;return option;
 }));
 menu.value=saved?pair:'';
 menu.disabled=!favorites.length;
 button.textContent=saved?'★ Saved':'☆ Save';
 button.setAttribute('aria-pressed',String(saved));
 button.setAttribute('aria-label',(saved?'Remove ':'Save ')+pair+(saved?' from favorites':' to favorites'));
}
$('favoriteSelect').addEventListener('change',event=>{
 const symbol=event.target.value;
 if(!symbol)return;
 if(!catalog.pairs.includes(symbol))catalog.pairs.push(symbol);
 $('pair').value='';renderCurrencyList();$('pairSelect').value=symbol;
 if(symbol!==pair)choosePair();
});
$('assetFavorite').addEventListener('click',()=>{
 const next=favorites.includes(pair)?favorites.filter(symbol=>symbol!==pair):[...favorites,pair];
 try{localStorage.setItem(FAVORITES_KEY,JSON.stringify(next));favorites=next;renderFavorites()}
 catch{notify('Favorites could not be saved on this device.','error')}
});
window.addEventListener('storage',event=>{
 if(event.key===FAVORITES_KEY||event.key===null){readFavorites();renderFavorites()}
});
const seenSessionWindows=new Map();
function selectWorld(code){
 if(worldExchange===code||!worldSessions.some(session=>session.exchange===code))return;
 worldExchange=code;worldEpoch++;rankingRefreshAfter=0;
 pending.get('world-ranking')?.abort();pending.delete('world-ranking');
 $('flow').replaceChildren();set('flowTime','Loading session rankings…');
 renderSessionButtons(worldSessions);loadSessionRanking();draw();
}
const worldClock=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Baghdad',dateStyle:'medium',timeStyle:'short'});
function worldTime(value){const stamp=typeof value==='number'?value:Date.parse(value);return Number.isFinite(stamp)?worldClock.format(stamp):'—'}
function renderSessionButtons(sessions){
 const group=$('sessions');
 const buttons=new Map([...group.querySelectorAll('button')].map(button=>[button.dataset.exchange,button]));
 for(const session of sessions){
  let button=buttons.get(session.exchange);
  if(!button){
   if(!buttons.size)group.replaceChildren();
   button=element('button','');button.type='button';button.dataset.exchange=session.exchange;
   button.addEventListener('click',()=>selectWorld(session.exchange));
   group.append(button);buttons.set(session.exchange,button);
  }
  button.replaceChildren(element('strong',session.name),element('span',session.status.toUpperCase()));
  const timer=element('span','');
  timer.className='session-countdown';
  button.append(timer);
  button.dataset.state=session.status;
  button.setAttribute('aria-pressed',String(session.exchange===worldExchange));
 }
 updateSessionCountdowns();
}
let retryWorldAfter=0;
function updateSessionCountdowns(){
 if(document.hidden)return;
 const now=Date.now();
 const buttons=$('sessions').querySelectorAll('button');
 let boundaryReached=false;
 for(const [index,session] of worldSessions.entries()){
  const timer=buttons[index]?.querySelector('.session-countdown');
  if(!timer)continue;
  const boundary=Date.parse(session.next_change_utc);
  if(!Number.isFinite(boundary)){timer.textContent='Schedule unavailable';continue}
  if(now>=boundary){
   timer.textContent='Checking session…';
   boundaryReached=true;
   continue;
  }
  const closing=Date.parse(session.close_utc);
  const deadline=session.status==='open'&&Number.isFinite(closing)?closing:boundary;
  const seconds=Math.max(0,Math.ceil((deadline-now)/1000));
  const clock=[Math.floor(seconds/3600)%24,Math.floor(seconds/60)%60,seconds%60]
   .map(unit=>String(unit).padStart(2,'0')).join(':');
  const days=Math.floor(seconds/86400);
  const label={open:'Closes in',break:'Resumes in',closed:'Opens in'}[session.status];
  timer.textContent=label+' '+(days?days+'d ':'')+clock;
 }
 if(boundaryReached&&now>=retryWorldAfter){
  retryWorldAfter=now+5000;
  rankingRefreshAfter=0;
  loadWorld();
 }
}
async function loadSessionRanking(){
 if(!worldExchange||pending.has('world-ranking')||document.hidden||Date.now()<rankingRefreshAfter)return;
 const version=worldEpoch;
 try{
  const result=await request('/api/world-rankings?exchange='+encodeURIComponent(worldExchange),'world-ranking',24000);
  if(version!==worldEpoch)return;
  if(result.status==='ok'){
   const nextChange=Date.parse(result.next_change_utc);
   const nextMinute=Math.floor(Date.now()/60000)*60000+60000;
   rankingRefreshAfter=result.session_status==='open'?nextMinute:nextChange;
   if(!Number.isFinite(rankingRefreshAfter))rankingRefreshAfter=Date.now()+60000;
  }
  const previousWindow=seenSessionWindows.get(result.exchange);
  if(result.status==='ok'&&result.window_end_utc){
   seenSessionWindows.set(result.exchange,result.window_end_utc);
   if(previousWindow&&Date.parse(result.window_end_utc)>Date.parse(previousWindow))
    signal([result.exchange,'source'],colors.cyan,result.name+' ranking window updated',result.window_end_utc);
  }
  const mode={open:'Last 5 completed minutes of the open session',break:'Session so far · recess',closed:'Last completed session'}[result.session_status]||'Session status unknown';
  const rows=result.pairs.map((pair,index)=>{
   const row=element('tr','');
   const values=[index+1,pair.symbol.replace(/USDT$/,' / USDT'),...['last_price','buy_quantity','buy_price','buy_usdt','sell_quantity','sell_price','sell_usdt','volume_usdt','trades','change_pct'].map(key=>{
    const value=pair[key];
    if(value==null||!Number.isFinite(value))return '—';
    if(key==='change_pct')return (value>0?'+':'')+value.toFixed(2)+'%';
    if(key.endsWith('price'))return value.toLocaleString('en-US',{maximumSignificantDigits:9});
    return value.toLocaleString('en-US',{maximumFractionDigits:key.endsWith('quantity')?6:2});
   })];
   row.append(...values.map((value,column)=>{const cell=element(column===1?'th':'td',String(value));if(column===1)cell.scope='row';return cell}));
   return row;
  });
  $('flow').replaceChildren(...rows);
  const coverage=result.covered_count==null?'': ' · '+result.covered_count+'/'+result.candidate_count+' pairs checked';
  const window=result.window_end_utc?' · '+worldTime(result.window_start_utc)+' → '+worldTime(result.window_end_utc)+' Baghdad':'';
  set('flowTime',result.name+' · '+mode+window+coverage+(result.status==='partial'?' · Partial data':'')+(rows.length?'':' · No ranking available yet'));
 }catch(error){
  if(version===worldEpoch)set('flowTime','Ranking update unavailable. '+($('flow').children.length?'Showing prior results.':'Waiting for source data.'));
 }
}
async function loadWorld(){
 if(pending.has('world')||document.hidden)return;
 const boundary=worldSessions.some(session=>Date.parse(session.next_change_utc)<=Date.now());
 if(worldSessions.length&&!boundary&&Date.now()-worldCalendarAt<60000){await loadSessionRanking();return}
 try{
  const data=await request('/api/world-rankings','world',8000);
  if(!worldExchange)worldExchange=(data.sessions.find(session=>session.status==='open')||data.sessions[0])?.exchange;
  worldCalendarAt=Date.now();worldSessions=data.sessions;sessionStates=new Map(worldSessions.map(session=>[session.exchange,session]));
  renderSessionButtons(worldSessions);draw();
 }catch(error){
  if(!worldExchange)set('flowTime','Session calendars unavailable.');
 }
 await loadSessionRanking();
}
function drawMood(id,value,label,tone){
 const meter=$(id+'Meter');
 set(id+'Score',value==null?'—':value+' / 100');
 set(id+'Label',label);
 $(id).dataset.tone=tone||'neutral';
 meter.hidden=value==null;
 if(value!=null)meter.value=value;
}
const moodTone=label=>label.includes('Fear')?'negative':label.includes('Greed')?'positive':'neutral';
async function loadMarketMood(){
 if(document.hidden||pending.has('market-mood'))return;
 try{
  const data=await request('/api/market/fear-greed','market-mood',8000);
  const stamp=Date.parse(data.observed_at_utc);
  if(!Number.isInteger(data.value)||data.value<0||data.value>100||!Number.isFinite(stamp))throw Error('Invalid index');
  const stale=Date.now()-stamp>36*3600000;
  drawMood('marketMood',data.value,data.classification+(stale?' · delayed':''),stale?'neutral':moodTone(data.classification));
  set('marketMoodTime',worldTime(data.observed_at_utc)+' Baghdad');
 }catch{
  if($('marketMoodMeter').hidden)drawMood('marketMood',null,'Daily index unavailable');
  else set('marketMoodLabel','Last reading · refresh unavailable');
 }
}
function drawPairMood(){
 const mood=Model.pairMood(market?.candles?.['1d']);
 set('pairMoodTitle',pair.replace(/USDT$/,' / USDT')+' Fear & Greed');
 if(!mood){
  drawMood('pairMood',null,market?'Insufficient recent daily candles':'Waiting for daily candles…');
  set('pairMoodTime','Technical estimate · 14-day RSI and 7-day momentum');
  return;
 }
 const value=mood.value;
 const label=value<25?'Extreme Fear':value<45?'Fear':value<=55?'Neutral':value<=75?'Greed':'Extreme Greed';
 drawMood('pairMood',value,label,moodTone(label));
 set('pairMoodTime','Technical estimate · '+market.venue+' · daily close '+worldTime(mood.closedAt)+' Baghdad');
}
let newsSnapshot=null;
const newsTime=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Baghdad',dateStyle:'medium',timeStyle:'short'});
function drawNews(){
 const data=newsSnapshot;
 if(!data){set('newsModelStatus','News data are not available yet.');return}
 const model=data.models?.[frame]||{},signal=data.pair_signal||{};
 const improvement=model.holdout_improvement;
 const pct=value=>value==null?'—':(value>=0?'+':'')+(value*100).toFixed(1)+'%';
 set('newsStatus',(data.status||'unavailable').toUpperCase()+' · '+(data.checked_at_utc?newsTime.format(Date.parse(data.checked_at_utc))+' Baghdad':'timestamp unavailable')+' · '+(data.sources||[]).map(source=>source.name.replace('GDELT · ','')+' '+source.status).join(' / ')+' · '+(signal.corroborated_stories||0)+' matched reports');
 set('newsModelStatus',(signal.status==='news_source_stale'?'News source stale · no current news signal used · ':'Pair headline signal '+pct(signal.signal)+' · '+number(signal.corroborated_stories)+' independently reported stories · ')+(model.used_in_directional_forecast?'Directional news adjustment active for '+frame+' · '+model.walk_forward_samples+' walk-forward outcomes · holdout error change '+pct(improvement)+' · '+number(model.independent_pairs)+' pairs · '+number(model.independent_days)+' days':'News effect collecting prospective evidence for '+frame+' · '+number(model.training_samples)+' paired outcomes · '+number(model.walk_forward_samples)+' walk-forward outcomes · error change '+pct(improvement)));
 const list=$('newsStories'),stories=data.stories||[];
 const expanded=new Set([...list.querySelectorAll('details[open]')].map(story=>story.dataset.story));
 set('newsToggleLabel','Tracked headlines · '+stories.length);
 list.replaceChildren();
 for(const story of stories){
  const article=element('details','','news-story');
  article.dataset.story=story.id;
  article.open=expanded.has(story.id);
  const score=Number(story.sentiment);
  const tone=score>0?'positive':score<0?'negative':'neutral';
  const impact=element('span',score>0?'↑ Positive':score<0?'↓ Negative':'— Neutral','polarity');
  impact.dataset.tone=tone;
  const heading=element('summary','');
  heading.append(element('span',story.title),impact);
  const link=element('a','Read source','news-source');
  if(/^https?:\/\//i.test(story.url)){link.href=story.url;link.target='_blank';link.rel='noopener noreferrer'}
  const timeLabel=story.timestamp_type==='published_at_source'?'Published':'Seen by GDELT';
  const metadata=element('p',(story.domains||[]).join(' · ')+' · '+timeLabel+': '+(story.seen_at_utc?newsTime.format(Date.parse(story.seen_at_utc))+' Baghdad':'time unavailable'),'footnote');
  const verification=story.corroborated?'CORROBORATED · '+story.reports+' outlets':'SINGLE SOURCE · not corroborated';
  const tags=element('p',verification+' · '+(story.scope==='pair'?'Selected pair':story.scope==='market'?'Market event':'Other coverage')+' · '+(story.categories||[]).join(' · ')+' · headline polarity '+(Number(story.sentiment)>=0?'+':'')+Number(story.sentiment||0).toFixed(2),'news-tags');
  article.append(heading,metadata,tags);if(link.hasAttribute('href'))article.append(link);list.append(article);
 }
 if(!list.children.length)list.append(element('p',data.status==='unavailable'?'The news source has not returned headlines. Check the source status and timestamp.':'No recent economic, political or digital-asset headlines are available.','footnote'));
}
async function loadNews(){
 if(document.hidden||pending.has('news'))return;
 const version=epoch;
 try{const result=await request('/api/research/news?symbol='+encodeURIComponent(pair),'news',15000);if(version!==epoch)return;newsSnapshot=result;drawNews()}
 catch(error){if(version===epoch){set('newsStatus','News source unavailable · '+error.message);set('newsModelStatus','Stored headlines and news model status will appear after the worker publishes its next research cycle.')}}
}
const tapeRows=new Map();
const tapeClock=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Baghdad',dateStyle:'short',timeStyle:'medium'});
let tapeRevision=0,tapeLimit=100,tapeIdentity=null;
function tapeKey(row){return row.type+' · '+row.source}
function resetTape(){
 tapeRevision++;tapeLimit=100;tapeRows.clear();
 pending.get('trade-tape')?.abort();pending.delete('trade-tape');
 $('tapeRows').replaceChildren();$('tapeCoverage').textContent='';
 $('tapeNetRows').replaceChildren(element('p','Waiting for captured trades…','footnote'));
 $('tapeVenue').replaceChildren(new Option('All sources',''));
 $('tapeMore').hidden=true;
}
const tapeValue=value=>Number(value).toLocaleString('en-US',{maximumSignificantDigits:9});
function drawTapeNet(rows){
 const totals=new Map();
 for(const row of rows){
  const {quote,side,notional}=row;
  if(!quote||(side!=='buy'&&side!=='sell')||!Number.isFinite(notional)||notional<=0)continue;
  if(!totals.has(quote))totals.set(quote,{buy:0,sell:0,start:Infinity,end:0});
  const bucket=totals.get(quote);
  bucket[side]+=notional;
  bucket.start=Math.min(bucket.start,row.time_ms);
  bucket.end=Math.max(bucket.end,row.time_ms);
 }
 const summary=$('tapeNetRows');
 summary.replaceChildren();
 for(const [quote,{buy,sell,start,end}] of [...totals].sort(([a],[b])=>a.localeCompare(b))){
  const net=buy-sell,balanced=Math.abs(net)<=Math.max(buy,sell)*1e-12;
  const line=element('article','','tape-net-item');
  const value=element('strong',balanced?'Balanced · 0 '+quote:
   (net>0?'Net buy · +':'Net sell · −')+tapeValue(Math.abs(net))+' '+quote);
  value.dataset.tone=balanced?'neutral':net>0?'positive':'negative';
  const buys=element('span','Buy '+tapeValue(buy)+' '+quote);
  const sells=element('span','Sell '+tapeValue(sell)+' '+quote);
  buys.dataset.tone='positive';
  sells.dataset.tone='negative';
  const breakdown=element('div','','tape-breakdown');
  breakdown.append(buys,sells);
  line.append(value,breakdown,element('small',tapeClock.format(start)+' → '+tapeClock.format(end)+' Baghdad'));
  summary.append(line);
 }
 if(!totals.size)summary.append(element('p','No captured trades for this selection.','footnote'));
}
function drawTape(){
 const frameMs=Number($('tapeFrame').value),side=$('tapeSide').value,venue=$('tapeVenue').value;
 const now=Date.now(),cutoff=now-Number($('tapeWindow').value);
 const venueRows=[...tapeRows.values()].filter(row=>row.time_ms>=cutoff&&row.time_ms<=now+5000&&(!venue||venue===tapeKey(row)));
 drawTapeNet(venueRows);
 const filtered=venueRows.filter(row=>!side||row.side===side);
 let items=filtered.map(row=>({...row,count:1}));
 if(frameMs){
  const grouped=new Map();
  for(const row of filtered){
   const time=Math.floor((row.time_ms+10800000)/frameMs)*frameMs-10800000;
   const key=[time,tapeKey(row),row.side,row.quote].join('|');
   const item=grouped.get(key)||{...row,time_ms:time,quantity:0,notional:0,count:0};
   item.quantity+=row.quantity;item.notional+=row.notional;item.count++;grouped.set(key,item);
  }
  items=[...grouped.values()].map(row=>({...row,price:row.notional/row.quantity}));
 }
 items.sort((a,b)=>b.time_ms-a.time_ms);
 $('tapeRows').replaceChildren(...items.slice(0,tapeLimit).map(row=>{
  const tr=element('tr','');
  const platform=tapeKey(row);
  const venueCell=element('td',platform);
  if(!frameMs&&row.pool)venueCell.title='Pool '+row.pool+(row.tx?' · Tx '+row.tx:'');
  const sideCell=element('td',row.side.toUpperCase(),'tape-side');
  sideCell.dataset.tone=row.side==='buy'?'positive':'negative';
  tr.append(element('td',tapeClock.format(row.time_ms)),venueCell,sideCell,
   element('td',tapeValue(row.quantity)),element('td',tapeValue(row.price)+' '+row.quote),
   element('td',tapeValue(row.notional)+' '+row.quote),element('td',String(row.count)));
  return tr;
 }));
 $('tapeMore').hidden=items.length<=tapeLimit;
}
async function loadTape(){
 if(document.hidden||pending.has('trade-tape'))return;
 const revision=tapeRevision,query=new URLSearchParams({symbol:pair});
 if(tapeIdentity){query.set('network',tapeIdentity.network);query.set('contract',tapeIdentity.contract)}
 if(!tapeRows.size)set('tapeStatus','Loading '+pair+' executions…');
 try{
  const result=await request('/api/trade-tape?'+query,'trade-tape',24000);
  if(revision!==tapeRevision||result.symbol!==pair)return;
  for(const row of result.trades)tapeRows.set(row.id,row);
  if(tapeRows.size>5000){
   const oldest=[...tapeRows.values()].sort((a,b)=>a.time_ms-b.time_ms);
   for(const row of oldest.slice(0,tapeRows.size-5000))tapeRows.delete(row.id);
  }
  const venue=$('tapeVenue'),selection=venue.value;
  const names=[...new Set([...tapeRows.values()].map(tapeKey))].sort();
  venue.replaceChildren(new Option('All sources',''),...names.map(name=>new Option(name,name)));
  if(names.includes(selection))venue.value=selection;
  set('tapeStatus',pair+' · '+tapeRows.size+' captured trades · checked '+tapeClock.format(Date.parse(result.observed_utc))+
   (result.contract?' · '+result.network+': '+result.contract:' · Add a verified contract for DEX trades'));
  set('tapeCoverage',result.sources.map(source=>source.venue+' '+source.status+' ('+source.count+')').join(' · ')+
   (result.contract?' · Up to '+result.dex_pool_limit+' of '+result.dex_pools_discovered+' discovered pools queried':''));
  drawTape();
 }catch(error){
  if(revision===tapeRevision)set('tapeStatus','Trade feed unavailable. '+(tapeRows.size?'Showing last captured trades.':'Check source or contract.'));
 }
}
$('tapeContractForm').addEventListener('submit',event=>{
 event.preventDefault();const contract=$('tapeContract').value.trim();
 tapeIdentity=contract?{network:$('tapeNetwork').value,contract}:null;resetTape();loadTape();
});
for(const id of ['tapeWindow','tapeFrame','tapeSide','tapeVenue'])$(id).addEventListener('change',()=>{tapeLimit=100;drawTape()});
$('tapeMore').addEventListener('click',()=>{tapeLimit+=100;drawTape()});
setInterval(loadTape,30000);
async function choosePair(){
 const value=$('pairSelect').value;if(!/^[A-Z0-9]{1,22}USDT$/.test(value)){notify('Select a currency from the list.','error');return}
 epoch++;for(const key of ['engine','market','quote','news']){pending.get(key)?.abort();pending.delete(key)}if(pair!==value){tapeIdentity=null;$('tapeContract').value='';resetTape();
  newsSnapshot=null;
  set('newsToggleLabel','Tracked headlines');
  set('newsStatus','Loading selected pair headlines…');
  set('newsModelStatus','Checking news impact for '+value+'…');
  $('newsStories').replaceChildren();
 }pair=value;renderFavorites();loadTape();loadNews();engine=null;market=null;drawPairMood();selected=null;lastQuote=null;chartView='';sceneEvents.length=0;set('signalEvent','Waiting for a new observed event.');
 for(const o of $('venue').options)o.disabled=false;if(!venuePinned)$('venue').value='';
 set('quotePair',pair.replace('USDT',' / USDT'));for(const id of ['quote','recordCount','settledCount'])set(id,'—');set('quoteTime','Loading selected venue quote…');set('workerState','Connecting');set('recordTime','Waiting for selected market');set('decisions','Waiting for selected market');set('workerTime','Status unverified');$('history').replaceChildren();set('historySummary','Loading selected market results…');$('contract').replaceChildren();if(series){series.setData([]);forecastArrowPoints=[];predicted.setData([]);actualLine.setData([])}notify('Loading '+pair+' price and forecasts…','loading');renderOutput();loadEngine();loadMarket();try{localStorage.setItem('stamp_observatory_pair',pair)}catch{}}
$('pairForm').addEventListener('submit',e=>{e.preventDefault();choosePair()});$('pairSelect').addEventListener('change',choosePair);$('pair').addEventListener('input',renderCurrencyList);$('retryCatalog').addEventListener('click',loadCatalog);$('venue').addEventListener('change',()=>{venuePinned=!!$('venue').value;choosePair()});
$('frame').addEventListener('change',()=>{frame=$('frame').value;selected=null;chartView='';renderOutput();drawNews()});$('latest').addEventListener('click',()=>{selected=null;chartView='';renderOutput()});$('focusForecast').addEventListener('click',()=>{chartView='';renderChart()});$('signout').addEventListener('click',async()=>{await fetch('/logout',{method:'POST',credentials:'same-origin'});location.href='/'});
for(const s of stages){const b=element('button',s.name);b.dataset.stage=s.id;b.type='button';b.setAttribute('aria-pressed',String(s.id===stage));b.addEventListener('click',()=>{stage=s.id;renderInspector()});$('stageControls').append(b)}
$('rotate').addEventListener('click',()=>{rotate=!rotate;$('rotate').setAttribute('aria-pressed',String(rotate));$('rotate').textContent=rotate?'Pause rotation':'Rotate scene';draw()});
const canvas=$('engineScene'),ctx=canvas.getContext('2d');
const motionPreference=matchMedia('(prefers-reduced-motion: reduce)');
const cities=[
 {code:'XNYS',label:'New York',lat:40.7,lon:-74},
 {code:'XLON',label:'London',lat:51.5,lon:-0.1},
 {code:'XETR',label:'Frankfurt',lat:50.1,lon:8.7},
 {code:'XTKS',label:'Tokyo',lat:35.7,lon:139.7},
 {code:'XSHG',label:'Shanghai',lat:31.2,lon:121.5},
 {code:'XHKG',label:'Hong Kong',lat:22.3,lon:114.2},
 {code:'XASX',label:'Sydney',lat:-33.9,lon:151.2}
];
const sceneEvents=[],eventLifetime=2100;
let sessionStates=new Map(),hitboxes=[],drag=null,lastDraw=0,continuous=false;
const colors={cyan:'#78e4ff',amber:'#ffc57f',green:'#82e6ad',violet:'#bba8ff',gray:'#6b8298'};
function signal(path,color,label,at){
 const eventTime=Date.parse(at);
 if(!Number.isFinite(eventTime)||eventTime>Date.now()+5000)return;
 sceneEvents.push({path,color,at:performance.now()});
 if(sceneEvents.length>12)sceneEvents.shift();
 set('signalEvent',label+' · '+utc(at));
 draw();
}
function observeArchive(previous,next){
 if(previous&&previous.symbol!==next.symbol)return;
 const recent=at=>Date.now()-Date.parse(at)<=120000;
 for(const [h,record] of Object.entries(next.latest||{})){
  if(!record?.id||record.id===previous?.latest?.[h]?.id||
   (!previous&&!recent(record.reference_at_utc)))continue;
  const path=record.calculation?.matches_recorded?['collect','compute','forecast',h]:['forecast',h];
  signal(path,colors.amber,'Saved '+h+' forecast',record.reference_at_utc);
 }
 const previousIds=new Set((previous?.scene_outcomes||[]).map(record=>record.id));
 const outcomes=(next.scene_outcomes||[]).filter(record=>!previousIds.has(record.id)&&
  (previous||recent(record.measured_at_utc)));
 for(const record of outcomes.slice(-4))
  signal([record.frame,'verify'],colors.green,'Measured '+record.frame+' result',record.measured_at_utc);
 if(previous){
  for(const [h,evaluated] of Object.entries(next.learning?.adaptation||{})){
   const prior=previous.learning?.adaptation?.[h];
   if(evaluated.samples!==prior?.samples||evaluated.status!==prior?.status||
    evaluated.forward_samples!==prior?.forward_samples||evaluated.last_tested_reference!==prior?.last_tested_reference)
    signal(['verify','learn'],colors.violet,'Evaluation updated · '+h,next.review_updated_at_utc);
  }
  for(const [h,model] of Object.entries(next.learning?.selected_models||{})){
   if(model?.selected_at_utc&&model.selected_at_utc!==previous.learning?.selected_models?.[h]?.selected_at_utc)
    signal(['learn','compute'],colors.violet,'Model selection recorded · '+h,model.selected_at_utc);
  }
 }
}
function draw(now=performance.now()){
 if(!ctx)return;
 const {width:w,height:h}=canvas.getBoundingClientRect();
 if(w<1||h<1)return;
 const dpr=Math.min(devicePixelRatio||1,2);
 if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){
  canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
 }
 ctx.setTransform(dpr,0,0,dpr,0,0);
 ctx.clearRect(0,0,w,h);
 const compact=w<580,scale=Math.min(w/(compact?550:800),h/(compact?540:435));
 const centerX=w*.51,centerY=h*(compact?.49:.51),yaw=angle||.13;
 const camera=(x,y,z)=>{
  const depth=z*Math.cos(yaw)+x*Math.sin(yaw);
  const perspective=860/(860-depth);
  return {x:centerX+(x*Math.cos(yaw)-z*Math.sin(yaw))*scale*perspective,
   y:centerY+(-y+depth*.28)*scale*perspective,depth,perspective};
 };
 const line=(points,color,width=1,dashed=false)=>{
  if(points.length<2)return;
  ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);
  for(const point of points.slice(1))ctx.lineTo(point.x,point.y);
  ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dashed?[4,6]:[]);ctx.stroke();ctx.setLineDash([]);
 };
 const dot=(p,r,color,glow=false)=>{
  ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fillStyle=color;
  if(glow){ctx.shadowColor=color;ctx.shadowBlur=14}
  ctx.fill();ctx.shadowBlur=0;
 };
 const label=(p,value,color='#d6e6ef',size=12)=>{
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='600 '+size+'px system-ui';
  ctx.lineWidth=4;ctx.strokeStyle='#090f19';ctx.strokeText(value,p.x,p.y);
  ctx.fillStyle=color;ctx.fillText(value,p.x,p.y);
 };
 const globe=compact?[-125,131,0]:[-230,25,0],r=compact?93:107,core=compact?[44,-52,0]:[31,-7,0];
 const points={
  source:camera(...globe),heart:camera(...core),
  quote:camera(...(compact?[-153,-37,0]:[-193,-126,0]))
 };
 const sphere=(lat,lon)=>{
  const x=lat*Math.PI/180,y=lon*Math.PI/180;
  return camera(globe[0]+r*Math.cos(x)*Math.sin(y),globe[1]+r*Math.sin(x),globe[2]+r*Math.cos(x)*Math.cos(y));
 };
 const sphereR=r*scale*points.source.perspective;
 const g=ctx.createRadialGradient(points.source.x-sphereR*.34,points.source.y-sphereR*.31,1,points.source.x,points.source.y,sphereR*1.07);
 g.addColorStop(0,'#226f83');g.addColorStop(.65,'#143447');g.addColorStop(1,'#0a1725');
 dot(points.source,sphereR,g);
 ctx.beginPath();ctx.arc(points.source.x,points.source.y,sphereR,0,Math.PI*2);
 ctx.strokeStyle='#66ceeb8c';ctx.lineWidth=1.4;ctx.stroke();
 for(let lat=-60;lat<=60;lat+=30)line(Array.from({length:73},(_,i)=>sphere(lat,i*5)),'#58bed052');
 for(let lon=0;lon<360;lon+=30)line(Array.from({length:37},(_,i)=>sphere(i*5-90,lon)),'#58bed04d');
 const stagePositions=compact?[[ -66,17,0],[3,37,0],[100,24,0],[143,-104,0],[-33,-131,0]]:
  [[-83,-3,0],[4,67,0],[91,30,0],[78,-79,0],[-13,-91,0]];
 const stagesAreFresh=engine&&archiveFresh(engine);
 const record=activeRecord();
 const states=[!!record?.inputs?.available,!!record?.calculation?.matches_recorded,!!record,!!record?.outcome||engine?.recent_outcomes?.some(item=>item.frame===frame),!!engine?.learning?.adaptation?.[frame]||!!engine?.learning?.selected_models?.[frame]];
 stages.forEach((item,i)=>{points[item.id]=camera(...stagePositions[i])});
 const freshQuote=lastQuote&&Date.now()-lastQuote.fetchedMs<20000&&
  Number.isFinite(lastQuote.providerMs)&&Date.now()-lastQuote.providerMs<60000;
 line([points.quote,points.collect],freshQuote?'#4897b7':'#41566b',2,true);
 dot(points.quote,4,freshQuote?colors.cyan:colors.gray,!!freshQuote);
 label({x:points.quote.x,y:points.quote.y+16},lastQuote?lastQuote.venue+' quote':'Venue quote',
  freshQuote?colors.cyan:'#a1b4c4',compact?10:11);
 line([points.collect,points.compute,points.forecast],stagesAreFresh?'#55b4c0':'#3d596e',2);
 line([points.forecast,points.verify],states[3]&&stagesAreFresh?'#6fa785':'#536a8d',1,true);
 line([points.verify,points.learn,points.compute],states[4]&&stagesAreFresh?'#a493d4':'#536a8d',1,true);
 hitboxes=[];
 const addHit=(point,kind,id,radius=18)=>hitboxes.push({x:point.x,y:point.y,kind,id,radius});
 const horizons=Object.keys(MS);
 horizons.forEach((horizon,i)=>{
  const radius=(compact?96:113)+i*(compact?25:33),height=(compact?.69:.55);
  const orbit=theta=>camera(core[0]+radius*Math.cos(theta),core[1]+radius*height*Math.sin(theta),radius*.24*Math.sin(theta));
  const active=frame===horizon;
  const target=Model.active(engine,market,horizon);
  line(Array.from({length:73},(_,j)=>orbit(j*Math.PI/36)),active?'#bd8961':'#827ba055',active?1.5:1);
  const marker=orbit((compact?-.60:.36)-i*.30);
  points[horizon]=marker;
  if(target)line([points.forecast,marker],active?'#e2a55b88':'#8c775866',1,true);
  dot(marker,active?6:4,target?colors.amber:colors.gray,active&&!!target);
  label({x:marker.x,y:marker.y-14},horizon,active?colors.amber:'#c2b5cf',12);
  addHit(marker,'frame',horizon,21);
 });
 const heartR=(compact?39:45)*scale;
 const heart=ctx.createRadialGradient(points.heart.x-heartR*.24,points.heart.y-heartR*.35,1,points.heart.x,points.heart.y,heartR);
 heart.addColorStop(0,'#68e4f5');heart.addColorStop(.34,'#296884');heart.addColorStop(1,'#101a33');
 dot(points.heart,heartR,heart);
 label(points.heart,'ENGINE','#e4faff',compact?10:12);
 addHit(points.heart,'stage','compute',heartR);
 stages.forEach((item,i)=>{
  const point=points[item.id],active=item.id===stage;
  const tone=states[i]&&(stagesAreFresh||i<3&&record?.recorded===false)?item.color:colors.gray;
  dot(point,active?7:4.5,tone,active);
  label({x:point.x,y:point.y+(i===3||i===4?16:-16)},compact&&i===0?'Intake':item.name,tone,compact?10:12);
  addHit(point,'stage',item.id,18);
 });
 cities.forEach((city,i)=>{
  const point=sphere(city.lat,city.lon+32);
  points[city.code]=point;
  const current=sessionStates.get(city.code),tone=current?.status==='open'?colors.green:current?.status==='break'?colors.amber:colors.gray;
  if(city.code===worldExchange)dot(point,8,'#d4ecff55');
  dot(point,4,tone,current?.status==='open');
  if(!compact&&(current?.status==='open'||city.code===worldExchange)||compact&&city.code===worldExchange)label({x:point.x,y:point.y+(i%2?15:-12)},city.label,'#e5f4ff',10);
  addHit(point,'city',city.code,11);
 });
 label({x:points.source.x,y:points.source.y+sphereR+23},'GLOBAL SESSIONS',colors.cyan,compact?10:12);
 for(const event of sceneEvents){
  const elapsed=(now-event.at)/eventLifetime;
  if(elapsed<0||elapsed>=1||motionPreference.matches)continue;
  const path=event.path.map(id=>points[id]).filter(Boolean);
  if(path.length<2)continue;
  const position=elapsed*(path.length-1),index=Math.floor(position),a=path[index],b=path[index+1],t=position-index;
  const wave=[];
  for(let i=0;i<13;i++){
   const phase=Math.max(0,t-(12-i)*.015);
   wave.push({x:a.x+(b.x-a.x)*phase,y:a.y+(b.y-a.y)*phase+Math.sin(i*1.7+elapsed*34)*Math.sin(i*Math.PI/12)*5});
  }
  line(wave,event.color,2.4);dot(wave.at(-1),4,event.color,true);
 }
}
function findSceneHit(event){
 const rect=canvas.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;
 return hitboxes.map(hit=>({hit,d:Math.hypot(x-hit.x,y-hit.y)}))
  .filter(({hit,d})=>d<=hit.radius).sort((a,b)=>a.d-b.d)[0]?.hit;
}
canvas.addEventListener('pointerdown',event=>{drag={id:event.pointerId,x:event.clientX,angle,moved:false}});
canvas.addEventListener('pointermove',event=>{
 if(drag?.id!==event.pointerId)return;
 const distance=event.clientX-drag.x;
 if(Math.abs(distance)>5||drag.moved){
  drag.moved=true;angle=Math.max(-.5,Math.min(.55,drag.angle+distance*.003));draw();
 }
});
canvas.addEventListener('pointerup',event=>{
 const shouldSelect=drag?.id===event.pointerId&&!drag.moved;drag=null;
 if(!shouldSelect)return;
 const hit=findSceneHit(event);
 if(hit?.kind==='stage'){stage=hit.id;renderInspector()}
 if(hit?.kind==='frame'){frame=hit.id;selected=null;$('frame').value=frame;stage='forecast';renderOutput()}
 if(hit?.kind==='city'){selectWorld(hit.id);$('worldTitle').scrollIntoView({block:'start',behavior:motionPreference.matches?'instant':'smooth'})}
});
canvas.addEventListener('pointercancel',()=>{drag=null});
canvas.addEventListener('pointerleave',()=>{drag=null});
new ResizeObserver(()=>draw()).observe(canvas);
function animate(now){
 if(!document.hidden&&!motionPreference.matches&&(rotate||sceneEvents.some(event=>now-event.at<eventLifetime))){
  if(now-lastDraw>33){
   if(rotate&&!drag){angle=.26*Math.sin(now/4100);continuous=true}
   draw(now);lastDraw=now;
  }
 }else if(continuous||sceneEvents.length){
  sceneEvents.splice(0,sceneEvents.length,...sceneEvents.filter(event=>now-event.at<eventLifetime));
  draw(now);continuous=false;
 }
 requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
try{const saved=localStorage.getItem('stamp_observatory_pair');if(saved&&/^[A-Z0-9]{1,22}USDT$/.test(saved)){if(!catalog.pairs.includes(saved))catalog.pairs.push(saved);renderCurrencyList();$('pairSelect').value=saved}}catch{}
readFavorites();choosePair();loadWorld();loadCatalog();loadMarketMood();
setInterval(loadMarketMood,900000);
setInterval(loadEngine,15000);setInterval(loadNews,300000);setInterval(loadMarket,60000);setInterval(loadQuote,5000);setInterval(paintQuote,1000);setInterval(()=>{if(market&&!document.hidden&&!selected&&activeRecord()===null)renderOutput()},5000);setInterval(loadWorld,15000);setInterval(updateSessionCountdowns,1000);setInterval(()=>{if(!document.hidden&&engine&&$('workerState').textContent!=='Evidence delayed'&&!archiveFresh(engine)&&!engineFailed)renderEngine()},5000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){loadEngine();loadMarket();loadWorld();loadTape();loadNews();loadMarketMood()}});
})();
