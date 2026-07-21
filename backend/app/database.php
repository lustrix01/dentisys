<?php

declare(strict_types=1);

function database_dsn(array $config): string
{
    $db = $config['db'];
    $driver = $db['driver'] ?? 'mysql';

    if ($driver === 'pgsql') {
        return sprintf(
            'pgsql:host=%s;port=%d;dbname=%s',
            $db['host'],
            (int) $db['port'],
            $db['name']
        );
    }

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

    try {
        return new PDO(database_dsn($config), $db['user'], $db['pass'], pdo_options());
    } catch (\PDOException $e) {
        if (($db['driver'] ?? 'mysql') === 'mysql' && ($e->getCode() === 1049 || str_contains($e->getMessage(), 'Unknown database'))) {
            try {
                $serverDsn = sprintf('mysql:host=%s;port=%d;charset=utf8mb4', $db['host'], (int) $db['port']);
                $serverPdo = new PDO($serverDsn, $db['user'], $db['pass'], pdo_options());
                $serverPdo->exec(sprintf(
                    'CREATE DATABASE IF NOT EXISTS `%s` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
                    str_replace('`', '``', $db['name'])
                ));
                return new PDO(database_dsn($config), $db['user'], $db['pass'], pdo_options());
            } catch (\Throwable $innerEx) {
                throw $e;
            }
        }
        throw $e;
    }
}
