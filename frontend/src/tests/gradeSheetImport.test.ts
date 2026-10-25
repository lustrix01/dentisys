import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildNameIndex, matchStudentName,
  buildPlan, buildPreview, checkWorkbookFile, emptyDecisions, headerWarnings, isUsed, OUT, parseSheet, parseWorkbook,
  type Cell, type ImportContext, type SavedAssessment, type SavedCategory,
} from '../utils/gradeSheetImport.ts';

// Made-up sheet in the official layout (columns by letter, rows 1-based).
const colNo = (L: string) => [...L].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
function makeSheet(title: string, students: Array<[number | null, string | null, Record<string, Cell>]>): Cell[][] {
  const rows: Cell[][] = Array.from({ length: 9 + students.length }, () => []);
  const put = (r: number, L: string, v: Cell) => { rows[r - 1][colNo(L)] = v; };
  put(4, 'M', title); put(5, 'M', '2ND SEMESTER, AY 2025-2026');
  const head: Record<string, Cell> = {
    A: 'No.', B: 'Names', C: 'RECITATION', E: 0.1, F: 'OUTPUTS', J: 'TOTAL', K: 0.2, L: 'QUIZ 1', N: 'QUIZ 2', P: 'QUIZ 3',
    R: 'QUIZ AVE.', T: 0.2, U: 'MAJOR EXAM', W: 0.5, X: 'MIDTERM GRADE', Y: 'EQUIV.', Z: 'Midterm 30%',
    AA: 'RECITATION', AC: 0.1, AD: 'MAJOR EXAM', AF: 0.9, AG: 'FINAL GRADE',
  };
  for (const [L, v] of Object.entries(head)) put(7, L, v);
  // row 9: max points, with "%" in the next column
  const max: Record<string, [Cell, string]> = { F: [50, 'G'], H: [0, 'I'], L: [20, 'M'], N: [30, 'O'], P: [0, 'Q'], U: [75, 'V'], AD: [60, 'AE'] };
  for (const [L, [v, pct]] of Object.entries(max)) { put(9, L, v); put(9, pct, '%'); }
  students.forEach(([no, name, scores], i) => {
    put(10 + i, 'A', no); put(10 + i, 'B', name);
    for (const [L, v] of Object.entries(scores)) put(10 + i, L, v);
  });
  return rows;
}
// Score columns: C recitation, F outputs 1, L quiz 1, N quiz 2, U major exam, AA finals recitation, AD finals major exam.
const lecture = makeSheet('SAMPLE DENTISTRY 1 (LEC)', [
  [1, 'ALONZO, BEA S.', { C: 88, F: 34, L: 14, N: 20, U: 49, AA: 90, AD: 51, V: '#DIV/0!' }],
  [2, 'Cruz, Dana', { C: 75, F: 25, L: 18, N: 25, U: 80, AD: 'abc' }],
  [3, 'Reyes, Carlo Diaz', { C: 75, F: 25, L: 14, N: null, U: 55 }],
  [4, null, {}],
  [null, null, {}],
]);

test('file checks: type, size, password', () => {
  const zip = [0x50, 0x4b, 3, 4];
  assert.equal(checkWorkbookFile({ name: 'a.xlsx', size: 100 }, zip), null);
  assert.match(checkWorkbookFile({ name: 'a.xls', size: 100 }, zip)!, /\.xlsx/);
  assert.match(checkWorkbookFile({ name: 'a.csv', size: 100 }, zip)!, /Only \.xlsx/);
  assert.match(checkWorkbookFile({ name: 'a.xlsx', size: 11 * 1024 * 1024 }, zip)!, /10 MB/);
  assert.equal(checkWorkbookFile({ name: 'a.xlsx', size: 100 }, [0xd0, 0xcf, 0x11, 0xe0]), 'Remove the password in Excel, then upload again.');
});

test('parses items, names, halves, recitation as percent, max 0 skipped, weights, header', () => {
  const s = parseSheet('Sheet2', lecture, 0)!;
  assert.equal(s.component, 'Lecture');
  assert.equal(s.semester, '2ND');
  assert.equal(s.schoolYear, '2025-2026');
  const used = (p: string) => s.items.filter(i => i.period === p && isUsed(i)).map(i => `${i.title}/${i.maxScore}/${i.kind}`);
  assert.deepEqual(used('Midterm'), ['Recitation/100/percent', 'Outputs 1/50/points', 'Quiz 1/20/points', 'Quiz 2/30/points', 'Major Exam/75/points']);
  assert.deepEqual(used('Final'), ['Recitation/100/percent', 'Major Exam/60/points']);
  assert.ok(s.items.some(i => i.title === 'Outputs 2' && !isUsed(i)));
  assert.deepEqual(s.categories.filter(c => c.period === 'Midterm').map(c => `${c.name}=${c.weight}`), ['Recitation=10', 'Outputs=20', 'Quiz=20', 'Major Exam=50']);
  assert.equal(s.rows.length, 4); // stops at the first row with no number and no name
  const r1 = s.rows[0].cells;
  const key = (p: string, t: string) => s.items.find(i => i.period === p && i.title === t)!.key;
  assert.deepEqual(r1[key('Midterm', 'Recitation')], { kind: 'number', value: 88 });
  assert.deepEqual(r1[key('Final', 'Recitation')], { kind: 'number', value: 90 });
  assert.deepEqual(s.rows[1].cells[key('Final', 'Major Exam')], { kind: 'invalid', raw: 'abc' });
  assert.deepEqual(s.rows[2].cells[key('Midterm', 'Quiz 2')], { kind: 'blank' });
});

test('lab exercise naming, component fallbacks and summary sheets', () => {
  const rows: Cell[][] = Array.from({ length: 10 }, () => []);
  rows[3][12] = 'SAMPLE DENTISTRY 1';
  rows[6][2] = 'LAB EXERCISES'; rows[6][8] = 'TOTAL'; rows[6][9] = 0.3; rows[6][10] = 'MIDTERM GRADE';
  rows[8][2] = 20; rows[8][3] = '%'; rows[8][4] = 30; rows[8][5] = '%'; rows[8][6] = 0; rows[8][7] = '%';
  const s = parseSheet('dental', rows, 1)!;
  assert.equal(s.component, null);
  assert.deepEqual(s.items.filter(isUsed).map(i => i.title), ['Lab Exercise 1', 'Lab Exercise 2']);
  const summary: Cell[][] = [[], [], [], [3, null, 27, 18], []];
  assert.equal(parseSheet('TFG', summary, 2), null);
  assert.equal(parseWorkbook([{ sheet: 'a', data: lecture }, { sheet: 'TFG', data: summary }]).length, 1);
});

test('header check warns on semester, year and course', () => {
  const s = parseSheet('x', lecture, 0)!;
  assert.deepEqual(headerWarnings(s, { courseName: 'Sample Dentistry 1', semester: '2ND', schoolYear: '2025-2026' }), []);
  assert.equal(headerWarnings(s, { courseName: 'Other Course', semester: '1ST', schoolYear: '2026-2027' }).length, 3);
});

// ---------- preview and plan ----------
const cat = (id: number, name: string, weight: number, period: 'Midterm' | 'Final' = 'Midterm'): SavedCategory =>
  ({ id, name, weight, period, component: 'Lecture', attendance: false });
const asm = (id: string, title: string, maxScore: number, categoryId: number, period: 'Midterm' | 'Final' = 'Midterm'): SavedAssessment =>
  ({ id, title, maxScore, period, component: 'Lecture', categoryId, attendance: false });
const roster = [
  { id: 's1', name: 'Alonzo, Bea Santos', firstName: 'Bea Santos', lastName: 'Alonzo' },
  { id: 's2', name: 'Cruz, Dana Lim', firstName: 'Dana', middleName: 'Lim', lastName: 'Cruz' },
  { id: 's3', name: 'Cruz, Dana Reyes', firstName: 'Dana', middleName: 'Reyes', lastName: 'Cruz' },
  { id: 's4', name: 'Reyes, Carlo Diaz' },
  { id: 's5', name: 'Mendoza, Paolo Sy' },
];
const ctx = (): ImportContext => ({
  classId: 'c1',
  categories: [cat(1, 'Recitation', 10), cat(2, 'Outputs', 20), cat(3, 'Quizzes', 30), cat(4, 'Major Exam', 40), cat(5, 'Major Exam', 100, 'Final')],
  assessments: [
    asm('a-rec', 'Recitation', 100, 1), asm('a-out', 'Outputs 1', 50, 2), asm('a-q1', 'Quiz 1', 20, 3),
    asm('a-q4', 'Quiz 4', 25, 3), asm('a-ex', 'Major Exam', 70, 4),
  ],
  students: roster,
  saved: { 'a-q1|s4': 15, 'a-q4|s1': 5, 'a-q4|s4': 6, 'a-ex|s1': 72 },
  cls: { courseName: 'Sample Dentistry 1', semester: '2ND', schoolYear: '2025-2026' },
});
const sheets = () => [parseSheet('Sheet2', lecture, 0)!];
const itemOf = (p: ReturnType<typeof buildPreview>, title: string, period: 'Midterm' | 'Final' = 'Midterm') =>
  p.sheets[0].items.find(i => i.item.title === title && i.item.period === period)!;

test('items: matched, new, not in sheet, different max, category by plural-insensitive name', () => {
  const p = buildPreview(sheets(), ctx(), emptyDecisions());
  assert.ok(itemOf(p, 'Quiz 1').assessment);
  assert.equal(itemOf(p, 'Quiz 2').assessment, null);
  assert.equal(itemOf(p, 'Quiz 2').category?.name, 'Quizzes');
  assert.equal(itemOf(p, 'Quiz 2').included, false); // new items are never created unless ticked
  assert.deepEqual(p.notInSheet.map(n => [n.assessment.title, n.savedScores]), [['Quiz 4', 2]]);
  assert.deepEqual(itemOf(p, 'Major Exam').maxDiff, { saved: 70, sheet: 75 });
  assert.ok(p.blockers.some(b => /Choose a max for Major Exam/.test(b)));
  assert.equal(itemOf(p, 'Major Exam', 'Final').assessment, null);
  // sheet weights vs saved weights: quizzes 20 vs 30, major exam 50 vs 40; import never edits them
  assert.deepEqual(p.weightWarnings.sort(), ['Finals Lecture · Major Exam: sheet 90%, saved 100%', 'Midterm Lecture · Major Exam: sheet 50%, saved 40%', 'Midterm Lecture · Quiz: sheet 20%, saved 30%']);
});

test('students: formats, ambiguity, picks, empty rows ignored', () => {
  const p = buildPreview(sheets(), ctx(), emptyDecisions());
  const [r1, r2, r3, r4] = p.sheets[0].rows;
  assert.equal(r1.studentId, 's1'); // "ALONZO, BEA S." -> Alonzo, Bea Santos
  assert.equal(r2.state, 'pick'); assert.deepEqual([...r2.candidates].sort(), ['s2', 's3']);
  assert.equal(r3.studentId, 's4');
  assert.equal(r4.state, 'empty'); // no scores, no name: not blocking
  const d = emptyDecisions(); d.pick[r2.decisionKey] = 's3';
  assert.equal(buildPreview(sheets(), ctx(), d).sheets[0].rows[1].studentId, 's3');
  d.pick[r2.decisionKey] = OUT;
  assert.equal(buildPreview(sheets(), ctx(), d).sheets[0].rows[1].state, 'out');
  // other spellings of the same student
  const alt = (name: string) => {
    const rows = makeSheet('X (LEC)', [[1, name, { C: 80 }]]);
    return buildPreview([parseSheet('s', rows, 0)!], ctx(), emptyDecisions()).sheets[0].rows[0].studentId;
  };
  assert.equal(alt('Bea Santos Alonzo'), 's1');
  assert.equal(alt('  alonzo,   bea  santos '), 's1');
  assert.equal(alt('Alonzo, Bea S'), 's1');
  assert.equal(alt('Mendosa, Paolo'), null);
  assert.equal(alt('Paolo Sy Mendoza'), 's5');
});

test('scores: blank, over max, non-number, changed need a tick; plan lists only what to save', () => {
  const d = emptyDecisions();
  const base = buildPreview(sheets(), ctx(), d);
  d.pick[base.sheets[0].rows[1].decisionKey] = 's2';
  d.maxChoice[itemOf(base, 'Major Exam').item.key] = 'keep'; // saved max 70
  d.create[itemOf(base, 'Major Exam', 'Final').item.key] = true; // category Major Exam (Final) exists
  const p = buildPreview(sheets(), ctx(), d);
  assert.deepEqual(p.blockers, []);
  const cell = (row: number, title: string, period: 'Midterm' | 'Final' = 'Midterm') =>
    p.sheets[0].rows[row].cells.find(c => c.itemKey === itemOf(p, title, period).item.key)!;
  assert.equal(cell(2, 'Quiz 2').kind, 'blank');
  assert.equal(cell(1, 'Major Exam').kind, 'held'); // 80 > kept max 70
  assert.equal(cell(1, 'Major Exam', 'Final').kind, 'held'); // "abc"
  assert.equal(cell(2, 'Quiz 1').kind, 'changed'); // saved 15, sheet 14
  assert.equal(cell(0, 'Quiz 1').kind, 'new');
  assert.equal(cell(0, 'Quiz 2').kind, 'skipped'); // Quiz 2 is not created
  const q1 = itemOf(p, 'Quiz 1').item.key;
  assert.ok(!buildPlan(p, ctx(), d).scores.some(s => s.studentId === 's4' && s.itemKey === q1));
  d.replace[`${q1}|s4`] = true;
  d.remove['a-q4'] = true;
  const p2 = buildPreview(sheets(), ctx(), d);
  const plan = buildPlan(p2, ctx(), d);
  assert.deepEqual(plan.removeAssessmentIds, ['a-q4']);
  assert.ok(plan.scores.some(s => s.studentId === 's4' && s.score === 14 && s.itemKey === q1));
  assert.ok(!plan.items.some(i => i.title === 'Quiz 2'));
  const exam = plan.items.find(i => i.key === itemOf(p2, 'Major Exam', 'Final').item.key)!;
  assert.deepEqual([exam.action, exam.categoryId, exam.maxScore], ['create', 5, 60]);
  assert.equal(plan.items.find(i => i.title === 'Recitation' && i.action === 'link')?.assessmentId, 'a-rec');
});

test('changing a max below a saved score is refused; Use existing links a differently named assessment', () => {
  const p0 = buildPreview(sheets(), ctx(), emptyDecisions());
  const d = emptyDecisions();
  d.maxChoice[itemOf(p0, 'Major Exam').item.key] = 'change'; // sheet max 75
  const c = ctx(); c.assessments[4] = asm('a-ex', 'Major Exam', 90, 4); c.saved['a-ex|s1'] = 80; // 80 > 75
  assert.ok(buildPreview(sheets(), c, d).blockers.some(b => /cannot be lower than a score already saved/.test(b)));
  const d2 = emptyDecisions();
  d2.link[itemOf(p0, 'Quiz 2').item.key] = 'a-q4';
  const p = buildPreview(sheets(), ctx(), d2);
  assert.equal(itemOf(p, 'Quiz 2').assessment?.id, 'a-q4');
  assert.equal(itemOf(p, 'Quiz 2').maxDiff?.saved, 25);
  assert.equal(p.notInSheet.length, 0);
});

test('a sheet without (LEC)/(LAB) waits for a component', () => {
  const rows = makeSheet('SAMPLE DENTISTRY 1', [[1, 'Alonzo, Bea S.', { C: 90 }]]);
  const s = [parseSheet('x', rows, 0)!];
  assert.ok(buildPreview(s, ctx(), emptyDecisions()).blockers.some(b => /Choose Lecture or Laboratory/.test(b)));
  const d = emptyDecisions(); d.sheetComponent[0] = 'Lecture';
  assert.ok(!buildPreview(s, ctx(), d).blockers.some(b => /Choose Lecture or Laboratory/.test(b)));
});

test('a full name without separate fields still matches a two-word first name with a middle initial', () => {
  const index = buildNameIndex([{ id: 'x', name: 'Mark Anthony Castro Agustin' }, { id: 'y', name: 'Agustin, Mark Lim' }]);
  assert.deepEqual(matchStudentName('AGUSTIN, MARK ANTHONY C.', index), ['x']);
  assert.deepEqual(matchStudentName('Mark Anthony Castro Agustin', index), ['x']);
  // Two students who both fit stay undecided for the Faculty (G5).
  assert.deepEqual(matchStudentName('Agustin, Mark', index).sort(), ['x', 'y']);
});
