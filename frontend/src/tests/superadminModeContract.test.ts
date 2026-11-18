import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Backlog 13.9 (docs/contracts/dean-superadmin-split.md DS16-DS19, DS24): the Superadmin is its own role and account; there is no mode.
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string): string => fs.readFileSync(path.join(here, rel), 'utf8');
const layout = read('../components/Layout.tsx');
const app = read('../App.tsx');
const authTypes = read('../types/auth.ts');

const between = (src: string, from: string, to: string): string => {
  const a = src.indexOf(from);
  const b = src.indexOf(to, a + from.length);
  assert.ok(a >= 0 && b > a, `${from} ... ${to} not found`);
  return src.slice(a, b);
};
// Every sidebar entry in source order: name, path (an icon marks a sidebar entry, not a breadcrumb).
const sidebar = [...layout.matchAll(/name: '([^']+)', path: '([^']+)', icon:/g)].map(m => [m[1], m[2]] as [string, string]);

test('D1 the Superadmin is a fifth role on its own account', () => {
  assert.match(authTypes, /UserRole = [^;]*'superadmin'/);
  assert.match(layout, /user\?\.role === 'superadmin'/);
});

test('DS18 the Dean / Superadmin switcher and the Superadmin chip are gone', () => {
  assert.doesNotMatch(layout, /Dean \/ Superadmin View Switcher/);
  assert.doesNotMatch(layout, /label: 'Superadmin', tip: 'Superadmin view'/);
  assert.doesNotMatch(layout, /label: 'Dean', tip: 'Dean view'/);
  assert.doesNotMatch(layout, /\{superadminView && <span/);
  assert.doesNotMatch(layout, /localStorage\.(get|set)Item\(['"][^'"]*superadmin/i);
  assert.doesNotMatch(read('../services/apiClient.ts'), /X-DentiSys-(View|Mode)|superadminMode/i);
});

test('DS16 the Superadmin sidebar: Overview, People & Accounts, Classes, Course Catalog, Academic Terms, Rooms, Face Enrolment Flags, Audit Trail', () => {
  assert.deepEqual(sidebar.filter(([, p]) => p.startsWith('/superadmin/')), [
    ['Overview', '/superadmin/overview'],
    ['People & Accounts', '/superadmin/people'],
    ['Classes', '/superadmin/classes'],
    ['Course Catalog', '/superadmin/course-catalog'],
    ['Academic Terms', '/superadmin/terms'],
    ['Rooms', '/superadmin/rooms'],
    ['Face Enrolment Flags', '/superadmin/face-flags'],
    ['Audit Trail', '/superadmin/audit-trail'],
  ]);
  // Profile and Settings of the Superadmin live in the account menu, under /superadmin/.
  assert.match(layout, /\/superadmin\/profile/);
  assert.match(layout, /\/superadmin\/settings/);
});

test('DS17 the Dean sidebar: Dashboard, Reports & Analytics, Faculty Invitations, My Activity', () => {
  const i = sidebar.findIndex(([n, p]) => n === 'Reports & Analytics' && p === '/admin/reports');
  assert.ok(i > 0);
  assert.deepEqual(sidebar.slice(i - 1, i + 3), [
    ['Dashboard', '/'],
    ['Reports & Analytics', '/admin/reports'],
    ['Faculty Invitations', '/admin/faculty-invite'],
    ['My Activity', '/admin/audit-trail'],
  ]);
  const deanPaths = sidebar.slice(i - 1, i + 3).map(([, p]) => p);
  for (const moved of ['/admin/terms', '/admin/rooms', '/admin/course-catalog', '/admin/classes']) assert.ok(!sidebar.some(([, p]) => p === moved), `${moved} is no Dean sidebar entry`);
  assert.equal(deanPaths.length, 4);
});

test('DS19 /superadmin/* is Superadmin-only and every page of the sidebar has a route', () => {
  const block = between(app, "<ProtectedRoute allowedRoles={['superadmin']} />", '</Route>');
  for (const p of ['overview', 'people', 'classes', 'course-catalog', 'terms', 'rooms', 'face-flags', 'audit-trail', 'profile', 'settings']) {
    assert.match(block, new RegExp(`path="/superadmin/${p}" element=\\{<(?!Navigate)`), `/superadmin/${p}`);
  }
  assert.match(block, /path="\/superadmin" element=\{<Navigate to="\/superadmin\/overview" replace \/>\}/);
  // The Dean group no longer owns the moved pages, and the old /superadmin -> /admin redirects are gone.
  const dean = between(app, "<ProtectedRoute allowedRoles={['admin']} />", "<ProtectedRoute allowedRoles={['superadmin']} />");
  for (const p of ['terms', 'rooms', 'course-catalog', 'classes']) assert.doesNotMatch(dean, new RegExp(`path="/admin/${p}" element=\\{<(?!Navigate)`));
  for (const p of ['terms', 'rooms', 'course-catalog']) assert.doesNotMatch(app, new RegExp(`path="/superadmin/${p}" element=\\{<Navigate to="/admin/`));
});

test('DS19 old /admin paths redirect to the matching /superadmin page', () => {
  for (const [from, to] of [['terms', 'terms'], ['rooms', 'rooms'], ['course-catalog', 'course-catalog'], ['classes', 'classes'], ['academic-terms', 'terms']]) {
    assert.match(app, new RegExp(`path="/admin/${from}" element=\\{<Navigate to="/superadmin/${to}" replace />\\}`), `/admin/${from}`);
  }
});

test('DS19 a wrong role goes to its own home; the Superadmin home is the Overview', () => {
  const guard = read('../components/ProtectedRoute.tsx');
  assert.match(guard, /allowedRoles\.includes\(user\.role\)[\s\S]{0,300}<Navigate to="\/" replace/);
  assert.match(app, /user\.role === 'superadmin'\) return <Navigate to="\/superadmin\/overview"/);
});

test('DS24 first sign-in opens Set Up 2FA at /2fa/setup, outside the protected routes', () => {
  assert.match(app, /path="\/2fa\/setup" element=\{<MfaSetup \/>\}/);
  const setup = read('../pages/auth/MfaSetup.tsx');
  assert.match(setup, /Set Up 2FA/);
  assert.match(setup, /The Superadmin account needs 2FA\. Scan the code with your authenticator app, then type the 6-digit code\./);
  const auth = read('../services/apiClient.ts') + read('../pages/auth/SsoLogin.tsx');
  assert.match(auth, /two_factor_setup_required/);
  assert.match(auth, /\/2fa\/setup/);
});
