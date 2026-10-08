import { Assessment, AttendanceStatus, GradeComponents, EnrolledSubject } from '../types';

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

/**
 * Converts a raw percentage score (50-100) to the exact Philippine academic scale (1.00 to 5.00)
 * using linear interpolation across benchmarks (e.g. 78.16% -> 2.73, 87.34% -> 1.81).
 * 1.00 is excellent, 3.00 is passing, 5.00 is failing.
 */
export const percentageToGWA = (pct: number): number => {
  if (!Number.isFinite(pct)) return 5.0;
  if (pct >= 97) return 1.0;
  if (pct < 75) return 5.0;

  const benchmarks = [
    { pct: 97, grade: 1.0 },
    { pct: 94, grade: 1.25 },
    { pct: 91, grade: 1.5 },
    { pct: 88, grade: 1.75 },
    { pct: 85, grade: 2.0 },
    { pct: 82, grade: 2.25 },
    { pct: 80, grade: 2.5 },
    { pct: 78, grade: 2.75 },
    { pct: 75, grade: 3.0 },
  ];

  for (let i = 0; i < benchmarks.length - 1; i++) {
    const high = benchmarks[i];
    const low = benchmarks[i + 1];
    if (pct >= low.pct && pct <= high.pct) {
      const fraction = (pct - low.pct) / (high.pct - low.pct);
      const grade = low.grade - fraction * (low.grade - high.grade);
      return Math.round(grade * 100) / 100;
    }
  }

  return 3.0;
};

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
