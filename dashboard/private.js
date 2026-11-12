"use strict";
(() => {
const el=id=>document.getElementById(id);
const n=v=>v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v))?Number(v):null;
const price=v=>{
 const value=n(v);
 if(value===null)return "—";
 if(Math.abs(value)>=1)return value.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:4});
 return value.toFixed(value!==0&&Math.abs(value)<1e-7?12:7);
};
const money=v=>n(v)===null?"—":"$"+Number(v).toLocaleString("en-US",{maximumFractionDigits:0});
const number=v=>n(v)===null?"—":Number(v).toLocaleString("en-US",{maximumFractionDigits:2});
const pct=v=>n(v)===null?"—":(v>=0?"+":"")+Number(v).toFixed(2)+"%";
const esc=v=>String(v??"—").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const set=(id,value)=>{const node=el(id),text=String(value??"");if(node&&node.textContent!==text)node.textContent=text};
const age=s=>s&&Number.isFinite(Date.parse(s))?Math.max(0,(Date.now()-Date.parse(s))/1000):null;
let lang="ar",zone="Asia/Baghdad",frame="15m",horizon="1h",data=null,loading=false;
let stream=null,streamState="connecting",quoteLive=null,marketRequest=null,nextMarketPoll=0,marketFailures=0;
const liveCandles=new Map(),closedLiveCandles=new Map(),quoteStatistics=["change_24h_pct","volume_24h_usdt","high_24h","low_24h","base_volume_24h"];
const offline=window.location.protocol==="file:";
let chart=null,candleSeries=null,volumeSeries=null,predictedSeries=null,measuredSeries=null,projectionSeries=null,livePriceLine=null,viewKey="",currentBars=[];
let chartLayers=null,plottedForming=null,inspectingChart=false,technicalStart=null;
let eventMarkers=null,eventBars=[],eventPayload=null,eventRequest=null,eventState="loading",eventSelection=null,eventEnabled=true;
let nextEventPoll=0,operationsReport=null,replay=null,replayTimer=null;
let enabledLayers=new Set();
try{enabledLayers=new Set(JSON.parse(localStorage.getItem("stamp_chart_layers")||"[]").filter(key=>["ichimoku","fibonacci","elliott"].includes(key)))}catch{}
try{lang=localStorage.getItem("stamp_language")==="en"?"en":"ar";const saved=localStorage.getItem("stamp_timezone");if(["UTC","Asia/Baghdad","Asia/Makassar"].includes(saved))zone=saved}catch(e){}
const words={
ar:{inputsTitle:"مدخلات المحرك وكيف استُخدمت",inputGroup:"مجموعة البيانات",inputUsed:"عند مرجع التوقع",inputAccess:"الوصول الحالي",inputCoverage:"تغطية الاختبار",used:"متاحة",missing:"ناقصة / مستبعدة",regime:"المؤشرات وتغير نظام الحركة",market:"BTC / ETH / SOL / ZEC",ticker:"السعر وإحصاءات التداول",orderbook:"دفتر الأوامر",trades:"الصفقات المنفذة",dex:"سيولة وقيمة DEX",onchain:"المعروض والمحافظ والحرق",news:"الأخبار والإشارات المتحققة",project:"نشاط المشروع الموثق",macro:"حركة السوق العامة",derivatives:"العقود والمراكز والتمويل",feedback:"أخطاء التوقعات السابقة المتحققة",assuranceTitle:"فحص الإنتاج وصلاحية النتائج والتوسع",streamLive:"بث MEXC متصل",streamFallback:"بث غير متاح · تحديث احتياطي تلقائي",streamConnecting:"جارٍ الاتصال ببث MEXC",staleData:"البيانات متأخرة",dataSeconds:"ثانية منذ آخر سعر",forming:"شمعة جارية غير مغلقة · لا تدخل في تقييم النموذج",closedOnly:"الشموع المعروضة مغلقة؛ بانتظار تحديث الشمعة الجارية",production:"سلامة الإنتاج",quality:"صلاحية التوقع",healthy:"سليم",degraded:"يحتاج مراجعة",failed_evidence:"لم يجتز اختبار الجودة",insufficient_evidence:"أدلة غير كافية",approved_research:"معتمد للبحث",rolloutBlocked:"التوسع إلى جميع الأزواج غير معتمد: يلزم اختبار مستقل لكل زوج واختبار الحمل وعزل البيانات.",forwardSamples:"عينات الاختبار",verifiedSamples:"نتائج مستقبلية مستقلة",skill:"تحسن الخطأ مقابل ثبات السعر",direction:"دقة الاتجاه",interval:"نطاق الثقة 95%",overdue:"نتائج متأخرة غير متحققة",zoomIn:"تكبير +",zoomOut:"تصغير −",earlier:"← أقدم",later:"أحدث →",chartHelp:"اسحب للتنقل، وقرّب بإصبعين أو بعجلة الفأرة. المس الشمعة لعرض تفاصيلها. لوحة المفاتيح: + و − والأسهم، و Home لإعادة العرض.",candleVolume:"الحجم",refresh:"تحديث",settings:"الإعدادات",change24:"خلال 24 ساعة",liquidity:"السيولة المرصودة · DEX",marketCap:"القيمة السوقية · DEX",volume24:"حجم التداول 24 ساعة · USDT",high24:"أعلى سعر 24 ساعة · USDT",low24:"أدنى سعر 24 ساعة · USDT",forecastHorizon:"أفق التوقع",last24:"آخر 24 ساعة",candles:"شموع مغلقة",predicted:"توقع مسجّل",measured:"نتيجة مقاسة",nextForecast:"إسقاط آخر توقع",export:"تنزيل الشموع CSV",auditDetails:"سبب قرار المحرك وسجل التوقعات",language:"اللغة",timezone:"توقيت الرسم والبيانات",diagnostics:"فحص الاتصال",password:"تغيير كلمة المرور في Vercel",passwordHelp:"حدّث DASHBOARD_PASSWORD ثم أعد نشر التطبيق.",logout:"تسجيل الخروج",approved:"معتمد آليًا",experimental:"تجريبي آليًا",awaiting:"بانتظار قرار المحرك",live:"سعر مباشر",archive:"سعر مؤرشف",unavailable:"غير متاح",correct:"صحيح",wrong:"خاطئ",pending:"معلّق",unknown:"غير متحقق",approximate:"قياس تاريخي تقريبي",exact:"قياس عند الموعد",insufficientCandles:"لا توجد شموع مغلقة كافية لهذه الفترة",chartUnavailable:"تعذر تحميل محرك الرسم",target:"التوقع",due:"الموعد",reference:"المرجع",recordedAt:"صدر",observed:"تحقق",outcome:"النتيجة",decisionSource:"قرار محرك النماذج الداخلي",oldDecision:"قرار مؤرشف",noForecast:"لا يوجد توقع مسجّل لهذا الأفق",forecastExpired:"انتهى الأفق؛ تظهر النتيجة بعد تحقق القياس",model:"النموذج",samples:"نتائج مستقلة",forward:"اختبار زمني خارج التدريب",prospective:"نتائج مستقبلية تم التحقق منها",autoNote:"يعيد المحرك تقييم الاعتماد تلقائيًا؛ لا توجد موافقة يدوية في الواجهة."},
en:{inputsTitle:"Model inputs and how they were used",inputGroup:"Data group",inputUsed:"At forecast reference",inputAccess:"Current source access",inputCoverage:"Test coverage",used:"Available",missing:"Missing / excluded",regime:"Indicators and market regime",market:"BTC / ETH / SOL / ZEC",ticker:"Quote and turnover",orderbook:"Order book",trades:"Executed trades",dex:"DEX liquidity and value",onchain:"Supply, holders and burns",news:"News and verified evidence",project:"Verified project activity",macro:"Broad crypto market",derivatives:"Derivatives, OI and funding",feedback:"Verified previous forecast errors",assuranceTitle:"Production, output validity and rollout checks",streamLive:"MEXC stream connected",streamFallback:"Stream unavailable · automatic fallback",streamConnecting:"Connecting to MEXC stream",staleData:"Data delayed",dataSeconds:"seconds since last quote",forming:"Forming candle · excluded from model evaluation",closedOnly:"Completed candles; awaiting current candle stream",production:"Output integrity",quality:"Forecast validity",healthy:"Healthy",degraded:"Needs review",failed_evidence:"Quality test failed",insufficient_evidence:"Insufficient evidence",approved_research:"Approved for research",rolloutBlocked:"All-pair rollout is not approved: independent per-pair validation, load tests and data isolation are required.",forwardSamples:"Forward samples",verifiedSamples:"Independent prospective outcomes",skill:"Error improvement vs no change",direction:"Direction accuracy",interval:"95% interval",overdue:"Overdue unverified outcomes",zoomIn:"Zoom +",zoomOut:"Zoom −",earlier:"← Earlier",later:"Later →",chartHelp:"Drag to pan; pinch or use the wheel to zoom. Touch a candle for details. Keyboard: +, −, arrows; Home to reset.",candleVolume:"Volume",refresh:"Refresh",settings:"Settings",change24:"in 24 hours",liquidity:"Observed liquidity · DEX",marketCap:"Market cap · DEX",volume24:"24h turnover · USDT",high24:"24h high · USDT",low24:"24h low · USDT",forecastHorizon:"Forecast horizon",last24:"Last 24 hours",candles:"Closed candles",predicted:"Recorded forecast",measured:"Measured outcome",nextForecast:"Latest projection",export:"Export candles CSV",auditDetails:"Automatic decision and forecast audit",language:"Language",timezone:"Chart and data timezone",diagnostics:"Connection check",password:"Change password in Vercel",passwordHelp:"Update DASHBOARD_PASSWORD and redeploy.",logout:"Sign out",approved:"Automatically approved",experimental:"Automatically experimental",awaiting:"Awaiting engine decision",live:"Live quote",archive:"Archived quote",unavailable:"Unavailable",correct:"Correct",wrong:"Wrong",pending:"Pending",unknown:"Unverified",approximate:"Approximate historical measurement",exact:"Measured at target",insufficientCandles:"Insufficient completed candles for this interval",chartUnavailable:"Chart engine failed to load",target:"Prediction",due:"Target",reference:"Reference",recordedAt:"Issued",observed:"Observed",outcome:"Outcome",decisionSource:"Internal model engine decision",oldDecision:"Archived decision",noForecast:"No recorded forecast for this horizon",forecastExpired:"Target elapsed; outcome awaits verification",model:"Model",samples:"independent outcomes",forward:"Forward out-of-sample test",prospective:"Verified prospective outcomes",autoNote:"The engine reassesses approval automatically; the UI has no manual approval control."}};
const t=k=>words[lang][k]||k;
const copy=(ar,en)=>lang==="ar"?ar:en;
const ltr=value=>"\u2066"+value+"\u2069";
const stampFormatters=new Map();
const stamp=(value,exact=false)=>{
 const ms=typeof value==="number"?value:Date.parse(value);
 if(!Number.isFinite(ms))return "—";
 const key=lang+"|"+zone+"|"+exact;
 if(!stampFormatters.has(key))stampFormatters.set(key,new Intl.DateTimeFormat(lang==="ar"?"ar-IQ":"en-GB",{
  timeZone:zone,month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",...(exact?{second:"2-digit"}:{}),hour12:false,timeZoneName:"shortOffset"
 }));
 return stampFormatters.get(key).format(ms);
};
const FRAME_MS={"15m":900000,"30m":1800000,"1h":3600000,"2h":7200000,"4h":14400000,"6h":21600000,"12h":43200000,"1d":86400000,"1w":604800000};
const FRAME_SOURCE={"30m":"15m","2h":"1h","6h":"1h","12h":"1h","1w":"1d"};
function chartCandles(tf){
 const source=FRAME_SOURCE[tf]||tf,step=FRAME_MS[source],duration=FRAME_MS[tf],unique=new Map();
 for(const c of [...(data?.candles?.[source]||[]),...(closedLiveCandles.get(source)?.values()||[])]){
  const values=[c.o,c.h,c.l,c.c].map(n),time=n(c.t);
  if(time===null||time+step>Date.now()||values.some(v=>v===null||v<=0)||values[1]<Math.max(values[0],values[3])||values[2]>Math.min(values[0],values[3])||values[2]>values[1])continue;
  unique.set(time,{t:time,o:values[0],h:values[1],l:values[2],c:values[3],v:n(c.v)});
 }
 const bars=[...unique.values()].sort((a,b)=>a.t-b.t);if(!FRAME_SOURCE[tf])return bars;
 const groups=new Map(),expected=duration/step,origin=tf==="1w"?345600000:0;
 for(const c of bars){const start=Math.floor((c.t-origin)/duration)*duration+origin;if(start+duration>Date.now())continue;if(!groups.has(start))groups.set(start,[]);groups.get(start).push(c)}
 const result=[];
 for(const [time,items] of groups){if(items.length!==expected||items.some((c,i)=>c.t!==time+i*step))continue;result.push({t:time,o:items[0].o,h:Math.max(...items.map(c=>c.h)),l:Math.min(...items.map(c=>c.l)),c:items[items.length-1].c,v:items.every(c=>c.v!==null)?items.reduce((sum,c)=>sum+c.v,0):null})}
 return result.sort((a,b)=>a.t-b.t);
}
function chartTime(time){if(typeof time==="number")return time*1000;if(time&&typeof time==="object")return Date.UTC(time.year,time.month-1,time.day);return Date.parse(time)}
function formatChartTime(time,short=false){const ms=chartTime(time);if(!Number.isFinite(ms))return "";return new Intl.DateTimeFormat("en-GB",{timeZone:zone,...(short?{hour:"2-digit",minute:"2-digit",hour12:false}:{month:"short",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false})}).format(new Date(ms))}
function initChart(){
 if(chart)return true;
 const L=window.LightweightCharts;if(!L?.createChart){el("chartEmpty").hidden=false;set("chartEmpty",t("chartUnavailable"));return false}
 chart=L.createChart(el("chart"),{autoSize:true,layout:{background:{type:"solid",color:"#10161e"},textColor:"#a3b0c1",attributionLogo:false,fontFamily:"system-ui, sans-serif"},grid:{vertLines:{color:"#1a2330"},horzLines:{color:"#242e3c"}},rightPriceScale:{borderColor:"#243347",scaleMargins:{top:.08,bottom:.22}},timeScale:{borderColor:"#243347",timeVisible:true,secondsVisible:false,rightOffset:6,tickMarkFormatter:(time,type)=>formatChartTime(time,type>2)},localization:{locale:"en-US",timeFormatter:time=>formatChartTime(time)},crosshair:{mode:L.CrosshairMode.Normal},handleScroll:{mouseWheel:true,pressedMouseMove:true,horzTouchDrag:true,vertTouchDrag:false},handleScale:{axisPressedMouseMove:true,mouseWheel:true,pinch:true}});
 candleSeries=chart.addSeries(L.CandlestickSeries,{upColor:"#5ad9a4",downColor:"#ff909d",borderVisible:false,wickUpColor:"#5ad9a4",wickDownColor:"#ff909d",priceFormat:{type:"price",precision:8,minMove:.00000001}});
 volumeSeries=chart.addSeries(L.HistogramSeries,{priceScaleId:"",priceFormat:{type:"volume"},priceLineVisible:false,lastValueVisible:false});volumeSeries.priceScale().applyOptions({scaleMargins:{top:.83,bottom:0}});
 const options={priceFormat:{type:"price",precision:8,minMove:.00000001},priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:true,lineWidth:2,pointMarkersVisible:true,pointMarkersRadius:3};
 predictedSeries=chart.addSeries(L.LineSeries,{...options,color:"#f1c781",lineStyle:L.LineStyle.Dashed,title:t("predicted")});
 measuredSeries=chart.addSeries(L.LineSeries,{...options,color:"#8cc8fb",title:t("measured")});
 projectionSeries=chart.addSeries(L.LineSeries,{...options,color:"#c4a7ff",lineStyle:L.LineStyle.Dashed,title:t("nextForecast")});
 if(window.StampTechnical&&candleSeries.attachPrimitive&&L.createSeriesMarkers)chartLayers=new window.StampTechnical.Layers(chart,candleSeries,L);
 if(window.StampEvents&&L.createSeriesMarkers)eventMarkers=L.createSeriesMarkers(candleSeries,[]);
 chart.timeScale().subscribeVisibleTimeRangeChange?.(range=>{if(range){el("chart").dataset.visibleFrom=String(range.from);el("chart").dataset.visibleTo=String(range.to)}});
 const inspect=param=>{
  inspectingChart=!!param.time;
  if(!param.time)return;
  const c=param.seriesData?.get(candleSeries),v=param.seriesData?.get(volumeSeries),parts=[formatChartTime(param.time)];
  if(c&&n(c.close)!==null)parts.push("O "+price(c.open)+" H "+price(c.high)+" L "+price(c.low)+" C "+price(c.close));
  if(v&&n(v.value)!==null)parts.push(t("candleVolume")+" "+number(v.value));
  for(const [series,label] of [[predictedSeries,"predicted"],[measuredSeries,"measured"],[projectionSeries,"nextForecast"]]){const point=param.seriesData?.get(series);if(point&&n(point.value)!==null)parts.push(t(label)+" "+price(point.value))}
  if(parts.length>1)set("chartOHLC",parts.join(" · "));
 };
 chart.subscribeCrosshairMove(inspect);
 chart.subscribeClick?.(param=>{
  inspect(param);
  if(typeof param.time==="number"&&param.seriesData?.get(candleSeries)){
   eventSelection=param.time*1000;
   renderChartEvents();
  }
 });
 return true;
}
function uniquePoints(points){const values=new Map();for(const p of points){if(Number.isFinite(p.time)&&p.time>0&&n(p.value)>0)values.set(p.time,{time:p.time,value:Number(p.value)})}return [...values.values()].sort((a,b)=>a.time-b.time)}
function navigateChart(action){
 if(!chart||currentBars.length<2)return;
 const scale=chart.timeScale(),range=scale.getVisibleLogicalRange?.();
 if(!range||!Number.isFinite(range.from)||!Number.isFinite(range.to))return;
 const width=range.to-range.from,center=(range.from+range.to)/2;
 if(action==="in"||action==="out"){
  const next=Math.max(8,Math.min(10000,width*(action==="in"?.7:1/.7)));
  scale.setVisibleLogicalRange({from:center-next/2,to:center+next/2});
 }else{const shift=width*.25*(action==="earlier"?-1:1);scale.setVisibleLogicalRange({from:range.from+shift,to:range.to+shift})}
}
function resetChartRange(includeTechnical=false){
 if(!chart||currentBars.length<2)return;
 const first=currentBars[0].t,last=currentBars[currentBars.length-1].t+FRAME_MS[frame];
 if(replay){
  chart.timeScale().setVisibleRange({from:currentBars[Math.max(0,currentBars.length-72)].t/1000,to:(last+FRAME_MS[frame]*2)/1000});
  return;
 }
 const f=data?.asset_research_forecasts?.[frame]||data?.forecasts?.[horizon]?.forecast;
 const due=f?Date.parse(f.due_at_utc):0,future=Number.isFinite(due)&&due>last?due:last;
 const lookback=Math.max(86400000,future-last);
 const from=Math.max(first,Math.min(last-lookback,includeTechnical===true?technicalStart??last:last)),to=future+FRAME_MS[frame]*2;
 if(to>from)chart.timeScale().setVisibleRange({from:Math.floor(from/1000),to:Math.floor(to/1000)});else chart.timeScale().fitContent();
}
function candleFresh(candle){
 const seconds=age(candle?.observed_utc),now=Date.now();
 return candle&&seconds!==null&&seconds<=15&&candle.t<=now&&candle.end>now;
}
function activeCandle(){
 const direct=liveCandles.get(frame),duration=FRAME_MS[frame],origin=frame==="1w"?345600000:0;
 if(candleFresh(direct)&&(direct.t-origin)%duration===0)return direct;
 const source=FRAME_SOURCE[frame],tail=liveCandles.get(source);
 if(!source||!candleFresh(tail))return null;
 const step=FRAME_MS[source],start=Math.floor((tail.t-origin)/duration)*duration+origin;
 const parts=[...chartCandles(source).filter(bar=>bar.t>=start&&bar.t<tail.t),tail];
 if(parts.some((bar,i)=>bar.t!==start+i*step))return null;
 return {t:start,o:parts[0].o,c:tail.c,h:Math.max(...parts.map(bar=>bar.h)),l:Math.min(...parts.map(bar=>bar.l)),
  v:parts.every(bar=>bar.v!==null)?parts.reduce((sum,bar)=>sum+bar.v,0):null,
  end:start+duration,observed_utc:tail.observed_utc,transport:tail.transport};
}


let venueTopology=null;
const camera={yaw:-.28,pitch:.2,zoom:1,auto:false};
let sceneDrag=null,sceneAnimation=0;
const sceneVenues=["MEXC","Binance","OKX","Bybit","KuCoin","Gate","Bitget"];
let sceneFocus="validation",sceneObservation="",sceneUpdated=0;
const sceneStages=[
 ["validation","التحقق","Validation"],
 ["model","النموذج","Model"],
 ["display","اللوحة","Dashboard"]
];
function sceneVenueState(quote){
 if(quote?.status!=="ok")return "missing";
 return (age(quote.retrieved_at_utc)??Infinity)>120?"late":"ready";
}
function inspectScene(id,load=false){
 sceneFocus=id;
 const topology=venueTopology?.symbol===selectedAsset?venueTopology:null;
 const quote=topology?.venues[id];
 const status=sceneVenueState(quote);
 const rows=[];
 if(sceneVenues.includes(id)){
  rows.push([copy("المنصة","Exchange"),id+" · "+selectedAsset]);
  rows.push([copy("الحالة","Status"),status==="ready"?copy("متاح","Available"):status==="late"?copy("آخر رصد متأخر","Delayed observation"):quote?.reason||copy("بانتظار الرصد","Awaiting data")]);
  if(quote?.status==="ok")rows.push(["Bid / Ask",price(quote.bid)+" / "+price(quote.ask)+" USDT"],[copy("الفارق","Spread"),pct(quote.spread_pct)],[copy("وقت الجلب","Retrieved"),stamp(quote.retrieved_at_utc,true)]);
  if(load){el("venueSelect").value=id;loadMicrostructure(id)}
 }else if(id==="validation"){
  rows.push([copy("الأسعار المستلمة","Quotes received"),topology?topology.available_venues+" / "+sceneVenues.length:"—"]);
  rows.push([copy("هوية الأصل","Asset identity"),topology?.identity_status==="verified_major_pair"?copy("زوج رئيسي معروف","Recognized major pair"):copy("المطابقة بين المنصات غير مؤكدة","Cross-venue identity unverified")]);
  rows.push([copy("تباعد الأسعار الوسطية","Midpoint dispersion"),n(topology?.mid_dispersion_pct)===null?"—":pct(topology.mid_dispersion_pct)]);
 }else if(id==="model"){
  const decision=data?.model_decisions?.[horizon], forecast=data?.forecasts?.[horizon], projection=forecast?.forecast;
  rows.push([copy("مصدر شموع النموذج","Model candle source"),"MEXC"],[t("model"),decision?.selected_model||"—"],
   [t("forecastHorizon"),horizon],[t("nextForecast"),n(projection?.predicted_price)===null?"—":price(projection.predicted_price)+" USDT"],
   [t("due"),stamp(projection?.due_at_utc)],[t("decisionSource"),decision?stamp(decision.decided_at_utc):"—"]);
  if(decision)rows.push([t("quality"),decision.status==="approved"?t("approved"):t("experimental")],
   [t("skill"),n(decision.forward_validation?.skill_vs_zero)===null?"—":pct(decision.forward_validation.skill_vs_zero*100)],
   [copy("أسباب القرار","Decision reasons"),(decision.reason_codes||[]).map(code=>reasonText[code]?.[lang==="ar"?0:1]||code).join(" · ")||"—"]);
  if(forecast?.selected_feature_groups?.length)rows.push([t("inputsTitle"),forecast.selected_feature_groups.map(t).join(" · ")]);
 }else{
  rows.push([copy("الزوج","Pair"),selectedAsset],[copy("إغلاق الشموع","Closed candles"),stamp(data?.observed_utc)],
   [copy("آخر سعر ظاهر","Displayed price"),el("price").textContent],[copy("رصد سيولة DEX","DEX liquidity observation"),stamp(data?.liquidity?.observed_utc)]);
 }
 const detail=el("sceneNodeDetail");
 const markup="<dl>"+rows.map(([label,value])=>"<div><dt>"+esc(label)+"</dt><dd>"+esc(value)+"</dd></div>").join("")+"</dl>";
 if(detail&&detail.innerHTML!==markup)detail.innerHTML=markup;
}
function renderSceneTimeline(){
 const list=el("sceneTimeline");
 if(!list)return;
 const archive=selectedAsset==="STAMPUSDT"?operationsReport?.events?.records||[]:[];
 const records=new Map([...archive,...(eventPayload?.records||[])].filter(e=>e.symbol===selectedAsset).map(e=>[e.id,e]));
 const eventLabels={buy:copy("صفقة شراء","Buy execution"),sell:copy("صفقة بيع","Sell execution"),
  liquidity_add:copy("إضافة سيولة","Liquidity deposit"),liquidity_remove:copy("سحب سيولة","Liquidity withdrawal"),
  burn:copy("حرق","Burn")};
 const entries=[...records.values()].map(e=>({time:e.time_ms,label:eventLabels[e.kind==="trade"?e.side:e.kind],
  detail:n(e.notional)===null?(e.source||""):number(e.notional)+" USDT"}));
 for(const row of data?.forecast_review?.rows||[]){
  if(row.horizon!==horizon)continue;
  entries.push({time:Date.parse(row.created_utc),label:t("predicted"),detail:price(row.predicted_price)+" USDT"});
  if(n(row.actual_price)>0)entries.push({time:Date.parse(row.evaluated_utc),label:t("measured"),
   detail:price(row.actual_price)+" USDT · "+t("target")+" "+price(row.predicted_price)});
 }
 const recent=entries.filter(e=>Number.isFinite(e.time)&&e.label).sort((a,b)=>b.time-a.time).slice(0,14);
 const markup=recent.length?recent.map(e=>'<li><button type="button" data-scene-time="'+e.time+'"><strong>'+esc(e.label)+'</strong><span>'+esc(e.detail)+'</span><time>'+esc(stamp(e.time,true))+'</time></button></li>').join(""):
  '<li class="muted">'+esc(copy("لا أحداث موثقة متاحة للزوج حاليًا","No recorded events currently available for this pair"))+'</li>';
 if(list.innerHTML!==markup)list.innerHTML=markup;
}
function drawNeuralScene(){
 const scene=el("venueNetwork");
 if(!scene||typeof document.createElementNS!=="function")return;
 const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
 svg.setAttribute("viewBox","0 0 820 436");
 svg.setAttribute("aria-label",copy("شبكة بيانات الزوج ومراحل المعالجة","Pair data and processing stages"));
 const mk=(tag,attrs,txt,parent=svg)=>{
  const node=document.createElementNS(svg.namespaceURI,tag);
  for(const [key,value] of Object.entries(attrs))node.setAttribute(key,String(value));
  if(txt!==undefined)node.textContent=txt;
  parent.appendChild(node);
  return node;
 };
 const yaw=Math.sin(camera.yaw),pitch=Math.sin(camera.pitch), zoom=Math.min(1.28,camera.zoom);
 const project=(x,y,z=0)=>[410+(x+z*yaw*.56)*zoom,212+(y+z*pitch*.38)*zoom];
 for(let z=-140;z<=140;z+=35){
  const [x1,y1]=project(-345,112+z*.31,z),[x2,y2]=project(345,112+z*.31,z);
  mk("line",{x1,y1,x2,y2,stroke:"#20344a"});
 }
 for(let x=-320;x<=320;x+=64){
  const [x1,y1]=project(x,68,-140),[x2,y2]=project(x,155,140);
  mk("line",{x1,y1,x2,y2,stroke:"#20344a"});
 }
 const topology=venueTopology?.symbol===selectedAsset?venueTopology:null;
 const time=topology?.retrieved_at_utc;
 if(time&&time!==sceneObservation){sceneObservation=time;sceneUpdated=Date.now()}
 const stages=sceneStages.map(([id,ar,en],index)=>({id,label:copy(ar,en),point:project(-42+index*156,-7+index*20,28)}));
 const sources=sceneVenues.map((id,i)=>({id,label:id,point:project(-260+(i%2)*24,-152+i*49,(i%2?35:-35)),quote:topology?.venues[id]}));
 for(const source of sources){
  const [x,y]=source.point,[ex,ey]=stages[0].point,state=sceneVenueState(source.quote);
  const color=state==="ready"?"#53c5ad":state==="late"?"#e5b460":"#435873";
  const link=mk("path",{d:"M "+(x+62)+" "+y+" C "+(x+114)+" "+y+", "+(ex-95)+" "+ey+", "+(ex-62)+" "+ey,
   stroke:color,fill:"none","stroke-width":source.id==="MEXC"?2:1,"stroke-dasharray":source.id==="MEXC"&&state==="ready"?"none":"4 5"});
  if(state==="ready"&&Date.now()-sceneUpdated<1200&&!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)
   mk("animate",{attributeName:"opacity",values:".3;1",dur:".8s"},undefined,link);
 }
 const [model,dashboard]=stages.slice(1);
 const mexc=sources[0].point;
 mk("path",{d:"M "+(mexc[0]+62)+" "+(mexc[1]-10)+" Q 410 4 "+model.point[0]+" "+(model.point[1]-23),
  stroke:"#a79cf8",fill:"none","stroke-width":1.5});
 mk("path",{d:"M "+(model.point[0]+62)+" "+model.point[1]+" L "+(dashboard.point[0]-62)+" "+dashboard.point[1],stroke:"#a79cf8","stroke-dasharray":"3 5"});
 for(const card of [...sources,...stages]){
  const [x,y]=card.point,venue=sceneVenues.includes(card.id),state=venue?sceneVenueState(card.quote):"stage";
  const color=state==="ready"?"#69dfbf":state==="late"?"#efbe72":state==="stage"?"#baaaff":"#899bb3";
  const sub=venue?(card.quote?.status==="ok"?price(card.quote.mid)+" · "+pct(card.quote.spread_pct):copy("غير متاح","Unavailable")):
   card.id==="model"?"MEXC · "+horizon:card.id==="validation"?(topology?.available_venues??"—")+" / 7":selectedAsset;
  const group=mk("g",{tabindex:0,role:"button","aria-label":card.label,"data-scene-node":card.id,transform:"translate("+x+" "+y+")"});
  mk("path",{d:"M-62 -19 l10 -8 h124 l-10 8 v38 l10 -8 v-38",fill:"#28405a",stroke:"#3d536a"},undefined,group);
  mk("rect",{x:-62,y:-19,width:124,height:38,rx:5,fill:"#121f31",stroke:color},undefined,group);
  mk("text",{x:-52,y:-4,fill:color,"font-size":12,"font-weight":700},card.label,group);
  mk("text",{x:-52,y:11,fill:"#d4deed","font-size":10},sub,group);
  const select=()=>inspectScene(card.id,venue);
  group.addEventListener("click",select);
  group.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();select()}});
 }
 scene.replaceChildren(svg);
 inspectScene(sceneFocus);
 renderSceneTimeline();
}
function initializeSceneControls(){
 const scene=el("venueNetwork");
 if(!scene)return;
 el("sceneTimeline")?.addEventListener("click",event=>{
  const button=event.target.closest("[data-scene-time]");
  if(!button)return;
  const at=Number(button.dataset.sceneTime);
  const bars=chartCandles(frame);
  const bar=bars.find(c=>c.t<=at&&at<c.t+FRAME_MS[frame]);
  if(!bar){
   button.querySelector("time").textContent=copy("خارج نطاق الشموع المغلقة المحمّلة","Outside loaded closed candles");
   return;
  }
  el("tradeTab").click();
  stopReplay();
  renderChart();
  focusEventCandle(bar.t);
 });
 scene.addEventListener("pointerdown",event=>{
  if(event.button!==0)return;
  sceneDrag={x:event.clientX,y:event.clientY,yaw:camera.yaw,pitch:camera.pitch};
  camera.auto=false;
  el("sceneAuto").setAttribute("aria-pressed","false");
 });
 scene.addEventListener("pointermove",event=>{
  if(!sceneDrag||Math.abs(event.clientX-sceneDrag.x)+Math.abs(event.clientY-sceneDrag.y)<4)return;
  scene.setPointerCapture(event.pointerId);
  camera.yaw=sceneDrag.yaw+(event.clientX-sceneDrag.x)*.008;
  camera.pitch=Math.max(-1.1,Math.min(1.1,sceneDrag.pitch+(event.clientY-sceneDrag.y)*.006));
  drawNeuralScene();
 });
 for(const type of ["pointerup","pointercancel","pointerleave"])scene.addEventListener(type,()=>{sceneDrag=null});
 scene.addEventListener("wheel",event=>{
  if(document.activeElement!==scene)return;
  event.preventDefault();
  camera.zoom=Math.max(.55,Math.min(2.1,camera.zoom*(event.deltaY>0?.92:1.08)));
  drawNeuralScene();
 },{passive:false});
 scene.addEventListener("keydown",event=>{
  if(event.key==="ArrowLeft")camera.yaw-=.12;
  else if(event.key==="ArrowRight")camera.yaw+=.12;
  else if(event.key==="ArrowUp")camera.pitch=Math.max(-1.1,camera.pitch-.12);
  else if(event.key==="ArrowDown")camera.pitch=Math.min(1.1,camera.pitch+.12);
  else if(event.key==="+")camera.zoom=Math.min(2.1,camera.zoom*1.1);
  else if(event.key==="-")camera.zoom=Math.max(.55,camera.zoom*.9);
  else return;
  event.preventDefault();
  drawNeuralScene();
 });
 el("sceneReset").addEventListener("click",()=>{
  Object.assign(camera,{yaw:-.28,pitch:.2,zoom:1,auto:false});
  el("sceneAuto").setAttribute("aria-pressed","false");
  drawNeuralScene();
 });
 el("sceneAuto").addEventListener("click",()=>{
  camera.auto=!camera.auto;
  el("sceneAuto").setAttribute("aria-pressed",String(camera.auto));
  if(!camera.auto||sceneAnimation)return;
  let previous=0;
  const spin=time=>{
   if(!camera.auto){sceneAnimation=0;return}
   if(!document.hidden&&!el("venuesSection").hidden&&time-previous>75){
    camera.yaw+=.009;
    drawNeuralScene();
    previous=time;
   }
   sceneAnimation=requestAnimationFrame(spin);
  };
  sceneAnimation=requestAnimationFrame(spin);
 });
 drawNeuralScene();
}

let venuePollId=0;
async function updateVenueNetwork(){
 const symbol=selectedAsset,requestId=++venuePollId;
 const status=el("venueNetworkStatus"),metrics=el("venueMetrics"),scene=el("venueNetwork");
 if(!status||!scene)return;
 status.textContent=copy("فحص أسعار ","Checking prices for ")+symbol+"…";
 let payload;
 try{
  const response=await fetch("/api/assets/venues?symbol="+encodeURIComponent(symbol),{credentials:"same-origin",cache:"no-store"});
  if(!response.ok)throw Error("HTTP "+response.status);
  payload=await response.json();
  if(!payload||!payload.venues||typeof payload.available_venues!=="number")throw Error("invalid_venue_payload");
  if(requestId!==venuePollId||symbol!==selectedAsset)return;
  if(!payload.symbol)payload.symbol=symbol;
  if(payload.symbol!==symbol)throw Error("pair_mismatch");
 }catch(err){if(requestId===venuePollId){
  venueTopology=null;
  drawNeuralScene();
  status.textContent=copy("تعذّر تحديث المنصات","Could not refresh exchanges");
  metrics.textContent=err.message;
 }return}
 venueTopology=payload;
 set("mapVenues",payload.available_venues+" / "+Object.keys(payload.venues).length+" · "+copy("مصادر استجابت","sources responded"));
 drawNeuralScene();
 status.textContent=ltr(symbol)+" · "+copy("المصادر المتاحة ","Sources available ")+ltr(payload.available_venues+" / "+Object.keys(payload.venues).length)+" · "+stamp(payload.retrieved_at_utc);
 metrics.replaceChildren();
 for(const [name,v] of Object.entries(payload.venues||{})){const item=document.createElement("span");item.textContent=name+": "+(v.status==="ok"?"Bid "+v.bid+" / Ask "+v.ask+" · "+(v.deviation_from_median_pct===null?"هوية غير مثبتة":v.deviation_from_median_pct+"%"):"غير متاح ("+v.reason+")");metrics.appendChild(item)}
 const spread=document.createElement("span");spread.textContent="تباعد الأسعار الوسطية: "+(payload.mid_dispersion_pct===null?"غير معتمد: هوية الأصل غير مؤكدة أو بيانات غير كافية":payload.mid_dispersion_pct.toFixed(3)+"%");metrics.appendChild(spread);
 const identity=document.createElement("span");identity.textContent="هوية الأصل بين المنصات: "+(payload.identity_status==="verified_major_pair"?"زوج رئيسي":"غير مثبتة — لا تعتمد فروقات السعر");metrics.appendChild(identity);
}

let microRequest=0;
async function loadMicrostructure(venue){
 const symbol=selectedAsset, id=++microRequest;
 const root=el("microMetrics");
 root.replaceChildren();
 set("microStatus",venue+" · "+symbol+" · "+copy("جارٍ جلب البيانات","Loading"));
 try{
  const query=new URLSearchParams({symbol,venue});
  const response=await fetch("/api/assets/microstructure?"+query,{credentials:"same-origin",cache:"no-store"});
  if(!response.ok)throw Error("HTTP "+response.status);
  const payload=await response.json();
  if(id!==microRequest||symbol!==selectedAsset)return;
  if(payload.symbol!==symbol||payload.venue!==venue)throw Error("Invalid response");
  const {book,candles}=payload.result;
  const rows=candles.status==="ok"?candles.data.slice(-32):[];
  const summary=[venue,symbol];
  if(book.status==="ok")summary.push(stamp(book.retrieved_at_utc));
  else summary.push(copy("دفتر الأوامر غير متاح","Order book unavailable"));
  if(payload.identity_status==="unverified_cross_venue_asset_identity")summary.push(copy("هوية العقد بين المنصات غير مؤكدة","Cross-exchange asset identity unverified"));
  set("microStatus",summary.join(" · "));
  if(book.status==="ok"){
   const depth=book.data;
   const stats=[
    [copy("عمق الشراء · USDT","Bid depth · USDT"),number(depth.bid_depth_usdt)],
    [copy("عمق البيع · USDT","Ask depth · USDT"),number(depth.ask_depth_usdt)],
    [copy("فارق السعر","Spread"),pct(depth.spread_pct)]
   ];
   const levels=Array.from({length:Math.min(5,depth.levels)},(_,i)=>{
    const bid=depth.bids[i],ask=depth.asks[i];
    return "<tr><td>"+esc(price(bid.price))+"</td><td>"+esc(number(bid.quantity))+
     "</td><td>"+esc(price(ask.price))+"</td><td>"+esc(number(ask.quantity))+"</td></tr>";
   });
   root.innerHTML='<dl class="micro-stats">'+stats.map(([label,value])=>"<div><dt>"+esc(label)+"</dt><dd dir=\"ltr\">"+esc(value)+"</dd></div>").join("")+
    '</dl><div class="history-table"><table><thead><tr><th>'+copy("سعر الشراء","Bid")+"</th><th>"+copy("الكمية","Size")+
    "</th><th>"+copy("سعر البيع","Ask")+"</th><th>"+copy("الكمية","Size")+"</th></tr></thead><tbody>"+levels.join("")+"</tbody></table></div>";
  }
  if(book.status==="ok"){
   const {bid_depth_usdt:bid,ask_depth_usdt:ask,levels}=book.data;
   if(n(bid)>=0&&n(ask)>=0&&bid+ask>0){
    const caption=copy("حصة الشراء من قيمة المستويات المعروضة","Bid share of sampled depth");
    root.insertAdjacentHTML("afterbegin",'<div class="scene-depth"><span>'+esc(caption)+' · '+esc(levels)+'</span><meter min="0" max="1" value="'+(bid/(bid+ask))+'" aria-label="'+esc(caption)+'"></meter></div>');
   }
  }
  if(rows.length>1)renderMicroCandles(root,rows);
 }catch(error){
  if(id===microRequest&&symbol===selectedAsset)set("microStatus",copy("تعذّر جلب العمق","Could not load depth")+" · "+error.message);
 }
}
function renderMicroCandles(root,rows){
 const high=Math.max(...rows.map(row=>row.h)),low=Math.min(...rows.map(row=>row.l));
 const width=560,height=104,pad=10;
 const y=value=>height-pad-(value-low)/(high-low||high*.001)*(height-pad*2);
 const shapes=rows.map((row,index)=>{
  const x=pad+(width-2*pad)*(index+.5)/rows.length;
  const open=y(row.o),close=y(row.c),color=row.c>=row.o?"#5ad9a4":"#ff909d";
  return '<line x1="'+x+'" x2="'+x+'" y1="'+y(row.h)+'" y2="'+y(row.l)+'" stroke="'+color+'"/>'+
   '<rect x="'+(x-3)+'" width="6" y="'+Math.min(open,close)+'" height="'+Math.max(1,Math.abs(open-close))+'" fill="'+color+'"/>';
 });
 const chart=document.createElement("div");
 chart.className="micro-chart";
 chart.innerHTML='<svg viewBox="0 0 '+width+' '+height+'" role="img" aria-label="'+copy("شموع 15 دقيقة للمنصة المختارة","15-minute candles for the selected exchange")+'">'+shapes.join("")+"</svg>";
 root.appendChild(chart);
}

async function auditVenueConnections(){
 const target=el("connectorAudit"),engine=el("engineAudit"),button=el("auditVenues");
 if(!target)return;
 const pair=selectedAsset;target.textContent="جارٍ فحص الاتصال الفعلي بالمنصات…";
 if(button)button.disabled=true;
 try{
  const res=await fetch("/api/assets/diagnostics?symbol="+encodeURIComponent(pair),{credentials:"same-origin",cache:"no-store"});
  if(!res.ok)throw Error("HTTP "+res.status);
  const d=await res.json();
  if(pair!==selectedAsset)return;
  target.replaceChildren();
  for(const v of d.connectors||[]){
   const item=document.createElement("div");item.className="nexus-connector "+(v.connected?"connected":"disconnected");
   const name=document.createElement("strong");name.textContent=v.venue;
   const state=document.createElement("span");state.textContent=v.connected?"متصل":"غير متاح";
   const detail=document.createElement("small");detail.textContent=v.connected?"Bid "+v.bid+" / Ask "+v.ask+" · "+v.retrieved_at_utc:"فشل الاتصال: "+v.error;
   item.append(name,state,detail);target.appendChild(item);
  }
  if(engine)engine.textContent="نجاح الموصلات: "+d.connected+"/"+d.total+" | مصادر الشموع المستخدمة في المحرك: "+d.analysis_source+" | حالة النموذج: "+d.model_status+" | دمج متعدد المنصات: "+(d.cross_venue_ingestion?"مفعّل":"غير منفذ")+" | هوية الأصل: "+d.identity_status;
 }catch(err){target.textContent="تعذر إتمام اختبار المنصات: "+err.message;if(engine)engine.textContent="لا توجد نتيجة فحص موثقة."}
 finally{if(button)button.disabled=false}
}

function renderDepth(){
 const scene=el("depthScene");if(!scene)return;
 const bars=visibleCandles().slice(-32).filter(x=>Number.isFinite(x.c)&&x.c>0);
 if(!bars.length){scene.replaceChildren();set("depthLabel","لا توجد شموع صالحة");return}
 const lo=Math.min(...bars.map(x=>x.c)),hi=Math.max(...bars.map(x=>x.c)),range=hi-lo||Math.max(hi*.005,1e-12);
 const frag=document.createDocumentFragment();for(const bar of bars){const node=document.createElement("div");node.className="depth-column";const rising=bar.c>=bar.o;node.style.setProperty("--height",(14+160*(bar.c-lo)/range).toFixed(1)+"px");node.style.setProperty("--face",rising?"#32a78b":"#cb6479");node.style.setProperty("--side",rising?"#1c6c62":"#81384c");node.style.setProperty("--top",rising?"#6de4c0":"#f29aab");node.title=new Date(bar.t).toISOString()+" | Close: "+bar.c;frag.appendChild(node)}scene.replaceChildren(frag);
 set("depthLabel",selectedAsset+" · "+frame+" · "+bars.length+" شمعة");
}
function renderTechnical(){
 const panel=el("technicalDetails");
 if(!panel||!chartLayers)return;
 const result=chartLayers.render(currentBars,FRAME_MS[frame],frame,enabledLayers);
 Object.assign(el("chart").dataset,{ichimokuPoints:String(result.cloud),fibonacciLevels:String(result.fibonacci?.levels.length||0),elliottCounts:String(result.elliott.length)});
 panel.hidden=enabledLayers.size===0;
 const starts=[result.fibonacci?.start.time,...result.elliott.map(count=>count.points[0].time)].filter(Number.isFinite);
 technicalStart=starts.length?Math.min(...starts)*1000:null;
 const reading=(key,title,body)=>'<div class="technical-reading" data-kind="'+key+'"><strong>'+esc(title)+'</strong>'+body+'</div>';
 const label=text=>"<span>"+esc(text)+"</span>";
 const value=text=>"<bdi>"+esc(text)+"</bdi>";
 const notes=[];
 if(enabledLayers.has("ichimoku")){
  notes.push(reading("ichimoku",copy("إيشيموكو","Ichimoku"),label(result.cloud
   ? copy("9 / 26 / 52 · حدود السحابة مزاحة 26 فترة","9 / 26 / 52 · cloud boundaries shifted 26 periods")
   : copy("تتطلب السحابة 52 شمعة مغلقة متتالية","The cloud needs 52 consecutive closed candles"))));
 }
 if(enabledLayers.has("fibonacci")){
  const fib=result.fibonacci;
  const levels=fib?'<div class="technical-levels">'+fib.levels.map(level=>'<bdi class="'+([.382,.618].includes(level.ratio)?"key-level":"")+'">'+
   esc((level.ratio*100).toFixed(1).replace(/\.0$/,"")+"% · "+price(level.price))+"</bdi>").join("")+"</div>":"";
  notes.push(reading("fibonacci",copy("فيبوناتشي","Fibonacci"),fib
   ? label(copy("آخر حركة بين محورين مؤكدين","Last confirmed swing"))+value(price(fib.start.price)+" → "+price(fib.end.price))+label(stamp(fib.end.time*1000))+levels
   : label(copy("المحاور السعرية المتاحة غير كافية","Insufficient confirmed price pivots"))));
 }
 if(enabledLayers.has("elliott")){
  const waves=result.elliott.map((count,i)=>{
   const countLabel=i?copy("عدّ بديل","Alternate"):copy("العدّ الأساسي","Primary");
   const direction=count.sign===1?copy("صاعد","Upward"):copy("هابط","Downward");
   const state=count.invalidation===null?copy("اكتمل العدّ","Complete"):copy("الإبطال ","Invalidation ")+ltr(price(count.invalidation));
   return '<span class="wave-count'+(i?" alt":"")+'">'+esc(countLabel+" · "+direction+" · "+copy("حتى الموجة ","Through wave ")+(count.points.length-1)+" · "+state+" · ")+esc(stamp(count.points.at(-1).time*1000))+"</span>";
  });
  const description=frame==="1h"||frame==="4h"
   ? copy("عدّ آلي من محاور الشموع المغلقة","Automated count from closed-candle pivots")
   : copy("اعرض العدّ على إطار الساعة أو 4 ساعات","Select the 1h or 4h timeframe");
  notes.push(reading("elliott",copy("موجات إليوت","Elliott waves"),label(description)+
   (waves.join("")||((frame==="1h"||frame==="4h")?label(copy("لا يوجد عدّ يستوفي شروط الاندفاع القياسي","No count meets the standard impulse rules")):""))));
 }
 if(panel.innerHTML!==notes.join(""))panel.innerHTML=notes.join("");
}
const plottedCandle=c=>({time:c.t/1000,open:c.o,high:c.h,low:c.l,close:c.c});
const plottedVolume=c=>({time:c.t/1000,value:c.v,color:c.c>=c.o?"#4bd0a040":"#f0869440"});
function paintCandleContext(last,forming){
 const node=el("chart");
 node.dataset.forming=String(!!forming);
 node.dataset.candleSource=forming?.transport||"closed";
 set("activeCandle",forming?t("forming")+" · "+(forming.transport==="rest"?copy("تحديث احتياطي","REST"):"WebSocket")+" · "+stamp(forming.observed_utc):t("closedOnly"));
 if(last&&!inspectingChart)set("chartOHLC",formatChartTime(last.t/1000)+" · O "+price(last.o)+" H "+price(last.h)+" L "+price(last.l)+" C "+price(last.c));
}
function paintCandleEvidence(bars,records){
 const root=el("evidenceTrail");
 if(!root)return;
 const bar=bars.find(item=>item.t===eventSelection)||bars.at(-1);
 const end=bar?bar.t+FRAME_MS[frame]:null;
 const closed=!!bar&&end<=Date.now();
 const cutoff=closed?end:Date.now();
 set("evidencePeriod",bar?selectedAsset+" · "+frame+" · "+stamp(bar.t,true)+" → "+stamp(end,true)+
  (closed?"":" · "+copy("شمعة جارية","Open candle")):copy("بانتظار الشموع","Waiting for candles"));
 const matches=bar?records.filter(event=>event.symbol===selectedAsset&&event.time_ms>=bar.t&&event.time_ms<end&&event.time_ms<=cutoff):[];
 const forecasts=(data?.forecast_review?.rows||[]).filter(row=>{
  const issued=Date.parse(row.created_utc),due=Date.parse(row.due_utc);
  return bar&&row.horizon===horizon&&issued<cutoff&&due>=bar.t&&n(row.predicted_price)>0;
 }).sort((a,b)=>Date.parse(b.created_utc)-Date.parse(a.created_utc));
 const forecast=forecasts[0], actual=n(forecast?.actual_price), evaluated=Date.parse(forecast?.evaluated_utc);
 const known=forecast&&actual>0&&Number.isFinite(evaluated)&&(!replay||
  Math.max(evaluated,Date.parse(forecast.measurement_time_utc))<=cutoff);
 const metric=(label,value)=>[label,value];
 const candles=bar?[
  metric(copy("الافتتاح ← الإغلاق","Open → close"),price(bar.o)+" → "+price(bar.c)+" USDT"),
  metric(copy("التغيّر","Change"),pct((bar.c/bar.o-1)*100)),
  metric(copy("الصفقات المسجّلة في العينة","Recorded executions in sample"),String(matches.filter(e=>e.kind==="trade").length)),
  metric(copy("أحداث السيولة المسجّلة","Recorded liquidity events"),String(matches.filter(e=>["liquidity_add","liquidity_remove"].includes(e.kind)).length))
 ]:[];
 const prediction=forecast?[
  metric(t("predicted"),price(forecast.predicted_price)+" USDT"),
  metric(t("recordedAt"),stamp(forecast.created_utc,true)),
  metric(t("due"),stamp(forecast.due_utc,true)),
  metric(t("model"),forecast.model||"—")
 ]:[metric(copy("أفق التوقع","Forecast horizon"),horizon),metric(copy("السجل المتاح","Available record"),copy("لا توقع مسجّل لهذه الشمعة وهذا الأفق","No recorded forecast for this candle and horizon"))];
 const outcome=known?[
  metric(t("measured"),price(actual)+" USDT"),
  metric(copy("وقت القياس","Measurement time"),stamp(forecast.measurement_time_utc,true)),
  metric(copy("خطأ التوقع / ثبات السعر · USDT","Forecast / no-change error · USDT"),
   price(Math.abs(actual-forecast.predicted_price))+" / "+(n(forecast.reference_price)>0?price(Math.abs(actual-forecast.reference_price)):"—"))
 ]:[metric(copy("النتيجة","Outcome"),forecast?copy("لا نتيجة موثّقة متاحة","No verified outcome available"):"—")];
 const html=[[copy("رصد السوق","Market observations"),candles],[copy("التوقع وقت الشمعة","Forecast at the candle"),prediction],
  [copy("النتيجة المقاسة","Measured outcome"),outcome]].map(([title,rows])=>'<article><h4>'+esc(title)+'</h4><dl>'+
  rows.map(([k,v])=>'<div><dt>'+esc(k)+'</dt><dd dir="auto">'+esc(v)+'</dd></div>').join("")+'</dl></article>').join("");
 if(root.innerHTML!==html)root.innerHTML=html;
}
function renderChartEvents(bars=eventBars){
 if(!window.StampEvents||!el("chartEvents"))return;
 eventBars=bars;
 const archive=selectedAsset==="STAMPUSDT"?operationsReport?.events:null;
 const payload=eventPayload||{symbol:selectedAsset,records:[]};
 const records=new Map((archive?.records||[]).map(event=>[event.id,event]));
 for(const event of payload.records)records.set(event.id,event);
 const sorted=[...records.values()].sort((a,b)=>b.time_ms-a.time_ms);
 paintCandleEvidence(bars,sorted);
 const aligned=eventEnabled?window.StampEvents.align(sorted,bars,selectedAsset,FRAME_MS[frame]):[];
 const markers=window.StampEvents.markers(aligned);
 eventMarkers?.setMarkers(markers);
 const node=el("chart");
 node.dataset.eventCount=String(aligned.length);
 node.dataset.eventMarkers=String(markers.length);
 set("eventCount",aligned.length||"");
 if(eventEnabled)window.StampEvents.renderList({
  aligned,selected:eventSelection,state:offline?"archived":eventState,copy,stamp,offline,replay:!!replay,
  payload:{...payload,archived_trades:payload.archived_trades||archive?.trades,liquidity:payload.liquidity||archive?.liquidity}
 });
}
async function pollChartEvents(force=false){
 if(offline||!eventEnabled||!window.StampEvents||!el("chartEvents")||eventRequest||(!force&&Date.now()<nextEventPoll))return;
 const symbol=selectedAsset,controller=new AbortController();
 eventRequest=controller;
 nextEventPoll=Date.now()+45000;
 const timeout=setTimeout(()=>controller.abort(),7000);
 try{
  const response=await fetch("/api/market-events?symbol="+encodeURIComponent(symbol),{
   signal:controller.signal,credentials:"same-origin",cache:"no-store"
  });
  if(!response.ok)throw Error("market_events_unavailable");
  const payload=await response.json();
  if(payload?.symbol!==symbol||!Array.isArray(payload.records))throw Error("invalid_market_events");
  if(eventRequest!==controller||symbol!==selectedAsset)return;
  eventPayload=payload;
  if(!el("venuesSection")?.hidden)renderSceneTimeline();
  eventState="ready";
 }catch{
  if(eventRequest!==controller||symbol!==selectedAsset)return;
  eventState="unavailable";
  nextEventPoll=Date.now()+15000;
 }finally{
  clearTimeout(timeout);
  if(eventRequest===controller){
   eventRequest=null;
   renderChartEvents();
  }
 }
}
function paintOperations(){
 window.StampEvents?.renderOperations(operationsReport,copy,stamp,offline);
}
function focusEventCandle(start){
 const bar=eventBars.find(candle=>candle.t===start);
 if(!chart||!bar)return;
 const padding=FRAME_MS[frame]*10;
 const from=Math.max(eventBars[0].t,start-padding)/1000,to=Math.min(eventBars.at(-1).t,start+padding)/1000;
 if(to>from)chart.timeScale().setVisibleRange({from,to});
 chart.setCrosshairPosition?.(bar.c,start/1000,candleSeries);
 eventSelection=start;
 renderChartEvents();
 const node=el("chart");
 node.focus({preventScroll:true});
 node.scrollIntoView({block:"nearest"});
}
function renderFormingCandle(){
 if(replay||!chart||currentBars.length<2)return;
 const forming=activeCandle(),last=currentBars.at(-1);
 if(!forming||forming.t<=last.t){
  if(plottedForming!==null)renderChart();
  return;
 }
 if(plottedForming!==null&&forming.t!==plottedForming){renderChart();return}
 candleSeries.update(plottedCandle(forming));
 if(forming.v!==null&&forming.v>=0)volumeSeries.update(plottedVolume(forming));
 if(plottedForming===null)renderChartEvents([...currentBars,forming]);
 plottedForming=forming.t;
 paintCandleContext(forming,forming);
}
function visibleCandles(){
 return replay?replay.bars.slice(0,replay.index+1):chartCandles(frame);
}
function replayTime(){
 return replay?replay.bars[replay.index].t+FRAME_MS[frame]:null;
}
function replayProjection(rows,cutoff){
 return rows.filter(row=>Date.parse(row.due_utc)>cutoff&&n(row.reference_price)>0&&n(row.predicted_price)>0)
  .sort((a,b)=>Date.parse(b.created_utc)-Date.parse(a.created_utc))[0];
}
function paintReplay(forecast){
 const button=el("replayToggle");
 if(!button)return;
 button.disabled=!replay&&currentBars.length<3;
 button.setAttribute("aria-expanded",String(!!replay));
 button.textContent=replay?copy("العودة للمباشر","Back to live"):copy("إعادة العرض","Replay candles");
 el("replayControls").hidden=!replay;
 if(!replay)return;
 const time=replayTime(),stampText=stamp(time,true),slider=el("replayPosition");
 const atEnd=replay.index===replay.bars.length-1;
 slider.max=String(replay.bars.length-1);
 slider.value=String(replay.index);
 slider.setAttribute("aria-valuetext",stampText);
 set("replayTime",stampText);
 set("replayPlay",replayTimer?copy("إيقاف مؤقت","Pause"):copy("تشغيل","Play"));
 el("replayPlay").setAttribute("aria-pressed",String(!!replayTimer));
 el("replayPlay").disabled=atEnd;
 el("replayStep").disabled=atEnd;
 el("replayBack").disabled=replay.index===1;
 set("replayForecast",forecast
  ? copy("توقع منشور حينها","Forecast published at that point")+" · "+stamp(forecast.created_utc,true)+" · "+price(forecast.predicted_price)+" USDT · "+copy("الموعد","Due")+" "+stamp(forecast.due_utc,true)
  : copy("لا يوجد توقع جارٍ موثق عند هذا التوقيت لهذا الأفق","No active recorded forecast at this time for this horizon"));
}
function pauseReplay(){
 if(replayTimer!==null)clearInterval(replayTimer);
 replayTimer=null;
}
function stopReplay(){
 if(!replay)return;
 pauseReplay();
 replay=null;
 eventSelection=null;
 inspectingChart=false;
 viewKey="";
}
function seekReplay(index){
 if(!replay)return;
 replay.index=Math.max(1,Math.min(replay.bars.length-1,index));
 if(replay.index===replay.bars.length-1)pauseReplay();
 eventSelection=null;
 inspectingChart=false;
 viewKey="";
 renderChart();
}
function renderChart(){
 renderDepth();
 if(!initChart())return;
 currentBars=visibleCandles();
 const chartNode=el("chart"),empty=el("chartEmpty");
 Object.assign(chartNode.dataset,{replay:String(!!replay),replayCutoff:String(replayTime()||""),barCount:String(currentBars.length),forecastPoints:"0",actualPoints:"0",forming:"false",frame});
 empty.hidden=currentBars.length>=2;
 if(currentBars.length<2){
  set("chartEmpty",data?t("insufficientCandles"):copy("بانتظار بيانات الشموع","Waiting for candles"));
  set("chartOHLC","—");
  set("activeCandle","");
  plottedForming=null;
  if(livePriceLine){candleSeries.removePriceLine(livePriceLine);livePriceLine=null}
  for(const series of [candleSeries,volumeSeries,predictedSeries,measuredSeries,projectionSeries])series.setData([]);
  renderTechnical();
  renderChartEvents([]);
  paintMarketLens(true);
  paintReplay();
  viewKey="";
  return;
 }
 const candidate=replay?null:activeCandle(),forming=candidate&&candidate.t>currentBars.at(-1).t?candidate:null;
 const displayBars=forming?[...currentBars,forming]:currentBars;
 plottedForming=forming?.t??null;
 const close=displayBars.at(-1).c,precision=close>=100?2:close>=1?4:close<1e-7?12:8;
 candleSeries.applyOptions?.({priceFormat:{type:"price",precision,minMove:10**-precision}});
 candleSeries.setData(displayBars.map(plottedCandle));
 volumeSeries.setData(displayBars.filter(c=>c.v!==null&&c.v>=0).map(plottedVolume));
 const cutoff=replayTime();
 const rows=(data?.forecast_review?.rows||[]).filter(r=>r.horizon===horizon&&
  (cutoff===null||Date.parse(r.created_utc)<=cutoff));
 // Outcome time and recording time both matter when replaying a historical candle.
 const predictions=uniquePoints(rows.filter(r=>cutoff===null||Date.parse(r.due_utc)<=cutoff)
  .map(r=>({time:Date.parse(r.due_utc)/1000,value:r.predicted_price})));
 const outcomes=uniquePoints(rows.filter(r=>r.actual_price!==null&&r.measurement_time_utc&&
  (cutoff===null||Math.max(Date.parse(r.measurement_time_utc),Date.parse(r.evaluated_utc))<=cutoff))
  .map(r=>({time:Date.parse(r.measurement_time_utc)/1000,value:r.actual_price})));
 predictedSeries.setData(predictions);measuredSeries.setData(outcomes);
 const historical=replay?replayProjection(rows,cutoff):null;
 const f=replay?(historical?{reference_at_utc:historical.reference_utc||historical.created_utc,reference_price:historical.reference_price,
  due_at_utc:historical.due_utc,predicted_price:historical.predicted_price}:null):
  data?.asset_research_forecasts?.[frame]||data?.forecasts?.[horizon]?.forecast;
 const projection=f?uniquePoints([{time:Date.parse(f.reference_at_utc)/1000,value:f.reference_price},{time:Date.parse(f.due_at_utc)/1000,value:f.predicted_price}]):[];
 projectionSeries.setData(projection);
 paintReplay(historical);
 drawQuoteLine();
 paintCandleContext(displayBars.at(-1),forming);
 paintMarketLens(true);
 renderTechnical();
 renderChartEvents(displayBars);
 el("chart").dataset.barCount=String(currentBars.length);el("chart").dataset.forecastPoints=String(predictions.length);el("chart").dataset.actualPoints=String(outcomes.length);el("chart").dataset.frame=frame;
 chartNode.setAttribute("aria-label",selectedAsset+" · "+frame+" · "+currentBars.length+" closed candles; "+predictions.length+" recorded predictions; "+outcomes.length+" measured outcomes");
 const hasHistory=!!data?.candles?.[FRAME_SOURCE[frame]||frame]?.length;
 const key=selectedAsset+"|"+frame+"|"+horizon+"|"+hasHistory;if(viewKey!==key){viewKey=key;resetChartRange(true)}
}
const reasonText={
 insufficient_forward_validation:["اختبار زمني غير كافٍ خارج التدريب","Insufficient forward validation"],forward_error_not_better_than_baseline:["خطأ التوقع لم يتفوق على توقع عدم تغير السعر","Forward error did not beat no change"],forward_direction_uncertain:["عدم يقين دقة الاتجاه ما زال مرتفعًا","Forward directional uncertainty remains high"],insufficient_prospective_outcomes:["النتائج المستقبلية المستقلة غير كافية","Insufficient independent prospective outcomes"],recent_prediction_error_not_better_than_baseline:["الأداء الحديث لم يحافظ على تحسن الخطأ","Recent forecast error lost its advantage"],recent_direction_uncertain:["الأداء الاتجاهي الحديث لم يحقق الاعتماد","Recent directional evidence failed approval"],model_input_unavailable_or_stale:["بيانات النموذج ناقصة أو قديمة","Model inputs unavailable or stale"],forward_and_prospective_evidence_passed:["اجتاز اختبارات المستقبل ونتائج التوقعات المتحققة","Forward validation and prospective outcomes passed"]};
function renderForecasts(){
 if(selectedAsset!=="STAMPUSDT"){
  const proposed=data?.asset_research_forecasts?.[frame];
  set("modelStatus",proposed?.status==="research_only"?t("experimental"):t("awaiting"));
  el("modelStatus").className="model-status";
  set("forecastSummary",proposed?.status==="research_only"
   ? frame+" · "+t("target")+" "+ltr(price(proposed.predicted_price)+" USDT")+"\n"+t("due")+" · "+stamp(proposed.due_at_utc)
   : t("noForecast"));
  for(const id of ["outcomeSummary","modelDecisionTime","modelReason","forecastHistory"])set(id,"");
  return;
 }
 const r=data?.forecasts?.[horizon],f=r&&typeof r==="object"?r.forecast:null;
 const decision=data?.model_decisions?.[horizon];
 const decisionAge=age(decision?.decided_at_utc),decisionFresh=decisionAge!==null&&decisionAge<=9000&&Date.parse(f?.due_at_utc)>Date.now()&&(!data?.output_assurance||data.output_assurance.horizons?.[horizon]?.predictive_validity==="approved_research");
 const state=decision?.automatic===true?decision.status:null;
 set("modelStatus",state==="approved"&&!decisionFresh?t("oldDecision"):state==="approved"?t("approved"):state==="experimental"?t("experimental"):t("awaiting"));el("modelStatus").className="model-status"+(state==="approved"&&decisionFresh?" approved":"");
 if(f){
  const expired=Date.parse(f.due_at_utc)<=Date.now();
  set("forecastSummary",horizon.toUpperCase()+" · "+t("target")+" "+ltr(price(f.predicted_price)+" USDT")+" · "+ltr(pct(Math.expm1(f.predicted_log_return)*100))+
   "\n"+t("due")+" · "+stamp(f.due_at_utc)+(expired?"\n"+t("forecastExpired"):""));
 }
 else set("forecastSummary",t("noForecast"));
 for(const button of document.querySelectorAll("[data-horizon]"))button.setAttribute("aria-pressed",String(button.dataset.horizon===horizon));
 const rows=(data?.forecast_review?.rows||[]).filter(r=>r.horizon===horizon),correct=rows.filter(r=>r.direction_correct===true).length,wrong=rows.filter(r=>r.direction_correct===false).length,pending=rows.filter(r=>r.actual_price===null&&Date.parse(r.due_utc)>Date.now()).length,unverified=rows.length-correct-wrong-pending;
 set("outcomeSummary",t("correct")+" "+correct+" · "+t("wrong")+" "+wrong+" · "+t("pending")+" "+pending+" · "+t("unknown")+" "+unverified);
 const reasons=decision?.reason_codes||[];const forward=decision?.forward_validation||{},prospective=decision?.prospective||{};
 el("modelReason").innerHTML='<p>'+esc(t("autoNote"))+'</p>'+(decision?'<p>'+esc(t("model"))+': '+esc(decision.selected_model)+' · '+esc(t("forward"))+': '+esc(forward.samples??0)+' · '+esc(t("prospective"))+': '+esc(prospective.samples??0)+'</p><ul>'+reasons.map(code=>'<li>'+esc(reasonText[code]?.[lang==="ar"?0:1]||code)+'</li>').join("")+'</ul>':'');
 set("modelDecisionTime",decision?t("decisionSource")+" · "+stamp(decision.decided_at_utc):t("awaiting"));
 const header='<tr><th>'+esc(t("due"))+'</th><th>'+esc(t("predicted"))+'</th><th>'+esc(t("observed"))+'</th><th>'+esc(t("outcome"))+'</th></tr>';
 el("forecastHistory").innerHTML='<table><thead>'+header+'</thead><tbody>'+rows.slice(0,30).map(r=>{const known=r.actual_price!==null&&n(r.actual_price)>0;const status=r.direction_correct===true?t("correct"):r.direction_correct===false?t("wrong"):known?t("unknown"):Date.parse(r.due_utc)>Date.now()?t("pending"):t("unknown");const measure=known?(r.measurement_offset_seconds===0?t("exact"):t("approximate"))+" · "+stamp(r.measurement_time_utc):"";return '<tr><td>'+esc(stamp(r.due_utc))+'</td><td class="numeric">'+esc(price(r.predicted_price))+'</td><td class="numeric">'+esc(price(r.actual_price))+'</td><td>'+esc(status)+'<br><span class="muted">'+esc(measure)+'</span></td></tr>'}).join("")+'</tbody></table>';
}
function renderInputs(){
 const r=data?.forecasts?.[horizon],m=r?.input_manifest;if(!m){set("inputPolicy",t("awaiting"));el("inputTable").innerHTML="";return}
 set("inputPolicy",(lang==="ar"?"المرجع الزمني للمدخلات: ":"Input time reference: ")+stamp(m.reference_utc)+" · "+m.features+(lang==="ar"?" متغيرًا مع علامات التوفر. البيانات الأحدث تُحفظ للمرجع التالي؛ الإشارة غير الموثقة لا تُعامل كخبر مؤكد.":" features including availability masks. Later observations are archived for the next reference; unverified mentions are not confirmed news."));
 const headers=["inputGroup","inputUsed","inputAccess","inputCoverage"];
 el("inputTable").innerHTML='<table><thead><tr>'+headers.map(k=>'<th>'+esc(t(k))+'</th>').join("")+'</tr></thead><tbody>'+Object.entries(m.groups||{}).map(([g,s])=>{const selected=(r.selected_feature_groups||[]).includes(g),access=r.source_access?.[g],coverage=r.feature_coverage?.[g],reason=s.reason||access?.reason||"";return '<tr><td>'+esc(t(g))+'</td><td>'+esc(!selected?(lang==="ar"?"لم يُختر في المرشح الفائز":"Not selected by winning profile"):s.available_features>0?t("used"):t("missing"))+' · '+esc((s.available_features??0)+" / "+(s.total_features??"—"))+(reason?'<br><span class="muted">'+esc(reason)+'</span>':'')+'</td><td>'+esc(access?(access.status==="available"?t("used"):t("missing")):s.status)+'<br><span class="muted">'+esc(access?.observed_utc?stamp(access.observed_utc):"")+'</span></td><td>'+esc(coverage?coverage.points_with_data+" / "+coverage.evaluation_points:"—")+'</td></tr>'}).join("")+'</tbody></table>';
}
function renderAssurance(){
 const a=data?.output_assurance,h=a?.horizons?.[horizon];
 if(!a||!h){set("assuranceSummary",t("awaiting"));set("assuranceBadge",t("awaiting"));el("assuranceMetrics").innerHTML="";return}
 const due=Date.parse(h.target_at_utc),checked=Date.parse(a.checked_at_utc),current=Number.isFinite(due)&&due>Date.now()&&Number.isFinite(checked)&&Date.now()-checked<30000;
 set("assuranceSummary",t("production")+": "+t(current&&h.production_status==="valid"?"healthy":"degraded")+" · "+t("quality")+": "+t(h.predictive_validity)+" · "+t("overdue")+": "+a.overdue_unverified_in_recent_journal+". "+t("rolloutBlocked"));
 set("assuranceBadge",t("production")+": "+t(current&&h.production_status==="valid"?"healthy":"degraded")+" · "+t("quality")+": "+t(h.predictive_validity)+" · "+(lang==="ar"?"التعميم: غير معتمد":"All-pair rollout: not approved"));
 const f=h.forward||{},v=h.prospective||{};
 const interval=x=>Array.isArray(x)&&x.every(v=>n(v)!==null)?x.map(v=>pct(v*100)).join(" — "):"—";
 el("assuranceMetrics").innerHTML='<table><thead><tr><th>'+esc(horizon)+'</th><th>'+esc(t("forward"))+'</th><th>'+esc(t("prospective"))+'</th></tr></thead><tbody>'+[["samples",f.samples,v.samples],["skill",n(f.skill_vs_zero)===null?"—":pct(f.skill_vs_zero*100),n(v.skill_vs_zero)===null?"—":pct(v.skill_vs_zero*100)],["direction",n(f.direction_accuracy)===null?"—":pct(f.direction_accuracy*100),n(v.direction_accuracy)===null?"—":pct(v.direction_accuracy*100)],["interval",interval(f.direction_wilson_95),interval(v.direction_wilson_95)]].map(r=>'<tr><th>'+esc(t(r[0]))+'</th><td>'+esc(r[1])+'</td><td>'+esc(r[2])+'</td></tr>').join("")+'</tbody></table>';
}
function quoteTime(q){
 return Date.parse(q?.provider_at_utc||(q?.price_kind==="ticker"?null:q?.retrieved_at_utc));
}
function isFreshQuote(q){
 const elapsed=Date.now()-quoteTime(q);
 return q?.status==="fresh"&&elapsed>=-5000&&elapsed<=15000&&!(q.price_kind==="ticker"&&q.transport==="rest");
}
function drawQuoteLine(){
 if(!candleSeries)return;
 if(!replay&&currentBars.length&&isFreshQuote(quoteLive)){
  if(livePriceLine)livePriceLine.applyOptions({price:quoteLive.price});
  else livePriceLine=candleSeries.createPriceLine({price:quoteLive.price,color:"#a4bbc9",lineWidth:1,lineStyle:2,axisLabelVisible:true,title:"MEXC"});
 }else if(livePriceLine){candleSeries.removePriceLine(livePriceLine);livePriceLine=null}
}
let nextLensPaint=0;
function paintMarketLens(force=false){
 if(!window.StampLens||el("trading")?.hidden||(!force&&performance.now()<nextLensPaint))return;
 nextLensPaint=performance.now()+1000;
 window.StampLens?.update({
  market:data?.market, quote:quoteLive, fresh:isFreshQuote(quoteLive),
  observed:data?.observed_utc, liquidity:data?.liquidity, bars:currentBars,
  frame, interval:FRAME_MS[frame], replay:!!replay, stamp, copy
 });
}
function paintQuote(){
 const quote=quoteLive,market=data?.market;
 if(!quote&&!market)return;
 const fresh=isFreshQuote(quote),measured=quote?.provider_at_utc||quote?.retrieved_at_utc||data?.observed_utc;
 const usable=n(quote?.price)>0||n(market?.price)>0;
 const status=fresh?t("live"):!usable?t("unavailable"):!quote?t("archive"):
  quote.price_kind==="trade"?copy("آخر صفقة","Last trade"):copy("آخر رصد","Latest snapshot");
 const change=quote?.stats_at_utc?n(quote.change_24h_pct):n(market?.change)===null?null:market.change*100;
 set("status",status);
 el("status").className=fresh?"fresh":"stale";
 set("price",price(quote?.price??market?.price));
 set("mapTrade",usable?price(quote?.price??market?.price)+" USDT · "+status:"—");
 set("change",pct(change));
 el("change").style.color=change===null?"":change>=0?"var(--up)":"var(--down)";
 set("volume",number(quote?.stats_at_utc?quote.volume_24h_usdt:market?.volume));
 set("high24",price(quote?.stats_at_utc?quote.high_24h:market?.high_24h));
 set("low24",price(quote?.stats_at_utc?quote.low_24h:market?.low_24h));
 const method=quote?.transport==="websocket"?" · WebSocket":quote?.transport==="rest"?" · REST":"";
 set("observed",usable?(quote?.source||assetCache?.source||"MEXC")+method+" · "+stamp(measured):"");
 el("warning").hidden=fresh||!usable;
 set("warning",fresh||!usable?"":quote?copy("يظهر آخر سعر متاح مع توقيته.","Showing the last available price and its timestamp."):
  copy("تعذّر جلب السعر المباشر. القراءة المعروضة مؤرشفة.","Live quote unavailable. Showing the latest archive."));
 drawQuoteLine();
 paintMarketLens();
}
function updateFreshness(){
 const q=quoteLive,seconds=age(q?.provider_at_utc||q?.retrieved_at_utc);
 const statsAge=age(q?.stats_at_utc),dexAge=age(data?.liquidity?.observed_utc);
 set("dataAge",[
  seconds===null?null:Math.floor(seconds)+" "+t("dataSeconds"),
  statsAge===null?null:ltr("24H: "+Math.floor(statsAge)+"s"),
  dexAge===null?null:ltr("DEX: "+Math.floor(dexAge)+"s")
 ].filter(Boolean).join(" · "));
 const streamReady=streamState==="live";
 const fallback=isFreshQuote(q)&&q?.transport==="rest";
 set("streamStatus",assetCache?.venue&&assetCache.venue!=="MEXC"?assetCache.venue+" · REST · "+stamp(assetCache.retrieved_at_utc):
  streamReady?t("streamLive"):fallback?copy("MEXC · تحديث احتياطي","MEXC · REST fallback"):
  streamState==="connecting"||streamState==="subscribing"?t("streamConnecting"):t("streamFallback"));
 el("streamStatus").className=streamReady||fallback?"fresh":"stale";
 paintQuote();
 if(plottedForming!==null&&!activeCandle())renderFormingCandle();
}
function acceptQuote(incoming){
 if(!["fresh","stale","snapshot"].includes(incoming?.status)||!(n(incoming.price)>0)||incoming.symbol&&incoming.symbol!==selectedAsset)return;
 const observed=quoteTime(incoming);
 if(!Number.isFinite(observed)||observed>Date.now()+5000)return;
 const old=quoteLive,previous=quoteTime(old);
 const selected=!old||observed>=previous&&(!isFreshQuote(old)||isFreshQuote(incoming))?incoming:old;
 const merged={...selected};
 const oldStats=Date.parse(old?.stats_at_utc);
 const statsTime=Date.parse(incoming.stats_at_utc||(quoteStatistics.some(key=>n(incoming[key])!==null)?incoming.provider_at_utc||incoming.retrieved_at_utc:null));
 const newestStats=Number.isFinite(statsTime)&&statsTime<=Date.now()+5000&&(!Number.isFinite(oldStats)||statsTime>=oldStats);
 const stats=newestStats?incoming:old;
 for(const key of quoteStatistics)merged[key]=stats?.[key];
 merged.stats_at_utc=newestStats?new Date(statsTime).toISOString():old?.stats_at_utc;
 quoteLive=merged;
 updateFreshness();
}
function storeForming(tf,candle){
 if(!candleFresh(candle)||!FRAME_MS[tf])return false;
 const old=liveCandles.get(tf);
 if(old&&(old.t>candle.t||old.t===candle.t&&(
  Date.parse(old.observed_utc)>Date.parse(candle.observed_utc)||
  old.transport==="websocket"&&candle.transport==="rest"&&streamState==="live"&&age(old.observed_utc)<8
 )))return false;
 liveCandles.set(tf,candle);
 return true;
}
function mergeClosed(tf,bars){
 if(!bars.length)return false;
 const stored=closedLiveCandles.get(tf)||new Map();
 let changed=false;
 for(const bar of bars){
  if(!Number.isFinite(bar.t)||bar.t+FRAME_MS[tf]>Date.now())continue;
  const old=stored.get(bar.t);
  if(!old||["o","h","l","c","v"].some(key=>old[key]!==bar[key])){
   stored.set(bar.t,bar);
   changed=true;
  }
 }
 if(stored.size>128)for(const t of [...stored.keys()].sort((a,b)=>a-b).slice(0,stored.size-128))stored.delete(t);
 closedLiveCandles.set(tf,stored);
 return changed;
}
async function pollMarket(force=false){
 if(offline||document.hidden||marketRequest||(selectedAsset!=="STAMPUSDT"&&assetCache?.venue!=="MEXC")||!force&&Date.now()<nextMarketPoll)return;
 const symbol=selectedAsset,tf=FRAME_SOURCE[frame]||frame;
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),7000);
 marketRequest=controller;
 let received=false;
 try{
  const path="/api/market-update?symbol="+encodeURIComponent(symbol)+"&frame="+tf;
  const response=await fetch(path,{credentials:"same-origin",cache:"no-store",signal:controller.signal});
  if(response.status===401){stream?.stop();window.location.href="/login";return}
  if(!response.ok)throw Error("HTTP "+response.status);
  const result=await response.json();
  if(marketRequest!==controller||symbol!==selectedAsset||result.symbol!==symbol||result.frame!==tf)return;
  acceptQuote(result.quote);
  const bars=Array.isArray(result.closed)?result.closed:[];
  const closedChanged=mergeClosed(tf,bars),formingChanged=storeForming(tf,result.forming);
  received=bars.length>0||formingChanged||["fresh","stale","snapshot"].includes(result.quote?.status);
  if(closedChanged)renderChart();
  else if(formingChanged)renderFormingCandle();
 }catch{}finally{
  clearTimeout(timer);
  if(marketRequest===controller){
   marketRequest=null;
   marketFailures=received?0:marketFailures+1;
   const healthyStream=streamState==="live"&&quoteLive?.transport==="websocket"&&isFreshQuote(quoteLive);
   nextMarketPoll=Date.now()+(received?(healthyStream?20000:4000):Math.min(30000,4000*2**Math.min(marketFailures-1,3)));
   updateFreshness();
  }
 }
}
function resetMarketPoll(){
 marketRequest?.abort();
 marketRequest=null;
 marketFailures=0;
 nextMarketPoll=0;
}
function startStream(){
 stream?.stop();
 stream=null;
 streamState="reconnecting";
 if(!window.StampMarket||!window.WebSocket||offline||document.hidden||(selectedAsset!=="STAMPUSDT"&&assetCache?.venue!=="MEXC"))return;
 const symbol=selectedAsset;
 const connection=new window.StampMarket.Stream({symbol,onState:state=>{
  if(stream!==connection)return;
  streamState=state;
  updateFreshness();
  if((state==="reconnecting"||state==="idle")&&marketFailures===0)pollMarket(true);
 },onData:update=>{
  if(stream!==connection||symbol!==selectedAsset)return;
  if(update.quote)acceptQuote(update.quote);
  if(update.kind==="candle"&&storeForming(update.frame,update.candle)&&(frame===update.frame||FRAME_SOURCE[frame]===update.frame))renderFormingCandle();
 }});
 stream=connection;
 connection.start();
}

function renderIntelligence(){
 if(!data)return;
 const horizons=data.forecasts||{},lab=lastLaboratory;
 const cards=selectedAsset==="STAMPUSDT"?["1h","4h","24h","7d"].map(h=>{
  const f=horizons[h]?.forecast;
  return '<button type="button" class="forecast-card" data-horizon="'+h+'" aria-pressed="'+(h===horizon)+'"><strong>'+h+
   '</strong><span class="forecast-target">'+esc(price(f?.predicted_price))+'</span></button>';
 }):[];
 const panel=el("forecastCards");
 if(panel)panel.innerHTML=cards.join("");
 set("labStatus",lab.status||t("unavailable"));
 set("labProposals",lab.proposals??"—");
 set("labEvaluated",lab.evaluated??"—");
 set("labDecisionsCount",lab.decision_count??"—");
 const list=el("labRecentDecisions");
 if(list)list.textContent=(lab.decisions||[]).slice(0,6).map(v=>[v.horizon,v.family,v.decision].filter(Boolean).join(" · ")).join(" | ")||
  copy("لا توجد قرارات مؤرشفة","No archived decisions");
 set("labEvidence",lab.warning||"");
}
let systemSnapshot=null;
const pipelineStages=[
 ["monitor","الرصد","Collect","venuesSection",[-2.9,-1.35,-.3]],
 ["archive","الأرشيف","Archive","trading",[-1.9,-.15,.3]],
 ["evidence","التحقق","Verify","venuesSection",[-.9,-1.35,-.3]],
 ["research","التدريب","Train","trading",[.1,-.15,.3]],
 ["audit","قياس النتائج","Measure","trading",[1.1,-1.35,-.3]],
 ["governance","الاعتماد","Review","systemCenter",[2.1,-.15,.3]],
 ["dashboard","النشر","Publish","systemCenter",[3.1,-1.35,-.3]],
 ["lab","المختبر","Lab","labCenter",[1.1,1.5,-.9]],
 ["diagnosis","تشخيص الخطأ","Diagnose","systemCenter",[2.7,1.2,.9]],
 ["multi_asset_governance","مراجعة الأزواج","Pairs review","systemCenter",[1.4,1.2,.9]],
 ["forecast_health","فحص التوقعات","Forecast check","systemCenter",[.1,1.2,.9]],
 ["production_smoke","فحص النشر","Production check","systemCenter",[-1.2,1.2,.9]],
 ["market_view","تدفق السوق","Market flow","globalMarketFlow",[3.1,1.5,-.9]],
 ...["MEXC","Binance","OKX","Bybit","KuCoin","Gate","Bitget"].map((venue,index)=>
  ["venue_"+venue.toLowerCase(),venue,venue,"globalMarketFlow",[-3.95,-1.8+index*.6,-1.65+index*.5]])
];
const pipelineTopology=[
 ["monitor","archive"],["archive","evidence"],["evidence","research"],["research","audit"],
 ["audit","governance"],["governance","diagnosis"],["diagnosis","multi_asset_governance"],
 ["multi_asset_governance","forecast_health"],["forecast_health","production_smoke"],["production_smoke","dashboard"],
 ...["MEXC","Binance","OKX","Bybit","KuCoin","Gate","Bitget"].map(venue=>["venue_"+venue.toLowerCase(),"market_view"])
];
let pipelineSelected="monitor",pipelineRun=null,pipelineFrame=0,pipelineAngle=-.14,pipelinePitch=.32,pipelineZoom=1,pipelinePoints=[];
let selectedHandoff=null, pipelineLinks=[],pipelineLive=null,liveObservation=null,pipelinePinned=false;
const livePipelineEvents=new Map();
const liveObservations=new Map();
const pipelineWorld=window.StampPipeline3D?.create(document.getElementById("traceWorld"));
let pipelineSequence=0,pipelineEventRequest=false;
function pipelineTransfers(){
 const ids=new Set(pipelineStages.map(stage=>stage[0]));
 return (systemSnapshot?.health?.trace||[]).flatMap(row=>row.handoffs||[])
  .filter(event=>ids.has(event.from)&&ids.has(event.to)&&event.from!==event.to&&Number.isFinite(Date.parse(event.observed_utc)))
  .sort((a,b)=>Date.parse(a.observed_utc)-Date.parse(b.observed_utc));
}
const stageName=id=>{
 const item=pipelineStages.find(stage=>stage[0]===id);
 return item?copy(item[1],item[2]):id;
};
const traceOutcome=s=>s==="success"?copy("نجحت","Passed"):s==="failure"?copy("فشلت","Failed"):
 s==="skipped"?copy("تُخطّيت","Skipped"):copy("بانتظار سجل","Awaiting evidence");
function pipelineRecord(id){
 return systemSnapshot?.health?.trace?.find(row=>row.stage===id);
}
function drawPipeline(pulse=null){
 const canvas=el("traceCanvas"), ctx=canvas?.getContext?.("2d");
 if(!ctx||!canvas.clientWidth||!canvas.clientHeight)return;
 const w=canvas.clientWidth,h=canvas.clientHeight,dpr=Math.min(window.devicePixelRatio||1,2);
 if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){
  canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
 }
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
 const worldReady=!!pipelineWorld?.available();
 if(worldReady)pipelineWorld.configure(w,h,pipelineAngle,pipelinePitch,pipelineZoom);
 const scale=Math.min(w/8.6,h/4.2), cos=Math.cos(pipelineAngle),sin=Math.sin(pipelineAngle);
 const project=([x,y,z])=>{
  if(worldReady){const p=pipelineWorld.project([x,y,z]);return [p.x,p.y]}
  const depth=z*cos+x*sin, shrink=9/(9+depth);
  return [w*.5+(x*cos-z*sin)*scale*shrink,h*.55+(y+depth*.32)*scale*shrink];
 };
 const line=(a,b,color,width=1)=>{
  ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.stroke();
 };
 if(!worldReady){for(let grid=-4;grid<=4;grid++)line(project([grid,1.8,-1.3]),project([grid,1.8,1.5]),"#223c50");
 for(let z=-1.3;z<=1.6;z+=.45)line(project([-4,1.8,z]),project([4,1.8,z]),"#223c50");}
 pipelinePoints=pipelineStages.map(([id,ar,en,,pos])=>({id,name:copy(ar,en),p:project(pos),floor:project([pos[0],1.8,pos[2]])}));
 const steps=systemSnapshot?.health?.steps||{};
 const transfers=pipelineTransfers();
 const edges=new Map();
 for(const event of transfers)edges.set(event.from+"|"+event.to,event);
 for(const event of livePipelineEvents.values())edges.set(event.from+"|"+event.to,{...event,live:true});
 for(const [id,observation] of liveObservations)edges.set(id+"|market_view",{from:id,to:"market_view",artifact:"spot_execution_observation",live:true,...observation});
 pipelineLinks=[...edges.values()].map(event=>({
  event,a:pipelinePoints.find(node=>node.id===event.from).p,b:pipelinePoints.find(node=>node.id===event.to).p
 }));
 if(worldReady){
  const states={};
  for(const node of pipelinePoints){
   const recent=liveObservations.get(node.id);
   states[node.id]=pipelineLive?.status==="in_progress"&&pipelineLive?.stages?.[node.id]?.status==="in_progress"?"running":
    recent&&age(recent.observed_utc)<90?"running":steps[node.id];
  }
  pipelineWorld.draw(pipelineStages.map(([id,,,,pos])=>({id,pos})),pipelineLinks.map(({event})=>event),
    pulse?(Array.isArray(pulse)?pulse:[pulse]):[],selectedHandoff||{id:pipelineSelected},states,pipelineTopology);
  ctx.textAlign="center";ctx.font=(w<550?"10":"12")+"px system-ui";
  for(const node of pipelinePoints){
   ctx.fillStyle=node.id===pipelineSelected?"#fff":"#c4e6ec";
   ctx.fillText(node.name,node.p[0],node.p[1]+24);
  }
  return;
 }
 const arch=({a,b})=>[.5*(a[0]+b[0]),Math.max(13,Math.min(a[1],b[1])-Math.min(58,Math.abs(a[0]-b[0])*.14))];
 const at=(a,c,b,t)=>[(1-t)**2*a[0]+2*t*(1-t)*c[0]+t*t*b[0],(1-t)**2*a[1]+2*t*(1-t)*c[1]+t*t*b[1]];
 for(const link of pipelineLinks){
  const {a,b,event}=link,c=arch(link);
  link.c=c;
  const active=selectedHandoff?.from===event.from&&selectedHandoff?.to===event.to;
  ctx.strokeStyle=active?"#9bffe4":event.live?(age(event.observed_utc)<90?"#6ecff3":"#486779"):"#4eae9e";ctx.lineWidth=active?2.6:1.3;
  ctx.beginPath();ctx.moveTo(...a);ctx.quadraticCurveTo(...c,...b);ctx.stroke();
  const tip=at(a,c,b,.76),left=at(a,c,b,.71),angle=Math.atan2(tip[1]-left[1],tip[0]-left[0]);
  line(tip,[tip[0]-5*Math.cos(angle-.55),tip[1]-5*Math.sin(angle-.55)],"#a4f3df");
  line(tip,[tip[0]-5*Math.cos(angle+.55),tip[1]-5*Math.sin(angle+.55)],"#a4f3df");
 }
 const size=Math.max(7,Math.min(15,w/42));
 const face=(points,fill,stroke)=>{
  ctx.beginPath();ctx.moveTo(...points[0]);for(const p of points.slice(1))ctx.lineTo(...p);ctx.closePath();
  ctx.fillStyle=fill;ctx.fill();ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke();
 };
 for(const node of pipelinePoints){
  const [x,y]=node.p,active=node.id===pipelineSelected&&!selectedHandoff,state=steps[node.id];
  const running=pipelineLive?.status==="in_progress"&&pipelineLive?.stages?.[node.id]?.status==="in_progress";
  const liveNode=(node.id.startsWith("venue_")||node.id==="market_view")&&liveObservation&&age(liveObservation.observed_utc)<90;
  const color=running||liveNode?"#83e7ff":state==="success"?"#75e4cb":state==="failure"?"#ff8d9e":node.id==="lab"?"#bcabff":"#8ea3b8";
  const left=[x-size,y-size*.35],top=[x,y-size*.8],right=[x+size,y-size*.35],middle=[x,y+size*.1];
  line(node.floor,node.p,"#3e5b72");
  face([left,middle,[x,y+size],[x-size,y+size*.55]],"#153348",color);
  face([middle,right,[x+size,y+size*.55],[x,y+size]],"#112536",color);
  face([left,top,right,middle],active?"#376b73":"#203d53",active?"#fff":color);
  ctx.fillStyle=color;ctx.textAlign="center";ctx.font=(w<460?"10":"13")+"px system-ui";ctx.fillText(node.name,x,y+size+13);
 }
 for(const moving of pulse?(Array.isArray(pulse)?pulse:[pulse]):[]){
  const link=pipelineLinks.find(({event})=>event.from===moving.from&&event.to===moving.to);
  if(link){
   const [x,y]=at(link.a,link.c,link.b,moving.progress);
   face([[x-5,y],[x,y-3],[x+5,y],[x,y+3]],"#d9fff5","#fff");
   face([[x-5,y],[x,y+3],[x,y+8],[x-5,y+5]],"#58dfbb","#d9fff5");
   face([[x,y+3],[x+5,y],[x+5,y+5],[x,y+8]],"#268870","#d9fff5");
  }
 }
}
function paintPipeline(){
 const details=el("traceDetails");
 if(!details)return;
 const [id,ar,en,target]=pipelineStages.find(stage=>stage[0]===pipelineSelected)||pipelineStages[0];
 const report=systemSnapshot, health=report?.health, entry=pipelineRecord(id);
 if(pipelineRun!==null&&health?.run!==pipelineRun)selectedHandoff=null;
 const label=copy(ar,en),lab=report?.laboratory;
 const running=pipelineLive?.status==="in_progress"&&pipelineLive?.stages?.[id]?.status==="in_progress";
 const observed=id==="market_view"?liveObservation:liveObservations.get(id);
 const rows=[[copy("الحالة","Status"),id.startsWith("venue_")||id==="market_view"?observed?copy("آخر اتصال موثّق","Last observed response"):copy("بانتظار الاستجابة","Awaiting response"):running?copy("تعمل الآن","Running now"):id==="lab"?(lab?.status||"—"):traceOutcome(health?.steps?.[id])],
  [copy("بدأت","Started"),stamp(entry?.started_utc,true)],[copy("انتهت","Finished"),stamp(entry?.finished_utc,true)]];
 if(id.startsWith("venue_")||id==="market_view")rows.push([copy("الزوج","Pair"),observed?.symbol||"—"],
  [copy("المنصة","Venue"),observed?.venue||"—"],[copy("وقت آخر صفقة","Last execution"),stamp(observed?.last_ms,true)],
  [copy("استُقبلت الاستجابة","Response received"),stamp(observed?.observed_utc,true)]);
 if(id==="monitor")rows.push([copy("آخر رصد سوق STAMP","Last STAMP market observation"),stamp(report?.observed_utc,true)]);
 if(id==="archive")rows.push([copy("شموع 15 دقيقة محفوظة","Archived 15m candles"),report?.candles?.["15m"]?.length??"—"]);
 if(id==="evidence")rows.push([copy("مصادر مرصودة","Observed sources"),Object.keys(report?.source_health||{}).length]);
 if(id==="research")rows.push([copy("آخر توقع مسجّل","Last recorded forecast"),stamp(report?.forecast_activity?.last_forecast_utc,true)]);
 if(id==="audit")rows.push([copy("نتائج مقاسة في السجل","Measured outcomes in history"),report?.forecast_review?.rows?.filter(row=>n(row.actual_price)>0).length??"—"]);
 if(id==="governance")rows.push([copy("آفاق معتمدة","Approved horizons"),Object.values(report?.model_decisions||{}).filter(row=>row?.status==="approved").length],
  [copy("تشخيص الخطأ","Error diagnosis"),traceOutcome(health?.steps?.diagnosis)],
  [copy("مراجعة الأزواج الأخرى","Multi-pair review"),traceOutcome(health?.steps?.multi_asset_governance)]);
 if(id==="dashboard")rows.push([copy("فحص الإصدار المنشور","Production check"),traceOutcome(pipelineRecord("production_smoke")?.status)]);
 if(id==="lab")rows.push([copy("وقت تدقيق المختبر","Lab audit time"),stamp(lab?.audited_at_utc,true)],[copy("تجارب مقيّمة","Evaluated experiments"),lab?.evaluated??"—"]);
 set("traceStage",label);
 set("traceRun",health?.run?"STAMP · "+copy("دورة محفوظة","Archived run")+" "+health.run+" · "+stamp(health.at,true):copy("بانتظار سجل التشغيل","Awaiting run record"));
 if(selectedHandoff){
  const e=selectedHandoff;
  set("traceStage",stageName(e.from)+" → "+stageName(e.to));
  if(e.kind==="artifact_handoff"){
   set("traceRun",copy("دورة جارية","Current run")+" "+e.run+" · "+stamp(e.received_at_utc,true));
   rows.splice(0,rows.length,[copy("الملف المقروء","Read artifact"),e.artifact],
    [copy("الحجم","Bytes"),number(e.bytes)+" B"],[copy("وقت القراءة","Read time"),stamp(e.observed_utc,true)],
    [copy("وقت وصول القياس","Telemetry received"),stamp(e.received_at_utc,true)],["SHA-256",e.sha256]);
  }else rows.splice(0,rows.length,...(e.live?[
   [copy("الزوج","Pair"),e.symbol],[copy("المنصة","Venue"),e.venue],
   [copy("وقت أحدث صفقة مرصودة","Last observed trade"),stamp(e.last_ms,true)],
   [copy("وقت استجابة الواجهة","UI response time"),stamp(e.observed_utc,true)]]:[
   [copy("الملف","Artifact"),e.artifact],[copy("حجم الدفعة","Batch size"),number(e.bytes)+" B"],
   [copy("وقت القراءة","Read time"),stamp(e.observed_utc,true)],["SHA-256",e.sha256]]));
 }
 const html=rows.map(([k,v])=>"<div><dt>"+esc(k)+"</dt><dd>"+esc(v)+"</dd></div>").join("");
 if(details.innerHTML!==html)details.innerHTML=html;
 el("traceOpen").setAttribute("href","#"+target);
 const keys=el("traceStageKeys"), buttons=pipelineStages.map(([key,a,b])=>
  '<button type="button" data-trace-stage="'+key+'" aria-pressed="'+String(id===key)+'">'+esc(copy(a,b))+'</button>').join("");
 if(keys.innerHTML!==buttons)keys.innerHTML=buttons;
 const transfers=pipelineTransfers(), hasTrace=transfers.length>0;
 const slider=el("traceSeek");
 if(slider){
  slider.max=String(Math.max(0,transfers.length-1));slider.disabled=!hasTrace;
  const index=selectedHandoff?transfers.findIndex(e=>e.from===selectedHandoff.from&&e.to===selectedHandoff.to&&e.artifact===selectedHandoff.artifact&&e.observed_utc===selectedHandoff.observed_utc):-1;
  slider.value=String(Math.max(0,index));
 }
 set("traceTransferCount",(hasTrace?number(transfers.length)+" · "+copy("وصلات محفوظة","archived links"):copy("لا توجد وصلات محفوظة","No archived links"))+
  (livePipelineEvents.size?" · "+number(livePipelineEvents.size)+" · "+copy("وصلات مرصودة أثناء التشغيل","links observed during run"):""));
 el("traceReplay").disabled=!hasTrace;
 if(!hasTrace)el("traceReplay").title=copy("لا توجد عمليات تسليم مسجّلة","No recorded handoffs");
 else el("traceReplay").title="";
 drawPipeline();
 if(hasTrace&&health.run!==pipelineRun)pipelineRun=health.run;
}
function playPipeline(){
 if(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)return;
 pipelinePinned=true;
 const entries=pipelineTransfers();
 if(!entries.length)return;
 if(pipelineFrame)cancelAnimationFrame(pipelineFrame);
 let begin=null,shown=-1;
 const animate=time=>{
  if(begin===null)begin=time;
  const elapsed=time-begin,index=Math.floor(elapsed/650);
  if(index>=entries.length){pipelineFrame=0;drawPipeline();return}
  if(index!==shown){
   shown=index;
   selectedHandoff=entries[index];
   pipelineSelected=selectedHandoff.to;
   paintPipeline();
  }
  drawPipeline({...entries[index],progress:elapsed/650-index});
  pipelineFrame=requestAnimationFrame(animate);
 };
 pipelineFrame=requestAnimationFrame(animate);
}
function setupPipeline(){
 const canvas=el("traceCanvas"),keys=el("traceStageKeys");
 if(!canvas?.getContext||!keys)return;
 let gesture=null,suppressClick=false;
 canvas.style.touchAction="none";
 canvas.addEventListener("pointerdown",event=>{
  if(event.button!==0)return;
  gesture={x:event.clientX,y:event.clientY,yaw:pipelineAngle,pitch:pipelinePitch,moved:false};
  canvas.setPointerCapture(event.pointerId);
 });
 canvas.addEventListener("pointermove",event=>{
  if(!gesture)return;
  const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;
  if(Math.abs(dx)+Math.abs(dy)>5)gesture.moved=true;
  if(!gesture.moved)return;
  pipelineAngle=gesture.yaw+dx*.006;
  pipelinePitch=Math.max(-.35,Math.min(1.15,gesture.pitch+dy*.005));
  drawPipeline();
 });
 canvas.addEventListener("pointerup",()=>{suppressClick=!!gesture?.moved;gesture=null});
 canvas.addEventListener("pointercancel",()=>{gesture=null});
 canvas.addEventListener("wheel",event=>{
  event.preventDefault();pipelineZoom=Math.max(.65,Math.min(2.2,pipelineZoom*(event.deltaY>0?.91:1.09)));drawPipeline();
 },{passive:false});
 canvas.addEventListener("click",event=>{
  if(suppressClick){suppressClick=false;return}
  const bounds=canvas.getBoundingClientRect();
  const hit=[...pipelinePoints].reverse().find(({p})=>Math.hypot(p[0]-(event.clientX-bounds.left),p[1]-(event.clientY-bounds.top))<20);
  if(hit){pipelinePinned=true;selectedHandoff=null;pipelineSelected=hit.id;paintPipeline();return}
  const x=event.clientX-bounds.left,y=event.clientY-bounds.top;
  const link=pipelineLinks.find(({a,b,c,event:edge})=>Array.from({length:29},(_,i)=>i/28).some(t=>{
   let point;
   if(pipelineWorld?.available()){
    const start=pipelineStages.find(row=>row[0]===edge.from)?.[4],end=pipelineStages.find(row=>row[0]===edge.to)?.[4];
    if(!start||!end)return false;
    const mid=[(start[0]+end[0])/2,Math.min(start[1],end[1])-.55,(start[2]+end[2])/2];
    const world=[0,1,2].map(k=>(1-t)**2*start[k]+2*(1-t)*t*mid[k]+t*t*end[k]);
    const projected=pipelineWorld.project(world);point=[projected.x,projected.y];
   }else point=[(1-t)**2*a[0]+2*t*(1-t)*c[0]+t*t*b[0],(1-t)**2*a[1]+2*t*(1-t)*c[1]+t*t*b[1]];
   return Math.hypot(point[0]-x,point[1]-y)<9;
  }));
  if(link){pipelinePinned=true;selectedHandoff=link.event;pipelineSelected=link.event.to;paintPipeline()}
 });
 keys.addEventListener("click",event=>{
  const button=event.target.closest("[data-trace-stage]");
  if(button){pipelinePinned=true;selectedHandoff=null;pipelineSelected=button.dataset.traceStage;paintPipeline();keys.querySelector('[aria-pressed="true"]')?.focus()}
 });
 el("traceRotate").addEventListener("click",()=>{pipelineAngle+=.28;drawPipeline()});
 el("traceReplay").addEventListener("click",playPipeline);
 el("traceSeek")?.addEventListener("input",event=>{
  pipelinePinned=true;
  if(pipelineFrame){cancelAnimationFrame(pipelineFrame);pipelineFrame=0}
  selectedHandoff=pipelineTransfers()[Number(event.target.value)]||null;
  if(selectedHandoff)pipelineSelected=selectedHandoff.to;
  paintPipeline();
  if(selectedHandoff)drawPipeline({...selectedHandoff,progress:.68});
 });
 if(typeof ResizeObserver!=="undefined")new ResizeObserver(()=>drawPipeline()).observe(canvas);
 paintPipeline();
}
async function pollPipelineLive(){
 if(offline||document.hidden)return;
 try{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),7000);
  let response;
  try{response=await fetch("/api/pipeline/live",{credentials:"same-origin",cache:"no-store",signal:controller.signal})}
  finally{clearTimeout(timer)}
  if(!response.ok)throw Error("live_status_unavailable");
  const current=await response.json();
  pipelineLive=current;
  if(current.latest?.trace?.length&&systemSnapshot?.health&&(
    current.latest.run!==systemSnapshot.health.run&&Date.parse(current.latest.at)>Date.parse(systemSnapshot.health.at)||
    current.latest.run===systemSnapshot.health.run&&current.latest.trace.length>systemSnapshot.health.trace?.length)){
    systemSnapshot.health=current.latest;
  }
  const active=Object.entries(current.stages||{}).find(([,v])=>v.status==="in_progress");
  const state=current.status==="in_progress"?"active":current.status==="unavailable"?"unavailable":"idle";
  const label=current.status==="in_progress"?(active?
   copy("تعمل الآن: ","Running now: ")+stageName(active[0]):copy("الدورة جارية، ولم تُرصد مرحلة نشطة بعد.","Workflow running; no active stage reported yet.")):
   current.status==="unavailable"?copy("تعذّر التحقق من حالة التشغيل الجارية.","Current workflow state unavailable."):
   copy("لا توجد دورة معالجة نشطة الآن؛ الوصلات المعروضة من آخر دورة محفوظة.","No processing run active; shown links belong to the last archived run.");
  const status=el("traceLiveStatus");
  status.dataset.state=state;
  status.textContent=label+" · "+stamp(current.checked_at_utc,true);
  paintPipeline();
 }catch{
  const status=el("traceLiveStatus");status.dataset.state="unavailable";
  status.textContent=copy("تعذّر التحقق من حالة التشغيل الجارية.","Current workflow state unavailable.");
 }
}
async function pollPipelineEvents(){
 if(offline||document.hidden||pipelineEventRequest)return;
 pipelineEventRequest=true;
 try{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),6500);
  let response;
  try{response=await fetch("/api/pipeline/events?after="+pipelineSequence,{credentials:"same-origin",cache:"no-store",signal:controller.signal})}
  finally{clearTimeout(timer)}
  if(!response.ok)throw Error("worker_telemetry_unavailable");
  const payload=await response.json();
  if(payload.source!=="worker_runtime_telemetry"||!Array.isArray(payload.events))throw Error("invalid_worker_telemetry");
  const relay=el("traceRelayStatus");relay.dataset.state=payload.events.length?"active":"idle";
  relay.textContent=payload.events.length?
   copy("وصلت قراءات ملفات موثّقة أثناء التشغيل · ","Observed file reads arrived during processing · ")+stamp(payload.checked_at_utc,true):
   copy("بث انتقالات الملفات متصل · لا انتقالات جديدة الآن · ","File handoff feed connected · no new transfers now · ")+stamp(payload.checked_at_utc,true);
  if(payload.sequence<pipelineSequence)pipelineSequence=0;
  else pipelineSequence=payload.sequence;
  const nodes=new Set(pipelineStages.map(row=>row[0]));
  const recent=[];
  for(const event of payload.events){
   if(!nodes.has(event.from)||!nodes.has(event.to)||!event.artifact||!Number.isFinite(Date.parse(event.observed_utc)))continue;
   const item={...event,kind:"artifact_handoff",live:true};
   livePipelineEvents.set(item.from+"|"+item.to,item);
   if(age(item.observed_utc)<8)recent.push(item);
  }
  if(payload.events.length){
   if(!pipelinePinned&&recent.length){selectedHandoff=recent.at(-1);pipelineSelected=selectedHandoff.to}
   paintPipeline();
   if(recent.length&&!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches){
    if(pipelineFrame)cancelAnimationFrame(pipelineFrame);
    const started=performance.now(),moving=recent.slice(-12);
    const animate=now=>{
     const progress=Math.min(1,(now-started)/900);
     drawPipeline(moving.map(item=>({...item,progress})));
     if(progress<1)pipelineFrame=requestAnimationFrame(animate);
     else{pipelineFrame=0;drawPipeline()}
    };
    pipelineFrame=requestAnimationFrame(animate);
   }
  }
 }catch{
  const relay=el("traceRelayStatus");relay.dataset.state="unavailable";
  relay.textContent=copy("بث انتقالات الملفات غير متاح؛ لا يمكن إثبات حركة فورية الآن.","File handoff feed unavailable; live motion cannot be verified now.");
 }finally{pipelineEventRequest=false}
}
function observeVenueFlow(event){
 const update=event.detail;
 if(!update?.venue||!update?.symbol||!Number.isFinite(update.last_ms)||Date.now()-update.last_ms>30000)return;
 const source="venue_"+update.venue.toLowerCase();
 if(!pipelineStages.some(row=>row[0]===source))return;
 liveObservation=update;
 liveObservations.set(source,update);
 if(pipelineFrame)cancelAnimationFrame(pipelineFrame);
 const moving={from:source,to:"market_view",artifact:"spot_execution_observation",live:true,...update};
 if(!pipelinePinned){selectedHandoff=moving;pipelineSelected="market_view"}
 paintPipeline();
 if(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)return;
 const start=performance.now(),pulse=now=>{
  const progress=Math.min(1,(now-start)/900);
  drawPipeline({...moving,progress});
  if(progress<1)pipelineFrame=requestAnimationFrame(pulse);
  else{pipelineFrame=0;drawPipeline()}
 };
 pipelineFrame=requestAnimationFrame(pulse);
}
window.addEventListener("stamp:venueflow",observeVenueFlow);
function paintSystem(){
 const root=el("systemStages");
 if(!root)return;
 const report=systemSnapshot, health=report?.health, lab=report?.laboratory, activity=report?.forecast_activity;
 const status=value=>({success:copy("نجحت","Passed"),failure:copy("فشلت","Failed"),skipped:copy("تُخطّيت","Skipped")})[value]||copy("غير موثّقة","Unverified");
 const checks=health?.steps||{};
 const rows=[
  ["monitor",copy("رصد السوق","Market collection"),report?.observed_utc?stamp(report.observed_utc,true):"—","venuesSection"],
  ["archive",copy("حفظ الشموع المغلقة","Closed-candle archive"),report?.candles?.["15m"]?.length!=null?number(report.candles["15m"].length)+" · 15m":"—","trading"],
  ["research",copy("التدريب وإصدار التوقعات","Training and forecast issuance"),activity?.last_forecast_utc?stamp(activity.last_forecast_utc,true):"—","trading"],
  ["audit",copy("قياس نتائج التوقعات","Outcome measurement"),report?.forecast_review?.rows?number(report.forecast_review.rows.filter(row=>n(row.actual_price)>0).length)+" · "+copy("نتيجة في السجل المعروض","outcomes in displayed history"):"—","trading"],
  ["governance",copy("الاعتماد الآلي","Automatic model review"),copy("القرارات حسب الأفق في الجدول","Decisions by horizon in the table"),"systemCenter"],
  ["lab",copy("تجارب المختبر","Sandbox experiments"),lab?.evaluated!=null?number(lab.evaluated)+" · "+copy("تجربة مقيّمة","experiments evaluated"):"—","labCenter"],
  ["dashboard",copy("بناء اللوحة","Dashboard build"),health?.production_smoke_passed===true?copy("نجح فحص الإنتاج","Production smoke check passed"):"—","globalMarketFlow"]
 ];
 const markup=rows.map(([key,title,evidence,target])=>{
  const state=key==="lab"?lab?.status:checks[key];
  const label=key==="lab"?(state==="healthy"?copy("سليم","Healthy"):state==="degraded"?copy("يحتاج مراجعة","Degraded"):status(null)):status(state);
  return '<li data-stage-state="'+esc(state||"unknown")+'"><a href="#'+target+'"><strong>'+esc(title)+'</strong><span>'+esc(label)+'</span><small>'+esc(evidence)+'</small></a></li>';
 }).join("");
 if(root.innerHTML!==markup)root.innerHTML=markup;
 const decisions=Object.entries(report?.model_decisions||{}).filter(([,decision])=>decision&&typeof decision==="object");
 const approved=decisions.filter(([,d])=>d.status==="approved").length;
 set("systemVerdict",!report?copy("بانتظار سجل التشغيل","Awaiting run evidence"):
  (health?.passed===true?copy("آخر دورة مسجّلة نجحت","Last recorded pipeline passed"):
   health?.passed===false?copy("آخر دورة مسجّلة لم تكتمل بنجاح","Last recorded pipeline failed"):copy("حالة الدورة غير موثّقة","Pipeline status unverified"))+
  (decisions.length?" · "+copy("آفاق معتمدة","Approved horizons")+" "+approved+" / "+decisions.length:""));
 const checked=age(health?.at);
 set("systemRun",health?.at?copy("آخر سجل لدورة STAMP","Latest STAMP run record")+" · "+stamp(health.at,true)+
  (checked!==null&&checked>10800?" · "+copy("السجل متأخر","Delayed record"):""):"");
 const table=el("systemModels");
 const modelRows=decisions.map(([h,d])=>"<tr><th>"+esc(h)+"</th><td>"+esc(d.selected_model||"—")+"</td><td>"+
  esc(d.status==="approved"?t("approved"):d.status==="experimental"?t("experimental"):t("unknown"))+"</td><td>"+
  esc(n(d.forward_validation?.skill_vs_zero)===null?"—":pct(d.forward_validation.skill_vs_zero*100))+"</td><td>"+
  esc(d.prospective?.samples??"—")+"</td></tr>").join("");
 if(table.innerHTML!==modelRows)table.innerHTML=modelRows;
}
function render(result){
 if(!result||!result.market)throw Error("Invalid research payload");
 data=result;
 if(selectedAsset==="STAMPUSDT")systemSnapshot=result;
 paintSystem();
 paintPipeline();
 if(selectedAsset==="STAMPUSDT"&&result.laboratory)lastLaboratory=result.laboratory;
 if(selectedAsset==="STAMPUSDT"&&result.operations)operationsReport=result.operations;
 paintOperations();
 const liquidity=result.liquidity||{};
 const flow=result.market?.trades;
 set("mapFlow",n(flow?.net_aggressive_notional_usdt)!==null?number(flow.net_aggressive_notional_usdt)+" USDT · "+copy("فرق العينة","Sample difference"):
  copy("السوق أو زوج محدد","Whole market or a pair"));
 const lab=systemSnapshot?.laboratory, health=systemSnapshot?.health;
 set("mapLab",lab?.evaluated!=null?number(lab.evaluated)+" · "+copy("تجربة مقيّمة","experiments evaluated"):"—");
 set("mapSystem",health?.passed===true?copy("آخر دورة نجحت","Last run passed"):health?.passed===false?copy("آخر دورة لم تنجح","Last run failed"):"—");
 set("liquidity",money(liquidity.liquidity_usd));
 set("marketCap",money(liquidity.market_cap_usd));
 set("liquidityTime",liquidity.observed_utc?"DEX · "+stamp(liquidity.observed_utc)+(liquidity.source?" · "+liquidity.source:""):"");
 set("sourceLine",(assetCache?.venue||"MEXC")+" / USDT · "+t("candles")+" · "+stamp(result.model_observed_utc||result.observed_utc));
 set("chartZone",zone);
 if(result.live_quote?.status==="fresh")acceptQuote(result.live_quote);
 renderIntelligence();renderForecasts();renderChart();renderAssurance();renderInputs();
 paintQuote();
}

const PAIR_SYMBOL=/^[A-Z0-9]{1,22}USDT$/;
const starterPairs=["STAMPUSDT","BTCUSDT","ETHUSDT","SOLUSDT"];
const pairLabel=pair=>pair.replace(/USDT$/," / USDT");
let selectedAsset="STAMPUSDT",assetCache=null,assetPending=null,lastLaboratory={};
let assetPairs=starterPairs,assetVenueMap={},catalogSources={},catalogState="loading",catalogPending=false,catalogObserved=null,visiblePairs=60;
const pairCatalog=values=>Array.isArray(values)?[...new Set(values.filter(value=>typeof value==="string"&&PAIR_SYMBOL.test(value)))].sort():[];
let favorites=[];
try{
 favorites=pairCatalog(JSON.parse(localStorage.getItem("stamp_favorite_pairs")||"[]"));
 const saved=JSON.parse(localStorage.getItem("stamp_asset_catalog")||"null");
 const savedPairs=pairCatalog(saved?.pairs);
 if(savedPairs.length){
  assetPairs=pairCatalog([...starterPairs,...savedPairs]);
  assetVenueMap=saved.venues||{};
  catalogSources=saved.sources||{};
  catalogState="cached";
  catalogObserved=saved.observed;
 }
}catch{}
function favoritesUi(){
 const select=el("favoriteSelect"),button=el("assetFavorite"),favorite=favorites.includes(selectedAsset);
 select.innerHTML='<option value="">'+copy("المفضلة","Favorites")+'</option>'+favorites.map(v=>'<option value="'+esc(v)+'">'+esc(pairLabel(v))+'</option>').join("");
 select.value=favorite?selectedAsset:"";
 button.textContent=favorite?"★":"☆";
 button.setAttribute("aria-pressed",String(favorite));
 button.setAttribute("aria-label",copy("الأزواج المفضلة","Favorite pairs"));
}
function searchPairs(){
 const query=el("assetSearch").value.trim().toUpperCase().replace(/[\s/-]/g,"");
 if(!query)return {query,exact:null,matches:[...new Set([...starterPairs,...favorites,...assetPairs])]};
 if(!/^[A-Z0-9]{1,26}$/.test(query))return {query,exact:null,matches:[]};
 const exact=query.endsWith("USDT")?query:query+"USDT";
 const fullPair=query.endsWith("USDT");
 const matches=assetPairs.filter(pair=>(fullPair?pair:pair.slice(0,-4)).includes(query));
 matches.sort((a,b)=>Number(b===exact)-Number(a===exact)||Number(b.startsWith(query))-Number(a.startsWith(query))||a.localeCompare(b));
 return {query,exact:PAIR_SYMBOL.test(exact)?exact:null,matches};
}
function renderAssetPicker(){
 const {query,exact,matches}=searchPairs();
 const direct=exact&&matches.length===0;
 const choices=matches.slice(0,visiblePairs);
 if(direct)choices.push(exact);
 el("assetResults").innerHTML=choices.map(pair=>'<li><button type="button" data-pair="'+esc(pair)+'"'+
  (pair===selectedAsset?' aria-current="true"':'')+'><bdi>'+esc(pairLabel(pair))+'</bdi>'+
  (direct?'<small>'+copy("جلب بيانات الزوج","Load pair data")+'</small>':pair===selectedAsset?'<small>'+copy("محدد","Selected")+'</small>':assetVenueMap[pair]?.length?'<small>'+esc(assetVenueMap[pair].join(" · "))+'</small>':'')+
  '</button></li>').join("");
 el("assetMore").hidden=matches.length<=visiblePairs;
 el("assetNoResults").hidden=choices.length>0;
 set("assetNoResults",query?copy("لم يُعثر على زوج بهذا الرمز","No pair matches this symbol"):"");
 const state=catalogState==="ready"
  ? (query?matches.length:assetPairs.length)+copy(" زوج · "," pairs · ")+Object.values(catalogSources).filter(row=>row.status==="ok").length+" / 7 "+copy("منصات استجابت","venues responded")
  : catalogState==="cached"?copy("القائمة المحفوظة · ","Saved catalog · ")+stamp(catalogObserved)
  : catalogState==="loading"?copy("جارٍ تحميل قائمة الأزواج","Loading pair catalog")
  : copy("تعذّر تحديث القائمة. يمكنك إدخال رمز الزوج.","Catalog unavailable. Enter a pair symbol to load it.");
 set("assetCatalogStatus",state);
}
async function loadAssetUniverse(){
 if(offline||catalogPending)return;
 catalogPending=true;
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),14000);
 try{
  const response=await fetch("/api/assets/universe",{credentials:"same-origin",cache:"no-store",signal:controller.signal});
  if(response.status===401){window.location.href="/login";return}
  if(!response.ok)throw Error("catalog");
  const result=await response.json(),pairs=pairCatalog(result.pairs);
  if(!pairs.length)throw Error("empty catalog");
  assetPairs=pairCatalog([...starterPairs,...pairs]);
  assetVenueMap=result.venues||{};
  catalogSources=result.sources||{};
  catalogState="ready";
  catalogObserved=result.retrieved_at_utc;
  try{localStorage.setItem("stamp_asset_catalog",JSON.stringify({pairs,venues:assetVenueMap,sources:catalogSources,observed:catalogObserved}))}catch{}
 }catch{
  if(catalogState!=="cached")catalogState="unavailable";
 }finally{
  clearTimeout(timer);
  catalogPending=false;
  if(el("assetPicker")?.open)renderAssetPicker();
 }
}
function choosePair(pair){
 if(!PAIR_SYMBOL.test(pair))return;
 el("assetPicker").close();
 selectAsset(pair);
}

async function selectAsset(symbol){
 if(!PAIR_SYMBOL.test(symbol)||symbol===selectedAsset||offline)return;
 stopReplay();
 selectedAsset=symbol;
 window.dispatchEvent(new CustomEvent("stamp:assetchange",{detail:{symbol}}));
 eventRequest?.abort();
 eventRequest=null;
 eventPayload=null;
 eventState="loading";
 eventSelection=null;
 eventBars=[];
 nextEventPoll=0;
 data=null;
 assetCache=null;
 quoteLive=null;
 liveCandles.clear();
 closedLiveCandles.clear();
 resetMarketPoll();
 inspectingChart=false;
 venueTopology=null;
 set("mapVenues","—");
 set("mapTrade","—");
 set("mapFlow","—");
 sceneFocus="validation";
 microRequest++;
 assetPending?.abort();
 assetPending=null;
 set("coinName",pairLabel(symbol));
 set("assetSelected",pairLabel(symbol));
 set("venueLine",(assetVenueMap[symbol]||[]).join(" · ")||"—");
 for(const id of ["price","change","volume","high24","low24","liquidity","marketCap","forecastSummary"])set(id,"—");
 for(const id of ["observed","liquidityTime","dataAge","streamStatus","forecastCards","assetCorrelation","sceneNodeDetail","venueMetrics","connectorAudit","engineAudit","microStatus","microMetrics"])set(id,"");
 el("warning").hidden=true;
 el("status").className="";
 set("status",copy("جارٍ التحميل","Loading"));
 set("assetMessage",copy("جارٍ تحميل البيانات","Loading data"));
 el("forecastHorizon").disabled=symbol!=="STAMPUSDT";
 startStream();
 const loadingPair=refresh();
 renderForecasts();renderChart();renderAssurance();renderInputs();
 pollChartEvents(true);
 favoritesUi();
 drawNeuralScene();
 updateVenueNetwork();
 await loadingPair;
}
async function loadSelectedAsset(){
 const symbol=selectedAsset;
 if(assetPending)return;
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
 assetPending=controller;
 try{
  const r=await fetch("/api/assets/snapshot?symbol="+encodeURIComponent(symbol),{credentials:"same-origin",cache:"no-store",signal:controller.signal});
  if(assetPending!==controller)return;
  if(r.status===401){window.location.href="/login";return}
  if(!r.ok)throw Error("HTTP "+r.status);
  const fetched=await r.json();
  if(selectedAsset!==symbol||assetPending!==controller)return;
  if(fetched.symbol!==symbol||!fetched.ticker)throw Error("Invalid pair snapshot");
  assetCache=fetched;
  showSelectedAsset();
  if(fetched.venue==="MEXC"){startStream();pollMarket(true)}
 }catch{
  if(assetPending!==controller||symbol!==selectedAsset)return;
  set("assetMessage",copy("تعذّر تحميل سجل الزوج","Pair history could not be loaded"));
  if(!quoteLive){
   set("status",assetCache?t("staleData"):t("unavailable"));
   el("status").className="stale";
  }
 }finally{
  clearTimeout(timer);
  if(assetPending===controller)assetPending=null;
 }
}
function showSelectedAsset(){
 if(selectedAsset==="STAMPUSDT"||!assetCache)return;
 const snapshot=assetCache,q=snapshot.ticker||{};
 const px=n(q.lastPrice),pct24=n(q.priceChangePercent);
 const market={price:px,change:pct24===null?null:pct24/100,volume:n(q.quoteVolume),high_24h:n(q.highPrice),low_24h:n(q.lowPrice)};
 const time=n(q.closeTime),now=Date.now();
 const observed=time&&time>0&&time<=now+5000?new Date(time).toISOString():snapshot.retrieved_at_utc;
 const alternate={market,candles:snapshot.candles||{},asset_research_forecasts:snapshot.research_forecasts||{},observed_utc:observed};
 render(alternate);
 set("venueLine",snapshot.venue+" · "+(snapshot.available_venues||[]).join(" / "));
 acceptQuote({status:"snapshot",source:snapshot.source,transport:"rest",symbol,price:px,provider_at_utc:observed,
  retrieved_at_utc:snapshot.retrieved_at_utc,stats_at_utc:observed,change_24h_pct:pct24,
  volume_24h_usdt:n(q.quoteVolume),high_24h:n(q.highPrice),low_24h:n(q.lowPrice)});
 set("assetMessage",Object.values(snapshot.candles||{}).reduce((total,rows)=>total+rows.length,0)+copy(" شمعة مسترجعة"," candles retrieved"));
}
async function compareAssets(){
 const pair=selectedAsset,other=el("assetCompare").value,container=el("assetCorrelation");
 if(other===pair){container.textContent=copy("اختر زوجًا مختلفًا للمقارنة","Select a different pair to compare");return}
 container.textContent=copy("جارٍ مقارنة البيانات…","Comparing pairs…");
 try{
 const response=await fetch("/api/assets/compare?primary="+encodeURIComponent(pair)+"&secondary="+encodeURIComponent(other),{credentials:"same-origin",cache:"no-store"});
 if(!response.ok)throw Error("HTTP "+response.status);
 const r=await response.json();if(pair!==selectedAsset||other!==el("assetCompare").value)return;
 const text=(v)=>v===null?"—":String(v);
 container.innerHTML='<strong>'+esc(r.primary)+" ↔ "+esc(r.secondary)+'</strong> · ارتباط العوائد الساعة نفسها: '+esc(text(r.correlation))+' · عينات '+esc(r.hourly_samples)+
 '<div>'+Object.entries(r.lead_lag_hours||{}).map(([k,v])=>esc(r.secondary)+' قبل '+esc(k)+' ساعة: '+esc(text(v.correlation))+' (n='+esc(v.samples)+')').join(' | ')+'</div><small>'+esc(r.interpretation)+'</small>';
 }catch(e){if(pair===selectedAsset)container.textContent=copy("تعذّرت المقارنة","Comparison unavailable")+" · "+e.message}
}
async function updateWorkerStatus(){
 try{
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),9000);
  let r;try{r=await fetch("/api/worker-status",{signal:ctl.signal,credentials:"same-origin",cache:"no-store"})}finally{clearTimeout(timer)}
  if(!r.ok)throw Error("HTTP "+r.status);
  const d=await r.json();
  set("workerState",d.healthy?copy("يعمل","Running"):copy("الحالة متأخرة","Status delayed"));
  el("workerState").className=d.healthy?"fresh":"stale";
  set("workerCoverage",copy("الأزواج المكتشفة ","Pairs discovered ")+(d.discovered??"—")+" · "+copy("آخر دفعة ","Last batch ")+(d.processed??"—"));
  set("workerCycle",copy("آخر دورة","Last cycle")+" · "+stamp(d.last_cycle_utc)+" · "+(d.cycles??"—"));
  set("workerStorage",d.storage==="postgres"?copy("تخزين دائم · PostgreSQL","Persistent storage · PostgreSQL"):copy("تخزين غير دائم","Non-persistent storage"));
 }catch{
  set("workerState",copy("تعذّر التحقق","Unavailable"));
  el("workerState").className="stale";
 }
}
const originalCopy=new Map();
function translate(){
 document.documentElement.lang=lang;
 document.documentElement.dir=lang==="ar"?"rtl":"ltr";
 const mapLabels={tradeTab:"التداول",flowTab:"تدفقات السوق",venuesTab:"المنصات",labTab:"المختبر",systemTab:"النظام"};
 for(const [id,label] of Object.entries(mapLabels)){
  const node=el(id);
  if(node?.dataset.labelEn)node.setAttribute("aria-label",copy(label,node.dataset.labelEn));
 }
 document.querySelectorAll("[data-i18n]").forEach(node=>{node.textContent=t(node.dataset.i18n)});
 document.querySelectorAll("[data-copy], [data-placeholder]").forEach(node=>{
  const attribute=node.hasAttribute("data-placeholder")?"placeholder":null;
  if(!originalCopy.has(node))originalCopy.set(node,attribute?node.getAttribute(attribute):node.textContent);
  const value=lang==="ar"?originalCopy.get(node):node.dataset.placeholder||node.dataset.copy;
  if(attribute)node.setAttribute(attribute,value);
  else node.textContent=value;
 });
 el("langSelect").value=lang;
 el("zoneSelect").value=zone;
 favoritesUi();
 paintSystem();
 paintPipeline();
 paintOperations();
 if(chart)chart.applyOptions({localization:{timeFormatter:time=>formatChartTime(time)},timeScale:{tickMarkFormatter:(time,type)=>formatChartTime(time,type>2)}});
}
async function request(path){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);try{const response=await fetch(path,{credentials:"same-origin",cache:"no-store",signal:controller.signal,headers:{Accept:"application/json"}});if(response.status===401){window.location.href="/login";throw Error("AUTH_401")}if(!response.ok)throw Error("HTTP "+response.status);const payload=await response.json();if(!payload?.market)throw Error("Invalid payload");return payload}finally{clearTimeout(timer)}}
function embeddedResearch(){
 const node=el("stamp-snapshot");
 return node?JSON.parse(node.content?node.content.textContent:node.textContent):null;
}
async function refresh(){
 if(selectedAsset!=="STAMPUSDT"){await loadSelectedAsset();return}
 if(loading)return;
 loading=true;
 el("refresh").disabled=true;
 try{
  let result;
  if(offline)result=embeddedResearch();
  else{
   try{result=await request("/api/dashboard")}
   catch(error){
    if(error.message==="AUTH_401")throw error;
    try{result=await request("/api/dashboard-lite")}
    catch(liteError){
     if(liteError.message==="AUTH_401")throw liteError;
     result=embeddedResearch();
     if(!result)throw liteError;
    }
   }
   // The older quote endpoint still serves clients without the streaming asset.
   if(!window.StampMarket&&!isFreshQuote(result?.live_quote)){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),7000);
    try{
     const response=await fetch("/api/quote",{credentials:"same-origin",cache:"no-store",signal:controller.signal});
     if(response.status===401){window.location.href="/login";throw Error("AUTH_401")}
     if(response.ok){
      const body=await response.json();
      if(body.quote?.status==="fresh")result={...result,live_quote:body.quote};
     }
    }catch(error){if(error.message==="AUTH_401")throw error}
    finally{clearTimeout(timer)}
   }
  }
  if(selectedAsset==="STAMPUSDT")render(result);
 }catch(error){
  if(selectedAsset==="STAMPUSDT"&&!quoteLive){set("status",t("unavailable"));el("warning").hidden=false;set("warning",error.message)}
 }finally{loading=false;el("refresh").disabled=false}
}

function exportCsv(){const bars=visibleCandles(),lines=["utc_open,open,high,low,close,volume",...bars.map(c=>[new Date(c.t).toISOString(),c.o,c.h,c.l,c.c,c.v??""].join(","))].join("\r\n");const url=URL.createObjectURL(new Blob([lines],{type:"text/csv"})),a=document.createElement("a");a.href=url;a.download=selectedAsset+"_"+frame+".csv";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function setFrame(value){
 if(!FRAME_MS[value])return;
 const previousSource=FRAME_SOURCE[frame]||frame;
 if(frame!==value)stopReplay();
 frame=value;
 eventSelection=null;
 inspectingChart=false;
 for(const button of document.querySelectorAll("#frames button[data-frame]"))button.setAttribute("aria-pressed",String(button.dataset.frame===value));
 renderForecasts();
 renderChart();
 if(previousSource!==(FRAME_SOURCE[frame]||frame)&&window.StampMarket){resetMarketPoll();pollMarket(true)}
}
for(const button of document.querySelectorAll("#frames button[data-frame]"))button.addEventListener("click",()=>setFrame(button.dataset.frame));
for(const button of document.querySelectorAll("[data-layer]")){
 const key=button.dataset.layer;
 button.setAttribute("aria-pressed",String(enabledLayers.has(key)));
 button.addEventListener("click",()=>{
  if(enabledLayers.has(key))enabledLayers.delete(key);
  else enabledLayers.add(key);
  button.setAttribute("aria-pressed",String(enabledLayers.has(key)));
  try{localStorage.setItem("stamp_chart_layers",JSON.stringify([...enabledLayers]))}catch{}
  if(key==="elliott"&&enabledLayers.has(key)&&frame!=="1h"&&frame!=="4h"){setFrame("1h");return}
  renderTechnical();
  if(enabledLayers.has(key)&&technicalStart!==null)resetChartRange(true);
 });
}
function setHorizon(value){
 if(!["1h","4h","24h","7d"].includes(value))return;
 horizon=value;
 el("forecastHorizon").value=value;
 renderForecasts();renderChart();renderAssurance();renderInputs();
}
el("forecastHorizon").addEventListener("change",event=>setHorizon(event.target.value));
el("forecastCards").addEventListener("click",event=>{
 const button=event.target.closest("[data-horizon]");
 if(button)setHorizon(button.dataset.horizon);
});
for(const [id,action] of [["zoomIn","in"],["zoomOut","out"],["panEarlier","earlier"],["panLater","later"]])el(id).addEventListener("click",()=>navigateChart(action));
el("chart").addEventListener("keydown",event=>{const actions={"+":"in","=":"in","-":"out","ArrowLeft":"earlier","ArrowRight":"later"};if(actions[event.key]){event.preventDefault();navigateChart(actions[event.key])}else if(event.key==="Home"){event.preventDefault();resetChartRange()}});
el("replayToggle")?.addEventListener("click",()=>{
 if(replay){stopReplay();renderChart();return}
 const bars=chartCandles(frame).slice(-720);
 if(bars.length<3)return;
 replay={bars,index:Math.max(1,bars.length-25)};
 seekReplay(replay.index);
});
el("replayPosition")?.addEventListener("input",event=>{pauseReplay();seekReplay(Number(event.target.value))});
el("replayBack")?.addEventListener("click",()=>{pauseReplay();if(replay)seekReplay(replay.index-1)});
el("replayStep")?.addEventListener("click",()=>{pauseReplay();if(replay)seekReplay(replay.index+1)});
el("replayPlay")?.addEventListener("click",()=>{
 if(!replay)return;
 if(replayTimer)pauseReplay();
 else replayTimer=setInterval(()=>seekReplay(replay.index+1),750);
 renderChart();
});
el("eventToggle")?.addEventListener("click",()=>{
 eventEnabled=!eventEnabled;
 el("eventToggle").setAttribute("aria-pressed",String(eventEnabled));
 el("chartEvents").hidden=!eventEnabled;
 eventSelection=null;
 renderChartEvents();
 if(eventEnabled)pollChartEvents();
});
el("evidenceLatest")?.addEventListener("click",()=>{eventSelection=null;renderChartEvents()});
el("eventAll")?.addEventListener("click",()=>{eventSelection=null;renderChartEvents()});
el("chartEventList")?.addEventListener("click",event=>{
 const button=event.target.closest("button[data-event-candle]");
 if(button)focusEventCandle(Number(button.dataset.eventCandle));
});
el("refresh").addEventListener("click",()=>{refresh();pollChartEvents(true);if(window.StampMarket)pollMarket(true)});
el("resetChart").addEventListener("click",resetChartRange);el("exportCandles").addEventListener("click",exportCsv);
el("settingsButton").addEventListener("click",()=>el("settings").showModal());
el("logoutButton").addEventListener("click",async()=>{try{await fetch("/logout",{method:"POST",credentials:"same-origin"})}finally{window.location.href="/"}});
el("langSelect").addEventListener("change",event=>{lang=event.target.value==="en"?"en":"ar";try{localStorage.setItem("stamp_language",lang)}catch(e){}translate();if(data)render(data)});
el("zoneSelect").addEventListener("change",event=>{zone=["UTC","Asia/Baghdad","Asia/Makassar"].includes(event.target.value)?event.target.value:"UTC";try{localStorage.setItem("stamp_timezone",zone)}catch(e){}translate();if(data)render(data)});
el("diagnose").addEventListener("click",async()=>{try{const response=await fetch("/api/status",{credentials:"same-origin",cache:"no-store"}),s=await response.json();set("diagnosticResult","API: "+s.api+" · "+stamp(s.observation_utc)+" · "+(s.research_fresh?"FRESH":"ARCHIVED"))}catch(error){set("diagnosticResult",error.message)}});
el("assetPickerButton").disabled=offline;
el("assetPickerButton").addEventListener("click",()=>{
 const picker=el("assetPicker");
 if(picker.open)return;
 el("assetSearch").value="";
 visiblePairs=60;
 renderAssetPicker();
 picker.showModal();
 el("assetResultScroll").scrollTop=0;
 if(catalogState!=="ready")loadAssetUniverse();
});
el("assetSearch").addEventListener("input",()=>{
 visiblePairs=60;
 renderAssetPicker();
 el("assetResultScroll").scrollTop=0;
});
el("assetSearchForm").addEventListener("submit",event=>{
 event.preventDefault();
 const {exact,matches}=searchPairs();
 if(exact&&(matches.includes(exact)||matches.length===0))choosePair(exact);
 else if(matches.length===1)choosePair(matches[0]);
});
el("assetResults").addEventListener("click",event=>{
 const button=event.target.closest("button[data-pair]");
 if(button)choosePair(button.dataset.pair);
});
el("assetMore").addEventListener("click",()=>{
 const scroller=el("assetResultScroll"),position=scroller.scrollTop;
 visiblePairs+=60;
 renderAssetPicker();
 scroller.scrollTop=position;
});
el("favoriteSelect").addEventListener("change",e=>{if(e.target.value)selectAsset(e.target.value)});
el("assetFavorite").addEventListener("click",()=>{if(favorites.includes(selectedAsset))favorites=favorites.filter(v=>v!==selectedAsset);else favorites.push(selectedAsset);
 try{localStorage.setItem("stamp_favorite_pairs",JSON.stringify(favorites))}catch(e){}favoritesUi()});
el("compareAssets").addEventListener("click",compareAssets);
el("auditVenues")?.addEventListener("click",auditVenueConnections);
el("venueForm")?.addEventListener("submit",event=>{
 event.preventDefault();
 loadMicrostructure(el("venueSelect").value);
});
translate();setupPipeline();initializeSceneControls();refresh();
if(!offline){
 loadAssetUniverse();updateVenueNetwork();startStream();updateWorkerStatus();pollChartEvents(true);pollPipelineLive();pollPipelineEvents();
 setInterval(()=>{if(!document.hidden)pollPipelineLive()},60000);
 setInterval(()=>{if(!document.hidden)pollPipelineEvents()},5000);
 if(window.StampEvents)setInterval(()=>{if(!document.hidden){pollChartEvents();paintOperations()}},15000);
 setInterval(()=>{if(!document.hidden)updateVenueNetwork()},60000);
 setInterval(()=>{if(!document.hidden)updateWorkerStatus()},30000);
 document.addEventListener?.("stamp:tabchange",()=>{
  if(!el("trading").hidden){
   setTimeout(()=>{
    if(el("trading").hidden)return;
    updateFreshness();
    if(window.StampMarket)pollMarket(true);
    paintMarketLens(true);
    refresh();
   },0);
  }
  if(!el("venuesSection").hidden)updateVenueNetwork();
  if(!el("labCenter").hidden)updateWorkerStatus();
 });
 setInterval(()=>{if(!document.hidden&&!el("trading").hidden)refresh()},60000);
 if(window.StampMarket){
  pollMarket(true);
  setInterval(()=>{if(!document.hidden){if(!el("trading").hidden){updateFreshness();pollMarket()}}},1000);
  const pause=()=>{stream?.stop();resetMarketPoll();if(replayTimer){pauseReplay();renderChart()}};
  const resume=()=>{startStream();pollMarket(true);refresh()};
  document.addEventListener("visibilitychange",()=>{if(document.hidden)pause();else resume()});
  window.addEventListener("online",resume);
  window.addEventListener("pagehide",pause);
  window.addEventListener("pageshow",event=>{if(event.persisted)resume()});
 }
}
})();
