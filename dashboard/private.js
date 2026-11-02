"use strict";
(() => {
const el=id=>document.getElementById(id);
const n=v=>v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v))?Number(v):null;
const price=v=>n(v)===null?"—":Number(v).toFixed(7);
const money=v=>n(v)===null?"—":"$"+Number(v).toLocaleString("en-US",{maximumFractionDigits:0});
const number=v=>n(v)===null?"—":Number(v).toLocaleString("en-US",{maximumFractionDigits:2});
const pct=v=>n(v)===null?"—":(v>=0?"+":"")+Number(v).toFixed(2)+"%";
const esc=v=>String(v??"—").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const set=(id,value)=>{const node=el(id);if(node)node.textContent=value};
const age=s=>s&&Number.isFinite(Date.parse(s))?Math.max(0,(Date.now()-Date.parse(s))/1000):null;
let lang="ar",zone="Asia/Makassar",frame="15m",horizon="1h",data=null,loading=false;
let stream=null,streamState="connecting",quoteLive=null,quoteLoading=false,lastQuotePoll=0,lastStatsPoll=0;const liveCandles=new Map();
let chart=null,candleSeries=null,volumeSeries=null,predictedSeries=null,measuredSeries=null,projectionSeries=null,livePriceLine=null,viewKey="",currentBars=[];
try{lang=localStorage.getItem("stamp_language")==="en"?"en":"ar";const saved=localStorage.getItem("stamp_timezone");if(["UTC","Asia/Baghdad","Asia/Makassar"].includes(saved))zone=saved}catch(e){}
const words={
ar:{inputsTitle:"مدخلات المحرك وكيف استُخدمت",inputGroup:"مجموعة البيانات",inputUsed:"عند مرجع التوقع",inputAccess:"الوصول الحالي",inputCoverage:"تغطية الاختبار",used:"متاحة",missing:"ناقصة / مستبعدة",regime:"المؤشرات وتغير نظام الحركة",market:"BTC / ETH / SOL / ZEC",ticker:"السعر وإحصاءات التداول",orderbook:"دفتر الأوامر",trades:"الصفقات المنفذة",dex:"سيولة وقيمة DEX",onchain:"المعروض والمحافظ والحرق",news:"الأخبار والإشارات المتحققة",project:"نشاط المشروع الموثق",macro:"حركة السوق العامة",derivatives:"العقود والمراكز والتمويل",feedback:"أخطاء التوقعات السابقة المتحققة",assuranceTitle:"فحص الإنتاج وصلاحية النتائج والتوسع",streamLive:"بث MEXC متصل",streamFallback:"بث غير متاح · تحديث احتياطي تلقائي",streamConnecting:"جارٍ الاتصال ببث MEXC",staleData:"البيانات متأخرة",dataSeconds:"ثانية منذ آخر سعر",forming:"شمعة جارية غير مغلقة · لا تدخل في تقييم النموذج",closedOnly:"الشموع المعروضة مغلقة؛ بانتظار تحديث الشمعة الجارية",production:"سلامة الإنتاج",quality:"صلاحية التوقع",healthy:"سليم",degraded:"يحتاج مراجعة",failed_evidence:"لم يجتز اختبار الجودة",insufficient_evidence:"أدلة غير كافية",approved_research:"معتمد للبحث",rolloutBlocked:"التوسع إلى جميع الأزواج غير معتمد: يلزم اختبار مستقل لكل زوج واختبار الحمل وعزل البيانات.",forwardSamples:"عينات الاختبار",verifiedSamples:"نتائج مستقبلية مستقلة",skill:"تحسن الخطأ مقابل ثبات السعر",direction:"دقة الاتجاه",interval:"نطاق الثقة 95%",overdue:"نتائج متأخرة غير متحققة",zoomIn:"تكبير +",zoomOut:"تصغير −",earlier:"← أقدم",later:"أحدث →",chartHelp:"اسحب للتنقل، وقرّب بإصبعين أو بعجلة الفأرة. المس الشمعة لعرض تفاصيلها. لوحة المفاتيح: + و − والأسهم، و Home لإعادة العرض.",candleVolume:"الحجم",refresh:"تحديث",settings:"الإعدادات",change24:"خلال 24 ساعة",liquidity:"السيولة المرصودة · DEX",marketCap:"القيمة السوقية · DEX",volume24:"حجم التداول 24 ساعة · USDT",high24:"أعلى سعر 24 ساعة · USDT",low24:"أدنى سعر 24 ساعة · USDT",forecastHorizon:"أفق التوقع",last24:"آخر 24 ساعة",candles:"شموع مغلقة",predicted:"توقع مسجّل",measured:"نتيجة مقاسة",nextForecast:"إسقاط آخر توقع",export:"تنزيل الشموع CSV",auditDetails:"سبب قرار المحرك وسجل التوقعات",language:"اللغة",timezone:"توقيت الرسم والبيانات",diagnostics:"فحص الاتصال",password:"تغيير كلمة المرور في Vercel",passwordHelp:"حدّث DASHBOARD_PASSWORD ثم أعد نشر التطبيق.",logout:"تسجيل الخروج",approved:"معتمد آليًا",experimental:"تجريبي آليًا",awaiting:"بانتظار قرار المحرك",live:"سعر مباشر",archive:"سعر مؤرشف",unavailable:"غير متاح",correct:"صحيح",wrong:"خاطئ",pending:"معلّق",unknown:"غير متحقق",approximate:"قياس تاريخي تقريبي",exact:"قياس عند الموعد",insufficientCandles:"لا توجد شموع مغلقة كافية لهذه الفترة",chartUnavailable:"تعذر تحميل محرك الرسم",target:"التوقع",due:"الموعد",reference:"المرجع",recordedAt:"صدر",observed:"تحقق",outcome:"النتيجة",decisionSource:"قرار محرك النماذج الداخلي",oldDecision:"قرار مؤرشف",noForecast:"لا يوجد توقع مسجّل لهذا الأفق",forecastExpired:"انتهى الأفق؛ تظهر النتيجة بعد تحقق القياس",model:"النموذج",samples:"نتائج مستقلة",forward:"اختبار زمني خارج التدريب",prospective:"نتائج مستقبلية تم التحقق منها",autoNote:"يعيد المحرك تقييم الاعتماد تلقائيًا؛ لا توجد موافقة يدوية في الواجهة."},
en:{inputsTitle:"Model inputs and how they were used",inputGroup:"Data group",inputUsed:"At forecast reference",inputAccess:"Current source access",inputCoverage:"Test coverage",used:"Available",missing:"Missing / excluded",regime:"Indicators and market regime",market:"BTC / ETH / SOL / ZEC",ticker:"Quote and turnover",orderbook:"Order book",trades:"Executed trades",dex:"DEX liquidity and value",onchain:"Supply, holders and burns",news:"News and verified evidence",project:"Verified project activity",macro:"Broad crypto market",derivatives:"Derivatives, OI and funding",feedback:"Verified previous forecast errors",assuranceTitle:"Production, output validity and rollout checks",streamLive:"MEXC stream connected",streamFallback:"Stream unavailable · automatic fallback",streamConnecting:"Connecting to MEXC stream",staleData:"Data delayed",dataSeconds:"seconds since last quote",forming:"Forming candle · excluded from model evaluation",closedOnly:"Completed candles; awaiting current candle stream",production:"Output integrity",quality:"Forecast validity",healthy:"Healthy",degraded:"Needs review",failed_evidence:"Quality test failed",insufficient_evidence:"Insufficient evidence",approved_research:"Approved for research",rolloutBlocked:"All-pair rollout is not approved: independent per-pair validation, load tests and data isolation are required.",forwardSamples:"Forward samples",verifiedSamples:"Independent prospective outcomes",skill:"Error improvement vs no change",direction:"Direction accuracy",interval:"95% interval",overdue:"Overdue unverified outcomes",zoomIn:"Zoom +",zoomOut:"Zoom −",earlier:"← Earlier",later:"Later →",chartHelp:"Drag to pan; pinch or use the wheel to zoom. Touch a candle for details. Keyboard: +, −, arrows; Home to reset.",candleVolume:"Volume",refresh:"Refresh",settings:"Settings",change24:"in 24 hours",liquidity:"Observed liquidity · DEX",marketCap:"Market cap · DEX",volume24:"24h turnover · USDT",high24:"24h high · USDT",low24:"24h low · USDT",forecastHorizon:"Forecast horizon",last24:"Last 24 hours",candles:"Closed candles",predicted:"Recorded forecast",measured:"Measured outcome",nextForecast:"Latest projection",export:"Export candles CSV",auditDetails:"Automatic decision and forecast audit",language:"Language",timezone:"Chart and data timezone",diagnostics:"Connection check",password:"Change password in Vercel",passwordHelp:"Update DASHBOARD_PASSWORD and redeploy.",logout:"Sign out",approved:"Automatically approved",experimental:"Automatically experimental",awaiting:"Awaiting engine decision",live:"Live quote",archive:"Archived quote",unavailable:"Unavailable",correct:"Correct",wrong:"Wrong",pending:"Pending",unknown:"Unverified",approximate:"Approximate historical measurement",exact:"Measured at target",insufficientCandles:"Insufficient completed candles for this interval",chartUnavailable:"Chart engine failed to load",target:"Prediction",due:"Target",reference:"Reference",recordedAt:"Issued",observed:"Observed",outcome:"Outcome",decisionSource:"Internal model engine decision",oldDecision:"Archived decision",noForecast:"No recorded forecast for this horizon",forecastExpired:"Target elapsed; outcome awaits verification",model:"Model",samples:"independent outcomes",forward:"Forward out-of-sample test",prospective:"Verified prospective outcomes",autoNote:"The engine reassesses approval automatically; the UI has no manual approval control."}};
const t=k=>words[lang][k]||k;
const stamp=value=>{if(!value||!Number.isFinite(Date.parse(value)))return "—";return new Intl.DateTimeFormat(lang==="ar"?"ar-IQ":"en-GB",{timeZone:zone,month:"short",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(value))+" · "+zone};
const FRAME_MS={"15m":900000,"30m":1800000,"1h":3600000,"2h":7200000,"4h":14400000,"6h":21600000,"12h":43200000,"1d":86400000,"1w":604800000};
const FRAME_SOURCE={"30m":"15m","2h":"1h","6h":"1h","12h":"1h","1w":"1d"};
function chartCandles(tf){
 const source=FRAME_SOURCE[tf]||tf,step=FRAME_MS[source],duration=FRAME_MS[tf],unique=new Map();
 for(const c of data?.candles?.[source]||[]){
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
 chart=L.createChart(el("chart"),{autoSize:true,layout:{background:{type:"solid",color:"#0b1220"},textColor:"#9aabc0",attributionLogo:false,fontFamily:"system-ui, sans-serif"},grid:{vertLines:{color:"#152235"},horzLines:{color:"#1c2b3e"}},rightPriceScale:{borderColor:"#243347",scaleMargins:{top:.08,bottom:.22}},timeScale:{borderColor:"#243347",timeVisible:true,secondsVisible:false,rightOffset:6,tickMarkFormatter:(time,type)=>formatChartTime(time,type>2)},localization:{locale:"en-US",timeFormatter:time=>formatChartTime(time)},crosshair:{mode:L.CrosshairMode.Normal},handleScroll:{mouseWheel:true,pressedMouseMove:true,horzTouchDrag:true,vertTouchDrag:false},handleScale:{axisPressedMouseMove:true,mouseWheel:true,pinch:true}});
 candleSeries=chart.addSeries(L.CandlestickSeries,{upColor:"#4bd0a0",downColor:"#f08694",borderVisible:false,wickUpColor:"#4bd0a0",wickDownColor:"#f08694",priceFormat:{type:"price",precision:8,minMove:.00000001}});
 volumeSeries=chart.addSeries(L.HistogramSeries,{priceScaleId:"",priceFormat:{type:"volume"},priceLineVisible:false,lastValueVisible:false});volumeSeries.priceScale().applyOptions({scaleMargins:{top:.83,bottom:0}});
 const options={priceFormat:{type:"price",precision:8,minMove:.00000001},priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:true,lineWidth:2,pointMarkersVisible:true,pointMarkersRadius:3};
 predictedSeries=chart.addSeries(L.LineSeries,{...options,color:"#edc271",lineStyle:L.LineStyle.Dashed,title:t("predicted")});
 measuredSeries=chart.addSeries(L.LineSeries,{...options,color:"#67b4ef",title:t("measured")});
 projectionSeries=chart.addSeries(L.LineSeries,{...options,color:"#be9aeb",lineStyle:L.LineStyle.Dashed,title:t("nextForecast")});
 chart.timeScale().subscribeVisibleTimeRangeChange?.(range=>{if(range){el("chart").dataset.visibleFrom=String(range.from);el("chart").dataset.visibleTo=String(range.to)}});
 const inspect=param=>{
  if(!param.time)return;
  const c=param.seriesData?.get(candleSeries),v=param.seriesData?.get(volumeSeries),parts=[formatChartTime(param.time)];
  if(c&&n(c.close)!==null)parts.push("O "+price(c.open)+" H "+price(c.high)+" L "+price(c.low)+" C "+price(c.close));
  if(v&&n(v.value)!==null)parts.push(t("candleVolume")+" "+number(v.value));
  for(const [series,label] of [[predictedSeries,"predicted"],[measuredSeries,"measured"],[projectionSeries,"nextForecast"]]){const point=param.seriesData?.get(series);if(point&&n(point.value)!==null)parts.push(t(label)+" "+price(point.value))}
  if(parts.length>1)set("chartOHLC",parts.join(" · "));
 };
 chart.subscribeCrosshairMove(inspect);chart.subscribeClick?.(inspect);
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
function resetChartRange(){
 if(!chart||currentBars.length<2)return;
 const first=currentBars[0].t,last=currentBars[currentBars.length-1].t+FRAME_MS[frame],f=data?.forecasts?.[horizon]?.forecast;
 const due=f?Date.parse(f.due_at_utc):0,future=Number.isFinite(due)&&due>last?due:last;
 const lookback=Math.max(86400000,future-last),from=Math.max(first,last-lookback),to=future+FRAME_MS[frame]*2;
 if(to>from)chart.timeScale().setVisibleRange({from:Math.floor(from/1000),to:Math.floor(to/1000)});else chart.timeScale().fitContent();
}
function activeCandle(){
 let c=liveCandles.get(frame);
 if(!c&&["2h","6h","12h"].includes(frame)){
  const tail=liveCandles.get("1h");if(!tail)return null;
  const start=Math.floor(tail.t/FRAME_MS[frame])*FRAME_MS[frame];
  const parts=[...chartCandles("1h").filter(b=>b.t>=start&&b.t<tail.t),tail];
  if(parts[0]?.t!==start||parts.some((b,i)=>b.t!==start+i*3600000))return null;
  c={t:start,o:parts[0].o,c:tail.c,h:Math.max(...parts.map(b=>b.h)),l:Math.min(...parts.map(b=>b.l)),v:parts.every(b=>b.v!==null)?parts.reduce((a,b)=>a+b.v,0):null,end:start+FRAME_MS[frame],observed_utc:tail.observed_utc};
 }
 return c&&age(c.observed_utc)!==null&&age(c.observed_utc)<=15&&c.t<=Date.now()&&c.end>Date.now()?c:null;
}
function renderChart(){
 if(!initChart())return;
 currentBars=chartCandles(frame);const empty=el("chartEmpty");empty.hidden=currentBars.length>=2;
 if(currentBars.length<2){set("chartEmpty",t("insufficientCandles"));candleSeries.setData([]);volumeSeries.setData([]);predictedSeries.setData([]);measuredSeries.setData([]);projectionSeries.setData([]);return}
 const forming=activeCandle(),displayBars=forming?[...currentBars.filter(c=>c.t<forming.t),forming]:currentBars;
 set("activeCandle",forming?t("forming"):t("closedOnly"));el("chart").dataset.forming=String(!!forming);
 candleSeries.setData(displayBars.map(c=>({time:c.t/1000,open:c.o,high:c.h,low:c.l,close:c.c})));
 volumeSeries.setData(displayBars.filter(c=>c.v!==null&&c.v>=0).map(c=>({time:c.t/1000,value:c.v,color:c.c>=c.o?"#4bd0a040":"#f0869440"})));
 const rows=(data?.forecast_review?.rows||[]).filter(r=>r.horizon===horizon);
 // Prediction targets and measured outcomes keep their actual timestamps. An
 // approximate 15m reconstruction is never moved back to the target time.
 const predictions=uniquePoints(rows.map(r=>({time:Date.parse(r.due_utc)/1000,value:r.predicted_price})));
 const outcomes=uniquePoints(rows.filter(r=>r.actual_price!==null&&r.measurement_time_utc).map(r=>({time:Date.parse(r.measurement_time_utc)/1000,value:r.actual_price})));
 predictedSeries.setData(predictions);measuredSeries.setData(outcomes);
 const f=data?.forecasts?.[horizon]?.forecast;
 const projection=f?uniquePoints([{time:Date.parse(f.reference_at_utc)/1000,value:f.reference_price},{time:Date.parse(f.due_at_utc)/1000,value:f.predicted_price}]):[];
 projectionSeries.setData(projection);
 const q=data?.live_quote||{},fresh=q.status==="fresh"&&age(q.retrieved_at_utc)!==null&&age(q.retrieved_at_utc)<=180&&n(q.price)>0;
 if(fresh){if(livePriceLine)livePriceLine.applyOptions({price:q.price});else livePriceLine=candleSeries.createPriceLine({price:q.price,color:"#a4bbc9",lineWidth:1,lineStyle:2,axisLabelVisible:true,title:"MEXC"})}
 else if(livePriceLine){candleSeries.removePriceLine(livePriceLine);livePriceLine=null}
 const last=displayBars[displayBars.length-1];set("chartOHLC",formatChartTime(last.t/1000)+" · O "+price(last.o)+" H "+price(last.h)+" L "+price(last.l)+" C "+price(last.c));
 el("chart").dataset.barCount=String(currentBars.length);el("chart").dataset.forecastPoints=String(predictions.length);el("chart").dataset.actualPoints=String(outcomes.length);el("chart").dataset.frame=frame;
 el("chart").setAttribute("aria-label","STAMP · "+frame+" · "+currentBars.length+" closed candles; "+predictions.length+" recorded predictions; "+outcomes.length+" measured outcomes");
 const key=frame+"|"+horizon;if(viewKey!==key){viewKey=key;resetChartRange()}
}
const reasonText={
 insufficient_forward_validation:["اختبار زمني غير كافٍ خارج التدريب","Insufficient forward validation"],forward_error_not_better_than_baseline:["خطأ التوقع لم يتفوق على توقع عدم تغير السعر","Forward error did not beat no change"],forward_direction_uncertain:["عدم يقين دقة الاتجاه ما زال مرتفعًا","Forward directional uncertainty remains high"],insufficient_prospective_outcomes:["النتائج المستقبلية المستقلة غير كافية","Insufficient independent prospective outcomes"],recent_prediction_error_not_better_than_baseline:["الأداء الحديث لم يحافظ على تحسن الخطأ","Recent forecast error lost its advantage"],recent_direction_uncertain:["الأداء الاتجاهي الحديث لم يحقق الاعتماد","Recent directional evidence failed approval"],model_input_unavailable_or_stale:["بيانات النموذج ناقصة أو قديمة","Model inputs unavailable or stale"],forward_and_prospective_evidence_passed:["اجتاز اختبارات المستقبل ونتائج التوقعات المتحققة","Forward validation and prospective outcomes passed"]};
function renderForecasts(){
 const r=data?.forecasts?.[horizon],f=r&&typeof r==="object"?r.forecast:null;
 const decision=data?.model_decisions?.[horizon];
 const decisionAge=age(decision?.decided_at_utc),decisionFresh=decisionAge!==null&&decisionAge<=9000&&Date.parse(f?.due_at_utc)>Date.now()&&(!data?.output_assurance||data.output_assurance.horizons?.[horizon]?.predictive_validity==="approved_research");
 const state=decision?.automatic===true?decision.status:null;
 set("modelStatus",state==="approved"&&!decisionFresh?t("oldDecision"):state==="approved"?t("approved"):state==="experimental"?t("experimental"):t("awaiting"));el("modelStatus").className="model-status"+(state==="approved"&&decisionFresh?" approved":"");
 if(f){const expired=Date.parse(f.due_at_utc)<=Date.now();set("forecastSummary",horizon.toUpperCase()+" · "+t("target")+" "+price(f.predicted_price)+" USDT · "+pct(Math.expm1(f.predicted_log_return)*100)+" · "+t("due")+" "+stamp(f.due_at_utc)+(expired?" · "+t("forecastExpired"):""))}
 else set("forecastSummary",t("noForecast"));
 const rows=(data?.forecast_review?.rows||[]).filter(r=>r.horizon===horizon),correct=rows.filter(r=>r.direction_correct===true).length,wrong=rows.filter(r=>r.direction_correct===false).length,pending=rows.filter(r=>r.actual_price===null&&Date.parse(r.due_utc)>Date.now()).length,unverified=rows.length-correct-wrong-pending;
 set("outcomeSummary",t("correct")+" "+correct+" · "+t("wrong")+" "+wrong+" · "+t("pending")+" "+pending+" · "+t("unknown")+" "+unverified);
 const reasons=decision?.reason_codes||[];const forward=decision?.forward_validation||{},prospective=decision?.prospective||{};
 el("modelReason").innerHTML='<p>'+esc(t("autoNote"))+'</p>'+(decision?'<p>'+esc(t("model"))+': '+esc(decision.selected_model)+' · '+esc(t("forward"))+': '+esc(forward.samples??0)+' · '+esc(t("prospective"))+': '+esc(prospective.samples??0)+'</p><ul>'+reasons.map(code=>'<li>'+esc(reasonText[code]?.[lang==="ar"?0:1]||code)+'</li>').join("")+'</ul>':'');
 set("modelDecisionTime",decision?t("decisionSource")+" · "+stamp(decision.decided_at_utc):t("awaiting"));
 const header='<tr><th>'+esc(t("due"))+'</th><th>'+esc(t("predicted"))+'</th><th>'+esc(t("observed"))+'</th><th>'+esc(t("outcome"))+'</th></tr>';
 el("forecastHistory").innerHTML='<table><thead>'+header+'</thead><tbody>'+rows.slice(0,30).map(r=>{const known=r.actual_price!==null&&n(r.actual_price)>0;const status=r.direction_correct===true?t("correct"):r.direction_correct===false?t("wrong"):known?t("unknown"):Date.parse(r.due_utc)>Date.now()?t("pending"):t("unknown");const measure=known?(r.measurement_offset_seconds===0?t("exact"):t("approximate"))+" · "+stamp(r.measurement_time_utc):"";return '<tr><td>'+esc(stamp(r.due_utc))+'</td><td class="numeric">'+esc(price(r.predicted_price))+'</td><td class="numeric">'+esc(price(r.actual_price))+'</td><td>'+esc(status)+'<br><span class="muted">'+esc(measure)+'</span></td></tr>'}).join("")+'</tbody></table>';
}
function renderInputs(){
 const r=data?.forecasts?.[horizon],m=r?.input_manifest;if(!m){set("inputPolicy",t("awaiting"));return}
 set("inputPolicy",(lang==="ar"?"المرجع الزمني للمدخلات: ":"Input time reference: ")+stamp(m.reference_utc)+" · "+m.features+(lang==="ar"?" متغيرًا مع علامات التوفر. البيانات الأحدث تُحفظ للمرجع التالي؛ الإشارة غير الموثقة لا تُعامل كخبر مؤكد.":" features including availability masks. Later observations are archived for the next reference; unverified mentions are not confirmed news."));
 const headers=["inputGroup","inputUsed","inputAccess","inputCoverage"];
 el("inputTable").innerHTML='<table><thead><tr>'+headers.map(k=>'<th>'+esc(t(k))+'</th>').join("")+'</tr></thead><tbody>'+Object.entries(m.groups||{}).map(([g,s])=>{const selected=(r.selected_feature_groups||[]).includes(g),access=r.source_access?.[g],coverage=r.feature_coverage?.[g],reason=s.reason||access?.reason||"";return '<tr><td>'+esc(t(g))+'</td><td>'+esc(!selected?(lang==="ar"?"لم يُختر في المرشح الفائز":"Not selected by winning profile"):s.available_features>0?t("used"):t("missing"))+' · '+esc((s.available_features??0)+" / "+(s.total_features??"—"))+(reason?'<br><span class="muted">'+esc(reason)+'</span>':'')+'</td><td>'+esc(access?(access.status==="available"?t("used"):t("missing")):s.status)+'<br><span class="muted">'+esc(access?.observed_utc?stamp(access.observed_utc):"")+'</span></td><td>'+esc(coverage?coverage.points_with_data+" / "+coverage.evaluation_points:"—")+'</td></tr>'}).join("")+'</tbody></table>';
}
function renderAssurance(){
 const a=data?.output_assurance,h=a?.horizons?.[horizon];
 if(!a||!h){set("assuranceSummary",t("awaiting"));return}
 const due=Date.parse(h.target_at_utc),checked=Date.parse(a.checked_at_utc),current=Number.isFinite(due)&&due>Date.now()&&Number.isFinite(checked)&&Date.now()-checked<30000;
 set("assuranceSummary",t("production")+": "+t(current&&h.production_status==="valid"?"healthy":"degraded")+" · "+t("quality")+": "+t(h.predictive_validity)+" · "+t("overdue")+": "+a.overdue_unverified_in_recent_journal+". "+t("rolloutBlocked"));
 set("assuranceBadge",t("production")+": "+t(current&&h.production_status==="valid"?"healthy":"degraded")+" · "+t("quality")+": "+t(h.predictive_validity)+" · "+(lang==="ar"?"التعميم: غير معتمد":"All-pair rollout: not approved"));
 const f=h.forward||{},v=h.prospective||{};
 const interval=x=>Array.isArray(x)&&x.every(v=>n(v)!==null)?x.map(v=>pct(v*100)).join(" — "):"—";
 el("assuranceMetrics").innerHTML='<table><thead><tr><th>'+esc(horizon)+'</th><th>'+esc(t("forward"))+'</th><th>'+esc(t("prospective"))+'</th></tr></thead><tbody>'+[["samples",f.samples,v.samples],["skill",n(f.skill_vs_zero)===null?"—":pct(f.skill_vs_zero*100),n(v.skill_vs_zero)===null?"—":pct(v.skill_vs_zero*100)],["direction",n(f.direction_accuracy)===null?"—":pct(f.direction_accuracy*100),n(v.direction_accuracy)===null?"—":pct(v.direction_accuracy*100)],["interval",interval(f.direction_wilson_95),interval(v.direction_wilson_95)]].map(r=>'<tr><th>'+esc(t(r[0]))+'</th><td>'+esc(r[1])+'</td><td>'+esc(r[2])+'</td></tr>').join("")+'</tbody></table>';
}
function updateFreshness(){
 const q=data?.live_quote||quoteLive,seconds=age(q?.provider_at_utc||q?.retrieved_at_utc),fresh=q?.status==="fresh"&&seconds!==null&&seconds<=10;
 const statsAge=age(q?.stats_at_utc),dexAge=age(data?.liquidity?.observed_utc);
 set("dataAge",(seconds===null?"—":Math.floor(seconds)+" · "+t("dataSeconds"))+(statsAge===null?"":" · 24H: "+Math.floor(statsAge)+"s")+(dexAge===null?"":" · DEX: "+Math.floor(dexAge)+"s"));
 set("streamStatus",streamState==="live"?t("streamLive"):streamState==="connecting"||streamState==="subscribing"?t("streamConnecting"):t("streamFallback"));el("streamStatus").className=streamState==="live"?"fresh":"stale";
 if(!fresh&&data){set("status",t("staleData"));el("status").className="stale"}
}
function acceptQuote(q){
 if(q?.status!=="fresh"||n(q.price)===null||q.price<=0)return;
 const incoming=Date.parse(q.provider_at_utc||q.retrieved_at_utc),previous=Date.parse(quoteLive?.provider_at_utc||quoteLive?.retrieved_at_utc);
 if(!Number.isFinite(incoming)||incoming>Date.now()+5000||Date.now()-incoming>15000)return;
 const old=quoteLive||{};
 // Stats and last-trade price have independent clocks. A delayed REST response
 // may refresh statistics but must never roll the streamed price backwards.
 const merged={...old,...q};
 if(Number.isFinite(previous)&&previous>incoming){for(const key of ["price","provider_at_utc","retrieved_at_utc","transport","source"])merged[key]=old[key]}
 if(q.stats_at_utc&&Date.parse(old.stats_at_utc)>Date.parse(q.stats_at_utc)){for(const key of ["change_24h_pct","high_24h","low_24h","volume_24h_usdt","base_volume_24h","stats_at_utc"])merged[key]=old[key]}
 quoteLive=merged;
 if(!data)return;data.live_quote=merged;
 set("price",price(merged.price));set("change",pct(merged.change_24h_pct));el("change").style.color=merged.change_24h_pct>=0?"var(--up)":"var(--down)";
 set("volume",number(merged.volume_24h_usdt));set("high24",price(merged.high_24h));set("low24",price(merged.low_24h));
 set("observed",t("live")+" · MEXC · "+stamp(merged.provider_at_utc||merged.retrieved_at_utc));set("status",t("live"));el("status").className="fresh";el("warning").hidden=true;
 if(candleSeries){if(livePriceLine)livePriceLine.applyOptions({price:merged.price});else livePriceLine=candleSeries.createPriceLine({price:merged.price,color:"#a4bbc9",lineWidth:1,lineStyle:2,axisLabelVisible:true,title:"MEXC"})}
 updateFreshness();
}
async function pollQuote(force=false){
 if(quoteLoading)return;const now=Date.now(),freshStream=streamState==="live"&&quoteLive?.transport==="websocket"&&age(quoteLive?.provider_at_utc)!==null&&age(quoteLive?.provider_at_utc)<8;
 if(!force&&now-lastQuotePoll<(freshStream?15000:2000))return;
 quoteLoading=true;lastQuotePoll=now;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000);
 try{const response=await fetch("/api/quote",{credentials:"same-origin",cache:"no-store",signal:controller.signal});if(response.status===401){stream?.stop();window.location.href="/login";return}if(response.ok){const body=await response.json(),q=body.quote;if(q?.status==="fresh")acceptQuote({...q,transport:"rest",stats_at_utc:q.provider_at_utc||q.retrieved_at_utc})}}catch(e){}finally{clearTimeout(timer);quoteLoading=false;updateFreshness()}
}
function startStream(){
 if(!window.StampMarket||!window.WebSocket)return;
 stream=new window.StampMarket.Stream({symbol:"STAMPUSDT",onState:state=>{streamState=state;updateFreshness()},onData:update=>{
  if(update.quote)acceptQuote(update.quote);
  if(update.kind==="candle"){
   const old=liveCandles.get(update.frame),c=update.candle;if(old&&Date.parse(old.observed_utc)>Date.parse(c.observed_utc))return;
   // A final streamed sample is not proof of a completed candle. REST refresh
   // retrieves definitive closed OHLC; forming bars never enter the model archive.
   liveCandles.set(update.frame,c);if(data&&(frame===update.frame||(["2h","6h","12h"].includes(frame)&&update.frame==="1h")))renderChart();
  }
 }});stream.start();
 document.addEventListener("visibilitychange",()=>{if(document.hidden)stream.stop();else{stream.start();pollQuote(true);refresh()}});
 window.addEventListener("online",()=>{stream.stop();stream.start();pollQuote(true);refresh()});window.addEventListener("pagehide",()=>stream.stop());
}
function renderIntelligence(){
 if(!data)return;
 const horizons=data.forecasts||{},lab=data.laboratory||{};
 const cards=["1h","4h","24h","7d"].map(h=>{
  const row=horizons[h]||{},f=row.forecast||{},v=n(f.predicted_price);
  const approved=data.model_decisions?.[h]?.status==="approved" && data.model_decisions?.[h]?.automatic===true;
  return '<article class="forecast-card"><strong>'+esc(h)+'</strong><p class="forecast-target">'+
   (v===null?'—':v.toFixed(8))+'</p><p>'+esc(approved?'Approved':'Experimental')+'</p>'+
   '<small>'+esc(stamp(f.created_at_utc))+' → '+esc(stamp(f.due_at_utc))+'</small></article>';
 });
 const panel=el("forecastCards");if(panel)panel.innerHTML=cards.join("");
 set("labStatus",lab.status||"unavailable");
 set("labProposals",lab.proposals??"—");
 set("labEvaluated",lab.evaluated??"—");
 set("labDecisionsCount",lab.decision_count??"—");
 const list=el("labRecentDecisions");
 if(list)list.textContent=(lab.decisions||[]).slice(0,6).map(v=>[v.horizon,v.family,v.decision].filter(Boolean).join(" · ")).join(" | ")||"No archived decisions";
 set("labEvidence",lab.warning||"Research only");
}
function render(result,origin="api"){
 if(!result||!result.market)throw Error("Invalid research payload");data=result;
 const m=result.market,q=result.live_quote||{},fresh=q.status==="fresh"&&age(q.retrieved_at_utc)!==null&&age(q.retrieved_at_utc)<=180&&n(q.price)>0;
 const quote=fresh?q:m,quoteTime=fresh?q.retrieved_at_utc:result.observed_utc;
 set("price",price(quote.price));set("change",pct(fresh?q.change_24h_pct:n(m.change)===null?null:m.change*100));el("change").style.color=(fresh?q.change_24h_pct:m.change)>=0?"var(--up)":"var(--down)";
 set("volume",number(fresh?q.volume_24h_usdt:m.volume));set("high24",price(quote.high_24h));set("low24",price(quote.low_24h));
 const liquidity=result.liquidity||{};set("liquidity",money(liquidity.liquidity_usd));set("marketCap",money(liquidity.market_cap_usd));
 set("observed",(fresh?t("live"):t("archive"))+" · MEXC · "+stamp(quoteTime));
 set("liquidityTime","DEX · "+stamp(liquidity.observed_utc)+(liquidity.source?" · "+liquidity.source:""));
 set("status",fresh?t("live"):t("archive"));el("status").className=fresh?"fresh":"stale";
 set("sourceLine","MEXC / USDT · "+t("candles")+" · "+stamp(result.model_observed_utc||result.observed_utc));set("chartZone",zone);
 el("warning").hidden=fresh;
 set("warning",fresh?"":(lang==="ar"?"السعر المباشر غير متاح؛ القيم المعروضة مؤرشفة ومؤقتة.":"Live quote unavailable; displayed values are timestamped archives."));
 renderIntelligence();renderForecasts();renderChart();renderAssurance();renderInputs();if(result.live_quote?.status==="fresh")acceptQuote({...result.live_quote,stats_at_utc:result.live_quote.stats_at_utc||result.live_quote.provider_at_utc||result.live_quote.retrieved_at_utc});if(quoteLive)acceptQuote(quoteLive);
}
let selectedAsset="STAMPUSDT",assetPairs=["STAMPUSDT","BTCUSDT","ETHUSDT","SOLUSDT"],assetCache=null;
let favorites=[];try{favorites=JSON.parse(localStorage.getItem("stamp_favorite_pairs")||"[]").filter(v=>/^[A-Z0-9]{2,22}USDT$/.test(v))}catch(e){}
function favoritesUi(){
 const sel=el("favoriteSelect");sel.innerHTML='<option value="">اختر من المفضلة</option>'+favorites.map(v=>'<option value="'+esc(v)+'">'+esc(v.replace(/USDT$/," / USDT"))+'</option>').join("");
 set("assetFavorite",(favorites.includes(selectedAsset)?"★":"☆")+" المفضلة");
}
function universeUi(filter=""){
 const wanted=filter.toUpperCase().replace(/[^A-Z0-9]/g,""),selected=el("assetSelect");
 const matches=assetPairs.filter(v=>v.includes(wanted)).slice(0,350);
 if(!matches.includes(selectedAsset))matches.unshift(selectedAsset);
 selected.innerHTML=matches.map(v=>'<option value="'+esc(v)+'">'+esc(v.replace(/USDT$/," / USDT"))+'</option>').join("");
 selected.value=selectedAsset;
}
async function loadAssetUniverse(){
 try{const r=await fetch("/api/assets/universe",{credentials:"same-origin",cache:"no-store"});if(!r.ok)throw Error("HTTP "+r.status);
  const result=await r.json();if(!Array.isArray(result.pairs))throw Error("Invalid pairs");
  assetPairs=[...new Set([...result.pairs,"STAMPUSDT"])].sort();universeUi(el("assetSearch").value);
  set("assetMessage",assetPairs.length+" MEXC USDT pairs available");
 }catch(e){set("assetMessage","قائمة السوق غير متاحة: "+e.message)}
 favoritesUi();
}
async function selectAsset(symbol){
 if(!/^[A-Z0-9]{2,22}USDT$/.test(symbol))return;
 selectedAsset=symbol;universeUi(el("assetSearch").value);favoritesUi();el("assetCorrelation").textContent="";
 if(symbol==="STAMPUSDT"){set("assetMessage","STAMP · التوقعات من المحرك الداخلي");assetCache=null;await refresh();return}
 try{
  set("assetMessage","تحميل بيانات "+symbol+"…");
  const r=await fetch("/api/assets/snapshot?symbol="+encodeURIComponent(symbol),{credentials:"same-origin",cache:"no-store"});
  if(!r.ok)throw Error("HTTP "+r.status);
  assetCache=await r.json();showSelectedAsset();
 }catch(e){set("assetMessage","تعذر تحميل "+symbol+": "+e.message)}
}
function showSelectedAsset(){
 if(selectedAsset==="STAMPUSDT"||!assetCache||!data)return;
 const snapshot=assetCache,q=snapshot.ticker||{};
 const px=n(q.lastPrice),pct24=n(q.priceChangePercent);
 const market={...data.market,price:px,change:pct24===null?null:pct24/100,volume:n(q.quoteVolume),high_24h:n(q.highPrice),low_24h:n(q.lowPrice)};
 const alternate={...data,market,candles:snapshot.candles||{},forecasts:{},forecast_review:{rows:[]},model_decisions:{},
    learning:{horizons:{}},output_assurance:null,live_quote:{status:"unavailable"},liquidity:{},
    observed_utc:snapshot.retrieved_at_utc,model_observed_utc:null};
 render(alternate);
 set("coinName",selectedAsset.replace(/USDT$/,"")+" / USDT");
 set("venueLine","MEXC · أبحاث السوق (بدون توقعات معتمدة)");
 set("assetMessage",selectedAsset+" · "+Object.values(snapshot.candles||{}).reduce((n,arr)=>n+arr.length,0)+" شمعة مسترجعة");
}
async function compareAssets(){
 const other=el("assetCompare").value,container=el("assetCorrelation");container.textContent="جاري مقارنة البيانات…";
 try{
 const response=await fetch("/api/assets/compare?primary="+encodeURIComponent(selectedAsset)+"&secondary="+encodeURIComponent(other),{credentials:"same-origin",cache:"no-store"});
 if(!response.ok)throw Error("HTTP "+response.status);
 const r=await response.json();const text=(v)=>v===null?"—":String(v);
 container.innerHTML='<strong>'+esc(r.primary)+" ↔ "+esc(r.secondary)+'</strong> · ارتباط العوائد الساعة نفسها: '+esc(text(r.correlation))+' · عينات '+esc(r.hourly_samples)+
 '<div>'+Object.entries(r.lead_lag_hours||{}).map(([k,v])=>esc(r.secondary)+' قبل '+esc(k)+' ساعة: '+esc(text(v.correlation))+' (n='+esc(v.samples)+')').join(' | ')+'</div><small>'+esc(r.interpretation)+'</small>';
 }catch(e){container.textContent="تعذرت المقارنة: "+e.message}
}
function translate(){document.documentElement.lang=lang;document.documentElement.dir=lang==="ar"?"rtl":"ltr";document.querySelectorAll("[data-i18n]").forEach(node=>node.textContent=t(node.dataset.i18n));el("langSelect").value=lang;el("zoneSelect").value=zone;if(chart){chart.applyOptions({localization:{timeFormatter:time=>formatChartTime(time)},timeScale:{tickMarkFormatter:(time,type)=>formatChartTime(time,type>2)}})}}
async function request(path){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);try{const response=await fetch(path,{credentials:"same-origin",cache:"no-store",signal:controller.signal,headers:{Accept:"application/json"}});if(response.status===401){window.location.href="/login";throw Error("AUTH_401")}if(!response.ok)throw Error("HTTP "+response.status);const payload=await response.json();if(!payload?.market)throw Error("Invalid payload");return payload}finally{clearTimeout(timer)}}
async function refresh(){if(selectedAsset!=="STAMPUSDT"){if(assetCache)showSelectedAsset();return}if(loading)return;loading=true;el("refresh").disabled=true;try{let result,origin="api";try{result=await request("/api/dashboard")}catch(error){if(error.message==="AUTH_401")throw error;origin="archive";try{result=await request("/api/dashboard-lite")}catch(liteError){if(liteError.message==="AUTH_401")throw liteError;const snapshot=el("stamp-snapshot");if(!snapshot)throw liteError;result=JSON.parse(snapshot.content?snapshot.content.textContent:snapshot.textContent)}}if(result.live_quote?.status!=="fresh"||age(result.live_quote?.retrieved_at_utc)===null||age(result.live_quote?.retrieved_at_utc)>180){
 const quoteController=new AbortController(),quoteTimer=setTimeout(()=>quoteController.abort(),7000);
 try{const response=await fetch("/api/quote",{credentials:"same-origin",cache:"no-store",signal:quoteController.signal});if(response.status===401){window.location.href="/login";throw Error("AUTH_401")}if(response.ok){const body=await response.json();if(body.quote?.status==="fresh")result={...result,live_quote:body.quote}}}catch(quoteError){if(quoteError.message==="AUTH_401")throw quoteError}finally{clearTimeout(quoteTimer)}
}render(result,origin)}catch(error){set("status","ERROR");el("warning").hidden=false;set("warning",error.message)}finally{loading=false;el("refresh").disabled=false}}
function exportCsv(){const bars=chartCandles(frame),lines=["utc_open,open,high,low,close,volume",...bars.map(c=>[new Date(c.t).toISOString(),c.o,c.h,c.l,c.c,c.v??""].join(","))].join("\r\n");const url=URL.createObjectURL(new Blob([lines],{type:"text/csv"})),a=document.createElement("a");a.href=url;a.download="STAMP_"+frame+".csv";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
document.querySelectorAll("[data-frame]").forEach(button=>button.addEventListener("click",()=>{frame=button.dataset.frame;document.querySelectorAll("[data-frame]").forEach(b=>b.setAttribute("aria-pressed",String(b===button)));renderChart()}));
el("forecastHorizon").addEventListener("change",event=>{horizon=["1h","4h","24h","7d"].includes(event.target.value)?event.target.value:"1h";renderForecasts();renderChart();renderAssurance();renderInputs()});
for(const [id,action] of [["zoomIn","in"],["zoomOut","out"],["panEarlier","earlier"],["panLater","later"]])el(id).addEventListener("click",()=>navigateChart(action));
el("chart").addEventListener("keydown",event=>{const actions={"+":"in","=":"in","-":"out","ArrowLeft":"earlier","ArrowRight":"later"};if(actions[event.key]){event.preventDefault();navigateChart(actions[event.key])}else if(event.key==="Home"){event.preventDefault();resetChartRange()}});
el("refresh").addEventListener("click",refresh);el("resetChart").addEventListener("click",resetChartRange);el("exportCandles").addEventListener("click",exportCsv);
el("settingsButton").addEventListener("click",()=>el("settings").showModal());
el("logoutButton").addEventListener("click",async()=>{try{await fetch("/logout",{method:"POST",credentials:"same-origin"})}finally{window.location.href="/"}});
el("langSelect").addEventListener("change",event=>{lang=event.target.value==="en"?"en":"ar";try{localStorage.setItem("stamp_language",lang)}catch(e){}translate();if(data)render(data)});
el("zoneSelect").addEventListener("change",event=>{zone=["UTC","Asia/Baghdad","Asia/Makassar"].includes(event.target.value)?event.target.value:"UTC";try{localStorage.setItem("stamp_timezone",zone)}catch(e){}translate();if(data)render(data)});
el("diagnose").addEventListener("click",async()=>{try{const response=await fetch("/api/status",{credentials:"same-origin",cache:"no-store"}),s=await response.json();set("diagnosticResult","API: "+s.api+" · "+stamp(s.observation_utc)+" · "+(s.research_fresh?"FRESH":"ARCHIVED"))}catch(error){set("diagnosticResult",error.message)}});
el("assetSearch").addEventListener("input",e=>universeUi(e.target.value));
el("assetSelect").addEventListener("change",e=>selectAsset(e.target.value));
el("favoriteSelect").addEventListener("change",e=>{if(e.target.value)selectAsset(e.target.value)});
el("assetFavorite").addEventListener("click",()=>{if(favorites.includes(selectedAsset))favorites=favorites.filter(v=>v!==selectedAsset);else favorites.push(selectedAsset);
 try{localStorage.setItem("stamp_favorite_pairs",JSON.stringify(favorites))}catch(e){}favoritesUi()});
el("compareAssets").addEventListener("click",compareAssets);
favoritesUi();loadAssetUniverse();translate();refresh();startStream();
if(window.StampMarket){pollQuote(true);setInterval(()=>{updateFreshness();pollQuote();renderAssurance()},1000)}
setInterval(()=>{if(!document.hidden)refresh()},15000);
})();
