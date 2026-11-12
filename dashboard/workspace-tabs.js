"use strict";
(() => {
 const tabs = [...document.querySelectorAll('.page-nav [role="tab"]')];
 if (!tabs.length) return;
 const panelFor = tab => document.getElementById(tab.getAttribute("aria-controls"));
 if (!tabs.every(panelFor)) return;

 let current;
 function show(tab) {
  for (const item of tabs) {
   const active = tab === item;
   item.setAttribute("aria-selected", String(active));
   item.tabIndex = active ? 0 : -1;
   panelFor(item).hidden = !active;
  }
  if (current !== tab) {
   current = tab;
   document.dispatchEvent(new Event("stamp:tabchange"));
  }
 }
 function sync() {
  show(tabs.find(tab => tab.hash === location.hash) || tabs[0]);
 }
 function activate(tab) {
  show(tab);
  if (location.hash !== tab.hash) {
   try { history.pushState(null, "", tab.hash); }
   catch { location.hash = tab.hash; }
  }
  if (tab === tabs[0]) window.scrollTo(0, 0);
  else document.getElementById("mapTitle")?.scrollIntoView({block:"start"});
 }
 tabs.forEach((tab, index) => {
  tab.addEventListener("click", event => {
   if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
   event.preventDefault();
   activate(tab);
  });
  tab.addEventListener("keydown", event => {
   let next;
   if (event.key === "Home") next = 0;
   else if (event.key === "End") next = tabs.length - 1;
   else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    const forward = (event.key === "ArrowRight") === (document.documentElement.dir !== "rtl");
    next = (index + (forward ? 1 : -1) + tabs.length) % tabs.length;
   } else return;
   event.preventDefault();
   activate(tabs[next]);
   tabs[next].focus({preventScroll:true});
  });
 });
 window.addEventListener("popstate", sync);
 window.addEventListener("hashchange", sync);
 window.addEventListener("pageshow", sync);
 sync();
})();
