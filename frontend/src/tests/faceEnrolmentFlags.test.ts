import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FLAG_KIND_LABEL,
  FLAG_STATUS_LABEL,
  REVOKE_STATUS_LABEL,
  flagActions,
  flagClasses,
  flagClosedLine,
  flagDetails,
  requestClasses,
  requestReviewedLine,
  revokeRequestActions,
} from '../pages/admin/faceFlagHelpers.ts';
import type { FaceFlag, FaceRevokeRequest } from '../services/apiClient.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p: string) => fs.readFileSync(path.join(here, p), 'utf8');
const baseFlag: FaceFlag = {
  flagId: 1,
  kind: 'F1',
  status: 'open',
  student: { studentId: 7, userId: 9, name: 'Juan Dela Cruz', studentNo: '2024-0001' },
  classes: [{ csId: 1, label: 'CLIN401-A', current: true }, { csId: 2, label: 'OLD101-B', current: false }],
  detail: { withdrawnAt: '2026-10-02T09:00:00+08:00', enrolledAt: '2026-10-05T10:00:00+08:00' },
  createdAt: '2026-10-05T10:00:00+08:00',
  updatedAt: '2026-10-05T10:00:00+08:00',
  closedAt: null,
  closedBy: null,
  closedNote: null,
};

const baseRequest: FaceRevokeRequest = {
  requestId: 11,
  status: 'pending',
  reason: 'Changed my phone and want to re-register.',
  reviewNote: null,
  schoolYear: '2026-2027',
  semester: '1ST',
  createdAt: '2026-10-05T10:00:00+08:00',
  reviewedAt: null,
  cancelledAt: null,
  reviewedBy: null,
  student: { studentId: 7, userId: 9, name: 'Juan Dela Cruz', studentNo: '2024-0001' },
  classes: [{ csId: 1, label: 'CLIN401-A', current: true }, { csId: 2, label: 'OLD101-B', current: false }],
  approvedThisTermCount: 2,
};

test('flag labels and details text for F1, F2, and F3', () => {
  assert.equal(FLAG_KIND_LABEL.F1, 'Re-enrolled after withdrawing');
  assert.equal(FLAG_KIND_LABEL.F2, 'Blocked mismatched face update');
  assert.equal(FLAG_KIND_LABEL.F3, 'Repeated approved revocations');
  assert.equal(FLAG_STATUS_LABEL.revoked, 'Revoked');
  assert.equal(flagDetails(baseFlag), 'Withdrew Oct 2, enrolled again Oct 5');
  assert.equal(
    flagDetails({ ...baseFlag, kind: 'F2', detail: { attemptedAt: '2026-10-05T10:00:00+08:00' } }),
    'Blocked mismatched update on Oct 5',
  );
  assert.equal(
    flagDetails({ ...baseFlag, kind: 'F2', detail: { enrolledAt: '2026-10-05T10:00:00+08:00' } }),
    'Updated face on Oct 5',
  );
  assert.equal(
    flagDetails({
      ...baseFlag,
      kind: 'F3',
      detail: {
        approvedCount: 3,
        semester: '1ST',
        schoolYear: '2026-2027',
        latestApprovedAt: '2026-10-08T10:00:00+08:00',
      },
    }),
    '3 approved revocations (1st Semester, S.Y. 2026–2027), latest Oct 8',
  );
});

test('classes show this school year only for flags and revoke requests', () => {
  assert.equal(flagClasses(baseFlag), 'CLIN401-A');
  assert.equal(flagClasses({ ...baseFlag, classes: [] }), 'None');
  assert.equal(requestClasses(baseRequest), 'CLIN401-A');
  assert.equal(requestClasses({ ...baseRequest, classes: [] }), 'None');
});

test('row actions for flags and revoke requests', () => {
  assert.deepEqual(flagActions(baseFlag), ['dismiss', 'revoke-face', 'open-people']);
  assert.deepEqual(flagActions({ ...baseFlag, status: 'dismissed' }), ['open-people']);
  assert.deepEqual(flagActions({ ...baseFlag, status: 'revoked' }), ['open-people']);

  assert.equal(REVOKE_STATUS_LABEL.pending, 'Pending');
  assert.deepEqual(revokeRequestActions(baseRequest), ['approve', 'reject', 'open-people']);
  assert.deepEqual(revokeRequestActions({ ...baseRequest, status: 'approved' }), ['open-people']);
  assert.deepEqual(revokeRequestActions({ ...baseRequest, status: 'rejected' }), ['open-people']);
  assert.deepEqual(revokeRequestActions({ ...baseRequest, status: 'cancelled' }), ['open-people']);
});

test('closed flags and reviewed/cancelled requests show actor and note', () => {
  assert.equal(flagClosedLine(baseFlag), '');
  assert.equal(
    flagClosedLine({ ...baseFlag, status: 'dismissed', closedBy: { name: 'Sam Superadmin' }, closedNote: 'New phone, saw him in person' }),
    'by Sam Superadmin: New phone, saw him in person',
  );

  assert.equal(requestReviewedLine(baseRequest), '');
  assert.equal(
    requestReviewedLine({ ...baseRequest, status: 'rejected', reviewedBy: { name: 'Sam Superadmin' }, reviewNote: 'Verify ID at clinic first' }),
    'by Sam Superadmin: Verify ID at clinic first',
  );
  assert.equal(
    requestReviewedLine({ ...baseRequest, status: 'cancelled', reviewNote: 'Direct Superadmin revoke' }),
    'Direct Superadmin revoke',
  );
});

test('page wiring: Face Enrolments route + redirect, sidebar, Overview tile & attentionRows, FaceRegistration 12.9', () => {
  const app = read('../App.tsx');
  assert.match(app, /path="\/superadmin\/face-enrolments" element=\{<FaceEnrolmentFlags \/>\}/);
  assert.match(app, /path="\/superadmin\/face-flags" element=\{<Navigate to="\/superadmin\/face-enrolments" replace \/>\}/);
  assert.match(read('../components/Layout.tsx'), /name: 'Face Enrolments', path: '\/superadmin\/face-enrolments', icon: ScanFace, short: 'Faces'/);

  const overview = read('../pages/admin/SuperadminOverview.tsx');
  assert.match(overview, /label: 'Face Enrolments'/);
  assert.match(overview, /to: '\/superadmin\/face-enrolments'/);
  assert.match(overview, /faceRevokeRequestsPending/);
  assert.match(overview, /Face revocation request awaiting review/);

  const page = read('../pages/admin/FaceEnrolmentFlags.tsx');
  assert.match(page, /<Tabs[\s\S]{0,120}variant="section"/);
  assert.match(page, /label: 'Revoke Requests'/);
  assert.match(page, /label: 'Flags'/);
  assert.match(page, /Approve & delete face/);

  const reg = read('../pages/student/FaceRegistration.tsx');
  assert.match(reg, /Update my face/);
  assert.match(reg, /Request revocation/);
  assert.match(reg, /Cancel request/);
  assert.match(reg, /face_update_mismatch/);
  assert.match(reg, /Semester Expiration/);
});
