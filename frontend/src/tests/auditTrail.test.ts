import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  AUDIT_EXPORT_HEADER, auditCsvRows, auditDateRange, auditQueryString, currentTerm, formatManilaWhen, groupByDay, manilaDayLabel,
  type AuditEntry,
} from '../services/auditService.ts';
import { getAdminAuditLogsApi, getFacultyActivityApi, getSecretaryActivityApi } from '../services/apiClient.ts';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

function entry(over: Partial<AuditEntry>): AuditEntry {
  return {
    id: 'e:1', occurredAt: '2026-10-17T10:16:00+08:00',
    who: { name: 'Dr. Ana Reyes', email: 'ana@example.test', role: 'faculty', roleLabel: 'Faculty' }, whoText: null,
    what: 'Changed scores', area: 'Grading', record: 'Quiz 2 (Midterm) · DENT 101-A', change: '3 scores changed',
    status: 'Success', isSignIn: false, batch: null,
    details: { fromWhere: { ip: null, device: null }, reason: null, changes: [] }, ...over,
  };
}

test('only non-default filters are sent as params', () => {
  assert.equal(auditQueryString({}), '');
  assert.equal(auditQueryString({ q: '', area: '', page: 1, sort: 'newest', signins: false }), '');
  const qs = new URLSearchParams(auditQueryString({
    q: 'ana', area: 'Grading', status: 'Failed', role: 'faculty', cls: '7', from: '2026-10-01', to: '2026-10-17',
    signins: true, sort: 'oldest', page: 3,
  }));
  assert.deepEqual(Object.fromEntries(qs), {
    q: 'ana', area: 'Grading', status: 'Failed', role: 'faculty', cls: '7', from: '2026-10-01', to: '2026-10-17', signins: '1', sort: 'oldest', page: '3',
  });
});

test('each role calls its own endpoint with the filter params and no limit', async () => {
  const urls: string[] = [];
  globalThis.fetch = (async (url: unknown) => {
    urls.push(String(url));
    return new Response(JSON.stringify({ status: 'ok', entries: [], total: 0, page: 1, pageSize: 50, areas: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  await getAdminAuditLogsApi({ role: 'student', status: 'Warning' });
  await getFacultyActivityApi({ cls: '4', signins: true, page: 2 });
  await getSecretaryActivityApi({ q: 'import' });
  assert.match(urls[0], /\/admin\/audit-logs\?role=student&status=Warning$/);
  assert.match(urls[1], /\/faculty\/activity\?cls=4&signins=1&page=2$/);
  assert.match(urls[2], /\/secretary\/activity\?q=import$/);
  assert.ok(urls.every(u => !u.includes('limit')));
});

test('Manila time is used whatever the browser zone', () => {
  assert.equal(formatManilaWhen('2026-10-17T10:16:00+08:00'), 'Oct 17, 2026 · 10:16 AM');
  // 23:30 UTC on Oct 16 is already Oct 17 morning in Manila
  assert.equal(formatManilaWhen('2026-10-16T23:30:00Z'), 'Oct 17, 2026 · 7:30 AM');
});

test('day headers read Today, Yesterday, then the date', () => {
  const now = new Date('2026-10-17T12:00:00+08:00');
  assert.equal(manilaDayLabel('2026-10-17', now), 'Today');
  assert.equal(manilaDayLabel('2026-10-16', now), 'Yesterday');
  assert.equal(manilaDayLabel('2026-10-15', now), 'Oct 15');
  assert.equal(manilaDayLabel('2025-12-30', now), 'Dec 30, 2025');
  const groups = groupByDay([
    entry({ id: 'a', occurredAt: '2026-10-17T10:00:00+08:00' }),
    entry({ id: 'b', occurredAt: '2026-10-17T08:00:00+08:00' }),
    entry({ id: 'c', occurredAt: '2026-10-16T09:00:00+08:00' }),
    entry({ id: 'd', occurredAt: '2026-10-15T09:00:00+08:00' }),
  ], now);
  assert.deepEqual(groups.map(g => [g.label, g.entries.map(e => e.id)]), [['Today', ['a', 'b']], ['Yesterday', ['c']], ['Oct 15', ['d']]]);
});

test('date presets resolve to Manila days and This term needs a current term', () => {
  const now = new Date('2026-10-17T12:00:00+08:00');
  assert.deepEqual(auditDateRange('today', { from: '', to: '' }, null, now), { from: '2026-10-17', to: '2026-10-17' });
  assert.deepEqual(auditDateRange('7', { from: '', to: '' }, null, now), { from: '2026-10-11', to: '2026-10-17' });
  assert.deepEqual(auditDateRange('term', { from: '', to: '' }, null, now), { from: '', to: '' });
  assert.deepEqual(auditDateRange('custom', { from: '2026-10-01', to: '' }, null, now), { from: '2026-10-01', to: '' });
  const terms = [{ startDate: '2026-06-01', endDate: '2026-09-30' }, { startDate: '2026-10-01', endDate: '2027-02-28' }];
  assert.equal(currentTerm(terms, now), terms[1]);
  assert.equal(currentTerm([terms[0]], now), null);
});

test('export expands a batch to one line per member and keeps the text as it is', () => {
  const batch = entry({
    what: 'Imported students', record: '40 students', change: '40 added',
    batch: { count: 2, members: [{ record: '=HYPERLINK("x")', change: 'added' }, { record: 'Maria Cruz', change: 'added' }] },
  });
  const rows = auditCsvRows([entry({}), batch]);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], ['Oct 17, 2026 · 10:16 AM', 'Dr. Ana Reyes · Faculty', 'Changed scores', 'Quiz 2 (Midterm) · DENT 101-A', '3 scores changed', 'Success']);
  assert.deepEqual(rows[2].slice(3, 5), ['Maria Cruz', 'added']);
  assert.deepEqual(AUDIT_EXPORT_HEADER, ['When', 'Who', 'What', 'Record', 'Change', 'Status']);
  assert.equal(auditCsvRows([batch])[0][3], '=HYPERLINK("x")');
});

test('system and unknown-account rows keep their text in the export', () => {
  const rows = auditCsvRows([entry({ who: null, whoText: 'Unknown account (typed: x@y)', change: '—' })]);
  assert.equal(rows[0][1], 'Unknown account (typed: x@y)');
  assert.equal(rows[0][4], '—');
});
