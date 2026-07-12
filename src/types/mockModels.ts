export interface Enrollment {
  id: string;
  studentId: string;
  courseId: string;
  sectionId: string;
  enrollmentDate: string; // ISO date string
  status: 'enrolled' | 'dropped' | 'completed';
}

export interface AssessmentCategory {
  id: string;
  name: string;
  description?: string;
}

export interface Assessment {
  id: string;
  courseId: string;
  sectionId: string;
  categoryId: string;
  title: string;
  description?: string;
  maxScore: number;
  weight: number; // percentage of total grade
  date: string; // ISO date string
  archived?: boolean;
}

export interface GradeWeight {
  courseId: string;
  sectionId: string;
  categories: { [categoryId: string]: number }; // sum must be 100
}

export interface StudentScore {
  assessmentId: string;
  studentId: string;
  score: number;
  gradedAt?: string; // ISO date string
}

export interface GradeSummary {
  studentId: string;
  courseId: string;
  sectionId: string;
  totalScore: number;
  gwa: number; // General Weighted Average
  status: 'passed' | 'failed' | 'incomplete';
}

export interface AttendanceRecord {
  id: string;
  studentId: string;
  courseId: string;
  sectionId: string;
  date: string; // ISO date string
  status: 'Present' | 'Late' | 'Absent' | 'Excused';
}

export interface AttendanceLog {
  studentId: string;
  records: AttendanceRecord[];
}

export interface RetentionRecord {
  studentId: string;
  courseId: string;
  sectionId: string;
  date: string; // ISO date string
  status: 'retained' | 'atRisk' | 'dropped';
}

export interface RemedialRecord {
  id: string;
  studentId: string;
  courseId: string;
  sectionId: string;
  description: string;
  createdAt: string; // ISO date string
  status: 'open' | 'closed' | 'archived';
}

export interface PredictionResult {
  studentId: string;
  riskLevel: 'Low Risk' | 'Moderate Risk' | 'High Risk';
  confidence: number; // percentage
  contributingFactors: string[];
  lastUpdated: string; // ISO date string
}

export interface AuditLog {
  id: string;
  timestamp: string; // ISO date string
  user: string;
  action: string;
  entity: string;
  previousValue?: any;
  newValue?: any;
}

export interface Notification {
  id: string;
  type: string; // e.g., 'assessmentCreated', 'gradeSaved'
  title: string;
  message: string;
  createdAt: string; // ISO date string
  read?: boolean;
}
