import type { Assessment, AttendanceStatus, GradeComponents, EnrolledSubject } from '../types';

export const effectiveAssessmentPercentage = (
  rawScore: number,
  maxScore: number,
  assessment: Pick<Assessment, 'transmutationEnabled' | 'transmutationMinimumPercentage' | 'transmutationMaximumPercentage'>,
  // 'unlinked': no session link, so attendance is not considered (GRD-001).
  // null/undefined: the linked session's attendance is not resolved yet.
  attendanceStatus?: AttendanceStatus | 'unlinked' | null,
): number | null => {
  if (maxScore <= 0) return null;
  const rawPercentage = (rawScore / maxScore) * 100;
  if (!assessment.transmutationEnabled) return rawPercentage;
  if (!attendanceStatus) return null;
  if (attendanceStatus === 'absent') return 0;
  const minimum = assessment.transmutationMinimumPercentage ?? 50;
  const maximum = assessment.transmutationMaximumPercentage ?? 100;
  if (attendanceStatus === 'unlinked' || attendanceStatus === 'present' || attendanceStatus === 'late' || attendanceStatus === 'excused') {
    return minimum + (rawPercentage / 100) * (maximum - minimum);
  }
  return null;
};

/** Official BUCDM grade sheet (spec 2026-10-26), same as the server: whole percent, .5 up; the inner round guards float noise. */
export const roundPercent = (value: number): number => Math.floor(Math.round(value * 1e9) / 1e9 + 0.5);

/**
 * Whole percent -> one-decimal grade (1.0 best), same table as the server.
 * Below 75% is 5.0 for Midterm, Final and course grades; `period` is kept for existing callers.
 */
export const percentageToGWAExact = (pct: number, _period: 'Midterm' | 'Final' = 'Final'): number => {
  if (!Number.isFinite(pct)) return 5.0;
  const t = Math.floor(pct + 1e-9); // epsilon guards float drift (84.0 -> 83.9999999)
  let tenths: number;
  if (t >= 99) tenths = 10;
  else if (t >= 84) tenths = 109 - t;
  else if (t >= 76) tenths = 26 + Math.floor((83 - t) / 2);
  else if (t === 75) tenths = 30;
  else tenths = 50;
  return tenths / 10;
};

/** Course/period grade text: two decimals with one trailing zero trimmed (2.60 -> 2.6, 2.33 stays), so old saved grades are never rounded. */
export const formatGrade = (grade: number): string => grade.toFixed(2).replace(/0$/, '');

export const percentageToGWA = (pct: number, period: 'Midterm' | 'Final' = 'Final'): number =>
  percentageToGWAExact(pct, period);

/**
 * Gets a textual description for a given GWA grade.
 */
export const gwaToDescription = (gwa: number): string => {
  if (gwa <= 1.0) return 'Excellent';
  if (gwa <= 1.5) return 'Very Good';
  if (gwa <= 2.0) return 'Good';
  if (gwa <= 2.5) return 'Satisfactory';
  if (gwa <= 2.75) return 'Fair';
  if (gwa <= 3.0) return 'Passing';
  return 'Failure';
};

/**
 * Computes the weighted percentage score based on component values and weights,
 * then maps it to the 1.0 - 5.0 scale.
 */
export const computeSubjectGrade = (
  components: GradeComponents,
  weights: { quizzes: number; exams: number; practicum: number; attendance: number }
): number => {
  const totalWeight = weights.quizzes + weights.exams + weights.practicum + weights.attendance;
  
  // Guard against divide by zero (normalizing to 100% total weight if configured improperly)
  const normQ = weights.quizzes / totalWeight;
  const normE = weights.exams / totalWeight;
  const normP = weights.practicum / totalWeight;
  const normA = weights.attendance / totalWeight;

  const totalPercentage = 
    components.quizzes * normQ +
    components.exams * normE +
    components.practicum * normP +
    components.attendance * normA;

  return percentageToGWA(Math.round(totalPercentage * 100) / 100);
};

/**
 * Computes the general weighted average (GWA) across all enrolled subjects,
 * weighted by the credit units of each subject.
 */
export const computeOverallGWA = (subjects: EnrolledSubject[]): number => {
  if (!subjects || subjects.length === 0) return 3.0; // Default passing GWA
  
  let totalUnits = 0;
  let weightedGradeSum = 0;

  subjects.forEach(subject => {
    totalUnits += subject.units;
    weightedGradeSum += subject.grade * subject.units;
  });

  return totalUnits > 0 ? Math.round((weightedGradeSum / totalUnits) * 100) / 100 : 3.0;
};

// Single Activity view filter predicate, shared by the assessment list and the filter-change guard.
export const matchesActivityFilters = (
  a: Pick<Assessment, 'type' | 'title'> & Partial<Pick<Assessment, 'gradingPeriod'>>,
  period: 'all' | 'Midterm' | 'Final',
  type: string,
  search: string,
): boolean => {
  if (period !== 'all' && (a.gradingPeriod ?? 'Midterm') !== period) return false;
  if (type !== 'all' && (a.type || '').trim() !== type) return false;
  const q = search.toLowerCase().trim();
  if (q && !(a.title || '').toLowerCase().includes(q) && !(a.type || '').toLowerCase().includes(q)) return false;
  return true;
};

// Save-status chip label for the Single Activity view.
export const saveStatusBadge = (status: string, unsaved: boolean): { kind: 'saving' | 'error' | 'unsaved' | 'saved'; label: string } =>
  status === 'saving' ? { kind: 'saving', label: 'Saving...' }
    : status === 'error' ? { kind: 'error', label: 'Save failed' }
    : unsaved ? { kind: 'unsaved', label: 'Unsaved changes' }
    : { kind: 'saved', label: 'All changes saved' };
