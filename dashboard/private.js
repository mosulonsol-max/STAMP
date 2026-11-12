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
  if(eventEnabled&&typeof param.time==="number"&&param.seriesData?.get(candleSeries)){
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
const nodes3d=[
 ["MEXC",-390,-160,-160],["Binance",-370,-80,140],["OKX",-370,25,-65],["Bybit",-360,145,170],["KuCoin",-380,230,-140],["Gate",-365,-235,75],["Bitget",-350,305,125],
 ["VALIDATION",-80,0,0],["AI ENGINE",170,0,0],["DASHBOARD",395,0,0]
];
function drawNeuralScene(){
 const scene=el("venueNetwork");
 if(!scene||typeof document.createElementNS!=="function")return;
 const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
 svg.setAttribute("viewBox","0 0 790 390");
 svg.setAttribute("aria-label",copy("شبكة اتصال المنصات","Exchange connections"));
 const mk=(tag,attrs,txt,parent=svg)=>{
  const node=document.createElementNS(svg.namespaceURI,tag);
  for(const [key,value] of Object.entries(attrs))node.setAttribute(key,String(value));
  if(txt!==undefined)node.textContent=txt;
  parent.appendChild(node);
  return node;
 };
 const cy=Math.cos(camera.yaw),sy=Math.sin(camera.yaw),cp=Math.cos(camera.pitch),sp=Math.sin(camera.pitch);
 const project=(x,y,z)=>{
  const X=x*cy-z*sy,Z=x*sy+z*cy,Y=y*cp-Z*sp,depth=y*sp+Z*cp;
  const scale=600/(1030+depth*.6)*camera.zoom;
  return {x:395+X*scale,y:194+Y*scale,z:depth,scale};
 };
 const points=nodes3d.map(([,x,y,z])=>project(x,y-22,z));
 for(let z=-360;z<=360;z+=90){
  const a=project(-480,275,z),b=project(470,275,z);
  mk("line",{x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:"#263442"});
 }
 for(let x=-450;x<=450;x+=90){
  const a=project(x,275,-360),b=project(x,275,360);
  mk("line",{x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:"#263442"});
 }
 const venueCount=7;
 const links=[...Array.from({length:venueCount},(_,i)=>[i,7]),[7,8],[8,9]];
 const active=i=>i<venueCount?venueTopology?.venues?.[nodes3d[i][0]]?.status==="ok":venueTopology?.available_venues>0;
 const animate=!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
 links.forEach(([i,j],idx)=>{
  const a=points[i],b=points[j],good=active(i);
  const d="M"+a.x+" "+a.y+" Q"+((a.x+b.x)/2)+" "+((a.y+b.y)/2-15*camera.zoom)+" "+b.x+" "+b.y;
  const id="venue-link-"+idx;
  mk("path",{id,d,fill:"none",stroke:good?"#68b9ac":"#485668","stroke-width":good?1.7:1,"stroke-dasharray":good?"none":"4 6"});
  if(good&&animate){
   const dot=mk("circle",{r:2.5,fill:"#a7f5e5"});
   const motion=mk("animateMotion",{dur:(2.3+idx*.19)+"s",begin:(-idx*.3)+"s",repeatCount:"indefinite"},undefined,dot);
   mk("mpath",{href:"#"+id},undefined,motion);
  }
 });
 const detail=el("sceneNodeDetail");
 const stages=["VALIDATION","MODEL","DASHBOARD"];
 const ordered=points.map((point,i)=>({...point,i})).sort((a,b)=>b.z-a.z);
 for(const p of ordered){
  const i=p.i,venue=i<venueCount,name=venue?nodes3d[i][0]:stages[i-venueCount],good=active(i);
  const r=venue?10:15;
  const group=mk("g",venue?{tabindex:0,role:"button","aria-label":name}:{});
  mk("circle",{cx:p.x,cy:p.y,r:r+6,fill:good?"#213f3e":"#202a36"},undefined,group);
  mk("circle",{cx:p.x,cy:p.y,r,fill:good?"#80e3d0":"#566679",stroke:"#10161e","stroke-width":2},undefined,group);
  mk("text",{x:p.x,y:p.y+r+19,"text-anchor":"middle",fill:"#d9e4ef","font-size":14,"font-weight":600},name,group);
  if(venue){
   const inspect=()=>{
    const quote=venueTopology?.venues?.[name];
    detail.textContent=quote?.status==="ok"
     ? name+" · Bid "+price(quote.bid)+" / Ask "+price(quote.ask)+" · "+stamp(quote.retrieved_at_utc)
     : name+" · "+copy("السعر غير متاح","Quote unavailable");
    el("venueSelect").value=name;
    loadMicrostructure(name);
   };
   group.addEventListener("click",inspect);
   group.addEventListener("keydown",event=>{
    if(event.key==="Enter"||event.key===" "){event.preventDefault();inspect()}
   });
  }
 }
 scene.replaceChildren(svg);
}
function initializeSceneControls(){
 const scene=el("venueNetwork");
 if(!scene)return;
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
 }catch(err){if(requestId===venuePollId){
  venueTopology=null;
  drawNeuralScene();
  status.textContent=copy("تعذّر تحديث المنصات","Could not refresh exchanges");
  metrics.textContent=err.message;
 }return}
 venueTopology=payload;
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
function renderChartEvents(bars=eventBars){
 if(!window.StampEvents||!el("chartEvents"))return;
 eventBars=bars;
 const archive=selectedAsset==="STAMPUSDT"?operationsReport?.events:null;
 const payload=eventPayload||{symbol:selectedAsset,records:[]};
 const records=new Map((archive?.records||[]).map(event=>[event.id,event]));
 for(const event of payload.records)records.set(event.id,event);
 const sorted=[...records.values()].sort((a,b)=>b.time_ms-a.time_ms);
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
 if(el("trading")?.hidden||(!force&&performance.now()<nextLensPaint))return;
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
 set("change",pct(change));
 el("change").style.color=change===null?"":change>=0?"var(--up)":"var(--down)";
 set("volume",number(quote?.stats_at_utc?quote.volume_24h_usdt:market?.volume));
 set("high24",price(quote?.stats_at_utc?quote.high_24h:market?.high_24h));
 set("low24",price(quote?.stats_at_utc?quote.low_24h:market?.low_24h));
 const method=quote?.transport==="websocket"?" · WebSocket":quote?.transport==="rest"?" · REST":"";
 set("observed",usable?"MEXC"+method+" · "+stamp(measured):"");
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
 set("streamStatus",streamReady?t("streamLive"):fallback?copy("MEXC · تحديث احتياطي","MEXC · REST fallback"):
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
 if(offline||document.hidden||marketRequest||!force&&Date.now()<nextMarketPoll)return;
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
 if(!window.StampMarket||!window.WebSocket||offline||document.hidden)return;
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
function render(result){
 if(!result||!result.market)throw Error("Invalid research payload");
 data=result;
 if(selectedAsset==="STAMPUSDT"&&result.laboratory)lastLaboratory=result.laboratory;
 if(selectedAsset==="STAMPUSDT"&&result.operations)operationsReport=result.operations;
 paintOperations();
 const liquidity=result.liquidity||{};
 set("liquidity",money(liquidity.liquidity_usd));
 set("marketCap",money(liquidity.market_cap_usd));
 set("liquidityTime",liquidity.observed_utc?"DEX · "+stamp(liquidity.observed_utc)+(liquidity.source?" · "+liquidity.source:""):"");
 set("sourceLine","MEXC / USDT · "+t("candles")+" · "+stamp(result.model_observed_utc||result.observed_utc));
 set("chartZone",zone);
 if(result.live_quote?.status==="fresh")acceptQuote(result.live_quote);
 renderIntelligence();renderForecasts();renderChart();renderAssurance();renderInputs();
 paintQuote();
}

const PAIR_SYMBOL=/^[A-Z0-9]{1,22}USDT$/;
const starterPairs=["STAMPUSDT","BTCUSDT","ETHUSDT","SOLUSDT"];
const pairLabel=pair=>pair.replace(/USDT$/," / USDT");
let selectedAsset="STAMPUSDT",assetCache=null,assetPending=null,lastLaboratory={};
let assetPairs=starterPairs,catalogState="loading",catalogPending=false,catalogObserved=null,visiblePairs=60;
const pairCatalog=values=>Array.isArray(values)?[...new Set(values.filter(value=>typeof value==="string"&&PAIR_SYMBOL.test(value)))].sort():[];
let favorites=[];
try{
 favorites=pairCatalog(JSON.parse(localStorage.getItem("stamp_favorite_pairs")||"[]"));
 const saved=JSON.parse(localStorage.getItem("stamp_asset_catalog")||"null");
 const savedPairs=pairCatalog(saved?.pairs);
 if(savedPairs.length){
  assetPairs=pairCatalog([...starterPairs,...savedPairs]);
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
  (direct?'<small>'+copy("جلب بيانات الزوج","Load pair data")+'</small>':pair===selectedAsset?'<small>'+copy("محدد","Selected")+'</small>':'')+
  '</button></li>').join("");
 el("assetMore").hidden=matches.length<=visiblePairs;
 el("assetNoResults").hidden=choices.length>0;
 set("assetNoResults",query?copy("لم يُعثر على زوج بهذا الرمز","No pair matches this symbol"):"");
 const state=catalogState==="ready"
  ? (query?matches.length:assetPairs.length)+copy(" زوج"," pairs")
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
  catalogState="ready";
  catalogObserved=result.retrieved_at_utc;
  try{localStorage.setItem("stamp_asset_catalog",JSON.stringify({pairs,observed:catalogObserved}))}catch{}
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
 microRequest++;
 assetPending?.abort();
 assetPending=null;
 set("coinName",pairLabel(symbol));
 set("assetSelected",pairLabel(symbol));
 set("venueLine",symbol==="STAMPUSDT"?"MEXC · Solana":"MEXC");
 for(const id of ["price","change","volume","high24","low24","liquidity","marketCap","forecastSummary"])set(id,"—");
 for(const id of ["observed","liquidityTime","dataAge","streamStatus","forecastCards","assetCorrelation","sceneNodeDetail","venueMetrics","connectorAudit","engineAudit","microStatus","microMetrics"])set(id,"");
 el("warning").hidden=true;
 el("status").className="";
 set("status",copy("جارٍ التحميل","Loading"));
 set("assetMessage",copy("جارٍ تحميل البيانات","Loading data"));
 el("forecastHorizon").disabled=symbol!=="STAMPUSDT";
 startStream();
 pollMarket(true);
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
 const market={price:px,change:pct24,volume:n(q.quoteVolume),high_24h:n(q.highPrice),low_24h:n(q.lowPrice)};
 const time=n(q.closeTime),now=Date.now();
 const observed=time&&time>0&&time<=now+5000?new Date(time).toISOString():null;
 const alternate={market,candles:snapshot.candles||{},asset_research_forecasts:snapshot.research_forecasts||{},observed_utc:observed};
 render(alternate);
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
translate();initializeSceneControls();refresh();
if(!offline){
 loadAssetUniverse();updateVenueNetwork();startStream();updateWorkerStatus();pollChartEvents(true);
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
