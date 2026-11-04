// Benchmark load generator (profile v1): warm-up, read load stages, sign-in phase. Built-in fetch only.
//   node load.mjs --base <url> --out <result.json>
// Credentials come from BENCH_FACULTY_EMAIL/PASSWORD and BENCH_STUDENT_EMAIL/PASSWORD (never printed).
import fs from 'node:fs';
import { prng, pct, median } from './lib.mjs';

const args = process.argv.slice(2);
const arg = (k) => { const i = args.indexOf(k); return i < 0 ? undefined : args[i + 1]; };
const base = (arg('--base') ?? '').replace(/\/$/, '');
const out = arg('--out');
if (!base || !out) { console.error('Usage: node load.mjs --base <url> --out <file>'); process.exit(2); }
const P = JSON.parse(fs.readFileSync(new URL('./profile.json', import.meta.url), 'utf8'));
const log = (m) => console.error(`${new Date().toISOString().slice(11, 19)} ${m}`);
const headers = (extra = {}) => ({ 'user-agent': P.userAgent, ...extra });

const loginRequest = (role) => fetch(`${base}/api/auth/login`, {
  method: 'POST', headers: headers({ 'content-type': 'application/json' }),
  body: JSON.stringify({ email: process.env[`BENCH_${role}_EMAIL`], password: process.env[`BENCH_${role}_PASSWORD`] }),
  signal: AbortSignal.timeout(30000),
});

async function login(role) {
  const r = await loginRequest(role);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(`${role} sign-in failed: HTTP ${r.status} ${j.code ?? ''}`);
  return j.access_token;
}

async function hit(path, token) {
  const start = performance.now();
  try {
    const r = await fetch(base + path, { headers: headers(token ? { authorization: `Bearer ${token}` } : {}), signal: AbortSignal.timeout(30000) });
    await r.arrayBuffer();
    return { ms: performance.now() - start, status: r.status };
  } catch (e) {
    return { ms: performance.now() - start, status: e.name === 'TimeoutError' ? 'timeout' : 'neterr' };
  }
}

function stats(results, startMs, endMs, extra = {}) {
  const ok = results.filter((r) => r.status === 200).map((r) => r.ms).sort((a, b) => a - b);
  const errors = {};
  for (const r of results) if (r.status !== 200) errors[r.status] = (errors[r.status] ?? 0) + 1;
  const errorCount = results.length - ok.length;
  const f = (x) => Math.round(x * 10) / 10;
  return { ...extra, start: startMs, end: endMs, requests: results.length, rps: f(results.length / ((endMs - startMs) / 1000)),
    p50: f(pct(ok, 0.5)), p95: f(pct(ok, 0.95)), p99: f(pct(ok, 0.99)), errorCount, errors,
    failed: results.length > 0 && errorCount / results.length > P.maxErrorRate };
}

const tokens = { FACULTY: await login('FACULTY'), STUDENT: await login('STUDENT') };

// Every mix endpoint must answer 200 once, so errors in the stages mean overload and not a bad setup.
for (const t of P.mix) {
  const r = await hit(t.path, t.role && tokens[t.role]);
  if (r.status !== 200) throw new Error(`Pre-check failed: ${t.path} answered ${r.status}`);
}
const rtt = [];
for (let i = 0; i < 10; i++) rtt.push((await hit('/api/health')).ms);
const rttMs = Math.round(median(rtt) * 10) / 10;
log(`round-trip (median of 10 /api/health): ${rttMs} ms`);

const total = P.mix.reduce((n, t) => n + t.weight, 0);
// Fixed weights + a seeded stream per virtual user: the request sequence is identical on every run.
function pick(rnd) {
  let x = rnd() * total;
  for (const t of P.mix) { x -= t.weight; if (x < 0) return t; }
  return P.mix[P.mix.length - 1];
}

async function readStage(users, seconds) {
  const results = [];
  const startMs = Date.now(), endAt = startMs + seconds * 1000;
  await Promise.all(Array.from({ length: users }, async (_, i) => {
    const rnd = prng(P.seed + users * 1000 + i);
    while (Date.now() < endAt) { const t = pick(rnd); results.push(await hit(t.path, t.role && tokens[t.role])); }
  }));
  return stats(results, startMs, Date.now(), { users });
}

const outcome = { rttMs, stages: {} };
log(`warm-up: ${P.warmup.users} users, ${P.warmup.seconds} s (not measured)`);
await readStage(P.warmup.users, P.warmup.seconds);

let skip = null;
for (const users of P.readUsers) {
  const key = `read-${users}`;
  if (skip) { outcome.stages[key] = { users, skipped: skip }; continue; }
  const s = await readStage(users, P.readSeconds);
  outcome.stages[key] = s;
  log(`${key}: ${s.requests} req, ${s.rps}/s, p95 ${s.p95} ms, errors ${s.errorCount}`);
  if (s.failed) { skip = `skipped: ${key} had more than ${P.maxErrorRate * 100}% errors`; log(skip); }
}

// Sign-in phase: open loop, one sign-in per tick (under the 100/min/IP limit), alternating roles.
{
  const results = [], pending = [];
  const startMs = Date.now();
  let early = false;
  for (let i = 0; i < P.signin.seconds * P.signin.perSecond; i++) {
    const begin = performance.now();
    pending.push(loginRequest(i % 2 ? 'STUDENT' : 'FACULTY').then(
      async (r) => { await r.arrayBuffer(); results.push({ ms: performance.now() - begin, status: r.status }); },
      (e) => { results.push({ ms: performance.now() - begin, status: e.name === 'TimeoutError' ? 'timeout' : 'neterr' }); }));
    const wait = startMs + (i + 1) * (1000 / P.signin.perSecond) - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    if (results.length >= 10 && results.filter((r) => r.status !== 200).length / results.length > P.maxErrorRate) { early = true; break; }
  }
  await Promise.all(pending);
  const s = stats(results, startMs, Date.now());
  if (early) s.note = 'stopped early: more than 20% errors';
  outcome.stages.signin = s;
  log(`signin: ${s.requests} sign-ins, p95 ${s.p95} ms, errors ${s.errorCount}`);
}

fs.writeFileSync(out, JSON.stringify(outcome, null, 1));
