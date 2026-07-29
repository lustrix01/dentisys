<?php

declare(strict_types=1);

class RequestException extends \RuntimeException
{
    private int $statusCode;

    public function __construct(string $message, int $statusCode, ?\Throwable $previous = null)
    {
        $this->statusCode = $statusCode;
        parent::__construct($message, $statusCode, $previous);
    }

    public function getStatusCode(): int
    {
        return $this->statusCode;
    }
}

function parse_json_object_body(string $rawBody, ?string $contentType, int $maxBytes): array
{
    if ($rawBody === '') {
        return ['has_body' => false, 'data' => []];
    }

    if ($contentType === null || !str_starts_with(strtolower(trim(explode(';', $contentType)[0])), 'application/json')) {
        throw new RequestException('Unsupported Media Type. Expected application/json.', 415);
    }

    $len = strlen($rawBody);

    if ($len > $maxBytes) {
        throw new RequestException('Request body exceeds maximum size.', 413);
    }

    $decoded = json_decode($rawBody);

    if (json_last_error() !== JSON_ERROR_NONE) {
        throw new RequestException('Malformed JSON.', 400);
    }

    if (!($decoded instanceof \stdClass) && !is_array($decoded)) {
        throw new RequestException('Request body must be a JSON object or array.', 400);
    }

    return ['has_body' => true, 'data' => (array) $decoded];
}

function request_body(?int $maxBytes = null): array
{
    $maxBytes = $maxBytes ?? 65536;
    $rawBody = file_get_contents('php://input');
    $contentType = $_SERVER['CONTENT_TYPE'] ?? $_SERVER['HTTP_CONTENT_TYPE'] ?? null;
    return parse_json_object_body($rawBody !== false ? $rawBody : '', $contentType, $maxBytes);
}

function request_method(): string
{
    return strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
}

function request_path(): string
{
    $uri = $_SERVER['REQUEST_URI'] ?? '/';
    $path = parse_url($uri, PHP_URL_PATH);
    $scriptName = str_replace('\\', '/', $_SERVER['SCRIPT_NAME'] ?? '');
    $baseDir = rtrim(str_replace('\\', '/', dirname($scriptName)), '/');

    if (!is_string($path) || $path === '') {
        return '/';
    }

    if ($baseDir !== '' && $baseDir !== '/' && str_starts_with($path, $baseDir . '/')) {
        $path = substr($path, strlen($baseDir));
    }

    return '/' . trim($path, '/');
}

function request_header(string $name): ?string
{
    $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));

    if (isset($_SERVER[$key])) {
        return (string) $_SERVER[$key];
    }

    if (strtoupper($name) === 'CONTENT_TYPE' && isset($_SERVER['CONTENT_TYPE'])) {
        return (string) $_SERVER['CONTENT_TYPE'];
    }

    return null;
}

function request_ip(): string
{
    return $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
}

function request_user_agent(): string
{
    $ua = $_SERVER['HTTP_USER_AGENT'] ?? '';

    if (strlen($ua) > 512) {
        $ua = mb_substr($ua, 0, 512);
    }

    if (!mb_check_encoding($ua, 'UTF-8')) {
        $ua = '';
    }

    return $ua;
}

function request_origin(): ?string
{
    if (!isset($_SERVER['HTTP_ORIGIN'])) {
        return null;
    }

    return (string) $_SERVER['HTTP_ORIGIN'];
}

function request_id(): string
{
    $data = random_bytes(16);
    $data[6] = chr((ord($data[6]) & 0x0F) | 0x40);
    $data[8] = chr((ord($data[8]) & 0x3F) | 0x80);

    return sprintf(
        '%s-%s-%s-%s-%s',
        bin2hex(substr($data, 0, 4)),
        bin2hex(substr($data, 4, 2)),
        bin2hex(substr($data, 6, 2)),
        bin2hex(substr($data, 8, 2)),
        bin2hex(substr($data, 10, 6))
    );
}
