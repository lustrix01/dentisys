// src/utils/calculateCategoryAverages.ts

import { Assessment, StudentScore } from '../types/gradeManagement';

/**
 * Compute category averages for a single student.
 * Returns a map: category -> average (0-100) or null if any score missing.
 */
export function calculateCategoryAverages(
  studentId: string,
  assessments: Assessment[],
  studentScores: StudentScore[]
): Record<string, number | null> {
  const result: Record<string, { sumScore: number; sumMax: number; missing: boolean }> = {};

  // Initialize categories
  assessments.forEach((ass) => {
    if (!result[ass.category]) {
      result[ass.category] = { sumScore: 0, sumMax: 0, missing: false };
    }
  });

  // Map scores for quick lookup
  const scoreMap = new Map(
    studentScores
      .filter((s) => s.studentId === studentId)
      .map((s) => [s.assessmentId, s.score])
  );

  assessments.forEach((ass) => {
    const score = scoreMap.get(ass.id);
    if (score == null) {
      // Missing score marks category as incomplete
      result[ass.category].missing = true;
    } else {
      result[ass.category].sumScore += score;
    }
    result[ass.category].sumMax += ass.maxScore;
  });

  const averages: Record<string, number | null> = {};
  for (const category in result) {
    const { sumScore, sumMax, missing } = result[category];
    averages[category] = missing ? null : Number(((sumScore / sumMax) * 100).toFixed(2));
  }
  return averages;
}
