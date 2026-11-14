import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const page = fs.readFileSync(path.join(here, '../pages/admin/FacultyInvitation.tsx'), 'utf8');

test('4.3 View is the first row action, before Edit, Revoke and Reissue', () => {
  const actions = /const invitationActions = [\s\S]*?\n  \);/.exec(page)?.[0] ?? '';
  assert.ok(actions.length > 0);
  const order = ['View invitation for', 'Edit invitation for', 'Revoke invitation for', 'Reissue invitation for'].map((label) => actions.indexOf(label));
  assert.ok(order.every((i) => i >= 0));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.match(actions, /<Eye /);
});

test('4.3 Invitation Details dialog is read-only and renders no token or link', () => {
  const dialog = /title="Invitation Details"[\s\S]*?\{\/\* Revoke Confirmation Modal \*\/\}/.exec(page)?.[0] ?? '';
  assert.ok(dialog.length > 0);
  assert.doesNotMatch(dialog, /token|link|url|<input|<textarea|<form/i);
  assert.match(dialog, /EmailHistoryTable/);
});
