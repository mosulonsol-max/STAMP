"use strict";
/* One spatial workspace: linked data appears as an inspector beside the model. */
(() => {
 const targets = ["trading", "globalMarketFlow", "marketMap", "venuesSection", "labCenter", "systemCenter"];
 const drawer = document.getElementById("sceneDetail");
 const title = document.getElementById("sceneDetailTitle");
 const closeButton = document.getElementById("sceneDetailClose");
 const panels = targets.map(id => document.getElementById(id));
 if (!drawer || panels.some(panel => !panel)) return;
 const labels = {
  trading:["السعر والتحليل", "Price and analysis"],
  globalMarketFlow:["حركة السوق", "Market flows"],
  marketMap:["القيمة السوقية والعملات", "Market valuation and assets"],
  venuesSection:["المنصات والسيولة", "Exchanges and liquidity"],
  labCenter:["المختبر والتعلّم", "Research and learning"],
  systemCenter:["تشغيل النظام", "System operations"]
 };
 let current = null;
 function show(target, focus = false) {
  const next = targets.includes(target) ? target : null;
  const changed = current !== next;
  current = next;
  drawer.hidden = !next;
  drawer.dataset.focus = next || "";
  document.body.dataset.workspace = next || "scene";
  panels.forEach(panel => { panel.hidden = panel.id !== next; });
  if (next) {
   const language = document.documentElement.lang === "en" ? 1 : 0;
   title.textContent = labels[next][language];
   drawer.scrollTop = 0;
   if (focus) closeButton.focus({preventScroll:true});
  } else if (focus) document.getElementById("traceCanvas")?.focus({preventScroll:true});
  if (changed) document.dispatchEvent(new Event("stamp:tabchange"));
 }
 function navigate(target, focus = false) {
  const hash = target ? "#" + target : "#overview";
  if (location.hash !== hash) history.pushState(null, "", hash);
  show(target, focus);
 }
 function sync() { show(decodeURIComponent(location.hash.slice(1))); }
 document.addEventListener("click", event => {
  const link = event.target.closest('a[href^="#"]');
  if (!link || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
  const target = link.getAttribute("href").slice(1);
  if (!targets.includes(target) && target !== "overview") return;
  event.preventDefault();
  navigate(target === "overview" ? null : target, target !== "overview");
 });
 document.addEventListener("stamp:open-workspace", event => navigate(event.detail?.target, true));
 closeButton.addEventListener("click", () => navigate(null, true));
 document.addEventListener("keydown", event => {
  if (event.key === "Escape" && current && !document.querySelector("dialog[open]")) {
   event.preventDefault(); navigate(null, true);
  }
 });
 window.addEventListener("popstate", sync);
 window.addEventListener("hashchange", sync);
 window.addEventListener("pageshow", sync);
 document.getElementById("langSelect")?.addEventListener("change", () => {
  if (current) title.textContent = labels[current][document.documentElement.lang === "en" ? 1 : 0];
 });
 sync();
})();
