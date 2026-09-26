import type {
  FacultyAttendanceDateRanges,
  FacultyGradeComputeResult,
  GradingPeriodEnum,
  GradingSourceKindEnum,
  FacultyPeriodBreakdown,
  PeriodIncompleteReason,
  FacultyPeriodModeComputedResult,
  FacultyPeriodModeIncompleteResult,
} from '../services/apiClient.ts';
import type { Student, EnrolledSubject } from '../types/index.ts';

export function isPeriodComputeResult(
  result: FacultyGradeComputeResult
): result is FacultyPeriodModeComputedResult | FacultyPeriodModeIncompleteResult {
  return result.status === 'incomplete_period' || (result.status === 'computed' && 'periods' in result);
}

export interface PeriodCategoryDraftRow {
  compositeKey: string;
  tempId: string;
  id?: number | null;
  name: string;
  weight: string;
  defaultMax?: string;
  sortOrder: number;
  gradingPeriod: GradingPeriodEnum;
  sourceKind: GradingSourceKindEnum;
  inUse: boolean;
}

export interface PeriodDraftState {
  termRatio: { midterm: string; final: string };
  midtermCategories: PeriodCategoryDraftRow[];
  finalCategories: PeriodCategoryDraftRow[];
  attendanceDateRanges: {
    midterm: { startDate: string; endDate: string };
    final: { startDate: string; endDate: string };
  };
}

export function buildRowCompositeKey(period: GradingPeriodEnum, id?: number | null, tempId?: string): string {
  return `${period}:${id !== undefined && id !== null ? id : tempId ?? 'new'}`;
}

export function buildDefaultPeriodDraft(): PeriodDraftState {
  return {
    termRatio: { midterm: '40', final: '60' },
    midtermCategories: [
      {
        compositeKey: 'Midterm:preset-m-1',
        tempId: 'preset-m-1',
        name: 'Quiz',
        weight: '25',
        defaultMax: '50',
        sortOrder: 1,
        gradingPeriod: 'Midterm',
        sourceKind: 'assessment',
        inUse: false,
      },
      {
        compositeKey: 'Midterm:preset-m-2',
        tempId: 'preset-m-2',
        name: 'Activity',
        weight: '25',
        defaultMax: '50',
        sortOrder: 2,
        gradingPeriod: 'Midterm',
        sourceKind: 'assessment',
        inUse: false,
      },
      {
        compositeKey: 'Midterm:preset-m-3',
        tempId: 'preset-m-3',
        name: 'Midterm Exam',
        weight: '40',
        defaultMax: '100',
        sortOrder: 3,
        gradingPeriod: 'Midterm',
        sourceKind: 'assessment',
        inUse: false,
      },
      {
        compositeKey: 'Midterm:preset-m-4',
        tempId: 'preset-m-4',
        name: 'Attendance',
        weight: '10',
        defaultMax: '100',
        sortOrder: 4,
        gradingPeriod: 'Midterm',
        sourceKind: 'attendance',
        inUse: false,
      },
    ],
    finalCategories: [
      {
        compositeKey: 'Final:preset-f-1',
        tempId: 'preset-f-1',
        name: 'Quiz',
        weight: '20',
        defaultMax: '50',
        sortOrder: 1,
        gradingPeriod: 'Final',
        sourceKind: 'assessment',
        inUse: false,
      },
      {
        compositeKey: 'Final:preset-f-2',
        tempId: 'preset-f-2',
        name: 'Activity',
        weight: '20',
        defaultMax: '50',
        sortOrder: 2,
        gradingPeriod: 'Final',
        sourceKind: 'assessment',
        inUse: false,
      },
      {
        compositeKey: 'Final:preset-f-3',
        tempId: 'preset-f-3',
        name: 'Laboratory',
        weight: '20',
        defaultMax: '100',
        sortOrder: 3,
        gradingPeriod: 'Final',
        sourceKind: 'assessment',
        inUse: false,
      },
      {
        compositeKey: 'Final:preset-f-4',
        tempId: 'preset-f-4',
        name: 'Final Exam',
        weight: '30',
        defaultMax: '100',
        sortOrder: 4,
        gradingPeriod: 'Final',
        sourceKind: 'assessment',
        inUse: false,
      },
      {
        compositeKey: 'Final:preset-f-5',
        tempId: 'preset-f-5',
        name: 'Attendance',
        weight: '10',
        defaultMax: '100',
        sortOrder: 5,
        gradingPeriod: 'Final',
        sourceKind: 'attendance',
        inUse: false,
      },
    ],
    attendanceDateRanges: {
      midterm: { startDate: '', endDate: '' },
      final: { startDate: '', endDate: '' },
    },
  };
}

export function isValidCalendarDate(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);
  if (month < 1 || month > 12) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function validateDateRanges(ranges: {
  midterm: { startDate: string; endDate: string };
  final: { startDate: string; endDate: string };
}): { valid: boolean; error?: string } {
  const mStart = ranges.midterm.startDate.trim();
  const mEnd = ranges.midterm.endDate.trim();
  const fStart = ranges.final.startDate.trim();
  const fEnd = ranges.final.endDate.trim();

  for (const [val, label] of [
    [mStart, 'Midterm start date'],
    [mEnd, 'Midterm end date'],
    [fStart, 'Finals start date'],
    [fEnd, 'Finals end date'],
  ]) {
    if (val && !isValidCalendarDate(val)) {
      return { valid: false, error: `${label} must be a valid calendar date in YYYY-MM-DD format.` };
    }
  }

  if (mStart && mEnd && mStart > mEnd) {
    return { valid: false, error: 'Midterm start date must be on or before end date.' };
  }

  if (fStart && fEnd && fStart > fEnd) {
    return { valid: false, error: 'Finals start date must be on or before end date.' };
  }

  if (mEnd && fStart && mEnd >= fStart) {
    return { valid: false, error: 'Midterm attendance must end before Finals attendance starts.' };
  }

  return { valid: true };
}

export function normalizeDateRangesForPayload(ranges: {
  midterm: { startDate: string; endDate: string };
  final: { startDate: string; endDate: string };
}): FacultyAttendanceDateRanges {
  return {
    midterm: {
      startDate: ranges.midterm.startDate.trim() || null,
      endDate: ranges.midterm.endDate.trim() || null,
    },
    final: {
      startDate: ranges.final.startDate.trim() || null,
      endDate: ranges.final.endDate.trim() || null,
    },
  };
}

export function formatPeriodIncompleteReason(reason: PeriodIncompleteReason | string): string {
  switch (reason) {
    case 'missing_date_range':
      return 'Missing Date Range';
    case 'no_sessions':
      return 'No Sessions';
    case 'unresolved_attendance':
      return 'Unresolved Attendance';
    case 'no_assessment_results':
      return 'No Assessment Results';
    case 'missing_assessment_score':
      return 'Missing Assessment Score';
    case 'unresolved_assessment_attendance':
      return 'Unresolved Transmuted Attendance';
    case 'duplicate_attendance_sources':
      return 'Duplicate Attendance';
    default:
      return reason ? reason.replace(/_/g, ' ') : 'Incomplete';
  }
}

export interface StudentPeriodEvaluation {
  isPeriodMode: boolean;
  midtermStatus: 'computed' | 'incomplete' | 'unconfigured' | 'pending';
  midtermPercentage: number | null;
  midtermReasons: string[];
  finalStatus: 'computed' | 'incomplete' | 'unconfigured' | 'pending';
  finalPercentage: number | null;
  finalReasons: string[];
  overallGwa: number | null;
  overallPercentage: number | null;
  historicalGwa: number | null;
  isIncomplete: boolean;
  statusText: string;
}

export function extractPeriodEvaluation(
  subj?: EnrolledSubject | null,
  computeResult?: FacultyGradeComputeResult | null,
  configurationMode?: 'overall' | 'periods' | boolean | null
): StudentPeriodEvaluation {
  const isPeriodConfigured = typeof configurationMode === 'boolean'
    ? configurationMode
    : typeof configurationMode === 'string'
    ? configurationMode === 'periods'
    : (computeResult ? isPeriodComputeResult(computeResult) : false) ||
      Boolean(
        subj?.components &&
        typeof subj.components === 'object' &&
        (subj.components as any).calculationMode === 'authoritative_periods'
      );

  // If we have an authoritative computeResult for this enrollment
  if (computeResult && isPeriodComputeResult(computeResult)) {
    const midtermBreakdown = computeResult.periods?.midterm as FacultyPeriodBreakdown | undefined;
    const finalBreakdown = computeResult.periods?.final as FacultyPeriodBreakdown | undefined;

    const midtermPercentage = typeof midtermBreakdown?.percentage === 'number' ? midtermBreakdown.percentage : null;
    const finalPercentage = typeof finalBreakdown?.percentage === 'number' ? finalBreakdown.percentage : null;

    const midtermReasons = Array.isArray(midtermBreakdown?.incomplete)
      ? midtermBreakdown.incomplete.map(i => formatPeriodIncompleteReason(i.reason))
      : [];
    const finalReasons = Array.isArray(finalBreakdown?.incomplete)
      ? finalBreakdown.incomplete.map(i => formatPeriodIncompleteReason(i.reason))
      : [];

    const isComputed = computeResult.status === 'computed';
    const overallGwa = isComputed ? computeResult.gwa : null;
    const overallPercentage = isComputed ? computeResult.percentage : null;

    // Finding 2: For incomplete results, remove the subj.grade fallback when previouslyPersisted is false.
    // Display historical grades only when confirmed by the server.
    const historicalGwa = !isComputed && Boolean(computeResult.previouslyPersisted) && typeof computeResult.previousGwa === 'number' && computeResult.previousGwa > 0
      ? computeResult.previousGwa
      : null;
    const isIncomplete = !isComputed || midtermBreakdown?.status !== 'computed' || finalBreakdown?.status !== 'computed';

    return {
      isPeriodMode: true,
      midtermStatus: midtermBreakdown?.status ?? 'incomplete',
      midtermPercentage,
      midtermReasons,
      finalStatus: finalBreakdown?.status ?? 'incomplete',
      finalPercentage,
      finalReasons,
      overallGwa,
      overallPercentage,
      historicalGwa,
      isIncomplete,
      statusText: isComputed ? (overallGwa === 5.0 ? 'FAILED' : 'PASS') : 'INCOMPLETE',
    };
  }

  // Fallback to persisted grade components JSON on the enrolled subject
  if (subj && subj.components && typeof subj.components === 'object') {
    const comps = (subj.components as unknown) as Record<string, unknown>;
    if (comps.calculationMode === 'authoritative_periods' && comps.periods && typeof comps.periods === 'object') {
      const p = comps.periods as Record<string, unknown>;
      const mid = p.midterm as Record<string, unknown> | undefined;
      const fin = p.final as Record<string, unknown> | undefined;

      const midtermPercentage = typeof mid?.percentage === 'number' ? mid.percentage : null;
      const finalPercentage = typeof fin?.percentage === 'number' ? fin.percentage : null;

      const midtermReasons = Array.isArray(mid?.incomplete)
        ? (mid.incomplete as Array<{ reason: string }>).map(i => formatPeriodIncompleteReason(i.reason))
        : [];
      const finalReasons = Array.isArray(fin?.incomplete)
        ? (fin.incomplete as Array<{ reason: string }>).map(i => formatPeriodIncompleteReason(i.reason))
        : [];

      const isMidComputed = mid?.status === 'computed';
      const isFinComputed = fin?.status === 'computed';
      const isBothComputed = isMidComputed && isFinComputed;
      const overallGwa = isBothComputed && typeof subj.grade === 'number' && subj.grade > 0 ? subj.grade : null;

      // Finding 2: Display historical grades only when confirmed by the server (previouslyPersisted: true)
      const historicalGwa = !isBothComputed && Boolean(comps.previouslyPersisted) && typeof comps.previousGwa === 'number' && comps.previousGwa > 0
        ? comps.previousGwa
        : null;
      const overallPercentage = isBothComputed && typeof comps.percentage === 'number' ? comps.percentage : null;
      const isIncomplete = !isBothComputed;

      return {
        isPeriodMode: true,
        midtermStatus: (mid?.status as 'computed' | 'incomplete') ?? 'incomplete',
        midtermPercentage,
        midtermReasons,
        finalStatus: (fin?.status as 'computed' | 'incomplete') ?? 'incomplete',
        finalPercentage,
        finalReasons,
        overallGwa,
        overallPercentage,
        historicalGwa,
        isIncomplete,
        statusText: isBothComputed && overallGwa !== null ? (overallGwa === 5.0 ? 'FAILED' : 'PASS') : 'INCOMPLETE',
      };
    }
  }

  // Finding 1: If configured in period mode but no period computation has run yet
  if (isPeriodConfigured) {
    return {
      isPeriodMode: true,
      midtermStatus: 'pending',
      midtermPercentage: null,
      midtermReasons: ['Pending Computation'],
      finalStatus: 'pending',
      finalPercentage: null,
      finalReasons: ['Pending Computation'],
      overallGwa: null,
      overallPercentage: null,
      historicalGwa: null,
      isIncomplete: true,
      statusText: 'PENDING',
    };
  }

  // Legacy single-list or uncomputed
  const legacyGrade = subj && typeof subj.grade === 'number' && subj.grade > 0 ? subj.grade : null;
  return {
    isPeriodMode: false,
    midtermStatus: 'unconfigured',
    midtermPercentage: null,
    midtermReasons: [],
    finalStatus: 'unconfigured',
    finalPercentage: null,
    finalReasons: [],
    overallGwa: legacyGrade,
    overallPercentage: null,
    historicalGwa: null,
    isIncomplete: legacyGrade === null,
    statusText: legacyGrade !== null ? (legacyGrade === 5.0 ? 'FAILED' : 'PASS') : 'UNCOMPUTED',
  };
}

export function generateGradeSummaryCSV(
  students: Student[],
  selectedSubjectCode: string,
  isPeriodMode: boolean,
  computeResultsByEnrollment?: Map<string, FacultyGradeComputeResult>
): string {
  if (isPeriodMode) {
    const headers = 'Student ID,Name,Midterm %,Final %,Overall GWA,Status\n';
    const rows = students
      .map(student => {
        const subj = student.enrolledSubjects.find(sub => sub.code === selectedSubjectCode);
        const enrollmentId = subj?.enrollmentId;
        const computeResult = enrollmentId && computeResultsByEnrollment ? computeResultsByEnrollment.get(enrollmentId) : null;
        const evalResult = extractPeriodEvaluation(subj, computeResult, isPeriodMode);

        const midtermVal =
          evalResult.midtermPercentage !== null
            ? `${evalResult.midtermPercentage.toFixed(2)}%`
            : evalResult.midtermStatus === 'pending'
            ? 'Pending'
            : evalResult.midtermReasons.length > 0
            ? `Incomplete (${evalResult.midtermReasons[0]})`
            : 'Incomplete';

        const finalVal =
          evalResult.finalPercentage !== null
            ? `${evalResult.finalPercentage.toFixed(2)}%`
            : evalResult.finalStatus === 'pending'
            ? 'Pending'
            : evalResult.finalReasons.length > 0
            ? `Incomplete (${evalResult.finalReasons[0]})`
            : 'Incomplete';

        const gwaVal =
          evalResult.overallGwa !== null
            ? evalResult.overallGwa.toFixed(2)
            : evalResult.historicalGwa !== null
            ? `Prior: ${evalResult.historicalGwa.toFixed(2)} (Historical)`
            : evalResult.statusText === 'PENDING'
            ? 'Pending'
            : 'Incomplete';
        const statusVal = evalResult.statusText;

        return `${student.studentId},"${student.name}",${midtermVal},${finalVal},${gwaVal},${statusVal}`;
      })
      .join('\n');
    return headers + rows;
  }

  // Legacy Overall Mode
  const headers = 'Student ID,Name,Quizzes,Practicum,Exams,Attendance,Overall GWA,Remarks\n';
  const rows = students
    .map(student => {
      const subj = student.enrolledSubjects.find(sub => sub.code === selectedSubjectCode);
      const quizzes = subj && typeof subj.components?.quizzes === 'number' ? `${subj.components.quizzes.toFixed(1)}%` : '—';
      const practicum = subj && typeof subj.components?.practicum === 'number' ? `${subj.components.practicum.toFixed(1)}%` : '—';
      const exams = subj && typeof subj.components?.exams === 'number' ? `${subj.components.exams.toFixed(1)}%` : '—';
      const attendance = subj && typeof subj.components?.attendance === 'number' ? `${subj.components.attendance.toFixed(1)}%` : '—';
      const gradeVal = subj && typeof subj.grade === 'number' && subj.grade > 0 ? subj.grade.toFixed(2) : '—';
      const statusText = subj && typeof subj.grade === 'number' && subj.grade > 0
        ? (subj.grade === 5.0 ? 'FAILED' : 'PASS')
        : 'UNCOMPUTED';
      return `${student.studentId},"${student.name}",${quizzes},${practicum},${exams},${attendance},${gradeVal},${statusText}`;
    })
    .join('\n');
  return headers + rows;
}
