<?php

declare(strict_types=1);

$autoload = dirname(__DIR__) . '/vendor/autoload.php';
if (!is_file($autoload)) {
    throw new \RuntimeException('Backend dependencies are missing. Run composer install in backend/.');
}
require_once $autoload;

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/database.php';
require_once __DIR__ . '/request.php';
require_once __DIR__ . '/response.php';
require_once __DIR__ . '/router.php';
require_once __DIR__ . '/security.php';
require_once __DIR__ . '/validation.php';
require_once __DIR__ . '/jwt.php';
require_once __DIR__ . '/mfa.php';
require_once __DIR__ . '/account_identity.php';
require_once __DIR__ . '/ratelimit.php';
require_once __DIR__ . '/audit.php';
require_once __DIR__ . '/mailer.php';
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/auth_runtime.php';
require_once __DIR__ . '/mfa_runtime.php';
require_once __DIR__ . '/../controllers/AuthController.php';
require_once __DIR__ . '/../controllers/MfaController.php';
require_once __DIR__ . '/../controllers/SessionController.php';

send_security_headers();
