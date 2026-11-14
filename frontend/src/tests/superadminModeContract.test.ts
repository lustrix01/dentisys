import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ADM-001 Superadmin mode (docs/contracts/superadmin.md SA1-SA4): the mode is the route, only the Dean has the switch.
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string): string => fs.readFileSync(path.join(here, rel), 'utf8');
const layout = read('../components/Layout.tsx');
const app = read('../App.tsx');

const between = (src: string, from: string, to: string): string => {
  const a = src.indexOf(from);
  const b = src.indexOf(to, a + from.length);
  assert.ok(a >= 0 && b > a, `${from} ... ${to} not found`);
  return src.slice(a, b);
};

test('SA1 the mode is the route: no stored state, no header, no flag', () => {
  assert.match(layout, /const superadminView = user\?\.role === 'admin' && location\.pathname\.startsWith\('\/superadmin\/'\);/);
  assert.doesNotMatch(layout, /localStorage\.(get|set)Item\(['"][^'"]*superadmin/i);
  const api = read('../services/apiClient.ts');
  assert.doesNotMatch(api, /X-DentiSys-(View|Mode)|superadminMode/i);
});

test('SA2 only the Dean sees the Dean / Superadmin switch; it copies the Secretary switcher markup', () => {
  const block = between(layout, '{/* Dean / Superadmin View Switcher', '{/* Navigation Items */}');
  assert.match(block, /\{user\?\.role === 'admin' && \(/);
  assert.match(block, /aria-label="Account view"/);
  assert.match(block, /aria-pressed=\{on\}/);
  assert.match(block, /label: 'Dean', tip: 'Dean view', to: '\/'/);
  assert.match(block, /label: 'Superadmin', tip: 'Superadmin view', to: '\/superadmin\/overview'/);
  // Same container classes as the Secretary / Student switcher.
  const secretary = between(layout, '{/* Secretary / Student Role Switcher */}', '{/* Dean / Superadmin View Switcher');
  const shell = 'mb-4 rounded-xl bg-slate-200/60 dark:bg-slate-800/80 p-1 flex';
  assert.ok(secretary.includes(shell) && block.includes(shell));
  assert.match(secretary, /\{user\?\.role === 'secretary' && \(/); // the Secretary switcher is still Secretary-only
});

test('SA3 the Superadmin sidebar sets things up: Overview, People, Invitations, Courses, Terms, Rooms, Audit Trail', () => {
  const nav = between(layout, 'if (superadminView) {', "if (currentUser.role === 'admin') {");
  assert.deepEqual([...nav.matchAll(/name: '([^']+)', path: '([^']+)'/g)].map(m => [m[1], m[2]]), [
    ['Overview', '/superadmin/overview'],
    ['People & Accounts', '/superadmin/people'],
    ['Faculty Invitations', '/superadmin/faculty-invite'],
    ['Course Catalog', '/superadmin/course-catalog'],
    ['Academic Terms', '/superadmin/terms'],
    ['Rooms', '/superadmin/rooms'],
    ['Audit Trail', '/superadmin/audit-trail'],
  ]);
  assert.doesNotMatch(nav, /Classes/); // Class Sections stays a Dean-view preview (answer 4)
});

test('SA4 the Dean view watches: Dashboard, Reports & Analytics, Classes only', () => {
  const nav = between(layout, "if (currentUser.role === 'admin') {", "if (currentUser.role === 'secretary') {");
  assert.deepEqual([...nav.matchAll(/name: '([^']+)', path: '([^']+)'/g)].map(m => [m[1], m[2]]), [
    ['Dashboard', '/'],
    ['Reports & Analytics', '/admin/reports'],
    ['Classes', '/admin/classes'],
  ]);
});

test('SA4 routes: old paths go to the dashboard; /superadmin/* is Dean-only; the top bar shows a Superadmin chip', () => {
  assert.match(app, /path="\/admin\/people" element=\{<Navigate to="\/" replace \/>\}/);
  assert.match(app, /path="\/admin\/course-catalog" element=\{<Navigate to="\/" replace \/>\}/);
  const adminRoutes = between(app, "<ProtectedRoute allowedRoles={['admin']} />", "<ProtectedRoute allowedRoles={['secretary']} />");
  for (const p of ['overview', 'terms', 'rooms', 'faculty-invite', 'audit-trail', 'course-catalog', 'people']) assert.match(adminRoutes, new RegExp(`path="/superadmin/${p}" element=\\{<(?!Navigate)`));
  assert.match(adminRoutes, /path="\/superadmin" element=\{<Navigate to="\/superadmin\/overview" replace \/>\}/);
  const redirects: Array<[string, string]> = [
    ['terms', 'terms'], ['academic-terms', 'terms'], ['rooms', 'rooms'], ['faculty-invite', 'faculty-invite'],
    ['faculty-approval', 'faculty-invite'], ['audit-trail', 'audit-trail'], ['audit', 'audit-trail'],
  ];
  for (const [from, to] of redirects) assert.match(adminRoutes, new RegExp(`path="/admin/${from}" element=\\{<Navigate to="/superadmin/${to}" replace />\\}`));
  assert.doesNotMatch(app, /DeanAuditTrail/); // only one Audit Trail page remains
  assert.equal((layout.match(/>Superadmin<\/span>/g) ?? []).length, 2); // desktop header and phone page title
  assert.match(layout, /\{superadminView && <span/);
});
