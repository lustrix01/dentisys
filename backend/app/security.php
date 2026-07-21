<?php

declare(strict_types=1);

function request_is_https(array $config, array $server): bool
{
    if (($config['app']['is_https'] ?? false) === true) {
        return true;
    }

    $https = $server['HTTPS'] ?? '';

    if ($https === 'on' || $https === '1') {
        return true;
    }

    return false;
}

function should_send_hsts(array $config, array $server): bool
{
    if (($config['app']['env'] ?? '') !== 'production') {
        return false;
    }

    return request_is_https($config, $server);
}

function build_security_headers(): array
{
    return [
        'X-Content-Type-Options: nosniff',
        'X-Frame-Options: SAMEORIGIN',
        'Referrer-Policy: strict-origin-when-cross-origin',
        "Content-Security-Policy: default-src 'self'; frame-ancestors 'self'; object-src 'none'; base-uri 'self'",
    ];
}

function build_hsts_header(bool $shouldSend): array
{
    if ($shouldSend) {
        return ['Strict-Transport-Security: max-age=31536000; includeSubDomains'];
    }

    return [];
}

function build_no_store_headers(): array
{
    return [
        'Cache-Control: no-store',
        'Pragma: no-cache',
    ];
}

function build_cors_headers(string $allowedOrigin): array
{
    return [
        'Access-Control-Allow-Origin: ' . $allowedOrigin,
        'Access-Control-Allow-Credentials: true',
        'Vary: Origin',
    ];
}

function build_preflight_response(string $allowedOriginsStr, ?string $requestOrigin, ?string $requestMethod, ?string $requestHeaders): array
{
    if ($requestOrigin === null || $requestMethod === null) {
        return [
            'allowed' => false,
            'status_code' => 403,
            'headers' => [],
        ];
    }

    $allowedOrigins = route_parse_allowed_origins($allowedOriginsStr);
    $matched = null;

    foreach ($allowedOrigins as $allowed) {
        if ($allowed === $requestOrigin) {
            $matched = $allowed;
            break;
        }
    }

    if ($matched === null) {
        return [
            'allowed' => false,
            'status_code' => 403,
            'headers' => [],
        ];
    }

    $allowedMethods = ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'];
    $methodAllowed = in_array(strtoupper($requestMethod), $allowedMethods, true);

    if (!$methodAllowed) {
        return [
            'allowed' => false,
            'status_code' => 403,
            'headers' => [],
        ];
    }

    $allowedHeaders = ['Content-Type', 'Authorization'];

    if ($requestHeaders !== null) {
        $requestedHeaders = array_map('trim', explode(',', $requestHeaders));

        foreach ($requestedHeaders as $rh) {
            if (!in_array(strtolower($rh), array_map('strtolower', $allowedHeaders), true)) {
                return [
                    'allowed' => false,
                    'status_code' => 403,
                    'headers' => [],
                ];
            }
        }
    }

    return [
        'allowed' => true,
        'status_code' => 204,
        'headers' => array_merge(
            build_cors_headers($matched),
            [
                'Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS',
                'Access-Control-Allow-Headers: Content-Type, Authorization',
                'Access-Control-Max-Age: 86400',
            ]
        ),
    ];
}

function build_refresh_cookie_header(string $token, int $ttlSeconds, bool $secure): array
{
    if (preg_match('/[\x00-\x1F\x7F]/', $token) || strpos($token, "\r") !== false || strpos($token, "\n") !== false) {
        throw new \InvalidArgumentException('Refresh token contains invalid characters.');
    }

    $securePart = $secure ? '; Secure' : '';

    return [
        "Set-Cookie: refresh_token=$token; HttpOnly; SameSite=Lax; Path=/api/auth; Max-Age=$ttlSeconds" . $securePart,
    ];
}

function build_clear_cookie_header(bool $secure): array
{
    $securePart = $secure ? '; Secure' : '';

    return [
        "Set-Cookie: refresh_token=; HttpOnly; SameSite=Lax; Path=/api/auth; Max-Age=0" . $securePart,
    ];
}

function get_security_headers(array $config, array $server): array
{
    $headers = array_merge(
        build_security_headers(),
        build_hsts_header(should_send_hsts($config, $server))
    );

    return $headers;
}

function send_security_headers(): void
{
    $headers = build_security_headers();

    foreach ($headers as $header) {
        header($header);
    }
}

function send_hsts_if_needed(array $config, array $server): void
{
    $hsts = build_hsts_header(should_send_hsts($config, $server));

    foreach ($hsts as $header) {
        header($header);
    }
}
