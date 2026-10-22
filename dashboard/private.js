'use strict';
/* STAMP private research terminal: every live and archived datum carries its own source clock. */
let snapshot=null,frame='1h',chartData=[],chartGeometry=null;
const el=id=>document.getElementById(id);
const dictionary={
 ar:{diagnostics:'فحص الاتصال',runDiagnostics:'اختبار الاتصال بالخادم',portfolioTitle:'حاسبة المركز المالي (اختيارية)',portfolioSub:'حسابات تقريبية محلية على جهازك، ولا تُرسل إلى الخادم',quantity:'عدد عملات STAMP',averageCost:'متوسط تكلفة الشراء بالدولار',clearPortfolio:'مسح بيانات المركز',portfolioCaution:'القيمة والربح أو الخسارة تقديرية قبل الرسوم والانزلاق السعري، وليست سعر بيع قابلًا للتنفيذ.',invested:'تكلفة الشراء',currentValue:'القيمة التقديرية',profitLoss:'الربح / الخسارة',breakEven:'سعر التعادل قبل الرسوم',enterPortfolio:'أدخل الكمية ومتوسط التكلفة لحساب مركزك.',indicative:'تقدير على سعر MEXC',archiveValuation:'تقدير من سعر مؤرشف (غير مباشر)',ar_placeholder:'',subtitle:'لوحة التحليل الخاصة · بيانات موثّقة',refresh:'↻ تحديث',settings:'⚙ الإعدادات',livePrice:'السعر المباشر (MEXC)',archivedPrice:'السعر المؤرشف — ليس مباشرًا',archiveLabel:'آخر سعر في سجل التحليل',bestBid:'أفضل طلب شراء',bestAsk:'أفضل عرض بيع',spread:'الفارق السعري',volume:'حجم التداول 24 ساعة',pipeline:'حالة نظام التحليل',modelStatus:'اعتماد النموذج',history:'الرسم البياني للسعر',chartSub:'شموع MEXC المؤرشفة والمغلقة فقط · ليست بثًا مباشرًا',export:'↓ تنزيل شموع الفريم CSV',forecastTitle:'التوقعات والتحقق منها',forecastSub:'كل أفق زمني يعرض نتيجة البرنامج الفعلية، وليس توصية تداول',forecastDisclaimer:'عدم كفاية الأدلة يعني الامتناع عن إصدار توقع؛ لا توجد نسبة نجاح مؤكدة.',technical:'التحليل الفني',descriptive:'وصفي وليس إشارات',orderbook:'دفتر الأوامر والتنفيذ',snapshotOnly:'لقطة مؤرشفة فقط',dex:'سيولة DEX',estimates:'تقديرات مزودي البيانات',evaluation:'اختبارات النماذج',evidence:'نتائج خارج عينة التدريب',integrity:'سلامة البيانات وسير البرنامج',footer:'STAMP · بحث خاص للمتابعة، وليس توصية شراء أو بيع · الأسعار والسيولة والمؤشرات لها أوقات جمع مختلفة',settingsTitle:'إعدادات اللوحة والأمان',language:'لغة الواجهة',timezone:'توقيت عرض البيانات',security:'أمان الحساب',passwordHelp:'كلمة المرور محفوظة بشكل آمن في إعدادات Vercel. لتغييرها فعليًا، افتح متغير DASHBOARD_PASSWORD، حدّث قيمته ثم أعد نشر الإنتاج. لا تكتب كلمة مرورك هنا.',changePassword:'تغيير كلمة المرور في Vercel ↗',passwordNote:'تغيير متغير البيئة لا يفعّل كلمة المرور الجديدة حتى تعيد نشر التطبيق. قد تحتاج إلى تسجيل الدخول بحساب Vercel أولًا.',done:'تم',fresh:'سعر مباشر',stale:'بيانات التحليل قديمة',archive:'سعر مؤرشف',unavailable:'سعر مباشر غير متاح',ago:'مضت',seconds:'ث',minutes:'د',hours:'س',unknown:'غير معروف',sourceLive:'MEXC API العامة',sourceArchive:'مخرجات GitHub Actions المؤرشفة',sourcePolling:'مستودع GitHub الخاص',quoteTime:'وقت قراءة السعر',analysisTime:'وقت جمع التحليل',healthTime:'وقت فحص النظام',lastClose:'آخر إغلاق',closed:'شمعة مغلقة',noCandles:'لا توجد شموع مغلقة كافية لهذا الفريم',insufficient:'الأدلة غير كافية',unverified:'غير معتمد',validated:'مؤهل مبدئيًا فقط',statusOk:'ناجح',statusBad:'فشل / غير مؤكد',statusUnknown:'غير مؤكد',championNone:'لا يوجد نموذج معتمد',sourceError:'تعذر تحديث اللوحة؛ قد تكون القيم المعروضة قديمة',networkError:'خطأ في الاتصال',missing:'بيانات ناقصة',forecastTime:'بيانات التوقع عند',samples:'عينات البحث',validation:'عينات التحقق',evaluated:'توقعات مقيمة',pending:'توقعات معلقة',missingOutcome:'نتائج مفقودة',baseline:'خطأ النموذج الأساسي MAE',model:'النموذج',depth:'عمق',bidDepth:'طلبات شراء',askDepth:'طلبات بيع',buyFlow:'شراء منفذ (عينة)',sellFlow:'بيع منفذ (عينة)',netFlow:'صافي التدفق (عينة)',bookCaution:'العمق قابل للإلغاء فورًا، والتداولات عينة محدودة. ليست سيولة مضمونة.',dexCaution:'تقديرات سيولة المجمعات لا تثبت تدفق أموال جديدة.',modelCaution:'النتائج التجريبية لا تسمح بإشارة شراء أو بيع موثوقة.',candles:'شموع',indicatorsMissing:'مؤشرات غير كافية',csvEmpty:'لا توجد شموع للتصدير',chartTip:'مرّر المؤشر على الشموع لعرض OHLC'},
 en:{diagnostics:'Connection diagnostics',runDiagnostics:'Test server connection',portfolioTitle:'Position P&L (optional)',portfolioSub:'Indicative calculations stay in this browser; no holdings sent to the server',quantity:'STAMP quantity',averageCost:'Average entry price in USD',clearPortfolio:'Clear position',portfolioCaution:'Indicative value and P&L exclude fees and slippage; not an executable sell price.',invested:'Cost basis',currentValue:'Indicative value',profitLoss:'Profit / loss',breakEven:'Break-even before fees',enterPortfolio:'Enter quantity and average cost to calculate your position.',indicative:'Estimate using MEXC quote',archiveValuation:'Estimate using archived price (not live)',subtitle:'PRIVATE RESEARCH TERMINAL · VERIFIED DATA',refresh:'↻ Refresh',settings:'⚙ Settings',livePrice:'Live quote (MEXC)',archivedPrice:'Archived price — NOT LIVE',archiveLabel:'Last research snapshot price',bestBid:'BEST BID',bestAsk:'BEST ASK',spread:'SPREAD',volume:'24H MEXC VOLUME',pipeline:'PIPELINE',modelStatus:'MODEL STATUS',history:'Price history',chartSub:'Archived closed MEXC candles only · not a live stream',export:'↓ Export timeframe CSV',forecastTitle:'Forecasts & verification',forecastSub:'Actual model output by horizon; not a trading recommendation',forecastDisclaimer:'Insufficient evidence means the system abstains; no success rate is guaranteed.',technical:'Technical analysis',descriptive:'Descriptive, not signals',orderbook:'Order book & execution',snapshotOnly:'Archived snapshot only',dex:'DEX liquidity',estimates:'Third-party estimates',evaluation:'Model evaluation',evidence:'Out-of-sample evidence',integrity:'Pipeline & data integrity',footer:'STAMP · Private research, not trading advice · market sources have different collection timestamps',settingsTitle:'Dashboard & security settings',language:'Language',timezone:'Display timezone',security:'Account security',passwordHelp:'Your password is stored in Vercel environment variables. To change it for real, update DASHBOARD_PASSWORD in Vercel, then redeploy production. Do not enter your password here.',changePassword:'Change password in Vercel ↗',passwordNote:'Environment variable changes do not affect a running deployment until it is redeployed. You may need to sign into Vercel.',done:'Done',fresh:'LIVE QUOTE',stale:'STALE RESEARCH',archive:'ARCHIVED PRICE',unavailable:'LIVE QUOTE UNAVAILABLE',ago:'ago',seconds:'s',minutes:'m',hours:'h',unknown:'unknown',sourceLive:'MEXC public API',sourceArchive:'Archived GitHub Actions output',sourcePolling:'Private GitHub repository',quoteTime:'Quote fetched',analysisTime:'Research collected',healthTime:'Pipeline checked',lastClose:'Last close',closed:'closed candles',noCandles:'Not enough confirmed closed candles for this timeframe',insufficient:'INSUFFICIENT EVIDENCE',unverified:'NOT VALIDATED',validated:'PRELIMINARY ELIGIBILITY ONLY',statusOk:'PASS',statusBad:'FAILED / UNVERIFIED',statusUnknown:'UNKNOWN',championNone:'NO VALIDATED MODEL',sourceError:'Refresh failed; displayed values may be stale',networkError:'CONNECTION ERROR',missing:'Missing data',forecastTime:'Forecast research as of',samples:'Research samples',validation:'Validation samples',evaluated:'Evaluated forecasts',pending:'Pending forecasts',missingOutcome:'Missing timely outcomes',baseline:'Baseline MAE',model:'Model',depth:'Depth',bidDepth:'Bid',askDepth:'Ask',buyFlow:'Aggressive buys (sample)',sellFlow:'Aggressive sells (sample)',netFlow:'Net executed flow (sample)',bookCaution:'Displayed orders can be canceled. Executed trades are a limited sample, not guaranteed liquidity.',dexCaution:'DEX pool valuations are estimates, not proof of fresh deposits.',modelCaution:'Experimental results do not justify a validated BUY or SELL signal.',candles:'Candles',indicatorsMissing:'Insufficient indicators',csvEmpty:'No candles to export',chartTip:'Hover over candles for OHLC'}
};
let lang='ar',zone='Asia/Baghdad';
try{lang=localStorage.getItem('stamp_language')==='en'?'en':'ar';zone=localStorage.getItem('stamp_timezone')==='UTC'?'UTC':'Asia/Baghdad'}catch(_){}
const t=k=>dictionary[lang][k]||k;
const safe=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const numeric=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
const number=(v,d=2)=>numeric(v)===null?'—':Number(v).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
const price=v=>numeric(v)===null?'—':'$'+Number(v).toFixed(7);
const money=v=>numeric(v)===null?'—':(Number(v)<0?'-
const pct=v=>numeric(v)===null?'—':(v>=0?'+':'')+number(v,2)+'%';
const row=(name,value)=>'<div class="row"><span>'+safe(name)+'</span><strong>'+safe(value)+'</strong></div>';
const secondsSince=stamp=>{if(!stamp)return null;const ms=Date.parse(stamp);return Number.isFinite(ms)?Math.max(0,Math.floor((Date.now()-ms)/1000)):null};
const ageText=s=>s===null||!Number.isFinite(s)?t('unknown'):s<60?Math.floor(s)+t('seconds'):s<3600?Math.floor(s/60)+t('minutes'):number(s/3600,1)+t('hours');
const stampText=stamp=>{if(!stamp||!Number.isFinite(Date.parse(stamp)))return t('unknown');return new Intl.DateTimeFormat(lang==='ar'?'ar-IQ':'en-GB',{timeZone:zone,year:'numeric',month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(stamp))+' ('+(zone==='UTC'?'UTC':'UTC+3')+')'};
const dateMsText=ms=>Number.isFinite(ms)?stampText(new Date(ms).toISOString()):t('unknown');
function translate(){
 document.documentElement.lang=lang;document.documentElement.dir=lang==='ar'?'rtl':'ltr';
 document.querySelectorAll('[data-i18n]').forEach(node=>node.textContent=t(node.dataset.i18n));
 el('langSelect').value=lang;el('zoneSelect').value=zone;
}
function renderChart(){
 const canvas=el('chart'),ctx=canvas.getContext('2d'),rect=canvas.getBoundingClientRect(),ratio=Math.min(3,window.devicePixelRatio||1);
 const w=Math.max(100,rect.width),h=Math.max(120,rect.height);
 canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio);ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,w,h);
 const duration={'15m':900000,'1h':3600000,'4h':14400000,'1d':86400000}[frame];
 const all=(snapshot?.candles?.[frame]||[]).filter(c=>numeric(c.t)!==null&&[c.o,c.h,c.l,c.c].every(v=>numeric(v)!==null)&&c.t+duration<=Date.now());
 if(all.length<2){chartData=[];chartGeometry=null;el('chartnote').textContent=t('noCandles');el('chartHover').textContent='—';return}
 chartData=all.slice(-Math.min(150,all.length));
 const pad={l:12,r:84,t:12,b:30};let low=Math.min(...chartData.map(c=>c.l)),high=Math.max(...chartData.map(c=>c.h));
 const span=high-low||high*.01||1;low-=span*.06;high+=span*.06;
 const width=w-pad.l-pad.r,plotHeight=h-pad.t-pad.b;
 const x=i=>pad.l+(i+.5)*width/chartData.length,y=v=>pad.t+(high-v)/(high-low)*plotHeight;
 chartGeometry={pad,width,x,step:width/chartData.length};
 ctx.font='11px system-ui';ctx.lineWidth=1;
 for(let i=0;i<5;i++){const v=low+(high-low)*i/4,yy=y(v);ctx.strokeStyle='#23384c';ctx.beginPath();ctx.moveTo(pad.l,yy);ctx.lineTo(w-pad.r,yy);ctx.stroke();ctx.fillStyle='#90a8bf';ctx.textAlign='left';ctx.fillText(v.toFixed(7),w-pad.r+6,yy+4)}
 const bodyWidth=Math.max(1,Math.min(8,width/chartData.length*.64));
 chartData.forEach((c,i)=>{const xx=x(i),up=c.c>=c.o;ctx.strokeStyle=up?'#4cddb1':'#fa8192';ctx.fillStyle=ctx.strokeStyle;ctx.beginPath();ctx.moveTo(xx,y(c.h));ctx.lineTo(xx,y(c.l));ctx.stroke();const yy=y(Math.max(c.o,c.c)),body=Math.max(1.2,Math.abs(y(c.o)-y(c.c)));ctx.fillRect(xx-bodyWidth/2,yy,bodyWidth,body)});
 ctx.fillStyle='#90a8bf';ctx.textAlign='left';ctx.fillText(dateMsText(chartData[0].t).slice(0,21),pad.l,h-5);
 ctx.textAlign='right';ctx.fillText(dateMsText(chartData[chartData.length-1].t+duration).slice(0,21),w-pad.r,h-5);
 const last=chartData[chartData.length-1];
 el('chartnote').textContent=frame+' · '+chartData.length+' '+t('closed')+' · '+t('lastClose')+' '+price(last.c)+' · '+dateMsText(last.t+duration)+' · '+t('sourceArchive');
 el('chartHover').textContent=t('chartTip');
}
function chartHover(event){
 if(!chartGeometry||!chartData.length)return;
 const rect=el('chart').getBoundingClientRect(),pos=event.clientX-rect.left;
 const i=Math.max(0,Math.min(chartData.length-1,Math.floor((pos-chartGeometry.pad.l)/chartGeometry.step)));
 const c=chartData[i];el('chartHover').textContent=dateMsText(c.t)+' · O '+price(c.o)+' H '+price(c.h)+' L '+price(c.l)+' C '+price(c.c)+' · V '+number(c.v,0);
}
function renderPortfolio(){
 const q=numeric(el('holdingQty').value),entry=numeric(el('holdingCost').value);
 if(q===null||entry===null||q<=0||entry<=0){el('portfolioResults').textContent=t('enterPortfolio');el('portfolioPriceStatus').textContent='—';return}
 const quote=snapshot?.live_quote||{},age=secondsSince(quote.retrieved_at_utc);
 const fresh=quote.status==='fresh'&&age!==null&&age<=180&&numeric(quote.price)>0;
 const marketPrice=fresh?numeric(quote.price):numeric(snapshot?.market?.price);
 const cost=q*entry,valuation=marketPrice===null?null:q*marketPrice,pnl=valuation===null?null:valuation-cost;
 el('portfolioPriceStatus').textContent=fresh?t('indicative'):t('archiveValuation');
 el('portfolioResults').innerHTML=row(t('invested'),money(cost))+row(t('currentValue'),money(valuation))+row(t('profitLoss'),money(pnl)+(pnl===null?'':' ('+pct(pnl/cost*100)+')'))+row(t('breakEven'),price(entry));
}
function render(data){
 snapshot=data;const a=data.market||{},b=a.book||{},tr=a.trades||{},s=data.scorecard||{},l=data.learning||{},h=data.health||{},q=data.live_quote||{};
 const observedAge=secondsSince(data.observed_utc),researchFresh=observedAge!==null&&observedAge<=900;
 const quoteAge=secondsSince(q.retrieved_at_utc),quoteFresh=q.status==='fresh'&&quoteAge!==null&&quoteAge<=180&&numeric(q.price)>0;
 const displayedPrice=quoteFresh?q.price:a.price,displayedBid=quoteFresh?q.bid:a.bid,displayedAsk=quoteFresh?q.ask:a.ask;
 const displayedVolume=quoteFresh?q.volume_24h_usdt:a.volume;
 const displayedChange=quoteFresh?q.change_24h_pct:(numeric(a.change)!==null?a.change*100:null);
 const spread=(numeric(displayedBid)>0&&numeric(displayedAsk)>0&&displayedAsk>=displayedBid)?(displayedAsk-displayedBid)/((displayedAsk+displayedBid)/2)*100:null;
 el('status').textContent=quoteFresh?t('fresh'):numeric(a.price)!==null?t('archive'):t('unavailable');
 el('status').className='pill '+(quoteFresh?'fresh':'stale');
 el('priceLabel').textContent=quoteFresh?t('livePrice'):t('archivedPrice');
 el('price').textContent=price(displayedPrice);
 el('liveprice').textContent=price(a.price);
 el('liveprice').className=researchFresh?'fresh':'unavailable';
 el('livetime').textContent=t('analysisTime')+': '+stampText(data.observed_utc)+' · '+ageText(observedAge);
 el('change').textContent=pct(displayedChange);el('change').className='delta '+(numeric(displayedChange)!==null?(displayedChange>=0?'positive':'negative'):'');
 el('observed').textContent=(quoteFresh?t('quoteTime'):t('analysisTime'))+': '+stampText(quoteFresh?q.retrieved_at_utc:data.observed_utc)+' · '+ageText(quoteFresh?quoteAge:observedAge);
 el('source').textContent=quoteFresh?t('sourceLive'):t('sourceArchive');
 el('sourceLine').textContent=t('quoteTime')+': '+(quoteFresh?stampText(q.retrieved_at_utc):t('unavailable'))+' · '+t('analysisTime')+': '+stampText(data.observed_utc)+' · '+t('healthTime')+': '+stampText(h.at);
 const errors=Object.keys(data.errors||{});const warnings=[];
 if(!quoteFresh)warnings.push(t('unavailable')+' — '+t('archive'));
 if(!researchFresh)warnings.push(t('stale')+' · '+ageText(observedAge));
 if(errors.length)warnings.push(t('missing')+': '+errors.join(', '));
 el('warning').hidden=warnings.length===0;el('warning').textContent=warnings.join(' · ');
 el('bid').textContent=price(displayedBid);el('ask').textContent=price(displayedAsk);
 el('spread').textContent=numeric(spread)===null?'—':number(spread,3)+'%';el('volume').textContent=money(displayedVolume);
 el('pipeline').textContent=h.passed===true?t('statusOk'):t('statusBad');el('pipeline').className=h.passed===true?'good':'bad';
 el('model').textContent=l.champion||t('championNone');
 const horizons=[['1h','1H'],['4h','4H'],['24h','24H'],['7d','7D']];
 el('forecasts').innerHTML=horizons.map(([key,label])=>{
  const v=data.forecasts?.[key],object=v&&typeof v==='object'?v:null;
  const msg=object?(object.message||object.reason||object.status||JSON.stringify(object)):v;
  const abstain=!v||typeof v==='string'&&(/لا توجد بيانات|غير كاف|insufficient|no forecast|unavailable/i.test(v));
  return '<article class="forecast-card"><h3>'+label+'</h3><span class="forecast-tag '+(abstain?'no':'')+'">'+safe(abstain?t('insufficient'):t('unverified'))+'</span><p>'+safe(msg||t('insufficient'))+'</p></article>';
 }).join('');
 el('forecastUpdated').textContent=t('forecastTime')+': '+stampText(data.observed_utc);
 el('technical').innerHTML=['15m','1h','4h','1d'].map(tf=>{const z=data.technical?.[tf]||{};return '<div class="tech-frame">'+tf.toUpperCase()+' · '+safe(z.status||t('indicatorsMissing'))+' · '+safe(String(z.candles??'—'))+' '+t('candles')+'</div>'+row('RSI 14',number(z.rsi14_simple??z.rsi14,1))+row('ADX 14',number(z.adx14,1))+row('EMA 9',price(z.ema9))+row('EMA 21',price(z.ema21))+row('MACD histogram',number(z.macd_histogram,9))+row('ATR %',numeric(z.atr_pct)===null?'—':number(z.atr_pct,2)+'%')}).join('');
 el('orderbook').innerHTML=row(t('analysisTime'),stampText(data.observed_utc))+row(t('bidDepth')+' ±0.5%',money(b.depth_50bps?.bid_notional_usdt))+row(t('askDepth')+' ±0.5%',money(b.depth_50bps?.ask_notional_usdt))+row(t('bidDepth')+' ±2%',money(b.depth_200bps?.bid_notional_usdt))+row(t('askDepth')+' ±2%',money(b.depth_200bps?.ask_notional_usdt))+row(t('buyFlow'),money(tr.aggressive_buy_notional_usdt))+row(t('sellFlow'),money(tr.aggressive_sell_notional_usdt))+row(t('netFlow'),money(tr.net_aggressive_notional_usdt))+'<p class="hint">'+t('bookCaution')+'</p>';
 el('dex').innerHTML=(data.dex||[]).slice(0,8).map(d=>row((d.dex||'DEX')+' / '+(d.quote||'?'),money(d.liquidity)+' · 24h '+money(d.volume))).join('')+'<p class="hint">'+t('dexCaution')+'</p>';
 const models=Object.entries(l.challengers||{}),audited=Object.entries(s.models||{});
 el('learning').innerHTML=row(t('model'),l.champion||t('championNone'))+row(t('samples'),l.samples??'—')+row(t('validation'),l.validation_samples??'—')+row(t('baseline'),number(l.baseline_mae,6))+row(t('evaluated'),s.evaluated_total??'—')+row(t('pending'),s.pending_total??'—')+row(t('missingOutcome'),s.missing_total??'—')+models.map(([name,m])=>row(name,'MAE '+number(m.mae,6)+' · skill '+pct(numeric(m.skill_vs_zero)===null?null:m.skill_vs_zero*100))).join('')+audited.map(([name,m])=>row(name,'n='+number(m.evaluated,0)+' · accuracy '+pct(numeric(m.direction_accuracy)===null?null:m.direction_accuracy*100)+' · '+(m.promotion_eligible?t('validated'):t('unverified')))).join('')+'<p class="hint">'+t('modelCaution')+'</p>';
 el('run').textContent=(h.event||'—')+' · '+(h.run||'—')+' · '+stampText(h.at);
 el('health').innerHTML=Object.entries(h.steps||{}).map(([k,v])=>row(k,v)).join('')+row(t('analysisTime'),stampText(data.observed_utc))+row(t('healthTime'),stampText(h.at))+row(t('pipeline'),h.passed===true?t('statusOk'):t('statusBad'));
 el('clock').textContent=stampText(new Date().toISOString());
 renderPortfolio();renderChart();
}
async function fetchDashboard(path){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
 try{
  const response=await fetch(path,{cache:'no-store',credentials:'same-origin',signal:controller.signal,headers:{Accept:'application/json'}});
  if(response.status===401||response.status===403)throw new Error('AUTH_'+response.status);
  if(!response.ok){
   let code='';try{const obj=await response.json();code=obj.error||obj.code||''}catch(_){}
   throw new Error('HTTP_'+response.status+(code?'_'+code:''));
  }
  const type=response.headers?.get?.('content-type')||'';
  if(type&&!type.includes('application/json'))throw new Error('NOT_JSON_'+response.status);
  const data=await response.json();
  if(!data||typeof data!=='object'||!data.market)throw new Error('INVALID_PAYLOAD');
  return data;
 }finally{clearTimeout(timer)}
}
async function refresh(){
 if(el('refresh').disabled)return;
 el('refresh').disabled=true;
 try{
  const embedded=el('stamp-snapshot');
  if(embedded){render(JSON.parse(embedded.textContent));return}
  let data,primaryError=null;
  try{data=await fetchDashboard('/api/dashboard')}
  catch(err){
   primaryError=err;
   // A failed public quote or a slow upstream API must not hide archived analysis.
   if(String(err.message).startsWith('AUTH_'))throw err;
   try{data=await fetchDashboard('/api/dashboard-lite')}
   catch(recoveryError){throw new Error('primary='+String(err.message)+'; recovery='+String(recoveryError.message))}
  }
  render(data);
  if(primaryError){
   el('warning').hidden=false;
   el('warning').textContent=(lang==='ar'?'وضع الاسترداد: تظهر تحليلات مؤرشفة فقط؛ تعذر الاتصال بالخدمة الأساسية. ':'Recovery mode: archived research only; main API unavailable. ')+String(primaryError.message).slice(0,110);
  }
 }catch(e){
  const reason=String(e.message||e).slice(0,180);
  const auth=reason.includes('AUTH_401')||reason.includes('AUTH_403');
  el('warning').hidden=false;
  el('warning').textContent=(auth?(lang==='ar'?'انتهت صلاحية الدخول أو رُفض التفويض. أعد تسجيل الدخول وحدّث الصفحة. ':'Authentication rejected. Sign in again and refresh. '):t('sourceError')+' ')+reason;
  el('status').textContent=t('networkError');el('status').className='pill stale';
 }finally{el('refresh').disabled=false}
}
function exportCsv(){
 const duration={'15m':900000,'1h':3600000,'4h':14400000,'1d':86400000}[frame];
 const rows=(snapshot?.candles?.[frame]||[]).filter(c=>numeric(c.t)!==null&&c.t+duration<=Date.now());
 if(!rows.length){el('chartHover').textContent=t('csvEmpty');return}
 const csv=['open_utc,open,high,low,close,volume'].concat(rows.map(c=>[new Date(c.t).toISOString(),c.o,c.h,c.l,c.c,c.v??''].join(','))).join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download='STAMP_MEXC_'+frame+'_closed.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
document.querySelectorAll('[data-frame]').forEach(button=>button.addEventListener('click',()=>{frame=button.dataset.frame;document.querySelectorAll('[data-frame]').forEach(b=>b.classList.toggle('selected',b===button));renderChart()}));
el('refresh').addEventListener('click',refresh);el('exportCandles').addEventListener('click',exportCsv);
try{const p=JSON.parse(localStorage.getItem('stamp_position')||'{}');if(numeric(p.quantity)>0&&numeric(p.entry)>0){el('holdingQty').value=String(p.quantity);el('holdingCost').value=String(p.entry)}}catch(_){}
['holdingQty','holdingCost'].forEach(id=>el(id).addEventListener('input',()=>{
 const quantity=numeric(el('holdingQty').value),entry=numeric(el('holdingCost').value);
 try{if(quantity>0&&entry>0)localStorage.setItem('stamp_position',JSON.stringify({quantity,entry}));else localStorage.removeItem('stamp_position')}catch(_){}
 renderPortfolio();
}));
el('portfolioClear').addEventListener('click',()=>{el('holdingQty').value='';el('holdingCost').value='';try{localStorage.removeItem('stamp_position')}catch(_){}renderPortfolio()});
el('chart').addEventListener('pointermove',chartHover);
el('settingsButton').addEventListener('click',()=>el('settings').showModal());
el('diagnose').addEventListener('click',async()=>{
 const button=el('diagnose'),out=el('diagnosticResult');button.disabled=true;
 try{
  const response=await fetch('/api/status',{cache:'no-store',credentials:'same-origin'});
  if(!response.ok)throw new Error('HTTP '+response.status);
  const info=await response.json();
  out.textContent='API: '+info.api+' | research: '+String(info.embedded_research)+' | '+stampText(info.observation_utc);
 }catch(error){out.textContent='Connection test: '+String(error.message).slice(0,100)}
 finally{button.disabled=false}
});

el('langSelect').addEventListener('change',event=>{lang=event.target.value==='en'?'en':'ar';try{localStorage.setItem('stamp_language',lang)}catch(_){}translate();if(snapshot)render(snapshot)});
el('zoneSelect').addEventListener('change',event=>{zone=event.target.value==='UTC'?'UTC':'Asia/Baghdad';try{localStorage.setItem('stamp_timezone',zone)}catch(_){}translate();if(snapshot)render(snapshot)});
window.addEventListener('resize',()=>{if(snapshot)renderChart()});
translate();refresh();setInterval(refresh,90000);setInterval(()=>{if(snapshot)render(snapshot)},30000);
:'
const pct=v=>numeric(v)===null?'—':(v>=0?'+':'')+number(v,2)+'%';
const row=(name,value)=>'<div class="row"><span>'+safe(name)+'</span><strong>'+safe(value)+'</strong></div>';
const secondsSince=stamp=>{if(!stamp)return null;const ms=Date.parse(stamp);return Number.isFinite(ms)?Math.max(0,Math.floor((Date.now()-ms)/1000)):null};
const ageText=s=>s===null||!Number.isFinite(s)?t('unknown'):s<60?Math.floor(s)+t('seconds'):s<3600?Math.floor(s/60)+t('minutes'):number(s/3600,1)+t('hours');
const stampText=stamp=>{if(!stamp||!Number.isFinite(Date.parse(stamp)))return t('unknown');return new Intl.DateTimeFormat(lang==='ar'?'ar-IQ':'en-GB',{timeZone:zone,year:'numeric',month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(stamp))+' ('+(zone==='UTC'?'UTC':'UTC+3')+')'};
const dateMsText=ms=>Number.isFinite(ms)?stampText(new Date(ms).toISOString()):t('unknown');
function translate(){
 document.documentElement.lang=lang;document.documentElement.dir=lang==='ar'?'rtl':'ltr';
 document.querySelectorAll('[data-i18n]').forEach(node=>node.textContent=t(node.dataset.i18n));
 el('langSelect').value=lang;el('zoneSelect').value=zone;
}
function renderChart(){
 const canvas=el('chart'),ctx=canvas.getContext('2d'),rect=canvas.getBoundingClientRect(),ratio=Math.min(3,window.devicePixelRatio||1);
 const w=Math.max(100,rect.width),h=Math.max(120,rect.height);
 canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio);ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,w,h);
 const duration={'15m':900000,'1h':3600000,'4h':14400000,'1d':86400000}[frame];
 const all=(snapshot?.candles?.[frame]||[]).filter(c=>numeric(c.t)!==null&&[c.o,c.h,c.l,c.c].every(v=>numeric(v)!==null)&&c.t+duration<=Date.now());
 if(all.length<2){chartData=[];chartGeometry=null;el('chartnote').textContent=t('noCandles');el('chartHover').textContent='—';return}
 chartData=all.slice(-Math.min(150,all.length));
 const pad={l:12,r:84,t:12,b:30};let low=Math.min(...chartData.map(c=>c.l)),high=Math.max(...chartData.map(c=>c.h));
 const span=high-low||high*.01||1;low-=span*.06;high+=span*.06;
 const width=w-pad.l-pad.r,plotHeight=h-pad.t-pad.b;
 const x=i=>pad.l+(i+.5)*width/chartData.length,y=v=>pad.t+(high-v)/(high-low)*plotHeight;
 chartGeometry={pad,width,x,step:width/chartData.length};
 ctx.font='11px system-ui';ctx.lineWidth=1;
 for(let i=0;i<5;i++){const v=low+(high-low)*i/4,yy=y(v);ctx.strokeStyle='#23384c';ctx.beginPath();ctx.moveTo(pad.l,yy);ctx.lineTo(w-pad.r,yy);ctx.stroke();ctx.fillStyle='#90a8bf';ctx.textAlign='left';ctx.fillText(v.toFixed(7),w-pad.r+6,yy+4)}
 const bodyWidth=Math.max(1,Math.min(8,width/chartData.length*.64));
 chartData.forEach((c,i)=>{const xx=x(i),up=c.c>=c.o;ctx.strokeStyle=up?'#4cddb1':'#fa8192';ctx.fillStyle=ctx.strokeStyle;ctx.beginPath();ctx.moveTo(xx,y(c.h));ctx.lineTo(xx,y(c.l));ctx.stroke();const yy=y(Math.max(c.o,c.c)),body=Math.max(1.2,Math.abs(y(c.o)-y(c.c)));ctx.fillRect(xx-bodyWidth/2,yy,bodyWidth,body)});
 ctx.fillStyle='#90a8bf';ctx.textAlign='left';ctx.fillText(dateMsText(chartData[0].t).slice(0,21),pad.l,h-5);
 ctx.textAlign='right';ctx.fillText(dateMsText(chartData[chartData.length-1].t+duration).slice(0,21),w-pad.r,h-5);
 const last=chartData[chartData.length-1];
 el('chartnote').textContent=frame+' · '+chartData.length+' '+t('closed')+' · '+t('lastClose')+' '+price(last.c)+' · '+dateMsText(last.t+duration)+' · '+t('sourceArchive');
 el('chartHover').textContent=t('chartTip');
}
function chartHover(event){
 if(!chartGeometry||!chartData.length)return;
 const rect=el('chart').getBoundingClientRect(),pos=event.clientX-rect.left;
 const i=Math.max(0,Math.min(chartData.length-1,Math.floor((pos-chartGeometry.pad.l)/chartGeometry.step)));
 const c=chartData[i];el('chartHover').textContent=dateMsText(c.t)+' · O '+price(c.o)+' H '+price(c.h)+' L '+price(c.l)+' C '+price(c.c)+' · V '+number(c.v,0);
}
function renderPortfolio(){
 const q=numeric(el('holdingQty').value),entry=numeric(el('holdingCost').value);
 if(q===null||entry===null||q<=0||entry<=0){el('portfolioResults').textContent=t('enterPortfolio');el('portfolioPriceStatus').textContent='—';return}
 const quote=snapshot?.live_quote||{},age=secondsSince(quote.retrieved_at_utc);
 const fresh=quote.status==='fresh'&&age!==null&&age<=180&&numeric(quote.price)>0;
 const marketPrice=fresh?numeric(quote.price):numeric(snapshot?.market?.price);
 const cost=q*entry,valuation=marketPrice===null?null:q*marketPrice,pnl=valuation===null?null:valuation-cost;
 el('portfolioPriceStatus').textContent=fresh?t('indicative'):t('archiveValuation');
 el('portfolioResults').innerHTML=row(t('invested'),money(cost))+row(t('currentValue'),money(valuation))+row(t('profitLoss'),money(pnl)+(pnl===null?'':' ('+pct(pnl/cost*100)+')'))+row(t('breakEven'),price(entry));
}
function render(data){
 snapshot=data;const a=data.market||{},b=a.book||{},tr=a.trades||{},s=data.scorecard||{},l=data.learning||{},h=data.health||{},q=data.live_quote||{};
 const observedAge=secondsSince(data.observed_utc),researchFresh=observedAge!==null&&observedAge<=900;
 const quoteAge=secondsSince(q.retrieved_at_utc),quoteFresh=q.status==='fresh'&&quoteAge!==null&&quoteAge<=180&&numeric(q.price)>0;
 const displayedPrice=quoteFresh?q.price:a.price,displayedBid=quoteFresh?q.bid:a.bid,displayedAsk=quoteFresh?q.ask:a.ask;
 const displayedVolume=quoteFresh?q.volume_24h_usdt:a.volume;
 const displayedChange=quoteFresh?q.change_24h_pct:(numeric(a.change)!==null?a.change*100:null);
 const spread=(numeric(displayedBid)>0&&numeric(displayedAsk)>0&&displayedAsk>=displayedBid)?(displayedAsk-displayedBid)/((displayedAsk+displayedBid)/2)*100:null;
 el('status').textContent=quoteFresh?t('fresh'):numeric(a.price)!==null?t('archive'):t('unavailable');
 el('status').className='pill '+(quoteFresh?'fresh':'stale');
 el('priceLabel').textContent=quoteFresh?t('livePrice'):t('archivedPrice');
 el('price').textContent=price(displayedPrice);
 el('liveprice').textContent=price(a.price);
 el('liveprice').className=researchFresh?'fresh':'unavailable';
 el('livetime').textContent=t('analysisTime')+': '+stampText(data.observed_utc)+' · '+ageText(observedAge);
 el('change').textContent=pct(displayedChange);el('change').className='delta '+(numeric(displayedChange)!==null?(displayedChange>=0?'positive':'negative'):'');
 el('observed').textContent=(quoteFresh?t('quoteTime'):t('analysisTime'))+': '+stampText(quoteFresh?q.retrieved_at_utc:data.observed_utc)+' · '+ageText(quoteFresh?quoteAge:observedAge);
 el('source').textContent=quoteFresh?t('sourceLive'):t('sourceArchive');
 el('sourceLine').textContent=t('quoteTime')+': '+(quoteFresh?stampText(q.retrieved_at_utc):t('unavailable'))+' · '+t('analysisTime')+': '+stampText(data.observed_utc)+' · '+t('healthTime')+': '+stampText(h.at);
 const errors=Object.keys(data.errors||{});const warnings=[];
 if(!quoteFresh)warnings.push(t('unavailable')+' — '+t('archive'));
 if(!researchFresh)warnings.push(t('stale')+' · '+ageText(observedAge));
 if(errors.length)warnings.push(t('missing')+': '+errors.join(', '));
 el('warning').hidden=warnings.length===0;el('warning').textContent=warnings.join(' · ');
 el('bid').textContent=price(displayedBid);el('ask').textContent=price(displayedAsk);
 el('spread').textContent=numeric(spread)===null?'—':number(spread,3)+'%';el('volume').textContent=money(displayedVolume);
 el('pipeline').textContent=h.passed===true?t('statusOk'):t('statusBad');el('pipeline').className=h.passed===true?'good':'bad';
 el('model').textContent=l.champion||t('championNone');
 const horizons=[['1h','1H'],['4h','4H'],['24h','24H'],['7d','7D']];
 el('forecasts').innerHTML=horizons.map(([key,label])=>{
  const v=data.forecasts?.[key],object=v&&typeof v==='object'?v:null;
  const msg=object?(object.message||object.reason||object.status||JSON.stringify(object)):v;
  const abstain=!v||typeof v==='string'&&(/لا توجد بيانات|غير كاف|insufficient|no forecast|unavailable/i.test(v));
  return '<article class="forecast-card"><h3>'+label+'</h3><span class="forecast-tag '+(abstain?'no':'')+'">'+safe(abstain?t('insufficient'):t('unverified'))+'</span><p>'+safe(msg||t('insufficient'))+'</p></article>';
 }).join('');
 el('forecastUpdated').textContent=t('forecastTime')+': '+stampText(data.observed_utc);
 el('technical').innerHTML=['15m','1h','4h','1d'].map(tf=>{const z=data.technical?.[tf]||{};return '<div class="tech-frame">'+tf.toUpperCase()+' · '+safe(z.status||t('indicatorsMissing'))+' · '+safe(String(z.candles??'—'))+' '+t('candles')+'</div>'+row('RSI 14',number(z.rsi14_simple??z.rsi14,1))+row('ADX 14',number(z.adx14,1))+row('EMA 9',price(z.ema9))+row('EMA 21',price(z.ema21))+row('MACD histogram',number(z.macd_histogram,9))+row('ATR %',numeric(z.atr_pct)===null?'—':number(z.atr_pct,2)+'%')}).join('');
 el('orderbook').innerHTML=row(t('analysisTime'),stampText(data.observed_utc))+row(t('bidDepth')+' ±0.5%',money(b.depth_50bps?.bid_notional_usdt))+row(t('askDepth')+' ±0.5%',money(b.depth_50bps?.ask_notional_usdt))+row(t('bidDepth')+' ±2%',money(b.depth_200bps?.bid_notional_usdt))+row(t('askDepth')+' ±2%',money(b.depth_200bps?.ask_notional_usdt))+row(t('buyFlow'),money(tr.aggressive_buy_notional_usdt))+row(t('sellFlow'),money(tr.aggressive_sell_notional_usdt))+row(t('netFlow'),money(tr.net_aggressive_notional_usdt))+'<p class="hint">'+t('bookCaution')+'</p>';
 el('dex').innerHTML=(data.dex||[]).slice(0,8).map(d=>row((d.dex||'DEX')+' / '+(d.quote||'?'),money(d.liquidity)+' · 24h '+money(d.volume))).join('')+'<p class="hint">'+t('dexCaution')+'</p>';
 const models=Object.entries(l.challengers||{}),audited=Object.entries(s.models||{});
 el('learning').innerHTML=row(t('model'),l.champion||t('championNone'))+row(t('samples'),l.samples??'—')+row(t('validation'),l.validation_samples??'—')+row(t('baseline'),number(l.baseline_mae,6))+row(t('evaluated'),s.evaluated_total??'—')+row(t('pending'),s.pending_total??'—')+row(t('missingOutcome'),s.missing_total??'—')+models.map(([name,m])=>row(name,'MAE '+number(m.mae,6)+' · skill '+pct(numeric(m.skill_vs_zero)===null?null:m.skill_vs_zero*100))).join('')+audited.map(([name,m])=>row(name,'n='+number(m.evaluated,0)+' · accuracy '+pct(numeric(m.direction_accuracy)===null?null:m.direction_accuracy*100)+' · '+(m.promotion_eligible?t('validated'):t('unverified')))).join('')+'<p class="hint">'+t('modelCaution')+'</p>';
 el('run').textContent=(h.event||'—')+' · '+(h.run||'—')+' · '+stampText(h.at);
 el('health').innerHTML=Object.entries(h.steps||{}).map(([k,v])=>row(k,v)).join('')+row(t('analysisTime'),stampText(data.observed_utc))+row(t('healthTime'),stampText(h.at))+row(t('pipeline'),h.passed===true?t('statusOk'):t('statusBad'));
 el('clock').textContent=stampText(new Date().toISOString());
 renderPortfolio();renderChart();
}
async function refresh(){
 el('refresh').disabled=true;
 try{
  const embedded=el('stamp-snapshot');
  if(embedded){render(JSON.parse(embedded.textContent))}
  else{
   const res=await fetch('/api/dashboard',{cache:'no-store',credentials:'same-origin'});
   if(!res.ok)throw new Error('HTTP '+res.status);
   const data=await res.json();if(!data||typeof data!=='object'||!data.market)throw new Error('Invalid dashboard response');
   render(data);
  }
 }catch(e){
  el('warning').hidden=false;el('warning').textContent=t('sourceError')+' ('+String(e.message).slice(0,100)+')';
  el('status').textContent=t('networkError');el('status').className='pill stale';
 }finally{el('refresh').disabled=false}
}
function exportCsv(){
 const duration={'15m':900000,'1h':3600000,'4h':14400000,'1d':86400000}[frame];
 const rows=(snapshot?.candles?.[frame]||[]).filter(c=>numeric(c.t)!==null&&c.t+duration<=Date.now());
 if(!rows.length){el('chartHover').textContent=t('csvEmpty');return}
 const csv=['open_utc,open,high,low,close,volume'].concat(rows.map(c=>[new Date(c.t).toISOString(),c.o,c.h,c.l,c.c,c.v??''].join(','))).join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download='STAMP_MEXC_'+frame+'_closed.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
document.querySelectorAll('[data-frame]').forEach(button=>button.addEventListener('click',()=>{frame=button.dataset.frame;document.querySelectorAll('[data-frame]').forEach(b=>b.classList.toggle('selected',b===button));renderChart()}));
el('refresh').addEventListener('click',refresh);el('exportCandles').addEventListener('click',exportCsv);
try{const p=JSON.parse(localStorage.getItem('stamp_position')||'{}');if(numeric(p.quantity)>0&&numeric(p.entry)>0){el('holdingQty').value=String(p.quantity);el('holdingCost').value=String(p.entry)}}catch(_){}
['holdingQty','holdingCost'].forEach(id=>el(id).addEventListener('input',()=>{
 const quantity=numeric(el('holdingQty').value),entry=numeric(el('holdingCost').value);
 try{if(quantity>0&&entry>0)localStorage.setItem('stamp_position',JSON.stringify({quantity,entry}));else localStorage.removeItem('stamp_position')}catch(_){}
 renderPortfolio();
}));
el('portfolioClear').addEventListener('click',()=>{el('holdingQty').value='';el('holdingCost').value='';try{localStorage.removeItem('stamp_position')}catch(_){}renderPortfolio()});
el('chart').addEventListener('pointermove',chartHover);
el('settingsButton').addEventListener('click',()=>el('settings').showModal());
el('langSelect').addEventListener('change',event=>{lang=event.target.value==='en'?'en':'ar';try{localStorage.setItem('stamp_language',lang)}catch(_){}translate();if(snapshot)render(snapshot)});
el('zoneSelect').addEventListener('change',event=>{zone=event.target.value==='UTC'?'UTC':'Asia/Baghdad';try{localStorage.setItem('stamp_timezone',zone)}catch(_){}translate();if(snapshot)render(snapshot)});
window.addEventListener('resize',()=>{if(snapshot)renderChart()});
translate();refresh();setInterval(refresh,90000);setInterval(()=>{if(snapshot)render(snapshot)},30000);
)+number(Math.abs(Number(v)),2);
const pct=v=>numeric(v)===null?'—':(v>=0?'+':'')+number(v,2)+'%';
const row=(name,value)=>'<div class="row"><span>'+safe(name)+'</span><strong>'+safe(value)+'</strong></div>';
const secondsSince=stamp=>{if(!stamp)return null;const ms=Date.parse(stamp);return Number.isFinite(ms)?Math.max(0,Math.floor((Date.now()-ms)/1000)):null};
const ageText=s=>s===null||!Number.isFinite(s)?t('unknown'):s<60?Math.floor(s)+t('seconds'):s<3600?Math.floor(s/60)+t('minutes'):number(s/3600,1)+t('hours');
const stampText=stamp=>{if(!stamp||!Number.isFinite(Date.parse(stamp)))return t('unknown');return new Intl.DateTimeFormat(lang==='ar'?'ar-IQ':'en-GB',{timeZone:zone,year:'numeric',month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(stamp))+' ('+(zone==='UTC'?'UTC':'UTC+3')+')'};
const dateMsText=ms=>Number.isFinite(ms)?stampText(new Date(ms).toISOString()):t('unknown');
function translate(){
 document.documentElement.lang=lang;document.documentElement.dir=lang==='ar'?'rtl':'ltr';
 document.querySelectorAll('[data-i18n]').forEach(node=>node.textContent=t(node.dataset.i18n));
 el('langSelect').value=lang;el('zoneSelect').value=zone;
}
function renderChart(){
 const canvas=el('chart'),ctx=canvas.getContext('2d'),rect=canvas.getBoundingClientRect(),ratio=Math.min(3,window.devicePixelRatio||1);
 const w=Math.max(100,rect.width),h=Math.max(120,rect.height);
 canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio);ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,w,h);
 const duration={'15m':900000,'1h':3600000,'4h':14400000,'1d':86400000}[frame];
 const all=(snapshot?.candles?.[frame]||[]).filter(c=>numeric(c.t)!==null&&[c.o,c.h,c.l,c.c].every(v=>numeric(v)!==null)&&c.t+duration<=Date.now());
 if(all.length<2){chartData=[];chartGeometry=null;el('chartnote').textContent=t('noCandles');el('chartHover').textContent='—';return}
 chartData=all.slice(-Math.min(150,all.length));
 const pad={l:12,r:84,t:12,b:30};let low=Math.min(...chartData.map(c=>c.l)),high=Math.max(...chartData.map(c=>c.h));
 const span=high-low||high*.01||1;low-=span*.06;high+=span*.06;
 const width=w-pad.l-pad.r,plotHeight=h-pad.t-pad.b;
 const x=i=>pad.l+(i+.5)*width/chartData.length,y=v=>pad.t+(high-v)/(high-low)*plotHeight;
 chartGeometry={pad,width,x,step:width/chartData.length};
 ctx.font='11px system-ui';ctx.lineWidth=1;
 for(let i=0;i<5;i++){const v=low+(high-low)*i/4,yy=y(v);ctx.strokeStyle='#23384c';ctx.beginPath();ctx.moveTo(pad.l,yy);ctx.lineTo(w-pad.r,yy);ctx.stroke();ctx.fillStyle='#90a8bf';ctx.textAlign='left';ctx.fillText(v.toFixed(7),w-pad.r+6,yy+4)}
 const bodyWidth=Math.max(1,Math.min(8,width/chartData.length*.64));
 chartData.forEach((c,i)=>{const xx=x(i),up=c.c>=c.o;ctx.strokeStyle=up?'#4cddb1':'#fa8192';ctx.fillStyle=ctx.strokeStyle;ctx.beginPath();ctx.moveTo(xx,y(c.h));ctx.lineTo(xx,y(c.l));ctx.stroke();const yy=y(Math.max(c.o,c.c)),body=Math.max(1.2,Math.abs(y(c.o)-y(c.c)));ctx.fillRect(xx-bodyWidth/2,yy,bodyWidth,body)});
 ctx.fillStyle='#90a8bf';ctx.textAlign='left';ctx.fillText(dateMsText(chartData[0].t).slice(0,21),pad.l,h-5);
 ctx.textAlign='right';ctx.fillText(dateMsText(chartData[chartData.length-1].t+duration).slice(0,21),w-pad.r,h-5);
 const last=chartData[chartData.length-1];
 el('chartnote').textContent=frame+' · '+chartData.length+' '+t('closed')+' · '+t('lastClose')+' '+price(last.c)+' · '+dateMsText(last.t+duration)+' · '+t('sourceArchive');
 el('chartHover').textContent=t('chartTip');
}
function chartHover(event){
 if(!chartGeometry||!chartData.length)return;
 const rect=el('chart').getBoundingClientRect(),pos=event.clientX-rect.left;
 const i=Math.max(0,Math.min(chartData.length-1,Math.floor((pos-chartGeometry.pad.l)/chartGeometry.step)));
 const c=chartData[i];el('chartHover').textContent=dateMsText(c.t)+' · O '+price(c.o)+' H '+price(c.h)+' L '+price(c.l)+' C '+price(c.c)+' · V '+number(c.v,0);
}
function renderPortfolio(){
 const q=numeric(el('holdingQty').value),entry=numeric(el('holdingCost').value);
 if(q===null||entry===null||q<=0||entry<=0){el('portfolioResults').textContent=t('enterPortfolio');el('portfolioPriceStatus').textContent='—';return}
 const quote=snapshot?.live_quote||{},age=secondsSince(quote.retrieved_at_utc);
 const fresh=quote.status==='fresh'&&age!==null&&age<=180&&numeric(quote.price)>0;
 const marketPrice=fresh?numeric(quote.price):numeric(snapshot?.market?.price);
 const cost=q*entry,valuation=marketPrice===null?null:q*marketPrice,pnl=valuation===null?null:valuation-cost;
 el('portfolioPriceStatus').textContent=fresh?t('indicative'):t('archiveValuation');
 el('portfolioResults').innerHTML=row(t('invested'),money(cost))+row(t('currentValue'),money(valuation))+row(t('profitLoss'),money(pnl)+(pnl===null?'':' ('+pct(pnl/cost*100)+')'))+row(t('breakEven'),price(entry));
}
function render(data){
 snapshot=data;const a=data.market||{},b=a.book||{},tr=a.trades||{},s=data.scorecard||{},l=data.learning||{},h=data.health||{},q=data.live_quote||{};
 const observedAge=secondsSince(data.observed_utc),researchFresh=observedAge!==null&&observedAge<=900;
 const quoteAge=secondsSince(q.retrieved_at_utc),quoteFresh=q.status==='fresh'&&quoteAge!==null&&quoteAge<=180&&numeric(q.price)>0;
 const displayedPrice=quoteFresh?q.price:a.price,displayedBid=quoteFresh?q.bid:a.bid,displayedAsk=quoteFresh?q.ask:a.ask;
 const displayedVolume=quoteFresh?q.volume_24h_usdt:a.volume;
 const displayedChange=quoteFresh?q.change_24h_pct:(numeric(a.change)!==null?a.change*100:null);
 const spread=(numeric(displayedBid)>0&&numeric(displayedAsk)>0&&displayedAsk>=displayedBid)?(displayedAsk-displayedBid)/((displayedAsk+displayedBid)/2)*100:null;
 el('status').textContent=quoteFresh?t('fresh'):numeric(a.price)!==null?t('archive'):t('unavailable');
 el('status').className='pill '+(quoteFresh?'fresh':'stale');
 el('priceLabel').textContent=quoteFresh?t('livePrice'):t('archivedPrice');
 el('price').textContent=price(displayedPrice);
 el('liveprice').textContent=price(a.price);
 el('liveprice').className=researchFresh?'fresh':'unavailable';
 el('livetime').textContent=t('analysisTime')+': '+stampText(data.observed_utc)+' · '+ageText(observedAge);
 el('change').textContent=pct(displayedChange);el('change').className='delta '+(numeric(displayedChange)!==null?(displayedChange>=0?'positive':'negative'):'');
 el('observed').textContent=(quoteFresh?t('quoteTime'):t('analysisTime'))+': '+stampText(quoteFresh?q.retrieved_at_utc:data.observed_utc)+' · '+ageText(quoteFresh?quoteAge:observedAge);
 el('source').textContent=quoteFresh?t('sourceLive'):t('sourceArchive');
 el('sourceLine').textContent=t('quoteTime')+': '+(quoteFresh?stampText(q.retrieved_at_utc):t('unavailable'))+' · '+t('analysisTime')+': '+stampText(data.observed_utc)+' · '+t('healthTime')+': '+stampText(h.at);
 const errors=Object.keys(data.errors||{});const warnings=[];
 if(!quoteFresh)warnings.push(t('unavailable')+' — '+t('archive'));
 if(!researchFresh)warnings.push(t('stale')+' · '+ageText(observedAge));
 if(errors.length)warnings.push(t('missing')+': '+errors.join(', '));
 el('warning').hidden=warnings.length===0;el('warning').textContent=warnings.join(' · ');
 el('bid').textContent=price(displayedBid);el('ask').textContent=price(displayedAsk);
 el('spread').textContent=numeric(spread)===null?'—':number(spread,3)+'%';el('volume').textContent=money(displayedVolume);
 el('pipeline').textContent=h.passed===true?t('statusOk'):t('statusBad');el('pipeline').className=h.passed===true?'good':'bad';
 el('model').textContent=l.champion||t('championNone');
 const horizons=[['1h','1H'],['4h','4H'],['24h','24H'],['7d','7D']];
 el('forecasts').innerHTML=horizons.map(([key,label])=>{
  const v=data.forecasts?.[key],object=v&&typeof v==='object'?v:null;
  const msg=object?(object.message||object.reason||object.status||JSON.stringify(object)):v;
  const abstain=!v||typeof v==='string'&&(/لا توجد بيانات|غير كاف|insufficient|no forecast|unavailable/i.test(v));
  return '<article class="forecast-card"><h3>'+label+'</h3><span class="forecast-tag '+(abstain?'no':'')+'">'+safe(abstain?t('insufficient'):t('unverified'))+'</span><p>'+safe(msg||t('insufficient'))+'</p></article>';
 }).join('');
 el('forecastUpdated').textContent=t('forecastTime')+': '+stampText(data.observed_utc);
 el('technical').innerHTML=['15m','1h','4h','1d'].map(tf=>{const z=data.technical?.[tf]||{};return '<div class="tech-frame">'+tf.toUpperCase()+' · '+safe(z.status||t('indicatorsMissing'))+' · '+safe(String(z.candles??'—'))+' '+t('candles')+'</div>'+row('RSI 14',number(z.rsi14_simple??z.rsi14,1))+row('ADX 14',number(z.adx14,1))+row('EMA 9',price(z.ema9))+row('EMA 21',price(z.ema21))+row('MACD histogram',number(z.macd_histogram,9))+row('ATR %',numeric(z.atr_pct)===null?'—':number(z.atr_pct,2)+'%')}).join('');
 el('orderbook').innerHTML=row(t('analysisTime'),stampText(data.observed_utc))+row(t('bidDepth')+' ±0.5%',money(b.depth_50bps?.bid_notional_usdt))+row(t('askDepth')+' ±0.5%',money(b.depth_50bps?.ask_notional_usdt))+row(t('bidDepth')+' ±2%',money(b.depth_200bps?.bid_notional_usdt))+row(t('askDepth')+' ±2%',money(b.depth_200bps?.ask_notional_usdt))+row(t('buyFlow'),money(tr.aggressive_buy_notional_usdt))+row(t('sellFlow'),money(tr.aggressive_sell_notional_usdt))+row(t('netFlow'),money(tr.net_aggressive_notional_usdt))+'<p class="hint">'+t('bookCaution')+'</p>';
 el('dex').innerHTML=(data.dex||[]).slice(0,8).map(d=>row((d.dex||'DEX')+' / '+(d.quote||'?'),money(d.liquidity)+' · 24h '+money(d.volume))).join('')+'<p class="hint">'+t('dexCaution')+'</p>';
 const models=Object.entries(l.challengers||{}),audited=Object.entries(s.models||{});
 el('learning').innerHTML=row(t('model'),l.champion||t('championNone'))+row(t('samples'),l.samples??'—')+row(t('validation'),l.validation_samples??'—')+row(t('baseline'),number(l.baseline_mae,6))+row(t('evaluated'),s.evaluated_total??'—')+row(t('pending'),s.pending_total??'—')+row(t('missingOutcome'),s.missing_total??'—')+models.map(([name,m])=>row(name,'MAE '+number(m.mae,6)+' · skill '+pct(numeric(m.skill_vs_zero)===null?null:m.skill_vs_zero*100))).join('')+audited.map(([name,m])=>row(name,'n='+number(m.evaluated,0)+' · accuracy '+pct(numeric(m.direction_accuracy)===null?null:m.direction_accuracy*100)+' · '+(m.promotion_eligible?t('validated'):t('unverified')))).join('')+'<p class="hint">'+t('modelCaution')+'</p>';
 el('run').textContent=(h.event||'—')+' · '+(h.run||'—')+' · '+stampText(h.at);
 el('health').innerHTML=Object.entries(h.steps||{}).map(([k,v])=>row(k,v)).join('')+row(t('analysisTime'),stampText(data.observed_utc))+row(t('healthTime'),stampText(h.at))+row(t('pipeline'),h.passed===true?t('statusOk'):t('statusBad'));
 el('clock').textContent=stampText(new Date().toISOString());
 renderPortfolio();renderChart();
}
async function refresh(){
 el('refresh').disabled=true;
 try{
  const embedded=el('stamp-snapshot');
  if(embedded){render(JSON.parse(embedded.textContent))}
  else{
   const res=await fetch('/api/dashboard',{cache:'no-store',credentials:'same-origin'});
   if(!res.ok)throw new Error('HTTP '+res.status);
   const data=await res.json();if(!data||typeof data!=='object'||!data.market)throw new Error('Invalid dashboard response');
   render(data);
  }
 }catch(e){
  el('warning').hidden=false;el('warning').textContent=t('sourceError')+' ('+String(e.message).slice(0,100)+')';
  el('status').textContent=t('networkError');el('status').className='pill stale';
 }finally{el('refresh').disabled=false}
}
function exportCsv(){
 const duration={'15m':900000,'1h':3600000,'4h':14400000,'1d':86400000}[frame];
 const rows=(snapshot?.candles?.[frame]||[]).filter(c=>numeric(c.t)!==null&&c.t+duration<=Date.now());
 if(!rows.length){el('chartHover').textContent=t('csvEmpty');return}
 const csv=['open_utc,open,high,low,close,volume'].concat(rows.map(c=>[new Date(c.t).toISOString(),c.o,c.h,c.l,c.c,c.v??''].join(','))).join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download='STAMP_MEXC_'+frame+'_closed.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
document.querySelectorAll('[data-frame]').forEach(button=>button.addEventListener('click',()=>{frame=button.dataset.frame;document.querySelectorAll('[data-frame]').forEach(b=>b.classList.toggle('selected',b===button));renderChart()}));
el('refresh').addEventListener('click',refresh);el('exportCandles').addEventListener('click',exportCsv);
try{const p=JSON.parse(localStorage.getItem('stamp_position')||'{}');if(numeric(p.quantity)>0&&numeric(p.entry)>0){el('holdingQty').value=String(p.quantity);el('holdingCost').value=String(p.entry)}}catch(_){}
['holdingQty','holdingCost'].forEach(id=>el(id).addEventListener('input',()=>{
 const quantity=numeric(el('holdingQty').value),entry=numeric(el('holdingCost').value);
 try{if(quantity>0&&entry>0)localStorage.setItem('stamp_position',JSON.stringify({quantity,entry}));else localStorage.removeItem('stamp_position')}catch(_){}
 renderPortfolio();
}));
el('portfolioClear').addEventListener('click',()=>{el('holdingQty').value='';el('holdingCost').value='';try{localStorage.removeItem('stamp_position')}catch(_){}renderPortfolio()});
el('chart').addEventListener('pointermove',chartHover);
el('settingsButton').addEventListener('click',()=>el('settings').showModal());
el('langSelect').addEventListener('change',event=>{lang=event.target.value==='en'?'en':'ar';try{localStorage.setItem('stamp_language',lang)}catch(_){}translate();if(snapshot)render(snapshot)});
el('zoneSelect').addEventListener('change',event=>{zone=event.target.value==='UTC'?'UTC':'Asia/Baghdad';try{localStorage.setItem('stamp_timezone',zone)}catch(_){}translate();if(snapshot)render(snapshot)});
window.addEventListener('resize',()=>{if(snapshot)renderChart()});
translate();refresh();setInterval(refresh,90000);setInterval(()=>{if(snapshot)render(snapshot)},30000);
