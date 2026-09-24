<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/controllers/HealthController.php';
require_once dirname(__DIR__) . '/controllers/RuntimeConfigController.php';
require_once dirname(__DIR__) . '/controllers/AuthController.php';
require_once dirname(__DIR__) . '/controllers/GoogleAuthController.php';
require_once dirname(__DIR__) . '/controllers/StudentAuthController.php';
require_once dirname(__DIR__) . '/controllers/StudentBiometricController.php';
require_once dirname(__DIR__) . '/controllers/MfaController.php';
require_once dirname(__DIR__) . '/controllers/FacultyInvitationController.php';
require_once dirname(__DIR__) . '/controllers/SecretaryController.php';
require_once dirname(__DIR__) . '/controllers/PasswordResetController.php';
require_once dirname(__DIR__) . '/controllers/PasswordChangeController.php';
require_once dirname(__DIR__) . '/controllers/StudentAcademicController.php';
require_once dirname(__DIR__) . '/controllers/NotificationController.php';
require_once dirname(__DIR__) . '/controllers/AdminController.php';
require_once dirname(__DIR__) . '/controllers/FacultyController.php';

return [
    [
        'method' => 'GET',
        'path' => '/api/health',
        'handler' => 'handle_health_check',
    ],
    [
        'method' => 'GET',
        'path' => '/api/runtime-config',
        'handler' => 'handle_runtime_config',
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
        'path' => '/api/auth/google',
        'handler' => 'handle_google_login',
        'has_params' => false,
    ],
    [
        'method' => 'POST',
        'path' => '/api/auth/google/link',
        'handler' => 'handle_google_link',
        'has_params' => false,
    ],
    [
        'method' => 'POST',
        'path' => '/api/auth/google/link/profile',
        'handler' => 'handle_google_profile_link',
        'has_params' => false,
    ],
    [
        'method' => 'GET',
        'path' => '/api/auth/google/link/status',
        'handler' => 'handle_google_link_status',
        'has_params' => false,
    ],
    [
        'method' => 'GET',
        'path' => '/api/auth/student/invitation',
        'handler' => 'handle_student_invitation_get',
        'has_params' => false,
    ],
    [
        'method' => 'POST',
        'path' => '/api/auth/student/activate',
        'handler' => 'handle_student_activate',
        'has_params' => false,
    ],
    [
        'method' => 'POST',
        'path' => '/api/auth/development/mock-student-session',
        'handler' => 'handle_development_mock_student_session',
        'has_params' => false,
    ],
    [
        'method' => 'GET',
        'path' => '/api/auth/faculty/invitation',
        'handler' => 'handle_auth_faculty_invitation_get',
        'has_params' => false,
    ],
    [
        'method' => 'POST',
        'path' => '/api/auth/faculty/activate',
        'handler' => 'handle_auth_faculty_invitation_accept',
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
    // Admin-authorized Faculty invitation workflow
    [
        'method' => 'GET',
        'path' => '/api/admin/faculty-invitations',
        'handler' => 'handle_admin_faculty_invitations_list',
        'has_params' => false,
    ],
    [
        'method' => 'POST',
        'path' => '/api/admin/faculty-invitations',
        'handler' => 'handle_admin_faculty_invitation_create',
        'has_params' => false,
    ],
    [
        'method' => 'POST',
        'path' => '/api/admin/faculty-invitations/reissue',
        'handler' => 'handle_admin_faculty_invitation_reissue',
        'has_params' => false,
    ],
    [
        'method' => 'POST',
        'path' => '/api/admin/faculty-invitations/update',
        'handler' => 'handle_admin_faculty_invitation_update',
        'has_params' => false,
    ],
    [
        'method' => 'POST',
        'path' => '/api/admin/faculty-invitations/revoke',
        'handler' => 'handle_admin_faculty_invitation_revoke',
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
        'path' => '/api/secretary/attendance/session',
        'handler' => 'handle_secretary_attendance_session_start',
        'has_params' => false,
    ],
    [
        'method' => 'GET',
        'path' => '/api/secretary/attendance/session/active',
        'handler' => 'handle_secretary_attendance_session_active',
        'has_params' => false,
    ],
    [
        'method' => 'POST',
        'path' => '/api/secretary/attendance/session/end',
        'handler' => 'handle_secretary_attendance_session_end',
        'has_params' => false,
    ],
    [
        'method' => 'POST',
        'path' => '/api/secretary/attendance/session/revoke',
        'handler' => 'handle_secretary_attendance_session_revoke',
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
    [
        'method' => 'GET',
        'path' => '/api/secretary/activity',
        'handler' => 'handle_secretary_activity_get',
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
    [
        'method' => 'POST',
        'path' => '/api/auth/password/change',
        'handler' => 'handle_password_change',
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
        'path' => '/api/faculty/activity',
        'handler' => 'handle_faculty_activity_get',
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
        'method' => 'PUT',
        'path' => '/api/faculty/students/{student_id}',
        'handler' => 'handle_faculty_student_update',
        'has_params' => true,
    ],
    [
        'method' => 'POST',
        'path' => '/api/faculty/student-invitations',
        'handler' => 'handle_student_invitation_create',
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
        'path' => '/api/faculty/grading-config',
        'handler' => 'handle_faculty_grading_config_get',
        'has_params' => false,
    ],
    [
        'method' => 'PUT',
        'path' => '/api/faculty/grading-config',
        'handler' => 'handle_faculty_grading_config_save',
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
        'path' => '/api/faculty/attendance/session/end',
        'handler' => 'handle_faculty_attendance_session_end',
        'has_params' => false,
    ],
    [
        'method' => 'POST',
        'path' => '/api/faculty/attendance/session/revoke',
        'handler' => 'handle_faculty_attendance_session_revoke',
        'has_params' => false,
    ],
    // Student academic self-service
    [
        'method' => 'GET',
        'path' => '/api/student/profile',
        'handler' => 'handle_student_profile_get',
        'has_params' => false,
    ],
    [
        'method' => 'GET',
        'path' => '/api/student/classes',
        'handler' => 'handle_student_classes_get',
        'has_params' => false,
    ],
    [
        'method' => 'GET',
        'path' => '/api/student/retention',
        'handler' => 'handle_student_retention_get',
        'has_params' => false,
    ],
    [
        'method' => 'GET',
        'path' => '/api/student/dashboard',
        'handler' => 'handle_student_dashboard_get',
        'has_params' => false,
    ],
    // Student biometric attendance self-service
    [
        'method' => 'GET',
        'path' => '/api/student/biometric/profile',
        'handler' => 'handle_student_biometric_profile_get',
        'has_params' => false,
    ],
    [
        'method' => 'PUT',
        'path' => '/api/student/biometric/consent',
        'handler' => 'handle_student_biometric_consent',
        'has_params' => false,
    ],
    [
        'method' => 'POST',
        'path' => '/api/student/biometric/liveness/challenge',
        'handler' => 'handle_student_biometric_challenge',
        'has_params' => false,
    ],
    [
        'method' => 'POST',
        'path' => '/api/student/biometric/liveness/guidance',
        'handler' => 'handle_student_biometric_guidance',
        'has_params' => false,
    ],
    [
        'method' => 'POST',
        'path' => '/api/student/biometric/enrollment',
        'handler' => 'handle_student_biometric_enrollment',
        'has_params' => false,
    ],
    [
        'method' => 'DELETE',
        'path' => '/api/student/biometric/profile',
        'handler' => 'handle_student_biometric_revoke',
        'has_params' => false,
    ],
    [
        'method' => 'GET',
        'path' => '/api/student/attendance/sessions/active',
        'handler' => 'handle_student_attendance_active_sessions',
        'has_params' => false,
    ],
    [
        'method' => 'POST',
        'path' => '/api/student/attendance/biometric',
        'handler' => 'handle_student_attendance_biometric',
        'has_params' => false,
    ],
    [
        'method' => 'GET',
        'path' => '/api/student/attendance/logs',
        'handler' => 'handle_student_attendance_logs',
        'has_params' => false,
    ],
    // Recipient-scoped notifications
    [
        'method' => 'GET',
        'path' => '/api/notifications',
        'handler' => 'handle_notifications_list',
        'has_params' => false,
    ],
    [
        'method' => 'POST',
        'path' => '/api/notifications/read-all',
        'handler' => 'handle_notifications_mark_all_read',
        'has_params' => false,
    ],
    [
        'method' => 'POST',
        'path' => '/api/notifications/{notification_id}/read',
        'handler' => 'handle_notification_mark_read',
        'has_params' => true,
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
        'method' => 'POST',
        'path' => '/api/faculty/classes/update',
        'handler' => 'handle_faculty_class_update',
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
