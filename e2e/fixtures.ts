import { test as base, expect, Route } from '@playwright/test';

type RuntimeConfig = {
  environment: 'test';
  allowed_email_domains: string[];
  providers: {
    identity: { password: { enabled: boolean }; google: { enabled: boolean; client_id: string | null }; development_mock: { enabled: boolean } };
    email: { active: 'mailpit' };
    biometrics: { active: 'disabled' | 'development-mock' };
    location: { active: 'disabled' | 'development-mock' };
  };
  features: { browser_attendance_prototype: boolean; student_auth_enabled: boolean };
};

const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  environment: 'test',
  allowed_email_domains: ['bicol-u.edu.ph'],
  providers: {
    identity: { password: { enabled: true }, google: { enabled: false, client_id: null }, development_mock: { enabled: false } },
    email: { active: 'mailpit' },
    biometrics: { active: 'disabled' },
    location: { active: 'disabled' },
  },
  features: { browser_attendance_prototype: false, student_auth_enabled: false },
};

const KNOWN_API_PATHS = new Set([
  '/api/health', '/api/runtime-config', '/api/auth/login', '/api/auth/google', '/api/auth/google/link', '/api/auth/faculty/invitation', '/api/auth/faculty/activate', '/api/auth/mfa/enroll/start',
  '/api/auth/mfa/enroll/confirm', '/api/auth/mfa/verify', '/api/auth/mfa/recover', '/api/auth/mfa/settings',
  '/api/auth/mfa/settings/recovery-codes', '/api/auth/mfa/settings/revoke', '/api/auth/me', '/api/auth/refresh',
  '/api/auth/logout', '/api/auth/password/reset-request', '/api/auth/password/reset-confirm',
  '/api/auth/student/invitation', '/api/auth/student/activate', '/api/auth/development/mock-student-session',
  '/api/admin/faculty-invitations', '/api/admin/faculty-invitations/reissue', '/api/faculty/student-invitations', '/api/admin/dashboard/kpis', '/api/admin/retention/criteria',
  '/api/admin/retention/criteria', '/api/admin/audit-logs', '/api/admin/profile', '/api/admin/settings', '/api/admin/reports/summary',
  '/api/secretary/invite', '/api/secretary/invitation', '/api/secretary/invitations', '/api/secretary/invitations/revoke',
  '/api/secretary/activate', '/api/secretary/dashboard/kpis', '/api/secretary/attendance', '/api/secretary/attendance/override',
  '/api/secretary/attendance/session', '/api/secretary/attendance/session/active', '/api/secretary/attendance/session/end',
  '/api/secretary/profile', '/api/secretary/settings',
  '/api/faculty/dashboard/kpis', '/api/faculty/students', '/api/faculty/assessments', '/api/faculty/assessments/delete',
  '/api/faculty/scores', '/api/faculty/grades/compute', '/api/faculty/attendance', '/api/faculty/attendance/session',
  '/api/faculty/attendance/override', '/api/faculty/retention', '/api/faculty/retention/remedial', '/api/faculty/retention/status',
  '/api/faculty/profile', '/api/faculty/settings', '/api/faculty/send-email', '/api/faculty/email-logs', '/api/faculty/reports/summary',
  '/api/faculty/classes', '/api/faculty/courses', '/api/faculty/classes/available-students', '/api/faculty/classes/enroll',
  '/api/faculty/classes/unenroll',
]);

const GET_ONLY_API_PATHS = new Set([
  '/api/health', '/api/runtime-config', '/api/auth/me', '/api/auth/faculty/invitation', '/api/auth/student/invitation', '/api/auth/mfa/settings', '/api/admin/faculty-invitations',
  '/api/admin/dashboard/kpis', '/api/admin/audit-logs', '/api/admin/reports/summary', '/api/secretary/invitation', '/api/secretary/invitations',
  '/api/secretary/dashboard/kpis', '/api/secretary/attendance', '/api/secretary/attendance/session/active', '/api/secretary/profile', '/api/secretary/settings',
  '/api/faculty/dashboard/kpis', '/api/faculty/students', '/api/faculty/assessments',
  '/api/faculty/attendance', '/api/faculty/email-logs', '/api/faculty/reports/summary', '/api/faculty/courses',
  '/api/faculty/classes/available-students',
]);

const MULTI_METHOD_API_PATHS = new Set([
  '/api/admin/faculty-invitations',
  '/api/admin/retention/criteria', '/api/admin/profile', '/api/admin/settings',
  '/api/secretary/profile', '/api/secretary/settings', '/api/faculty/scores', '/api/faculty/profile',
  '/api/faculty/settings', '/api/faculty/classes',
]);

function isKnownApiPath(pathname: string): boolean {
  if (KNOWN_API_PATHS.has(pathname)) return true;
  return /^\/api\/(admin|faculty|secretary)\/(audit-logs|scores|retention|profile|settings|email-logs|reports\/summary)(\/|$)/.test(pathname);
}

function isKnownApiRequest(pathname: string, method: string): boolean {
  if (!isKnownApiPath(pathname)) return false;
  if (MULTI_METHOD_API_PATHS.has(pathname)) return method === 'GET' || method === 'POST';
  if (GET_ONLY_API_PATHS.has(pathname)) return method === 'GET';
  return method === 'POST';
}

function responseFor(pathname: string, method: string): unknown {
  if (pathname === '/api/runtime-config') return { status: 'ok', ...DEFAULT_RUNTIME_CONFIG };
  if (pathname === '/api/auth/refresh') return { access_token: 'mock-refresh-token', user: { user_id: 100 } };
  if (pathname === '/api/auth/me') return { id: 100, user_id: 100, login_email: 'mock@bicol-u.edu.ph', display_name: 'Mock User', role: 'faculty', session_uuid: 'server-fixture-session', authentication_source: 'password' };
  if (pathname === '/api/auth/development/mock-student-session') return { type: 'direct_login', two_factor_required: false, two_factor_enrolled: false, access_token: 'server-fixture-student-token', user: { user_id: 101 } };
  if (pathname === '/api/health') return { status: 'ok', app: 'DentiSYS API', php: 'up', database: 'up', timestamp: new Date().toISOString() };
  if (pathname === '/api/secretary/dashboard/kpis') return { status: 'ok', kpis: { todayRecords: 0, overriddenCount: 0, assignedStudents: 0, attendanceRate: 0 }, assignedClass: { classId: '1', className: 'CLIN401', classroomName: 'BU Dental Room 101' }, recentActivity: [] };
  if (pathname === '/api/secretary/attendance/session/active') return { status: 'ok', activeSession: null };
  if (pathname === '/api/secretary/attendance/session') return {
    status: 'ok',
    session: {
      sessionId: '1',
      csId: 1,
      classId: '1',
      className: 'CLIN401',
      courseCode: 'CLIN401',
      sessionDate: new Date().toISOString().slice(0, 10),
      sessionCode: 'CS1-20260921-TEST01',
      room: 'BU Dental Room 101',
      startedAt: new Date().toISOString(),
      status: 'active',
      geofenceEnabled: true,
      biometricRequired: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  };
  if (pathname === '/api/secretary/attendance/session/end') return {
    status: 'ok',
    session: {
      sessionId: '1',
      csId: 1,
      classId: '1',
      className: 'CLIN401',
      courseCode: 'CLIN401',
      status: 'ended',
      endedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  };
  if (pathname.endsWith('/dashboard/kpis')) return { status: 'ok', kpis: {}, classes: [], gwaBuckets: [], statusCounts: {}, classAttendance: [] };
  if (pathname.endsWith('/reports/summary')) return { status: 'ok', reports: { students: [], attendance: [], totalCount: 0, summary: { totalStudents: 0, averageGWA: 0, atRiskCount: 0, retentionPassRate: 0 } } };
  if (pathname.endsWith('/admin/settings')) return { status: 'ok', settings: { theme: 'light', retentionThreshold: 2.5, weights: { quizzes: 20, exams: 30, practicum: 40, attendance: 10 }, transmutationDefaults: { minimumPercentage: 50, maximumPercentage: 100 } } };
  if (pathname.endsWith('/faculty/settings')) return { status: 'ok', settings: { theme: 'light', transmutationDefaults: { minimumPercentage: 50, maximumPercentage: 100 } } };
  if (pathname.endsWith('/faculty/students') || pathname.endsWith('/faculty/assessments')) return [];
  if (pathname.endsWith('/faculty/courses')) return { status: 'ok', courses: [] };
  if (pathname.endsWith('/faculty/classes')) return { status: 'ok', classes: [] };
  if (pathname.endsWith('/faculty/attendance') || pathname.endsWith('/secretary/attendance')) {
    return {
      status: 'ok',
      records: [],
      worksheet: {
        classSection: { id: '1', name: 'CLIN401-A', block: 'A', semester: '1st', schoolYear: '2025-2026', status: 'Active' },
        course: { id: 1, code: 'CLIN401', name: 'Clinical Dentistry I', units: 3 },
        date: new Date().toISOString().slice(0, 10),
        attendanceSession: null,
        attendanceSessions: [],
        roster: [],
      },
    };
  }
  if (pathname.endsWith('/faculty/attendance/override')) {
    return { status: 'ok', message: 'Attendance record updated and audited.', operation: 'updated', recordId: '1', attendanceSessionId: null };
  }
  if (pathname.endsWith('/email-logs')) return { status: 'ok', logs: [] };
  if (pathname.endsWith('/retention/criteria') || pathname.endsWith('/retention')) return { status: 'ok', criteria: [], records: [], retention: [] };
  if (pathname.endsWith('/mfa/settings')) return { status: 'ok', two_factor: { enabled: false, authenticator_enabled: false, recovery_code_count: 0 } };
  if (method === 'GET') return [];
  return { status: 'ok', message: 'Deterministic mocked response.' };
}

export const test = base.extend<{ mockApi: void }>({
  mockApi: [
    async ({ page }, use) => {
      const unhandled: string[] = [];
      await page.route('**/api/**', async (route: Route) => {
        const request = route.request();
        const url = new URL(request.url());
        const path = url.pathname;
        if (!isKnownApiRequest(path, request.method())) {
          unhandled.push(`${request.method()} ${path}`);
          await route.fulfill({
            status: 599,
            contentType: 'application/json',
            body: JSON.stringify({ status: 'error', message: 'Unhandled mocked API request.' }),
          });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(responseFor(path, request.method())),
        });
      });
      await use();
      if (unhandled.length > 0) {
        throw new Error(`Unhandled mocked API requests:\n${[...new Set(unhandled)].join('\n')}`);
      }
    },
    { auto: true },
  ],
});

export { expect };
