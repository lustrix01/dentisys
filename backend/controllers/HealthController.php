<?php

declare(strict_types=1);

function classify_health_exception(Throwable $e, array $dbConfig = []): array
{
    $dbName = (string) ($dbConfig['name'] ?? 'dentisys');
    $dbHost = (string) ($dbConfig['host'] ?? '127.0.0.1');
    $dbPort = (int) ($dbConfig['port'] ?? 5432);
    $dbUser = (string) ($dbConfig['user'] ?? 'dentisys');
    $message = $e->getMessage();
    $sqlState = ($e instanceof PDOException && isset($e->errorInfo[0]))
        ? (string) $e->errorInfo[0]
        : '';

    if ($sqlState === '3D000' || (str_contains($message, 'database') && str_contains($message, 'does not exist'))) {
        return [
            'error_code' => 'missing_database',
            'message' => "Database '{$dbName}' does not exist. Start the PostgreSQL Docker service and apply migrations.",
        ];
    }

    if ($sqlState === '28P01' || str_contains($message, 'password authentication failed')) {
        return [
            'error_code' => 'invalid_credentials',
            'message' => "Database authentication failed for user '{$dbUser}'. Verify DB_USER and DB_PASS.",
        ];
    }

    if (str_starts_with($sqlState, '08') || str_contains($message, 'unreachable') || str_contains($message, 'Connection refused')) {
        return [
            'error_code' => 'server_unreachable',
            'message' => "PostgreSQL server is unreachable on {$dbHost}:{$dbPort}. Ensure the Docker database container is running.",
        ];
    }

    if ($sqlState === '42P01' || (str_contains($message, 'relation') && str_contains($message, 'does not exist'))) {
        return [
            'error_code' => 'schema_missing',
            'message' => "Database '{$dbName}' exists, but required schema tables are missing. Run the PostgreSQL migrations.",
        ];
    }

    return [
        'error_code' => 'database_error',
        'message' => 'Database connectivity check failed: ' . $message,
    ];
}

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
    $dbPort = (int) ($dbConfig['port'] ?? 5432);
    $dbUser = $dbConfig['user'] ?? 'dentisys';

    try {
        $pdo = create_pdo($config);
        $pdo->query('SELECT 1');

        $stmt = $pdo->prepare("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_accounts'");
        $stmt->execute();
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

        $classification = classify_health_exception($e, $dbConfig);
        $payload['error_code'] = $classification['error_code'];
        $payload['message'] = $classification['message'];

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
