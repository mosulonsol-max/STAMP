"use strict";
(() => {
const $=id=>document.getElementById(id),fmt=new Intl.NumberFormat("en-US",{maximumFractionDigits:4});
const number=v=>v==null||!Number.isFinite(Number(v))?"—":fmt.format(Number(v));
const price=v=>v==null||!Number.isFinite(Number(v))?"—":Number(v).toLocaleString("en-US",{maximumFractionDigits:Number(v)<.01?10:4});
const utc=v=>{const n=Date.parse(v);return Number.isFinite(n)?new Date(n).toISOString().replace('T',' ').replace('.000Z',' UTC').replace(/\.\d+Z$/,' UTC'):"Unverified time"};
const age=v=>{const t=Date.parse(v);return Number.isFinite(t)?Math.max(0,(Date.now()-t)/1000):Infinity};
const set=(id,v)=>{$(id).textContent=v};
const element=(tag,text,cls)=>{const e=document.createElement(tag);e.textContent=text;if(cls)e.className=cls;return e};
let pair="BTCUSDT",frame="1h",engine=null,market=null,selected=null,stage="collect",epoch=0,engineFailed=false,rotate=false,angle=.1,lastArchive=null,pulseAt=-Infinity;
let chart,series,predicted,actualLine;
const pending=new Map(),MS={"15m":900000,"1h":3600000,"4h":14400000,"1d":86400000};
const stages=[{id:"collect",name:"Collection",short:"Closed candles",color:"#64dce1"},{id:"compute",name:"Calculation",short:"Recorded returns",color:"#69bbc9"},{id:"forecast",name:"Forecast",short:"Issued output",color:"#e9b976"},{id:"verify",name:"Verification",short:"Measured outcome",color:"#a6d59a"},{id:"learn",name:"Learning",short:"Holdout selection",color:"#b9b2e5"}];
async function request(path,key,timeout=14000){
 pending.get(key)?.abort();const ctl=new AbortController();pending.set(key,ctl);const timer=setTimeout(()=>ctl.abort(),timeout);
 try{const r=await fetch(path,{credentials:"same-origin",cache:"no-store",signal:ctl.signal});if(r.status===401){location.href="/login";throw Error("Sign in required")}if(!r.ok)throw Error("Source returned "+r.status);return await r.json()}
 finally{clearTimeout(timer);if(pending.get(key)===ctl)pending.delete(key)}
}
function activeRecord(){return selected||(engine?.latest||{})[frame]||null}
function notify(text,state){set('notice',text);$('notice').dataset.state=state}
function facts(rows){$('stageFacts').replaceChildren();for(const [label,value] of rows){$('stageFacts').append(element('dt',label),element('dd',value))}}
function renderInspector(){
 const r=activeRecord(),e=engine,valid=!!e&&!engineFailed&&age(e.archive_updated_at_utc)<600;
 const config=stages.find(s=>s.id===stage);set('stageLabel',config.name.toUpperCase());set('stageTitle',config.short);set('stageExtra',"");
 for(const b of $('stageControls').children)b.setAttribute('aria-pressed',String(b.dataset.stage===stage));
 if(!e){set('stageSummary',"No worker evidence is available. The diagram does not prove a stage completed.");facts([]);draw();return}
 if(stage==='collect'){
  set('stageSummary',"The worker rotates through the discovered MEXC USDT universe. The selected record uses closed candle prices; the live chart has its own source and timestamp.");
  facts([["Universe",number(e.coverage.universe)+" pairs"],["Selected market",e.symbol],["Latest batch",e.collection.processed_in_last_batch?"Included in latest batch":"Not in latest batch"],["Batch completed",utc(e.collection.last_batch_at_utc)],["Collection error",e.collection.last_error||"None recorded for this batch"],["Record's input features",r?.inputs.available?number(r.inputs.recent_log_returns.length)+" recorded log returns":"Unavailable for this record"]]);
 }else if(stage==='compute'){
  set('stageSummary',"Inspect the calculation behind the selected forecast. Its original return values are saved with the record, so the output can be independently recomputed.");
  facts([["Record",r?.id||"No forecast"],["Model",r?.model_version||"Unavailable"],["Input source",r?.inputs.source||"Unavailable"],["Lookback",r?.inputs.lookback?number(r.inputs.lookback)+" returns":"Unavailable"],["Recomputed price",price(r?.calculation.recomputed_price)],["Matches recorded output",r?.calculation.matches_recorded===true?"Yes":r?.calculation.matches_recorded===false?"No · investigate":"Cannot verify · original features missing"]]);
  set('stageExtra',r?.inputs.available?"Saved log returns: "+r.inputs.recent_log_returns.map(x=>Number(x).toFixed(6)).join(', '):"Historical records without saved features cannot be reconstructed reliably.");
 }else if(stage==='forecast'){
  set('stageSummary',"This is an immutable issued forecast from the worker archive. Changing the chart interval selects a corresponding recorded horizon.");
  facts([["Record",r?.id||"No record"],["Issued",utc(r?.reference_at_utc)],["Target time",utc(r?.due_at_utc)],["Reference",price(r?.reference_price)],["Predicted",price(r?.predicted_price)],["Status at issue",r?.validation_at_issue||"Unavailable"]]);
 }else if(stage==='verify'){
  set('stageSummary',"After the target time, the worker looks for the matching closed candle and compares squared log error with the unchanged-price baseline. Accepted means lower error, not a profitable trade.");
  facts([["Verified outcomes",number(e.coverage.settled)],["Selected record",r?.review.status||"Unavailable"],["Actual price",price(r?.outcome?.actual_price)],["Measurement saved",utc(r?.outcome?.measured_at_utc)],["Forecast squared error",r?.outcome?Number(r.outcome.squared_log_error).toExponential(5):"Awaiting measurement"],["Baseline squared error",r?.outcome?Number(r.outcome.baseline_squared_log_error).toExponential(5):"Awaiting measurement"]]);
 }else{
  const model=e.learning.selected_models[frame];set('stageSummary',e.learning.policy);
  facts([["Selected model · this horizon",model?.version||"No replacement selected"],["Selected at",utc(model?.selected_at_utc)],["Holdout samples",number(model?.holdout_samples)],["Next automatic action",String(e.learning.next_action||"Unverified").replaceAll('_',' ')],["Trading approval",e.trading_approved?"Approved":"No live execution approved"]]);
  set('stageExtra',"Observed books, global sessions and public buy/sell samples currently provide context. They are excluded from this forecast formula.");
 }
 if(!valid)set('stageExtra',$('stageExtra').textContent+' · Worker evidence is delayed or unavailable. Last saved state: '+utc(e.archive_updated_at_utc));draw();
}
function renderOutput(){
 const r=activeRecord(),v=engine?.validation?.[r?.frame||frame]||{};
 set('outputTitle',pair.replace('USDT',' / USDT')+' · '+(r?.frame||frame));set('recordId',r?.id||'No saved forecast for this horizon');
 set('outputState',String(r?.review.status||'NO RECORD').toUpperCase());$('outputState').dataset.state=r?.review.status||'unknown';
 for(const [id,value] of [['reference',r?.reference_price],['prediction',r?.predicted_price],['actual',r?.outcome?.actual_price]])set(id,price(value));
 set('issued','Issued '+utc(r?.reference_at_utc));set('due','Target '+utc(r?.due_at_utc));set('measured',r?.outcome?'Measured '+utc(r.outcome.measured_at_utc):r&&age(r.due_at_utc)<1?'Target not yet reached':'Awaiting matching target candle');
 const reasons={outperformed_no_change_baseline:'The forecast had lower squared price error than the unchanged-price baseline.',did_not_outperform_no_change_baseline:'The forecast did not beat the unchanged-price baseline.',integrity_or_chronology_failure:'The record failed integrity or chronology checks.',awaiting_verified_target_candle:'The worker is waiting for a verified target candle.'};
 set('outputReason',reasons[r?.review.reason]||'No saved automatic review for this record.');set('model',r?.model_version||'Unavailable');
 set('formula',r?.inputs.available?'Reference × exp(mean of the last '+r.inputs.lookback+' saved log returns)' :'Original calculation inputs are unavailable.');
 set('recompute',r?.calculation.matches_recorded===true?'Recomputed from saved inputs · matches recorded prediction':r?.calculation.matches_recorded===false?'Calculation mismatch · investigate':'Cannot independently reproduce this historical record');
 const skill=v.observed_skill;set('skill',skill==null?'Insufficient evidence':(skill>=0?'+':'')+(skill*100).toFixed(2)+'%');
 set('quality',(v.observed_samples??0)+' verified samples · '+(v.status||'unverified').replaceAll('_',' ')+'. Positive skill means lower error than unchanged price. This is separate from the selected record’s review.');
 renderInspector();renderChart();
}
function renderEngine(){
 const e=engine;if(!e)return;
 set('recordCount',number(e.coverage.pair_records));set('settledCount',number(e.coverage.settled));set('recordTime',number(e.coverage.archive_records)+' records across '+number(e.coverage.universe)+' discovered pairs');
 const c=e.coverage.decisions;set('decisions',number(c.accepted)+' accepted · '+number(c.rejected)+' rejected · '+number(c.pending)+' pending');
 const fresh=!engineFailed&&age(e.worker.last_success_utc)<600;set('workerState',fresh?(e.worker.running?'Processing':'Between cycles'):'Evidence delayed');set('workerTime',(e.storage==='postgres'?'PostgreSQL':'Temporary storage')+' · last success '+utc(e.worker.last_success_utc));
 set('sceneTime','Archive '+utc(e.archive_updated_at_utc));
 notify(engineFailed?'Worker refresh failed. Saved evidence remains visible with its original timestamp.':fresh?'Worker connected · '+pair+' · '+e.coverage.pair_records+' recorded forecasts. Select a stage or open a result to follow its evidence.':'Worker evidence is delayed. Inspect the last saved record and its timestamps.',''+(fresh?'ok':'error'));
 set('historySummary',e.coverage.settled+' measured outcomes · latest 16 shown');$('history').replaceChildren();
 for(const r of [...e.recent_outcomes].reverse()){
  const tr=document.createElement('tr');tr.append(element('td',pair+' / '+r.frame),element('td',utc(r.reference_at_utc)),element('td',price(r.predicted_price)),element('td',price(r.outcome?.actual_price)));
  const decision=element('td',r.review.status);decision.dataset.state=r.review.status;tr.append(decision);
  const td=document.createElement('td'),button=element('button','Open record');button.type='button';button.addEventListener('click',()=>{selected=r;frame=r.frame;$('frame').value=frame;stage='compute';renderOutput();$('engineScene').scrollIntoView({behavior:'smooth',block:'center'})});td.append(button);tr.append(td);$('history').append(tr);
 }
 if(!e.recent_outcomes.length){const tr=document.createElement('tr'),td=element('td','No verified outcomes for this market yet.');td.colSpan=6;tr.append(td);$('history').append(tr)}
 $('contract').replaceChildren();for(const [title,key] of [['Used in this model','used'],['Observed as context','observed_only'],['Not implemented in this engine','not_implemented']]){const ul=document.createElement('ul');for(const text of e.input_contract[key])ul.append(element('li',text));$('contract').append(element('h3',title),ul)}
 renderOutput();set('lastRefresh','Worker fetched '+utc(e.generated_utc));
}
async function loadEngine(){if(pending.has('engine')||document.hidden)return;const version=epoch;
 try{const d=await request('/api/engine-state?symbol='+encodeURIComponent(pair),'engine');if(version!==epoch)return;if(d.symbol!==pair||d.source!=='worker_recorded_computation')throw Error('Invalid worker evidence');engine=d;engineFailed=false;if(d.archive_updated_at_utc!==lastArchive){if(lastArchive)pulseAt=performance.now();lastArchive=d.archive_updated_at_utc}if(selected){selected=d.recent_outcomes.find(r=>r.id===selected.id)||selected}renderEngine()}
 catch(e){if(version!==epoch)return;engineFailed=true;if(engine)renderEngine();else{notify('Worker evidence unavailable · '+e.message+'. No generated output can be verified.','error');set('workerState','Unavailable');renderInspector()}}
}
function initChart(){if(chart||!window.LightweightCharts)return;const L=window.LightweightCharts;
 chart=L.createChart($('priceChart'),{autoSize:true,layout:{background:{type:'solid',color:'#101c26'},textColor:'#9ab2c4',attributionLogo:false},grid:{vertLines:{color:'#20313d'},horzLines:{color:'#20313d'}},timeScale:{timeVisible:true},rightPriceScale:{borderColor:'#34505f'},handleScale:{pinch:true,mouseWheel:true},handleScroll:{pressedMouseMove:true,horzTouchDrag:true}});
 series=chart.addSeries(L.CandlestickSeries,{upColor:'#67c9c7',downColor:'#d28294',wickUpColor:'#67c9c7',wickDownColor:'#d28294',borderVisible:false,priceFormat:{type:'price',precision:8,minMove:.00000001}});
 predicted=chart.addSeries(L.LineSeries,{color:'#edbb74',lineStyle:2,lineWidth:2,pointMarkersVisible:true,priceLineVisible:false,lastValueVisible:false});actualLine=chart.addSeries(L.LineSeries,{color:'#8addb0',lineWidth:2,pointMarkersVisible:true,priceLineVisible:false,lastValueVisible:false});
}
let chartView='';function renderChart(){initChart();const rows=market?.candles?.[frame]||[];const bars=rows.filter(c=>c.t+MS[frame]<=Date.now()).map(c=>({time:Math.floor(c.t/1000),open:c.o,high:c.h,low:c.l,close:c.c}));
 if(!chart){set('chartStatus','Chart library unavailable. Recorded prices remain in the evidence panel.');return}
 series.setData(bars);const r=activeRecord(),ref=Date.parse(r?.reference_at_utc)/1000,due=Date.parse(r?.due_at_utc)/1000;
 const points=r&&Number.isFinite(ref)&&Number.isFinite(due)&&due>ref?[{time:ref,value:r.reference_price},{time:due,value:r.predicted_price}]:[];predicted.setData(points);actualLine.setData(points.length&&r?.outcome?[{time:ref,value:r.reference_price},{time:due,value:r.outcome.actual_price}]:[]);
 const key=pair+'|'+frame+'|'+(selected?.id||'latest');if(chartView!==key){chartView=key;if(bars.length){const end=selected?due+MS[frame]/1000*4:Math.max(bars.at(-1).time,due||0);chart.timeScale().setVisibleRange({from:selected?ref-MS[frame]/1000*18:bars[Math.max(0,bars.length-70)].time,to:end+MS[frame]/1000*2})}}
 set('chartTitle',pair.replace('USDT',' / USDT')+' · '+frame);set('chartStatus',bars.length?'Chart: '+market.source+' · fetched '+utc(market.retrieved_at_utc)+'. Forecast: saved MEXC worker record; source and time may differ.'+(selected&&bars[0].time>due?' Selected record predates the returned candle window; only its saved reference and result are drawn.':''):'No current closed candles returned. Recorded forecast prices remain available.');
}
async function loadMarket(){if(pending.has('market')||document.hidden)return;const version=epoch;
 try{const d=await request('/api/assets/snapshot?symbol='+encodeURIComponent(pair),'market',22000);if(version!==epoch)return;if(d.symbol!==pair)throw Error('Wrong market');market=d;set('quote',price(d.ticker?.lastPrice));set('quoteTime',d.source+' · '+utc(d.retrieved_at_utc));renderChart()}
 catch(e){if(version===epoch){set('quote','—');set('quoteTime','Quote unavailable · '+e.message);set('chartStatus','Chart refresh failed; previously fetched candles retain their source timestamp.')}}
}
async function loadQuote(){if(!market||pending.has('quote')||document.hidden)return;const version=epoch;
 try{const d=await request('/api/market-update?symbol='+encodeURIComponent(pair)+'&frame='+frame,'quote',6500);if(version!==epoch)return;const q=d.quote;if(q?.status==='fresh'&&q.price>0&&age(q.retrieved_at_utc)<20){set('quote',price(q.price));set('quoteTime','MEXC Spot · '+utc(q.retrieved_at_utc))}}
 catch{/* The independently timestamped snapshot remains visible. */}}
async function loadWorld(){if(pending.has('world')||document.hidden)return;try{const d=await request('/api/world-sessions','world',14000);$('sessions').replaceChildren();for(const s of d.sessions){const el=element('span',s.name+' · '+s.status.toUpperCase());el.dataset.state=s.status;$('sessions').append(el)}$('flow').replaceChildren();if(age(d.crypto.observed_utc)>45||d.crypto.status!=='ok')throw Error('No recent executions');for(const a of d.crypto.assets){const row=element('div','','flow-row');row.append(element('strong',a.symbol.replace('USDT','')),element('span','Buy '+number(a.buy_usdt)),element('span','Sell '+number(a.sell_usdt)));$('flow').append(row)}set('flowTime','Sampled USDT executions · '+utc(d.crypto.observed_utc)+'. Count-limited public samples, not total volume or geographic trading.')}catch(e){$('flow').replaceChildren(element('p','Recent flow unavailable. '+e.message,'footnote'))}}
async function choosePair(){const value=$('pair').value.toUpperCase().replace('/','').trim();if(!/^[A-Z0-9]{1,22}USDT$/.test(value)){notify('Enter a valid USDT market such as BTCUSDT.','error');return}epoch++;for(const ctl of pending.values())ctl.abort();pending.clear();pair=value;engine=null;market=null;selected=null;lastArchive=null;chartView='';set('quotePair',pair.replace('USDT',' / USDT'));for(const id of ['quote','recordCount','settledCount'])set(id,'—');set('workerState','Connecting');set('recordTime','Waiting for selected market');set('decisions','Waiting for selected market');set('workerTime','Status unverified');$('history').replaceChildren();$('contract').replaceChildren();if(series){series.setData([]);predicted.setData([]);actualLine.setData([])}notify('Loading '+pair+' from the worker archive…','loading');renderOutput();loadEngine();loadMarket();try{localStorage.setItem('stamp_observatory_pair',pair)}catch{}}
$('pairForm').addEventListener('submit',e=>{e.preventDefault();choosePair()});$('frame').addEventListener('change',()=>{frame=$('frame').value;selected=null;chartView='';renderOutput()});$('latest').addEventListener('click',()=>{selected=null;renderOutput()});$('signout').addEventListener('click',async()=>{await fetch('/logout',{method:'POST',credentials:'same-origin'});location.href='/'});
for(const s of stages){const b=element('button',s.name);b.dataset.stage=s.id;b.type='button';b.setAttribute('aria-pressed',String(s.id===stage));b.addEventListener('click',()=>{stage=s.id;renderInspector()});$('stageControls').append(b)}
$('rotate').addEventListener('click',()=>{rotate=!rotate;$('rotate').setAttribute('aria-pressed',String(rotate));$('rotate').textContent=rotate?'Pause rotation':'Rotate scene';draw()});
const canvas=$('engineScene'),ctx=canvas.getContext('2d');let hitboxes=[];
function draw(){
 if(!ctx)return;const rect=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2),w=rect.width,h=rect.height;if(w<1)return;if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr)}ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
 const scale=Math.min(w/980,h/345),yaw=rotate?Math.sin(angle)*.24:.13;
 const project=(x,y,z)=>({x:w/2+(x*Math.cos(yaw)-z*Math.sin(yaw))*scale,y:h*.59+((x*Math.sin(yaw)+z*Math.cos(yaw))*.34-y)*scale});
 ctx.strokeStyle='#25506466';ctx.lineWidth=1;for(let i=-5;i<=5;i++){let a=project(i*95,0,-170),b=project(i*95,0,190);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();a=project(-475,0,i*35);b=project(475,0,i*35);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke()}
 const r=activeRecord(),states=[!!r?.inputs.available,!!r?.calculation.matches_recorded,!!r,!!r?.outcome,!!engine?.learning.selected_models[frame]],fresh=engine&&!engineFailed&&age(engine.archive_updated_at_utc)<600;
 hitboxes=[];const nodes=stages.map((s,i)=>({...s,x:(i-2)*188,z:i%2?15:-15,height:i===2?115:80}));
 for(let i=0;i<4;i++){const a=project(nodes[i].x+47,10,nodes[i].z),b=project(nodes[i+1].x-47,10,nodes[i+1].z);ctx.strokeStyle=states[i]&&states[i+1]&&fresh?'#609bab':'#314856';ctx.setLineDash(states[i]&&states[i+1]?[]:[4,5]);ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.setLineDash([])}
 for(let i=0;i<nodes.length;i++){
  const s=nodes[i],active=s.id===stage,color=fresh&&states[i]?s.color:'#58717e';const p=[project(s.x-44,0,s.z-33),project(s.x+44,0,s.z-33),project(s.x+44,0,s.z+33),project(s.x-44,0,s.z+33)],top=p.map((_,j)=>project(s.x+(j===0||j===3?-44:44),s.height,s.z+(j<2?-33:33)));
  const face=(pts,fill)=>{ctx.beginPath();pts.forEach((p,j)=>j?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fillStyle=fill;ctx.fill();ctx.strokeStyle=active?s.color:'#3b6576';ctx.lineWidth=active?1.7:1;ctx.stroke()};face([p[3],p[2],top[2],top[3]],active?'#225264':'#173541');face([p[2],p[1],top[1],top[2]],'#102c38');face(top,active?'#2d6171':'#214959');
  const center=project(s.x,s.height+26,s.z);ctx.textAlign='center';ctx.fillStyle=color;ctx.font=`600 ${Math.max(10,14*scale)}px system-ui`;ctx.fillText(s.name.toUpperCase(),center.x,center.y);ctx.font=`${Math.max(10,13*scale)}px system-ui`;const bottom=project(s.x,-29,s.z);const value=i===0?(r?.inputs.available?r.inputs.recent_log_returns.length+' returns':'No inputs'):i===1?(r?.calculation.matches_recorded?'Reproduced':'Unverified'):i===2?(r?price(r.predicted_price):'No forecast'):i===3?(r?.outcome?price(r.outcome.actual_price):'Awaiting target'):(engine?.learning.selected_models[frame]?.version||'No selection');ctx.fillStyle='#b9cdd7';ctx.fillText(value,bottom.x,bottom.y);
  if(active){ctx.fillStyle=color;ctx.fillRect(center.x-14,center.y-23,28,2)}hitboxes.push({id:s.id,x:Math.min(...p.map(x=>x.x),...top.map(x=>x.x))-12,y:center.y-20,w:110*scale+24,h:150*scale+50});
 }
 const pulse=(performance.now()-pulseAt)/1500;if(pulse>=0&&pulse<1){ctx.strokeStyle=`rgba(98,219,224,${1-pulse})`;ctx.lineWidth=2;ctx.strokeRect(20+pulse*20,20+pulse*10,w-40-pulse*40,h-40-pulse*20)}
}
canvas.addEventListener('click',e=>{const rect=canvas.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;const hit=hitboxes.find(h=>x>=h.x&&x<=h.x+h.w&&y>=h.y&&y<=h.y+h.h);if(hit){stage=hit.id;renderInspector()}});
new ResizeObserver(draw).observe(canvas);let lastTick=0;function animate(now){if(!document.hidden&&(rotate||now-pulseAt<1600)&&now-lastTick>32){angle+=.009;draw();lastTick=now}requestAnimationFrame(animate)}requestAnimationFrame(animate);
try{const saved=localStorage.getItem('stamp_observatory_pair');if(saved&&/^[A-Z0-9]{1,22}USDT$/.test(saved))$('pair').value=saved}catch{}
choosePair();loadWorld();request('/api/assets/universe','universe',25000).then(d=>{if(Array.isArray(d.pairs)){$('pairs').replaceChildren(...d.pairs.map(p=>{const o=document.createElement('option');o.value=p;return o}))}}).catch(()=>{});
setInterval(loadEngine,15000);setInterval(loadMarket,60000);setInterval(loadQuote,5000);setInterval(loadWorld,30000);setInterval(()=>{if(engine&&(engineFailed||age(engine.worker.last_success_utc)>600))renderEngine()},5000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){loadEngine();loadMarket();loadWorld()}});
})();
