<?php

declare(strict_types=1);

function build_json_response(array $payload, int $statusCode = 200): array
{
    $body = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

    if ($body === false) {
        $statusCode = 500;
        $body = json_encode([
            'status' => 'error',
            'message' => 'Internal server error.',
        ], JSON_UNESCAPED_SLASHES);
    }

    return [
        'status_code' => $statusCode,
        'headers' => ['Content-Type: application/json; charset=UTF-8'],
        'body' => $body,
    ];
}

function build_error_response(string $message, int $statusCode = 500): array
{
    return build_json_response([
        'status' => 'error',
        'message' => $message,
    ], $statusCode);
}

function build_validation_error_response(array $fieldErrors): array
{
    return [
        'status_code' => 400,
        'headers' => ['Content-Type: application/json; charset=UTF-8'],
        'body' => json_encode([
            'status' => 'error',
            'message' => 'Validation failed.',
            'errors' => $fieldErrors,
        ], JSON_UNESCAPED_SLASHES),
    ];
}

function emit_response(array $response): void
{
    http_response_code($response['status_code']);

    foreach ($response['headers'] as $header) {
        header($header);
    }

    echo $response['body'];
}

function json_response(array $payload, int $statusCode = 200): void
{
    emit_response(build_json_response($payload, $statusCode));
}

function safe_error_response(string $message, int $statusCode = 500): void
{
    emit_response(build_error_response($message, $statusCode));
}

function auth_error_response(string $message, int $statusCode = 401): void
{
    emit_response(build_error_response($message, $statusCode));
}

function validation_error_response(array $fieldErrors): void
{
    emit_response(build_validation_error_response($fieldErrors));
}
