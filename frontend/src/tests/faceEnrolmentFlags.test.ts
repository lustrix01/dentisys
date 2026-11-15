import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FLAG_KIND_LABEL, flagActions, flagClasses, flagClosedLine, flagDetails } from '../pages/admin/faceFlagHelpers.ts';
import type { FaceFlag } from '../services/apiClient.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p: string) => fs.readFileSync(path.join(here, p), 'utf8');
const base: FaceFlag = {
  flagId: 1, kind: 'F1', status: 'open', student: { studentId: 7, userId: 9, name: 'Juan Dela Cruz', studentNo: '2024-0001' },
  classes: [{ csId: 1, label: 'CLIN401-A', current: true }, { csId: 2, label: 'OLD101-B', current: false }],
  detail: { withdrawnAt: '2026-10-02T09:00:00+08:00', enrolledAt: '2026-10-05T10:00:00+08:00' },
  createdAt: '2026-10-05T10:00:00+08:00', updatedAt: '2026-10-05T10:00:00+08:00', closedAt: null, closedBy: null, closedNote: null,
};

test('flag labels and details text', () => {
  assert.equal(FLAG_KIND_LABEL.F1, 'Re-enrolled after withdrawing');
  assert.equal(FLAG_KIND_LABEL.F2, 'New face does not match');
  assert.equal(flagDetails(base), 'Withdrew Oct 2, enrolled again Oct 5');
  assert.equal(flagDetails({ ...base, kind: 'F2', detail: { enrolledAt: '2026-10-05T10:00:00+08:00' } }), 'Updated face on Oct 5');
});

test('classes show this school year only', () => {
  assert.equal(flagClasses(base), 'CLIN401-A');
  assert.equal(flagClasses({ ...base, classes: [] }), 'None');
});

test('row actions: open flags get all three, closed flags only Open in People & Accounts', () => {
  assert.deepEqual(flagActions(base), ['dismiss', 'revoke-face', 'open-people']);
  assert.deepEqual(flagActions({ ...base, status: 'dismissed' }), ['open-people']);
  assert.deepEqual(flagActions({ ...base, status: 'revoked' }), ['open-people']);
});

test('closed flags show who closed them and the note', () => {
  assert.equal(flagClosedLine(base), '');
  assert.equal(flagClosedLine({ ...base, status: 'dismissed', closedBy: { name: 'Dean Rosa' }, closedNote: 'New phone, saw him in person' }), 'by Dean Rosa: New phone, saw him in person');
});

test('page wiring: route, sidebar, overview tile, Update my face', () => {
  assert.match(read('../App.tsx'), /\/superadmin\/face-flags/);
  assert.match(read('../components/Layout.tsx'), /Face Enrolment Flags/);
  assert.match(read('../pages/admin/SuperadminOverview.tsx'), /Face enrolment flags/);
  const reg = read('../pages/student/FaceRegistration.tsx');
  assert.match(reg, /Update my face/);
  assert.doesNotMatch(reg, /Semester Expiration|Expires seasonally|revoke this registration first/);
});
