import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiFieldErrors } from '../utils/apiFieldErrors.ts';

// Backlog 8.1: form limits match the server, and server field errors show under the field.
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');

test('apiFieldErrors reads the list and map error shapes and ignores everything else', () => {
  const apiError = (errors?: unknown) => Object.assign(new Error('x'), { status: 422, errors });
  assert.deepEqual(apiFieldErrors(apiError([{ field: 'reason', message: 'Too long' }])), { reason: 'Too long' });
  assert.deepEqual(apiFieldErrors(apiError({ studentId: 'Too short' })), { studentId: 'Too short' });
  assert.deepEqual(apiFieldErrors(apiError()), {});
  assert.deepEqual(apiFieldErrors(new Error('plain')), {});
});

test('assessment title is limited to 255 characters', () => {
  assert.match(read('pages/faculty/GradeComputation.tsx'), /id="assessment-title"[\s\S]{0,300}?maxLength=\{255\}/);
});

test('Add Student: Student Number 3-50 characters, server errors under the fields', () => {
  const src = read('pages/faculty/ClassesAndRosters.tsx');
  assert.match(src, /id="add-student-id"[\s\S]{0,300}?minLength=\{3\}\s+maxLength=\{50\}/);
  assert.match(src, /serverFieldError\(addStudentFieldErrors, 'studentId'/);
  assert.match(src, /setAddStudentFieldErrors\(apiFieldErrors\(err\)\)/);
  for (const key of ['firstName', 'middleName', 'lastName', 'email', 'yearLevel']) {
    assert.ok(src.includes(`serverFieldError(addStudentFieldErrors, '${key}'`));
    assert.ok(src.includes(`serverFieldError(editStudentFieldErrors, '${key}'`));
  }
  assert.match(src, /setEditStudentFieldErrors\(apiFieldErrors\(error\)\)/);
});

test('Create Class: course code and section/block stop at 50 characters', () => {
  const src = read('pages/faculty/ClassesAndRosters.tsx');
  assert.match(src, /id="create-code"[\s\S]{0,300}?maxLength=\{50\}/);
  assert.match(src, /id="create-block"[\s\S]{0,300}?maxLength=\{50\}/);
});

test('Faculty correction reason: 500 characters, counter and inline server error', () => {
  const src = read('pages/faculty/AttendanceMonitoring.tsx');
  assert.match(src, /value=\{correctionReason\}[\s\S]{0,300}?maxLength=\{500\}/);
  assert.match(src, /\{correctionReason\.length\}\/500/);
  assert.match(src, /apiFieldErrors\(err\)\.reason/);
  assert.match(src, /id="err-correction-reason"/);
});

test('Secretary reason and Admin revoke reason show the server field error inline', () => {
  const secretary = read('pages/secretary/AttendanceList.tsx');
  assert.match(secretary, /apiFieldErrors\(err\)\.reason/);
  assert.match(secretary, /id="err-override-reason"/);
  assert.match(read('pages/admin/SystemAudit.tsx'), /setRevokeError\(apiFieldErrors\(err\)\.reason \?\?/);
});

test('Form inputs carry the server limits: auth, faculty invitation, roster import, edit class', () => {
  assert.match(read('pages/auth/ForgotPassword.tsx'), /inputMode="email" maxLength=\{254\}/);
  assert.match(read('pages/auth/SsoLogin.tsx'), /id="login-email" maxLength=\{254\}/);
  assert.match(read('pages/auth/MfaVerify.tsx'), /maxLength=\{mode === 'totp' \? 6 : 39\}/);
  const invitation = read('pages/admin/FacultyInvitation.tsx');
  assert.match(invitation, /id="admin-faculty-create-first" maxLength=\{100\}/);
  assert.match(invitation, /id="admin-faculty-create-middle" maxLength=\{100\}/);
  assert.match(invitation, /id="admin-faculty-create-last" maxLength=\{100\}/);
  assert.match(invitation, /id="admin-faculty-create-suffix" maxLength=\{50\}/);
  assert.match(invitation, /id="admin-faculty-create-email" maxLength=\{254\}/);
  assert.match(invitation, /maxLength=\{100\} value=\{editFirstName\}/);
  assert.match(invitation, /maxLength=\{100\} value=\{editMiddleName\}/);
  assert.match(invitation, /maxLength=\{100\} value=\{editLastName\}/);
  assert.match(invitation, /maxLength=\{50\} value=\{editSuffix\}/);
  assert.match(invitation, /maxLength=\{254\} value=\{editEmail\}/);
  const roster = read('components/RosterImportModal.tsx');
  for (const pattern of [
    /maxLength=\{50\} value=\{draft\.code\}/,
    /maxLength=\{255\} value=\{draft\.title\}/,
    /maxLength=\{50\} value=\{draft\.section\}/,
    /maxLength=\{100\} value=\{meeting\.room\}/,
    /minLength=\{3\} maxLength=\{50\} value=\{st\.studentId\}/,
    /maxLength=\{100\} value=\{st\.firstName\}/,
    /maxLength=\{100\} value=\{st\.lastName\}/,
    /maxLength=\{100\} value=\{st\.middleName/,
    /maxLength=\{50\} value=\{st\.prefix/,
    /maxLength=\{50\} value=\{st\.suffix/,
    /maxLength=\{254\} value=\{st\.email\}/,
  ]) assert.match(roster, pattern);
  const classes = read('pages/faculty/ClassesAndRosters.tsx');
  assert.match(classes, /list="course-catalog-codes-edit" maxLength=\{50\}/);
  assert.match(classes, /maxLength=\{50\} value=\{editBlock\}/);
});
