<?php

declare(strict_types=1);

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
