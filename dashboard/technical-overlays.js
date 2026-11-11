/* Technical overlays use only completed, consecutive bars from the selected pair. */
(function (root) {
  "use strict";

  const RATIOS = [0, .236, .382, .5, .618, .786, 1];
  const COLORS = {
    tenkan: "#65d4f4", kijun: "#ffc776", chikou: "#a7adbd",
    spanA: "#58cfaa", spanB: "#e892aa",
    fib: "#9bacff", elliott: "#f5c879", alternate: "#bd9bff"
  };

  function consecutiveTail(bars, step, limit = 650) {
    let first = bars.length - 1;
    while (first > 0 && bars.length - first < limit && bars[first].t - bars[first - 1].t === step) first--;
    return bars.slice(Math.max(first, 0));
  }

  function midpoint(bars, end, count) {
    let high = -Infinity, low = Infinity;
    for (let i = end - count + 1; i <= end; i++) {
      high = Math.max(high, bars[i].h);
      low = Math.min(low, bars[i].l);
    }
    return (high + low) / 2;
  }

  function ichimoku(bars, step) {
    const result = {tenkan: [], kijun: [], chikou: [], spanA: [], spanB: [], cloud: []};
    for (let i = 0; i < bars.length; i++) {
      const time = bars[i].t / 1000, leadTime = (bars[i].t + step * 26) / 1000;
      const tenkan = i >= 8 ? midpoint(bars, i, 9) : null;
      const kijun = i >= 25 ? midpoint(bars, i, 26) : null;
      if (tenkan !== null) result.tenkan.push({time, value: tenkan});
      if (kijun !== null) {
        result.kijun.push({time, value: kijun});
        result.spanA.push({time: leadTime, value: (tenkan + kijun) / 2});
      }
      if (i >= 26) result.chikou.push({time: bars[i - 26].t / 1000, value: bars[i].c});
      if (i >= 51) {
        const b = midpoint(bars, i, 52);
        result.spanB.push({time: leadTime, value: b});
        result.cloud.push({time: leadTime, a: (tenkan + kijun) / 2, b});
      }
    }
    return result;
  }

  function pivots(bars, radius) {
    const points = [];
    for (let i = radius; i < bars.length - radius; i++) {
      const bar = bars[i];
      let isHigh = true, isLow = true;
      for (let j = 1; j <= radius; j++) {
        isHigh = isHigh && bar.h >= bars[i - j].h && bar.h > bars[i + j].h;
        isLow = isLow && bar.l <= bars[i - j].l && bar.l < bars[i + j].l;
      }
      if (isHigh === isLow) continue;
      const point = {index: i, time: bar.t / 1000, price: isHigh ? bar.h : bar.l, kind: isHigh ? "high" : "low"};
      const prior = points.at(-1);
      if (prior?.kind !== point.kind) points.push(point);
      else if (isHigh ? point.price >= prior.price : point.price <= prior.price) points[points.length - 1] = point;
    }
    return points;
  }

  function fibonacci(points) {
    if (points.length < 2) return null;
    const start = points.at(-2), end = points.at(-1);
    if ((end.kind === "high" && end.price <= start.price) || (end.kind === "low" && end.price >= start.price)) return null;
    return {start, end, levels: RATIOS.map(ratio => ({
      ratio, price: end.price + (start.price - end.price) * ratio
    }))};
  }

  function impulse(points, bars, radius) {
    const sign = points[0].kind === "low" ? 1 : -1;
    const [p0, p1, p2, p3, p4, p5] = points.map(point => sign * point.price);
    if (!(p0 < p2 && p2 < p1)) return null;
    if (p3 !== undefined && p3 <= p1) return null;
    if (p4 !== undefined && !(p1 < p4 && p4 < p3)) return null;
    if (p5 !== undefined && (p5 <= p3 || p3 - p2 < Math.min(p1 - p0, p5 - p4))) return null;

    const last = points.at(-1);
    // The previous structural boundary is relevant to partial, standard impulses.
    const invalidation = p5 !== undefined ? null : p3 === undefined ? points[0].price : points[1].price;
    if (invalidation !== null && bars.slice(last.index + 1).some(bar =>
      sign === 1 ? bar.l <= invalidation : bar.h >= invalidation)) return null;
    return {points, sign, invalidation, radius};
  }

  function elliott(bars, fastPivots = pivots(bars, 3)) {
    const candidates = [];
    const seen = new Set();
    for (const [radius, swings] of [[3, fastPivots], [5, pivots(bars, 5)]]) {
      const last = swings.at(-1);
      if (!last || bars.length - 1 - last.index > 18) continue;
      for (let size = Math.min(6, swings.length); size >= 3; size--) {
        const result = impulse(swings.slice(-size), bars, radius);
        if (!result) continue;
        const key = result.points.map(point => point.time + ":" + point.kind).join("|");
        if (seen.has(key)) continue;
        seen.add(key);
        candidates.push(result);
      }
    }
    return candidates.sort((a, b) =>
      b.points.at(-1).time - a.points.at(-1).time ||
      b.points.length - a.points.length || b.radius - a.radius
    ).slice(0, 2);
  }

  function cloudPrimitive(chart, candles) {
    let points = [], requestUpdate;
    const renderer = {
      draw(target) {
        if (points.length < 2) return;
        target.useMediaCoordinateSpace(({context, mediaSize}) => {
          const timeScale = chart.timeScale();
          const fill = (left, right) => {
            context.fillStyle = left.a + right.a <= left.b + right.b ? "#4ec4a326" : "#df7f9826";
            context.beginPath();
            context.moveTo(left.x, left.a);
            context.lineTo(right.x, right.a);
            context.lineTo(right.x, right.b);
            context.lineTo(left.x, left.b);
            context.closePath();
            context.fill();
          };
          let previous = null;
          for (const point of points) {
            const current = {x: timeScale.timeToCoordinate(point.time), a: candles.priceToCoordinate(point.a), b: candles.priceToCoordinate(point.b)};
            if ([current.x, current.a, current.b].some(value => value === null)) {
              previous = null;
              continue;
            }
            if (previous && current.x >= 0 && previous.x <= mediaSize.width) {
              const before = previous.a - previous.b, after = current.a - current.b;
              if (before * after < 0) {
                const ratio = before / (before - after);
                const cross = {x: previous.x + (current.x - previous.x) * ratio, a: previous.a + (current.a - previous.a) * ratio};
                cross.b = cross.a;
                fill(previous, cross);
                fill(cross, current);
              } else fill(previous, current);
            }
            previous = current;
          }
        });
      }
    };
    const view = {zOrder: () => "bottom", renderer: () => renderer};
    return {
      attached(parameters) { requestUpdate = parameters.requestUpdate; },
      detached() { requestUpdate = undefined; },
      paneViews: () => [view],
      setData(next) { points = next; requestUpdate?.(); }
    };
  }

  class Layers {
    constructor(chart, candles, library) {
      this.chart = chart;
      this.library = library;
      this.series = new Map();
      this.cloud = cloudPrimitive(chart, candles);
      candles.attachPrimitive(this.cloud);
      this.markers = library.createSeriesMarkers(candles, []);
    }

    render(bars, step, frame, enabled) {
      const {library, chart} = this;
      const recent = consecutiveTail(bars, step);
      const visible = new Set();
      const draw = (key, data, color, options = {}) => {
        if (!data.length) return;
        visible.add(key);
        if (!this.series.has(key)) {
          this.series.set(key, chart.addSeries(library.LineSeries, {
            color, lineWidth: 1, lastValueVisible: false, priceLineVisible: false,
            crosshairMarkerVisible: false, autoscaleInfoProvider: () => null, ...options
          }));
        }
        this.series.get(key).setData(data);
      };
      const result = {bars: recent.length, cloud: 0, fibonacci: null, elliott: []};
      if (enabled.has("ichimoku")) {
        const values = ichimoku(recent, step);
        for (const key of ["tenkan", "kijun", "chikou", "spanA", "spanB"]) draw(key, values[key], COLORS[key]);
        this.cloud.setData(values.cloud);
        result.cloud = values.cloud.length;
      } else this.cloud.setData([]);

      const supportsElliott = frame === "1h" || frame === "4h";
      const swings = enabled.has("fibonacci") || (enabled.has("elliott") && supportsElliott) ? pivots(recent, 3) : [];
      if (enabled.has("fibonacci")) {
        result.fibonacci = fibonacci(swings);
        if (result.fibonacci) {
          const {end, levels} = result.fibonacci;
          const lastTime = recent.at(-1).t / 1000;
          for (const {ratio, price} of levels) {
            draw("fib-" + ratio, [{time: end.time, value: price}, {time: lastTime, value: price}],
              ratio === .618 || ratio === .382 ? COLORS.fib : "#6c799f", {lineStyle: library.LineStyle.Dotted});
          }
        }
      }

      if (enabled.has("elliott") && supportsElliott) result.elliott = elliott(recent, swings);
      for (const [i, count] of result.elliott.entries()) {
        draw("wave-" + i, count.points.map(point => ({time: point.time, value: point.price})),
          i ? COLORS.alternate : COLORS.elliott, {lineWidth: 2, lineStyle: i ? library.LineStyle.Dashed : library.LineStyle.Solid, pointMarkersVisible: true, pointMarkersRadius: 3});
        if (count.invalidation !== null) {
          draw("invalid-" + i, [{time: count.points.at(-1).time, value: count.invalidation},
            {time: recent.at(-1).t / 1000, value: count.invalidation}],
            i ? COLORS.alternate : COLORS.elliott, {lineStyle: library.LineStyle.Dotted});
        }
      }
      this.markers.setMarkers((result.elliott[0]?.points || []).map((point, index) => ({
        time: point.time, position: point.kind === "high" ? "aboveBar" : "belowBar",
        shape: "circle", color: COLORS.elliott, text: String(index), size: .65
      })));
      for (const [key, series] of this.series) {
        if (!visible.has(key)) {
          chart.removeSeries(series);
          this.series.delete(key);
        }
      }
      return result;
    }
  }

  const api = {Layers, consecutiveTail, ichimoku, pivots, fibonacci, elliott};
  root.StampTechnical = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
