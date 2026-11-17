// TEMPLATE: read-only live checks on the demo via its tunnel. Edit the checks per release; keep it GET-only and never print credentials or student data.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
const env = Object.fromEntries(readFileSync(homedir() + '/.dentisys/demo.env', 'utf8').split(/\r?\n/)
  .map(l => l.match(/^\s*([A-Z_]+)\s*=\s*(.*)$/)).filter(Boolean).map(m => [m[1], m[2].trim().replace(/^["']|["']$/g, '')]));
const base = `http://localhost:${env.DEMO_LOCAL_PORT}/api`;
async function login(role) {
  const r = await fetch(base + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: env[`DEMO_${role}_EMAIL`], password: env[`DEMO_${role}_PASSWORD`] }) });
  const j = await r.json(); return j.access_token ?? j.accessToken;
}
const get = async (t, p) => { const r = await fetch(base + p, { headers: { authorization: 'Bearer ' + t } }); return [r.status, await r.json().catch(() => null)]; };
const admin = await login('ADMIN'), fac = await login('FACULTY'), sec = await login('SECRETARY');
const [rs, rep] = await get(admin, '/admin/reports/summary?schoolYear=2026-2027');
console.log('reports', rs, 'attendance records', rep?.reports?.attendance?.length, 'students', rep?.reports?.students?.length, 'classGraded field', rep?.reports?.students?.[0] && 'classGraded' in rep.reports.students[0], 'instructorName', rep?.reports?.students?.find(x => x.instructorName)?.instructorName ?? 'missing');
const [is, inv] = await get(admin, '/admin/faculty-invitations');
const list = inv?.invitations ?? [];
console.log('invitations', is, 'statuses', JSON.stringify(list.reduce((a, x) => (a[x.status] = (a[x.status] ?? 0) + 1, a), {})), 'invitedAt sample', list.find(x => x.invitedAt)?.invitedAt);
const [fs, fr] = await get(fac, '/faculty/excused-requests');
console.log('faculty requests', fs, 'rows', (fr?.requests ?? []).length, 'fields', fr?.requests?.[0] ? Object.keys(fr.requests[0]).filter(k => /requested|current|Cutoff/.test(k)).join(',') : '(none)');
const [ss, sk] = await get(sec, '/secretary/dashboard/kpis');
console.log('secretary kpis', ss, 'pendingRequests' in (sk?.kpis ?? {}) ? 'pendingRequests=' + sk.kpis.pendingRequests : 'pendingRequests missing');
