<?php

declare(strict_types=1);

require_once __DIR__ . '/../../backend/app/config.php';
require_once __DIR__ . '/../../backend/app/database.php';
require_once __DIR__ . '/../../backend/controllers/HealthController.php';

// Test 1: Invoke health_payload() and verify baseline payload structural contract
$result = health_payload();

if (!isset($result['statusCode']) || !isset($result['body'])) {
    fwrite(STDERR, "FAIL: health_payload() output structure invalid.\n");
    exit(1);
}

$statusCode = $result['statusCode'];
$body = $result['body'];

$expectedKeys = ['status', 'app', 'php', 'database', 'timestamp'];
foreach ($expectedKeys as $key) {
    if (!array_key_exists($key, $body)) {
        fwrite(STDERR, "FAIL: Missing key '{$key}' in health payload.\n");
        exit(1);
    }
}

if ($statusCode === 200) {
    if ($body['status'] !== 'ok' || $body['database'] !== 'up') {
        fwrite(STDERR, "FAIL: 200 response should indicate status=ok and database=up.\n");
        exit(1);
    }
    echo "PASS 1: Healthy database payload verified (statusCode 200, status=ok, database=up).\n";
} elseif ($statusCode === 503) {
    if ($body['status'] !== 'error' || $body['database'] !== 'down') {
        fwrite(STDERR, "FAIL: 503 response should indicate status=error and database=down.\n");
        exit(1);
    }
    if (!isset($body['error_code']) || !isset($body['message'])) {
        fwrite(STDERR, "FAIL: 503 response missing error_code or message.\n");
        exit(1);
    }
    $validErrorCodes = ['missing_database', 'invalid_credentials', 'server_unreachable', 'schema_missing', 'database_error'];
    if (!in_array($body['error_code'], $validErrorCodes, true)) {
        fwrite(STDERR, "FAIL: Invalid error_code '{$body['error_code']}' in 503 response.\n");
        exit(1);
    }
    echo "PASS 1: Unhealthy database payload verified (statusCode 503, status=error, database=down, error_code={$body['error_code']}).\n";
} else {
    fwrite(STDERR, "FAIL: Unexpected HTTP status code {$statusCode}.\n");
    exit(1);
}

// Test 2: Verify the production classifier directly for PostgreSQL failure shapes.
$cases = [
    [new PDOException("database 'dentisys' does not exist"), 'missing_database'],
    [new PDOException('password authentication failed for user "dentisys"'), 'invalid_credentials'],
    [new PDOException('PostgreSQL server at 127.0.0.1:5432 is unreachable'), 'server_unreachable'],
    [new PDOException('relation "user_accounts" does not exist'), 'schema_missing'],
];
foreach ($cases as [$exception, $expected]) {
    $classification = classify_health_exception($exception, [
        'name' => 'dentisys',
        'user' => 'dentisys',
        'host' => '127.0.0.1',
        'port' => 5432,
    ]);
    if ($classification['error_code'] !== $expected) {
        fwrite(STDERR, "FAIL: Expected {$expected}, got {$classification['error_code']}.\n");
        exit(1);
    }
}
echo "PASS 2: PostgreSQL health exception classifications verified.\n";

echo "ALL HEALTH CONTROLLER UNIT TESTS PASSED CLEANLY.\n";
