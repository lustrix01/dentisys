import { test as base, expect, Route, Page } from '@playwright/test';

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

// ROOM-001: the 15 rooms every database starts with (migration 054), as GET /api/rooms returns them.
const SEEDED_ROOMS: Array<[string, string]> = [
  ...['Lecture Hall A', 'Lecture Hall B', 'Auditorium'].map(n => [n, 'Lecture Halls & Auditoriums'] as [string, string]),
  ...['Dental Clinic Lab 1', 'Dental Clinic Lab 2', 'Oral Anatomy Lab', 'Prosthodontics Lab', 'Periodontics Lab', 'Simulation Lab'].map(n => [n, 'Laboratories & Dental Clinics'] as [string, string]),
  ...['Room 101', 'Room 102', 'Room 201', 'Room 202', 'Room 301', 'Room 302'].map(n => [n, 'Standard Classrooms'] as [string, string]),
];
export const MOCK_ROOMS = SEEDED_ROOMS.map(([name, group]) => ({ name, group, status: 'active', latitude: null, longitude: null, radiusMeters: null }));
export const roomsJson = (extra: Array<Record<string, unknown>> = []) => ({ status: 'ok', rooms: [...MOCK_ROOMS, ...extra] });

const KNOWN_API_PATHS = new Set([
  '/api/rooms', '/api/admin/people', '/api/admin/courses', '/api/admin/rooms', '/api/admin/overview', '/api/admin/face-flags', '/api/admin/people/filters', '/api/admin/classes', '/api/admin/classes/filters', '/api/admin/classes/detail',
  '/api/admin/people/transfer-dean', '/api/admin/classes/change-faculty', '/api/health', '/api/runtime-config', '/api/auth/login', '/api/auth/google', '/api/auth/google/link', '/api/auth/google/link/profile', '/api/auth/google/link/status', '/api/auth/faculty/invitation', '/api/auth/faculty/activate', '/api/auth/mfa/enroll/start',
  '/api/auth/mfa/enroll/confirm', '/api/auth/mfa/verify', '/api/auth/mfa/recover', '/api/auth/mfa/settings',
  '/api/auth/mfa/settings/recovery-codes', '/api/auth/mfa/settings/revoke', '/api/auth/mfa/trusted-devices/forget', '/api/auth/me', '/api/auth/refresh', '/api/auth/theme',
  '/api/auth/logout', '/api/auth/password/reset-request', '/api/auth/password/reset-confirm',
  '/api/auth/student/invitation', '/api/auth/student/activate', '/api/auth/development/mock-student-session',
  '/api/admin/faculty-invitations', '/api/admin/faculty-invitations/reissue', '/api/faculty/student-invitations', '/api/admin/dashboard/kpis', '/api/admin/retention/criteria',
  '/api/admin/academic-terms', '/api/admin/academic-terms/preview', '/api/admin/academic-terms/delete', '/api/admin/academic-terms/copy',
  '/api/admin/retention/criteria', '/api/admin/audit-logs', '/api/admin/profile', '/api/admin/settings', '/api/admin/reports/summary',
  '/api/secretary/invite', '/api/secretary/invitation', '/api/secretary/invitations', '/api/secretary/invitations/revoke',
  '/api/secretary/activate', '/api/secretary/dashboard/kpis', '/api/secretary/attendance', '/api/secretary/attendance/override',
  '/api/secretary/attendance/session', '/api/secretary/attendance/session/active', '/api/secretary/attendance/session/end',
  '/api/secretary/profile', '/api/secretary/settings',
  '/api/faculty/dashboard/kpis', '/api/faculty/students', '/api/faculty/assessments', '/api/faculty/assessments/delete',
  '/api/faculty/scores', '/api/faculty/grades/compute', '/api/faculty/attendance', '/api/faculty/attendance/session',
  '/api/faculty/attendance/override', '/api/faculty/retention', '/api/faculty/retention/remedial',
  '/api/faculty/profile', '/api/faculty/settings', '/api/faculty/send-email', '/api/faculty/email-logs', '/api/faculty/reports/summary',
  '/api/faculty/classes', '/api/faculty/courses', '/api/faculty/classes/available-students', '/api/faculty/classes/enroll',
  '/api/faculty/classes/unenroll', '/api/faculty/grading-config',
  '/api/notifications', '/api/notifications/read-all', '/api/secretary/activity', '/api/faculty/activity', '/api/faculty/attendance-activity', '/api/faculty/excused-requests', '/api/secretary/excused-requests',
  '/api/student/dashboard', '/api/student/classes', '/api/student/retention',
  '/api/student/attendance/logs', '/api/student/attendance/sessions/active', '/api/student/attendance/sessions/upcoming', '/api/student/biometric/profile',
  '/api/student/profile', '/api/student/join-requests',
  '/api/faculty/classes/join', '/api/faculty/classes/join/requests', '/api/faculty/classes/auto-sessions',
]);

const GET_ONLY_API_PATHS = new Set([
  '/api/rooms', '/api/admin/email-logs', '/api/admin/people', '/api/admin/courses', '/api/admin/rooms', '/api/admin/overview', '/api/admin/face-flags', '/api/admin/people/filters', '/api/admin/classes', '/api/admin/classes/filters', '/api/admin/classes/detail',
  '/api/health', '/api/runtime-config', '/api/auth/me', '/api/auth/google/link/status', '/api/auth/faculty/invitation', '/api/auth/student/invitation', '/api/auth/mfa/settings', '/api/admin/faculty-invitations',
  '/api/admin/dashboard/kpis', '/api/admin/audit-logs', '/api/admin/reports/summary', '/api/secretary/invitation', '/api/secretary/invitations',
  '/api/secretary/dashboard/kpis', '/api/secretary/attendance', '/api/secretary/attendance/session/active', '/api/secretary/profile', '/api/secretary/settings',
  '/api/secretary/activity', '/api/faculty/activity',
  '/api/faculty/dashboard/kpis', '/api/faculty/students', '/api/faculty/assessments',
  '/api/faculty/attendance', '/api/faculty/email-logs', '/api/faculty/reports/summary', '/api/faculty/courses', '/api/faculty/retention',
  '/api/faculty/classes/available-students',
  '/api/student/dashboard', '/api/student/classes', '/api/student/retention',
  '/api/student/attendance/logs', '/api/student/attendance/sessions/active', '/api/student/attendance/sessions/upcoming', '/api/student/biometric/profile',
  '/api/student/profile', '/api/student/join-requests',
  '/api/faculty/classes/join', '/api/faculty/classes/join/requests', '/api/faculty/classes/auto-sessions',
  '/api/faculty/attendance/sheet', '/api/admin/reports/attendance-sheet',
]);

const MULTI_METHOD_API_PATHS = new Set([
  '/api/admin/faculty-invitations',
  '/api/admin/academic-terms', '/api/admin/retention/criteria', '/api/admin/profile', '/api/admin/settings',
  '/api/secretary/profile', '/api/secretary/settings', '/api/faculty/scores', '/api/faculty/profile',
  '/api/faculty/settings', '/api/faculty/classes',
  '/api/notifications', '/api/faculty/excused-requests', '/api/secretary/excused-requests',
  '/api/faculty/attendance/sheet', '/api/admin/reports/attendance-sheet',
]);

function isKnownApiPath(pathname: string): boolean {
  if (KNOWN_API_PATHS.has(pathname)) return true;
  if (/^\/api\/notifications(\/|$)/.test(pathname)) return true;
  return /^\/api\/(admin|faculty|secretary)\/(audit-logs|scores|retention|profile|settings|email-logs|reports\/summary)(\/|$)/.test(pathname);
}

function isKnownApiRequest(pathname: string, method: string): boolean {
  if (!isKnownApiPath(pathname)) return false;
  if (/^\/api\/notifications(\/|$)/.test(pathname)) return method === 'GET' || method === 'POST';
  if (pathname === '/api/faculty/grading-config') return method === 'GET' || method === 'PUT';
  if (MULTI_METHOD_API_PATHS.has(pathname)) return method === 'GET' || method === 'POST';
  if (GET_ONLY_API_PATHS.has(pathname)) return method === 'GET';
  return method === 'POST';
}

function responseFor(pathname: string, method: string): unknown {
  if (pathname === '/api/rooms') return roomsJson();
  // Superadmin Overview reads these lists for its tiles.
  if (pathname === '/api/admin/people') return { status: 'ok', people: [], total: 0, page: 1, pageSize: 50 };
  if (pathname === '/api/admin/face-flags') return { status: 'ok', flags: [], total: 0, page: 1, pageSize: 50 };
  if (pathname === '/api/admin/people/filters') return { status: 'ok', courses: [], classes: [] };
  if (pathname === '/api/admin/courses') return { status: 'ok', courses: [] };
  if (pathname === '/api/admin/classes') return { classes: [], total: 0, page: 1, pageSize: 50, counts: { active: 0, archived: 0 } };
  if (pathname === '/api/admin/classes/filters') return { schoolYears: [], currentSchoolYear: '2026-2027', courses: [], faculty: [] };
  if (pathname === '/api/admin/classes/detail') return { class: null, roster: [] };
  if (pathname === '/api/admin/rooms') return { status: 'ok', rooms: [], categories: [] };
  if (pathname === '/api/admin/overview') return {
    status: 'ok',
    attention: { expiredInvitations: { faculty: 0, students: 0 }, facultyWithoutClasses: 0, inactive30: { faculty: 0, students: 0 }, nextTermMissing: false },
    faceFlagsOpen: 0,
    accounts: { faculty: { active: 0, invited: 0, deactivated: 0 }, students: { active: 0, invited: 0, deactivated: 0 } },
    signIns: [], security: { twoFactor: { faculty: { on: 0, total: 0 }, students: { on: 0, total: 0 } }, failedSignIns: [] },
    recentAuditEvents: [],
    yearLevels: [], sectionsByCourse: [], setup: { currentTerm: null, courses: { active: 0, retired: 0 }, rooms: { active: 0, retired: 0 } },
  };
  if (pathname === '/api/auth/mfa/enroll/start') return { confirmation_token: 'mock-confirmation', provisioning_uri: 'otpauth://totp/DentiSYS:superadmin?secret=JBSWY3DPEHPK3PXP', qr_code_data_uri: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', base32_secret: 'JBSWY3DPEHPK3PXP' };
  if (pathname === '/api/auth/mfa/enroll/confirm') return { status: 'ok', recovery_codes: ['AAAA-1111', 'BBBB-2222', 'CCCC-3333', 'DDDD-4444', 'EEEE-5555', 'FFFF-6666', 'GGGG-7777', 'HHHH-8888'], access_token: 'mock-superadmin-session' };
  if (pathname === '/api/runtime-config') return { status: 'ok', ...DEFAULT_RUNTIME_CONFIG };
  if (pathname === '/api/auth/refresh') return { access_token: 'mock-refresh-token', user: { user_id: 100 } };
  if (pathname === '/api/auth/me') return { id: 100, user_id: 100, login_email: 'mock@bicol-u.edu.ph', display_name: 'Mock User', role: 'faculty', session_uuid: 'server-fixture-session', authentication_source: 'password' };
  if (pathname === '/api/auth/google/link/status') return { status: 'ok', linked: false };
  if (pathname === '/api/auth/google/link/profile') return { type: 'google_linked', status: 'ok', linked: true };
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
  if (pathname.endsWith('/admin/academic-terms')) return { status: 'ok', currentSchoolYear: '2026-2027', today: '2026-10-10', terms: [] };
  if (pathname.endsWith('/admin/settings')) return { status: 'ok', settings: { theme: 'light', retentionThreshold: 2.5, weights: { quizzes: 20, exams: 30, practicum: 40, attendance: 10 }, transmutationDefaults: { minimumPercentage: 50, maximumPercentage: 100 } } };
  if (pathname.endsWith('/faculty/settings')) return { status: 'ok', settings: { theme: 'light', transmutationDefaults: { minimumPercentage: 50, maximumPercentage: 100 } } };
  if (pathname.endsWith('/faculty/students') || pathname.endsWith('/faculty/assessments')) return [];
  if (pathname.endsWith('/faculty/courses')) return { status: 'ok', courses: [] };
  if (pathname.endsWith('/faculty/classes')) return { status: 'ok', classes: [] };
  if (pathname.endsWith('/faculty/activity') || pathname.endsWith('/secretary/activity') || pathname.endsWith('/admin/audit-logs')) return { status: 'ok', entries: [], total: 0, page: 1, pageSize: 50, areas: [] };
  if (pathname.endsWith('/faculty/attendance-activity')) return { status: 'ok', activity: [] };
  if (pathname === '/api/faculty/attendance/sheet' || pathname === '/api/admin/reports/attendance-sheet') {
    return { status: 'ok', sheet: { class: { csId: '1', courseCode: 'CLIN401', courseName: 'Clinical Dentistry I', sectionName: 'CLIN401-A', schoolYear: '2026-2027', semester: '1st Semester' }, sessions: [], students: [], records: [] } };
  }
  if (pathname.endsWith('/excused-requests')) return { status: 'ok', requests: [] };
  if (pathname === '/api/faculty/grading-config') {
    if (method === 'GET') {
      return { status: 'ok', configuration: null };
    }
    return {
      status: 'ok',
      configuration: {
        id: '1',
        course: { id: 1, code: 'CLIN401', name: 'Clinical Dentistry I' },
        semester: '1st Semester',
        schoolYear: '2026-2027',
        version: 1,
        categories: [],
      },
    };
  }
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
  if (pathname === '/api/notifications') return { status: 'ok', notifications: [], unreadCount: 0 };
  if (pathname === '/api/notifications/read-all') return { status: 'ok', updatedCount: 0 };
  if (/^\/api\/notifications\/[^/]+\/read$/.test(pathname)) return { status: 'ok', message: 'Notification marked as read' };
  if (pathname === '/api/student/dashboard') {
    return {
      status: 'ok',
      student: {
        studentId: 1,
        studentNumber: '2024-0001',
        name: 'Mock Student',
        firstName: 'Mock',
        lastName: 'Student',
        status: 'active',
        yearLevel: 4,
        account: { id: 101, email: 'mock.student@bicol-u.edu.ph', role: 'student', status: 'Active' },
      },
      summary: {
        classCount: 0,
        gwa: null,
        attendanceRate: null,
        clinicalHoursCompleted: 0,
        retentionAlerts: 0,
      },
      classes: [],
    };
  }
  if (pathname === '/api/student/classes') return { status: 'ok', classes: [] };
  if (pathname === '/api/student/join-requests' || pathname === '/api/faculty/classes/join/requests') return { status: 'ok', requests: [] };
  if (pathname === '/api/faculty/classes/join') return { status: 'ok', csId: 1, code: 'K7M-4QX', link: 'http://localhost/student/classes?join=K7M4QX', enabled: true, open: true, autoApprove: false };
  if (pathname === '/api/faculty/classes/auto-sessions') return { status: 'ok', enabled: false, biometricRequired: true, geofenceEnabled: false, geofenceRadius: 100, missingRoomLocations: [] };
  if (pathname === '/api/student/retention') return { status: 'ok', retention: { records: [], atRiskCount: 0, hasPendingGrades: false } };
  if (pathname === '/api/student/attendance/logs') return { status: 'ok', records: [], total: 0 };
  if (pathname === '/api/student/attendance/sessions/active') return { status: 'ok', activeSession: null };
  if (pathname === '/api/student/attendance/sessions/upcoming') return { status: 'ok', range: 'week', sessions: [], timezone: 'Asia/Manila', serverNow: '2026-10-10T00:00:00Z' };
  if (pathname === '/api/student/biometric/profile') return { status: 'ok', consentGranted: false, enrollmentStatus: 'not_enrolled', enrolledAt: null, expiresAt: null, usableSampleCount: 0, requiredUsableSamples: 20, manualFallbackAvailable: true };
  if (pathname === '/api/student/profile') {
    return {
      status: 'ok',
      profile: {
        studentId: 1,
        studentNumber: '2024-0001',
        name: 'Mock Student',
        firstName: 'Mock',
        lastName: 'Student',
        email: 'mock.student@bicol-u.edu.ph',
        status: 'active',
        yearLevel: 4,
        account: { id: 101, email: 'mock.student@bicol-u.edu.ph', role: 'student', status: 'Active' },
      },
    };
  }
  if (pathname.endsWith('/retention/criteria') || pathname.endsWith('/retention')) return { status: 'ok', criteria: [], records: [], retention: [] };
  if (pathname.endsWith('/mfa/settings')) return { status: 'ok', two_factor: { enabled: false, authenticator_enabled: false, recovery_code_count: 0, trusted_device_count: 0 } };
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

// Secretary Attendance Monitoring opens on the Assigned Classes grid; this enters the roll-call worksheet
// (optionally on a given Manila date, since the worksheet defaults to today).
export async function openSecretaryWorksheet(page: Page, date?: string) {
  await page.getByRole('button', { name: 'View attendance', exact: true }).first().click();
  if (date) await page.locator('input[type="date"]').fill(date);
}

// Profile and Settings live in the header avatar menu (phone avatar or desktop name button), not the sidebar.
export async function openAccountMenu(page: Page) {
  const phoneAvatar = page.getByTitle('Profile menu');
  if (await phoneAvatar.isVisible()) await phoneAvatar.click();
  else await page.locator('header button:has(.lucide-chevron-down)').click();
}

// 13.9: signs in through the real login form with a mocked account of the given role. The Superadmin lands on its Overview, everyone else on '/'.
export async function signInAs(page: Page, role: 'admin' | 'superadmin', displayName = role === 'admin' ? 'Dr. Dean Admin' : 'Sam Superadmin') {
  await page.route('**/api/auth/login', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ type: 'direct_login', access_token: `mock-${role}-token` }) }));
  await page.route('**/api/auth/me', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 100, user_id: 100, login_email: `${role}@bicol-u.edu.ph`, display_name: displayName, role }) }));
  await page.goto('/login');
  await page.fill('input[inputmode="email"]', `${role}@bicol-u.edu.ph`);
  await page.fill('input[type="password"]', 'Password123!');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(role === 'superadmin' ? '/superadmin/overview' : '/');
}
