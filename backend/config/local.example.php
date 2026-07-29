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
    'ALLOWED_EMAIL_DOMAIN' => 'bicol-u.edu.ph',
    'CORS_ALLOWED_ORIGINS' => 'http://localhost:5173',
    'JWT_SIGNING_KEY_B64' => '',
    'MFA_ENCRYPTION_KEY_B64' => '',
    'EMAIL_OTP_HMAC_KEY_B64' => '',
    'AUDIT_MAC_KEY_B64' => '',
    'RATE_LIMIT_ENABLED' => 'true',
    'RATE_LIMIT_STORAGE_DIR' => '',
    'SMTP_HOST' => '127.0.0.1',
    'SMTP_PORT' => 1025,
    'SMTP_USER' => '',
    'SMTP_PASS' => '',
    'SMTP_FROM' => 'noreply@dentisys.local',
    'SMTP_ENCRYPTION' => 'none',
    'SMTP_VERIFY_PEER' => 'false',
    'SMTP_CA_FILE' => '',
];
