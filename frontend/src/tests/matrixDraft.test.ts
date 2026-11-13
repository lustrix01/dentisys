import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  clearAllMatrixDrafts,
  clearMatrixDraft,
  matrixDraftCellKey,
  matrixDraftKey,
  matrixDraftRestoreCells,
  pruneSavedMatrixDraft,
  readMatrixDraft,
  setMatrixDraftCell,
} from '../utils/matrixDraft.ts';

const store = new Map<string, string>();
Object.defineProperty(globalThis, 'sessionStorage', {
  configurable: true,
  value: {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  },
});
// Object.keys(sessionStorage) must list the stored keys, as in a browser.
const fakeSession = globalThis.sessionStorage as unknown as Record<string, unknown>;
Object.defineProperty(globalThis, 'sessionStorage', {
  configurable: true,
  value: new Proxy(fakeSession, { ownKeys: () => [...store.keys()], getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }) }),
});

const KEY = matrixDraftKey(7, 'class-1');
const cell = matrixDraftCellKey('a1', 's1');

test('a pending edit is mirrored into the draft and removed once the server confirms it', () => {
  store.clear();
  setMatrixDraftCell(KEY, cell, '18');
  assert.equal(JSON.parse(store.get(KEY)!).cells[cell], '18');
  assert.ok(!Number.isNaN(Date.parse(JSON.parse(store.get(KEY)!).savedAt)));
  pruneSavedMatrixDraft(KEY, { [cell]: '17' }); // server still holds another score: stays
  assert.deepEqual(readMatrixDraft(KEY), { [cell]: '18' });
  pruneSavedMatrixDraft(KEY, { [cell]: '18.0' }); // confirmed saved
  assert.equal(store.has(KEY), false);
});

test('explicit logout clears every matrix draft; forced sign-out paths do not', () => {
  store.clear();
  setMatrixDraftCell(KEY, cell, '5');
  setMatrixDraftCell(matrixDraftKey(7, 'class-2'), cell, '6');
  store.set('other_key', 'x');
  clearAllMatrixDrafts();
  assert.deepEqual([...store.keys()], ['other_key']);

  const source = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../context/AuthContext.tsx'), 'utf8');
  const logoutBody = source.slice(source.indexOf('const logout = useCallback'), source.indexOf('}, [forceLogout]);'));
  assert.match(logoutBody, /clearAllMatrixDrafts\(\)/);
  assert.equal((source.match(/clearAllMatrixDrafts\(\)/g) ?? []).length, 1);
  assert.doesNotMatch(source.slice(source.indexOf('const forceLogout'), source.indexOf('const logout = useCallback')), /clearAllMatrixDrafts/);
  assert.equal((source.match(/void forceLogout\(\)/g) ?? []).length, 3);
  assert.doesNotMatch(source, /void logout\(\)/);
});

test('restore offer counts only differing cells and skips unknown assessments and students', () => {
  const scores = { s1: { a1: '10', a2: '' }, s2: { a1: '8', a2: '9' } };
  const draft = {
    [matrixDraftCellKey('a1', 's1')]: '12', // differs
    [matrixDraftCellKey('a2', 's1')]: '7', // differs from empty
    [matrixDraftCellKey('a1', 's2')]: '8.0', // same as saved
    [matrixDraftCellKey('gone', 's2')]: '3', // assessment removed
    [matrixDraftCellKey('a1', 'left')]: '3', // student removed
  };
  const cells = matrixDraftRestoreCells(draft, scores, ['a1', 'a2']);
  assert.deepEqual(cells.map(c => `${c.assessmentId}|${c.studentId}|${c.value}`).sort(), ['a1|s1|12', 'a2|s1|7']);
});

test('Discard clears the class draft only, and drafts of another user use another key', () => {
  store.clear();
  setMatrixDraftCell(KEY, cell, '5');
  setMatrixDraftCell(matrixDraftKey(7, 'class-2'), cell, '6');
  setMatrixDraftCell(matrixDraftKey(8, 'class-1'), cell, '9');
  assert.deepEqual(readMatrixDraft(matrixDraftKey(8, 'class-1')), { [cell]: '9' });
  clearMatrixDraft(KEY);
  assert.equal(store.has(KEY), false);
  assert.equal(store.size, 2);
  assert.deepEqual(readMatrixDraft(KEY), {});
});

test('the matrix shows the banner wording and routes Restore through onScoreChange', () => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const source = fs.readFileSync(path.join(dir, '../components/GradebookMatrix.tsx'), 'utf8');
  assert.match(source, /unsaved \{draftOffer\.length === 1 \? 'score' : 'scores'\} from your last session \{draftOffer\.length === 1 \? 'was' : 'were'\} kept in this tab\./);
  assert.match(source, /onScoreChange\(cell\.studentId, cell\.assessmentId, cell\.value\)/);
  const page = fs.readFileSync(path.join(dir, '../pages/faculty/GradeComputation.tsx'), 'utf8');
  assert.match(page, /draftUserId=\{user\?\.user_id\}/);
});
