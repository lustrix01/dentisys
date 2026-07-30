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

function assert_throws(callable $fn, string $needle, string $label): void
{
    try {
        $fn();
        fwrite(STDERR, "FAIL: $label -- expected an exception.\n");
        exit(1);
    } catch (RuntimeException $e) {
        if (!str_contains($e->getMessage(), $needle)) {
            fwrite(STDERR, "FAIL: $label -- unexpected exception: {$e->getMessage()}\n");
            exit(1);
        }
    }
}

$original = [];
foreach (['APP_ENV', 'APP_BASE_URL', 'SHOW_DEV_RESET_LINK', 'SHOW_DEV_INVITATION_LINK', 'DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASS', 'JWT_SIGNING_KEY_B64', 'JWT_ACCESS_TTL', 'MFA_ENCRYPTION_KEY_B64', 'AUDIT_MAC_KEY_B64', 'ALLOWED_EMAIL_DOMAIN'] as $key) {
    $original[$key] = getenv($key);
    putenv($key);
}

$defaultConfig = app_config([]);
assert_same(5432, $defaultConfig['db']['port'], 'application default DB_PORT is 5432');
assert_same('ZGVudGlzeXMtZGV2LWp3dC1zaWduaW5nLWtleS0zMmI=', $defaultConfig['jwt']['signing_key_b64'], 'application default JWT_SIGNING_KEY_B64');
assert_same(86400, $defaultConfig['jwt']['access_ttl'], 'application default JWT_ACCESS_TTL is 86400');
assert_same('ZGVudGlzeXMtZGV2LW1mYS1lbmNyeXB0LWtleS0zMmI=', $defaultConfig['mfa']['encryption_key_b64'], 'application default MFA_ENCRYPTION_KEY_B64');
assert_same('ZGVudGlzeXMtZGV2LWF1ZGl0LW1hYy1rZXktMzJiaXQ=', $defaultConfig['audit']['mac_key_b64'], 'application default AUDIT_MAC_KEY_B64');
assert_same('bicol-u.edu.ph', $defaultConfig['app']['allowed_email_domain'], 'application default allowed email domain');
assert_same('http://localhost:5173', $defaultConfig['app']['base_url'], 'development base URL defaults to the Vite frontend');
assert_same(true, $defaultConfig['show_dev_reset_link'], 'development reset disclosure is enabled by default');
assert_same(true, $defaultConfig['show_dev_invitation_link'], 'development invitation disclosure is enabled by default');
assert_same(
    'https://portal.example.edu/reset-password?token=a%2Bb%2F%3D',
    app_url(['app' => ['base_url' => 'https://portal.example.edu/']], '/reset-password', ['token' => 'a+b/=']),
    'application links use the configured base URL and RFC3986-encode tokens'
);

$singleServer = app_config([
    'APP_ENV' => 'single-server',
    'APP_BASE_URL' => 'https://dentisys.example.edu/',
    'SHOW_DEV_RESET_LINK' => 'true',
    'SHOW_DEV_INVITATION_LINK' => 'true',
]);
assert_same('https://dentisys.example.edu', $singleServer['app']['base_url'], 'single-server base URL is normalized');
assert_same(false, $singleServer['show_dev_reset_link'], 'single-server always suppresses reset disclosures');
assert_same(false, $singleServer['show_dev_invitation_link'], 'single-server always suppresses invitation disclosures');
assert_throws(
    static fn() => app_config(['APP_ENV' => 'single-server']),
    'APP_BASE_URL',
    'single-server requires APP_BASE_URL'
);
assert_throws(
    static fn() => app_config(['APP_ENV' => 'single-server', 'APP_BASE_URL' => '/not-absolute']),
    'valid absolute HTTP(S) URL',
    'single-server rejects a relative APP_BASE_URL'
);

assert_same(32, strlen(config_key_bytes_at_least($defaultConfig['jwt']['signing_key_b64'], 32, 'JWT_SIGNING_KEY')), 'default JWT key decodes to 32 bytes');
assert_same(32, strlen(config_key_bytes_at_least($defaultConfig['mfa']['encryption_key_b64'], 32, 'MFA_ENCRYPTION_KEY')), 'default MFA key decodes to 32 bytes');
assert_same(32, strlen(config_key_bytes_at_least($defaultConfig['audit']['mac_key_b64'], 32, 'AUDIT_MAC_KEY')), 'default AUDIT MAC key decodes to 32 bytes');

$config = app_config([
    'DB_HOST' => 'local-host',
    'DB_PORT' => 55432,
    'DB_NAME' => 'local-db',
    'DB_USER' => 'local-user',
    'DB_PASS' => 'local-pass',
]);

assert_same('local-host', $config['db']['host'], 'local DB_HOST overrides defaults');
assert_same(55432, $config['db']['port'], 'local DB_PORT overrides defaults');
assert_same('local-db', $config['db']['name'], 'local DB_NAME overrides defaults');
assert_same('local-user', $config['db']['user'], 'local DB_USER overrides defaults');
assert_same('local-pass', $config['db']['pass'], 'local DB_PASS overrides defaults');

putenv('DB_HOST=env-host');
putenv('DB_PORT=55433');
putenv('DB_NAME=env-db');
putenv('DB_USER=env-user');
putenv('DB_PASS=env-pass');

$config = app_config([
    'DB_HOST' => 'local-host',
    'DB_PORT' => 55432,
    'DB_NAME' => 'local-db',
    'DB_USER' => 'local-user',
    'DB_PASS' => 'local-pass',
]);

assert_same('env-host', $config['db']['host'], 'environment DB_HOST overrides local config');
assert_same(55433, $config['db']['port'], 'environment DB_PORT overrides local config');
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
