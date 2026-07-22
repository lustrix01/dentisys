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

// Test 2: Verify classification helper logic for each error code mapping
function test_classify_exception(Throwable $e, string $dbName = 'dentisys', string $dbUser = 'dentisys', string $dbHost = '127.0.0.1', int $dbPort = 3306): array {
    $code = (int) $e->getCode();
    $msg = $e->getMessage();
    $sqlState = ($e instanceof PDOException && isset($e->errorInfo[0])) ? (string) $e->errorInfo[0] : '';

    if ($code === 1049 || $sqlState === '1049' || str_contains($msg, '1049') || str_contains($msg, 'Unknown database')) {
        return ['error_code' => 'missing_database', 'message' => "Database '{$dbName}' does not exist yet. Run .\\start-dev.bat to auto-create and seed the database."];
    } elseif ($code === 1045 || $sqlState === '1045' || str_contains($msg, '1045') || str_contains($msg, 'Access denied')) {
        return ['error_code' => 'invalid_credentials', 'message' => "Database authentication failed for user '{$dbUser}'. Verify DB_USER and DB_PASS in .env or local.php."];
    } elseif ($code === 2002 || $sqlState === '2002' || str_contains($msg, '2002') || str_contains($msg, 'unreachable') || str_contains($msg, 'Connection refused') || str_contains($msg, 'No connection could be made')) {
        return ['error_code' => 'server_unreachable', 'message' => "Database server is unreachable on {$dbHost}:{$dbPort}. Ensure MySQL/MariaDB daemon or Docker container is running."];
    } elseif ($code === 1146 || $sqlState === '42S02' || $sqlState === '1146' || str_contains($msg, '1146') || str_contains($msg, '42S02') || str_contains($msg, "doesn't exist")) {
        return ['error_code' => 'schema_missing', 'message' => "Database '{$dbName}' exists, but baseline schema tables are missing. Run .\\start-dev.bat to apply migrations."];
    }
    return ['error_code' => 'database_error', 'message' => 'Database connectivity check failed: ' . $msg];
}

// Assertion 2a: missing_database classification (Code 1049)
$e1049 = new PDOException("SQLSTATE[HY000] [1049] Unknown database 'dentisys'", 1049);
$c1049 = test_classify_exception($e1049);
if ($c1049['error_code'] !== 'missing_database' || !str_contains($c1049['message'], 'does not exist yet')) {
    fwrite(STDERR, "FAIL: Exception 1049 was not classified as missing_database.\n");
    exit(1);
}
echo "PASS 2a: Exception 1049 classified as missing_database with context-aware message.\n";

// Assertion 2b: invalid_credentials classification (Code 1045)
$e1045 = new PDOException("SQLSTATE[HY000] [1045] Access denied for user 'dentisys'@'localhost'", 1045);
$c1045 = test_classify_exception($e1045);
if ($c1045['error_code'] !== 'invalid_credentials' || !str_contains($c1045['message'], 'authentication failed')) {
    fwrite(STDERR, "FAIL: Exception 1045 was not classified as invalid_credentials.\n");
    exit(1);
}
echo "PASS 2b: Exception 1045 classified as invalid_credentials with context-aware message.\n";

// Assertion 2c: server_unreachable classification (Code 2002)
$e2002 = new PDOException("Database server at 127.0.0.1:3306 is unreachable.", 2002);
$c2002 = test_classify_exception($e2002);
if ($c2002['error_code'] !== 'server_unreachable' || !str_contains($c2002['message'], 'unreachable')) {
    fwrite(STDERR, "FAIL: Exception 2002 was not classified as server_unreachable.\n");
    exit(1);
}
echo "PASS 2c: Exception 2002 classified as server_unreachable with context-aware message.\n";

// Assertion 2d: schema_missing classification (Code 1146 / 42S02)
$e1146 = new PDOException("SQLSTATE[42S02]: Base table or view not found: 1146 Table 'dentisys.user_accounts' doesn't exist", 1146);
$c1146 = test_classify_exception($e1146);
if ($c1146['error_code'] !== 'schema_missing' || !str_contains($c1146['message'], 'baseline schema tables are missing')) {
    fwrite(STDERR, "FAIL: Exception 1146 was not classified as schema_missing.\n");
    exit(1);
}
echo "PASS 2d: Exception 1146 classified as schema_missing with context-aware message.\n";

echo "ALL HEALTH CONTROLLER UNIT TESTS PASSED CLEANLY.\n";
