"use strict";
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'../dashboard/private.js'),'utf8');
const now=new Date().toISOString(),step=900000,last=Math.floor(Date.now()/step)*step;
const measured=new Date(Date.now()-3600000+600000).toISOString(),due=new Date(Date.now()-3600000).toISOString();
const sample={observed_utc:now,market:{price:.0001751,change:.018,volume:77791,high_24h:.00018,low_24h:.00016},live_quote:{status:'fresh',price:.0001760,change_24h_pct:1.8,volume_24h_usdt:80000,high_24h:.00019,low_24h:.00015,retrieved_at_utc:now},liquidity:{liquidity_usd:123456,market_cap_usd:900000,observed_utc:now},candles:{'15m':Array.from({length:8},(_,i)=>({t:last-(8-i)*step,o:.00017,h:.00018,l:.00016,c:.000175,v:100}))},forecasts:{'1h':{forecast:{reference_price:.0001751,predicted_price:.00018,reference_at_utc:now,due_at_utc:new Date(Date.now()+3600000).toISOString(),predicted_log_return:.01}}},model_decisions:{'1h':{automatic:true,status:'experimental',selected_model:'ridge',decided_at_utc:now,reason_codes:['insufficient_prospective_outcomes'],forward_validation:{samples:120},prospective:{samples:0}}},forecast_review:{rows:[{horizon:'1h',due_utc:due,predicted_price:.00018,actual_price:.00017,measurement_time_utc:measured,measurement_offset_seconds:600,direction_correct:false},{horizon:'1h',due_utc:new Date(Date.now()+3600000).toISOString(),predicted_price:.00019,actual_price:null}]},scorecard:{models:{unrelated:{promotion_eligible:true}}}};
async function run(mode){
 const nodes=new Map(),urls=[],series=[],timers=new Map();let range,clock=Date.now(),marketUpdates=0;
 const liveScene=mode==='live-scene';
 function get(id){if(!nodes.has(id))nodes.set(id,{id,value:'',textContent:'',innerHTML:'',hidden:false,disabled:false,dataset:{},style:{},handlers:{},closest(){return get('horizon-select')},setAttribute(k,v){this[k]=v},replaceChildren(){},addEventListener(k,f){this.handlers[k]=f},showModal(){this.open=true}});return nodes.get(id)}
 get('stamp-snapshot').content={textContent:JSON.stringify({...sample,live_quote:{status:'unavailable'}})};
 const chart={addSeries(type){const s={type,points:[],setData(values){for(let i=1;i<values.length;i++)assert.ok(values[i].time>values[i-1].time,'chart times must be unique and ascending');this.points=values},priceScale(){return {applyOptions(){}}},createPriceLine(){return {applyOptions(){}}},removePriceLine(){}};series.push(s);return s},timeScale(){return {setVisibleRange(r){assert.ok(r.to>r.from);range=r},fitContent(){}}},subscribeCrosshairMove(){},applyOptions(){}};
 const window={location:{href:'/'},LightweightCharts:{createChart:()=>chart,CandlestickSeries:'candles',HistogramSeries:'volume',LineSeries:'line',LineStyle:{Dashed:2},CrosshairMode:{Normal:0}}};
 const document={getElementById:get,documentElement:{},querySelectorAll:()=>[],createDocumentFragment:()=>({appendChild(){}}),createElement:()=>({style:{setProperty(){}},appendChild(){},setAttribute(){}})};
 if(liveScene){
  window.StampMarket={};window.addEventListener=()=>{};document.addEventListener=()=>{};
  get('trading').hidden=true;
 }
 class TestDate extends Date{static now(){return clock}}
 const fetch=async url=>{
  urls.push(url);
  if(url==='/api/assets/learning-loop?symbol=STAMPUSDT')return {ok:true,json:async()=>({
   symbol:'STAMPUSDT',source:'worker_persistent_research_state',review_updated_at_utc:now,
   autonomous_review_counts:{accepted:4,rejected:6,pending:2},model_selections:{}
  })};
  if(liveScene&&url==='/api/market-update?symbol=STAMPUSDT&frame=15m'){
   const observed=new Date(clock).toISOString();
   const nextPrice=++marketUpdates===1?.000177:.000178;
   return {ok:true,json:async()=>({symbol:'STAMPUSDT',frame:'15m',closed:[],quote:{
    status:'fresh',price:nextPrice,provider_at_utc:observed,retrieved_at_utc:observed,transport:'rest'
   }})};
  }
  if(mode==='unauthorized'&&url==='/api/dashboard')return {status:401,ok:false};
  if(url==='/api/dashboard'&&mode!=='primary'&&!liveScene)throw Error('primary failed');
  if(url==='/api/dashboard-lite'&&mode==='embedded')throw Error('lite failed');
  if(url==='/api/quote')return {ok:true,json:async()=>({quote:{status:'unavailable'}})};
  return {ok:true,json:async()=>url==='/api/dashboard'?sample:{...sample,live_quote:{status:'unavailable'}}};
 };
 vm.runInNewContext(source,{document,window,fetch,localStorage:{getItem:()=>null,setItem(){}},Intl,Date:TestDate,Number,Math,String,Object,JSON,Map,Blob:class{},URL:{},AbortController:class{signal={};abort(){}},setTimeout:()=>1,clearTimeout(){},setInterval(callback,delay){timers.set(delay,callback)},console},{timeout:3000});
 for(let i=0;i<16;i++)await new Promise(resolve=>setImmediate(resolve));
 if(liveScene){
  assert.equal(marketUpdates,1);
  assert.match(get('workerReview').textContent,/مقبول 4.*مرفوض 6.*معلّق 2/);
  clock+=5000;
  timers.get(1000)();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(marketUpdates,2,'the visible scene must poll while the chart is closed');
  assert.equal(get('price').textContent,'0.0001780');
  return {mode,marketUpdates};
 }
 if(mode==='unauthorized'){assert.equal(window.location.href,'/login');assert.equal(get('price').textContent,'');return {mode}}
 assert.equal(get('price').textContent,mode==='primary'?'0.0001760':'0.0001751');
 assert.equal(get('high24').textContent,mode==='primary'?'0.0001900':'0.0001800');
 assert.equal(get('low24').textContent,mode==='primary'?'0.0001500':'0.0001600');
 assert.equal(get('change').textContent,'+1.80%');assert.equal(get('liquidity').textContent,'$123,456');
 assert.match(get('forecastSummary').textContent,/0.0001800/);
 assert.equal(get('modelStatus').textContent,'تجريبي آليًا','UI must read the authoritative model decision, not unrelated scores');
 assert.ok(series.length>=4,'chart not initialized; UI error: '+get('error').textContent+'; chartEmpty: '+get('chartEmpty').textContent+'; warning: '+get('warning').textContent);assert.equal(series[0].points.length,8);assert.equal(series[2].points.length,2);assert.equal(series[3].points[0].time,Date.parse(measured)/1000,'never backdate an approximate outcome to target time');assert.ok(range);
 assert.equal(get('refresh').disabled,false);
 if(mode!=='primary')assert.ok(urls.includes('/api/dashboard-lite'));
 return {mode,bars:series[0].points.length,predictions:series[2].points.length,measurements:series[3].points.length};
}
(async()=>{for(const mode of ['primary','recovery','embedded','unauthorized','live-scene'])console.log('PASS',JSON.stringify(await run(mode)))})().catch(error=>{console.error(error);process.exitCode=1});
