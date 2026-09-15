<?php

declare(strict_types=1);

require_once __DIR__ . '/../../backend/app/config.php';
require_once __DIR__ . '/../../backend/app/response.php';
require_once __DIR__ . '/../../backend/controllers/RuntimeConfigController.php';

$environmentKeys = [
    'APP_ENV',
    'EMAIL_PROVIDER',
    'DEV_MOCK_IDENTITY_ENABLED',
    'DEV_MOCK_BIOMETRIC_ENABLED',
    'DEV_MOCK_LOCATION_ENABLED',
    'DEV_BROWSER_ATTENDANCE_PROTOTYPE_ENABLED',
];
$savedEnvironment = [];
foreach ($environmentKeys as $key) {
    $savedEnvironment[$key] = getenv($key);
    putenv($key);
}

putenv('APP_ENV=test');
putenv('EMAIL_PROVIDER=mailpit');
putenv('DEV_MOCK_IDENTITY_ENABLED=true');
putenv('DEV_MOCK_BIOMETRIC_ENABLED=false');
putenv('DEV_MOCK_LOCATION_ENABLED=true');
putenv('DEV_BROWSER_ATTENDANCE_PROTOTYPE_ENABLED=true');
ob_start();
handle_runtime_config();
$body = (string) ob_get_clean();

$payload = json_decode($body, true);
if (!is_array($payload) || ($payload['environment'] ?? null) !== 'test') {
    fwrite(STDERR, "FAIL: runtime configuration payload does not expose the safe environment classification.\n");
    exit(1);
}

if (($payload['providers']['identity']['development_mock_enabled'] ?? null) !== true
    || ($payload['providers']['biometrics']['active'] ?? null) !== 'disabled'
    || ($payload['providers']['location']['active'] ?? null) !== 'development-mock'
    || ($payload['features']['browser_attendance_prototype'] ?? null) !== true) {
    fwrite(STDERR, "FAIL: runtime configuration payload does not preserve explicit provider flags.\n");
    exit(1);
}

foreach (['JWT_SIGNING_KEY_B64', 'MFA_ENCRYPTION_KEY_B64', 'AUDIT_MAC_KEY_B64', 'DB_PASS'] as $secret) {
    if (array_key_exists($secret, $payload)) {
        fwrite(STDERR, "FAIL: runtime configuration leaked {$secret}.\n");
        exit(1);
    }
}

foreach ($savedEnvironment as $key => $value) {
    putenv($value === false ? $key : "{$key}={$value}");
}

echo "ALL RUNTIME CONFIGURATION TESTS PASSED CLEANLY.\n";
