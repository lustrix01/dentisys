import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGradeSummarySheet, buildOfficialGradeSheet, officialGradeSheetFileName, sheetValues, savedGradeResult,
  type OfficialGradeResult, type OfficialGradeSheetInput, type OfficialSheetAssessment,
} from '../utils/officialGradeSheetExport.ts';
import { buildPreview, emptyDecisions, parseWorkbook, type ImportContext, type SavedAssessment, type SavedCategory } from '../utils/gradeSheetImport.ts';
import { roundPercent } from '../utils/gradeHelper.ts';

// ---------- made-up class ----------
type Comp = 'Lecture' | 'Laboratory';
type Cat = { id: number; name: string; weight: number; component: Comp; sortOrder: number; sourceKind: 'assessment' | 'attendance' };
type Mode = 'lecture_laboratory' | 'lecture';
const cat = (id: number, name: string, weight: number, component: Comp, sourceKind: Cat['sourceKind'] = 'assessment'): Cat => ({ id, name, weight, component, sortOrder: id, sourceKind });
// Attendance is sourced from the register: it has no assessments and is never imported from a sheet.
const midCats = [cat(1, 'Term Exam', 40, 'Lecture'), cat(2, 'Quiz', 30, 'Lecture'), cat(3, 'Recitation', 20, 'Lecture'), cat(7, 'Attendance', 10, 'Lecture', 'attendance'), cat(4, 'Practical Exam', 100, 'Laboratory')];
const finCats = [cat(5, 'Term Exam', 100, 'Lecture'), cat(6, 'Practical Exam', 100, 'Laboratory')];
const catsFor = (mode: Mode): [Cat[], Cat[]] =>
  mode === 'lecture' ? [midCats.filter(c => c.component === 'Lecture'), finCats.filter(c => c.component === 'Lecture')] : [midCats, finCats];
const config = (mode: Mode) => ({
  id: 'g1', course: { id: 1, code: 'DM 116', name: 'Operative Dentistry 1' }, semester: '1ST', schoolYear: '2026-2027', version: 1,
  schemaMode: 'periods', componentMode: mode, componentWeights: { lecture: 60, laboratory: 40 }, termRatio: { midterm: 50, final: 50 },
  categories: [], midtermCategories: catsFor(mode)[0], finalCategories: catsFor(mode)[1],
}) as unknown as OfficialGradeSheetInput['config'];

const A = (id: string, title: string, max: number, categoryId: number, period: 'Midterm' | 'Final', transmut = true): OfficialSheetAssessment =>
  ({ id, title, maxScore: max, gradingCategoryId: String(categoryId), gradingPeriod: period, transmutationEnabled: transmut, transmutationMinimumPercentage: 50, transmutationMaximumPercentage: 100 });
const assessments = [
  A('a1', 'Midterm Exam', 75, 1, 'Midterm'), A('a2', 'Quiz 1', 20, 2, 'Midterm'), A('a3', 'Quiz 2', 30, 2, 'Midterm'),
  A('a4', 'Recitation', 100, 3, 'Midterm', false), A('a5', 'Practical 1', 50, 4, 'Midterm'),
  A('a6', 'Final Exam', 60, 5, 'Final'), A('a7', 'Practical 2', 50, 6, 'Final'),
];
const students = [
  { id: 's2', name: 'Cruz, Dana Lim', firstName: 'Dana', middleName: 'Lim', lastName: 'Cruz' },
  { id: 's1', name: 'Aquino, Bea Santos', firstName: 'Bea', middleName: 'Santos', lastName: 'Aquino' },
  { id: 's3', name: 'Reyes, Carlo', firstName: 'Carlo', middleName: null, lastName: 'Reyes' },
];
// student id -> assessment id -> score; s3 has no Quiz 2 (missing)
const raw: Record<string, Record<string, number>> = {
  s1: { a1: 62, a2: 17, a3: 25, a4: 90, a5: 44, a6: 52, a7: 45 },
  s2: { a1: 49, a2: 14, a3: 20, a4: 88, a5: 38, a6: 41, a7: 40 },
  s3: { a1: 55, a2: 16, a4: 89, a5: 41, a6: 47, a7: 43 },
};
const scores = Object.entries(raw).flatMap(([studentId, byA]) => Object.entries(byA).map(([assessmentId, score]) => ({ assessmentId, studentId, score })));

// Test-only stand-in for the server result (same shape as the real breakdown); the export itself never computes these.
function serverResult(studentId: string, mode: Mode): OfficialGradeResult {
  const [midList, finList] = catsFor(mode);
  const periodOf = (list: Cat[], name: 'Midterm' | 'Final') => {
    const categories: unknown[] = [];
    const comp: Record<string, number | null> = { Lecture: 0, Laboratory: 0 };
    for (const c of list) {
      const items = assessments.filter(a => a.gradingCategoryId === String(c.id) && a.gradingPeriod === name);
      if (c.sourceKind === 'attendance') {
        categories.push({ categoryId: c.id, name: c.name, sourceKind: 'attendance', earnedPoints: 95, possiblePoints: 100, ratio: 0.95, weight: c.weight, contribution: 95 * c.weight / 100 });
        const so = comp[c.component];
        if (so !== null) comp[c.component] = so + 95 * c.weight / 100;
        continue;
      }
      const pcts = items.map(a => { const s = raw[studentId][a.id]; return s === undefined ? null : a.transmutationEnabled ? 50 + s / a.maxScore * 50 : s / a.maxScore * 100; });
      if (pcts.some(v => v === null)) { comp[c.component] = null; continue; }
      const avg = (pcts as number[]).reduce((x, v) => x + v, 0) / pcts.length;
      categories.push({ categoryId: c.id, name: c.name, sourceKind: 'assessment', earnedPoints: avg, possiblePoints: 100, ratio: avg / 100, weight: c.weight, contribution: avg * c.weight / 100 });
      const so_far = comp[c.component];
      if (so_far !== null) comp[c.component] = so_far + avg * c.weight / 100;
    }
    const pct = (k: Comp) => (comp[k] === null ? null : roundPercent(comp[k]!));
    const lec = pct('Lecture'), lab = pct('Laboratory');
    const total = mode === 'lecture' ? lec : lec === null || lab === null ? null : roundPercent(lec * 0.6 + lab * 0.4);
    return {
      period: name, status: total === null ? 'incomplete' : 'computed', percentage: total, categories, incomplete: [],
      ...(mode === 'lecture' ? {} : { components: { lecture: { percentage: lec }, laboratory: { percentage: lab } } }),
    } as any;
  };
  const midterm = periodOf(midList, 'Midterm'), final = periodOf(finList, 'Final');
  const m = midterm.percentage, f = final.percentage;
  if (m === null || f === null) return { status: 'incomplete_period', periods: { midterm, final } };
  const percentage = mode === 'lecture' ? roundPercent(m * 0.5 + f * 0.5) : roundPercent(roundPercent(m * 0.5) + roundPercent(f * 0.5));
  return { status: 'computed', percentage, gwa: 2.5, periods: { midterm, final } };
}
const input = (mode: Mode = 'lecture_laboratory'): OfficialGradeSheetInput => ({
  course: { code: 'DM 116', title: 'Operative Dentistry 1', section: 'DMD-3A', semester: '1ST', schoolYear: '2026-2027' },
  config: config(mode), students,
  assessments: mode === 'lecture' ? assessments.filter(a => ['1', '2', '3', '5'].includes(String(a.gradingCategoryId))) : assessments,
  scores, results: Object.fromEntries(students.map(s => [s.id, serverResult(s.id, mode)])),
});
const values = (inp: OfficialGradeSheetInput): Record<string, ReturnType<typeof sheetValues>> =>
  Object.fromEntries(buildOfficialGradeSheet(inp).map(s => [s.sheet, sheetValues(s)]));

test('file name: spaces stripped from the course code', () => {
  assert.equal(officialGradeSheetFileName({ code: 'DM 116', section: 'DMD-3A', schoolYear: '2026-2027', semester: '1ST' }), 'DM116_DMD-3A_Grade_Sheet_2026-2027_1st.xlsx');
  assert.equal(officialGradeSheetFileName({ code: 'DM 116', section: 'DMD 3A', schoolYear: '2026-2027', semester: '2ND' }), 'DM116_DMD-3A_Grade_Sheet_2026-2027_2nd.xlsx');
});

test('Lecture + Laboratory: sheets, title rows, header rows, names sorted LAST, First Middle', () => {
  const sheets = buildOfficialGradeSheet(input());
  assert.deepEqual(sheets.map(s => s.sheet), ['LEC', 'LAB', 'TFG', 'DATA']);
  assert.deepEqual([sheets[0].stickyRowsCount, sheets[0].stickyColumnsCount, sheets[0].orientation], [9, 2, 'landscape']);
  const v = values(input()).LEC;
  assert.deepEqual(v.slice(0, 6).map(r => r[0]), ['Republic of the Philippines', 'BICOL UNIVERSITY', 'COLLEGE OF DENTAL MEDICINE', 'OPERATIVE DENTISTRY 1 (LEC)', '1ST SEMESTER, AY 2026-2027', 'DMD-3A']);
  assert.deepEqual([v[6][0], v[6][1]], ['No.', 'Names']);
  assert.deepEqual(v.slice(9).map(r => [r[0], r[1]]), [[1, 'AQUINO, Bea Santos'], [2, 'CRUZ, Dana Lim'], [3, 'REYES, Carlo']]);
  // row 8 title over the score column, row 9 max then %, Recitation has no max
  const exam = v[6].indexOf('TERM EXAM');
  assert.deepEqual([v[7][exam], v[8][exam], v[8][exam + 1]], ['Midterm Exam', 75, '%']);
  const rec = v[6].indexOf('RECITATION');
  assert.equal(v[8][rec], null);
  assert.equal(v[9][rec], 90);
  assert.deepEqual(v[6].filter(h => typeof h === 'number'), [0.4, 0.3, 0.2, 0.1, 1]);
  assert.ok(v[6].includes('Midterm 50%') && v[6].includes('Final 50%') && v[6].includes('Over All FG'));
  // item % is a number, transmuted like the app does
  const quiz = v[6].indexOf('QUIZ');
  assert.equal(v[9][quiz + 1], 50 + 17 / 20 * 50);
});

test('attendance-sourced category exports as a percent column with the server average', () => {
  const v = values(input()).LEC;
  const att = v[6].indexOf('ATTENDANCE');
  assert.ok(att > 0);
  assert.equal(v[9][att], 95);
  assert.equal(v[9][att + 1], 9.5);
});

test('missing score: blank cell and INC on everything that depends on it', () => {
  const all = values(input());
  const v = all.LEC;
  const reyes = v[11];
  const q = v[6].indexOf('QUIZ');
  assert.deepEqual([reyes[q + 2], reyes[q + 3], reyes[q + 4], reyes[q + 5]], [null, null, 'INC', 'INC']); // Quiz 2, its %, AVE., weighted
  const mg = v[6].indexOf('MIDTERM GRADE');
  assert.deepEqual([reyes[mg], reyes[mg + 1], reyes[mg + 2]], ['INC', 'INC', 'INC']);
  const t = all.TFG;
  const col = (h: string) => t[0].indexOf(h);
  // Reyes' Midterm Lecture is incomplete; his Finals are complete
  assert.deepEqual(['MIDTERM LEC GRADE', 'TOTAL', 'MG (50%)', 'FG (100%)', 'MG EQUIV', 'FG EQUIV'].map(h => t[3][col(h)]), Array(6).fill('INC'));
  assert.equal(typeof t[3][col('TFG (50%)')], 'number');
  assert.equal(typeof t[3][col('MIDTERM LAB GRADE')], 'number');
  assert.equal(typeof t[1][t[0].indexOf('FG (100%)')], 'number');
});

test('TFG: component grade x share with 2 decimals; TOTAL adds up', () => {
  const t = values(input()).TFG;
  assert.deepEqual(t[0], ['No.', 'NAME', 'MIDTERM LEC GRADE', 'MIDTERM LAB GRADE', 'TOTAL', 'MG (50%)', 'FINAL LEC GRADE', 'FINAL LAB GRADE', 'TOTAL', 'TFG (50%)', 'FG (100%)', 'MG EQUIV', 'TFG EQUIV', 'FG EQUIV']);
  const r = serverResult('s1', 'lecture_laboratory') as any;
  assert.equal(t[1][2], r.periods.midterm.components.lecture.percentage * 60 / 100);
  assert.equal(t[1][3], r.periods.midterm.components.laboratory.percentage * 40 / 100);
  assert.equal(t[1][4], r.periods.midterm.percentage);
  assert.equal(t[1][10], r.percentage);
});

test('LEC and LAB sheets show the component alone in whole percents (X24)', () => {
  const v = values(input());
  const lecM = (serverResult('s1', 'lecture_laboratory') as any).periods.midterm.components.lecture.percentage;
  const mg = v.LEC[6].indexOf('MIDTERM GRADE');
  assert.equal(v.LEC[9][mg], lecM);
  assert.equal(v.LEC[9][mg + 2], roundPercent(lecM * 50 / 100));
  assert.equal(v.LAB[3][0], 'OPERATIVE DENTISTRY 1 (LAB)');
});

test('Lecture only: no LAB sheet, 10-column TFG with one-decimal MG and TFG', () => {
  const sheets = buildOfficialGradeSheet(input('lecture'));
  assert.deepEqual(sheets.map(s => s.sheet), ['LEC', 'TFG', 'DATA']);
  const t = sheetValues(sheets[1]);
  assert.deepEqual(t[0], ['No.', 'NAME', 'MIDTERM GRADE', 'MG (50%)', 'FINAL GRADE', 'TFG (50%)', 'FG (100%)', 'MG EQUIV', 'TFG EQUIV', 'FG EQUIV']);
  assert.equal(t[1][3], (t[1][2] as number) * 50 / 100);
  assert.equal(t[1][5], (t[1][4] as number) * 50 / 100);
  assert.equal((sheets[1].data[1][3] as { format: string }).format, '0.0');
});

test('DATA: whole percent 0-100 to grade', () => {
  const d = values(input()).DATA;
  assert.deepEqual(d[0], ['PERCENT %', 'PS']);
  assert.equal(d.length, 102);
  assert.deepEqual([d[1], d[75], d[76], d[100], d[101]], [[0, 5], [74, 5], [75, 3], [99, 1], [100, 1]]);
});

test('no saved Grade Weights: refuses', () => {
  const bad = { ...input(), config: { ...input().config, schemaMode: 'overall' as const } };
  assert.throws(() => buildOfficialGradeSheet(bad), /Grade Weights/);
});

test('saved breakdown of a past class becomes a result', () => {
  const live = serverResult('s1', 'lecture_laboratory');
  const saved = savedGradeResult({ grade: 2.5, components: { calculationMode: 'authoritative_periods', percentage: live.percentage, periods: live.periods } });
  assert.equal(saved?.status, 'computed');
  assert.equal(savedGradeResult({ grade: 0, components: {} }), undefined);
});

// ---------- X12 round trip ----------
test('round trip: importing the exported workbook into the same class changes nothing', () => {
  for (const mode of ['lecture_laboratory', 'lecture'] as const) {
    const inp = input(mode);
    const parsed = parseWorkbook(buildOfficialGradeSheet(inp).map(s => ({ sheet: s.sheet!, data: sheetValues(s) })));
    assert.deepEqual(parsed.map(p => p.component), mode === 'lecture' ? ['Lecture'] : ['Lecture', 'Laboratory']);
    const savedCats: SavedCategory[] = (['Midterm', 'Final'] as const).flatMap((period, i) =>
      catsFor(mode)[i].map(c => ({ id: c.id, name: c.name, weight: c.weight, period, component: c.component, attendance: c.sourceKind === 'attendance' })));
    const savedAss: SavedAssessment[] = inp.assessments.map(a => {
      const c = savedCats.find(x => x.period === a.gradingPeriod && String(x.id) === a.gradingCategoryId)!;
      return { id: a.id, title: a.title, maxScore: a.maxScore, period: a.gradingPeriod!, component: c.component, categoryId: c.id, attendance: false };
    });
    const ctx: ImportContext = {
      classId: 'c1', categories: savedCats, assessments: savedAss, lectureOnly: mode === 'lecture',
      students: students.map(s => ({ id: s.id, name: s.name, firstName: s.firstName, middleName: s.middleName, lastName: s.lastName })),
      saved: Object.fromEntries(scores.map(s => [`${s.assessmentId}|${s.studentId}`, s.score])),
      cls: { courseName: 'Operative Dentistry 1', semester: '1ST', schoolYear: '2026-2027' },
    };
    const p = buildPreview(parsed, ctx, emptyDecisions());
    assert.deepEqual(p.blockers, [], mode);
    assert.deepEqual(p.weightWarnings, [], mode);
    assert.deepEqual(p.notInSheet, [], mode);
    for (const sv of p.sheets) {
      assert.deepEqual(sv.headerWarnings, []);
      assert.equal(sv.rows.length, 3);
      assert.ok(sv.rows.every(r => r.state === 'matched'));
      assert.ok(sv.items.every(i => i.assessment && !i.maxDiff), 'every item matches a saved assessment');
      const kinds = new Set(sv.rows.flatMap(r => r.cells.map(c => c.kind)));
      assert.ok([...kinds].every(k => k === 'same' || k === 'blank'), `cells: ${[...kinds]}`);
    }
    assert.equal(p.sheets.reduce((n, sv) => n + sv.items.length, 0), inp.assessments.length);
    assert.deepEqual(p.counts, { toSave: 0, blanks: 1, held: 0, changedUnticked: 0, itemsToCreate: 0, toRemove: 0 }); // the one missing Quiz 2
  }
});

test('classes without the official layout get the plain Grade Summary', () => {
  const sheet = buildGradeSummarySheet({
    students: [{ id: 's1', studentId: 'DENT-1', name: 'Bea Aquino', enrolledSubjects: [{ code: 'DM116', grade: 2.5, components: { quizzes: 81.25, calculationMode: 'x' } }] }] as any,
    subjectCode: 'DM116', periodMode: false, results: {},
    course: { code: 'DM 116', title: 'Operative Dentistry 1', section: 'DMD-3A', semester: '1ST', schoolYear: '2026-2027' }, by: 'Dr. Reyes',
  });
  const v = sheetValues(sheet);
  assert.equal(sheet.sheet, 'Grade Summary');
  assert.deepEqual(v[8], ['Student Number', 'Student Name', 'Quizzes', 'Practicum', 'Exams', 'Attendance', 'Overall Grade', 'Remarks']);
  assert.deepEqual(v[9], ['DENT-1', 'Bea Aquino', 81.25, '—', '—', '—', 2.5, 'PASS']);
});
