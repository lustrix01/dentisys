<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/controllers/HealthController.php';
require_once dirname(__DIR__) . '/controllers/AuthController.php';
require_once dirname(__DIR__) . '/controllers/MfaController.php';
require_once dirname(__DIR__) . '/controllers/FacultyController.php';
require_once dirname(__DIR__) . '/controllers/SecretaryController.php';
require_once dirname(__DIR__) . '/controllers/AttendanceController.php';
require_once dirname(__DIR__) . '/controllers/GradeController.php';

return [
    [
        'method' => 'GET',
        'path' => '/api/health',
        'handler' => 'handle_health_check',
    ],
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

    // Faculty Module Endpoints
    [
        'method' => 'GET',
        'path' => '/api/faculty/dashboard',
        'handler' => 'handle_faculty_dashboard',
        'has_params' => false,
    ],
    [
        'method' => 'GET',
        'path' => '/api/faculty/classes',
        'handler' => 'handle_get_assigned_classes',
        'has_params' => false,
    ],
    [
        'method' => 'GET',
        'path' => '/api/faculty/classes/{id}/students',
        'handler' => 'handle_get_class_students',
        'has_params' => true,
    ],
    [
        'method' => 'GET',
        'path' => '/api/faculty/retention',
        'handler' => 'handle_get_retention_monitoring',
        'has_params' => false,
    ],
    [
        'method' => 'POST',
        'path' => '/api/faculty/remedials/update',
        'handler' => 'handle_update_remedial_score',
        'has_params' => false,
    ],
    [
        'method' => 'GET',
        'path' => '/api/faculty/biometrics',
        'handler' => 'handle_get_biometric_profiles',
        'has_params' => false,
    ],
    [
        'method' => 'POST',
        'path' => '/api/faculty/biometrics/consent',
        'handler' => 'handle_update_biometric_consent',
        'has_params' => false,
    ],
    [
        'method' => 'GET',
        'path' => '/api/faculty/emails',
        'handler' => 'handle_get_email_outbox',
        'has_params' => false,
    ],
    [
        'method' => 'POST',
        'path' => '/api/faculty/emails/send',
        'handler' => 'handle_send_email',
        'has_params' => false,
    ],

    // Secretary Module Endpoints
    [
        'method' => 'GET',
        'path' => '/api/secretary/dashboard',
        'handler' => 'handle_secretary_dashboard',
        'has_params' => false,
    ],
    [
        'method' => 'GET',
        'path' => '/api/secretary/class',
        'handler' => 'handle_get_assigned_class',
        'has_params' => false,
    ],
    [
        'method' => 'GET',
        'path' => '/api/secretary/cctv',
        'handler' => 'handle_get_cctv_feed_status',
        'has_params' => false,
    ],

    // Attendance Endpoints
    [
        'method' => 'GET',
        'path' => '/api/attendance',
        'handler' => 'handle_get_attendance',
        'has_params' => false,
    ],
    [
        'method' => 'POST',
        'path' => '/api/attendance',
        'handler' => 'handle_record_attendance',
        'has_params' => false,
    ],
    [
        'method' => 'POST',
        'path' => '/api/attendance/override',
        'handler' => 'handle_override_attendance',
        'has_params' => false,
    ],

    // Grade Endpoints
    [
        'method' => 'GET',
        'path' => '/api/grades/assessments',
        'handler' => 'handle_get_assessments',
        'has_params' => false,
    ],
    [
        'method' => 'POST',
        'path' => '/api/grades/assessments',
        'handler' => 'handle_create_assessment',
        'has_params' => false,
    ],
    [
        'method' => 'GET',
        'path' => '/api/grades/scores',
        'handler' => 'handle_get_scores',
        'has_params' => false,
    ],
    [
        'method' => 'POST',
        'path' => '/api/grades/scores',
        'handler' => 'handle_save_scores',
        'has_params' => false,
    ],
    [
        'method' => 'POST',
        'path' => '/api/grades/compute',
        'handler' => 'handle_compute_class_grades',
        'has_params' => false,
    ],
];
