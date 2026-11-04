// Result handling for benchmark.ps1.
//   node report.mjs build <workdir> <out.json>      one run from the files benchmark.ps1 collected
//   node report.mjs median <out.json> <run.json>... several repeats -> one file (stages = median, repeats kept)
//   node report.mjs table <result.json>             short terminal table
//   node report.mjs compare <old.json> <new.json>   exit 3 when the runs cannot be compared
import fs from 'node:fs';
import path from 'node:path';
import { PROFILE, parseSamples, summarize, medianOf, compareRuns } from './lib.mjs';

const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const [cmd, a, b, ...rest] = process.argv.slice(2);

function build(dir, outFile) {
  const meta = read(path.join(dir, 'meta.json'));
  const load = read(path.join(dir, 'load.json'));
  const face = fs.existsSync(path.join(dir, 'face.json')) ? read(path.join(dir, 'face.json')) : null;
  const samples = parseSamples(fs.readFileSync(path.join(dir, 'samples.txt'), 'utf8'));
  const stages = {};
  // Load stages carry this PC's clock; the sampler and the face phase carry the server's. offsetMs = server - PC.
  for (const [key, s] of Object.entries(load.stages)) {
    stages[key] = s.skipped ? s : { ...s, server: summarize(samples, s.start + meta.offsetMs, s.end + meta.offsetMs) };
    delete stages[key].failed;
  }
  for (const [key, s] of Object.entries(face?.stages ?? {})) stages[key] = { ...s, server: summarize(samples, s.start, s.end) };
  stages.idle = { start: meta.idle.start, end: meta.idle.end, server: summarize(samples, meta.idle.start + meta.offsetMs, meta.idle.end + meta.offsetMs) };
  const changed = Object.keys({ ...meta.imagesStart, ...meta.imagesEnd }).filter((n) => meta.imagesStart[n] !== meta.imagesEnd[n]);
  const run = {
    profile: PROFILE, target: meta.target, startedUtc: meta.startedUtc, gitSha: meta.gitSha, dirty: meta.dirty,
    valid: changed.length === 0,
    invalidReason: changed.length ? `image or restart count changed during the run: ${changed.join(', ')}` : null,
    rttMs: load.rttMs, fingerprint: meta.fingerprint, faceSkipped: meta.faceSkipped ?? null, stages,
  };
  fs.writeFileSync(outFile, JSON.stringify(run, null, 1));
}

function median(outFile, files) {
  const runs = files.map(read);
  const m = medianOf(runs.map((r) => r.stages));
  const merged = { ...runs[0], valid: runs.every((r) => r.valid), invalidReason: runs.find((r) => !r.valid)?.invalidReason ?? null,
    rttMs: medianOf(runs.map((r) => r.rttMs)), stages: m, repeats: runs.map(({ stages, startedUtc, valid, invalidReason }) => ({ startedUtc, valid, invalidReason, stages })) };
  fs.writeFileSync(outFile, JSON.stringify(merged, null, 1));
}

function table(file) {
  const r = read(file);
  const n = (x, d = 0) => (typeof x === 'number' ? x.toFixed(d) : '-');
  console.log(`\nBenchmark ${r.profile} | ${r.target} | ${r.gitSha}${r.dirty ? ' (dirty)' : ''} | round-trip ${n(r.rttMs, 1)} ms | ${r.valid ? 'VALID' : `INVALID: ${r.invalidReason}`}${r.repeats ? ` | median of ${r.repeats.length}` : ''}`);
  console.log(['stage'.padEnd(10), 'req'.padStart(6), 'req/s'.padStart(7), 'p50 ms'.padStart(8), 'p95 ms'.padStart(8), 'p99 ms'.padStart(8), 'errors'.padStart(7), 'CPU avg/peak %'.padStart(15), 'mem peak MB'.padStart(12)].join(' '));
  for (const [k, s] of Object.entries(r.stages)) {
    if (s.skipped) { console.log(`${k.padEnd(10)} ${s.skipped}`); continue; }
    // Demo: whole-server CPU and memory. Local: sum over the stack's containers (the Docker VM's own totals are not visible).
    const sv = s.server ?? {};
    const cpu = sv.cpuBusyAvg != null ? `${n(sv.cpuBusyAvg)}/${n(sv.cpuBusyPeak)}` : `${n(sv.containersCpuAvg)}/${n(sv.containersCpuPeak)}*`;
    const mem = sv.memUsedPeak != null ? n(sv.memUsedPeak) : `${n(sv.containersMemPeak)}*`;
    if (k.startsWith('face-')) console.log(`${k.padEnd(10)} ${n(s.checkins)} check-ins | total p50/p95 ${n(s.checkinP50, 1)}/${n(s.checkinP95, 1)} s | server time added p50/p95 ${n(s.addedP50, 1)}/${n(s.addedP95, 1)} s | guidance p50/p95 ${n(s.guidanceP50, 2)}/${n(s.guidanceP95, 2)} s | verify p50/p95 ${n(s.verifyP50, 2)}/${n(s.verifyP95, 2)} s | verify over 20 s: ${n(s.over20s)} | errors ${n(s.errorCount)} | CPU ${cpu}`);
    else if (k === 'idle') console.log(`${k.padEnd(10)} ${''.padStart(6)} ${''.padStart(7)} ${''.padStart(8)} ${''.padStart(8)} ${''.padStart(8)} ${''.padStart(7)} ${cpu.padStart(15)} ${mem.padStart(12)}`);
    else console.log([k.padEnd(10), n(s.requests).padStart(6), n(s.rps, 1).padStart(7), n(s.p50).padStart(8), n(s.p95).padStart(8), n(s.p99).padStart(8), n(s.errorCount).padStart(7), cpu.padStart(15), mem.padStart(12)].join(' '));
  }
  if (Object.values(r.stages).some((s) => s.server?.cpuBusyAvg == null && s.server?.containersCpuAvg != null)) console.log('* local: sum over the stack containers (CPU % of one core, memory MB)');
  if (r.faceSkipped) console.log(`face      skipped: ${r.faceSkipped}`);
}

function compare(oldFile, newFile) {
  const c = compareRuns(read(oldFile), read(newFile));
  if (c.refused) { console.log(c.refused); process.exit(3); }
  console.log(`\nCompare: old ${path.basename(oldFile)}  ->  new ${path.basename(newFile)}   (within +/-10% reads "no clear change")`);
  for (const w of c.warnings) console.log(`WARNING: ${w}`);
  let last = '';
  for (const l of c.lines) {
    if (l.stage !== last) { console.log(`\n[${l.stage}]`); last = l.stage; }
    console.log(`  ${l.metric.padEnd(22)} ${String(l.old).padStart(9)} -> ${String(l.new).padEnd(9)} ${l.text}`);
  }
  if (!c.lines.length) console.log('No phase is present in both runs.');
}

if (cmd === 'build') build(a, b);
else if (cmd === 'median') median(a, [b, ...rest]);
else if (cmd === 'table') table(a);
else if (cmd === 'compare') compare(a, b);
else { console.error('Usage: report.mjs build|median|table|compare ...'); process.exit(2); }
