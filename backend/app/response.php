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

function build_error_response(string $message, int $statusCode = 500, ?string $code = null): array
{
    $defaultCodes = [
        400 => 'BAD_REQUEST',
        401 => 'AUTHENTICATION_REQUIRED',
        403 => 'ACCESS_DENIED',
        404 => 'NOT_FOUND',
        409 => 'CONFLICT',
        422 => 'VALIDATION_ERROR',
        429 => 'RATE_LIMITED',
        500 => 'INTERNAL_ERROR',
        501 => 'NOT_CONFIGURED',
    ];
    return build_json_response([
        'status' => 'error',
        'code' => $code ?? ($defaultCodes[$statusCode] ?? 'REQUEST_FAILED'),
        'message' => $message,
        'requestId' => function_exists('request_id') ? request_id() : null,
    ], $statusCode);
}

function build_validation_error_response(array $fieldErrors): array
{
    return [
        'status_code' => 422,
        'headers' => ['Content-Type: application/json; charset=UTF-8'],
        'body' => json_encode([
            'status' => 'error',
            'code' => 'VALIDATION_ERROR',
            'message' => 'Validation failed.',
            'errors' => $fieldErrors,
            'requestId' => function_exists('request_id') ? request_id() : null,
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
