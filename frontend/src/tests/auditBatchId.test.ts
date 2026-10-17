import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createStudentApi,
  enrollStudentsInClassApi,
  createStudentInvitation,
  inviteSecretaryApi,
  recordFacultyInitialAttendanceApi,
} from '../services/apiClient.ts';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function stub(): Array<Record<string, string>> {
  const seen: Array<Record<string, string>> = [];
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    seen.push(init?.headers as Record<string, string>);
    return new Response(JSON.stringify({ status: 'success' }), { status: 200 });
  }) as typeof fetch;
  return seen;
}

test('X-Audit-Batch-Id is sent only when an id is given', async () => {
  const seen = stub();
  const id = 'b1b1b1b1-0000-4000-8000-000000000001';
  await createStudentApi({ studentId: 'a', firstName: 'a', lastName: 'a' }, id);
  await enrollStudentsInClassApi({ csId: 1, studentIds: [1] }, id);
  await recordFacultyInitialAttendanceApi({} as never, id);
  await createStudentInvitation({ studentId: '1', classId: '1', emailActionId: id });
  await inviteSecretaryApi({ student_name: 'a', cs_id: 1, email: 'a@b.c', emailActionId: id });
  assert.equal(seen.length, 5);
  for (const h of seen) assert.equal(h['X-Audit-Batch-Id'], id);

  const none = stub();
  await createStudentApi({ studentId: 'a', firstName: 'a', lastName: 'a' });
  await enrollStudentsInClassApi({ csId: 1, studentIds: [1] });
  await recordFacultyInitialAttendanceApi({} as never);
  await createStudentInvitation({ studentId: '1', classId: '1' });
  for (const h of none) assert.equal('X-Audit-Batch-Id' in h, false);
});

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('bulk loops create one id per click and pass it to every request', () => {
  const roster = src('components/RosterImportModal.tsx');
  assert.equal(roster.match(/crypto\.randomUUID\(\)/g)?.length, 1);
  assert.equal(roster.match(/\}, auditBatchId\)/g)?.length, 3);

  const attendance = src('pages/faculty/AttendanceMonitoring.tsx');
  const bulk = attendance.slice(attendance.indexOf('const handleBulkMarkPresent'), attendance.indexOf('const handleCorrectionSubmit'));
  assert.equal(bulk.match(/crypto\.randomUUID\(\)/g)?.length, 1);
  assert.match(bulk, /\}, auditBatchId\);/);

  const invite = src('pages/faculty/ClassesAndRosters.tsx');
  assert.match(invite, /createStudentInvitation\(\{ studentId: student\.id, classId, emailActionId \}\)/);
  const email = src('pages/faculty/EmailManagement.tsx');
  assert.match(email, /createStudentInvitation\(\{ studentId: student\.id, classId, emailActionId \}\)/);
  assert.match(email, /emailActionId,\s/);
});
