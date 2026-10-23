"use strict";
(() => {
const byId=id=>document.getElementById(id);
const n=v=>v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v))?Number(v):null;
const money=v=>n(v)===null?"—":(v<0?"-$":"$")+Math.abs(v).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
const price=v=>n(v)===null?"—":"$"+Number(v).toFixed(7);
const pct=v=>n(v)===null?"—":(v>=0?"+":"")+Number(v).toFixed(2)+"%";
const txt=v=>String(v===null||v===undefined?"—":v).replace(/[&<>"']/g,x=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[x]));
const row=(k,v)=>'<div class="row"><span>'+txt(k)+'</span><strong>'+txt(v)+'</strong></div>';
let lang="ar",zone="Asia/Baghdad",frame="1h",data=null,loading=false,activeSource="none";
try{lang=localStorage.getItem("stamp_language")==="en"?"en":"ar";zone=localStorage.getItem("stamp_timezone")==="UTC"?"UTC":"Asia/Baghdad"}catch(e){}
const words={
ar:{subtitle:"لوحة التحليل الخاصة · بيانات موثّقة",refresh:"↻ تحديث",settings:"⚙ الإعدادات",livePrice:"سعر MEXC المباشر",archivedPrice:"سعر التحليل المؤرشف — ليس مباشرًا",archiveLabel:"آخر سعر في سجل التحليل",bestBid:"أفضل طلب شراء",bestAsk:"أفضل عرض بيع",spread:"الفارق السعري",volume:"حجم التداول 24 ساعة",pipeline:"حالة نظام التحليل",modelStatus:"اعتماد النموذج",history:"الرسم البياني للسعر",chartSub:"شموع MEXC المؤرشفة والمغلقة فقط",export:"↓ تنزيل شموع CSV",forecastTitle:"التوقعات والتحقق منها",forecastSub:"مخرجات البرنامج الفعلية وليست توصيات",forecastDisclaimer:"عند عدم كفاية الأدلة يمتنع النظام عن إصدار توقع موثوق.",technical:"التحليل الفني",descriptive:"وصفي وليس إشارات",orderbook:"دفتر الأوامر والتنفيذ",snapshotOnly:"لقطة مؤرشفة فقط",dex:"سيولة DEX",estimates:"تقديرات مزودي البيانات",evaluation:"اختبارات النماذج",evidence:"نتائج خارج عينة التدريب",integrity:"سلامة البيانات وسير البرنامج",footer:"STAMP · بحث خاص وليس توصية تداول · البيانات من أوقات مختلفة",settingsTitle:"الإعدادات والأمان",language:"لغة الواجهة",timezone:"توقيت العرض",security:"أمان الحساب",passwordHelp:"تُدار كلمة المرور عبر متغير DASHBOARD_PASSWORD في Vercel. عدّلها وأعد نشر الإنتاج. لا تكتب كلمة المرور هنا.",changePassword:"تغيير كلمة المرور في Vercel ↗",passwordNote:"يجب إعادة النشر بعد تعديل المتغير.",done:"تم",diagnostics:"فحص الاتصال",runDiagnostics:"اختبار اتصال الخادم",portfolioTitle:"حاسبة المركز المالي",portfolioSub:"تُحفظ المدخلات في متصفحك فقط",quantity:"عدد العملات",averageCost:"متوسط الشراء بالدولار",clearPortfolio:"مسح المركز",portfolioCaution:"التقييم تقديري قبل الرسوم والانزلاق السعري، وليس سعر تنفيذ.",invested:"التكلفة",currentValue:"القيمة التقديرية",profitLoss:"الربح / الخسارة",breakEven:"سعر التعادل",enterPortfolio:"أدخل الكمية ومتوسط الشراء",unavailable:"السعر المباشر غير متاح",stale:"بيانات التحليل قديمة",insufficient:"أدلة غير كافية",unverified:"غير معتمد",sourceLive:"MEXC API العامة",sourceArchive:"بيانات البرنامج المؤرشفة",modelNone:"لا يوجد نموذج معتمد"},
en:{subtitle:"PRIVATE RESEARCH TERMINAL",refresh:"↻ Refresh",settings:"⚙ Settings",livePrice:"Live MEXC quote",archivedPrice:"Archived quote — NOT LIVE",archiveLabel:"Archived research price",bestBid:"BEST BID",bestAsk:"BEST ASK",spread:"SPREAD",volume:"24H VOLUME",pipeline:"PIPELINE",modelStatus:"MODEL STATUS",history:"Price history",chartSub:"Archived closed MEXC candles only",export:"↓ Export CSV",forecastTitle:"Forecasts and validation",forecastSub:"Actual model output, not trading signals",forecastDisclaimer:"Insufficient evidence means the model abstains.",technical:"Technical indicators",descriptive:"Descriptive only",orderbook:"Order book and execution",snapshotOnly:"Archived snapshot",dex:"DEX liquidity",estimates:"Third-party estimates",evaluation:"Model evaluation",evidence:"Out-of-sample evidence",integrity:"Pipeline and data integrity",footer:"STAMP · Private research, not trading advice · Different source timestamps",settingsTitle:"Settings and security",language:"Language",timezone:"Display timezone",security:"Account security",passwordHelp:"Change DASHBOARD_PASSWORD in Vercel environment variables and redeploy. Never enter your password here.",changePassword:"Change password in Vercel ↗",passwordNote:"Redeploy after changing the environment variable.",done:"Done",diagnostics:"Connection diagnostics",runDiagnostics:"Test server connection",portfolioTitle:"Position calculator",portfolioSub:"Your inputs stay in this browser",quantity:"Token quantity",averageCost:"Average cost in USD",clearPortfolio:"Clear position",portfolioCaution:"Indicative only, excludes fees and slippage; not an executable quote.",invested:"Cost basis",currentValue:"Indicative value",profitLoss:"Profit / loss",breakEven:"Break-even",enterPortfolio:"Enter quantity and average cost",unavailable:"Live quote unavailable",stale:"Stale research",insufficient:"Insufficient evidence",unverified:"Not validated",sourceLive:"MEXC public API",sourceArchive:"Archived research snapshot",modelNone:"No validated model"}};
const t=k=>words[lang][k]||k;
const stamp=v=>{if(!v||!Number.isFinite(Date.parse(v)))return "—";try{return new Intl.DateTimeFormat(lang==="ar"?"ar-IQ":"en-GB",{timeZone:zone,year:"numeric",month:"short",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(v))+" "+(zone==="UTC"?"UTC":"UTC+3")}catch(e){return String(v)}};
const age=v=>v&&Number.isFinite(Date.parse(v))?Math.max(0,Math.floor((Date.now()-Date.parse(v))/1000)):null;
const set=(id,value)=>{const node=byId(id);if(node)node.textContent=value};
function translate(){
document.documentElement.lang=lang;document.documentElement.dir=lang==="ar"?"rtl":"ltr";
document.querySelectorAll("[data-i18n]").forEach(e=>{e.textContent=t(e.dataset.i18n)});
byId("langSelect").value=lang;byId("zoneSelect").value=zone;
}
function renderPortfolio(){
const q=n(byId("holdingQty").value),entry=n(byId("holdingCost").value),target=byId("portfolioResults");
if(!q||!entry||q<=0||entry<=0){target.textContent=t("enterPortfolio");set("portfolioPriceStatus","—");return}
const live=data?.live_quote||{},fresh=live.status==="fresh"&&age(live.retrieved_at_utc)!==null&&age(live.retrieved_at_utc)<=180&&n(live.price)>0;
const v=fresh?n(live.price):n(data?.market?.price),cost=q*entry,value=v===null?null:q*v,pl=value===null?null:value-cost;
set("portfolioPriceStatus",fresh?t("sourceLive"):t("sourceArchive"));
target.innerHTML=row(t("invested"),money(cost))+row(t("currentValue"),money(value))+row(t("profitLoss"),money(pl)+(pl===null?"":" ("+pct(pl/cost*100)+")"))+row(t("breakEven"),price(entry));
}
function renderChart(){
const canvas=byId("chart"),ctx=canvas?.getContext?.("2d");if(!ctx)return;
const rect=canvas.getBoundingClientRect(),w=Math.max(250,rect.width||750),h=Math.max(180,rect.height||300),ratio=Math.min(2,window.devicePixelRatio||1);
canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio);ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,w,h);
const dur={"15m":900000,"1h":3600000,"4h":14400000,"1d":86400000}[frame];
const candles=(data?.candles?.[frame]||[]).filter(c=>n(c.t)!==null&&[c.o,c.h,c.l,c.c].every(x=>n(x)!==null)&&c.t+dur<=Date.now()).slice(-130);
if(candles.length<2){set("chartnote",lang==="ar"?"لا توجد شموع مغلقة كافية":"Insufficient closed candles");return}
const lo=Math.min(...candles.map(c=>c.l)),hi=Math.max(...candles.map(c=>c.h)),span=(hi-lo)||hi*.01||1,low=lo-span*.08,high=hi+span*.08;
const left=10,right=84,top=10,bottom=35,ww=w-left-right,hh=h-top-bottom;
const yy=v=>top+(high-v)/(high-low)*hh,xx=i=>left+(i+.5)*ww/candles.length;
ctx.font="11px system-ui";ctx.lineWidth=1;
for(let i=0;i<=4;i++){const v=low+(high-low)*i/4,y=yy(v);ctx.strokeStyle="#23384c";ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(w-right,y);ctx.stroke();ctx.fillStyle="#9ab2c9";ctx.fillText(v.toFixed(7),w-right+5,y+4)}
const cw=Math.max(1,Math.min(8,ww/candles.length*.65));
candles.forEach((c,i)=>{const x=xx(i);ctx.strokeStyle=c.c>=c.o?"#4cddb1":"#fa8192";ctx.fillStyle=ctx.strokeStyle;ctx.beginPath();ctx.moveTo(x,yy(c.h));ctx.lineTo(x,yy(c.l));ctx.stroke();ctx.fillRect(x-cw/2,yy(Math.max(c.o,c.c)),cw,Math.max(1,Math.abs(yy(c.o)-yy(c.c))))});
set("chartnote",frame+" · "+candles.length+" candles · last close "+price(candles[candles.length-1].c)+" · "+stamp(new Date(candles[candles.length-1].t+dur).toISOString()));
set("chartHover",stamp(new Date(candles[candles.length-1].t).toISOString()));
}
function render(result,origin){
if(!result||!result.market)throw new Error("Invalid research data");
data=result;activeSource=origin;
const m=result.market,q=result.live_quote||{},health=result.health||{},score=result.scorecard||{},learn=result.learning||{};
const quoteFresh=q.status==="fresh"&&age(q.retrieved_at_utc)!==null&&age(q.retrieved_at_utc)<=180&&n(q.price)>0;
const researchAge=age(result.observed_utc),researchFresh=researchAge!==null&&researchAge<=900;
const quote=quoteFresh?q:m,obs=stamp(result.observed_utc),qt=quoteFresh?stamp(q.retrieved_at_utc):obs;
set("status",quoteFresh?(researchFresh&&origin==="live"?"LIVE":"LIVE PRICE / ARCHIVED RESEARCH"):"ARCHIVED / NOT LIVE");
byId("status").className="pill "+(quoteFresh?"fresh":"stale");
set("priceLabel",quoteFresh?t("livePrice"):t("archivedPrice"));set("price",price(quote.price));set("liveprice",price(m.price));
set("livetime",obs);// MEXC 24hr API supplies fractional change (e.g. 0.018 = 1.8%); do not remove this conversion.
set("change",pct(quoteFresh?q.change_24h_pct:n(m.change)===null?null:m.change*100));
set("source",quoteFresh?t("sourceLive"):t("sourceArchive"));set("observed",qt);
set("sourceLine","MEXC: "+(quoteFresh?stamp(q.provider_at_utc||q.retrieved_at_utc):t("unavailable"))+" · Research: "+obs+" ("+(researchAge===null?"unknown":Math.round(researchAge/60)+" min old")+") · Pipeline: "+stamp(health.at));
set("bid",price(quote.bid));set("ask",price(quote.ask));
const bid=n(quote.bid),ask=n(quote.ask);set("spread",bid>0&&ask>=bid?((ask-bid)/((ask+bid)/2)*100).toFixed(3)+"%":"—");
set("volume",money(quoteFresh?q.volume_24h_usdt:m.volume));
set("pipeline",health.passed===true?"PASS":"UNVERIFIED");
const liveModelVerified=Object.values(score.models||{}).some(x=>n(x.evaluated)>=100&&n(x.skill_vs_zero)>0&&x.promotion_eligible===true);
set("model",liveModelVerified&&learn.champion?learn.champion:t("modelNone"));
const warning=byId("warning");warning.hidden=quoteFresh&&researchFresh&&origin==="live";
warning.textContent=(origin!=="live"?"RECOVERY: archived research · ":"")+(quoteFresh?"":t("unavailable")+" · ")+(!researchFresh?t("stale")+" · "+obs:"");
const horizons=["1h","4h","24h","7d"];
byId("forecasts").innerHTML=horizons.map(h=>{const v=result.forecasts?.[h];const message=v===null||v===undefined||v===""?t("insufficient"):typeof v==="string"?v:JSON.stringify(v);return '<article class="forecast-card"><h3>'+h.toUpperCase()+'</h3><span class="forecast-tag no">'+t("unverified")+'</span><p>'+txt(message)+'</p></article>'}).join("");
set("forecastUpdated",obs);
byId("technical").innerHTML=["15m","1h","4h","1d"].map(tf=>{const v=result.technical?.[tf]||{};return '<div class="tech-frame"><strong>'+tf+'</strong>'+row("RSI 14",v.rsi14_simple??v.rsi14)+row("ADX 14",v.adx14)+row("EMA 9",price(v.ema9))+row("EMA 21",price(v.ema21))+row("ATR %",v.atr_pct)+'</div>'}).join("");
const b=m.book||{},tr=m.trades||{};
byId("orderbook").innerHTML=row("Research UTC",result.observed_utc)+row("Bid ±0.5%",money(b.depth_50bps?.bid_notional_usdt))+row("Ask ±0.5%",money(b.depth_50bps?.ask_notional_usdt))+row("Bid ±2%",money(b.depth_200bps?.bid_notional_usdt))+row("Ask ±2%",money(b.depth_200bps?.ask_notional_usdt))+row("Executed buy sample",money(tr.aggressive_buy_notional_usdt))+row("Executed sell sample",money(tr.aggressive_sell_notional_usdt))+'<p class="hint">Archived depth is cancelable and is not executable liquidity.</p>';
byId("dex").innerHTML=(result.dex||[]).map(x=>row((x.dex||"DEX")+" / "+(x.quote||"?"),money(x.liquidity)+" · 24h "+money(x.volume))).join("")+'<p class="hint">Liquidity values are third-party estimates, not confirmed new deposits.</p>';
byId("learning").innerHTML=row("Champion",learn.champion||t("modelNone"))+row("Samples",learn.samples)+row("Validation samples",learn.validation_samples)+row("Baseline MAE",learn.baseline_mae)+row("Evaluated forecasts",score.evaluated_total)+row("Pending",score.pending_total)+row("Missing outcomes",score.missing_total)+row("Evaluation coverage",pct(n(score.evaluation_coverage)===null?null:score.evaluation_coverage*100))+row("Minimum prospective evaluations",100)+row("Production signal gate",liveModelVerified?"RESEARCH PASS; NOT A TRADE SIGNAL":"NOT APPROVED")+Object.entries(score.models||{}).map(([key,x])=>row(key,"n="+x.evaluated+" · accuracy "+pct(n(x.direction_accuracy)===null?null:x.direction_accuracy*100)+" · 95% Wilson "+(x.direction_accuracy_wilson_95?.[0]===null||x.direction_accuracy_wilson_95?.[0]===undefined?"—":pct(x.direction_accuracy_wilson_95[0]*100)+" to "+pct(x.direction_accuracy_wilson_95[1]*100))+" · "+t("unverified"))).join("");
set("run",(health.event||"—")+" · "+(health.run||"—")+" · "+stamp(health.at));
const sources=result.source_health||{};
byId("health").innerHTML=Object.entries(health.steps||{}).map(([k,v])=>row("Pipeline · "+k,v)).join("")+
 Object.entries(sources).map(([k,v])=>row("Source · "+k,v.status==="ok"?"OK":("UNAVAILABLE"+(v.error?" ("+v.error+")":"")))).join("")+
 Object.entries(result.errors||{}).map(([k,v])=>row("Archive · "+k,"UNAVAILABLE ("+v+")")).join("")+
 row("Research age",researchAge===null?"unknown":Math.round(researchAge/60)+" minutes")+
 row("Research",obs)+row("Production HTTP smoke",health.production_smoke_passed===true?"PASS":health.production_smoke_passed===false?"FAIL":"NOT CHECKED")+row("Pipeline",health.passed===true?"PASS":"UNVERIFIED");
set("clock",stamp(new Date().toISOString()));renderPortfolio();renderChart();
}
async function request(path){
const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
try{const response=await fetch(path,{credentials:"same-origin",cache:"no-store",signal:controller.signal,headers:{Accept:"application/json"}});
if(!response.ok)throw new Error("HTTP "+response.status+" "+path);
const body=await response.json();if(!body||!body.market)throw new Error("Invalid JSON "+path);return body
}finally{clearTimeout(timer)}
}
async function refresh(){
if(loading)return;loading=true;byId("refresh").disabled=true;
try{
let result,origin="live",errors=[];
try{result=await request("/api/dashboard")}catch(e){errors.push(e.message);origin="recovery";
try{result=await request("/api/dashboard-lite")}catch(err){errors.push(err.message);
const embedded=byId("stamp-snapshot");if(!embedded)throw new Error(errors.join(" / "));
result=JSON.parse(embedded.content?embedded.content.textContent:embedded.textContent);origin="embedded";
}}
// The research API and live ticker are independent. A research outage must
// not force a fresh quote to be presented as an old archived price.
if(!result.live_quote||result.live_quote.status!=="fresh"||age(result.live_quote.retrieved_at_utc)>180){
 try{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),7000);
  let response;
  try{response=await fetch("/api/quote",{credentials:"same-origin",cache:"no-store",signal:controller.signal})}
  finally{clearTimeout(timer)}
  if(!response.ok)throw new Error("quote HTTP "+response.status);
  const payload=await response.json();
  if(payload.quote&&payload.quote.status==="fresh")result={...result,live_quote:payload.quote};
  else errors.push("live quote unavailable");
 }catch(quoteError){errors.push("quote: "+quoteError.message)}
}
render(result,origin);
if(errors.length){byId("warning").hidden=false;byId("warning").textContent="Recovery: "+errors.join(" / ")}
}catch(error){byId("warning").hidden=false;byId("warning").textContent="Connection error: "+error.message;set("status","ERROR")}
finally{loading=false;byId("refresh").disabled=false}
}
function exportCsv(){
const dur={"15m":900000,"1h":3600000,"4h":14400000,"1d":86400000}[frame];
const candles=(data?.candles?.[frame]||[]).filter(c=>n(c.t)!==null&&c.t+dur<=Date.now());
if(!candles.length){set("chartHover","No candles");return}
const lines=["utc,open,high,low,close,volume",...candles.map(c=>[new Date(c.t).toISOString(),c.o,c.h,c.l,c.c,c.v??""].join(","))].join("\r\n");
const url=URL.createObjectURL(new Blob([lines],{type:"text/csv"})),a=document.createElement("a");a.href=url;a.download="STAMP_"+frame+".csv";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
document.querySelectorAll("[data-frame]").forEach(button=>button.addEventListener("click",()=>{frame=button.dataset.frame;document.querySelectorAll("[data-frame]").forEach(b=>b.classList.toggle("selected",b===button));renderChart()}));
byId("refresh").addEventListener("click",refresh);byId("exportCandles").addEventListener("click",exportCsv);
byId("settingsButton").addEventListener("click",()=>byId("settings").showModal());
byId("logoutButton").addEventListener("click",async()=>{try{await fetch("/logout",{method:"POST",credentials:"same-origin",cache:"no-store"})}finally{window.location.href="/"}});
byId("diagnose").addEventListener("click",async()=>{set("diagnosticResult",lang==="ar"?"جار فحص المصدر وعمر البيانات…":"Checking sources and data age…");try{const response=await fetch("/api/status",{credentials:"same-origin",cache:"no-store"});if(!response.ok)throw new Error("HTTP "+response.status);const j=await response.json();const minutes=j.observation_age_seconds===null?"unknown":Math.round(j.observation_age_seconds/60)+" min";set("diagnosticResult","API: "+j.api+" · Research: "+j.research_source+" · Age: "+minutes+" · "+(j.research_fresh?"FRESH":"STALE")+" · Direct GitHub: "+(j.github_refresh_enabled?"ON":"OFF")+" · Quote: "+j.quote_status+" · "+stamp(j.observation_utc))}catch(e){set("diagnosticResult","Error "+e.message)}});
byId("langSelect").addEventListener("change",e=>{lang=e.target.value==="en"?"en":"ar";try{localStorage.setItem("stamp_language",lang)}catch(x){}translate();if(data)render(data,activeSource)});
byId("zoneSelect").addEventListener("change",e=>{zone=e.target.value==="UTC"?"UTC":"Asia/Baghdad";try{localStorage.setItem("stamp_timezone",zone)}catch(x){}translate();if(data)render(data,activeSource)});
try{const p=JSON.parse(localStorage.getItem("stamp_position")||"{}");if(n(p.quantity)>0&&n(p.entry)>0){byId("holdingQty").value=p.quantity;byId("holdingCost").value=p.entry}}catch(e){}
["holdingQty","holdingCost"].forEach(id=>byId(id).addEventListener("input",()=>{const quantity=n(byId("holdingQty").value),entry=n(byId("holdingCost").value);try{if(quantity>0&&entry>0)localStorage.setItem("stamp_position",JSON.stringify({quantity,entry}));else localStorage.removeItem("stamp_position")}catch(e){}renderPortfolio()}));
byId("portfolioClear").addEventListener("click",()=>{byId("holdingQty").value="";byId("holdingCost").value="";try{localStorage.removeItem("stamp_position")}catch(e){}renderPortfolio()});
window.addEventListener("resize",()=>{if(data)renderChart()});
translate();refresh();setInterval(refresh,90000);setInterval(()=>{if(data)render(data,activeSource)},30000);
})();
