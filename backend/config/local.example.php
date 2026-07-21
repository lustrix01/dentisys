<?php

declare(strict_types=1);

return [
    'DB_HOST' => '127.0.0.1',
    'DB_PORT' => 3306,
    'DB_NAME' => 'dentisys',
    'DB_USER' => 'dentisys',
    'DB_PASS' => 'local-development-password',

    'APP_ENV' => 'development',
    'APP_IS_HTTPS' => 'false',
    'CORS_ALLOWED_ORIGINS' => 'http://localhost:5173',
    'JWT_SIGNING_KEY_B64' => '',
    'MFA_ENCRYPTION_KEY_B64' => '',
    'AUDIT_MAC_KEY_B64' => '',
    'RATE_LIMIT_ENABLED' => 'true',
    'RATE_LIMIT_STORAGE_DIR' => '',
];
