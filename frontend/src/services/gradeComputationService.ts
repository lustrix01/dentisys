// src/services/gradeComputationService.ts

import { GradeManagementState, ComputedGrade } from '../types/gradeManagement';
import { calculateCategoryAverages } from '../utils/calculateCategoryAverages';
import { calculateWeightedPercentage } from '../utils/calculateWeightedPercentage';
import { calculatePhilippineGWA } from '../utils/calculatePhilippineGWA';
import { calculateRemarks } from '../utils/calculateRemarks';
import { calculateRetention } from '../utils/calculateRetention';

/**
 * Compute grades for all students based on the current grade management state.
 * Returns an array of ComputedGrade objects.
 */
export function computeGrades(state: GradeManagementState): ComputedGrade[] {
  const { assessments, weights, studentScores } = state;

  // Map of category -> weight
  const weightMap = new Map(weights.map((w) => [w.category, w.weight]));

  // Gather unique student IDs
  const studentIds = Array.from(new Set(studentScores.map((s) => s.studentId)));

  const computed: ComputedGrade[] = [];

  for (const studentId of studentIds) {
    // Category averages for this student
    const categoryAverages = calculateCategoryAverages(studentId, assessments, studentScores);

    // If any category missing scores, mark as incomplete
    const missing = Object.values(categoryAverages).some((v) => v === null);
    if (missing) {
      computed.push({
        studentId,
        weightedPercentage: 0,
        gwa: 0,
        remarks: 'Incomplete',
        retentionStatus: 'Not Retained',
      });
      continue;
    }

    // Weighted contributions
    let weightedSum = 0;
    for (const category in categoryAverages) {
      const avg = categoryAverages[category] as number;
      const weight = weightMap.get(category) ?? 0;
      weightedSum += calculateWeightedPercentage(avg, weight);
    }

    const gwa = calculatePhilippineGWA(weightedSum);
    const remarks = calculateRemarks(gwa);
    const retention = calculateRetention(gwa);

    computed.push({
      studentId,
      weightedPercentage: weightedSum,
      gwa,
      remarks,
      retentionStatus: retention,
    });
  }

  return computed;
}
