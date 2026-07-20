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
            'pass' => (string) config_value('DB_PASS', $local, 'local-development-password'),
        ],
    ];
}
