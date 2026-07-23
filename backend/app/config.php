<?php

declare(strict_types=1);

function local_config_path(): string
{
    return dirname(__DIR__) . '/config/local.php';
}

function root_dotenv_path(): string
{
    return dirname(__DIR__, 2) . '/.env';
}

function load_dotenv_file(?string $path = null): array
{
    static $cache = null;
    if ($cache !== null && $path === null) {
        return $cache;
    }

    $dotenvPath = $path ?? root_dotenv_path();
    $parsed = [];

    if (is_file($dotenvPath)) {
        $lines = file($dotenvPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if ($lines !== false) {
            foreach ($lines as $line) {
                $line = trim($line);
                if ($line === '' || str_starts_with($line, '#')) {
                    continue;
                }

                $pos = strpos($line, '=');
                if ($pos === false) {
                    continue;
                }

                $key = trim(substr($line, 0, $pos));
                $value = trim(substr($line, $pos + 1));

                if ($key === '') {
                    continue;
                }

                if (
                    (str_starts_with($value, '"') && str_ends_with($value, '"')) ||
                    (str_starts_with($value, "'") && str_ends_with($value, "'"))
                ) {
                    $value = substr($value, 1, -1);
                }

                $parsed[$key] = $value;

                if (getenv($key) === false || getenv($key) === '') {
                    putenv("{$key}={$value}");
                    $_ENV[$key] = $value;
                    $_SERVER[$key] = $value;
                }
            }
        }
    }

    if ($path === null) {
        $cache = $parsed;
    }

    return $parsed;
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
    if (array_key_exists($key, $localConfig) && $localConfig[$key] !== '') {
        $envVal = getenv($key);
        $dotenv = load_dotenv_file();
        $dotenvVal = $dotenv[$key] ?? null;

        if ($envVal !== false && $envVal !== '' && $envVal !== $dotenvVal) {
            return $envVal;
        }

        return $localConfig[$key];
    }

    $value = getenv($key);

    if ($value !== false && $value !== '') {
        return $value;
    }

    return $default;
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
    load_dotenv_file();
    $local = $localConfig ?? load_local_config();
    $appEnv = (string) config_value('APP_ENV', $local, 'development');
    $isDevelopment = strtolower($appEnv) === 'development';

    return [
        'debug' => filter_var(config_value('APP_DEBUG', $local, false), FILTER_VALIDATE_BOOLEAN),
        'db' => [
            'host' => (string) config_value('DB_HOST', $local, '127.0.0.1'),
            'port' => (int) (config_value('DB_PORT', $local, '') ?: config_value('DB_HOST_PORT', $local, 3306)),
            'name' => (string) config_value('DB_NAME', $local, 'dentisys'),
            'user' => (string) config_value('DB_USER', $local, 'dentisys'),
            'pass' => (string) config_value('DB_PASS', $local, 'local-development-password'),
        ],
        'app' => [
            'env' => $appEnv,
            'is_https' => filter_var(config_value('APP_IS_HTTPS', $local, 'false'), FILTER_VALIDATE_BOOLEAN),
        ],
        'cors' => [
            'allowed_origins' => (string) config_value('CORS_ALLOWED_ORIGINS', $local, 'http://localhost:5173'),
        ],
        'jwt' => [
            'signing_key_b64' => (string) config_value('JWT_SIGNING_KEY_B64', $local, 'ZGVudGlzeXMtZGV2LWp3dC1zaWduaW5nLWtleS0zMmI='),
            'access_ttl' => (int) config_value('JWT_ACCESS_TTL', $local, 86400),
        ],
        'mfa' => [
            'required' => filter_var(config_value('MFA_REQUIRED', $local, 'true'), FILTER_VALIDATE_BOOLEAN),
            'encryption_key_b64' => (string) config_value('MFA_ENCRYPTION_KEY_B64', $local, 'ZGVudGlzeXMtZGV2LW1mYS1lbmNyeXB0LWtleS0zMmI='),
        ],
        'audit' => [
            'mac_key_b64' => (string) config_value('AUDIT_MAC_KEY_B64', $local, 'ZGVudGlzeXMtZGV2LWF1ZGl0LW1hYy1rZXktMzJiaXQ='),
        ],
        'rate_limit' => [
            'enabled' => filter_var(config_value('RATE_LIMIT_ENABLED', $local, 'true'), FILTER_VALIDATE_BOOLEAN),
            'storage_dir' => (string) (config_value('RATE_LIMIT_STORAGE_DIR', $local, '') ?: dirname(__DIR__) . '/storage/ratelimit'),
        ],
        'show_dev_reset_link' => filter_var(config_value('SHOW_DEV_RESET_LINK', $local, true), FILTER_VALIDATE_BOOLEAN),
        'show_dev_mfa_code' => $isDevelopment
            && filter_var(config_value('SHOW_DEV_MFA_CODE', $local, true), FILTER_VALIDATE_BOOLEAN),
        'show_dev_invitation_link' => filter_var(config_value('SHOW_DEV_INVITATION_LINK', $local, true), FILTER_VALIDATE_BOOLEAN),
        'smtp' => [
            'host' => (string) config_value('SMTP_HOST', $local, '127.0.0.1'),
            'port' => (int) config_value('SMTP_PORT', $local, 1025),
            'user' => (string) config_value('SMTP_USER', $local, ''),
            'pass' => (string) config_value('SMTP_PASS', $local, ''),
            'from' => (string) config_value('SMTP_FROM', $local, 'noreply@dentisys.local'),
        ],
    ];
}
