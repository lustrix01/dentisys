<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/controllers/HealthController.php';
require_once dirname(__DIR__) . '/controllers/AuthController.php';
require_once dirname(__DIR__) . '/controllers/MfaController.php';
require_once dirname(__DIR__) . '/controllers/UserController.php';
require_once dirname(__DIR__) . '/controllers/SecretaryController.php';
require_once dirname(__DIR__) . '/controllers/PasswordResetController.php';
require_once dirname(__DIR__) . '/controllers/AdminController.php';
require_once dirname(__DIR__) . '/controllers/FacultyController.php';

return [
    [
        'method' => 'GET',
        'path' => '/api/health',
        'handler' => 'handle_health_check',
    ],
    // Auth & MFA
    [
        'method' => 'POST',
        'path' => '/api/auth/login',
        'handler' => 'handle_login',
        'has_params' => false,
    ],
    [
        'method' => 'POST',
        'path' => '/api/auth/register',
        'handler' => 'handle_register',
        'has_params' => false,
    ],
    [
        'method' => 'POST',
        'path' => '/api/auth/mfa/challenge/start',
        'handler' => 'handle_mfa_challenge_start',
        'has_params' => false,
    ],
    [
        'method' => 'POST',
        'path' => '/api/auth/mfa/enroll/start',
        'handler' => 'handle_mfa_enroll_start',
        'has_params' => false,
    ],
    [
        'method' => 'POST',
        'path' => '/api/auth/mfa/enroll/confirm',
        'handler' => 'handle_mfa_enroll_confirm',
        'has_params' => false,
    ],
    [
        'method' => 'POST',
        'path' => '/api/auth/mfa/verify',
        'handler' => 'handle_mfa_verify',
        'has_params' => false,
    ],
    [
        'method' => 'POST',
        'path' => '/api/auth/mfa/email/resend',
        'handler' => 'handle_mfa_email_resend',
        'has_params' => false,
    ],
    [
        'method' => 'POST',
        'path' => '/api/auth/mfa/recover',
        'handler' => 'handle_mfa_recover',
        'has_params' => false,
    ],
    [
        'method' => 'GET',
        'path' => '/api/auth/mfa/settings',
        'handler' => 'handle_mfa_settings_status',
        'has_params' => false,
    ],
    [
        'method' => 'POST',
        'path' => '/api/auth/mfa/settings/email/start',
        'handler' => 'handle_mfa_settings_email_start',
        'has_params' => false,
    ],
    [
        'method' => 'POST',
        'path' => '/api/auth/mfa/settings/email/confirm',
        'handler' => 'handle_mfa_settings_email_confirm',
        'has_params' => false,
    ],
    [
        'method' => 'POST',
        'path' => '/api/auth/mfa/settings/recovery-codes',
        'handler' => 'handle_mfa_settings_recovery_codes',
        'has_params' => false,
    ],
    [
        'method' => 'POST',
        'path' => '/api/auth/mfa/settings/revoke',
        'handler' => 'handle_mfa_settings_revoke',
        'has_params' => false,
    ],
    [
        'method' => 'GET',
        'path' => '/api/auth/me',
        'handler' => 'handle_me',
        'has_params' => false,
    ],
    [
        'method' => 'POST',
        'path' => '/api/auth/refresh',
        'handler' => 'handle_refresh',
        'has_params' => false,
    ],
    [
        'method' => 'POST',
        'path' => '/api/auth/logout',
        'handler' => 'handle_logout',
        'has_params' => false,
    ],
    // User & Admin Approval Workflow
    [
        'method' => 'GET',
        'path' => '/api/admin/users/faculty',
        'handler' => 'handle_admin_list_faculty',
        'has_params' => false,
    ],
    [
        'method' => 'POST',
        'path' => '/api/admin/users/approval',
        'handler' => 'handle_admin_faculty_approval',
        'has_params' => false,
    ],
    // Class Secretary Workflow
    [
        'method' => 'POST',
        'path' => '/api/secretary/invite',
        'handler' => 'handle_secretary_invite',
        'has_params' => false,
    ],
    [
        'method' => 'GET',
        'path' => '/api/secretary/invitation',
        'handler' => 'handle_secretary_get_invitation',
        'has_params' => false,
    ],
    [
        'method' => 'GET',
        'path' => '/api/secretary/invitations',
        'handler' => 'handle_secretary_list_invitations',
        'has_params' => false,
    ],
    [
        'method' => 'POST',
        'path' => '/api/secretary/invitations/revoke',
        'handler' => 'handle_secretary_revoke_invitation',
        'has_params' => false,
    ],
    [
        'method' => 'POST',
        'path' => '/api/secretary/activate',
        'handler' => 'handle_secretary_activate',
        'has_params' => false,
    ],
    [
        'method' => 'GET',
        'path' => '/api/secretary/dashboard/kpis',
        'handler' => 'handle_secretary_dashboard_kpis',
        'has_params' => false,
    ],
    [
        'method' => 'GET',
        'path' => '/api/secretary/attendance',
        'handler' => 'handle_secretary_attendance_get',
        'has_params' => false,
    ],
    [
        'method' => 'POST',
        'path' => '/api/secretary/attendance/override',
        'handler' => 'handle_secretary_attendance_override',
        'has_params' => false,
    ],
    [
        'method' => 'GET',
        'path' => '/api/secretary/profile',
        'handler' => 'handle_secretary_profile_get',
        'has_params' => false,
    ],
    [
        'method' => 'POST',
        'path' => '/api/secretary/profile',
        'handler' => 'handle_secretary_profile_update',
        'has_params' => false,
    ],
    [
        'method' => 'GET',
        'path' => '/api/secretary/settings',
        'handler' => 'handle_secretary_settings_get',
        'has_params' => false,
    ],
    [
        'method' => 'POST',
        'path' => '/api/secretary/settings',
        'handler' => 'handle_secretary_settings_update',
        'has_params' => false,
    ],
    // Password Reset Workflow
    [
        'method' => 'POST',
        'path' => '/api/auth/password/reset-request',
        'handler' => 'handle_password_reset_request',
        'has_params' => false,
    ],
    [
        'method' => 'POST',
        'path' => '/api/auth/password/reset-confirm',
        'handler' => 'handle_password_reset_confirm',
        'has_params' => false,
    ],
    // Dean (Admin) Module APIs
    [
        'method' => 'GET',
        'path' => '/api/admin/dashboard/kpis',
        'handler' => 'handle_admin_dashboard_kpis',
        'has_params' => false,
    ],
    [
        'method' => 'GET',
        'path' => '/api/admin/retention/criteria',
        'handler' => 'handle_admin_retention_criteria_get',
        'has_params' => false,
    ],
    [
        'method' => 'POST',
        'path' => '/api/admin/retention/criteria',
        'handler' => 'handle_admin_retention_criteria_save',
        'has_params' => false,
    ],
    [
        'method' => 'GET',
        'path' => '/api/admin/audit-logs',
        'handler' => 'handle_admin_audit_logs',
        'has_params' => false,
    ],
    [
        'method' => 'GET',
        'path' => '/api/admin/profile',
        'handler' => 'handle_admin_profile_get',
        'has_params' => false,
    ],
    [
        'method' => 'POST',
        'path' => '/api/admin/profile',
        'handler' => 'handle_admin_profile_update',
        'has_params' => false,
    ],
    [
        'method' => 'GET',
        'path' => '/api/admin/settings',
        'handler' => 'handle_admin_settings_get',
        'has_params' => false,
    ],
    [
        'method' => 'POST',
        'path' => '/api/admin/settings',
        'handler' => 'handle_admin_settings_update',
        'has_params' => false,
    ],
    [
        'method' => 'GET',
        'path' => '/api/admin/reports/summary',
        'handler' => 'handle_admin_reports_summary',
        'has_params' => false,
    ],
    // Faculty Module APIs
    [
        'method' => 'GET',
        'path' => '/api/faculty/dashboard/kpis',
        'handler' => 'handle_faculty_dashboard_kpis',
        'has_params' => false,
    ],
    [
        'method' => 'GET',
        'path' => '/api/faculty/students',
        'handler' => 'handle_faculty_students',
        'has_params' => false,
    ],
    [
        'method' => 'POST',
        'path' => '/api/faculty/students',
        'handler' => 'handle_faculty_student_create',
        'has_params' => false,
    ],
    [
        'method' => 'POST',
        'path' => '/api/faculty/students/facial-enroll',
        'handler' => 'handle_faculty_facial_enroll',
        'has_params' => false,
    ],
    [
        'method' => 'GET',
        'path' => '/api/faculty/assessments',
        'handler' => 'handle_faculty_assessments_get',
        'has_params' => false,
    ],
    [
        'method' => 'POST',
        'path' => '/api/faculty/assessments',
        'handler' => 'handle_faculty_assessments_save',
        'has_params' => false,
    ],
    [
        'method' => 'POST',
        'path' => '/api/faculty/assessments/delete',
        'handler' => 'handle_faculty_assessment_delete',
        'has_params' => false,
    ],
    [
        'method' => 'GET',
        'path' => '/api/faculty/scores',
        'handler' => 'handle_faculty_scores_get',
        'has_params' => false,
    ],
    [
        'method' => 'POST',
        'path' => '/api/faculty/scores',
        'handler' => 'handle_faculty_scores_save',
        'has_params' => false,
    ],
    [
        'method' => 'POST',
        'path' => '/api/faculty/grades/compute',
        'handler' => 'handle_faculty_grades_compute',
        'has_params' => false,
    ],
    [
        'method' => 'GET',
        'path' => '/api/faculty/attendance',
        'handler' => 'handle_faculty_attendance_get',
        'has_params' => false,
    ],
    [
        'method' => 'POST',
        'path' => '/api/faculty/attendance/session',
        'handler' => 'handle_faculty_attendance_session_create',
        'has_params' => false,
    ],
    [
        'method' => 'POST',
        'path' => '/api/faculty/attendance/override',
        'handler' => 'handle_faculty_attendance_override',
        'has_params' => false,
    ],
    [
        'method' => 'GET',
        'path' => '/api/faculty/retention',
        'handler' => 'handle_faculty_retention_get',
        'has_params' => false,
    ],
    [
        'method' => 'POST',
        'path' => '/api/faculty/retention/remedial',
        'handler' => 'handle_faculty_retention_remedial_save',
        'has_params' => false,
    ],
    [
        'method' => 'POST',
        'path' => '/api/faculty/retention/status',
        'handler' => 'handle_faculty_retention_status_update',
        'has_params' => false,
    ],
    [
        'method' => 'GET',
        'path' => '/api/faculty/profile',
        'handler' => 'handle_faculty_profile_get',
        'has_params' => false,
    ],
    [
        'method' => 'POST',
        'path' => '/api/faculty/profile',
        'handler' => 'handle_faculty_profile_update',
        'has_params' => false,
    ],
    [
        'method' => 'GET',
        'path' => '/api/faculty/settings',
        'handler' => 'handle_faculty_settings_get',
        'has_params' => false,
    ],
    [
        'method' => 'POST',
        'path' => '/api/faculty/settings',
        'handler' => 'handle_faculty_settings_update',
        'has_params' => false,
    ],
    [
        'method' => 'POST',
        'path' => '/api/faculty/send-email',
        'handler' => 'handle_faculty_email_send',
        'has_params' => false,
    ],
    [
        'method' => 'GET',
        'path' => '/api/faculty/email-logs',
        'handler' => 'handle_faculty_email_logs',
        'has_params' => false,
    ],
    [
        'method' => 'GET',
        'path' => '/api/faculty/reports/summary',
        'handler' => 'handle_faculty_reports_summary',
        'has_params' => false,
    ],
    // Class Management APIs
    [
        'method' => 'GET',
        'path' => '/api/faculty/classes',
        'handler' => 'handle_faculty_classes_get',
        'has_params' => false,
    ],
    [
        'method' => 'GET',
        'path' => '/api/faculty/courses',
        'handler' => 'handle_faculty_courses_get',
        'has_params' => false,
    ],
    [
        'method' => 'POST',
        'path' => '/api/faculty/classes',
        'handler' => 'handle_faculty_class_create',
        'has_params' => false,
    ],
    [
        'method' => 'GET',
        'path' => '/api/faculty/classes/available-students',
        'handler' => 'handle_faculty_class_available_students',
        'has_params' => false,
    ],
    [
        'method' => 'POST',
        'path' => '/api/faculty/classes/enroll',
        'handler' => 'handle_faculty_class_enroll_students',
        'has_params' => false,
    ],
    [
        'method' => 'POST',
        'path' => '/api/faculty/classes/unenroll',
        'handler' => 'handle_faculty_class_unenroll_student',
        'has_params' => false,
    ],
];
