<?php

declare(strict_types=1);

/**
 * Docker provides runtime configuration through process environment variables.
 * Optional overrides exist only for deterministic tests.
 */
function config_value(string $key, array $overrides, mixed $default): mixed
{
    $value = getenv($key);
    if ($value !== false && $value !== '') {
        return $value;
    }

    if (array_key_exists($key, $overrides) && $overrides[$key] !== '') {
        return $overrides[$key];
    }

    return $default;
}

function config_key_bytes_at_least(string $encoded, int $minimumBytes, string $label): string
{
    if ($encoded === '') {
        throw new RuntimeException(sprintf('Configuration key "%s" is empty. Set it in the container environment.', $label));
    }

    $decoded = base64_decode($encoded, true);
    if ($decoded === false || $decoded === '' || strlen($decoded) < $minimumBytes) {
        throw new RuntimeException(sprintf('Configuration key "%s" must be valid Base64 with at least %d bytes.', $label, $minimumBytes));
    }

    return $decoded;
}

function config_key_bytes_exact(string $encoded, int $exactBytes, string $label): string
{
    $decoded = config_key_bytes_at_least($encoded, 1, $label);
    if (strlen($decoded) !== $exactBytes) {
        throw new RuntimeException(sprintf('Configuration key "%s" must decode to exactly %d bytes.', $label, $exactBytes));
    }

    return $decoded;
}

function config_app_base_url(string $value, bool $required): string
{
    $url = rtrim(trim($value), '/');
    if ($url === '') {
        if ($required) {
            throw new RuntimeException('Configuration value "APP_BASE_URL" is required for single-server deployments.');
        }
        return '';
    }

    $parts = parse_url($url);
    if ($parts === false
        || !isset($parts['scheme'], $parts['host'])
        || !in_array(strtolower($parts['scheme']), ['http', 'https'], true)
        || isset($parts['user'], $parts['pass'], $parts['query'], $parts['fragment'])) {
        throw new RuntimeException('Configuration value "APP_BASE_URL" must be a valid absolute HTTP(S) URL.');
    }

    return $url;
}

function app_url(array $config, string $path, array $query = []): string
{
    $baseUrl = rtrim((string) ($config['app']['base_url'] ?? ''), '/');
    if ($baseUrl === '') {
        throw new RuntimeException('Configuration value "APP_BASE_URL" is required to generate application links.');
    }

    $url = $baseUrl . '/' . ltrim($path, '/');
    return $query === [] ? $url : $url . '?' . http_build_query($query, '', '&', PHP_QUERY_RFC3986);
}

function app_config(?array $overrides = null): array
{
    $values = $overrides ?? [];
    $appEnv = (string) config_value('APP_ENV', $values, 'development');
    $isDevelopment = strtolower($appEnv) === 'development';
    $baseUrl = config_app_base_url(
        (string) config_value('APP_BASE_URL', $values, $isDevelopment ? 'http://localhost:5173' : ''),
        strtolower($appEnv) === 'single-server'
    );

    return [
        'debug' => filter_var(config_value('APP_DEBUG', $values, false), FILTER_VALIDATE_BOOLEAN),
        'db' => [
            'host' => (string) config_value('DB_HOST', $values, 'db'),
            'port' => (int) config_value('DB_PORT', $values, 5432),
            'name' => (string) config_value('DB_NAME', $values, 'dentisys'),
            'user' => (string) config_value('DB_USER', $values, 'dentisys'),
            'pass' => (string) config_value('DB_PASS', $values, 'local-development-password'),
        ],
        'app' => [
            'env' => $appEnv,
            'base_url' => $baseUrl,
            'is_https' => filter_var(config_value('APP_IS_HTTPS', $values, 'false'), FILTER_VALIDATE_BOOLEAN),
            'allowed_email_domain' => strtolower((string) config_value('ALLOWED_EMAIL_DOMAIN', $values, 'bicol-u.edu.ph')),
        ],
        'cors' => [
            'allowed_origins' => (string) config_value('CORS_ALLOWED_ORIGINS', $values, 'http://localhost:5173'),
        ],
        'jwt' => [
            'signing_key_b64' => (string) config_value('JWT_SIGNING_KEY_B64', $values, 'ZGVudGlzeXMtZGV2LWp3dC1zaWduaW5nLWtleS0zMmI='),
            'access_ttl' => (int) config_value('JWT_ACCESS_TTL', $values, 86400),
        ],
        'mfa' => [
            'encryption_key_b64' => (string) config_value('MFA_ENCRYPTION_KEY_B64', $values, 'ZGVudGlzeXMtZGV2LW1mYS1lbmNyeXB0LWtleS0zMmI='),
            'issuer' => 'DentiSys',
        ],
        'audit' => [
            'mac_key_b64' => (string) config_value('AUDIT_MAC_KEY_B64', $values, 'ZGVudGlzeXMtZGV2LWF1ZGl0LW1hYy1rZXktMzJiaXQ='),
        ],
        'rate_limit' => [
            'enabled' => filter_var(config_value('RATE_LIMIT_ENABLED', $values, 'true'), FILTER_VALIDATE_BOOLEAN),
            'storage_dir' => (string) (config_value('RATE_LIMIT_STORAGE_DIR', $values, '') ?: dirname(__DIR__) . '/storage/ratelimit'),
        ],
        'show_dev_reset_link' => $isDevelopment && filter_var(config_value('SHOW_DEV_RESET_LINK', $values, true), FILTER_VALIDATE_BOOLEAN),
        'show_dev_invitation_link' => $isDevelopment && filter_var(config_value('SHOW_DEV_INVITATION_LINK', $values, true), FILTER_VALIDATE_BOOLEAN),
        'smtp' => [
            'host' => (string) config_value('SMTP_HOST', $values, 'mailpit'),
            'port' => (int) config_value('SMTP_PORT', $values, 1025),
            'user' => (string) config_value('SMTP_USER', $values, ''),
            'pass' => (string) config_value('SMTP_PASS', $values, ''),
            'from' => (string) config_value('SMTP_FROM', $values, 'noreply@dentisys.local'),
            'encryption' => strtolower((string) config_value('SMTP_ENCRYPTION', $values, $isDevelopment ? 'none' : 'starttls')),
            'verify_peer' => filter_var(config_value('SMTP_VERIFY_PEER', $values, $isDevelopment ? 'false' : 'true'), FILTER_VALIDATE_BOOLEAN),
            'ca_file' => (string) config_value('SMTP_CA_FILE', $values, ''),
        ],
    ];
}
