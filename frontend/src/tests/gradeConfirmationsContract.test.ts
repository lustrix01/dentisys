import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { importConfirmMessage, type GradeSheetImportPlan } from '../utils/gradeSheetImport.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const page = fs.readFileSync(path.join(here, '../pages/faculty/GradeComputation.tsx'), 'utf8');
const panel = fs.readFileSync(path.join(here, '../components/GradeSheetImportPanel.tsx'), 'utf8');

test('5.2 manual Save asks to remove saved scores only when clears are pending', () => {
  for (const name of ['handleManualSaveScores', 'handleSaveMatrixScores']) {
    const body = new RegExp(String.raw`const ${name} = async \(\) => \{[\s\S]*?\n  \};`).exec(page)?.[0] ?? '';
    assert.ok(body.length > 0, name);
    const ask = body.indexOf('requestConfirmation(');
    assert.ok(ask > 0 && ask < body.indexOf('performSave'), `${name} asks before saving`);
    assert.match(body, /PendingClears\.size > 0/);
    assert.match(body, /'Remove Saved Scores', 'Remove and save'\)\) return;/);
  }
  // Auto-save paths never ask.
  assert.doesNotMatch(/const scheduleSingleAutoSave[\s\S]*?\n  \};/.exec(page)?.[0] ?? '', /requestConfirmation/);
});

test('5.2 import asks once with a summary before writing', () => {
  const body = /const doImport = async \(\) => \{[\s\S]*?\n  \};/.exec(panel)?.[0] ?? '';
  assert.ok(body.indexOf("'Import Grade Sheet', 'Import'") > 0);
  assert.ok(body.indexOf('requestConfirmation(') < body.indexOf('onImport(plan)'));
  const plan: GradeSheetImportPlan = {
    classId: 'c', removeAssessmentIds: [],
    items: [{ action: 'create' }, { action: 'link' }] as GradeSheetImportPlan['items'],
    scores: [{}, {}, {}] as GradeSheetImportPlan['scores'],
  };
  assert.equal(importConfirmMessage(plan), 'Import 3 scores into 2 assessments (1 new)?');
  assert.match(importConfirmMessage({ ...plan, removeAssessmentIds: ['a'] }), /1 assessment and their saved scores will be removed/);
});

test('5.2 no prompt on tab or view switch; leaving the page asks only when unsaved work exists', () => {
  assert.match(page, /onChange=\{setActiveSubTab\}/);
  assert.match(page, /onChange=\{setScoreEntryMode\}/);
  assert.match(page, /unsavedWorkRef\.current = isDirty \|\| hasUnsavedSingleScores\(\)/);
  assert.match(page, /!unsavedWorkRef\.current \|\| link\.target/);
  assert.match(page, /if \(!weightsDirtyRef\.current && !singleDirtyRef\.current/);
});
