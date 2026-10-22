import test from 'node:test';
import assert from 'node:assert/strict';
import { buildImportGroups, hasSelectable, keepSelection, importTemplateFileName } from '../utils/importDestination.ts';

const cat = (name: string, weight: number, sortOrder: number, extra: object = {}) => ({ name, weight, sortOrder, ...extra });
const combined: any = {
  schemaMode: 'periods', componentMode: 'combined',
  categories: [],
  midtermCategories: [cat('Quiz', 30, 2), cat('Exam', 60, 1), cat('Attendance', 10, 3, { sourceKind: 'attendance' })],
  finalCategories: [cat('Exam', 100, 1)],
};
const lectureLab: any = {
  schemaMode: 'periods', componentMode: 'lecture_laboratory', componentWeights: { lecture: 60, laboratory: 40 }, categories: [],
  midtermCategories: [
    cat('Exercises', 50, 2, { component: 'Laboratory' }), cat('Quiz', 30, 1, { component: 'Lecture' }),
    cat('Exercises', 20, 3, { component: 'Lecture' }),
  ],
  finalCategories: [cat('Exercises', 100, 1, { component: 'Laboratory' }), cat('Attendance', 10, 2, { component: 'Lecture', sourceKind: 'attendance' })],
};

test('combined list: sorted, weights, disabled attendance', () => {
  const g = buildImportGroups(combined, 'Midterm');
  assert.equal(g.length, 1);
  assert.equal(g[0].label, null);
  assert.deepEqual(g[0].options.map(o => o.label), ['Exam (60%)', 'Quiz (30%)', 'Attendance (10%) · from attendance records']);
  assert.deepEqual(g[0].options.map(o => o.disabled), [false, false, true]);
});

test('lecture/laboratory groups carry component weights', () => {
  const g = buildImportGroups(lectureLab, 'Midterm');
  assert.deepEqual(g.map(x => x.label), ['Lecture (60%)', 'Laboratory (40%)']);
  assert.deepEqual(g[0].options.map(o => o.label), ['Quiz (30%)', 'Exercises (20%)']);
  assert.deepEqual(g[1].options.map(o => o.label), ['Exercises (50%)']);
});

test('selection kept for same name and component, cleared otherwise', () => {
  const fin = buildImportGroups(combined, 'Final');
  assert.equal(keepSelection(fin, '|Exam'), '|Exam');
  assert.equal(keepSelection(fin, '|Quiz'), '');
  const labFinal = buildImportGroups(lectureLab, 'Final');
  assert.equal(keepSelection(labFinal, 'Laboratory|Exercises'), 'Laboratory|Exercises');
  assert.equal(keepSelection(labFinal, 'Lecture|Exercises'), '');
  assert.equal(keepSelection(labFinal, 'Lecture|Attendance'), '');
});

test('empty and attendance-only periods have nothing selectable', () => {
  const cfg: any = { ...combined, finalCategories: [] };
  assert.equal(hasSelectable(buildImportGroups(cfg, 'Final')), false);
  assert.equal(hasSelectable(buildImportGroups(combined, 'Midterm')), true);
  const att: any = { ...combined, finalCategories: [cat('Attendance', 10, 1, { sourceKind: 'attendance' })] };
  assert.equal(hasSelectable(buildImportGroups(att, 'Final')), false);
});

test('single-list config ignores the period and uses categories', () => {
  const cfg: any = { schemaMode: 'overall', categories: [cat('B', 40, 2), cat('A', 60, 1)] };
  const g = buildImportGroups(cfg, 'Final');
  assert.deepEqual(g[0].options.map(o => o.label), ['A (60%)', 'B (40%)']);
});

test('template file names', () => {
  assert.equal(importTemplateFileName('DENT101', 'Midterm', '', false), 'DENT101_Midterm_Score_Template.csv');
  assert.equal(importTemplateFileName('DENT101', 'Midterm', '|Quiz', false), 'DENT101_Midterm_Quiz_Score_Template.csv');
  assert.equal(importTemplateFileName('CLIN401', 'Midterm', 'Laboratory|Laboratory Exercises', true),
    'CLIN401_Midterm_Laboratory_Laboratory_Exercises_Score_Template.csv');
  assert.equal(importTemplateFileName('CLIN401', null, '|Long Exam', false), 'CLIN401_Long_Exam_Score_Template.csv');
});
