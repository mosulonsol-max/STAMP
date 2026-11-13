"use strict";
(() => {
  const el = id => document.getElementById("marketMap" + id);
  const panel = el("");
  if (!panel) return;
  const board = el("Board");
  const dialog = el("Detail");
  const copy = (ar, en) => document.documentElement.lang === "en" ? en : ar;
  const pairLabel = pair => pair.replace(/USDT$/, " / USDT");
  const missing = () => copy("غير متاح", "Unavailable");
  const num = value => Number.isFinite(value);
  const format = (value, decimals = 2) => num(value)
    ? new Intl.NumberFormat("en-US", {maximumFractionDigits: decimals}).format(value) : missing();
  const money = value => num(value)
    ? new Intl.NumberFormat("en-US", {style:"currency", currency:"USD", notation:"compact", maximumFractionDigits:2}).format(value) : missing();
  const time = value => {
    if (!value || !Number.isFinite(new Date(value).getTime())) return missing();
    const zone = document.getElementById("zoneSelect")?.value || "Asia/Baghdad";
    return new Intl.DateTimeFormat("en-GB", {dateStyle:"short", timeStyle:"medium", timeZone:zone}).format(new Date(value));
  };
  const sectors = {
    bitcoin:["بيتكوين","Bitcoin"], layer1:["شبكات البلوكشين","Blockchains"], payments:["المدفوعات","Payments"],
    defi:["التمويل اللامركزي","DeFi"], meme:["عملات الميم","Meme coins"], privacy:["الخصوصية","Privacy"],
    infrastructure:["البنية التحتية","Infrastructure"], ai:["الذكاء الاصطناعي","AI"],
    rwa:["الأصول المرمّزة","Tokenized assets"], stablecoin:["العملات المستقرة","Stablecoins"], other:["غير مصنّف","Unclassified"]
  };
  const pageSize = 12;
  const favoritesKey = "stamp_market_map_favorites";
  let favorites = new Set();
  try {
    const saved = JSON.parse(localStorage.getItem(favoritesKey) || "[]");
    if (Array.isArray(saved)) favorites = new Set(saved.filter(pair => typeof pair === "string"));
  } catch {}
  let catalog = null, cards = new Map(), page = 0, selected = null, yaw = 0;
  let request = null, lastCatalog = 0, searchTimer, drag, suppressClick = false;
  let error = false, loading = false, changed = new Set();
  function node(tag, value, className) {
    const element = document.createElement(tag);
    if (value != null) element.textContent = value;
    if (className) element.className = className;
    return element;
  }
  function sparkline(prices) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "market-map-plot");
    svg.setAttribute("viewBox", "0 0 160 40");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("aria-hidden", "true");
    if (!Array.isArray(prices) || prices.length < 2 || !prices.every(num)) return svg;
    const low = Math.min(...prices), range = Math.max(...prices) - low;
    const line = document.createElementNS(svg.namespaceURI, "polyline");
    line.setAttribute("points", prices.map((price, index) =>
      (index * 160 / (prices.length - 1)) + "," + (range ? 37 - (price - low) / range * 34 : 20)).join(" "));
    line.setAttribute("fill", "none");
    line.setAttribute("stroke", "currentColor");
    line.setAttribute("stroke-width", "1.5");
    line.setAttribute("vector-effect", "non-scaling-stroke");
    svg.append(line);
    return svg;
  }
  const meta = pair => catalog?.assets?.[pair] || {};
  const metric = (pair, field) => meta(pair)[field] ?? -Infinity;
  function filtered() {
    const query = el("Search").value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    let pairs = (catalog?.pairs || []).filter(pair => pair.includes(query) && (!el("Favorites").checked || favorites.has(pair)));
    const sort = el("Sort").value;
    const field = sort === "volume" ? "volume_24h_usd" : "market_cap_usd";
    pairs.sort((a,b) => Number(b === query) - Number(a === query) ||
      metric(b,field) - metric(a,field) || Number(Boolean(meta(b).sector)) - Number(Boolean(meta(a).sector)) || a.localeCompare(b));
    return pairs;
  }
  function pagePairs() {
    const pairs = filtered();
    const pages = Math.max(1, Math.ceil(pairs.length / pageSize));
    page = Math.min(page, pages - 1);
    el("Prev").disabled = page === 0;
    el("Next").disabled = page + 1 >= pages;
    el("Page").textContent = (page + 1) + " / " + pages + " · " + pairs.length;
    return pairs.slice(page * pageSize, (page + 1) * pageSize);
  }
  function tile(pair, large) {
    const row = cards.get(pair) || {};
    const info = meta(pair);
    const button = node("button", null, "market-map-card");
    button.type = "button";
    button.dataset.pair = pair;
    if (num(row.change) && row.change !== 0) button.dataset.up = String(row.change > 0);
    if (changed.has(pair)) button.dataset.new = "true";
    if (large) button.dataset.size = "large";
    button.style.setProperty("--tile-depth", (num(row.change) ? Math.min(30, Math.abs(row.change) * 3) : 0) + "px");
    const heading = node("span", null, "market-map-line");
    heading.dir = "ltr";
    heading.append(node("strong", pairLabel(pair)), node("bdi", num(row.change) ? (row.change > 0 ? "+" : "") + format(row.change) + "%" : "—"));
    const price = node("div", num(row.price) ? format(row.price, 12) + " USDT" : missing(), "market-map-price");
    price.dir = "ltr";
    const bounds = node("small", copy("أعلى ", "High ") + format(row.high, 12) + " · " + copy("أدنى ", "Low ") + format(row.low, 12));
    const cap = node("small", copy("القيمة السوقية ", "Market cap ") + money(info.market_cap_usd));
    const source = node("small", row.venue ? row.venue + " · " + time(row.price_at_ms) : copy("شموع الفترة غير متاحة", "Window candles unavailable"));
    button.append(heading, price, bounds, sparkline(row.prices), cap, source);
    return button;
  }
  function detail() {
    if (!selected) return;
    const row = cards.get(selected) || {}, info = meta(selected);
    el("DetailTitle").textContent = pairLabel(selected);
    const data = node("dl");
    const values = [
      [copy("آخر إغلاق", "Last close"), num(row.price) ? format(row.price,12) + " USDT" : missing()],
      [copy("المنصة ووقت إغلاق الشمعة", "Venue and candle close"), row.venue ? row.venue + " · " + time(row.price_at_ms) : missing()],
      [copy("القيمة السوقية", "Market cap"), (num(info.market_cap_usd) ? "$" + format(info.market_cap_usd) : missing())],
      [copy("المعروض المتداول", "Circulating supply"), format(info.circulating_supply)],
      [copy("حجم التداول خلال ٢٤ ساعة", "24h trading volume"), money(info.volume_24h_usd)],
      [copy("مصدر التقييم ووقته", "Valuation source and time"), info.valuation_source ? info.valuation_source + " · " + time(info.valuation_at) : missing()]
    ];
    for (const [label, value] of values) data.append(node("dt",label), node("dd",value));
    el("DetailBody").replaceChildren(data, sparkline(row.prices));
    el("Star").textContent = favorites.has(selected) ? copy("إزالة من المفضلة", "Remove favorite") : copy("إضافة للمفضلة", "Add favorite");
  }
  function render() {
    const pairs = pagePairs(), sort = el("Sort").value;
    if (sort === "gain" || sort === "loss") {
      const direction = sort === "gain" ? -1 : 1;
      pairs.sort((a,b) => {
        const x = cards.get(a)?.change, y = cards.get(b)?.change;
        return num(x) && num(y) ? direction * (x - y) : Number(num(y)) - Number(num(x));
      });
    }
    const view = el("View").value;
    board.dataset.view = view;
    el("SizeControl").hidden = view !== "sectors";
    const focusPair = document.activeElement?.closest(".market-map-card")?.dataset.pair;
    const content = [];
    if (view === "sectors") {
      const groups = new Map();
      for (const pair of pairs) {
        const sector = meta(pair).sector || "other";
        if (!groups.has(sector)) groups.set(sector, []);
        groups.get(sector).push(pair);
      }
      const field = el("Size").value === "volume" ? "volume_24h_usd" : "market_cap_usd";
      for (const [sector, members] of groups) {
        const group = node("section", null, "market-map-sector");
        const tiles = node("div", null, "market-map-sector-tiles");
        const max = Math.max(...members.map(pair => metric(pair,field)));
        tiles.append(...members.map(pair => tile(pair, max > 0 && metric(pair,field) >= max / 2)));
        group.append(node("h3", copy(...sectors[sector])), tiles);
        content.push(group);
      }
    } else content.push(...pairs.map(pair => tile(pair, false)));
    board.replaceChildren(...content);
    if (focusPair) [...board.querySelectorAll("button")].find(button => button.dataset.pair === focusPair)?.focus({preventScroll:true});
    const timestamp = Math.max(0, ...pairs.map(pair => cards.get(pair)?.price_at_ms || 0));
    const status = error ? copy("تعذّر تحديث بيانات السوق", "Market data refresh failed") :
      loading && !timestamp ? copy("جارٍ جلب بيانات السوق…", "Loading market data…") :
      !pairs.length ? copy("لا توجد أزواج مطابقة", "No matching pairs") :
      timestamp ? copy("آخر إغلاق مرصود ", "Latest observed close ") + time(timestamp) :
      copy("شموع الفترة غير متاحة لهذه الأزواج", "Window candles unavailable for these pairs");
    el("Status").textContent = status + (catalog && !catalog.valuation_available
      ? " · " + copy("تعذّر تحديث القيمة السوقية", "Market-cap refresh unavailable") : "");
    changed = new Set();
    if (dialog.open) detail();
  }
  async function get(path, signal) {
    const response = await fetch(path, {signal, cache:"no-store", credentials:"same-origin"});
    if (!response.ok) throw new Error("Market map request failed");
    return response.json();
  }
  function suggestions() {
    const query = el("Search").value.toUpperCase().replace(/[^A-Z0-9]/g,"");
    const matches = (catalog?.pairs || []).filter(pair => pair.includes(query)).slice(0, 25);
    el("Pairs").replaceChildren(...matches.map(pair => {
      const option = node("option");
      option.value = pair;
      return option;
    }));
  }
  async function refresh(reset = false) {
    if (panel.hidden || document.hidden) return;
    if (request && !reset) return;
    request?.abort();
    const controller = new AbortController();
    request = controller;
    const timeout = setTimeout(() => controller.abort(), 26000);
    loading = true;
    error = false;
    changed = new Set();
    if (reset) cards = new Map();
    if (reset || !catalog) render();
    try {
      if (!catalog || Date.now() - lastCatalog > 120000) {
        const next = await get("/api/market-map", controller.signal);
        if (request !== controller) return;
        catalog = next;
        lastCatalog = Date.now();
        suggestions();
      }
      const pairs = pagePairs(), period = el("Period").value;
      if (pairs.length) {
        const next = await get("/api/market-map/windows?" + new URLSearchParams({period,pairs:pairs.join(",")}), controller.signal);
        if (request !== controller || period !== el("Period").value) return;
        const previous = cards;
        cards = new Map(next.cards.map(row => [row.pair,row]));
        changed = new Set(next.cards.filter(row => {
          const old = previous.get(row.pair);
          return old?.venue === row.venue && row.price_at_ms > old.price_at_ms && row.price !== old.price;
        }).map(row => row.pair));
      }
    } catch {
      if (request === controller) error = true;
    } finally {
      clearTimeout(timeout);
      if (request === controller) {
        request = null;
        loading = false;
        render();
      }
    }
  }
  function reset() { page = 0; refresh(true); }
  el("Search").addEventListener("input", () => {
    suggestions();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(reset, 250);
  });
  for (const id of ["Period","Sort","Favorites"]) el(id).addEventListener("change",reset);
  for (const id of ["Size","View"]) el(id).addEventListener("change",render);
  el("Prev").addEventListener("click", () => { page--; refresh(true); });
  el("Next").addEventListener("click", () => { page++; refresh(true); });
  board.addEventListener("click", event => {
    if (suppressClick) { suppressClick = false; return; }
    const button = event.target.closest(".market-map-card");
    if (!button) return;
    selected = button.dataset.pair;
    detail();
    dialog.showModal();
  });
  el("Chart").addEventListener("click", () => {
    dialog.close();
    document.dispatchEvent(new CustomEvent("stamp:market-map-pair",{detail:{pair:selected}}));
  });
  el("Star").addEventListener("click", () => {
    if (favorites.has(selected)) favorites.delete(selected);
    else favorites.add(selected);
    try { localStorage.setItem(favoritesKey,JSON.stringify([...favorites])); } catch {}
    detail();
    if (el("Favorites").checked) reset();
  });
  function rotate(value) {
    yaw = Math.max(-26,Math.min(26,value));
    board.style.setProperty("--market-yaw",yaw + "deg");
  }
  el("Left").addEventListener("click", () => rotate(yaw - 8));
  el("Right").addEventListener("click", () => rotate(yaw + 8));
  el("Reset").addEventListener("click", () => rotate(0));
  const viewport = el("Viewport");
  viewport.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    suppressClick = false;
    drag = {id:event.pointerId, x:event.clientX, y:event.clientY, yaw};
  });
  viewport.addEventListener("pointermove", event => {
    if (drag?.id !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    if (suppressClick || Math.abs(dx) > Math.max(10, Math.abs(event.clientY - drag.y))) {
      suppressClick = true;
      rotate(drag.yaw + dx / 7);
    }
  });
  for (const name of ["pointerup","pointerleave","pointercancel"]) viewport.addEventListener(name, () => { drag = null; });
  document.addEventListener("stamp:tabchange", () => { if (!panel.hidden) refresh(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
  document.getElementById("langSelect")?.addEventListener("change",render);
  document.getElementById("zoneSelect")?.addEventListener("change",render);
  setInterval(refresh,30000);
  if (!panel.hidden) refresh();
})();
