"use strict";
(() => {
 const get = id => document.getElementById(id);
 const priceCanvas = get("lensPrice"), flowCanvas = get("lensFlow"), motion = get("lensMotion");
 if (!priceCanvas || !flowCanvas || !motion) return;
 const reduced = matchMedia("(prefers-reduced-motion: reduce)");
 let moving = !reduced.matches, inView = true, raf = 0, last = 0, angle = 0;
 let bars = [], trade = null, labels = (ar) => ar;
 const fmt = new Intl.NumberFormat("en-US", {maximumFractionDigits: 2});
 const money = value => fmt.format(value) + " USDT";
 const valid = value => typeof value === "number" && Number.isFinite(value);
 function set(id, value) {
  const node = get(id);
  if (node.textContent !== value) node.textContent = value;
 }
 function project(canvas, draw) {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  const ratio = Math.min(devicePixelRatio || 1, 3);
  const width = Math.round(w * ratio), height = Math.round(h * ratio);
  if (canvas.width !== width || canvas.height !== height) {
   canvas.width = width;
   canvas.height = height;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const unit = Math.min(w / 13, h / 5.7);
  const skew = .58 + .18 * Math.sin(angle);
  const point = (x, y, z) => [w / 2 + (x + z * skew) * unit, h * .79 - (y + z * .38) * unit];
  function poly(vertices, color, fill = true) {
   ctx.beginPath();
   for (const [index, vertex] of vertices.entries()) {
    const [x,y] = point(...vertex);
    if (index) ctx.lineTo(x,y);
    else ctx.moveTo(x,y);
   }
   if (fill) {
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
   } else {
    ctx.strokeStyle = color;
    ctx.stroke();
   }
  }
  for (let x = -5; x <= 5; x++) poly([[x,0,-1],[x,0,1.3]], "#273b52", false);
  for (const z of [-1,-.4,.2,.8,1.3]) poly([[-5,0,z],[5,0,z]], "#273b52", false);
  function block(x, lo, hi, wide, depth, up) {
   const a = x - wide/2, b = x + wide/2, z = -depth/2, back = depth/2;
   poly([[a,lo,z],[b,lo,z],[b,hi,z],[a,hi,z]], up ? "#219b87" : "#c95371");
   poly([[b,lo,z],[b,lo,back],[b,hi,back],[b,hi,z]], up ? "#136259" : "#842f50");
   poly([[a,hi,z],[b,hi,z],[b,hi,back],[a,hi,back]], up ? "#7cf8d5" : "#ffc0cd");
  }
  draw(poly, block);
 }
 function draw() {
  project(priceCanvas, (poly, block) => {
   if (!bars.length) return;
   const bottom = Math.min(...bars.map(bar => bar.l));
   const range = Math.max(...bars.map(bar => bar.h)) - bottom;
   const y = p => range ? .25 + 3.45 * (p - bottom) / range : 1.8;
   const step = 9.5 / bars.length;
   bars.forEach((bar, index) => {
    const x = -4.75 + (index + .5) * step, up = bar.c >= bar.o;
    poly([[x,y(bar.l),0],[x,y(bar.h),0]], up ? "#85f4db" : "#ff9bad", false);
    const lo = y(Math.min(bar.o,bar.c)), hi = y(Math.max(bar.o,bar.c));
    block(x, lo, Math.max(hi,lo+.045), step*.62, .37, up);
   });
  });
  project(flowCanvas, (poly, block) => {
   if (!trade) return;
   const total = trade.buy + trade.sell;
   if (!total) return;
   if (trade.buy) block(-1.8,0,3.9 * trade.buy/total,2.25,1.6,true);
   if (trade.sell) block(1.8,0,3.9 * trade.sell/total,2.25,1.6,false);
  });
 }
 function animate(time) {
  raf = 0;
  if (time - last >= 32) {
   last = time;
   angle = time / 1800;
   draw();
  }
  schedule();
 }
 function schedule() {
  if (!raf && moving && inView && !document.hidden) raf = requestAnimationFrame(animate);
 }
 function setMotion() {
  motion.setAttribute("aria-pressed", String(moving));
  set("lensMotion", moving ? labels("إيقاف الحركة","Pause motion") : labels("تشغيل الحركة","Play motion"));
  if (!moving && raf) { cancelAnimationFrame(raf); raf = 0; }
  schedule();
 }
 motion.addEventListener("click", () => { moving = !moving; setMotion(); });
 reduced.addEventListener?.("change", event => { moving = !event.matches; setMotion(); });
 document.addEventListener("visibilitychange", schedule);
 if (typeof IntersectionObserver === "function") {
  new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; schedule(); }).observe(get("lensTitle").closest("section"));
 }
 if (typeof ResizeObserver === "function") {
  const observer = new ResizeObserver(draw);
  observer.observe(priceCanvas);
  observer.observe(flowCanvas);
 }
 const percent = value => (value > 0 ? "+" : "") + value.toFixed(2) + "%";
 function update({market,quote,fresh,observed,liquidity,bars: candles,frame,interval,replay,stamp,copy}) {
  labels = copy;
  bars = candles.slice(-24);
  const current = quote?.price ?? market?.price;
  const time = quote?.provider_at_utc || quote?.retrieved_at_utc || observed;
  const change = quote?.stats_at_utc && valid(quote.change_24h_pct) ? quote.change_24h_pct :
   valid(market?.change) ? market.change * 100 : null;
  const details = [];
  if (replay) details.push(copy("إعادة عرض تاريخية للشموع المغلقة.","Historical replay of closed candles."));
  else if (valid(current)) {
   details.push(copy(fresh ? "السعر المباشر من MEXC" : "آخر سعر متاح من MEXC", fresh ? "Live MEXC quote" : "Last available MEXC quote") +
    " · " + current.toString() + " USDT" + (time ? " · " + stamp(time,true) : ""));
   if (change !== null) details.push(copy("تغير 24 ساعة","24h change") + " " + percent(change));
  } else details.push(copy("بانتظار بيانات السعر.","Waiting for price data."));
  set("lensSummary", details.join(" · "));
  const first = bars[0], lastBar = bars.at(-1);
  set("lensPriceDetail", first && lastBar ?
   bars.length + " × " + frame + " · " + copy("من افتتاح الأولى إلى إغلاق الأخيرة","First open to last close") +
    " " + percent((lastBar.c / first.o - 1) * 100) + " · " + stamp(first.t) + " → " + stamp(lastBar.t + interval) :
   copy("الشموع المغلقة غير متاحة","Closed candles unavailable"));
  const t = replay ? null : market?.trades;
  const buy = t?.aggressive_buy_notional_usdt, sell = t?.aggressive_sell_notional_usdt;
  const start = t?.first_trade_ms, end = t?.last_trade_ms;
  trade = valid(buy) && buy >= 0 && valid(sell) && sell >= 0 && valid(start) && valid(end) ? {buy,sell} : null;
  set("lensBuy", trade ? money(buy) : "—");
  set("lensSell", trade ? money(sell) : "—");
  const count = (t?.aggressive_buy_count || 0) + (t?.aggressive_sell_count || 0);
  const net = buy - sell;
  set("lensFlowDetail", trade ? "MEXC · " + count + " " + copy("صفقة مصنّفة","classified trades") +
   " · " + stamp(start,true) + " → " + stamp(end,true) + " · " +
   copy("فرق قيمة الشراء والبيع في العينة","Buy minus sell in this sample") + " " + money(net) :
   copy(replay ? "العينة مرتبطة بالرصد الحالي" : "عينة الصفقات غير متاحة لهذا الزوج", replay ? "Trade sample belongs to the current observation" : "Trade sample unavailable for this pair"));
  set("lensLiquidity", !replay && valid(liquidity?.liquidity_usd) && liquidity.observed_utc ?
   copy("السيولة المرصودة في مجمّعات DEX","Observed liquidity in DEX pools") + " · $" +
    fmt.format(liquidity.liquidity_usd) + " · " + stamp(liquidity.observed_utc,true) : "");
  setMotion();
  if (!moving) draw();
 }
 window.StampLens = {update};
 setMotion();
})();
