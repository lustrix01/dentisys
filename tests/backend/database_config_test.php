<?php

declare(strict_types=1);

require_once __DIR__ . '/../../backend/app/database.php';

$defaultConfig = [
    'db' => [
        'host' => '127.0.0.1',
        'port' => 3306,
        'name' => 'dentisys',
        'user' => 'dentisys',
        'pass' => 'secret',
    ],
];

$defaultDsn = database_dsn($defaultConfig);
if ($defaultDsn !== 'mysql:host=127.0.0.1;port=3306;dbname=dentisys;charset=utf8mb4') {
    fwrite(STDERR, "FAIL: Default DSN was not constructed as expected.\nActual: $defaultDsn\n");
    exit(1);
}

$config = [
    'db' => [
        'host' => '127.0.0.1',
        'port' => 3307,
        'name' => 'dentisys',
        'user' => 'dentisys',
        'pass' => 'secret',
    ],
];

$dsn = database_dsn($config);
if ($dsn !== 'mysql:host=127.0.0.1;port=3307;dbname=dentisys;charset=utf8mb4') {
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

echo "PASS: database DSN and PDO options are configured.\n";
