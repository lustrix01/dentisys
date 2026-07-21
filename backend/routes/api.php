<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/controllers/HealthController.php';
require_once dirname(__DIR__) . '/controllers/AuthController.php';
require_once dirname(__DIR__) . '/controllers/MfaController.php';

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
];
