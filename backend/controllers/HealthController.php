<?php

declare(strict_types=1);

function health_payload(): array
{
    $payload = [
        'status' => 'ok',
        'app' => 'DentiSys API',
        'php' => 'up',
        'database' => 'unknown',
        'timestamp' => gmdate('c'),
    ];

    $config = app_config();
    $dbConfig = $config['db'] ?? [];
    $dbName = $dbConfig['name'] ?? 'dentisys';
    $dbHost = $dbConfig['host'] ?? '127.0.0.1';
    $dbPort = (int) ($dbConfig['port'] ?? 3306);
    $dbUser = $dbConfig['user'] ?? 'dentisys';

    try {
        $pdo = create_pdo($config);
        $pdo->query('SELECT 1');

        $stmt = $pdo->prepare("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = :dbname AND TABLE_NAME = 'user_accounts'");
        $stmt->execute([':dbname' => $dbName]);
        $tableCount = (int) $stmt->fetchColumn();

        if ($tableCount === 0) {
            $payload['status'] = 'error';
            $payload['database'] = 'down';
            $payload['error_code'] = 'schema_missing';
            $payload['message'] = "Database '{$dbName}' exists, but baseline schema tables are missing. Run .\\start-dev.bat to apply migrations.";

            return [
                'statusCode' => 503,
                'body' => $payload,
            ];
        }

        $payload['database'] = 'up';

        return [
            'statusCode' => 200,
            'body' => $payload,
        ];
    } catch (Throwable $e) {
        error_log('DentiSys health database check failed: ' . $e->getMessage());

        $payload['status'] = 'error';
        $payload['database'] = 'down';

        $code = (int) $e->getCode();
        $msg = $e->getMessage();
        $sqlState = ($e instanceof PDOException && isset($e->errorInfo[0])) ? (string) $e->errorInfo[0] : '';

        if ($code === 1049 || $sqlState === '1049' || str_contains($msg, '1049') || str_contains($msg, 'Unknown database')) {
            $payload['error_code'] = 'missing_database';
            $payload['message'] = "Database '{$dbName}' does not exist yet. Run .\\start-dev.bat to auto-create and seed the database.";
        } elseif ($code === 1045 || $sqlState === '1045' || str_contains($msg, '1045') || str_contains($msg, 'Access denied')) {
            $payload['error_code'] = 'invalid_credentials';
            $payload['message'] = "Database authentication failed for user '{$dbUser}'. Verify DB_USER and DB_PASS in .env or local.php.";
        } elseif ($code === 2002 || $sqlState === '2002' || str_contains($msg, '2002') || str_contains($msg, 'unreachable') || str_contains($msg, 'Connection refused') || str_contains($msg, 'No connection could be made')) {
            $payload['error_code'] = 'server_unreachable';
            $payload['message'] = "Database server is unreachable on {$dbHost}:{$dbPort}. Ensure MySQL/MariaDB daemon or Docker container is running.";
        } elseif ($code === 1146 || $sqlState === '42S02' || $sqlState === '1146' || str_contains($msg, '1146') || str_contains($msg, '42S02') || str_contains($msg, "doesn't exist")) {
            $payload['error_code'] = 'schema_missing';
            $payload['message'] = "Database '{$dbName}' exists, but baseline schema tables are missing. Run .\\start-dev.bat to apply migrations.";
        } else {
            $payload['error_code'] = 'database_error';
            $payload['message'] = 'Database connectivity check failed: ' . $msg;
        }

        return [
            'statusCode' => 503,
            'body' => $payload,
        ];
    }
}

function handle_health_check(): void
{
    $health = health_payload();
    json_response($health['body'], $health['statusCode']);
}
