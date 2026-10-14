import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { filterEmailActions, recipientsLabel, summarizeStatuses, type EmailAction } from '../components/email/emailHistory.ts';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const read = (relative: string) => fs.readFileSync(path.join(currentDirectory, relative), 'utf8');

const actions: EmailAction[] = [
  {
    id: 'a1', type: 'At-Risk Notification', sentAt: '2026-10-14 01:00:00', recipients: [
      { name: 'Ana Student', email: 'ana@bicol-u.edu.ph', status: 'Sent' },
      { name: 'Ben Student', email: 'ben@bicol-u.edu.ph', status: 'Failed', failureReason: 'SMTP delivery failed or is not configured.' },
      { name: 'Cara Student', email: 'cara@bicol-u.edu.ph', status: 'Sent' },
      { name: 'Dan Student', email: 'dan@bicol-u.edu.ph', status: 'Suppressed' },
    ],
  },
  {
    id: 'mail-9', type: 'Student Invitation', sentAt: '2026-10-13 01:00:00',
    recipients: [{ name: 'Eve Student', email: 'eve@bicol-u.edu.ph', status: 'Pending' }],
  },
];

test('summarizeStatuses counts each status in a stable order and omits empty ones', () => {
  assert.deepEqual(summarizeStatuses(actions[0].recipients), [
    { status: 'Sent', count: 2 },
    { status: 'Failed', count: 1 },
    { status: 'Suppressed', count: 1 },
  ]);
});

test('recipientsLabel shows the name for one recipient and a count otherwise', () => {
  assert.equal(recipientsLabel(actions[1].recipients), 'Eve Student');
  assert.equal(recipientsLabel(actions[0].recipients), '4 recipients');
});

test('search matches the category and any recipient name or email inside an action', () => {
  assert.deepEqual(filterEmailActions(actions, 'cara@', 'all').map((a) => a.id), ['a1']);
  assert.deepEqual(filterEmailActions(actions, 'eve student', 'all').map((a) => a.id), ['mail-9']);
  assert.deepEqual(filterEmailActions(actions, 'student invitation', 'all').map((a) => a.id), ['mail-9']);
  assert.deepEqual(filterEmailActions(actions, '', 'At-Risk Notification').map((a) => a.id), ['a1']);
  assert.deepEqual(filterEmailActions(actions, 'nobody', 'all'), []);
});

test('Email History table has no Subject column, an accessible toggle and a Dean card without the category filter', () => {
  const table = read('../components/email/EmailHistoryTable.tsx');
  assert.doesNotMatch(table, /<th[^>]*>Subject/);
  assert.match(table, /aria-expanded=\{expanded\}/);
  assert.match(table, /Search recipient or email type\.\.\./);
  assert.match(table, /No email records match your filters\./);
  const dean = read('../pages/admin/FacultyInvitation.tsx');
  assert.match(dean, /<span>Email history<\/span>/);
  assert.match(dean, /Invitation emails you sent\. View-only\./);
  assert.match(dean, /<EmailHistoryTable actions=\{emailActions\} search=\{emailSearch\} onSearch=\{setEmailSearch\} \/>/);
  const faculty = read('../pages/faculty/EmailManagement.tsx');
  assert.match(faculty, /Email History Log \(\{logs\.length\}\)/);
  assert.match(faculty, /Email Dispatch History \(\{logs\.length\}\)/);
});
