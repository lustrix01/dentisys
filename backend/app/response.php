<?php

declare(strict_types=1);

function json_response(array $payload, int $statusCode = 200): void
{
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=UTF-8');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
}

function safe_error_response(string $message, int $statusCode = 500): void
{
    json_response([
        'status' => 'error',
        'message' => $message,
    ], $statusCode);
}
