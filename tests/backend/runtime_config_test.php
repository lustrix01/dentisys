<?php

declare(strict_types=1);

require_once __DIR__ . '/../../backend/app/config.php';
require_once __DIR__ . '/../../backend/app/response.php';
require_once __DIR__ . '/../../backend/controllers/RuntimeConfigController.php';

$environmentKeys = [
    'APP_ENV',
    'APP_BASE_URL',
    'JWT_SIGNING_KEY_B64',
    'MFA_ENCRYPTION_KEY_B64',
    'AUDIT_MAC_KEY_B64',
    'BIOMETRIC_SIDECAR_ENABLED',
    'BIOMETRIC_SIDECAR_URL',
    'BIOMETRIC_SIDECAR_SHARED_SECRET',
    'EMAIL_PROVIDER',
    'DEV_MOCK_IDENTITY_ENABLED',
    'DEV_MOCK_BIOMETRIC_ENABLED',
    'DEV_MOCK_LOCATION_ENABLED',
    'DEV_BROWSER_ATTENDANCE_PROTOTYPE_ENABLED',
    'STUDENT_AUTH_ENABLED',
    'ALLOWED_EMAIL_DOMAINS',
    'ALLOWED_EMAIL_DOMAIN',
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
putenv('STUDENT_AUTH_ENABLED=true');
putenv('ALLOWED_EMAIL_DOMAINS=BICOL-U.EDU.PH, Example.edu, bicol-u.edu.ph');
putenv('ALLOWED_EMAIL_DOMAIN');
ob_start();
handle_runtime_config();
$body = (string) ob_get_clean();

$payload = json_decode($body, true);
if (!is_array($payload) || ($payload['environment'] ?? null) !== 'test') {
    fwrite(STDERR, "FAIL: runtime configuration payload does not expose the safe environment classification.\n");
    exit(1);
}

if (($payload['providers']['identity']['development_mock']['enabled'] ?? null) !== true
    || ($payload['providers']['identity']['password']['enabled'] ?? null) !== true
    || ($payload['providers']['biometrics']['active'] ?? null) !== 'disabled'
    || ($payload['providers']['location']['active'] ?? null) !== 'development-mock'
    || ($payload['features']['browser_attendance_prototype'] ?? null) !== true) {
    fwrite(STDERR, "FAIL: runtime configuration payload does not preserve explicit provider flags.\n");
    exit(1);
}
if (($payload['features']['student_auth_enabled'] ?? null) !== true) {
    fwrite(STDERR, "FAIL: runtime configuration payload does not expose Student authentication state.\n");
    exit(1);
}
if (($payload['allowed_email_domains'] ?? null) !== ['bicol-u.edu.ph', 'example.edu']) {
    fwrite(STDERR, "FAIL: runtime configuration payload does not expose normalized institutional domains.\n");
    exit(1);
}

foreach (['JWT_SIGNING_KEY_B64', 'MFA_ENCRYPTION_KEY_B64', 'AUDIT_MAC_KEY_B64', 'DB_PASS'] as $secret) {
    if (array_key_exists($secret, $payload)) {
        fwrite(STDERR, "FAIL: runtime configuration leaked {$secret}.\n");
        exit(1);
    }
}

putenv('APP_ENV=single-server');
putenv('APP_BASE_URL=https://dentisys.example.edu');
putenv('EMAIL_PROVIDER=smtp');
foreach (['DEV_MOCK_IDENTITY_ENABLED', 'DEV_MOCK_LOCATION_ENABLED', 'DEV_BROWSER_ATTENDANCE_PROTOTYPE_ENABLED'] as $flag) {
    putenv("$flag=false");
}
foreach (['JWT_SIGNING_KEY_B64', 'MFA_ENCRYPTION_KEY_B64', 'AUDIT_MAC_KEY_B64'] as $key) {
    putenv($key . '=' . base64_encode(str_repeat('p', 32)));
}
putenv('BIOMETRIC_SIDECAR_ENABLED=true');
putenv('BIOMETRIC_SIDECAR_URL=http://biometric:8000');
putenv('BIOMETRIC_SIDECAR_SHARED_SECRET=runtime-test-private-sidecar-secret');
ob_start();
handle_runtime_config();
$vpsBody = (string) ob_get_clean();
$vpsPayload = json_decode($vpsBody, true);
if (($vpsPayload['environment'] ?? null) !== 'single-server'
    || ($vpsPayload['providers']['biometrics'] ?? null) !== ['active' => 'sidecar']
    || str_contains($vpsBody, 'runtime-test-private-sidecar-secret')
    || str_contains($vpsBody, 'http://biometric:8000')) {
    fwrite(STDERR, "FAIL: VPS runtime configuration must expose sidecar availability without its credentials.\n");
    exit(1);
}

foreach ($savedEnvironment as $key => $value) {
    putenv($value === false ? $key : "{$key}={$value}");
}

echo "ALL RUNTIME CONFIGURATION TESTS PASSED CLEANLY.\n";
