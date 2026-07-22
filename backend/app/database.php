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
        PDO::ATTR_TIMEOUT => 2,
    ];
}

function create_pdo(array $config): PDO
{
    $db = $config['db'];

    $fp = @fsockopen($db['host'], (int) $db['port'], $errno, $errstr, 1.0);
    if (!$fp) {
        throw new PDOException("Database server at {$db['host']}:{$db['port']} is unreachable.", 2002);
    }
    fclose($fp);

    try {
        return new PDO(database_dsn($config), $db['user'], $db['pass'], pdo_options());
    } catch (PDOException $e) {
        $isMissingDb = (
            $e->getCode() === 1049 ||
            str_contains($e->getMessage(), 'Unknown database') ||
            str_contains($e->getMessage(), '1049')
        );

        $isDev = ($config['app']['env'] ?? 'development') === 'development';

        if ($isMissingDb && $isDev) {
            try {
                $serverDsn = sprintf('mysql:host=%s;port=%d;charset=utf8mb4', $db['host'], (int) $db['port']);
                $serverPdo = new PDO($serverDsn, $db['user'], $db['pass'], pdo_options());
                $escapedDb = str_replace('`', '``', $db['name']);
                $serverPdo->exec("CREATE DATABASE IF NOT EXISTS `{$escapedDb}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;");
                unset($serverPdo);

                return new PDO(database_dsn($config), $db['user'], $db['pass'], pdo_options());
            } catch (PDOException $createErr) {
                $errCode = (int) $createErr->getCode();
                if ($errCode === 0) { $errCode = 1049; }
                throw new PDOException(
                    "Database '{$db['name']}' does not exist on {$db['host']}:{$db['port']} and auto-creation failed: " . $createErr->getMessage(),
                    $errCode,
                    $createErr
                );
            }
        }

        if ($isMissingDb) {
            $errCode = (int) $e->getCode();
            if ($errCode === 0) { $errCode = 1049; }
            throw new PDOException(
                "Database '{$db['name']}' does not exist on {$db['host']}:{$db['port']}. Please run scripts/start-dev.ps1 or scripts/migrate.ps1 to provision the database.",
                $errCode,
                $e
            );
        }

        throw $e;
    }
}
