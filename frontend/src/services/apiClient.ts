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
  LivenessGuidanceResponse,
  BiometricEnrollmentResponse,
  BiometricRevocationResponse,
  StudentActiveSessionsResponse,
  BiometricAttendanceResponse,
  StudentAttendanceLogsResponse,
  PasswordChangePayload,
  PasswordChangeResponse,
  NotificationsResponse,
  StudentAcademicDashboardResponse,
  StudentAcademicProfileResponse,
  StudentAcademicClassesResponse,
  StudentAcademicRetentionResponse,
  FacultyInvitationUpdatePayload,
} from '../types';
import {
  normalizeStudentActiveSession,
  normalizeStudentAttendanceLogRecord,
} from './attendanceNormalization';
export { normalizeStudentActiveSession, normalizeStudentAttendanceLogRecord } from './attendanceNormalization';


const configuredBase = import.meta.env?.VITE_API_BASE_URL?.trim();
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

export function isTransportOrBiometricUnavailable(err: unknown): boolean {
  if (err instanceof ApiError) {
    if (err.status === 0 || err.status === 503) return true;
    if (err.code === 'biometric_service_unavailable') return true;
  }
  if (err && typeof err === 'object') {
    const obj = err as Record<string, unknown>;
    if (obj.status === 0 || obj.status === 503) return true;
    if (obj.code === 'biometric_service_unavailable') return true;
  }
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (
      msg.includes('unable to connect') ||
      msg.includes('network') ||
      msg.includes('connection') ||
      msg.includes('temporarily unavailable') ||
      msg.includes('service unavailable') ||
      msg.includes('timeout')
    ) {
      return true;
    }
  }
  return false;
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
  // Login failures reuse the generic 401 code; the message is the precise signal.
  if (status === 401 && backendMessage === 'Invalid credentials.') {
    return 'Invalid email or password.';
  }
  if (responseData && typeof responseData === 'object') {
    const dataObj = responseData as Record<string, unknown>;
    const code = typeof dataObj.code === 'string' ? dataObj.code : undefined;
    if (code) {
      const codeMessages: Record<string, string> = {
        GOOGLE_NOT_CONFIGURED: 'Google Sign-In is not configured in this environment.',
        GOOGLE_DOMAIN_NOT_ALLOWED: 'This Google account is outside the approved institutional domains.',
        GOOGLE_EMAIL_MISMATCH: 'Choose the Google account that uses this DentiSys institutional email.',
        GOOGLE_LINK_CONFLICT: 'This DentiSys account or Google identity is already linked elsewhere.',
        GOOGLE_LINK_PASSWORD_INVALID: 'Incorrect DentiSys password.',
        INVALID_GOOGLE_IDENTITY: 'Google identity could not be verified. Choose Google again and retry.',
        GOOGLE_LINK_CHALLENGE_EXPIRED: 'The Google linking session expired. Choose Google again and retry.',
        INVALID_LINK_CHALLENGE: 'The Google linking session expired. Choose Google again and retry.',
        AUTHENTICATION_REQUIRED: 'Your session has expired. Please log in again.',
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
  timeoutMs = 15000,
  signal?: AbortSignal,
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
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const onExternalAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) {
      clearTimeout(timeoutId);
      throw new ApiError(0, 'Request cancelled.');
    }
    signal.addEventListener('abort', onExternalAbort);
  }
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      credentials: 'include',
      body: body !== undefined ? (isFormData ? (body as BodyInit) : JSON.stringify(body)) : undefined,
      signal: controller.signal,
    });
  } catch {
    if (signal?.aborted) {
      throw new ApiError(0, 'Request cancelled.');
    }
    throw new ApiError(0, 'Unable to connect to the server. Check your connection.');
  } finally {
    clearTimeout(timeoutId);
    if (signal) {
      signal.removeEventListener('abort', onExternalAbort);
    }
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
  type: 'direct_login' | 'two_factor_required' | 'account_link_required' | 'google_linked';
  account_link_required?: boolean;
  email?: string;
  link_challenge_token?: string;
  linked?: boolean;
}

export function loginWithGoogle(credential: string): Promise<GoogleLoginResponse> {
  return request<GoogleLoginResponse>('POST', '/auth/google', { credential });
}

export function linkGoogleAccount(linkChallengeToken: string, password: string): Promise<GoogleLoginResponse> {
  return request<GoogleLoginResponse>('POST', '/auth/google/link', { password }, linkChallengeToken);
}

export interface GoogleLinkStatusResponse {
  status: 'ok';
  linked: boolean;
}

export function getGoogleLinkStatus(): Promise<GoogleLinkStatusResponse> {
  return request<GoogleLinkStatusResponse>('GET', '/auth/google/link/status');
}

export function linkCurrentGoogleAccount(credential: string, password: string): Promise<GoogleLoginResponse> {
  return request<GoogleLoginResponse>('POST', '/auth/google/link/profile', { credential, password });
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

export function activateStudent(token: string, password: string): Promise<{ status: string; message: string }> {
  return request('POST', '/auth/student/activate', { token, password });
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
      active: 'disabled' | 'development-mock' | 'sidecar';
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
  prefix?: string | null;
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
  suffix?: string | null;
  status: string;
  invitedAt: string | null;
  expiresAt: string | null;
}

export function getFacultyInvitations(): Promise<{ status: string; invitations: FacultyInvitation[] }> {
  return request('GET', '/admin/faculty-invitations');
}

export function createFacultyInvitation(data: {
  email: string;
  name?: string;
  prefix?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  suffix?: string;
}): Promise<{
  status: string;
  invitation: FacultyInvitation;
  invitation_link?: string | null;
  delivery_status: string;
  message: string;
}> {
  return request('POST', '/admin/faculty-invitations', data);
}

export function updateFacultyInvitation(data: FacultyInvitationUpdatePayload): Promise<{
  status: string;
  invitation: FacultyInvitation;
  invitation_link?: string | null;
  delivery_status: string;
}> {
  return request('POST', '/admin/faculty-invitations/update', data);
}

export function revokeFacultyInvitation(id: string | number): Promise<{
  status: string;
  message: string;
}> {
  return request('POST', '/admin/faculty-invitations/revoke', { id });
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
  invitation: {
    name: string;
    email: string;
    expiresAt: string;
    role?: 'faculty' | 'admin';
    prefix?: string | null;
    firstName?: string | null;
    middleName?: string | null;
    lastName?: string | null;
    suffix?: string | null;
  };
}> {
  return request('GET', `/auth/faculty/invitation?token=${encodeURIComponent(token)}`);
}

export function activateFacultyInvitation(token: string, password: string): Promise<{ status: string; message: string }> {
  return request('POST', '/auth/faculty/activate', { token, password });
}

export function inviteSecretaryApi(data: { student_name: string; student_number?: string; cs_id: number; email: string }): Promise<{ status: string; invitationId: string | null; token: string | null; invitation_link: string | null; delivery_status: string; message: string }> {
  return request('POST', '/secretary/invite', data);
}

/** REG-006: remove a Class Secretary appointment; the account returns to Student access. */
export function removeSecretaryAppointmentApi(studentId: string): Promise<{ status: string; message: string }> {
  return request('POST', '/faculty/secretary-appointments/remove', { studentId });
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
export interface SchoolYearScope {
  currentSchoolYear?: string;
  schoolYearFilter?: string;
  availableSchoolYears?: string[];
}

function schoolYearQuery(schoolYear?: string): string {
  return schoolYear ? `?schoolYear=${encodeURIComponent(schoolYear)}` : '';
}

export function getAdminDashboardKpisApi(schoolYear?: string): Promise<SchoolYearScope & {
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
  recentAuditEvents?: Array<{
    id: string;
    occurredAt: string | null;
    actorName: string | null;
    actorEmail: string | null;
    actorRole: string | null;
    module: string;
    action: string;
    description: string;
    status: string;
  }>;
}> {
  return request('GET', `/admin/dashboard/kpis${schoolYearQuery(schoolYear)}`);
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

export interface AdminAuditLogPage {
  status: string;
  logs: import('./auditService').AuditLog[];
  total: number;
  page: number;
  pageSize: number;
  statusCounts: Record<'Success' | 'Warning' | 'Failed', number>;
  modules: string[];
}

export function getAdminAuditLogsApi(params?: {
  query?: string; role?: string; module?: string; status?: string; date?: string;
  sort?: 'newest' | 'oldest'; page?: number; pageSize?: number;
}): Promise<AdminAuditLogPage> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const qs = search.toString();
  return request('GET', `/admin/audit-logs${qs ? `?${qs}` : ''}`);
}

export interface FacultyActivityRecord {
  id: string;
  timestamp: string;
  userName?: string | null;
  userRole?: string | null;
  action?: string | null;
  module?: string | null;
  description: string;
  status?: string | null;
  ipAddress?: string | null;
  device?: string | null;
}

export function getFacultyActivityApi(limit = 100): Promise<{
  status: string;
  activity: FacultyActivityRecord[];
}> {
  const boundedLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  return request('GET', `/faculty/activity?limit=${boundedLimit}`);
}

export interface FacultyAttendanceActivityRow {
  id: string;
  occurredAt: string | null;
  studentName: string | null;
  studentNumber: string | null;
  classId: string | null;
  className: string | null;
  courseCode: string | null;
  sessionDate: string | null;
  sessionCode: string | null;
  previousStatus: string | null;
  newStatus: string;
  reason: string | null;
  actorRole: string;
  actorName: string | null;
}

export function getFacultyAttendanceActivityApi(limit = 100): Promise<{ status: string; activity: FacultyAttendanceActivityRow[] }> {
  const boundedLimit = Math.max(1, Math.min(200, Math.trunc(limit)));
  return request('GET', `/faculty/attendance-activity?limit=${boundedLimit}`);
}

export interface OwnProfileNameChangePayload {
  prefix: string;
  firstName: string;
  middleName: string;
  lastName: string;
  suffix: string;
  code?: string;
  /** Retained for older Dean/Faculty clients. */
  name?: string;
  /** Retained for older clients that echo the unchanged login email. */
  email?: string;
}

export interface OwnProfileNameChangeResponse {
  status: string;
  message: string;
  name: string;
  prefix: string | null;
  firstName: string;
  middleName: string | null;
  lastName: string;
  suffix: string | null;
}

function updateOwnProfileNameApi(path: string, data: OwnProfileNameChangePayload): Promise<OwnProfileNameChangeResponse> {
  return request('POST', path, data);
}

export function getAdminProfileApi(): Promise<{
  status: string;
  profile: {
    prefix?: string; firstName?: string; middleName?: string; lastName?: string; suffix?: string;
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

export function updateAdminProfileApi(data: OwnProfileNameChangePayload): Promise<OwnProfileNameChangeResponse> {
  return updateOwnProfileNameApi('/admin/profile', data);
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

/** BIO-002: the Dean revokes a Student's biometric enrollment; the Student must re-enroll. */
export function revokeStudentBiometricApi(studentId: string, reason: string): Promise<{ status: string; message: string }> {
  return request('POST', '/admin/biometrics/revoke', { studentId, reason });
}

export function updateAdminSettingsApi(settings: any): Promise<{ status: string; message: string }> {
  return request('POST', '/admin/settings', settings);
}

export function getAdminReportsSummaryApi(schoolYear = 'current'): Promise<{
  status: string;
  reports: {
    students: any[];
    attendance?: any[];
    totalCount: number;
  };
  schoolYear?: string | null;
  currentSchoolYear?: string;
  availableSchoolYears?: string[];
}> {
  return request('GET', `/admin/reports/summary?schoolYear=${encodeURIComponent(schoolYear)}`);
}

export function getFacultyReportsSummaryApi(): Promise<{
  status: string;
  currentSchoolYear?: string;
  reports: {
    currentSchoolYear?: string;
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
export function getFacultyDashboardKpisApi(schoolYear?: string): Promise<SchoolYearScope & {
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
  return request('GET', `/faculty/dashboard/kpis${schoolYearQuery(schoolYear)}`);
}

export type FacultyRetentionState = 'active' | 'warning' | 'critical' | 'remedial' | 'cleared' | 'archived';
export type FacultyRemedialProgressionStage =
  | 'none'
  | 'attempt_1_pending'
  | 'attempt_2_available'
  | 'attempt_2_pending'
  | 'passed'
  | 'cost_recovery_required'
  | 'cost_recovery_passed'
  | 'cost_recovery_failed'
  | 'legacy_unclassified';

export interface FacultyRemedialAttempt {
  attemptNumber: 1 | 2;
  scheduledDate: string | null;
  percentage: number | null;
  outcome: 'pending' | 'passed' | 'failed';
  actorUserId: string | null;
  createdAt: string;
  updatedAt: string;
  notes?: string | null;
}

export interface FacultyRemedialProgression {
  stage: FacultyRemedialProgressionStage;
  attempts: FacultyRemedialAttempt[];
  passedAttempt: 1 | 2 | null;
  legacyUnclassified: boolean;
  costRecovery?: { finalGrade: number; outcome: 'passed' | 'failed'; recordedAt: string } | null;
  /** Passed remedial attempt 1/2 or the cost recovery program. */
  cleared?: boolean;
}

export interface FacultyRetentionRecord {
  midtermComplete?: boolean;
  midtermPercentage?: number | null;
  /** UI-003 risk (informational): assumed 75% assessments until the grade is 2.50 or worse. */
  risk?: { level: 'High' | 'At Risk' | 'Low'; assumedAssessments: number | null; period: 'Midterm' | 'Overall' } | null;
  watchlistUnlocked?: boolean;
  unlockedAt?: string | null;
  schoolYear?: string;
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
  remedialProgression?: FacultyRemedialProgression;
  /** Server-computed: grade at/above the trigger, current school year, not legacy. */
  remedialEligible?: boolean;
  /** Status was set by Faculty and is kept until the course grade changes. */
  manualOverride?: boolean;
}

export function getFacultyRetentionApi(): Promise<{
  status: string;
  currentSchoolYear?: string;
  retentionThreshold?: number;
  retention: FacultyRetentionRecord[];
}> {
  return request('GET', '/faculty/retention');
}

export function unlockFacultyWatchlistApi(classId: string): Promise<{ status: string; classId: string; watchlistUnlocked: boolean }> {
  return request('POST', '/faculty/retention/watchlist/unlock', { classId });
}

export function getFacultyStudentsApi(): Promise<Array<{
  id: string;
  prefix?: string | null;
  firstName?: string;
  middleName?: string | null;
  lastName?: string;
  suffix?: string | null;
  studentId: string;
  name: string;
  email: string;
  yearLevel: number;
  status: string;
  faceEnrolled: boolean;
  consentStatus: string;
  accountStatus?: 'none' | 'pending' | 'active' | 'secretary' | 'disabled';
  accountActivated?: boolean;
  classSections: Array<{ classId: string; className: string; enrollmentId: string }>;
  overallGWA?: number;
  retentionThreshold?: number;
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
  prefix?: string;
  suffix?: string;
  firstName: string;
  middleName?: string;
  lastName: string;
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

export function updateFacultyStudentApi(studentId: string | number, data: {
  prefix?: string;
  suffix?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  email?: string;
  contact?: string;
  sex?: string;
  yearLevel?: number;
  status?: string;
  admissionDate?: string;
  birthdate?: string;
}): Promise<{ status: string; student: any }> {
  return request('PUT', `/faculty/students/${encodeURIComponent(String(studentId))}`, data);
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
  yearLevel?: number | null;
}

export interface FacultyAttendanceWorksheet {
  pendingSessions?: Array<{ sessionId: string; sessionDate: string; sessionCode: string; status: string; openingTime: string | null; classEndTime: string | null }>;
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
    classEndTime?: string | null;
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
  sessionId?: number;
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
  classEndTime: string;
  biometricRequired?: boolean;
  geofenceEnabled?: boolean;
  geofenceRadiusMeters?: number;
  geofenceLatitude?: number;
  geofenceLongitude?: number;
}): Promise<{ status: string; message?: string; sessionCode?: string; createdCount?: number; session: NonNullable<FacultyAttendanceWorksheet['attendanceSession']> }> {
  return request('POST', '/faculty/attendance/session', data);
}

export function endFacultyAttendanceSessionApi(data: {
  sessionId: string | number;
}): Promise<{ status: string; session: Record<string, unknown> }> {
  return request('POST', '/faculty/attendance/session/end', data);
}

export function updateFacultyRetentionStatusApi(data: {
  studentId: string;
  classId: string;
  status: 'active' | 'warning' | 'critical' | 'remedial';
  reason: string;
}): Promise<{ status: string; message: string; retention: Record<string, string> }> {
  return request('POST', '/faculty/retention/status', data);
}

/** Record the cost recovery program result after both remedial attempts failed. */
export function saveFacultyCostRecoveryApi(data: { enrollmentId: string; finalGrade: number }): Promise<{
  status: string;
  enrollmentId: string;
  outcome: 'passed' | 'failed';
  remedialProgression: FacultyRemedialProgression;
}> {
  return request('POST', '/faculty/retention/cost-recovery', data);
}

export function saveFacultyRemedialApi(data: {
  enrollmentId?: string;
  studentId?: string;
  classId?: string;
  attemptNumber?: 1 | 2;
  scheduledDate?: string | null;
  percentage?: number;
  notes?: string | null;
  remedial?: Record<string, unknown>;
}): Promise<{
  status: string;
  message: string;
  enrollmentId: string | null;
  progression?: FacultyRemedialProgression;
  notification?: { created: boolean } | null;
}> {
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

/** A null score clears that student's stored score. */
export type FacultyScoreEntry = { studentId: string; score: number | null; remarks?: string };

export function saveFacultyAssessmentScoresApi(assessmentId: string, scores: FacultyScoreEntry[]): Promise<{ status: string; message: string; savedCount: number; clearedCount?: number }> {
  return request('POST', '/faculty/scores', { assessmentId, scores });
}

/** Saves several assessments' scores in one transaction (all or nothing). */
export function saveFacultyScoreBatchesApi(batches: Array<{ assessmentId: string; scores: FacultyScoreEntry[] }>): Promise<{ status: string; message: string; savedCount: number; clearedCount?: number }> {
  return request('POST', '/faculty/scores', { batches });
}

export function computeFacultyGradesApi(classId?: string): Promise<FacultyComputeGradesResponse> {
  return request<FacultyComputeGradesResponse>('POST', '/faculty/grades/compute', classId ? { classId } : {});
}

/** The same server computation for one class, returned without saving anything. */
export function previewFacultyGradesApi(classId: string): Promise<FacultyComputeGradesResponse> {
  return request<FacultyComputeGradesResponse>('POST', '/faculty/grades/compute', { classId, preview: true });
}

export function getFacultyProfileApi(): Promise<{
  status: string;
  profile: {
    prefix?: string; firstName?: string; middleName?: string; lastName?: string; suffix?: string;
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

export function updateFacultyProfileApi(data: OwnProfileNameChangePayload): Promise<OwnProfileNameChangeResponse> {
  return updateOwnProfileNameApi('/faculty/profile', data);
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
export function getSecretaryDashboardKpisApi(schoolYear?: string): Promise<SchoolYearScope & {
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
  return request('GET', `/secretary/dashboard/kpis${schoolYearQuery(schoolYear)}`);
}

export function getSecretaryAttendanceApi(params?: {
  date?: string;
  csId?: string | number;
  sessionId?: string | number;
}): Promise<{
  status: string;
  sessions?: Array<{
    sessionId: string;
    classId: string;
    className: string;
    subjectCode: string;
    date: string;
    sessionCode: string;
    room?: string;
    status: string;
    openingTime?: string | null;
    classEndTime?: string | null;
    startedAt?: string;
    endedAt?: string;
    revokedAt?: string | null;
  }>;
  records: Array<{
    id: string;
    attendanceSessionId?: string | null;
    studentId: string;
    studentNumber: string;
    studentName: string;
    date: string;
    subjectCode: string;
    classId?: string;
    className?: string;
    status: string;
    overrideReason?: string | null;
    overrideAt?: string | null;
    yearLevel?: number | null;
    verificationMethod?: string | null;
    timeRecorded?: string | null;
  }>;
}> {
  const query = new URLSearchParams();
  if (params?.date) query.set('date', params.date);
  if (params?.csId) query.set('csId', String(params.csId));
  if (params?.sessionId) query.set('sessionId', String(params.sessionId));
  const qs = query.toString();
  return request('GET', `/secretary/attendance${qs ? `?${qs}` : ''}`);
}

export function overrideSecretaryAttendanceApi(data: {
  studentId: string;
  status: 'present' | 'late' | 'absent' | 'excused';
  reason: string;
  recordId?: string | number;
  sessionId?: string | number;
  date?: string;
  subjectCode?: string;
}): Promise<{ status: string; message: string; record?: { id: string; status: string; overrideReason: string; overrideAt: string } }> {
  return request('POST', '/secretary/attendance/override', data);
}

export function getSecretaryActivityApi(limit = 50): Promise<{
  status: string;
  activity: Array<{
    id: string;
    timestamp: string;
    userName?: string | null;
    userRole?: string | null;
    action?: string | null;
    module?: string | null;
    description: string;
    status?: string | null;
    ipAddress?: string | null;
    device?: string | null;
  }>;
}> {
  return request('GET', `/secretary/activity?limit=${limit}`);
}

export function getSecretaryProfileApi(): Promise<{
  status: string;
  profile: {
    prefix?: string; firstName?: string; middleName?: string; lastName?: string; suffix?: string;
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

export function updateSecretaryProfileApi(data: OwnProfileNameChangePayload): Promise<OwnProfileNameChangeResponse> {
  return updateOwnProfileNameApi('/secretary/profile', data);
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
  classEndTime?: string | null;
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
  classEndTime: string;
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

/** ATT-006 Excused request (Secretary submits; Faculty approve or reject). */
export interface AttendanceExcusedRequest {
  id: string;
  status: 'pending' | 'approved' | 'rejected';
  studentId: string;
  studentNumber: string | null;
  studentName: string;
  classId: string;
  className: string;
  courseCode: string;
  sessionId: string | null;
  sessionDate: string;
  sessionCode: string | null;
  currentStatus: string | null;
  reason: string;
  requestedBy: string | null;
  requestedAt: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
}

export function createSecretaryExcusedRequestApi(data: {
  studentId: string;
  recordId?: string;
  sessionId?: number;
  reason: string;
}): Promise<{ status: string; message: string; request: AttendanceExcusedRequest | null }> {
  return request('POST', '/secretary/excused-requests', data);
}

export function getSecretaryExcusedRequestsApi(): Promise<{ status: string; requests: AttendanceExcusedRequest[] }> {
  return request('GET', '/secretary/excused-requests');
}

export function getFacultyExcusedRequestsApi(): Promise<{ status: string; requests: AttendanceExcusedRequest[] }> {
  return request('GET', '/faculty/excused-requests');
}

export function decideFacultyExcusedRequestApi(data: {
  requestId: string;
  decision: 'approve' | 'reject';
  note?: string;
}): Promise<{ status: string; message: string; request: AttendanceExcusedRequest | null }> {
  return request('POST', '/faculty/excused-requests/decide', data);
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
}): Promise<{ status: string; message: string; sentCount: number; suppressedCount?: number; failedCount: number }> {
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
    status: 'Sent' | 'Failed' | 'Suppressed';
  }>;
}> {
  return request('GET', '/faculty/email-logs');
}

// Class Management API Services
export interface ClassMeeting {
  component: 'Lecture' | 'Laboratory';
  day: string;
  room: string;
  startTime: string;
  endTime: string;
}

export interface FacultyClassItem {
  meetings?: ClassMeeting[];
  isHistorical?: boolean;
  isCurrentSchoolYear?: boolean;
  id: string;
  csId: number;
  csName: string;
  courseId: number;
  courseCode: string;
  courseName: string;
  /** Shared catalog name for the course code (courseName may be this class's own title). */
  catalogCourseName?: string | null;
  courseTitle?: string | null;
  units: number;
  lectureUnits?: number | null;
  labUnits?: number | null;
  /** Scores or grades exist: course and term can no longer change. */
  hasGrades?: boolean;
  /** This Faculty member may change the shared course's lecture/lab units. */
  courseUnitsEditable?: boolean;
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
  lectureUnits?: number | null;
  labUnits?: number | null;
  yearLevel: number;
  semester: string;
  isClinical: boolean;
}

export function getFacultyClassesApi(): Promise<{ status: string; currentSchoolYear?: string; classes: FacultyClassItem[] }> {
  return request('GET', '/faculty/classes');
}

export function getFacultyCoursesApi(): Promise<{ status: string; courses: CourseCatalogItem[] }> {
  return request('GET', '/faculty/courses');
}

export function createFacultyClassApi(data: {
  meetings?: ClassMeeting[];
  csName: string;
  courseId?: number;
  courseCode?: string;
  courseName?: string;
  semester: string;
  schoolYear: string;
  yearLevel: number;
  block?: string;
  lecRoom?: string;
  labRoom?: string;
  lectureUnits?: number | null;
  labUnits?: number | null;
}): Promise<{ status: string; message: string; csId: number }> {
  return request('POST', '/faculty/classes', data);
}

export function updateFacultyClassApi(data: {
  meetings?: ClassMeeting[];
  csId: number;
  courseCode?: string;
  courseName?: string;
  csName?: string;
  block?: string;
  yearLevel?: number;
  semester?: string;
  schoolYear?: string;
  lecRoom?: string;
  labRoom?: string;
  lectureUnits?: number | null;
  labUnits?: number | null;
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

export type GradingPeriodEnum = 'Midterm' | 'Final';
export type GradingSourceKindEnum = 'assessment' | 'attendance';
export type GradingComponentEnum = 'Lecture' | 'Laboratory';

export interface FacultyAttendanceDateRange {
  startDate: string | null;
  endDate: string | null;
}

export interface FacultyAttendanceDateRanges {
  midterm: FacultyAttendanceDateRange;
  final: FacultyAttendanceDateRange;
}

export interface FacultyTermRatio {
  midterm: number;
  final: number;
}

export interface FacultyGradingCategoryItem {
  id?: number | null;
  name: string;
  weight: number | string;
  sortOrder?: number;
  gradingPeriod?: GradingPeriodEnum | null;
  sourceKind?: GradingSourceKindEnum | null;
  component?: GradingComponentEnum | null;
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
  schemaMode?: 'overall' | 'periods';
  componentMode?: 'combined' | 'lecture_laboratory';
  componentWeights?: { lecture: number; laboratory: number };
  termRatio?: FacultyTermRatio;
  attendanceDateRanges?: FacultyAttendanceDateRanges;
  categories: FacultyGradingCategoryItem[];
  midtermCategories?: FacultyGradingCategoryItem[];
  finalCategories?: FacultyGradingCategoryItem[];
}

export interface FacultyGradingConfigDefaults {
  schemaMode: 'periods';
  componentMode: 'lecture_laboratory';
  componentWeights: { lecture: number; laboratory: number };
  termRatio: { midterm: number; final: number };
  midtermCategories: Array<{ name: string; weight: number; sortOrder: number; sourceKind: GradingSourceKindEnum; component: GradingComponentEnum }>;
  finalCategories: Array<{ name: string; weight: number; sortOrder: number; sourceKind: GradingSourceKindEnum; component: GradingComponentEnum }>;
  attendanceDateRanges: FacultyAttendanceDateRanges;
}

export interface FacultyGradingConfigGetResponse {
  status: string;
  configuration: FacultyGradingConfiguration | null;
  defaults?: FacultyGradingConfigDefaults;
}

export interface FacultyGradingCategoryAssignmentRequiredItem {
  assessmentId: number;
  title: string;
  legacyType: string;
  gradingPeriod?: 'Midterm' | 'Final' | null;
  categoryId?: number | null;
  component?: GradingComponentEnum | null;
}

export interface FacultyGradingComponentMappingRequiredItem {
  assessmentId: number;
  title: string;
  legacyType: string;
  gradingPeriod: 'Midterm' | 'Final';
  categoryId?: number | null;
  component?: GradingComponentEnum | null;
}

export interface FacultyGradingPeriodMappingRequiredItem {
  assessmentId: number;
  categoryId: number | null;
  gradingPeriod: string;
  status: string;
}
export type FacultyGradingCategoryPeriodMappingRequiredItem = FacultyGradingPeriodMappingRequiredItem;

export interface FacultyGradingConfigSavePayload {
  courseId: number;
  semester: string;
  schoolYear: string;
  version?: number;
  schemaMode?: 'overall' | 'periods';
  convertFromOverall?: boolean;
  /** Explicitly converts an existing combined period configuration to grouped grading. */
  convertToLectureLaboratory?: boolean;
  /** First save only: categories Faculty picked for existing assessments that could not be linked by name. */
  assessmentAssignments?: Array<{
    assessmentId: number;
    categoryId?: number;
    categoryName?: string;
    gradingPeriod?: GradingPeriodEnum;
    component?: GradingComponentEnum;
  }>;
  componentMode?: 'lecture_laboratory';
  componentWeights?: { lecture: number | string; laboratory: number | string };
  termRatio?: { midterm: number | string; final: number | string };
  attendanceDateRanges?: {
    midterm?: { startDate?: string | null; endDate?: string | null };
    final?: { startDate?: string | null; endDate?: string | null };
  };
  midtermCategories?: Array<{
    id?: number | null;
    name: string;
    weight: number | string;
    sortOrder?: number;
    sourceKind?: GradingSourceKindEnum;
    component?: GradingComponentEnum;
  }>;
  finalCategories?: Array<{
    id?: number | null;
    name: string;
    weight: number | string;
    sortOrder?: number;
    sourceKind?: GradingSourceKindEnum;
    component?: GradingComponentEnum;
  }>;
  categories?: Array<{
    id?: number | null;
    name: string;
    weight: number | string;
    sortOrder?: number;
  }>;
}

export interface FacultyGradingConfigSaveResponse {
  status: string;
  configuration: FacultyGradingConfiguration;
}

export type PeriodIncompleteReason =
  | 'missing_date_range'
  | 'no_sessions'
  | 'unresolved_attendance'
  | 'no_assessment_results'
  | 'missing_assessment_score'
  | 'unresolved_assessment_attendance'
  | 'duplicate_attendance_sources';

export interface FacultyPeriodIncompleteItem {
  categoryId?: number;
  name?: string;
  sourceKind?: GradingSourceKindEnum | string;
  reason: PeriodIncompleteReason;
  sessions?: Array<{
    sessionId: string;
    sessionDate: string;
    sessionCode: string;
    status?: string;
    sessionStatus?: string;
  }>;
  assessmentId?: string;
  categoryIds?: number[];
}

export interface FacultyPeriodCategoryDetail {
  categoryId: number;
  name: string;
  sourceKind: GradingSourceKindEnum;
  earnedPoints: number;
  possiblePoints: number;
  ratio: number;
  weight: number;
  contribution: number;
  sessions?: Array<{
    sessionId: string;
    sessionDate: string;
    sessionCode: string;
    status: string;
    sessionStatus: string;
  }>;
}

export interface FacultyPeriodBreakdown {
  period: GradingPeriodEnum;
  status: 'computed' | 'incomplete';
  percentage: number | null;
  categories: FacultyPeriodCategoryDetail[];
  incomplete: FacultyPeriodIncompleteItem[];
  attendanceDateRange: FacultyAttendanceDateRange;
  components?: {
    lecture: FacultyPeriodComponentBreakdown;
    laboratory: FacultyPeriodComponentBreakdown;
  };
}

export interface FacultyPeriodComponentBreakdown {
  component: GradingComponentEnum;
  status: 'computed' | 'incomplete';
  percentage: number | null;
  categories: FacultyPeriodCategoryDetail[];
  incomplete: FacultyPeriodIncompleteItem[];
}

export interface FacultyPeriodModeComputedResult {
  status: 'computed';
  enrollmentId: string;
  studentId: string;
  percentage: number;
  gwa: number;
  retentionState: string;
  periods: {
    midterm: FacultyPeriodBreakdown;
    final: FacultyPeriodBreakdown;
  };
  breakdown: {
    calculationMode: 'authoritative_periods';
    termRatio: FacultyTermRatio;
    periods: {
      midterm: FacultyPeriodBreakdown;
      final: FacultyPeriodBreakdown;
    };
    retentionThreshold: number;
    percentage?: number;
    gwa?: number;
    retentionState?: string;
  };
}

export interface FacultyPeriodModeIncompleteResult {
  status: 'incomplete_period';
  enrollmentId: string;
  studentId: string;
  periods: {
    midterm: FacultyPeriodBreakdown;
    final: FacultyPeriodBreakdown;
  };
  breakdown: {
    calculationMode: 'authoritative_periods';
    termRatio: FacultyTermRatio;
    periods: {
      midterm: FacultyPeriodBreakdown;
      final: FacultyPeriodBreakdown;
    };
    retentionThreshold: number;
  };
  previouslyPersisted: boolean;
  previousPercentage: number | null;
  previousGwa: number | null;
}

export interface FacultyLegacyComputedResult {
  status: 'computed';
  enrollmentId: string;
  studentId: string;
  percentage: number;
  gwa: number;
  retentionState: string;
  breakdown: {
    calculationMode: 'authoritative_categories' | 'raw_points';
    categories?: Array<{
      categoryId: number;
      name: string;
      earnedPoints: number;
      possiblePoints: number;
      ratio: number;
      weight: number;
      contribution: number;
    }>;
    retentionThreshold: number;
  };
}

export interface FacultyLegacyIncompleteAttendanceResult {
  status: 'incomplete_attendance';
  enrollmentId: string;
  studentId: string;
  missingAssessments: Array<{
    assessmentId: string;
    attendanceSessionDate: string;
    attendanceSessionCode: string;
  }>;
}

/** The course has no saved grade weights, so the class cannot be graded yet. */
export interface FacultyWeightsRequiredResult {
  status: 'weights_required';
  enrollmentId: string | number;
  studentId?: string | number;
  message: string;
  periods?: undefined;
}

export type FacultyGradeComputeResult =
  | FacultyPeriodModeComputedResult
  | FacultyPeriodModeIncompleteResult
  | FacultyLegacyComputedResult
  | FacultyLegacyIncompleteAttendanceResult
  | FacultyWeightsRequiredResult;

export interface FacultyComputeGradesResponse {
  status: string;
  message: string;
  results: FacultyGradeComputeResult[];
}

export function isPeriodComputeResult(
  result: FacultyGradeComputeResult
): result is FacultyPeriodModeComputedResult | FacultyPeriodModeIncompleteResult {
  return result.status === 'incomplete_period' || (result.status === 'computed' && 'periods' in result);
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

export function requestBiometricLivenessGuidance(formData: FormData, signal?: AbortSignal): Promise<LivenessGuidanceResponse> {
  return request<LivenessGuidanceResponse>('POST', '/student/biometric/liveness/guidance', formData, undefined, 5000, signal);
}

export function submitBiometricEnrollment(formData: FormData, signal?: AbortSignal): Promise<BiometricEnrollmentResponse> {
  return request<BiometricEnrollmentResponse>('POST', '/student/biometric/enrollment', formData, undefined, 30000, signal);
}

export function revokeStudentBiometricProfile(): Promise<BiometricRevocationResponse> {
  return request<BiometricRevocationResponse>('DELETE', '/student/biometric/profile');
}

export async function getStudentActiveAttendanceSessions(): Promise<StudentActiveSessionsResponse> {
  const raw = await request<unknown>('GET', '/student/attendance/sessions/active');
  if (Array.isArray(raw)) {
    return { sessions: raw.map(normalizeStudentActiveSession) };
  }
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.sessions)) {
      return { sessions: obj.sessions.map(normalizeStudentActiveSession) };
    }
    if (Array.isArray(obj.data)) {
      return { sessions: obj.data.map(normalizeStudentActiveSession) };
    }
  }
  return { sessions: [] };
}

export function submitBiometricAttendance(formData: FormData, signal?: AbortSignal): Promise<BiometricAttendanceResponse> {
  return request<BiometricAttendanceResponse>('POST', '/student/attendance/biometric', formData, undefined, 30000, signal);
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
    const records = raw.map(normalizeStudentAttendanceLogRecord);
    return { records, total: records.length };
  }
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    const source = Array.isArray(obj.records)
      ? obj.records
      : Array.isArray(obj.logs)
        ? obj.logs
        : Array.isArray(obj.data)
          ? obj.data
          : null;
    if (source) {
      const records = source.map(normalizeStudentAttendanceLogRecord);
      return {
        records,
        total: typeof obj.total === 'number' ? obj.total : records.length,
      };
    }
  }
  return { records: [], total: 0 };
}

/** Save the signed-in user's own appearance preference (any role). */
export function updateThemePreferenceApi(theme: 'light' | 'dark'): Promise<{ status: string; theme: 'light' | 'dark' }> {
  return request('POST', '/auth/theme', { theme });
}

export function changePasswordApi(data: PasswordChangePayload): Promise<PasswordChangeResponse> {
  return request<PasswordChangeResponse>('POST', '/auth/password/change', {
    current_password: data.currentPassword,
    new_password: data.newPassword,
    confirm_password: data.confirmPassword,
  });
}

// --- Authoritative Student Academic APIs ---
export function getStudentAcademicDashboardApi(schoolYear?: string): Promise<StudentAcademicDashboardResponse & SchoolYearScope> {
  return request<StudentAcademicDashboardResponse & SchoolYearScope>('GET', `/student/dashboard${schoolYearQuery(schoolYear)}`);
}

export function getStudentAcademicProfileApi(): Promise<StudentAcademicProfileResponse> {
  return request<StudentAcademicProfileResponse>('GET', '/student/profile');
}

export function updateStudentProfileApi(data: OwnProfileNameChangePayload): Promise<OwnProfileNameChangeResponse> {
  return updateOwnProfileNameApi('/student/profile', data);
}

export function getStudentAcademicClassesApi(): Promise<StudentAcademicClassesResponse> {
  return request<StudentAcademicClassesResponse>('GET', '/student/classes');
}

export function getStudentAcademicRetentionApi(): Promise<StudentAcademicRetentionResponse> {
  return request<StudentAcademicRetentionResponse>('GET', '/student/retention');
}

// --- Authoritative Notifications APIs ---
export function getNotificationsApi(params?: {
  limit?: number;
  unreadOnly?: boolean;
}): Promise<NotificationsResponse> {
  const query = new URLSearchParams();
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.unreadOnly !== undefined) query.set('unreadOnly', String(params.unreadOnly));
  const qs = query.toString();
  return request<NotificationsResponse>('GET', `/notifications${qs ? `?${qs}` : ''}`);
}

export function markNotificationReadApi(notificationId: number | string): Promise<{ status: string }> {
  return request<{ status: string }>('POST', `/notifications/${encodeURIComponent(String(notificationId))}/read`);
}

export function markAllNotificationsReadApi(): Promise<{ status: string; updatedCount: number }> {
  return request<{ status: string; updatedCount: number }>('POST', '/notifications/read-all');
}
