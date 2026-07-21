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

    try {
        $pdo = create_pdo(app_config());
        $pdo->query('SELECT 1');
        $payload['database'] = 'up';

        return [
            'statusCode' => 200,
            'body' => $payload,
        ];
    } catch (Throwable $e) {
        error_log('DentiSys health database check failed: ' . $e->getMessage());

        $payload['status'] = 'error';
        $payload['database'] = 'down';
        $payload['message'] = 'Database connectivity check failed.';

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
