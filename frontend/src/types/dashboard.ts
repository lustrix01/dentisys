// src/types/dashboard.ts

/** Summary numbers displayed in the statistic cards */
export interface DashboardSummary {
  assignedClasses: number;
  assignedSubjects: number;
  totalStudents: number;
  attendanceRate: number; // percentage (0-100)
  publishedGrades: number;
  pendingDrafts: number;
  studentsUnderRemedial: number;
  studentsAtRisk: number;
}

/** Information for each class shown in the Assigned Classes table */
export interface ClassInfo {
  id: string;
  subject: string;
  section: string;
  schedule: string;
  studentCount: number;
  room?: string;
  attendanceRate: number; // percentage
  published: boolean;
}

/** Assessment data for Recent Assessments section */
export interface AssessmentInfo {
  id: string;
  title: string;
  subject: string;
  dueDate: string; // ISO date
  status: 'upcoming' | 'completed' | 'archived';
  category: string;
}

/** Student information that requires attention */
export interface StudentAttentionInfo {
  id: string;
  studentNumber: string;
  name: string; // full name
  subject: string;
  riskLevel: 'Low' | 'Moderate' | 'High';
  attendancePct: number;
  gwa: number;
  retentionStatus: string;
}

/** Notification data */
export interface NotificationInfo {
  id: string;
  type: string;
  title: string;
  message: string;
  createdAt: string; // ISO date
  read?: boolean;
}

/** Upcoming deadline information */
export interface DeadlineInfo {
  id: string;
  title: string;
  date: string; // ISO date
  relatedEntity?: string;
}

/** Chart data structures */
export interface AttendanceTrendPoint {
  date: string; // ISO date
  attendancePct: number;
}

export interface GradeDistributionBucket {
  range: string; // e.g., "1.0-1.5"
  count: number;
}

export interface RetentionDistribution {
  status: 'Good Standing' | 'Remedial' | 'Not Retained';
  count: number;
}

export interface RiskDistribution {
  level: 'Low Risk' | 'Moderate Risk' | 'High Risk';
  count: number;
}

export interface AssessmentPerformance {
  assessmentTitle: string;
  averageScore: number;
}

export interface DashboardCharts {
  attendanceTrend: AttendanceTrendPoint[];
  gradeDistribution: GradeDistributionBucket[];
  retentionDistribution: RetentionDistribution[];
  riskDistribution: RiskDistribution[];
  assessmentPerformance: AssessmentPerformance[];
}
