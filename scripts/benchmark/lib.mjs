// Shared pieces of the benchmark: seeded random numbers, percentiles, server-sample summary, run comparison.
// No dependencies. Used by load.mjs, report.mjs and selfcheck.mjs.

export const PROFILE = 'v1';

// mulberry32: tiny seeded PRNG, the same sequence on every run and platform.
export function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Nearest rank on a sorted array.
export const pct = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0);

export const median = (values) => {
  const a = values.filter((v) => typeof v === 'number').sort((x, y) => x - y);
  if (!a.length) return null;
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

// Median of several result objects: numbers -> median, objects -> per key, anything else -> first value.
export function medianOf(list) {
  const first = list.find((x) => x !== undefined && x !== null);
  if (typeof first === 'number') return median(list);
  if (first && typeof first === 'object' && !Array.isArray(first)) {
    const out = {};
    for (const k of new Set(list.flatMap((x) => Object.keys(x ?? {})))) out[k] = medianOf(list.map((x) => x?.[k]).filter((v) => v !== undefined));
    return out;
  }
  return first;
}

// One sample per line: "T=<epoch s> load1=.. busy=.. steal=.. memused=.. memavail=.. swap=.. c.<name>=<cpu%>:<memMB> ..."
export function parseSamples(text) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('T=')) continue;
    const s = { t: 0, c: {} };
    for (const f of line.trim().split(/\s+/)) {
      const [k, v] = f.split('=');
      if (k === 'T') s.t = Number(v) * 1000;
      else if (k.startsWith('c.')) { const [cpu, mem] = v.split(':').map(Number); s.c[k.slice(2)] = { cpu, mem }; }
      else s[k] = Number(v);
    }
    out.push(s);
  }
  return out;
}

const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const peak = (a) => (a.length ? Math.max(...a) : null);
const low = (a) => (a.length ? Math.min(...a) : null);
const r1 = (x) => (x === null ? null : Math.round(x * 10) / 10);

// Average and peak per stage of the samples whose time falls inside [startMs, endMs] (server clock).
export function summarize(samples, startMs, endMs) {
  const w = samples.filter((s) => s.t >= startMs && s.t <= endMs);
  const col = (k) => w.map((s) => s[k]).filter((v) => typeof v === 'number');
  const names = [...new Set(w.flatMap((s) => Object.keys(s.c)))].sort();
  const containers = {};
  for (const n of names) {
    const cpu = w.map((s) => s.c[n]?.cpu).filter((v) => typeof v === 'number');
    const mem = w.map((s) => s.c[n]?.mem).filter((v) => typeof v === 'number');
    containers[n] = { cpuAvg: r1(avg(cpu)), cpuPeak: r1(peak(cpu)), memAvg: r1(avg(mem)), memPeak: r1(peak(mem)) };
  }
  const sum = (key) => (names.length ? w.map((s) => Object.values(s.c).reduce((t, c) => t + c[key], 0)) : []);
  return {
    samples: w.length,
    containersCpuAvg: r1(avg(sum('cpu'))), containersCpuPeak: r1(peak(sum('cpu'))), containersMemPeak: r1(peak(sum('mem'))), // sums over all containers
    cpuBusyAvg: r1(avg(col('busy'))), cpuBusyPeak: r1(peak(col('busy'))),
    cpuStealAvg: r1(avg(col('steal'))), cpuStealPeak: r1(peak(col('steal'))),
    memUsedAvg: r1(avg(col('memused'))), memUsedPeak: r1(peak(col('memused'))), memAvailMin: r1(low(col('memavail'))),
    swapPeak: r1(peak(col('swap'))), loadAvg: r1(avg(col('load1'))), loadPeak: r1(peak(col('load1'))),
    containers,
  };
}

// ---- comparison ----
const NOISE = 10;       // % change that still reads "no clear change"
const RTT_WARN = 30;    // % round-trip difference that warns
const ROWS_WARN = 10;   // % row-count difference that warns

// [label, getter, higherIsBetter]
const METRICS = [
  ['requests/s', (s) => s.rps, true], ['p50 ms', (s) => s.p50, false], ['p95 ms', (s) => s.p95, false], ['p99 ms', (s) => s.p99, false],
  ['errors', (s) => s.errorCount, false],
  ['check-in total p50 s', (s) => s.checkinP50, false], ['check-in total p95 s', (s) => s.checkinP95, false], ['verify calls over 20 s', (s) => s.over20s, false],
  ['check-in server time p50 s', (s) => s.addedP50, false], ['check-in server time p95 s', (s) => s.addedP95, false],
  ['guidance call p50 s', (s) => s.guidanceP50, false], ['guidance call p95 s', (s) => s.guidanceP95, false],
  ['verify call p50 s', (s) => s.verifyP50, false], ['verify call p95 s', (s) => s.verifyP95, false],
  ['CPU busy avg %', (s) => s.server?.cpuBusyAvg, false], ['CPU busy peak %', (s) => s.server?.cpuBusyPeak, false],
  ['memory used peak MB', (s) => s.server?.memUsedPeak, false], ['swap peak MB', (s) => s.server?.swapPeak, false],
  ['containers CPU avg %', (s) => s.server?.containersCpuAvg, false], ['containers CPU peak %', (s) => s.server?.containersCpuPeak, false],
  ['containers memory peak MB', (s) => s.server?.containersMemPeak, false],
];

export function change(oldV, newV, higherBetter) {
  if (oldV === 0 && newV === 0) return { text: 'no clear change', pct: 0 };
  if (!oldV) return { text: `${oldV} -> ${newV} (no baseline)`, pct: null };
  const p = ((newV - oldV) / Math.abs(oldV)) * 100;
  if (Math.abs(p) <= NOISE) return { text: `no clear change (${p >= 0 ? '+' : ''}${p.toFixed(1)}%)`, pct: p };
  const better = higherBetter ? p > 0 : p < 0;
  return { text: `${better ? 'better' : 'WORSE'} ${p >= 0 ? '+' : ''}${p.toFixed(1)}%`, pct: p };
}

export function compareRuns(a, b) {
  if (!a.valid || !b.valid) return { refused: `Not compared: ${!a.valid ? 'the old' : 'the new'} run is INVALID (${(!a.valid ? a : b).invalidReason}).`, lines: [], warnings: [] };
  if (a.profile !== b.profile) return { refused: `Not compared: profiles differ (${a.profile} vs ${b.profile}).`, lines: [], warnings: [] };
  if (a.target !== b.target) return { refused: `Not compared: targets differ (${a.target} vs ${b.target}).`, lines: [], warnings: [] };
  const warnings = [];
  if (a.rttMs && b.rttMs && Math.abs(((b.rttMs - a.rttMs) / a.rttMs) * 100) > RTT_WARN) warnings.push(`Round-trip changed ${a.rttMs} -> ${b.rttMs} ms (network differs; latency is not comparable).`);
  for (const [t, n] of Object.entries(b.fingerprint?.rowCounts ?? {})) {
    const o = a.fingerprint?.rowCounts?.[t];
    if (o && Math.abs(((n - o) / o) * 100) > ROWS_WARN) warnings.push(`Table ${t} rows ${o} -> ${n} (data changed by more than ${ROWS_WARN}%).`);
  }
  const lines = [];
  for (const key of Object.keys(b.stages)) {
    const sa = a.stages[key], sb = b.stages[key];
    if (!sa || !sb || sa.skipped || sb.skipped) continue; // phases present in both runs only
    for (const [label, get, hb] of METRICS) {
      const x = get(sa), y = get(sb);
      if (typeof x !== 'number' || typeof y !== 'number') continue;
      lines.push({ stage: key, metric: label, old: x, new: y, text: change(x, y, hb).text });
    }
  }
  return { refused: null, lines, warnings };
}
