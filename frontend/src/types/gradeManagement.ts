// src/types/gradeManagement.ts

export interface ClassInfo {
  id: string;
  subjectId: string;
  sectionId: string;
  academicYear: string;
  semester: string;
  instructorId: string;
  name?: string;
}

export interface Assessment {
  id: string;
  name: string;
  category: string;
  maxScore: number;
  dueDate: string;
  status: 'active' | 'archived' | 'deleted' | string;
  displayOrder: number;
}

export interface GradingWeight {
  category: string;
  weight: number;
}

export interface StudentScore {
  studentId: string;
  assessmentId: string;
  score: number | null;
  scores?: Record<string, number>;
}

export interface ComputedGrade {
  studentId: string;
  weightedPercentage: number;
  gwa: number;
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

export interface GradeManagementData {
  summary?: any;
  classRecord?: any;
  assessments: Assessment[];
  weights: GradingWeight[];
  studentScores: StudentScore[];
  computedGrades?: ComputedGrade[];
}

export interface GradeManagementState {
  classInfo: ClassInfo | null;
  assessments: Assessment[];
  weights: GradingWeight[];
  studentScores: StudentScore[];
  computedGrades: ComputedGrade[];
  isReadOnly: boolean;
  autosaveStatus: 'idle' | 'saving' | 'saved';
  lastSaved?: Date;
  error?: string;
  showAssessmentDrawer: boolean;
  showWeightDrawer: boolean;
  showStudentSummaryDrawer: boolean;
  showPublishDialog: boolean;
  showImportDialog: boolean;
  showExportDialog: boolean;
  selectedStudentId: string | null;
  students: GradeStudent[];
  academicYear: string;
  semester: string;
  subjectCode: string;
  sectionId: string;
  searchTerm: string;
}
