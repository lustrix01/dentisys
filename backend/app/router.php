<?php

declare(strict_types=1);

function route_request(array $routes, string $method, string $path): void
{
    $normalizedPath = '/' . trim($path, '/');

    foreach ($routes as $route) {
        if ($route['method'] === $method && $route['path'] === $normalizedPath) {
            $route['handler']();
            return;
        }
    }

    safe_error_response('Endpoint not found.', 404);
}
