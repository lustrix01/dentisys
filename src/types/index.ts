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

export interface AttendanceRecord {
  id: string;
  studentId: string;
  date: string;         // YYYY-MM-DD
  subjectCode: string;
  status: 'present' | 'absent' | 'late' | 'excused';
}

export interface Student {
  id: string;
  studentId: string;    // e.g. "DENT-2023-0142"
  name: string;
  email: string;
  yearLevel: 1 | 2 | 3 | 4; // 1st to 4th Year (Clinicians)
  status: 'active' | 'warning' | 'critical' | 'remedial';
  enrolledSubjects: EnrolledSubject[];
  overallGWA: number;
  clinicHoursCompleted: number; // For clinicians (3rd & 4th years)
  remedialExams: RemedialExam[];
  faceEnrolled?: boolean; // For facial recognition attendance tracking
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
