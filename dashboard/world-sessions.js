"use strict";
(() => {
  const clocks = document.getElementById("worldClocks");
  const assets = document.getElementById("worldAssets");
  const state = document.getElementById("worldStatus");
  const coverage = document.getElementById("worldCoverage");
  if (!clocks || !assets || !state || !coverage) return;

  let snapshot = null;
  let fetching = false;
  const labels = (ar, en) => document.documentElement.lang === "en" ? en : ar;
  const number = value => new Intl.NumberFormat(document.documentElement.lang === "en" ? "en-US" : "ar-IQ", {
    maximumFractionDigits: value < 100 ? 2 : 0
  }).format(value);
  const money = value => value == null ? "—" : number(value) + " USDT";
  function localTime(value, zone) {
    const ms = typeof value === "number" ? value : Date.parse(value);
    if (!Number.isFinite(ms)) return "—";
    return new Intl.DateTimeFormat(document.documentElement.lang === "en" ? "en-GB" : "ar-IQ", {
      timeZone: zone, hour: "2-digit", minute: "2-digit", hour12: false
    }).format(ms);
  }
  const node = (tag, className, content) => {
    const item = document.createElement(tag);
    item.className = className;
    item.textContent = content;
    return item;
  };

  function paint() {
    if (!snapshot) return;
    const age = Math.max(0, Math.floor((Date.now() - Date.parse(snapshot.crypto?.observed_utc)) / 1000));
    const delayed = !Number.isFinite(age) || age > 45;
    const sessionAge = Math.max(0, (Date.now() - Date.parse(snapshot.generated_utc)) / 1000);
    state.textContent = delayed || snapshot.crypto?.status !== "ok" ? labels("لا توجد عينة حديثة مكتملة", "Recent sample unavailable") :
      labels("محدّث قبل ", "Updated ") + age + labels(" ثانية · UTC ", "s ago · UTC ") +
      localTime(snapshot.crypto.observed_utc, "UTC");
    state.dataset.status = delayed || snapshot.crypto?.status !== "ok" ? "delayed" : "live";
    clocks.replaceChildren();
    for (const market of snapshot.sessions || []) {
      const current = sessionAge > 90 ? "unknown" : market.status;
      const card = node("article", "world-clock", "");
      card.dataset.status = current;
      const head = node("div", "world-clock-head", "");
      head.append(node("strong", "", market.name), node("span", "world-clock-time", localTime(Date.now(), market.timezone)));
      card.append(head, node("div", "world-clock-state", ({
        open: labels("مفتوح", "OPEN"), break: labels("استراحة", "BREAK"),
        closed: labels("مغلق", "CLOSED"), unknown: labels("غير متحقق", "UNVERIFIED")
      })[current] || "—"));
      if (current !== "unknown" && market.next_change_utc) {
        const next = current === "open" ? labels("إغلاق/استراحة", "Close/break") : labels("الافتتاح", "Next open");
        card.append(node("small", "", next + " · " + localTime(market.next_change_utc, market.timezone)));
      }
      clocks.append(card);
    }
    const crypto = snapshot.crypto || {};
    const responded = (crypto.coverage || []).filter(item => item.status !== "unavailable");
    coverage.textContent = labels("صفقات مرصودة · ", "Observed trades · ") +
      responded.length + "/12 " + labels("مصدر/زوج · آخر 60 ثانية", "venue/pair feeds · last 60s");
    assets.replaceChildren();
    if (delayed || crypto.status !== "ok") {
      assets.append(node("p", "world-empty", labels("لا توجد صفقات حديثة موثوقة من المصادر المتاحة.",
        "No reliable recent executions from the available feeds.")));
      return;
    }
    for (const asset of crypto.assets || []) {
      const total = asset.buy_usdt + asset.sell_usdt;
      const card = node("article", "world-asset", "");
      const title = node("div", "world-asset-head", "");
      title.append(node("strong", "", asset.symbol.replace("USDT", " / USDT")),
        node("span", "", asset.trades ? labels("التركيز ", "Focus ") + money(total) : labels("لا صفقات حديثة", "No recent trades")));
      const bar = node("div", "world-asset-bar", "");
      const buyBar = node("span", "world-buy-bar", "");
      buyBar.style.width = total ? (asset.buy_usdt / total * 100).toFixed(2) + "%" : "0%";
      bar.append(buyBar);
      const values = node("div", "world-asset-values", "");
      values.append(node("span", "world-buy", labels("شراء ", "Buy ") + money(asset.buy_usdt)),
        node("span", "world-sell", labels("بيع ", "Sell ") + money(asset.sell_usdt)));
      const span = asset.first_ms && asset.last_ms ?
        Math.max(0, (asset.last_ms - asset.first_ms) / 1000).toFixed(1) + "s" : "—";
      const latestAge = asset.last_ms ? Math.max(0, Math.floor((Date.now() - asset.last_ms) / 1000)) + "s" : "—";
      const detail = node("small", "world-asset-detail", asset.venues.join(" · ") +
        " · " + asset.trades + labels(" صفقة · امتداد العينة ", " trades · sample span ") + span +
        labels(" · آخر صفقة قبل ", " · latest trade ") + latestAge +
        (asset.capped_venues.length ? labels(" · حدود عدد الصفقات مفعّلة", " · trade caps reached") : ""));
      card.append(title, bar, values, detail);
      assets.append(card);
    }
  }

  async function refresh() {
    if (fetching || document.hidden) return;
    fetching = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);
    try {
      const response = await fetch("/api/world-sessions", {cache: "no-store", signal: controller.signal});
      if (!response.ok) throw Error("http_" + response.status);
      const value = await response.json();
      if (!Array.isArray(value.sessions) || !Array.isArray(value.crypto?.assets)) throw Error("invalid_data");
      snapshot = value;
      paint();
    } catch (_) {
      state.textContent = labels("تعذر التحديث · الأرقام غير متاحة", "Update failed · figures unavailable");
      state.dataset.status = "delayed";
      if (snapshot) { snapshot.crypto.observed_utc = ""; paint(); }
      else assets.replaceChildren(node("p", "world-empty", labels("المصادر غير متاحة الآن.", "Sources unavailable now.")));
    } finally { clearTimeout(timeout); fetching = false; }
  }
  document.getElementById("langSelect")?.addEventListener("change", paint);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
  setInterval(() => { if (!document.hidden) paint(); }, 1000);
  setInterval(refresh, 15000);
  refresh();
})();
