// src/types/gradeManagement.ts

/**
 * Types used across the Grade Management Workspace.
 */

export interface ClassInfo {
  id: string;
  subjectId: string;
  sectionId: string;
  academicYear: string;
  semester: string;
  instructorId: string;
}

export interface Assessment {
  id: string;
  name: string;
  category: string;
  maxScore: number;
  dueDate: string; // ISO date string
  status: 'active' | 'archived' | 'deleted';
  displayOrder: number;
}

export interface GradingWeight {
  category: string;
  weight: number; // percentage (e.g., 20 for 20%)
}

export interface StudentScore {
  studentId: string;
  assessmentId: string;
  score: number | null; // null = not graded
}

export interface ComputedGrade {
  studentId: string;
  weightedPercentage: number;
  gwa: number; // Philippine GWA (0-4 scale or 0-100?)
  remarks: string;
  retentionStatus: string;
  riskLevel?: string;
}

export interface GradeStudent {
  id: string;
  studentNumber: string;
  name: string;
  classId: string;
  className: string;
  subjectCode: string;
  subjectName: string;
  attendancePercentage: number;
}

export interface GradeManagementState {
  classInfo: ClassInfo | null;
  assessments: Assessment[];
  weights: GradingWeight[];
  studentScores: StudentScore[];
  computedGrades: ComputedGrade[];
  isReadOnly: boolean; // after publishing
  autosaveStatus: 'idle' | 'saving' | 'saved';
  lastSaved?: Date;
  error?: string;
  // UI flags for drawers/dialogs
  showAssessmentDrawer: boolean;
  showWeightDrawer: boolean;
  showStudentSummaryDrawer: boolean;
  showPublishDialog: boolean;
  showImportDialog: boolean;
  showExportDialog: boolean;
  // currently selected student for summary
  selectedStudentId: string | null;
  students: GradeStudent[];
  academicYear: string;
  semester: string;
  subjectCode: string;
  sectionId: string;
  searchTerm: string;
}
