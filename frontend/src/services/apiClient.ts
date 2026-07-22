import type {
  LoginResponse,
  EnrollStartResponse,
  EnrollConfirmResponse,
  MfaSuccessResponse,
  SafeUser,
} from '../types/auth';

const configuredBase = import.meta.env.VITE_API_BASE_URL?.trim();
const API_BASE_URL = configuredBase
  ? configuredBase.replace(/\/+$/, '')
  : '/api';

let accessToken: string | null = null;

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
  constructor(status: number, message: string, errors?: unknown) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

const KNOWN_MESSAGES: Record<number, Record<string, string>> = {
  400: {
    'Validation failed.': 'Please check your input and try again.',
    'Verification code required.': 'Please enter a verification code.',
    'Invalid verification code.': 'Invalid verification code. Please try again.',
    'Recovery code required.': 'Please enter a recovery code.',
  },
  401: {
    'Invalid credentials.': 'Invalid email or password.',
    'Invalid enrollment stage.': 'Enrollment session expired. Please log in again.',
    'Authentication required.': 'Your session has expired. Please log in again.',
  },
  429: {
    'Too many requests.': 'Too many attempts. Please wait and try again.',
  },
};

function mapError(status: number, backendMessage: string, responseData?: unknown): string {
  if (status === 400 && responseData && typeof responseData === 'object') {
    const dataObj = responseData as Record<string, unknown>;
    if (dataObj.errors) {
      if (typeof dataObj.errors === 'string' && dataObj.errors.trim()) {
        return dataObj.errors;
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
  if (status === 401) return 'Authentication failed. Please log in again.';
  if (status === 403) return 'Access denied. Contact the administrator.';
  if (status === 429) return 'Too many attempts. Please wait and try again.';
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

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const token = tokenOverride ?? accessToken;
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let response: Response;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      credentials: 'include',
      body: body !== undefined ? JSON.stringify(body) : undefined,
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

  if (!response.ok) {
    const backendMessage =
      responseData && typeof responseData === 'object' && 'message' in responseData
        ? String((responseData as Record<string, unknown>).message)
        : '';
    const errorsPayload =
      responseData && typeof responseData === 'object' && 'errors' in responseData
        ? (responseData as Record<string, unknown>).errors
        : undefined;
    throw new ApiError(response.status, mapError(response.status, backendMessage, responseData), errorsPayload);
  }

  return responseData as T;
}

export function login(email: string, password: string): Promise<LoginResponse> {
  return request<LoginResponse>('POST', '/auth/login', { email, password });
}

export function startEnrollment(enrollmentToken: string): Promise<EnrollStartResponse> {
  return request<EnrollStartResponse>('POST', '/auth/mfa/enroll/start', undefined, enrollmentToken);
}

export function confirmEnrollment(confirmationToken: string, code: string): Promise<EnrollConfirmResponse> {
  return request<EnrollConfirmResponse>('POST', '/auth/mfa/enroll/confirm', { code }, confirmationToken);
}

export function verifyMfa(mfaSessionToken: string, code: string): Promise<MfaSuccessResponse> {
  return request<MfaSuccessResponse>('POST', '/auth/mfa/verify', { code }, mfaSessionToken);
}

export function recoverMfa(mfaSessionToken: string, code: string): Promise<MfaSuccessResponse> {
  return request<MfaSuccessResponse>('POST', '/auth/mfa/recover', { code }, mfaSessionToken);
}

export function getMe(): Promise<SafeUser> {
  return request<SafeUser>('GET', '/auth/me');
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

export function registerFacultyApi(data: { name: string; email: string; password: string }): Promise<{ status: string; message: string }> {
  return request<{ status: string; message: string }>('POST', '/auth/register', data);
}

export function getFacultyRequestsApi(): Promise<Array<{
  id: string;
  email: string;
  name: string;
  role: 'faculty' | 'admin' | 'secretary';
  title: string;
  status: string;
  createdAt: string;
  approvedAt?: string;
  rejectedAt?: string;
}>> {
  return request('GET', '/admin/users/faculty');
}

export function approveFacultyApi(email: string): Promise<{ status: string; message: string }> {
  return request<{ status: string; message: string }>('POST', '/admin/users/approval', { email, action: 'approve' });
}

export function rejectFacultyApi(email: string): Promise<{ status: string; message: string }> {
  return request<{ status: string; message: string }>('POST', '/admin/users/approval', { email, action: 'reject' });
}

export function inviteSecretaryApi(data: { student_name: string; student_number?: string; class_name: string; email: string }): Promise<{ status: string; token: string; invitation_link: string; message: string }> {
  return request('POST', '/secretary/invite', data);
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

export function saveRetentionCriteriaApi(criteria: any[]): Promise<{ status: string; message: string }> {
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
    averageAttendance: number;
    retentionAlerts: number;
    goodStanding: number;
    remedialCount: number;
  };
  classes: Array<{ id: string; name: string; students: number; attendance: number }>;
}> {
  return request('GET', '/faculty/dashboard/kpis');
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
  classId: string;
  className: string;
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

export function saveFacultyAssessmentsApi(assessments: any[]): Promise<{ status: string; message: string }> {
  return request('POST', '/faculty/assessments', assessments);
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
    emailNotifications: boolean;
    retentionAlertThreshold: number;
    theme: string;
  };
}> {
  return request('GET', '/faculty/settings');
}

export function updateFacultySettingsApi(settings: any): Promise<{ status: string; message: string }> {
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
    cctvCameraId: string;
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
}): Promise<{ status: string; message: string }> {
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
    cctvCameraId: string;
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
  };
}> {
  return request('GET', '/secretary/settings');
}

export function updateSecretarySettingsApi(settings: { theme: 'light' | 'dark' }): Promise<{ status: string; message: string }> {
  return request('POST', '/secretary/settings', settings);
}

export function sendFacultyEmailApi(data: {
  recipients: string[] | Array<{ name: string; email?: string }>;
  emailType: string;
  subject?: string;
  body?: string;
}): Promise<{ status: string; message: string }> {
  return request('POST', '/faculty/send-email', data);
}

export function getFacultyEmailLogsApi(): Promise<{
  status: string;
  logs: Array<{
    id: string;
    recipient: string;
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
  labRoom?: string;
  lecRoom?: string;
}): Promise<{ status: string; message: string; csId: number }> {
  return request('POST', '/faculty/classes', data);
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


