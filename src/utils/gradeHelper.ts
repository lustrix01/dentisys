import { GradeComponents, EnrolledSubject } from '../types';

/**
 * Converts a raw percentage score (50-100) to the Philippine academic scale (1.0 to 5.0).
 * 1.0 is excellent, 3.0 is passing, 5.0 is failing.
 */
export const percentageToGWA = (pct: number): number => {
  if (pct >= 97) return 1.0;
  if (pct >= 94) return 1.25;
  if (pct >= 91) return 1.5;
  if (pct >= 88) return 1.75;
  if (pct >= 85) return 2.0;
  if (pct >= 82) return 2.25;
  if (pct >= 80) return 2.5; // Strict retention limit for dental majors
  if (pct >= 78) return 2.75;
  if (pct >= 75) return 3.0; // Passing grade
  return 5.0; // Failure
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
