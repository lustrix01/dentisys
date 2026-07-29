<?php

declare(strict_types=1);

require_once __DIR__ . '/../../backend/app/config.php';

function assert_same(mixed $expected, mixed $actual, string $label): void
{
    if ($expected !== $actual) {
        fwrite(STDERR, "FAIL: $label\nExpected: " . var_export($expected, true) . "\nActual: " . var_export($actual, true) . "\n");
        exit(1);
    }
}

$original = [];
foreach (['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASS', 'JWT_SIGNING_KEY_B64', 'JWT_ACCESS_TTL', 'MFA_ENCRYPTION_KEY_B64', 'EMAIL_OTP_HMAC_KEY_B64', 'AUDIT_MAC_KEY_B64', 'ALLOWED_EMAIL_DOMAIN'] as $key) {
    $original[$key] = getenv($key);
    putenv($key);
}

$defaultConfig = app_config([]);
assert_same(3306, $defaultConfig['db']['port'], 'application default DB_PORT is 3306');
assert_same('ZGVudGlzeXMtZGV2LWp3dC1zaWduaW5nLWtleS0zMmI=', $defaultConfig['jwt']['signing_key_b64'], 'application default JWT_SIGNING_KEY_B64');
assert_same(86400, $defaultConfig['jwt']['access_ttl'], 'application default JWT_ACCESS_TTL is 86400');
assert_same('ZGVudGlzeXMtZGV2LW1mYS1lbmNyeXB0LWtleS0zMmI=', $defaultConfig['mfa']['encryption_key_b64'], 'application default MFA_ENCRYPTION_KEY_B64');
assert_same('ZGVudGlzeXMtZGV2ZWxvcG1lbnQtZW1haWwtb3RwLWhtYWMta2V5LTMy', $defaultConfig['mfa']['email_otp_hmac_key_b64'], 'application default EMAIL_OTP_HMAC_KEY_B64');
assert_same('ZGVudGlzeXMtZGV2LWF1ZGl0LW1hYy1rZXktMzJiaXQ=', $defaultConfig['audit']['mac_key_b64'], 'application default AUDIT_MAC_KEY_B64');
assert_same('bicol-u.edu.ph', $defaultConfig['app']['allowed_email_domain'], 'application default allowed email domain');

assert_same(32, strlen(config_key_bytes_at_least($defaultConfig['jwt']['signing_key_b64'], 32, 'JWT_SIGNING_KEY')), 'default JWT key decodes to 32 bytes');
assert_same(32, strlen(config_key_bytes_at_least($defaultConfig['mfa']['encryption_key_b64'], 32, 'MFA_ENCRYPTION_KEY')), 'default MFA key decodes to 32 bytes');
assert_same(42, strlen(config_key_bytes_at_least($defaultConfig['mfa']['email_otp_hmac_key_b64'], 32, 'EMAIL_OTP_HMAC_KEY_B64')), 'default email OTP HMAC key decodes safely');
assert_same(32, strlen(config_key_bytes_at_least($defaultConfig['audit']['mac_key_b64'], 32, 'AUDIT_MAC_KEY')), 'default AUDIT MAC key decodes to 32 bytes');

$config = app_config([
    'DB_HOST' => 'local-host',
    'DB_PORT' => 3307,
    'DB_NAME' => 'local-db',
    'DB_USER' => 'local-user',
    'DB_PASS' => 'local-pass',
]);

assert_same('local-host', $config['db']['host'], 'local DB_HOST overrides defaults');
assert_same(3307, $config['db']['port'], 'local DB_PORT overrides defaults');
assert_same('local-db', $config['db']['name'], 'local DB_NAME overrides defaults');
assert_same('local-user', $config['db']['user'], 'local DB_USER overrides defaults');
assert_same('local-pass', $config['db']['pass'], 'local DB_PASS overrides defaults');

putenv('DB_HOST=env-host');
putenv('DB_PORT=3308');
putenv('DB_NAME=env-db');
putenv('DB_USER=env-user');
putenv('DB_PASS=env-pass');

$config = app_config([
    'DB_HOST' => 'local-host',
    'DB_PORT' => 3307,
    'DB_NAME' => 'local-db',
    'DB_USER' => 'local-user',
    'DB_PASS' => 'local-pass',
]);

assert_same('env-host', $config['db']['host'], 'environment DB_HOST overrides local config');
assert_same(3308, $config['db']['port'], 'environment DB_PORT overrides local config');
assert_same('env-db', $config['db']['name'], 'environment DB_NAME overrides local config');
assert_same('env-user', $config['db']['user'], 'environment DB_USER overrides local config');
assert_same('env-pass', $config['db']['pass'], 'environment DB_PASS overrides local config');

foreach ($original as $key => $value) {
    if ($value === false) {
        putenv($key);
    } else {
        putenv("$key=$value");
    }
}

echo "PASS: config precedence works.\n";
