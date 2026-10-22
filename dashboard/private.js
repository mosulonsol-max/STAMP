'use strict';
let snapshot=null,frame='1h';
const el=id=>document.getElementById(id);
const number=(v,d=2)=>v===null||v===undefined||!Number.isFinite(Number(v))?'—':Number(v).toLocaleString('en-US',{maximumFractionDigits:d,minimumFractionDigits:d});
const price=v=>v===null||v===undefined||!Number.isFinite(Number(v))?'—':'$'+Number(v).toFixed(7);
const money=v=>v===null||v===undefined||!Number.isFinite(Number(v))?'—':'$'+number(v,2);
const escapeHtml=s=>String(s).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const row=(label,value)=>'<div class="row"><span>'+escapeHtml(label)+'</span><strong>'+escapeHtml(String(value))+'</strong></div>';
const ageText=s=>s===null||s===undefined?'unknown':s<60?s+'s ago':s<3600?Math.round(s/60)+'m ago':(s/3600).toFixed(1)+'h ago';
function renderChart(){
 const canvas=el('chart'),ctx=canvas.getContext('2d'),rect=canvas.getBoundingClientRect(),ratio=window.devicePixelRatio||1;
 canvas.width=Math.max(100,Math.round(rect.width*ratio));canvas.height=Math.max(100,Math.round(rect.height*ratio));ctx.setTransform(ratio,0,0,ratio,0,0);
 const w=rect.width,h=rect.height,pad={l:10,r:74,t:12,b:25};ctx.clearRect(0,0,w,h);
 const candles=(snapshot?.candles?.[frame]||[]).filter(c=>Number.isFinite(c.c)&&Number.isFinite(c.t));
 const duration={'15m':900000,'1h':3600000,'4h':14400000,'1d':86400000}[frame];
 const closed=candles.filter(c=>c.t+duration<=Date.now());
 if(closed.length<2){el('chartnote').textContent='Insufficient confirmed candles for this timeframe';return;}
 const data=closed.slice(-Math.min(150,closed.length));let low=Math.min(...data.map(x=>x.l)),high=Math.max(...data.map(x=>x.h));let span=high-low||high*.01||1;low-=span*.06;high+=span*.06;
 const x=i=>pad.l+i*(w-pad.l-pad.r)/Math.max(1,data.length-1),y=v=>pad.t+(high-v)/(high-low)*(h-pad.t-pad.b);
 ctx.font='11px system-ui';ctx.textAlign='left';ctx.lineWidth=1;
 for(let i=0;i<5;i++){const v=low+(high-low)*i/4,yy=y(v);ctx.strokeStyle='#23384c';ctx.beginPath();ctx.moveTo(pad.l,yy);ctx.lineTo(w-pad.r+5,yy);ctx.stroke();ctx.fillStyle='#90a8bf';ctx.fillText(v.toFixed(7),w-pad.r+9,yy+4)}
 const width=Math.max(1,Math.min(7,(w-pad.l-pad.r)/data.length*.55));
 data.forEach((c,i)=>{const xx=x(i),up=c.c>=c.o;ctx.strokeStyle=up?'#4cddb1':'#fa8192';ctx.fillStyle=ctx.strokeStyle;ctx.beginPath();ctx.moveTo(xx,y(c.h));ctx.lineTo(xx,y(c.l));ctx.stroke();const yy=y(Math.max(c.o,c.c)),body=Math.max(1.3,Math.abs(y(c.o)-y(c.c)));ctx.fillRect(xx-width/2,yy,width,body)});
 const last=data[data.length-1];ctx.fillStyle='#90a8bf';ctx.fillText(new Date(data[0].t).toLocaleDateString(),pad.l,h-4);ctx.textAlign='right';ctx.fillText(new Date(last.t).toLocaleString(),w-pad.r,h-4);
 el('chartnote').textContent=frame+' · '+data.length+' confirmed candles shown · Last close '+price(last.c)+' · '+new Date(last.t+duration).toLocaleString()+' · Archived MEXC candles';
}
function render(data){
 snapshot=data;const a=data.market||{},b=a.book||{},t=a.trades||{},s=data.scorecard||{},l=data.learning||{},h=data.health||{};
 const observedAge=data.observed_utc?Math.max(0,Math.floor((Date.now()-Date.parse(data.observed_utc))/1000)):null;
 const stale=observedAge===null||observedAge>900;el('status').textContent=stale?'STALE DATA':'FRESH DATA';el('status').className='pill '+(stale?'stale':'fresh');
 el('warning').hidden=!stale&&!Object.keys(data.errors||{}).length;
 el('warning').textContent=(stale?'Market snapshot is '+ageText(observedAge)+' old. Do not treat prices as live. ':'')+(Object.keys(data.errors||{}).length?'Data unavailable: '+Object.keys(data.errors).join(', '):'');
 el('price').textContent=price(a.price);el('change').textContent=a.change===null?'—':(a.change>=0?'+':'')+number(a.change*100,2)+'%';
 el('change').className='delta '+(a.change>=0?'positive':'negative');el('observed').textContent='Observed: '+(data.observed_utc?new Date(data.observed_utc).toLocaleString():'unknown')+' ('+ageText(observedAge)+')';
 el('source').textContent=data.source==='private_github_api'?'Private GitHub · automatic polling':data.source==='offline_snapshot'?'Private offline snapshot · download newest from GitHub':'Deploy snapshot · updates require redeploy';
 el('bid').textContent=price(a.bid);el('ask').textContent=price(a.ask);el('spread').textContent=b.spread_bps===undefined?'—':number(b.spread_bps/100,3)+'%';
 el('volume').textContent=money(a.volume);el('pipeline').textContent=h.passed===true?'PASS':h.passed===false?'FAILED':'UNKNOWN';
 el('pipeline').className=h.passed===true?'good':'bad';el('model').textContent=l.champion||'NO CHAMPION';
 el('orderbook').innerHTML=row('Bid depth ±0.5%',money(b.depth_50bps?.bid_notional_usdt))+row('Ask depth ±0.5%',money(b.depth_50bps?.ask_notional_usdt))+row('Bid depth ±2%',money(b.depth_200bps?.bid_notional_usdt))+row('Ask depth ±2%',money(b.depth_200bps?.ask_notional_usdt))+row('Aggressive buys (sample)',money(t.aggressive_buy_notional_usdt))+row('Aggressive sells (sample)',money(t.aggressive_sell_notional_usdt))+row('Net aggressive flow (sample)',money(t.net_aggressive_notional_usdt))+'<p class="hint">Visible depth is cancelable. Recent trades are a limited API sample.</p>';
 el('technical').innerHTML=['15m','1h','4h','1d'].map(tf=>{const z=data.technical?.[tf]||{};return '<div class="tech-frame">'+tf.toUpperCase()+' · '+escapeHtml(z.status||'—')+'</div>'+row('RSI 14',number(z.rsi14_simple??z.rsi14,1))+row('ADX 14',number(z.adx14,1))+row('EMA 9',price(z.ema9))+row('EMA 21',price(z.ema21))+row('MACD histogram',z.macd_histogram===undefined?'—':number(z.macd_histogram,9))}).join('');
 el('dex').innerHTML=(data.dex||[]).slice(0,6).map(d=>row((d.dex||'DEX')+' / '+(d.quote||'?'),money(d.liquidity)+' liquidity · '+money(d.volume)+' 24h')).join('')+'<p class="hint">DEX liquidity is a third-party pool valuation, not evidence of net deposits.</p>';
 const models=Object.entries(l.challengers||{});el('learning').innerHTML=row('Champion',l.champion||'None — models rejected')+row('Research samples',l.samples??'—')+row('Validation samples',l.validation_samples??'—')+row('Forecasts',s.forecasts_total??'—')+row('Evaluated',s.evaluated_total??'—')+row('Pending',s.pending_total??'—')+row('Missing timely outcomes',s.missing_total??'—')+models.map(([name,m])=>row(name,'MAE '+number(m.mae,6)+' · Skill '+number((m.skill_vs_zero||0)*100,1)+'%')).join('')+'<p class="hint">No qualified champion means the system abstains from validated trading predictions.</p>';
 el('run').textContent=(h.event||'unknown')+' · '+(h.run||'—')+' · '+ageText(h.at?Math.max(0,(Date.now()-Date.parse(h.at))/1000):null);el('health').innerHTML=Object.entries(h.steps||{}).map(([k,v])=>row(k,v)).join('')+row('Market data',stale?'STALE':'FRESH')+row('Pipeline',h.passed===true?'PASS':'NOT VERIFIED');
 el('clock').textContent=new Date().toLocaleTimeString();renderChart();
}
async function refresh(){el('refresh').disabled=true;try{const embedded=document.getElementById('stamp-snapshot');if(embedded){render(JSON.parse(embedded.textContent))}else{const res=await fetch('/api/dashboard',{cache:'no-store',credentials:'same-origin'});if(!res.ok)throw new Error('HTTP '+res.status);render(await res.json())}}catch(e){el('warning').hidden=false;el('warning').textContent='Dashboard refresh failed: '+e.message+'. Last displayed values may be stale.';el('status').textContent='CONNECTION ERROR';el('status').className='pill stale'}finally{el('refresh').disabled=false}}
document.querySelectorAll('[data-frame]').forEach(b=>b.addEventListener('click',()=>{frame=b.dataset.frame;document.querySelectorAll('[data-frame]').forEach(z=>z.classList.toggle('selected',z===b));renderChart()}));el('refresh').addEventListener('click',refresh);window.addEventListener('resize',()=>{if(snapshot)renderChart()});refresh();setInterval(refresh,90000);setInterval(()=>{if(snapshot)render(snapshot)},30000);
