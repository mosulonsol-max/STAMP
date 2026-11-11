"use strict";
const assert = require("node:assert/strict");
const {consecutiveTail, ichimoku, pivots, fibonacci, elliott} = require("../dashboard/technical-overlays.js");
const step = 3600000;
const bar = (i, value) => ({t: 1700000000000 + i * step, o: value, h: value + 1, l: value - 1, c: value, v: 1});
const increasing = Array.from({length: 80}, (_, i) => bar(i, 100 + i));
const result = ichimoku(increasing, step);
assert.equal(result.tenkan[0].time, increasing[8].t / 1000);
assert.equal(result.tenkan[0].value, 104);
assert.equal(result.kijun[0].value, 112.5);
assert.equal(result.spanA[0].time, increasing[51].t / 1000);
assert.equal(result.spanA[0].value, 116.75);
assert.equal(result.spanB[0].time, increasing[77].t / 1000);
assert.equal(result.spanB[0].value, 125.5);
assert.deepEqual(result.chikou[0], {time: increasing[0].t / 1000, value: 126});
assert.equal(consecutiveTail([...increasing.slice(0, 30), ...increasing.slice(40)], step).length, 40);

const controls = [[0, 110], [6, 100], [14, 120], [22, 109], [30, 148], [38, 128], [46, 163], [53, 152]];
const waveBars = [];
for (let n = 1; n < controls.length; n++) {
  const [from, base] = controls[n - 1], [to, target] = controls[n];
  for (let i = from; i < to; i++) waveBars.push(bar(i, base + (target - base) * (i - from) / (to - from)));
}
waveBars.push(bar(53, 152));
const confirmed = pivots(waveBars, 3);
const swing = fibonacci(confirmed);
assert.equal(swing.levels.length, 7);
assert.equal(swing.levels[0].price, swing.end.price);
assert.equal(swing.levels.at(-1).price, swing.start.price);
const counts = elliott(waveBars, confirmed);
assert.equal(counts[0].points.length, 6);
assert.equal(counts[0].sign, 1);
assert.equal(counts[0].invalidation, null);

const partial = waveBars.slice(0, 36);
const supported = elliott(partial, pivots(partial, 3));
assert.equal(supported[0].invalidation, 121);
const broke = [...partial, {...bar(36, 120), l: 117}];
assert.ok(elliott(broke, pivots(partial, 3)).every(count => count.points.length !== 4));

const invalid = confirmed.map((point, i) => i === 3 ? {...point, price: 122} : point);
assert.ok(elliott(waveBars, invalid).every(count => count.points[3]?.price !== 122 || count.points.length !== 6));
console.log("PASS Ichimoku displacement, confirmed pivots, Fibonacci anchors, and Elliott invalidation");
