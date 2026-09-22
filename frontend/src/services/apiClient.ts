import type {
  LoginResponse,
  EnrollStartResponse,
  EnrollConfirmResponse,
  MfaSuccessResponse,
  SafeUser,
} from '../types/auth';
import type {
  StudentBiometricProfile,
  BiometricConsentPayload,
  BiometricConsentResponse,
  LivenessChallengeRequest,
  LivenessChallengeResponse,
  BiometricEnrollmentResponse,
  BiometricRevocationResponse,
  StudentActiveSession,
  StudentActiveSessionsResponse,
  BiometricAttendanceResponse,
  StudentAttendanceLogRecord,
  StudentAttendanceLogsResponse,
} from '../types';

const configuredBase = import.meta.env.VITE_API_BASE_URL?.trim();
const API_BASE_URL = configuredBase
  ? configuredBase.replace(/\/+$/, '')
  : '/api';

let accessToken: string | null = null;
let refreshInFlight: Promise<{ access_token: string; user: { user_id: number } }> | null = null;

export function setAccessToken(token: string): void {
  accessToken = token;
}

export function clearAccessToken(): void {
  accessToken = null;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export class ApiError extends Error {
  status: number;
  errors?: unknown;
  code?: string;
  requestId?: string;
  details?: Record<string, unknown>;
  constructor(status: number, message: string, errors?: unknown, code?: string, requestId?: string, details?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.errors = errors;
    this.code = code;
    this.requestId = requestId;
    this.details = details;
  }
}

const KNOWN_MESSAGES: Record<number, Record<string, string>> = {
  400: {
    'Validation failed.': 'Please check your input and try again.',
    'Verification code required.': 'Please enter a verification code.',
    'Invalid verification code.': 'Invalid verification code. Please try again.',
    'Recovery code required.': 'Please enter a recovery code.',
    'Consent required.': 'Biometric consent is required before proceeding.',
    'Biometric not enrolled.': 'Face registration is required before taking session attendance.',
    'Enrollment expired.': 'Your face registration has expired for this semester. Please re-enroll.',
    'Session not active.': 'This attendance session is not currently open for check-in.',
    'Liveness failed.': 'Liveness check could not be verified. Please follow the instructions and try again.',
    'Biometric verification failed.': 'Face could not be verified. Please try again or seek manual attendance.',
    'Geofence failed.': 'You are outside the designated attendance area for this session.',
    'Already recorded.': 'Attendance has already been recorded for this session.',
    'Challenge expired.': 'Liveness challenge expired. Please try again.',
    'Challenge invalid.': 'Liveness challenge is invalid. Please try again.',
  },
  401: {
    'Invalid credentials.': 'Invalid email or password.',
    'Incorrect ownership password.': 'Incorrect account password.',
    'Invalid Google identity.': 'Google identity could not be verified.',
    'Invalid enrollment stage.': 'Enrollment session expired. Please log in again.',
    'Authentication required.': 'Your session has expired. Please log in again.',
  },
  429: {
    'Too many requests.': 'Too many attempts. Please wait and try again.',
  },
  404: {
    'No existing DentiSys account was found.': 'No existing DentiSys account was found.',
    'Biometric profile not found.': 'Face registration profile not found. Please complete enrollment first.',
    'Attendance session not found.': 'Attendance session not found or has ended.',
  },
  409: {
    'This DentiSys account is linked to another Google identity.': 'This account is already linked to another Google identity.',
    'Google identity does not match the invited Faculty email.': 'Google identity does not match the invited Faculty email.',
    'Google identity does not match the invited Student email.': 'Google identity does not match the invited Student email.',
    'Attendance already recorded.': 'Attendance has already been recorded for this session.',
    'Biometric enrollment already active.': 'Biometric profile is already enrolled.',
  },
  503: {
    'Biometric service unavailable.': 'Biometric service is temporarily unavailable. Please request manual attendance.',
  },
};

function mapError(status: number, backendMessage: string, responseData?: unknown): string {
  if (responseData && typeof responseData === 'object') {
    const dataObj = responseData as Record<string, unknown>;
    const code = typeof dataObj.code === 'string' ? dataObj.code : undefined;
    if (code) {
      const codeMessages: Record<string, string> = {
        consent_required: 'Biometric consent is required before proceeding.',
        biometric_not_enrolled: 'Face registration is required before taking session attendance.',
        not_enrolled: 'Face registration is required before taking session attendance.',
        enrollment_expired: 'Your face registration has expired for this semester. Please re-enroll.',
        session_not_active: 'This attendance session is not currently open for check-in.',
        challenge_expired: 'Liveness challenge expired. Please try again.',
        challenge_invalid: 'Liveness challenge is invalid. Please try again.',
        challenge_used: 'Liveness challenge already used. Please request a new challenge.',
        liveness_failed: 'Liveness check could not be verified. Please follow the instructions and try again.',
        biometric_verification_failed: 'Face could not be verified. Please try again or seek manual attendance.',
        geofence_failed: 'You are outside the designated attendance area for this session.',
        already_recorded: 'Attendance has already been recorded for this session.',
        biometric_service_unavailable: 'Biometric verification is temporarily unavailable. Please request manual attendance.',
      };
      if (codeMessages[code]) {
        return codeMessages[code];
      }
    }
  }

  if ((status === 400 || status === 422) && responseData && typeof responseData === 'object') {
    const dataObj = responseData as Record<string, unknown>;
    if (dataObj.errors) {
      if (typeof dataObj.errors === 'string' && dataObj.errors.trim()) {
        return dataObj.errors;
      }
      if (Array.isArray(dataObj.errors)) {
        for (const validationError of dataObj.errors) {
          if (typeof validationError === 'string' && validationError.trim()) {
            return validationError;
          }
          if (validationError && typeof validationError === 'object') {
            const message = (validationError as Record<string, unknown>).message;
            if (typeof message === 'string' && message.trim()) {
              return message;
            }
          }
        }
      }
      if (typeof dataObj.errors === 'object' && dataObj.errors !== null) {
        const errMap = dataObj.errors as Record<string, unknown>;
        if (errMap.email) {
          const emailErr = Array.isArray(errMap.email) ? errMap.email[0] : errMap.email;
          if (emailErr) return String(emailErr);
        }
        const values = Object.values(errMap);
        for (const val of values) {
          if (typeof val === 'string' && val.trim()) return val;
          if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'string') return String(val[0]);
        }
      }
    }
  }

  const statusMap = KNOWN_MESSAGES[status];
  if (statusMap && statusMap[backendMessage]) {
    return statusMap[backendMessage];
  }
  if (status === 400 && backendMessage && backendMessage !== 'Validation failed.') {
    return backendMessage;
  }
  if (status === 403) {
    return backendMessage;
  }
  if (status === 400) return 'Please check your input and try again.';
  if (status === 422) return backendMessage || 'Please correct the highlighted fields.';
  if (status === 409) return backendMessage || 'This request conflicts with the current account state.';
  if (status === 401) return 'Authentication failed. Please log in again.';
  if (status === 403) return 'Access denied. Contact the administrator.';
  if (status === 429) return 'Too many attempts. Please wait and try again.';
  if (status === 503) return 'Service is temporarily unavailable. Please try again later.';
  if (status >= 500) return 'A server error occurred. Please try again later.';
  return 'An unexpected error occurred. Please try again.';
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  tokenOverride?: string,
): Promise<T> {
  const headers: Record<string, string> = {
    accept: 'application/json',
  };

  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  if (body !== undefined && !isFormData) {
    headers['Content-Type'] = 'application/json';
  }

  const token = tokenOverride ?? accessToken;
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let response: Response;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      credentials: 'include',
      body: body !== undefined ? (isFormData ? (body as BodyInit) : JSON.stringify(body)) : undefined,
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(0, 'Unable to connect to the server. Check your connection.');
  } finally {
    clearTimeout(timeoutId);
  }

  let responseData: unknown;
  try {
    responseData = await response.json();
  } catch {
    throw new ApiError(response.status, mapError(response.status, ''));
  }

  const semanticError =
    responseData !== null &&
    typeof responseData === 'object' &&
    (responseData as Record<string, unknown>).status === 'error';

  if (!response.ok || semanticError) {
    const errorStatus = response.ok ? 500 : response.status;
    const backendMessage =
      responseData && typeof responseData === 'object' && 'message' in responseData
        ? String((responseData as Record<string, unknown>).message)
        : '';
    const errorsPayload =
      responseData && typeof responseData === 'object' && 'errors' in responseData
        ? (responseData as Record<string, unknown>).errors
        : undefined;
    const code =
      responseData && typeof responseData === 'object' && 'code' in responseData
        ? String((responseData as Record<string, unknown>).code)
        : undefined;
    const requestId =
      responseData && typeof responseData === 'object' && 'requestId' in responseData
        ? String((responseData as Record<string, unknown>).requestId)
        : undefined;
    const details =
      responseData && typeof responseData === 'object'
        ? (responseData as Record<string, unknown>)
        : undefined;
    throw new ApiError(errorStatus, mapError(errorStatus, backendMessage, responseData), errorsPayload, code, requestId, details);
  }

  return responseData as T;
}

export function login(email: string, password: string): Promise<LoginResponse> {
  return request<LoginResponse>('POST', '/auth/login', { email, password });
}

export interface GoogleLoginResponse extends LoginResponse {
  type: 'direct_login' | 'two_factor_required' | 'account_link_required';
  account_link_required?: boolean;
  email?: string;
  link_challenge_token?: string;
}

export function loginWithGoogle(credential: string): Promise<GoogleLoginResponse> {
  return request<GoogleLoginResponse>('POST', '/auth/google', { credential });
}

export function linkGoogleAccount(linkChallengeToken: string, password: string): Promise<GoogleLoginResponse> {
  return request<GoogleLoginResponse>('POST', '/auth/google/link', { password }, linkChallengeToken);
}

export interface StudentInvitation {
  studentName: string;
  studentNumber: string;
  email: string;
  className: string;
  expiresAt: string;
}

export function getStudentInvitation(token: string): Promise<{ status: string; invitation: StudentInvitation }> {
  return request('GET', `/auth/student/invitation?token=${encodeURIComponent(token)}`);
}

export function createStudentInvitation(data: { studentId: string; classId: string }): Promise<{
  status: string;
  invitation: { studentId: string; classId: string; email: string; expiresAt: string };
  delivery_status: string;
  message: string;
}> {
  return request('POST', '/faculty/student-invitations', data);
}

export function activateStudent(token: string, password: string, credential?: string): Promise<{ status: string; message: string }> {
  return request('POST', '/auth/student/activate', { token, password, ...(credential ? { credential } : {}) });
}

export function createDevelopmentMockStudentSession(): Promise<LoginResponse> {
  return request<LoginResponse>('POST', '/auth/development/mock-student-session', {});
}

export function startEnrollment(): Promise<EnrollStartResponse> {
  return request<EnrollStartResponse>('POST', '/auth/mfa/enroll/start');
}

export function confirmEnrollment(confirmationToken: string, code: string): Promise<EnrollConfirmResponse> {
  return request<EnrollConfirmResponse>('POST', '/auth/mfa/enroll/confirm', { confirmation_token: confirmationToken, code });
}

export function verifyMfa(mfaSessionToken: string, code: string): Promise<MfaSuccessResponse> {
  return request<MfaSuccessResponse>('POST', '/auth/mfa/verify', { code }, mfaSessionToken);
}

export function recoverMfa(mfaSessionToken: string, code: string): Promise<MfaSuccessResponse> {
  return request<MfaSuccessResponse>('POST', '/auth/mfa/recover', { code }, mfaSessionToken);
}

export function getMfaSettingsApi(): Promise<{
  status: string;
  two_factor: {
    enabled: boolean;
    authenticator_enabled: boolean;
    recovery_code_count: number;
  };
}> {
  return request('GET', '/auth/mfa/settings');
}

export function regenerateMfaRecoveryCodesApi(code: string): Promise<{
  status: string;
  message: string;
  recovery_codes: string[];
}> {
  return request('POST', '/auth/mfa/settings/recovery-codes', { code });
}

export function revokeMfaApi(code: string): Promise<{ status: string; message: string }> {
  return request('POST', '/auth/mfa/settings/revoke', { code });
}

export function getMe(): Promise<SafeUser> {
  return request<SafeUser>('GET', '/auth/me');
}

export interface RuntimeConfigPayload {
  status: 'ok';
  environment: string;
  allowed_email_domains: string[];
  providers: {
    identity: {
      password: { enabled: boolean };
      google: { enabled: boolean; client_id: string | null };
      development_mock: { enabled: boolean };
    };
    email: {
      active: 'mailpit' | 'smtp';
    };
    biometrics: {
      active: 'disabled' | 'development-mock';
    };
    location: {
      active: 'disabled' | 'development-mock';
    };
  };
  features: {
    browser_attendance_prototype: boolean;
    student_auth_enabled: boolean;
  };
}

export function getRuntimeConfigApi(): Promise<RuntimeConfigPayload> {
  return request<RuntimeConfigPayload>('GET', '/runtime-config');
}

export function refreshSession(): Promise<{ access_token: string; user: { user_id: number } }> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        return await request<{ access_token: string; user: { user_id: number } }>('POST', '/auth/refresh');
      } catch (error) {
        if (error instanceof ApiError && error.status === 409 && error.code === 'REFRESH_IN_PROGRESS') {
          await new Promise(resolve => setTimeout(resolve, 150));
          return request<{ access_token: string; user: { user_id: number } }>('POST', '/auth/refresh');
        }
        throw error;
      }
    })()
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

export function logoutSession(): Promise<{ status: string; message: string }> {
  return request('POST', '/auth/logout');
}

export interface HealthPayload {
  status: string;
  app: string;
  php: string;
  database: string;
  timestamp: string;
}

export function healthCheck(): Promise<HealthPayload> {
  return request<HealthPayload>('GET', '/health');
}

export interface FacultyInvitation {
  id: string;
  email: string;
  name: string;
  status: string;
  invitedAt: string | null;
  expiresAt: string | null;
}

export function getFacultyInvitations(): Promise<{ status: string; invitations: FacultyInvitation[] }> {
  return request('GET', '/admin/faculty-invitations');
}

export function createFacultyInvitation(data: { name: string; email: string }): Promise<{
  status: string;
  invitation: FacultyInvitation;
  invitation_link?: string | null;
  delivery_status: string;
  message: string;
}> {
  return request('POST', '/admin/faculty-invitations', data);
}

export function reissueFacultyInvitation(id: string): Promise<{
  status: string;
  invitation: FacultyInvitation;
  invitation_link?: string | null;
  delivery_status: string;
  message: string;
}> {
  return request('POST', '/admin/faculty-invitations/reissue', { id });
}

export function getFacultyInvitation(token: string): Promise<{
  status: string;
  invitation: { name: string; email: string; expiresAt: string };
}> {
  return request('GET', `/auth/faculty/invitation?token=${encodeURIComponent(token)}`);
}

export function activateFacultyInvitation(token: string, password: string, credential?: string): Promise<{ status: string; message: string }> {
  return request('POST', '/auth/faculty/activate', { token, password, ...(credential ? { credential } : {}) });
}

export function inviteSecretaryApi(data: { student_name: string; student_number?: string; class_name: string; email: string }): Promise<{ status: string; token: string; invitation_link: string; message: string }> {
  return request('POST', '/secretary/invite', data);
}

export function listSecretaryInvitationsApi(): Promise<{ status: string; invitations: Array<Record<string, unknown>> }> {
  return request('GET', '/secretary/invitations');
}

export function revokeSecretaryInvitationApi(invitationId: string): Promise<{ status: string; message: string }> {
  return request('POST', '/secretary/invitations/revoke', { invitationId });
}

export function getSecretaryInvitationApi(token: string): Promise<{
  status: string;
  invitation: {
    token: string;
    studentName: string;
    studentNumber: string;
    email: string;
    className: string;
    facultyName: string;
    expiresAt: string;
  };
}> {
  return request('GET', `/secretary/invitation?token=${encodeURIComponent(token)}`);
}

export function activateSecretaryApi(token: string, password: string): Promise<{ status: string; message: string }> {
  return request('POST', '/secretary/activate', { token, password });
}

export function requestPasswordResetApi(email: string): Promise<{ status: string; token?: string; reset_link?: string; message: string }> {
  return request('POST', '/auth/password/reset-request', { email });
}

export function confirmPasswordResetApi(token: string, password: string): Promise<{ status: string; message: string }> {
  return request('POST', '/auth/password/reset-confirm', { token, password });
}

// Dean Admin API Methods
export function getAdminDashboardKpisApi(): Promise<{
  status: string;
  kpis: {
    totalStudents: number;
    totalFaculty: number;
    goodStanding: number;
    atRisk: number;
    remedialCount: number;
    attendanceRate: number;
  };
  gwaBuckets: Array<{ range: string; count: number; color: string }>;
  statusCounts: { active: number; warning: number; critical: number; remedial: number };
  classAttendance: Array<{ name: string; rate: number }>;
}> {
  return request('GET', '/admin/dashboard/kpis');
}

export function getRetentionCriteriaApi(): Promise<Array<{
  id: string;
  name: string;
  description: string;
  minGrade: number;
  minAttendance: number;
  maxRemedialSubjects: number;
  appliesToClinical: boolean;
  enabled: boolean;
  lastUpdated: string;
  updatedBy: string;
}>> {
  return request('GET', '/admin/retention/criteria');
}

export function saveRetentionCriteriaApi(criteria: any[]): Promise<{ status: string; message: string; criteria: any[] }> {
  return request('POST', '/admin/retention/criteria', criteria);
}

export function getAdminAuditLogsApi(params?: { query?: string; role?: string; module?: string; status?: string; date?: string }): Promise<Array<{
  id: string;
  timestamp: string;
  userName: string;
  userRole: string;
  action: string;
  module: string;
  description: string;
  status: 'Success' | 'Warning' | 'Failed';
  ipAddress: string;
  device: string;
}>> {
  const queryParts: string[] = [];
  if (params?.query) queryParts.push(`query=${encodeURIComponent(params.query)}`);
  if (params?.role) queryParts.push(`role=${encodeURIComponent(params.role)}`);
  if (params?.module) queryParts.push(`module=${encodeURIComponent(params.module)}`);
  if (params?.status) queryParts.push(`status=${encodeURIComponent(params.status)}`);
  if (params?.date) queryParts.push(`date=${encodeURIComponent(params.date)}`);
  const qs = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
  return request('GET', `/admin/audit-logs${qs}`);
}

export function getAdminProfileApi(): Promise<{
  status: string;
  profile: {
    id: string;
    name: string;
    email: string;
    title: string;
    office: string;
    theme: string;
  };
}> {
  return request('GET', '/admin/profile');
}

export function updateAdminProfileApi(data: { name: string; email: string; office?: string }): Promise<{ status: string; message: string }> {
  return request('POST', '/admin/profile', data);
}

export function getAdminSettingsApi(): Promise<{
  status: string;
  settings: {
    theme: 'light' | 'dark';
    retentionThreshold: number;
    weights: { practicum: number; exams: number; quizzes: number; attendance: number };
    transmutationDefaults: { minimumPercentage: number; maximumPercentage: number };
  };
}> {
  return request('GET', '/admin/settings');
}

export function updateAdminSettingsApi(settings: any): Promise<{ status: string; message: string }> {
  return request('POST', '/admin/settings', settings);
}

export function getAdminReportsSummaryApi(): Promise<{
  status: string;
  reports: {
    students: any[];
    attendance?: any[];
    totalCount: number;
  };
}> {
  return request('GET', '/admin/reports/summary');
}

export function getFacultyReportsSummaryApi(): Promise<{
  status: string;
  reports: {
    students: any[];
    summary: {
      totalStudents: number;
      averageGWA: number;
      atRiskCount: number;
      retentionPassRate: number;
    };
  };
}> {
  return request('GET', '/faculty/reports/summary');
}

// Faculty Module API Methods
export function getFacultyDashboardKpisApi(): Promise<{
  status: string;
  kpis: {
    assignedStudents: number;
    activeClasses: number;
    averageAttendance: number | null;
    retentionAlerts: number;
    goodStanding: number;
    remedialCount: number;
  };
  classes: Array<{
    id: string;
    name: string;
    courseCode: string;
    courseName: string;
    students: number;
    attendance: number | null;
  }>;
}> {
  return request('GET', '/faculty/dashboard/kpis');
}

export type FacultyRetentionState = 'active' | 'warning' | 'critical' | 'remedial' | 'archived';

export interface FacultyRetentionRecord {
  enrollmentId: string;
  studentId: string;
  studentNumber: string | null;
  studentName: string | null;
  classId: string;
  className: string | null;
  subjectCode: string | null;
  percentage: number | null;
  gwa: number | null;
  state: FacultyRetentionState;
  remedial: Record<string, unknown> | null;
}

export function getFacultyRetentionApi(): Promise<{
  status: string;
  retention: FacultyRetentionRecord[];
}> {
  return request('GET', '/faculty/retention');
}

export function getFacultyStudentsApi(): Promise<Array<{
  id: string;
  studentId: string;
  name: string;
  email: string;
  yearLevel: number;
  status: string;
  faceEnrolled: boolean;
  consentStatus: string;
  classSections: Array<{ classId: string; className: string; enrollmentId: string }>;
  overallGWA?: number;
  clinicHoursCompleted?: number;
  enrolledSubjects?: Array<{
    code: string;
    name: string;
    units: number;
    isClinical: boolean;
    components: { quizzes: number; exams: number; practicum: number; attendance: number };
    grade: number;
    hasRemedial: boolean;
    classId: string;
    enrollmentId: string;
  }>;
}>> {
  return request('GET', '/faculty/students');
}

export function createStudentApi(data: {
  studentId: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  name?: string;
  email?: string;
  contact?: string;
  sex?: string;
  yearLevel?: number;
  status?: string;
  admissionDate?: string;
  birthdate?: string;
  classId?: string;
}): Promise<{
  status: string;
  message: string;
  student: any;
}> {
  return request('POST', '/faculty/students', data);
}

export function updateFacialEnrollmentApi(studentId: string, enrolled: boolean): Promise<{ status: string; message: string }> {
  return request('POST', '/faculty/students/facial-enroll', { studentId, enrolled });
}

export function getFacultyAssessmentsApi(): Promise<any[]> {
  return request('GET', '/faculty/assessments');
}

export function saveFacultyAssessmentsApi(assessments: any[]): Promise<{ status: string; message: string; assessments: Array<{ id: string; classId: string; title: string }> }> {
  return request('POST', '/faculty/assessments', assessments);
}

export function deleteFacultyAssessmentApi(assessmentId: string): Promise<{
  status: string;
  message: string;
  assessmentId: string;
  deletedScoreCount: number;
}> {
  return request('POST', '/faculty/assessments/delete', { assessmentId });
}

export function getFacultyAttendanceApi(): Promise<{ status: string; records: Array<{
  id: string;
  studentId: string;
  date: string;
  classId: string;
  sessionCode: string | null;
  subjectCode: string;
  status: 'present' | 'absent' | 'late' | 'excused';
  overrideReason?: string;
  overrideAt?: string;
}> }> {
  return request('GET', '/faculty/attendance');
}

export interface FacultyAttendanceWorksheetRosterItem {
  id: string | null;
  enrollmentId: string;
  studentId: string;
  studentNumber: string;
  studentName: string;
  date: string;
  sessionCode: string | null;
  attendanceSessionId: string | null;
  status: 'present' | 'absent' | 'late' | 'excused' | null;
  verificationMethod: string | null;
  timeRecorded: string | null;
  overrideReason: string | null;
  overrideAt: string | null;
}

export interface FacultyAttendanceWorksheet {
  classSection: {
    id: string;
    name: string;
    block: string;
    semester: string;
    schoolYear: string;
    status: string;
  };
  course: {
    id: number;
    code: string;
    name: string;
    units: number;
  };
  date: string;
  attendanceSession: {
    sessionId: string;
    classId?: string;
    sessionDate?: string;
    sessionCode: string;
    room?: string | null;
    status: 'active' | 'ended' | 'revoked' | string;
    startedAt?: string;
    endedAt?: string | null;
    geofenceEnabled?: boolean;
    geofenceRadiusMeters?: number | null;
    biometricRequired?: boolean;
    openingTime?: string | null;
    presentCutoff?: string | null;
    lateCutoff?: string | null;
    timingConfigured?: boolean;
    revokedAt?: string | null;
    revocationReason?: string | null;
  } | null;
  attendanceSessions: Array<Record<string, unknown>>;
  roster: FacultyAttendanceWorksheetRosterItem[];
}

export interface FacultyAttendanceWorksheetResponse {
  status: string;
  worksheet: FacultyAttendanceWorksheet;
}

export interface FacultyAttendanceInitialEntryPayload {
  csId: number;
  enrollmentId: number;
  sessionDate: string;
  status: 'present' | 'absent' | 'late' | 'excused';
  reason?: string;
}

export interface FacultyAttendanceCorrectionPayload {
  recordId: string | number;
  status: 'present' | 'absent' | 'late' | 'excused';
  reason: string;
}

export interface FacultyAttendanceMutationResponse {
  status: string;
  operation: 'created' | 'updated' | 'unchanged';
  changed?: boolean;
  message?: string;
  recordId?: string;
  attendanceSessionId?: string | null;
}

export function getFacultyAttendanceWorksheetApi(params: {
  csId: number;
  date: string;
  sessionId?: number;
}): Promise<FacultyAttendanceWorksheetResponse> {
  const query = new URLSearchParams({
    csId: String(params.csId),
    date: params.date,
  });
  if (params.sessionId) {
    query.set('sessionId', String(params.sessionId));
  }
  return request('GET', `/faculty/attendance?${query.toString()}`);
}

export function recordFacultyInitialAttendanceApi(
  data: FacultyAttendanceInitialEntryPayload
): Promise<FacultyAttendanceMutationResponse> {
  return request('POST', '/faculty/attendance/override', data);
}

export function correctFacultyAttendanceApi(
  data: FacultyAttendanceCorrectionPayload
): Promise<FacultyAttendanceMutationResponse> {
  return request('POST', '/faculty/attendance/override', data);
}

export function overrideFacultyAttendanceApi(data: {
  recordId: string;
  status: 'present' | 'late' | 'absent' | 'excused';
  reason?: string;
}): Promise<{ status: string; message: string; recordId: string }> {
  return request('POST', '/faculty/attendance/override', data);
}

export function createFacultyAttendanceSessionApi(data: {
  csId?: number;
  classSectionId?: number;
  subjectCode?: string;
  date?: string;
  sessionDate?: string;
  topic?: string;
  room?: string;
  openingTime?: string;
  presentCutoff?: string;
  lateCutoff?: string;
  biometricRequired?: boolean;
  geofenceEnabled?: boolean;
  geofenceRadiusMeters?: number;
  latitude?: number;
  longitude?: number;
}): Promise<{ status: string; message?: string; sessionCode?: string; createdCount?: number; session?: Record<string, unknown> }> {
  return request('POST', '/faculty/attendance/session', data);
}

export function updateFacultyRetentionStatusApi(data: {
  studentId: string;
  classId: string;
  status: 'active' | 'warning' | 'critical' | 'remedial';
  reason: string;
}): Promise<{ status: string; message: string; retention: Record<string, string> }> {
  return request('POST', '/faculty/retention/status', data);
}

export function saveFacultyRemedialApi(data: {
  enrollmentId?: string;
  studentId?: string;
  classId?: string;
  remedial: Record<string, unknown>;
}): Promise<{ status: string; message: string; enrollmentId: string | null }> {
  return request('POST', '/faculty/retention/remedial', data);
}

export function getFacultyAssessmentScoresApi(assessmentId: string): Promise<{ status: string; assessmentId: string; scores: Array<{
  id: string;
  studentId: string;
  score: number;
  remarks?: string;
  submittedAt: string;
}> }> {
  return request('GET', `/faculty/scores?assessmentId=${encodeURIComponent(assessmentId)}`);
}

export function saveFacultyAssessmentScoresApi(assessmentId: string, scores: Array<{ studentId: string; score: number; remarks?: string }>): Promise<{ status: string; message: string; savedCount: number }> {
  return request('POST', '/faculty/scores', { assessmentId, scores });
}

export function computeFacultyGradesApi(classId?: string): Promise<{ status: string; message: string; results: Array<Record<string, unknown>> }> {
  return request('POST', '/faculty/grades/compute', classId ? { classId } : {});
}

export function getFacultyProfileApi(): Promise<{
  status: string;
  profile: {
    id: string;
    name: string;
    email: string;
    title: string;
    department: string;
    theme: string;
  };
}> {
  return request('GET', '/faculty/profile');
}

export function updateFacultyProfileApi(data: { name: string; email: string }): Promise<{ status: string; message: string }> {
  return request('POST', '/faculty/profile', data);
}

export function getFacultySettingsApi(): Promise<{
  status: string;
  settings: {
    theme: 'light' | 'dark';
    transmutationDefaults: { minimumPercentage: number; maximumPercentage: number };
  };
}> {
  return request('GET', '/faculty/settings');
}

export function updateFacultySettingsApi(settings: { theme: 'light' | 'dark' }): Promise<{ status: string; message: string }> {
  return request('POST', '/faculty/settings', settings);
}

// Class Secretary Module API Methods
export function getSecretaryDashboardKpisApi(): Promise<{
  status: string;
  kpis: {
    assignedStudents: number;
    attendanceRate: number;
    todayRecords: number;
    overriddenCount: number;
  };
  recentActivity: Array<{ id: string; studentName: string; date: string; subjectCode: string; status: string }>;
  assignedClass: {
    classId: string;
    className: string;
    classroomName: string;
  };
}> {
  return request('GET', '/secretary/dashboard/kpis');
}

export function getSecretaryAttendanceApi(): Promise<{
  status: string;
  records: Array<{
    id: string;
    studentId: string;
    studentNumber: string;
    studentName: string;
    date: string;
    subjectCode: string;
    status: string;
    overrideReason?: string | null;
    overrideAt?: string | null;
  }>;
}> {
  return request('GET', '/secretary/attendance');
}

export function overrideSecretaryAttendanceApi(data: {
  studentId: string;
  status: 'present' | 'late' | 'absent';
  reason: string;
  recordId?: string;
  date?: string;
  subjectCode?: string;
}): Promise<{ status: string; message: string; record?: { id: string; status: string; overrideReason: string; overrideAt: string } }> {
  return request('POST', '/secretary/attendance/override', data);
}

export function getSecretaryProfileApi(): Promise<{
  status: string;
  profile: {
    id: string;
    name: string;
    email: string;
    title: string;
    assignedClassName: string;
    classroomName: string;
    theme: string;
  };
}> {
  return request('GET', '/secretary/profile');
}

export function updateSecretaryProfileApi(data: { name: string; email: string }): Promise<{ status: string; message: string }> {
  return request('POST', '/secretary/profile', data);
}

export function getSecretarySettingsApi(): Promise<{
  status: string;
  settings: {
    theme: 'light' | 'dark';
    assignedClassName: string;
  };
}> {
  return request('GET', '/secretary/settings');
}

export function updateSecretarySettingsApi(settings: { theme: 'light' | 'dark' }): Promise<{ status: string; message: string }> {
  return request('POST', '/secretary/settings', settings);
}

// Secretary Attendance Session API Methods & Types
export interface SecretaryAttendanceSession {
  sessionId: string;
  csId: number;
  classId?: string;
  className?: string;
  classSection?: {
    id: string;
    name?: string | null;
    block?: string | null;
  };
  course?: {
    id: number;
    code: string;
    name: string;
  };
  courseCode: string;
  instructorName?: string | null;
  sessionDate: string;
  sessionCode: string;
  room?: string | null;
  startedAt: string;
  endedAt?: string | null;
  status: 'active' | 'ended' | 'revoked' | string;
  openingTime?: string | null;
  presentCutoff?: string | null;
  lateCutoff?: string | null;
  timingConfigured?: boolean;
  geofenceEnabled: boolean;
  geofenceLatitude?: number | null;
  geofenceLongitude?: number | null;
  geofenceRadiusMeters?: number | null;
  biometricRequired: boolean;
  revokedAt?: string | null;
  revocationReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StartSecretaryAttendanceSessionPayload {
  csId: number;
  sessionDate?: string;
  sessionCode?: string;
  room?: string;
  biometricRequired?: boolean;
  geofenceEnabled?: boolean;
  geofenceLatitude?: number;
  geofenceLongitude?: number;
  geofenceRadiusMeters?: number;
  latitude?: number;
  longitude?: number;
  openingTime?: string;
  presentCutoff?: string;
  lateCutoff?: string;
}

export function startSecretaryAttendanceSessionApi(
  data: StartSecretaryAttendanceSessionPayload
): Promise<{ status: string; session: SecretaryAttendanceSession }> {
  return request('POST', '/secretary/attendance/session', data);
}

export function getSecretaryActiveAttendanceSessionApi(
  csId?: number
): Promise<{ status: string; activeSession: SecretaryAttendanceSession | null }> {
  const query = csId ? `?csId=${csId}` : '';
  return request('GET', `/secretary/attendance/session/active${query}`);
}

export function endSecretaryAttendanceSessionApi(data: {
  sessionId: string;
}): Promise<{ status: string; session: SecretaryAttendanceSession }> {
  return request('POST', '/secretary/attendance/session/end', data);
}

export function revokeSecretaryAttendanceSessionApi(data: {
  sessionId: string | number;
  reason?: string | null;
}): Promise<{ status: string; session: SecretaryAttendanceSession }> {
  return request('POST', '/secretary/attendance/session/revoke', data);
}

export function revokeFacultyAttendanceSessionApi(data: {
  sessionId: string | number;
  reason?: string | null;
}): Promise<{ status: string; session: Record<string, unknown> }> {
  return request('POST', '/faculty/attendance/session/revoke', data);
}

export function sendFacultyEmailApi(data: {
  studentIds: string[];
  emailType: string;
  subject?: string;
  message?: string;
}): Promise<{ status: string; message: string; sentCount: number; failedCount: number }> {
  return request('POST', '/faculty/send-email', data);
}

export function getFacultyEmailLogsApi(): Promise<{
  status: string;
  logs: Array<{
    id: string;
    recipient: string;
    recipientEmail?: string;
    subject: string;
    type: string;
    sentAt: string;
    status: 'Sent' | 'Failed';
  }>;
}> {
  return request('GET', '/faculty/email-logs');
}

// Class Management API Services
export interface FacultyClassItem {
  id: string;
  csId: number;
  csName: string;
  courseId: number;
  courseCode: string;
  courseName: string;
  units: number;
  schoolYear: string;
  semester: string;
  yearLevel: number;
  block: string;
  schedule: string;
  labRoom?: string;
  lecRoom?: string;
  enrolledCount: number;
  instructorName: string;
  status: string;
}

export interface CourseCatalogItem {
  id: number;
  courseCode: string;
  name: string;
  units: number;
  yearLevel: number;
  semester: string;
  isClinical: boolean;
}

export function getFacultyClassesApi(): Promise<{ status: string; classes: FacultyClassItem[] }> {
  return request('GET', '/faculty/classes');
}

export function getFacultyCoursesApi(): Promise<{ status: string; courses: CourseCatalogItem[] }> {
  return request('GET', '/faculty/courses');
}

export function createFacultyClassApi(data: {
  csName: string;
  courseId: number;
  semester: string;
  schoolYear: string;
  yearLevel: number;
  block?: string;
  lecRoom?: string;
  labRoom?: string;
}): Promise<{ status: string; message: string; csId: number }> {
  return request('POST', '/faculty/classes', data);
}

export function updateFacultyClassApi(data: {
  csId: number;
  csName?: string;
  block?: string;
  yearLevel?: number;
  lecRoom?: string;
  labRoom?: string;
}): Promise<{ status: string; message: string }> {
  return request('POST', '/faculty/classes/update', data);
}

export function getAvailableStudentsForClassApi(csId: number): Promise<{
  status: string;
  students: Array<{
    id: string;
    studentId: string;
    name: string;
    email: string;
    yearLevel: number;
    status: string;
  }>;
}> {
  return request('GET', `/faculty/classes/available-students?csId=${csId}`);
}

export function enrollStudentsInClassApi(data: {
  csId: number;
  studentIds: number[];
}): Promise<{ status: string; message: string; enrolledCount: number }> {
  return request('POST', '/faculty/classes/enroll', data);
}

export function unenrollStudentFromClassApi(data: {
  csId: number;
  studentId: number;
}): Promise<{ status: string; message: string }> {
  return request('POST', '/faculty/classes/unenroll', data);
}

// ---------------------------------------------------------------------------
// Authoritative Faculty Grade Weights / Grading Configuration
// ---------------------------------------------------------------------------

export const TOTAL_WEIGHT_UNITS = 1_000_000;
export const UNITS_PER_PERCENT = 10_000;

export function parseWeightUnits(value: string | number): number | null {
  const text = String(value).trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/.test(text)) {
    return null;
  }
  const [whole, fraction = ''] = text.split('.');
  const units = parseInt(whole, 10) * UNITS_PER_PERCENT + parseInt(fraction.padEnd(4, '0'), 10);
  return units > 0 && units <= TOTAL_WEIGHT_UNITS ? units : null;
}

export function formatWeightUnitsToPercent(units: number): string {
  const percent = units / UNITS_PER_PERCENT;
  return Number.isInteger(percent) ? `${percent}%` : `${percent.toFixed(2).replace(/\.?0+$/, '')}%`;
}

export interface FacultyGradingCategoryItem {
  id?: number | null;
  name: string;
  weight: number | string;
  sortOrder?: number;
  inUse?: boolean;
}

export interface FacultyGradingCourseSummary {
  id: number;
  code: string;
  name: string;
}

export interface FacultyGradingConfiguration {
  id: string;
  course: FacultyGradingCourseSummary;
  semester: string;
  schoolYear: string;
  version: number;
  categories: FacultyGradingCategoryItem[];
}

export interface FacultyGradingConfigGetResponse {
  status: string;
  configuration: FacultyGradingConfiguration | null;
}

export interface FacultyGradingCategoryAssignmentRequiredItem {
  assessmentId: number;
  title: string;
  legacyType: string;
}

export interface FacultyGradingConfigSavePayload {
  courseId: number;
  semester: string;
  schoolYear: string;
  version?: number;
  categories: Array<{
    id?: number;
    name: string;
    weight: number | string;
    sortOrder: number;
  }>;
}

export interface FacultyGradingConfigSaveResponse {
  status: string;
  configuration: FacultyGradingConfiguration;
}

export function getFacultyGradingConfigApi(params: {
  courseId: number | string;
  semester: string;
  schoolYear: string;
}): Promise<FacultyGradingConfigGetResponse> {
  const query = new URLSearchParams({
    courseId: String(params.courseId),
    semester: params.semester,
    schoolYear: params.schoolYear,
  });
  return request<FacultyGradingConfigGetResponse>('GET', `/faculty/grading-config?${query.toString()}`);
}

export function saveFacultyGradingConfigApi(
  payload: FacultyGradingConfigSavePayload
): Promise<FacultyGradingConfigSaveResponse> {
  return request<FacultyGradingConfigSaveResponse>('PUT', '/faculty/grading-config', payload);
}

// RFC 6238 TOTP Helpers & Per-User Secret Generation
export { base32Decode, generateBase32Secret, computeTotpCode, verifyTotpCode } from '../utils/totp';

// --- Authoritative Student Biometric & Attendance APIs ---

export function getStudentBiometricProfile(): Promise<StudentBiometricProfile> {
  return request<StudentBiometricProfile>('GET', '/student/biometric/profile');
}

export function updateStudentBiometricConsent(payload: BiometricConsentPayload): Promise<BiometricConsentResponse> {
  return request<BiometricConsentResponse>('PUT', '/student/biometric/consent', payload);
}

export function createBiometricLivenessChallenge(payload: LivenessChallengeRequest): Promise<LivenessChallengeResponse> {
  return request<LivenessChallengeResponse>('POST', '/student/biometric/liveness/challenge', payload);
}

export function submitBiometricEnrollment(formData: FormData): Promise<BiometricEnrollmentResponse> {
  return request<BiometricEnrollmentResponse>('POST', '/student/biometric/enrollment', formData);
}

export function revokeStudentBiometricProfile(): Promise<BiometricRevocationResponse> {
  return request<BiometricRevocationResponse>('DELETE', '/student/biometric/profile');
}

export async function getStudentActiveAttendanceSessions(): Promise<StudentActiveSessionsResponse> {
  const raw = await request<unknown>('GET', '/student/attendance/sessions/active');
  if (Array.isArray(raw)) {
    return { sessions: raw as StudentActiveSession[] };
  }
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.sessions)) {
      return { sessions: obj.sessions as StudentActiveSession[] };
    }
    if (Array.isArray(obj.data)) {
      return { sessions: obj.data as StudentActiveSession[] };
    }
  }
  return { sessions: [] };
}

export function submitBiometricAttendance(formData: FormData): Promise<BiometricAttendanceResponse> {
  return request<BiometricAttendanceResponse>('POST', '/student/attendance/biometric', formData);
}

export async function getStudentAttendanceLogs(params?: {
  courseCode?: string;
  status?: string;
  page?: number;
  limit?: number;
}): Promise<StudentAttendanceLogsResponse> {
  const query = new URLSearchParams();
  if (params?.courseCode && params.courseCode !== 'all') query.set('courseCode', params.courseCode);
  if (params?.status && params.status !== 'all') query.set('status', params.status);
  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit));
  const qs = query.toString() ? `?${query.toString()}` : '';
  const raw = await request<unknown>('GET', `/student/attendance/logs${qs}`);
  if (Array.isArray(raw)) {
    return { records: raw as StudentAttendanceLogRecord[], total: raw.length };
  }
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.records)) {
      return {
        records: obj.records as StudentAttendanceLogRecord[],
        total: typeof obj.total === 'number' ? obj.total : obj.records.length,
      };
    }
    if (Array.isArray(obj.data)) {
      return {
        records: obj.data as StudentAttendanceLogRecord[],
        total: typeof obj.total === 'number' ? obj.total : obj.data.length,
      };
    }
  }
  return { records: [], total: 0 };
}




