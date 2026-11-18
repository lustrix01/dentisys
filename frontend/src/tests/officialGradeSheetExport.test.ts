import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGradeSummarySheet, buildOfficialGradeSheet, officialGradeSheetFileName, sheetValues, savedGradeResult,
  type OfficialGradeResult, type OfficialGradeSheetInput, type OfficialSheetAssessment,
} from '../utils/officialGradeSheetExport.ts';
import { percentageToGWAExact, roundPercent } from '../utils/gradeHelper.ts';

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
  { id: 's2', studentId: 'STU-2', name: 'Cruz, Dana Lim', firstName: 'Dana', middleName: 'Lim', lastName: 'Cruz' },
  { id: 's1', studentId: 'STU-1', name: 'Aquino, Bea Santos', firstName: 'Bea', middleName: 'Santos', lastName: 'Aquino' },
  { id: 's3', studentId: 'STU-3', name: 'Reyes, Carlo', firstName: 'Carlo', middleName: null, lastName: 'Reyes' },
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

test('Lecture + Laboratory export is one continuous grading matrix', () => {
  const sheets = buildOfficialGradeSheet(input());
  assert.deepEqual(sheets.map(s => s.sheet), ['Grade Sheet']);
  assert.deepEqual([sheets[0].stickyRowsCount, sheets[0].stickyColumnsCount, sheets[0].orientation], [10, 2, 'landscape']);
  const v = sheetValues(sheets[0]);
  assert.deepEqual(v.slice(0, 5).map(row => row[0]), ['Republic of the Philippines', 'BICOL UNIVERSITY', 'COLLEGE OF DENTAL MEDICINE', 'OPERATIVE DENTISTRY 1 · COMPREHENSIVE GRADE SHEET', 'DMD-3A · 1ST SEMESTER, AY 2026-2027']);
  assert.deepEqual([v[5][0], v[5][1]], ['Student No.', 'Full Name']);
  assert.deepEqual(v.slice(10).map(row => [row[0], row[1]]), [['STU-1', 'AQUINO, Bea Santos'], ['STU-2', 'CRUZ, Dana Lim'], ['STU-3', 'REYES, Carlo']]);
  assert.ok(v[5].includes('Midterm') && v[5].includes('Finals'));
  assert.ok(v[6].includes('Lecture') && v[6].includes('Laboratory'));
  assert.ok(v[7].includes('Term Exam (40%)') && v[7].includes('Practical Exam (100%)'));
  assert.ok(v[8].includes('Midterm Exam (Max 75)') && v[8].includes('Quiz 1 (Max 20)'));
  assert.ok(v[9].includes('Score') && v[9].includes('%') && v[9].includes('Transmuted'));
  assert.ok(v[8].includes('Average %') && v[8].includes('Weighted (40%)'));
  assert.deepEqual(v[5].slice(-6), ['Midterm Results', null, 'Finals Results', null, 'Overall Result', null]);
});

test('matrix keeps server-computed category and final grade values with inline equivalents', () => {
  const v = values(input())['Grade Sheet'];
  const body = v[10];
  assert.equal(body[2], 62);
  assert.equal(body[3], 62 / 75 * 100);
  assert.equal(body[4], 50 + 62 / 75 * 50);
  assert.equal(body[7], 17);
  assert.equal(body[8], 85);
  assert.equal(body[9], 92.5);
  assert.equal(body.at(-1), 2.5);
});

test('attendance category and missing scores keep their matrix semantics', () => {
  const v = values(input())['Grade Sheet'];
  const reyes = v[12];
  assert.ok(v[7].includes('Attendance (10%)'));
  assert.ok(v[8].includes('Quiz 2 (Max 30)'));
  assert.equal(reyes[10], null);
  assert.equal(reyes[11], null);
  assert.equal(reyes[12], null);
  assert.equal(reyes[20], 95);
});

test('Lecture-only export has one matrix and omits the Laboratory component group', () => {
  const sheets = buildOfficialGradeSheet(input('lecture'));
  assert.deepEqual(sheets.map(s => s.sheet), ['Grade Sheet']);
  const v = sheetValues(sheets[0]);
  assert.ok(v[6].includes('Lecture'));
  assert.ok(!v[6].includes('Laboratory'));
  assert.ok(v[5].includes('Midterm') && v[5].includes('Finals'));
});

test('no saved Grade Weights: refuses', () => {
  const bad = { ...input(), config: { ...input().config, schemaMode: 'overall' as const } };
  assert.throws(() => buildOfficialGradeSheet(bad), /grade weights/);
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

test('Reports Grade Summary uses the iBU columns: grades, status, completion and notes', async () => {
  const { IBU_SUMMARY_COLUMNS, ibuGradeSummaryRow } = await import('../utils/officialGradeSheetExport.ts');
  assert.deepEqual(IBU_SUMMARY_COLUMNS.map(c => c.header), ['Student Number', 'Full Name', 'Status', 'Midterm', 'Tentative', 'Final', 'Completion', 'Notes']);
  const evaluation = (o: Record<string, unknown>) => ({ midtermStatus: 'computed', midtermPercentage: 88, finalStatus: 'computed', finalPercentage: 92, overallGwa: 2, midtermReasons: [], finalReasons: [], ...o }) as any;
  const student = { studentId: '2024-0001', name: 'Dana Lim Cruz', firstName: 'Dana', middleName: 'Lim', lastName: 'Cruz' };
  const row = (e: Record<string, unknown>, progression?: any) => ibuGradeSummaryRow({ student, evaluation: evaluation(e), progression });
  const passed = row({});
  assert.deepEqual([passed.fullName, passed.status, passed.final, passed.completion, passed.notes], ['CRUZ, Dana Lim', 'Passed', 2, '', '']);
  assert.equal(passed.midterm, percentageToGWAExact(88));
  assert.equal(passed.tentative, percentageToGWAExact(92));
  const midTerm = row({ finalStatus: 'incomplete', finalPercentage: null, finalReasons: ['No assessments yet in some categories'], overallGwa: null });
  assert.deepEqual([midTerm.status, midTerm.midterm === percentageToGWAExact(88), midTerm.tentative, midTerm.final, midTerm.notes], ['', true, null, null, '']);
  const inc = row({ finalStatus: 'incomplete', finalPercentage: null, finalReasons: ['Missing Assessment Score'], overallGwa: null });
  assert.deepEqual([inc.status, inc.tentative, inc.final, inc.notes], ['INC', 'INC', 'INC', 'Missing Finals scores']);
  const pending = row({ midtermStatus: 'pending', midtermPercentage: null, finalStatus: 'pending', finalPercentage: null, overallGwa: null });
  assert.deepEqual([pending.status, pending.midterm, pending.final, pending.notes], ['', null, null, '']);
  const failedThenRemedial = row({ overallGwa: 5 }, { stage: 'passed', passedAttempt: 2, attempts: [], legacyUnclassified: false });
  assert.deepEqual([failedThenRemedial.status, failedThenRemedial.final, failedThenRemedial.completion, failedThenRemedial.notes], ['Passed', 5, 'Remedial passed', 'Remedial attempt 2 passed']);
  // Remedial: final 2.5-4.9 with no recorded pass; a recorded pass or passed cost recovery clears it; 5.0 and failed cost recovery fail.
  const due = row({ overallGwa: 2.75 });
  assert.deepEqual([due.status, due.final], ['Remedial', 2.75]);
  assert.equal(row({ overallGwa: 2.75 }, { stage: 'attempt_2_available', passedAttempt: null, attempts: [], legacyUnclassified: false }).status, 'Remedial');
  const clearedByRemedial = row({ overallGwa: 3 }, { stage: 'passed', passedAttempt: 1, attempts: [], legacyUnclassified: false });
  assert.deepEqual([clearedByRemedial.status, clearedByRemedial.final, clearedByRemedial.completion], ['Passed', 3, 'Remedial passed']);
  assert.equal(row({ overallGwa: 5 }).status, 'Failed');
  assert.equal(row({ overallGwa: 2.25 }).status, 'Passed');
  assert.equal(row({ overallGwa: 5 }, { stage: 'cost_recovery_failed', passedAttempt: null, attempts: [], legacyUnclassified: false, costRecovery: { finalGrade: 5, outcome: 'failed', recordedAt: '' } }).status, 'Failed');
  const cost = row({ overallGwa: 5 }, { stage: 'cost_recovery_passed', passedAttempt: null, attempts: [], legacyUnclassified: false, costRecovery: { finalGrade: 2, outcome: 'passed', recordedAt: '' } });
  assert.deepEqual([cost.completion, cost.notes], ['2.0', 'Cost recovery passed']);
});

test('Reports names are LAST, First Middle (sheetName) with the plain name as fallback', async () => {
  const { sheetName } = await import('../utils/officialGradeSheetExport.ts');
  assert.equal(sheetName({ name: 'Dana Lim Cruz', firstName: 'Dana', middleName: 'Lim', lastName: 'Cruz' }), 'CRUZ, Dana Lim');
  assert.equal(sheetName({ name: 'Alice Reyes' }), 'Alice Reyes');
});

test('9.13: the plain Grade Summary names students LAST, First Middle in last-name order', () => {
  const sheet = buildGradeSummarySheet({
    students: [
      { id: 's2', studentId: 'DENT-2', name: 'Dana Lim Cruz', firstName: 'Dana', middleName: 'Lim', lastName: 'Cruz', enrolledSubjects: [] },
      { id: 's1', studentId: 'DENT-1', name: 'Bea Aquino', firstName: 'Bea', lastName: 'Aquino', enrolledSubjects: [] },
    ] as any,
    subjectCode: 'DM116', periodMode: false, results: {},
    course: { code: 'DM 116', title: 'Operative Dentistry 1', section: 'DMD-3A', semester: '1ST', schoolYear: '2026-2027' }, by: 'Dr. Reyes',
  });
  const v = sheetValues(sheet);
  assert.deepEqual([v[9][1], v[10][1]], ['AQUINO, Bea', 'CRUZ, Dana Lim']);
});
