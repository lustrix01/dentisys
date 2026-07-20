<?php

declare(strict_types=1);

function database_dsn(array $config): string
{
    $db = $config['db'];

    return sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
        $db['host'],
        (int) $db['port'],
        $db['name']
    );
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

    return new PDO(database_dsn($config), $db['user'], $db['pass'], pdo_options());
}
