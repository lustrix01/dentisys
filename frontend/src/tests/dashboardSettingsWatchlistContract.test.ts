import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string): string => fs.readFileSync(path.join(here, rel), 'utf8');
const deanDashboard = read('../pages/admin/Dashboard.tsx');
const deanSettings = read('../pages/admin/Settings.tsx');
const secretaryDashboard = read('../pages/secretary/Dashboard.tsx');
const facultyDashboard = read('../pages/faculty/Dashboard.tsx');
const retention = read('../pages/faculty/RetentionMonitoring.tsx');
const apiClient = read('../services/apiClient.ts');

test('4.2 Dean Dashboard: metrics are server-backed and no Quick Actions block exists', () => {
  assert.match(deanDashboard, /getAdminDashboardKpisApi\(/);
  assert.doesNotMatch(deanDashboard, /quick\s*actions?/i);
  assert.match(deanDashboard, /recentAuditEvents/); // at-a-glance info stays
});

test('4.3 Faculty invitation record type carries no token material', () => {
  const type = /export interface FacultyInvitation \{[^}]*\}/.exec(apiClient)?.[0] ?? '';
  assert.ok(type.length > 0);
  assert.doesNotMatch(type, /token|link|url/i);
});

test('4.4 Dean Settings: no Course Component Ratios or Retention Standard setting', () => {
  assert.doesNotMatch(deanSettings, /Component Ratio/i);
  assert.doesNotMatch(deanSettings, /Retention Standard/i);
  assert.doesNotMatch(deanSettings, /<input|<select|<textarea/);
});

test('5.3 Midterm Watchlist offers no remedial action', () => {
  const start = retention.indexOf("{activeTab === 'midterm' && (");
  const end = retention.indexOf("{activeTab === 'watchlist' && (");
  assert.ok(start > 0 && end > start);
  const midterm = retention.slice(start, end);
  assert.doesNotMatch(midterm, /openSchedule|openResolve|openCostRecovery|Schedule attempt|Assign|Offer/);
  assert.doesNotMatch(midterm.replace(/Students with a final course grade[^<]*/, ''), /remedial/i);
});

test('7.1 Secretary Dashboard: no Quick Actions; status, alerts and pending work remain', () => {
  assert.doesNotMatch(secretaryDashboard, /quick\s*actions?/i);
  assert.match(secretaryDashboard, /getSecretaryDashboardKpisApi/);
  assert.match(secretaryDashboard, /getSecretaryActiveAttendanceSessionApi/);
  assert.match(secretaryDashboard, /getSecretaryExcusedRequestsApi/);
  assert.match(secretaryDashboard, /role="alert"|role="status"/);
});

test('5.1 Faculty Dashboard: no Quick Actions, one class-count figure; warnings and at-a-glance info remain', () => {
  assert.doesNotMatch(facultyDashboard, /quick\s*actions?/i);
  assert.equal((facultyDashboard.match(/Assigned Classes/g) ?? []).length, 3); // one tile label: three year variants
  assert.doesNotMatch(facultyDashboard, /Total Classes/i);
  assert.match(facultyDashboard, /At-Risk Watchlist/);
  assert.match(facultyDashboard, /Attendance Rate/);
  assert.match(facultyDashboard, /getFacultyDashboardKpisApi/);
  assert.match(facultyDashboard, /getFacultyRetentionApi/);
});
