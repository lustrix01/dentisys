import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildDefaultPeriodDraft,
  validateDateRanges,
  normalizeDateRangesForPayload,
  formatPeriodIncompleteReason,
  buildRowCompositeKey,
  extractPeriodEvaluation,
  generateGradeSummaryCSV,
  isValidCalendarDate,
} from '../utils/periodGradingHelper.ts';
import type { FacultyPeriodModeComputedResult, FacultyPeriodModeIncompleteResult } from '../services/apiClient.ts';

test('Faculty grade views use the inclusive authoritative retention boundary', () => {
  const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
  const gradeComputation = fs.readFileSync(
    path.join(currentDirectory, '../pages/faculty/GradeComputation.tsx'),
    'utf8'
  );
  assert.equal((gradeComputation.match(/> settings\.retentionThreshold/g) ?? []).length, 0);
  assert.equal((gradeComputation.match(/>= settings\.retentionThreshold/g) ?? []).length, 4);
});

test('Period Draft: buildDefaultPeriodDraft produces the exact approved starting preset', () => {
  const draft = buildDefaultPeriodDraft();
  assert.equal(draft.termRatio.midterm, '40');
  assert.equal(draft.termRatio.final, '60');
  assert.equal(draft.midtermCategories.length, 4);
  assert.equal(draft.finalCategories.length, 5);

  // Midterm categories: Quiz 25, Activity 25, Midterm Exam 40, Attendance 10
  assert.deepEqual(
    draft.midtermCategories.map(c => ({ name: c.name, weight: c.weight, sourceKind: c.sourceKind })),
    [
      { name: 'Quiz', weight: '25', sourceKind: 'assessment' },
      { name: 'Activity', weight: '25', sourceKind: 'assessment' },
      { name: 'Midterm Exam', weight: '40', sourceKind: 'assessment' },
      { name: 'Attendance', weight: '10', sourceKind: 'attendance' },
    ]
  );

  // Finals categories: Quiz 20, Activity 20, Laboratory 20, Final Exam 30, Attendance 10
  assert.deepEqual(
    draft.finalCategories.map(c => ({ name: c.name, weight: c.weight, sourceKind: c.sourceKind })),
    [
      { name: 'Quiz', weight: '20', sourceKind: 'assessment' },
      { name: 'Activity', weight: '20', sourceKind: 'assessment' },
      { name: 'Laboratory', weight: '20', sourceKind: 'assessment' },
      { name: 'Final Exam', weight: '30', sourceKind: 'assessment' },
      { name: 'Attendance', weight: '10', sourceKind: 'attendance' },
    ]
  );

  // Date ranges are blank by default
  assert.equal(draft.attendanceDateRanges.midterm.startDate, '');
  assert.equal(draft.attendanceDateRanges.midterm.endDate, '');
  assert.equal(draft.attendanceDateRanges.final.startDate, '');
  assert.equal(draft.attendanceDateRanges.final.endDate, '');
});

test('Composite Row Keying: generates distinct keys for categories across periods', () => {
  // Legacy category ID 10 can appear in both Midterm and Finals without collision
  const mKey = buildRowCompositeKey('Midterm', 10);
  const fKey = buildRowCompositeKey('Final', 10);
  assert.equal(mKey, 'Midterm:10');
  assert.equal(fKey, 'Final:10');
  assert.notEqual(mKey, fKey);

  const newKey = buildRowCompositeKey('Midterm', null, 'temp-99');
  assert.equal(newKey, 'Midterm:temp-99');
});

test('Date Ranges Validation: accepts valid non-overlapping ranges and allowed gaps', () => {
  const valid = validateDateRanges({
    midterm: { startDate: '2026-08-01', endDate: '2026-10-15' },
    final: { startDate: '2026-10-20', endDate: '2026-12-20' }, // gap between Oct 15 and Oct 20
  });
  assert.equal(valid.valid, true);
  assert.equal(valid.error, undefined);
});

test('Date Ranges Validation: accepts blank dates for save', () => {
  const blank = validateDateRanges({
    midterm: { startDate: '', endDate: '' },
    final: { startDate: '', endDate: '' },
  });
  assert.equal(blank.valid, true);
});

test('Date Ranges Validation: rejects reversed start/end dates', () => {
  const reversed = validateDateRanges({
    midterm: { startDate: '2026-10-15', endDate: '2026-08-01' },
    final: { startDate: '2026-10-20', endDate: '2026-12-20' },
  });
  assert.equal(reversed.valid, false);
  assert.match(reversed.error || '', /Midterm start date must be on or before end date/);
});

test('Date Ranges Validation: rejects Midterm ending on or after Finals starts', () => {
  // Overlapping
  const overlap = validateDateRanges({
    midterm: { startDate: '2026-08-01', endDate: '2026-10-25' },
    final: { startDate: '2026-10-20', endDate: '2026-12-20' },
  });
  assert.equal(overlap.valid, false);
  assert.match(overlap.error || '', /Midterm attendance must end before Finals attendance starts/);

  // Same-day boundary
  const sameDay = validateDateRanges({
    midterm: { startDate: '2026-08-01', endDate: '2026-10-20' },
    final: { startDate: '2026-10-20', endDate: '2026-12-20' },
  });
  assert.equal(sameDay.valid, false);
  assert.match(sameDay.error || '', /Midterm attendance must end before Finals attendance starts/);
});

test('Calendar Date Validation: isValidCalendarDate strictly validates real calendar dates', () => {
  // Impossible days for February
  assert.equal(isValidCalendarDate('2026-02-31'), false);
  assert.equal(isValidCalendarDate('2026-02-30'), false);
  assert.equal(isValidCalendarDate('2026-02-29'), false); // 2026 is not a leap year
  assert.equal(isValidCalendarDate('2024-02-29'), true);  // 2024 is a leap year

  // 30-day months cannot have day 31
  assert.equal(isValidCalendarDate('2026-04-31'), false); // April
  assert.equal(isValidCalendarDate('2026-06-31'), false); // June
  assert.equal(isValidCalendarDate('2026-09-31'), false); // September
  assert.equal(isValidCalendarDate('2026-11-31'), false); // November

  // Valid dates
  assert.equal(isValidCalendarDate('2026-04-30'), true);
  assert.equal(isValidCalendarDate('2026-08-01'), true);
  assert.equal(isValidCalendarDate('2026-12-31'), true);

  // Invalid formats and out-of-range components
  assert.equal(isValidCalendarDate('2026-00-15'), false);
  assert.equal(isValidCalendarDate('2026-13-01'), false);
  assert.equal(isValidCalendarDate('2026-05-00'), false);
  assert.equal(isValidCalendarDate('2026-05-32'), false);
  assert.equal(isValidCalendarDate('invalid-date'), false);
});

test('Date Ranges Validation: rejects impossible calendar dates such as February 31', () => {
  const feb31Midterm = validateDateRanges({
    midterm: { startDate: '2026-02-31', endDate: '2026-03-15' },
    final: { startDate: '2026-03-16', endDate: '2026-05-15' },
  });
  assert.equal(feb31Midterm.valid, false);
  assert.equal(feb31Midterm.error, 'Midterm start date must be a valid calendar date in YYYY-MM-DD format.');

  const april31Final = validateDateRanges({
    midterm: { startDate: '2026-01-15', endDate: '2026-03-15' },
    final: { startDate: '2026-03-16', endDate: '2026-04-31' },
  });
  assert.equal(april31Final.valid, false);
  assert.equal(april31Final.error, 'Finals end date must be a valid calendar date in YYYY-MM-DD format.');
});

test('Date Ranges Normalization: serializes blank strings to null', () => {
  const normalized = normalizeDateRangesForPayload({
    midterm: { startDate: '  ', endDate: '2026-10-15' },
    final: { startDate: '', endDate: '' },
  });
  assert.deepEqual(normalized, {
    midterm: { startDate: null, endDate: '2026-10-15' },
    final: { startDate: null, endDate: null },
  });
});

test('Period Incomplete Reasons: formats server reasons to human-readable strings', () => {
  assert.equal(formatPeriodIncompleteReason('missing_date_range'), 'Missing Date Range');
  assert.equal(formatPeriodIncompleteReason('no_sessions'), 'No Sessions');
  assert.equal(formatPeriodIncompleteReason('unresolved_attendance'), 'Unresolved Attendance');
  assert.equal(formatPeriodIncompleteReason('no_assessment_results'), 'No Assessment Results');
  assert.equal(formatPeriodIncompleteReason('missing_assessment_score'), 'Missing Assessment Score');
  assert.equal(formatPeriodIncompleteReason('unresolved_assessment_attendance'), 'Unresolved Transmuted Attendance');
  assert.equal(formatPeriodIncompleteReason('duplicate_attendance_sources'), 'Duplicate Attendance');
});

test('Evaluation Extraction: handles complete period computed results', () => {
  const computedResult: FacultyPeriodModeComputedResult = {
    status: 'computed',
    enrollmentId: '101',
    studentId: '201',
    percentage: 89.5,
    gwa: 1.75,
    retentionState: 'active',
    periods: {
      midterm: {
        period: 'Midterm',
        status: 'computed',
        percentage: 88.75,
        categories: [],
        incomplete: [],
        attendanceDateRange: { startDate: '2026-08-01', endDate: '2026-10-15' },
      },
      final: {
        period: 'Final',
        status: 'computed',
        percentage: 90.0,
        categories: [],
        incomplete: [],
        attendanceDateRange: { startDate: '2026-10-16', endDate: '2026-12-20' },
      },
    },
    breakdown: {
      calculationMode: 'authoritative_periods',
      termRatio: { midterm: 40, final: 60 },
      periods: {
        midterm: {
          period: 'Midterm',
          status: 'computed',
          percentage: 88.75,
          categories: [],
          incomplete: [],
          attendanceDateRange: { startDate: '2026-08-01', endDate: '2026-10-15' },
        },
        final: {
          period: 'Final',
          status: 'computed',
          percentage: 90.0,
          categories: [],
          incomplete: [],
          attendanceDateRange: { startDate: '2026-10-16', endDate: '2026-12-20' },
        },
      },
      retentionThreshold: 2.5,
    },
  };

  const evaluation = extractPeriodEvaluation(null, computedResult);
  assert.equal(evaluation.isPeriodMode, true);
  assert.equal(evaluation.midtermPercentage, 88.75);
  assert.equal(evaluation.finalPercentage, 90.0);
  assert.equal(evaluation.overallGwa, 1.75);
  assert.equal(evaluation.statusText, 'PASS');
});

test('Evaluation Extraction: handles incomplete period with zero-weight without blocking overall', () => {
  // A zero-weight Midterm is incomplete due to missing date range, but overall is computed from 100% Final!
  const zeroWeightResult: FacultyPeriodModeComputedResult = {
    status: 'computed',
    enrollmentId: '102',
    studentId: '202',
    percentage: 90.0,
    gwa: 1.75,
    retentionState: 'active',
    periods: {
      midterm: {
        period: 'Midterm',
        status: 'incomplete',
        percentage: null,
        categories: [],
        incomplete: [{ reason: 'missing_date_range' }],
        attendanceDateRange: { startDate: null, endDate: null },
      },
      final: {
        period: 'Final',
        status: 'computed',
        percentage: 90.0,
        categories: [],
        incomplete: [],
        attendanceDateRange: { startDate: '2026-10-16', endDate: '2026-12-20' },
      },
    },
    breakdown: {
      calculationMode: 'authoritative_periods',
      termRatio: { midterm: 0, final: 100 },
      periods: {
        midterm: {
          period: 'Midterm',
          status: 'incomplete',
          percentage: null,
          categories: [],
          incomplete: [{ reason: 'missing_date_range' }],
          attendanceDateRange: { startDate: null, endDate: null },
        },
        final: {
          period: 'Final',
          status: 'computed',
          percentage: 90.0,
          categories: [],
          incomplete: [],
          attendanceDateRange: { startDate: '2026-10-16', endDate: '2026-12-20' },
        },
      },
      retentionThreshold: 2.5,
    },
  };

  const evaluation = extractPeriodEvaluation(null, zeroWeightResult);
  assert.equal(evaluation.isPeriodMode, true);
  assert.equal(evaluation.midtermPercentage, null);
  assert.deepEqual(evaluation.midtermReasons, ['Missing Date Range']);
  assert.equal(evaluation.finalPercentage, 90.0);
  assert.equal(evaluation.overallGwa, 1.75);
  assert.equal(evaluation.statusText, 'PASS');
});

test('Evaluation Extraction: preserves prior persisted grade when recomputation is incomplete', () => {
  const incompleteResult: FacultyPeriodModeIncompleteResult = {
    status: 'incomplete_period',
    enrollmentId: '103',
    studentId: '203',
    periods: {
      midterm: {
        period: 'Midterm',
        status: 'incomplete',
        percentage: null,
        categories: [],
        incomplete: [{ reason: 'unresolved_attendance' }],
        attendanceDateRange: { startDate: '2026-08-01', endDate: '2026-10-15' },
      },
      final: {
        period: 'Final',
        status: 'computed',
        percentage: 85.0,
        categories: [],
        incomplete: [],
        attendanceDateRange: { startDate: '2026-10-16', endDate: '2026-12-20' },
      },
    },
    breakdown: {
      calculationMode: 'authoritative_periods',
      termRatio: { midterm: 40, final: 60 },
      periods: {
        midterm: {
          period: 'Midterm',
          status: 'incomplete',
          percentage: null,
          categories: [],
          incomplete: [{ reason: 'unresolved_attendance' }],
          attendanceDateRange: { startDate: '2026-08-01', endDate: '2026-10-15' },
        },
        final: {
          period: 'Final',
          status: 'computed',
          percentage: 85.0,
          categories: [],
          incomplete: [],
          attendanceDateRange: { startDate: '2026-10-16', endDate: '2026-12-20' },
        },
      },
      retentionThreshold: 2.5,
    },
    previouslyPersisted: true,
    previousPercentage: 78.5,
    previousGwa: 2.25,
  };

  const evaluation = extractPeriodEvaluation(null, incompleteResult);
  assert.equal(evaluation.isPeriodMode, true);
  assert.equal(evaluation.midtermPercentage, null);
  assert.deepEqual(evaluation.midtermReasons, ['Unresolved Attendance']);
  assert.equal(evaluation.overallGwa, null);
  assert.equal(evaluation.historicalGwa, 2.25);
  assert.equal(evaluation.isIncomplete, true);
  assert.equal(evaluation.statusText, 'INCOMPLETE');
});

test('Evaluation Extraction: uncomputed period mode shows pending state and hides legacy grade', () => {
  // Legacy enrolled subject with grade 1.75
  const legacySubj = {
    code: 'CLIN401',
    name: 'Clinical Dentistry I',
    units: 3,
    grade: 1.75,
    isClinical: true,
    hasRemedial: false,
    components: {
      quizzes: 85,
      exams: 88,
      practicum: 90,
      attendance: 95,
    },
  };

  // When configured in period mode without compute result
  const evaluation = extractPeriodEvaluation(legacySubj as any, null, 'periods');
  assert.equal(evaluation.isPeriodMode, true);
  assert.equal(evaluation.midtermStatus, 'pending');
  assert.equal(evaluation.midtermPercentage, null);
  assert.equal(evaluation.finalStatus, 'pending');
  assert.equal(evaluation.finalPercentage, null);
  assert.equal(evaluation.overallGwa, null);
  assert.equal(evaluation.historicalGwa, null);
  assert.equal(evaluation.isIncomplete, true);
  assert.equal(evaluation.statusText, 'PENDING');
});

test('Evaluation Extraction: incomplete result without confirmed persisted grade does NOT fall back to subj.grade', () => {
  const legacySubj = {
    code: 'CLIN401',
    name: 'Clinical Dentistry I',
    units: 3,
    grade: 2.00,
    isClinical: true,
    hasRemedial: false,
    components: {
      quizzes: 80,
      exams: 80,
      practicum: 80,
      attendance: 80,
    },
  };

  const incompleteResult: FacultyPeriodModeIncompleteResult = {
    status: 'incomplete_period',
    enrollmentId: '104',
    studentId: '204',
    periods: {
      midterm: {
        period: 'Midterm',
        status: 'incomplete',
        percentage: null,
        categories: [],
        incomplete: [{ reason: 'unresolved_attendance' }],
        attendanceDateRange: { startDate: '2026-08-01', endDate: '2026-10-15' },
      },
      final: {
        period: 'Final',
        status: 'computed',
        percentage: 85.0,
        categories: [],
        incomplete: [],
        attendanceDateRange: { startDate: '2026-10-16', endDate: '2026-12-20' },
      },
    },
    breakdown: {
      calculationMode: 'authoritative_periods',
      termRatio: { midterm: 40, final: 60 },
      periods: {
        midterm: {
          period: 'Midterm',
          status: 'incomplete',
          percentage: null,
          categories: [],
          incomplete: [{ reason: 'unresolved_attendance' }],
          attendanceDateRange: { startDate: '2026-08-01', endDate: '2026-10-15' },
        },
        final: {
          period: 'Final',
          status: 'computed',
          percentage: 85.0,
          categories: [],
          incomplete: [],
          attendanceDateRange: { startDate: '2026-10-16', endDate: '2026-12-20' },
        },
      },
      retentionThreshold: 2.5,
    },
    previouslyPersisted: false,
    previousPercentage: null,
    previousGwa: null,
  };

  const evalResult = extractPeriodEvaluation(legacySubj as any, incompleteResult);
  assert.equal(evalResult.isPeriodMode, true);
  assert.equal(evalResult.overallGwa, null);
  // Must NOT fall back to subj.grade (2.00) because previouslyPersisted is false!
  assert.equal(evalResult.historicalGwa, null);
  assert.equal(evalResult.statusText, 'INCOMPLETE');
});

test('CSV Generation: exports distinct period percentages without copying overall grades', () => {
  const dummyStudents = [
    {
      id: 's1',
      studentId: 'DENT-001',
      name: 'Alice Reyes',
      email: '',
      yearLevel: 4 as const,
      status: 'active' as const,
      enrolledSubjects: [
        {
          code: 'CLIN401',
          name: 'Clinical Dentistry I',
          units: 3,
          grade: 1.75,
          isClinical: true,
          hasRemedial: false,
          components: {
            quizzes: 0,
            exams: 0,
            practicum: 0,
            attendance: 0,
            calculationMode: 'authoritative_periods',
            termRatio: { midterm: 40, final: 60 },
            periods: {
              midterm: { period: 'Midterm', status: 'computed', percentage: 88.75, categories: [], incomplete: [] },
              final: { period: 'Final', status: 'computed', percentage: 90.0, categories: [], incomplete: [] },
            },
          },
        },
      ],
      clinicHoursCompleted: 50,
      overallGWA: 1.75,
      remedialExams: [],
      classSections: [],
    },
    {
      id: 's2',
      studentId: 'DENT-002',
      name: 'Bob Santos',
      email: '',
      yearLevel: 4 as const,
      status: 'active' as const,
      enrolledSubjects: [
        {
          code: 'CLIN401',
          name: 'Clinical Dentistry I',
          units: 3,
          grade: 0,
          isClinical: true,
          hasRemedial: false,
          components: {
            quizzes: 0,
            exams: 0,
            practicum: 0,
            attendance: 0,
            calculationMode: 'authoritative_periods',
            termRatio: { midterm: 40, final: 60 },
            periods: {
              midterm: { period: 'Midterm', status: 'incomplete', percentage: null, categories: [], incomplete: [{ reason: 'missing_date_range' }] },
              final: { period: 'Final', status: 'computed', percentage: 90.0, categories: [], incomplete: [] },
            },
          },
        },
      ],
      clinicHoursCompleted: 50,
      overallGWA: 0,
      remedialExams: [],
      classSections: [],
    },
  ];

  const csv = generateGradeSummaryCSV(dummyStudents, 'CLIN401', true);
  const lines = csv.trim().split('\n');

  assert.equal(lines[0], 'Student ID,Name,Midterm %,Final %,Overall GWA,Status');
  // Student 1: distinct Midterm 88.75%, Final 90.00%, Overall GWA 1.75
  assert.equal(lines[1], 'DENT-001,"Alice Reyes",88.75%,90.00%,1.75,PASS');
  // Student 2: Midterm Incomplete (Missing Date Range), Final 90.00%, Overall GWA Incomplete
  assert.equal(lines[2], 'DENT-002,"Bob Santos",Incomplete (Missing Date Range),90.00%,Incomplete,INCOMPLETE');
});

test('CSV Generation: incomplete recomputation with prior GWA marks status INCOMPLETE and records prior grade only when server confirmed', () => {
  const dummyStudents = [
    {
      id: 's3',
      studentId: 'DENT-003',
      name: 'Clara Santos',
      email: '',
      yearLevel: 4 as const,
      status: 'active' as const,
      enrolledSubjects: [
        {
          code: 'CLIN401',
          name: 'Clinical Dentistry I',
          units: 3,
          grade: 2.00,
          isClinical: true,
          hasRemedial: false,
          components: {
            quizzes: 0,
            exams: 0,
            practicum: 0,
            attendance: 0,
            calculationMode: 'authoritative_periods',
            termRatio: { midterm: 40, final: 60 },
            previouslyPersisted: true,
            previousGwa: 2.00,
            periods: {
              midterm: { period: 'Midterm', status: 'incomplete', percentage: null, categories: [], incomplete: [{ reason: 'unresolved_attendance' }] },
              final: { period: 'Final', status: 'computed', percentage: 85.0, categories: [], incomplete: [] },
            },
          },
        },
      ],
      clinicHoursCompleted: 50,
      overallGWA: 2.00,
      remedialExams: [],
      classSections: [],
    },
    {
      id: 's4',
      studentId: 'DENT-004',
      name: 'Danilo Cruz',
      email: '',
      yearLevel: 4 as const,
      status: 'active' as const,
      enrolledSubjects: [
        {
          code: 'CLIN401',
          name: 'Clinical Dentistry I',
          units: 3,
          grade: 2.50,
          isClinical: true,
          hasRemedial: false,
          components: {
            quizzes: 0,
            exams: 0,
            practicum: 0,
            attendance: 0,
            calculationMode: 'authoritative_periods',
            termRatio: { midterm: 40, final: 60 },
            previouslyPersisted: false,
            previousGwa: null,
            periods: {
              midterm: { period: 'Midterm', status: 'incomplete', percentage: null, categories: [], incomplete: [{ reason: 'unresolved_attendance' }] },
              final: { period: 'Final', status: 'computed', percentage: 85.0, categories: [], incomplete: [] },
            },
          },
        },
      ],
      clinicHoursCompleted: 50,
      overallGWA: 2.50,
      remedialExams: [],
      classSections: [],
    },
  ];

  const csv = generateGradeSummaryCSV(dummyStudents, 'CLIN401', true);
  const lines = csv.trim().split('\n');
  // Student 3 has previouslyPersisted: true -> Prior: 2.00 (Historical)
  assert.equal(lines[1], 'DENT-003,"Clara Santos",Incomplete (Unresolved Attendance),85.00%,Prior: 2.00 (Historical),INCOMPLETE');
  // Student 4 has previouslyPersisted: false -> Incomplete (no fallback to subj.grade 2.50)
  assert.equal(lines[2], 'DENT-004,"Danilo Cruz",Incomplete (Unresolved Attendance),85.00%,Incomplete,INCOMPLETE');
});

test('CSV Generation: uncomputed period mode outputs Pending and PENDING', () => {
  const dummyStudents = [
    {
      id: 's5',
      studentId: 'DENT-005',
      name: 'Elena Ramos',
      email: '',
      yearLevel: 4 as const,
      status: 'active' as const,
      enrolledSubjects: [
        {
          code: 'CLIN401',
          name: 'Clinical Dentistry I',
          units: 3,
          grade: 1.75, // Legacy grade from earlier semester
          isClinical: true,
          hasRemedial: false,
          components: {
            quizzes: 85,
            exams: 85,
            practicum: 85,
            attendance: 90,
          },
        },
      ],
      clinicHoursCompleted: 50,
      overallGWA: 1.75,
      remedialExams: [],
      classSections: [],
    },
  ];

  const csv = generateGradeSummaryCSV(dummyStudents, 'CLIN401', true);
  const lines = csv.trim().split('\n');
  assert.equal(lines[0], 'Student ID,Name,Midterm %,Final %,Overall GWA,Status');
  assert.equal(lines[1], 'DENT-005,"Elena Ramos",Pending,Pending,Pending,PENDING');
});

test('CSV Generation: legacy mode exports accurately labeled overall columns without duplicating overall grade', () => {
  const dummyStudents = [
    {
      id: 's4',
      studentId: 'DENT-004',
      name: 'David Lim',
      email: '',
      yearLevel: 3 as const,
      status: 'active' as const,
      enrolledSubjects: [
        {
          code: 'ANAT101',
          name: 'General Anatomy',
          units: 3,
          grade: 1.50,
          isClinical: false,
          hasRemedial: false,
          components: {
            quizzes: 85.0,
            practicum: 90.0,
            exams: 88.0,
            attendance: 95.0,
          },
        },
      ],
      clinicHoursCompleted: 0,
      overallGWA: 1.50,
      remedialExams: [],
      classSections: [],
    },
  ];

  const csv = generateGradeSummaryCSV(dummyStudents, 'ANAT101', false);
  const lines = csv.trim().split('\n');
  assert.equal(lines[0], 'Student ID,Name,Quizzes,Practicum,Exams,Attendance,Overall GWA,Remarks');
  assert.equal(lines[1], 'DENT-004,"David Lim",85.0%,90.0%,88.0%,95.0%,1.50,PASS');
});
