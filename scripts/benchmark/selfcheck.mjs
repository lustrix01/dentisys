// Self-check of the deterministic parts: node scripts/benchmark/selfcheck.mjs
import assert from 'node:assert/strict';
import { prng, pct, parseSamples, summarize, compareRuns, change } from './lib.mjs';

// Seeded PRNG: identical sequence twice, different for another seed, inside [0,1).
const seq = (seed) => { const r = prng(seed); return Array.from({ length: 1000 }, r); };
assert.deepEqual(seq(20261104), seq(20261104));
assert.notDeepEqual(seq(20261104), seq(20261105));
assert.ok(seq(1).every((x) => x >= 0 && x < 1));

assert.equal(pct([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.5), 6);
assert.equal(pct([], 0.95), 0);

// Samples: per-stage average and peak.
const samples = parseSamples('T=100 load1=0.5 busy=10.0 steal=0.0 memused=400 memavail=500 swap=0 c.web=20.0:90\nT=105 load1=1.5 busy=30.0 steal=1.0 memused=420 memavail=480 swap=5 c.web=40.0:95\nT=200 load1=9 busy=99 steal=0 memused=900 memavail=10 swap=50 c.web=99:200\n');
const s = summarize(samples, 100000, 110000);
assert.equal(s.cpuBusyAvg, 20); assert.equal(s.cpuBusyPeak, 30); assert.equal(s.memUsedPeak, 420); assert.equal(s.containers.web.cpuPeak, 40); assert.equal(s.containersCpuPeak, 40); assert.equal(s.containersMemPeak, 95);

// Compare: +/-10% reads "no clear change"; refuses INVALID runs and different profiles; warns on round-trip and row counts.
assert.match(change(100, 105, true).text, /no clear change/);
assert.match(change(100, 150, true).text, /^better/);
assert.match(change(100, 150, false).text, /^WORSE/);
const run = (rps, p95, extra = {}) => ({ profile: 'v1', target: 'demo', valid: true, rttMs: 40, fingerprint: { rowCounts: { students: 100 } },
  stages: { 'read-10': { rps, p95, server: { cpuBusyAvg: 50 } }, 'face-1': { checkinP95: 5 } }, ...extra });
const c = compareRuns(run(100, 200), run(130, 205, { rttMs: 80, fingerprint: { rowCounts: { students: 150 } } }));
assert.equal(c.refused, null);
assert.equal(c.warnings.length, 2);
assert.match(c.lines.find((l) => l.metric === 'requests/s').text, /^better \+30/);
assert.match(c.lines.find((l) => l.metric === 'p95 ms').text, /^no clear change/);
assert.ok(c.lines.some((l) => l.stage === 'face-1')); // present in both
assert.ok(compareRuns(run(1, 1, { valid: false, invalidReason: 'x' }), run(1, 1)).refused);
assert.ok(compareRuns(run(1, 1), run(1, 1, { profile: 'v2' })).refused);
const onlyOld = compareRuns(run(1, 1), { ...run(1, 1), stages: { 'read-10': { rps: 1, p95: 1 } } });
assert.ok(!onlyOld.lines.some((l) => l.stage === 'face-1')); // compared only where both runs have the phase

console.log('benchmark self-check OK');
