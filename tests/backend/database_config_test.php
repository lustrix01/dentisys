<?php

declare(strict_types=1);

require_once __DIR__ . '/../../backend/app/database.php';

$defaultConfig = [
    'db' => [
        'host' => '127.0.0.1',
        'port' => 5432,
        'name' => 'dentisys',
        'user' => 'dentisys',
        'pass' => 'secret',
    ],
];

$defaultDsn = database_dsn($defaultConfig);
if ($defaultDsn !== 'pgsql:host=127.0.0.1;port=5432;dbname=dentisys') {
    fwrite(STDERR, "FAIL: Default DSN was not constructed as expected.\nActual: $defaultDsn\n");
    exit(1);
}

$config = [
    'db' => [
        'host' => '127.0.0.1',
        'port' => 5433,
        'name' => 'dentisys',
        'user' => 'dentisys',
        'pass' => 'secret',
    ],
];

$dsn = database_dsn($config);
if ($dsn !== 'pgsql:host=127.0.0.1;port=5433;dbname=dentisys') {
    fwrite(STDERR, "FAIL: DSN was not constructed as expected.\nActual: $dsn\n");
    exit(1);
}

$options = pdo_options();
$expectedOptions = [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES => false,
];

foreach ($expectedOptions as $key => $value) {
    if (!array_key_exists($key, $options) || $options[$key] !== $value) {
        fwrite(STDERR, "FAIL: PDO option $key did not match expected value.\n");
        exit(1);
    }
}

require_once __DIR__ . '/../../backend/app/config.php';

$resolvedAppConfig = app_config([]);
if (($resolvedAppConfig['db']['pass'] ?? '') !== 'local-development-password') {
    fwrite(STDERR, "FAIL: Default database password was not resolved to 'local-development-password'.\nActual: " . ($resolvedAppConfig['db']['pass'] ?? 'NULL') . "\n");
    exit(1);
}

echo "PASS: database DSN and PDO options are configured.\n";
