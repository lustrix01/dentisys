export interface GradeComponents {
  quizzes: number;      // 0-100 percentage
  exams: number;        // 0-100 percentage
  practicum: number;    // 0-100 percentage (clinical practical work)
  attendance: number;   // 0-100 percentage
  [key: string]: unknown;
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
  classId?: string;
  sessionCode?: string | null;
  subjectCode: string;
  status: AttendanceStatus;
  verificationType?: 'facial_geofence' | 'manual_override' | 'standard';
  faceVerified?: boolean;
  locationVerified?: boolean;
  verifiedLocationName?: string;
  verifiedAt?: string;
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
  type: string;
  gradingCategoryId?: string | number | null;
  subjectCode: string;
  classId: string;
  gradingPeriod: 'Midterm' | 'Final';
  maxScore: number;
  weight?: number; // Weight percentage (if applicable, e.g. 15 for 15%)
  dueDate: string;
  instructions?: string;
  remarks?: string;
  status: 'Active' | 'Closed' | 'Archived';
  transmutationEnabled?: boolean;
  transmutationMinimumPercentage?: number;
  transmutationMaximumPercentage?: number;
  attendanceSessionDate?: string | null;
  attendanceSessionCode?: string | null;
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
  transmutationDefaults: {
    minimumPercentage: number;
    maximumPercentage: number;
  };
}

export interface DashboardStats {
  totalStudents: number;
  averageGWA: number;
  criticalStudentsCount: number;
  averageAttendanceRate: number;
}

export type LivenessAction = 'blink' | 'turn_left' | 'turn_right';

export type BiometricEnrollmentStatus = 'unregistered' | 'enrolled' | 'expired' | 'revoked' | 'in_progress' | 'rejected';

export interface StudentBiometricProfile {
  consentGranted: boolean;
  enrollmentStatus: BiometricEnrollmentStatus;
  enrolledAt: string | null;
  expiresAt: string | null;
  usableSampleCount?: number | null;
  requiredUsableSamples: number;
  manualFallbackAvailable: boolean;
  disclosureVersion?: string | null;
}

export interface BiometricConsentPayload {
  granted: boolean;
  disclosureVersion: string;
}

export interface BiometricConsentResponse {
  consentGranted: boolean;
  disclosureVersion: string;
  consentedAt?: string;
}

export interface LivenessChallengeRequest {
  purpose: 'enrollment' | 'attendance';
  attendanceSessionId?: number;
}

export interface LivenessChallengeResponse {
  challengeId: string;
  challengeToken?: string;
  actions: [LivenessAction, LivenessAction];
  expiresAt: string;
}

export interface BiometricEnrollmentResponse {
  enrollmentStatus: BiometricEnrollmentStatus;
  usableSampleCount: number;
  requiredUsableSamples: number;
  enrolledAt?: string | null;
  expiresAt?: string | null;
  message?: string;
}

export interface BiometricRevocationResponse {
  success: boolean;
  enrollmentStatus: BiometricEnrollmentStatus;
  revokedAt?: string;
  message?: string;
}

export interface StudentActiveSession {
  id: number;
  courseCode: string;
  courseName: string;
  room?: string;
  schedule?: string;
  instructorName?: string;
  geofenceRequired?: boolean;
  geofenceEnabled?: boolean;
  isOpen?: boolean;
  attendedStatus?: 'present' | 'late' | 'already_recorded' | null;
  openingTime?: string | null;
  presentCutoff?: string | null;
  lateCutoff?: string | null;
  timingConfigured?: boolean;
  status?: string;
}

export interface AttendanceSessionRevocationPayload {
  sessionId: string | number;
  reason?: string | null;
}

export interface AttendanceSessionRevocationResponse {
  status: string;
  session: Record<string, unknown>;
}

export interface StudentActiveSessionsResponse {
  sessions: StudentActiveSession[];
}

export interface BiometricAttendanceResponse {
  status: 'present' | 'late' | 'already_recorded';
  recordedAt?: string;
  message: string;
  session?: {
    id: number;
    courseCode: string;
  };
}

export type AttendanceVerificationMethod = 'biometric' | 'faculty_manual' | 'secretary_manual';

export interface StudentAttendanceLogRecord {
  id: number;
  sessionId?: number;
  courseCode: string;
  courseName: string;
  room?: string;
  instructorName?: string;
  date: string;
  time: string;
  status: 'present' | 'late' | 'absent' | 'excused' | 'unresolved';
  verificationMethod: AttendanceVerificationMethod;
}

export interface StudentAttendanceLogsResponse {
  records: StudentAttendanceLogRecord[];
  total?: number;
}
