// src/utils/validatePublish.ts

import { Assessment, GradingWeight, StudentScore } from '../types/gradeManagement';

/**
 * Simple validation to ensure grades can be published.
 * Returns true if:
 *   - All categories have a defined weight (non-zero)
 *   - Every student has a score for every assessment (no nulls)
 */
export function validatePublish(
  assessments: Assessment[],
  weights: GradingWeight[],
  studentScores: StudentScore[]
): boolean {
  // 1. Ensure each category present in assessments has a weight
  const categories = new Set(assessments.map((a) => a.category));
  const weightMap = new Map(weights.map((w) => [w.category, w.weight]));
  for (const cat of categories) {
    const w = weightMap.get(cat);
    if (!w || w <= 0) return false;
  }

  // 2. Ensure no missing scores (null) for any student-assessment pair
  const requiredPairs = new Set(assessments.map((a) => a.id));
  const scoresByStudent: Record<string, Set<string>> = {};
  studentScores.forEach((s) => {
    if (s.score == null) return; // missing score makes validation fail later
    if (!scoresByStudent[s.studentId]) scoresByStudent[s.studentId] = new Set();
    scoresByStudent[s.studentId].add(s.assessmentId);
  });

  for (const studentId of Object.keys(scoresByStudent)) {
    const completed = scoresByStudent[studentId];
    if (completed.size !== requiredPairs.size) return false;
  }

  return true;
}
