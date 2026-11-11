"use strict";

(() => {
  const el = id => document.getElementById(id);
  const section = el("globalMarketFlow");
  if (!section) return;
  if (window.location.protocol === "file:") {
    el("flowStatus").textContent = document.documentElement.lang === "en"
      ? "Live market flow is available in the online dashboard."
      : "تدفقات السوق متاحة في لوحة السوق المتصلة.";
    for (const button of section.querySelectorAll("button")) button.disabled = true;
    return;
  }

  const scene = el("flowScene");
  const history = el("flowHistory");
  const periods = el("flowPeriods");
  const colors = {increase: "#5ad9a4", decrease: "#ff909d", net: "#c4a7ff"};
  const day = 86400;
  const english = () => document.documentElement.lang === "en";
  const copy = (ar, en) => english() ? en : ar;
  const ltr = value => "\u2066" + value + "\u2069";
  const usd = new Intl.NumberFormat("en-US", {style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2});
  const formatMoney = value => Number.isFinite(value) ? usd.format(value) : "—";
  const formatDate = (seconds, options = {}) => new Intl.DateTimeFormat(
    english() ? "en-GB" : "ar-IQ", {month: "short", day: "numeric", timeZone: "UTC", ...options}
  ).format(seconds * 1000);
  const formatTime = stamp => {
    const ms = Date.parse(stamp);
    if (!Number.isFinite(ms)) return "—";
    return formatDate(ms / 1000, {
      timeZone: el("zoneSelect").value || "Asia/Baghdad", hour: "2-digit", minute: "2-digit", hour12: false
    });
  };

  let payload = null;
  let loadFailed = false;
  let requestPending = false;
  let days = 30;
  let points = [];
  let deltas = null;
  let inspected = null;
  let yaw = -.48;
  let pitch = .45;
  let drag = null;
  let plotBounds = null;

  function setupCanvas(canvas) {
    const ctx = canvas.getContext("2d");
    if (!ctx || !canvas.clientWidth || !canvas.clientHeight) return null;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const pixelsWide = Math.round(width * ratio);
    const pixelsHigh = Math.round(height * ratio);
    if (canvas.width !== pixelsWide) canvas.width = pixelsWide;
    if (canvas.height !== pixelsHigh) canvas.height = pixelsHigh;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    return {ctx, width, height};
  }

  function path(ctx, points) {
    ctx.beginPath();
    points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
  }

  function drawScene() {
    const surface = setupCanvas(scene);
    if (!surface) return;
    const {ctx, width, height} = surface;
    const scale = Math.min(width / 8, height / 5.35);
    const cosYaw = Math.cos(yaw), sinYaw = Math.sin(yaw);
    const cosPitch = Math.cos(pitch), sinPitch = Math.sin(pitch);
    const project = ([x, y, z]) => {
      const horizontal = x * cosYaw + z * sinYaw;
      const turn = -x * sinYaw + z * cosYaw;
      const vertical = y * cosPitch - turn * sinPitch;
      const depth = y * sinPitch + turn * cosPitch;
      const perspective = 10 / (10 - depth);
      return {x: width / 2 + horizontal * perspective * scale, y: height * .56 - vertical * perspective * scale, depth};
    };

    ctx.strokeStyle = "#293745";
    for (let i = -3; i <= 3; i++) {
      path(ctx, [[i, 0, -2.1], [i, 0, 2.1]].map(project));
      ctx.stroke();
    }
    for (let z = -2; z <= 2; z++) {
      path(ctx, [[-3.55, 0, z], [3.55, 0, z]].map(project));
      ctx.stroke();
    }
    if (!deltas) return;

    const max = Math.max(deltas.increase, deltas.decrease, Math.abs(deltas.net), 1);
    const direction = english() ? 1 : -1;
    const bars = [
      {x: -2.2 * direction, value: deltas.increase, fill: ["#1c6451", "#287e63", "#5ad9a4"]},
      {x: 0, value: -deltas.decrease, fill: ["#773944", "#a5505d", "#ff909d"]},
      {x: 2.2 * direction, value: deltas.net, fill: ["#5d4c89", "#806ab0", "#c4a7ff"]}
    ];
    const faces = [];
    for (const bar of bars) {
      const y = bar.value / max * 1.85;
      const left = bar.x - .51, right = bar.x + .51, front = .61, back = -.61;
      const base = [[left, 0, back], [right, 0, back], [right, 0, front], [left, 0, front]];
      const vertices = [...base, ...base.map(([x, , z]) => [x, y, z])].map(project);
      for (const [indices, color] of [
        [[0, 1, 5, 4], bar.fill[0]], [[1, 2, 6, 5], bar.fill[1]],
        [[2, 3, 7, 6], bar.fill[0]], [[3, 0, 4, 7], bar.fill[1]],
        [[0, 1, 2, 3], bar.fill[2]], [[4, 5, 6, 7], bar.fill[2]]
      ]) {
        const points = indices.map(i => vertices[i]);
        const depth = points.reduce((sum, p) => sum + p.depth, 0) / points.length;
        faces.push({points, color, depth});
      }
    }
    ctx.strokeStyle = "#10161e";
    for (const face of faces.sort((a, b) => a.depth - b.depth)) {
      path(ctx, face.points);
      ctx.closePath();
      ctx.fillStyle = face.color;
      ctx.fill();
      ctx.stroke();
    }
  }

  function drawHistory() {
    const surface = setupCanvas(history);
    if (!surface) return;
    const {ctx, width, height} = surface;
    const first = points[0], last = points.at(-1);
    if (points.length < 2) {
      plotBounds = null;
      ctx.fillStyle = "#a3b0c1";
      ctx.font = "13px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(copy("لا توجد بيانات كافية لهذه الفترة", "Insufficient data for this period"), width / 2, height / 2);
      return;
    }

    const low = Math.min(...points.map(p => p.v));
    const high = Math.max(...points.map(p => p.v));
    const span = high - low || high * .002;
    const min = low - span * .12, max = high + span * .12;
    const left = 13, right = width - 65, top = 15, bottom = height - 32;
    const xAt = time => left + (time - first.t) / (last.t - first.t) * (right - left);
    const yAt = value => bottom - (value - min) / (max - min) * (bottom - top);
    const line = points.map(p => ({x: xAt(p.t), y: yAt(p.v)}));
    plotBounds = {left, right};

    ctx.font = "11px ui-monospace, monospace";
    ctx.textAlign = "left";
    ctx.fillStyle = "#a3b0c1";
    ctx.strokeStyle = "#293745";
    for (let i = 0; i < 5; i++) {
      const value = min + i * (max - min) / 4;
      const y = yAt(value);
      path(ctx, [{x: left, y}, {x: right, y}]);
      ctx.stroke();
      ctx.fillText(formatMoney(value), right + 6, y + 4);
    }
    const tickCount = width < 365 ? 3 : 5;
    ctx.textAlign = "center";
    ctx.font = "11px system-ui, sans-serif";
    for (let i = 0; i < tickCount; i++) {
      const time = first.t + i * (last.t - first.t) / (tickCount - 1);
      const label = formatDate(time);
      ctx.fillText(label, Math.max(ctx.measureText(label).width / 2 + 5, xAt(time)), height - 10);
    }

    const color = deltas.net >= 0 ? colors.increase : colors.decrease;
    const fill = ctx.createLinearGradient(0, top, 0, bottom);
    fill.addColorStop(0, color + "46");
    fill.addColorStop(1, color + "04");
    path(ctx, [...line, {x: right, y: bottom}, {x: left, y: bottom}]);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    path(ctx, line);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.lineWidth = 1;

    const point = line[inspected ?? line.length - 1];
    if (inspected !== null) {
      ctx.setLineDash([3, 4]);
      path(ctx, [{x: point.x, y: top}, {x: point.x, y: bottom}]);
      ctx.strokeStyle = "#a3b0c1";
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.beginPath();
    ctx.arc(point.x, point.y, 3.5, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
  }

  function updatePoint() {
    const point = points[inspected ?? points.length - 1];
    el("flowPoint").textContent = point
      ? formatDate(point.t, {year: "numeric"}) + " · " + ltr(formatMoney(point.v)) + (inspected === null && deltas ? " · " + ltr((deltas.net > 0 ? "+" : "") + (deltas.net / points[0].v * 100).toFixed(2) + "%") : "")
      : "—";
  }

  function render() {
    const series = Array.isArray(payload?.stablecoin_history) ? payload.stablecoin_history : [];
    const last = series.at(-1);
    points = last ? series.filter(point => point.t >= last.t - days * day) : [];
    deltas = null;
    if (points.length > 1) {
      let increase = 0, decrease = 0;
      for (let i = 1; i < points.length; i++) {
        const move = points[i].v - points[i - 1].v;
        increase += Math.max(0, move);
        decrease += Math.max(0, -move);
      }
      deltas = {increase, decrease, net: last.v - points[0].v};
    }
    inspected = null;
    el("flowCap").textContent = formatMoney(payload?.market_cap_usd);
    el("flowVolume").textContent = formatMoney(payload?.volume_24h_usd);
    el("flowSupply").textContent = formatMoney(payload?.stablecoin_supply_usd);
    el("flowExpansion").textContent = formatMoney(deltas?.increase);
    el("flowContraction").textContent = formatMoney(deltas?.decrease);
    el("flowNet").textContent = (deltas?.net > 0 ? "+" : "") + formatMoney(deltas?.net);
    el("flowNet").className = deltas ? deltas.net < 0 ? "negative" : "positive" : "";
    el("flowRange").textContent = deltas
      ? copy(points.length + " رصدًا يوميًا", points.length + " daily observations") : "—";
    const marketTime = payload?.market_observed_at_utc;
    const supplyTime = payload?.stablecoin_supply_observed_at_utc;
    const marketLate = !marketTime || Date.now() - Date.parse(marketTime) > 30 * 60000;
    const supplyLate = !supplyTime || Date.now() - Date.parse(supplyTime) > 2 * day * 1000;
    const times = [
      marketTime && (copy("السوق", "Market") + " · " + formatTime(marketTime)),
      supplyTime && (copy("المعروض", "Supply") + " · " + formatDate(Date.parse(supplyTime) / 1000) + " UTC")
    ].filter(Boolean);
    el("flowStatus").textContent = times.join(" / ") || copy("بيانات السوق غير متاحة", "Market data unavailable");
    const error = el("flowError");
    const notices = [];
    if (loadFailed) notices.push(payload ? copy("تعذّر التحديث. تظهر آخر قراءة متاحة.", "Refresh failed. Showing the last available observation.") : copy("تعذّر جلب بيانات السوق.", "Market data could not be retrieved."));
    if (payload && marketLate) notices.push(copy("رصد القيمة السوقية والحجم متأخر أو بلا توقيت من المصدر.", "Market cap and volume are delayed or missing a source timestamp."));
    if (payload && supplyLate) notices.push(copy("رصد معروض العملات المستقرة متأخر.", "The stablecoin supply observation is delayed."));
    error.textContent = notices.join(" ");
    error.hidden = notices.length === 0;
    if (payload?.sources) el("flowSources").textContent = Object.values(payload.sources).join(" · ");
    updatePoint();
    drawScene();
    drawHistory();
  }

  async function refresh() {
    if (requestPending) return;
    requestPending = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 16000);
    try {
      const response = await fetch("/api/market-flow", {
        credentials: "same-origin", cache: "no-store", signal: controller.signal
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const data = await response.json();
      if (!Number.isFinite(data.market_cap_usd) || !data.stablecoin_history?.length) throw new Error("Incomplete observations");
      payload = data;
      loadFailed = false;
    } catch {
      loadFailed = true;
    } finally {
      clearTimeout(timer);
      requestPending = false;
      render();
    }
  }

  periods.addEventListener("click", event => {
    const button = event.target.closest("button[data-days]");
    if (!button) return;
    days = Number(button.dataset.days);
    for (const option of periods.querySelectorAll("button")) option.setAttribute("aria-pressed", String(option === button));
    render();
  });
  el("flowReset").addEventListener("click", () => {
    yaw = -.48;
    pitch = .45;
    drawScene();
  });
  scene.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    drag = {x: event.clientX, y: event.clientY, yaw, pitch};
    scene.setPointerCapture(event.pointerId);
  });
  scene.addEventListener("pointermove", event => {
    if (!drag) return;
    yaw = drag.yaw + (event.clientX - drag.x) * .012;
    pitch = Math.max(.14, Math.min(1.06, drag.pitch + (event.clientY - drag.y) * .009));
    drawScene();
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
    scene.addEventListener(type, () => { drag = null; });
  }
  scene.addEventListener("keydown", event => {
    if (event.key === "ArrowLeft") yaw -= .15;
    else if (event.key === "ArrowRight") yaw += .15;
    else if (event.key === "ArrowUp") pitch = Math.min(1.06, pitch + .09);
    else if (event.key === "ArrowDown") pitch = Math.max(.14, pitch - .09);
    else return;
    event.preventDefault();
    drawScene();
  });
  const inspectPoint = event => {
    if (!plotBounds) return;
    const x = event.clientX - history.getBoundingClientRect().left;
    const progress = Math.max(0, Math.min(1, (x - plotBounds.left) / (plotBounds.right - plotBounds.left)));
    const time = points[0].t + progress * (points.at(-1).t - points[0].t);
    inspected = points.reduce((closest, point, index) => Math.abs(point.t - time) < Math.abs(points[closest].t - time) ? index : closest, 0);
    updatePoint();
    drawHistory();
  };
  history.addEventListener("pointermove", inspectPoint);
  history.addEventListener("pointerdown", inspectPoint);
  history.addEventListener("pointerleave", () => { inspected = null; updatePoint(); drawHistory(); });
  history.addEventListener("keydown", event => {
    if (!plotBounds || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const next = (inspected ?? points.length - 1) + (event.key === "ArrowLeft" ? -1 : 1);
    inspected = Math.max(0, Math.min(points.length - 1, next));
    updatePoint();
    drawHistory();
  });
  if (typeof ResizeObserver !== "undefined") {
    const observer = new ResizeObserver(() => { drawScene(); drawHistory(); });
    observer.observe(scene);
    observer.observe(history);
  }
  el("refresh").addEventListener("click", refresh);
  el("langSelect").addEventListener("change", () => { if (payload || loadFailed) render(); });
  el("zoneSelect").addEventListener("change", () => { if (payload || loadFailed) render(); });
  refresh();
  setInterval(() => { if (!document.hidden) refresh(); }, 300000);
})();
