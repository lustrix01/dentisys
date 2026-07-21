// src/mock-data/charts.ts

import { AttendanceTrendPoint, GradeDistributionBucket, RetentionDistribution, RiskDistribution, AssessmentPerformance } from "../types/dashboard";

// Attendance trend over the past 7 days
export const attendanceTrendData: AttendanceTrendPoint[] = Array.from({ length: 7 }).map((_, i) => {
  const date = new Date();
  date.setDate(date.getDate() - (6 - i));
  return {
    date: date.toISOString().split('T')[0],
    attendancePct: 85 + Math.round(Math.random() * 10), // 85-95%
  };
});

// Grade distribution (GWA ranges)
export const gradeDistributionData: GradeDistributionBucket[] = [
  { range: "1.0-1.5", count: 20 },
  { range: "1.5-2.0", count: 45 },
  { range: "2.0-2.5", count: 80 },
  { range: "2.5-3.0", count: 50 },
  { range: "3.0-3.5", count: 15 },
];

// Retention distribution
export const retentionDistributionData: RetentionDistribution[] = [
  { status: "Good Standing", count: 180 },
  { status: "Remedial", count: 25 },
  { status: "Not Retained", count: 9 },
];

// Risk distribution
export const riskDistributionData: RiskDistribution[] = [
  { level: "Low Risk", count: 120 },
  { level: "Moderate Risk", count: 40 },
  { level: "High Risk", count: 14 },
];

// Assessment performance (average scores)
export const assessmentPerformanceData: AssessmentPerformance[] = [
  { assessmentTitle: "Quiz 1", averageScore: 78 },
  { assessmentTitle: "Midterm Exam", averageScore: 82 },
  { assessmentTitle: "Quiz 2", averageScore: 75 },
  { assessmentTitle: "Final Exam", averageScore: 88 },
];
