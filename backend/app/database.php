<?php

declare(strict_types=1);

function database_dsn(array $config): string
{
    $db = $config['db'];

    return sprintf('pgsql:host=%s;port=%d;dbname=%s', $db['host'], (int) $db['port'], $db['name']);
}

function pdo_options(): array
{
    return [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ];
}

function create_pdo(array $config): PDO
{
    $db = $config['db'];

    try {
        return new PDO(database_dsn($config), $db['user'], $db['pass'], pdo_options());
    } catch (PDOException $e) {
        throw $e;
    }
}

function pdo_bind_binary(PDOStatement $statement, string|int $parameter, ?string $value): void
{
    $statement->bindValue($parameter, $value, $value === null ? PDO::PARAM_NULL : PDO::PARAM_LOB);
}

function pdo_binary_value(mixed $value): ?string
{
    if ($value === null) {
        return null;
    }

    if (is_resource($value)) {
        $content = stream_get_contents($value);
        return $content === false ? null : $content;
    }

    return is_string($value) ? $value : null;
}
