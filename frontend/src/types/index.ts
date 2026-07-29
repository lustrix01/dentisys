export interface GradeComponents {
  quizzes: number;      // 0-100 percentage
  exams: number;        // 0-100 percentage
  practicum: number;    // 0-100 percentage (clinical practical work)
  attendance: number;   // 0-100 percentage
}

export interface EnrolledSubject {
  code: string;
  name: string;
  units: number;
  isClinical: boolean;
  components: GradeComponents;
  grade: number;        // 1.0 - 5.0 scale (computed or overridden)
  hasRemedial: boolean;
  classId?: string;
  enrollmentId?: string;
}

export interface RemedialExam {
  id: string;
  studentId: string;
  studentName: string;
  subjectCode: string;
  subjectName: string;
  originalGrade: number; // e.g., 2.75, 3.0, 5.0
  remedialScore: number | null; // 0-100 percentage
  remedialGrade: number | null; // e.g., 2.5 (cap) or 5.0
  examDate: string;
  status: 'pending' | 'passed' | 'failed';
  notes?: string;
}

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

export interface AttendanceOverrideAudit {
  id: string;
  previousStatus: AttendanceStatus;
  newStatus: AttendanceStatus;
  reason: string;
  changedBy: string;
  changedByName: string;
  changedAt: string;
}

export interface AttendanceRecord {
  id: string;
  studentId: string;
  date: string;         // YYYY-MM-DD
  subjectCode: string;
  status: AttendanceStatus;
  overrideReason?: string;
  overrideBy?: string;
  overrideByName?: string;
  overrideAt?: string;
  auditTrail?: AttendanceOverrideAudit[];
}

export interface RetentionLog {
  id: string;
  studentId: string;
  date: string;
  previousStatus: 'active' | 'warning' | 'critical' | 'remedial';
  newStatus: 'active' | 'warning' | 'critical' | 'remedial';
  remarks: string;
  changedBy: string;
}

export interface Student {
  id: string;
  studentId: string;    // e.g. "DENT-2023-0142"
  name: string;
  email: string;
  classId?: string;
  className?: string;
  classSections?: Array<{ classId: string; className: string; enrollmentId: string }>;
  yearLevel: 1 | 2 | 3 | 4; // 1st to 4th Year (Clinicians)
  status: 'active' | 'warning' | 'critical' | 'remedial';
  enrolledSubjects: EnrolledSubject[];
  overallGWA: number;
  clinicHoursCompleted: number; // For clinicians (3rd & 4th years)
  remedialExams: RemedialExam[];
  faceEnrolled?: boolean; // For facial recognition attendance tracking
  consentStatus?: 'pending' | 'approved' | 'declined';
  consentRespondedAt?: string;
  faceEnrollmentDetails?: { images: string[]; status: string; enrolledAt: string };
  retentionHistory?: RetentionLog[];
}

export interface Assessment {
  id: string;
  title: string;
  type: 'Quiz' | 'Activity' | 'Assignment' | 'Laboratory' | 'Midterm Exam' | 'Final Exam' | 'Others';
  subjectCode: string;
  classId: string;
  gradingPeriod: 'Midterm' | 'Final';
  maxScore: number;
  weight?: number; // Weight percentage (if applicable, e.g. 15 for 15%)
  dueDate: string;
  instructions?: string;
  remarks?: string;
  status: 'Active' | 'Closed' | 'Archived';
  createdAt: string;
}

export interface AssessmentScore {
  id: string;
  assessmentId: string;
  studentId: string;
  score: number;
  submittedAt: string;
  remarks?: string;
}

export interface GradingComponentConfig {
  subjectCode: string;
  category: 'Quiz' | 'Activity' | 'Assignment' | 'Laboratory' | 'Midterm Exam' | 'Final Exam' | 'Attendance';
  weight: number; // 0-100 percentage
  maxScore: number;
}

export interface SystemSettings {
  retentionThreshold: number; // default: 2.5
  weights: {
    quizzes: number;
    exams: number;
    practicum: number;   // Clinical practicum
    attendance: number;
  };
  theme: 'light' | 'dark';
}

export interface DashboardStats {
  totalStudents: number;
  averageGWA: number;
  criticalStudentsCount: number;
  averageAttendanceRate: number;
}
