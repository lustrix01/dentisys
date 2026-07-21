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
foreach (['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASS'] as $key) {
    $original[$key] = getenv($key);
    putenv($key);
}

$defaultConfig = app_config([]);
assert_same(3306, $defaultConfig['db']['port'], 'application default DB_PORT is 3306');

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
