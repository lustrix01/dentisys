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
  prefix?: string | null;
  firstName?: string;
  middleName?: string | null;
  lastName?: string;
  suffix?: string | null;
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

export type AuthoritativeBiometricStatus = 'active' | 'not_enrolled' | 'enrolling' | 'expired' | 'revoked';
export type BiometricEnrollmentStatus =
  | AuthoritativeBiometricStatus
  | 'unregistered'
  | 'enrolled'
  | 'in_progress'
  | 'rejected';

export const isAuthoritativeActiveEnrolled = (status: BiometricEnrollmentStatus | string | null | undefined): boolean => (
  status === 'active'
);

export interface PasswordChangePayload {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface PasswordChangeResponse {
  status: string;
  message: string;
}
export type LivenessAction = 'blink' | 'turn_left' | 'turn_right';

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
  challengeToken: string;
  actions: [LivenessAction, LivenessAction];
  expiresAt: string;
}

export interface LivenessGuidanceResponse {
  detectedAction: LivenessAction | null;
  faceDetected: boolean;
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
  alreadyRecordedStatus?: 'present' | 'late' | 'absent' | 'excused' | 'unresolved' | null;
  /** @deprecated Use alreadyRecordedStatus, which mirrors the API contract. */
  attendedStatus?: 'present' | 'late' | 'absent' | 'excused' | 'unresolved' | null;
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

export type AttendanceVerificationMethod = 'biometric' | 'faculty_manual' | 'secretary_manual' | 'system_resolution' | 'unknown';

export interface StudentAttendanceLogRecord {
  id: number;
  sessionId?: number;
  sessionCode?: string;
  classSection?: { id: string; name: string };
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

// --- Authoritative Notifications ---
export interface NotificationItem {
  id: number;
  recipientUserId: number;
  type: string;
  title: string;
  body: string;
  entityType?: string | null;
  entityId?: number | null;
  deduplicationKey?: string | null;
  readAt?: string | null;
  createdAt: string;
}

export interface NotificationsResponse {
  status: string;
  notifications: NotificationItem[];
  unreadCount: number;
}

// --- Authoritative Student Academic APIs ---
export interface StudentAcademicAccount {
  userId: string | null;
  email: string | null;
  role: string | null;
  status: string | null;
}

export interface StudentAcademicProfile {
  prefix?: string | null;
  suffix?: string | null;
  id: string;
  studentNumber: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  name: string;
  email: string | null;
  contact: string | null;
  sex: string | null;
  yearLevel: number | null;
  status: string;
  admissionDate: string | null;
  birthdate: string | null;
  account?: StudentAcademicAccount;
}

export interface StudentAcademicClass {
  enrollmentId: string;
  classId: string;
  className: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  units: number;
  isClinical: boolean;
  semester: string;
  schoolYear: string;
  yearLevel: number | null;
  dateEnrolled: string | null;
  grade: number | null;
  percentage: number | null;
  gradeComponents: Record<string, unknown> | null;
  retentionState: string;
  remedial: Record<string, unknown> | null;
  remedialProgression?: RemedialProgression;
  clinicHoursCompleted: number;
}

export type RemedialProgressionStage =
  | 'none'
  | 'attempt_1_pending'
  | 'attempt_2_available'
  | 'attempt_2_pending'
  | 'passed'
  | 'cost_recovery_required'
  | 'legacy_unclassified';

export interface RemedialAttempt {
  attemptNumber: 1 | 2;
  scheduledDate: string | null;
  percentage: number | null;
  outcome: 'pending' | 'passed' | 'failed';
  actorUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RemedialProgression {
  stage: RemedialProgressionStage;
  attempts: RemedialAttempt[];
  passedAttempt: 1 | 2 | null;
  legacyUnclassified: boolean;
}

export interface StudentAcademicDashboardSummary {
  classCount: number;
  gwa: number | null;
  attendanceRate: number | null;
  clinicalHoursCompleted: number;
  retentionAlerts: number;
}

export interface StudentAcademicDashboardResponse {
  status: string;
  student: StudentAcademicProfile;
  summary: StudentAcademicDashboardSummary;
  classes: StudentAcademicClass[];
}

export interface StudentAcademicProfileResponse {
  status: string;
  profile: StudentAcademicProfile;
}

export interface StudentAcademicClassesResponse {
  status: string;
  classes: StudentAcademicClass[];
}

export interface StudentAcademicRetentionResponse {
  status: string;
  retention: {
    records: StudentAcademicClass[];
    atRiskCount: number;
    hasPendingGrades: boolean;
  };
}

// --- Faculty Invitation Lifecycle ---
export interface FacultyInvitationUpdatePayload {
  id: string | number;
  email: string;
  prefix?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  suffix?: string;
  name?: string;
}

export interface FacultyInvitationRevokePayload {
  id: string | number;
}
