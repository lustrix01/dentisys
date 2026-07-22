<?php

declare(strict_types=1);

function local_config_path(): string
{
    return dirname(__DIR__) . '/config/local.php';
}

function load_local_config(?string $path = null): array
{
    $configPath = $path ?? local_config_path();

    if (!is_file($configPath)) {
        return [];
    }

    $config = require $configPath;

    return is_array($config) ? $config : [];
}

function config_value(string $key, array $localConfig, mixed $default): mixed
{
    $value = getenv($key);

    if ($value !== false && $value !== '') {
        return $value;
    }

    return array_key_exists($key, $localConfig) && $localConfig[$key] !== ''
        ? $localConfig[$key]
        : $default;
}

function config_key_bytes_at_least(string $encoded, int $minimumBytes, string $label): string
{
    if ($encoded === '') {
        throw new \RuntimeException(sprintf(
            'Configuration key "%s" is empty. Set it in environment or local.php.',
            $label
        ));
    }

    $decoded = base64_decode($encoded, true);

    if ($decoded === false || $decoded === '') {
        throw new \RuntimeException(sprintf(
            'Configuration key "%s" is not valid Base64.',
            $label
        ));
    }

    $len = strlen($decoded);

    if ($len < $minimumBytes) {
        throw new \RuntimeException(sprintf(
            'Configuration key "%s" decodes to %d bytes; at least %d required.',
            $label,
            $len,
            $minimumBytes
        ));
    }

    return $decoded;
}

function config_key_bytes_exact(string $encoded, int $exactBytes, string $label): string
{
    if ($encoded === '') {
        throw new \RuntimeException(sprintf(
            'Configuration key "%s" is empty. Set it in environment or local.php.',
            $label
        ));
    }

    $decoded = base64_decode($encoded, true);

    if ($decoded === false || $decoded === '') {
        throw new \RuntimeException(sprintf(
            'Configuration key "%s" is not valid Base64.',
            $label
        ));
    }

    $len = strlen($decoded);

    if ($len !== $exactBytes) {
        throw new \RuntimeException(sprintf(
            'Configuration key "%s" decodes to %d bytes; exactly %d required.',
            $label,
            $len,
            $exactBytes
        ));
    }

    return $decoded;
}

function app_config(?array $localConfig = null): array
{
    $local = $localConfig ?? load_local_config();

    return [
        'debug' => filter_var(config_value('APP_DEBUG', $local, false), FILTER_VALIDATE_BOOLEAN),
        'db' => [
            'host' => (string) config_value('DB_HOST', $local, '127.0.0.1'),
            'port' => (int) config_value('DB_PORT', $local, 3306),
            'name' => (string) config_value('DB_NAME', $local, 'dentisys'),
            'user' => (string) config_value('DB_USER', $local, 'dentisys'),
            'pass' => (string) config_value('DB_PASS', $local, ''),
        ],
        'app' => [
            'env' => (string) config_value('APP_ENV', $local, 'development'),
            'is_https' => filter_var(config_value('APP_IS_HTTPS', $local, 'false'), FILTER_VALIDATE_BOOLEAN),
        ],
        'cors' => [
            'allowed_origins' => (string) config_value('CORS_ALLOWED_ORIGINS', $local, 'http://localhost:5173'),
        ],
        'jwt' => [
            'signing_key_b64' => (string) config_value('JWT_SIGNING_KEY_B64', $local, ''),
            'access_ttl' => 900,
        ],
        'mfa' => [
            'required' => filter_var(config_value('MFA_REQUIRED', $local, 'false'), FILTER_VALIDATE_BOOLEAN),
            'encryption_key_b64' => (string) config_value('MFA_ENCRYPTION_KEY_B64', $local, ''),
        ],
        'audit' => [
            'mac_key_b64' => (string) config_value('AUDIT_MAC_KEY_B64', $local, ''),
        ],
        'rate_limit' => [
            'enabled' => filter_var(config_value('RATE_LIMIT_ENABLED', $local, 'true'), FILTER_VALIDATE_BOOLEAN),
            'storage_dir' => (string) (config_value('RATE_LIMIT_STORAGE_DIR', $local, '') ?: dirname(__DIR__) . '/storage/ratelimit'),
        ],
        'smtp' => [
            'host'       => (string) (config_value('SMTP_HOST', $local, '') ?: config_value('MAILER_HOST', $local, 'smtp.gmail.com')),
            'port'       => (int) (config_value('SMTP_PORT', $local, 587) ?: config_value('MAILER_PORT', $local, 587)),
            'user'       => (string) (config_value('SMTP_USER', $local, '') ?: config_value('MAILER_EMAIL', $local, 'bu.dentisys@gmail.com')),
            'pass'       => (string) (config_value('SMTP_PASS', $local, '') ?: config_value('MAILER_APP_PASS', $local, '')),
            'secure'     => (string) (config_value('SMTP_SECURE', $local, 'tls') ?: config_value('MAILER_SMTP_SECURE', $local, 'tls')),
            'from_email' => (string) (config_value('SMTP_FROM_EMAIL', $local, '') ?: config_value('MAILER_EMAIL', $local, 'bu.dentisys@gmail.com')),
            'from_name'  => (string) (config_value('SMTP_FROM_NAME', $local, '') ?: config_value('MAILER_FROM_NAME', $local, 'DentiSYS')),
        ],
    ];
}
