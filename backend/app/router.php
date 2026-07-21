<?php

declare(strict_types=1);

function route_compile_pattern(string $path): array
{
    $segments = explode('/', trim($path, '/'));

    $paramNames = [];
    $pattern = '';

    foreach ($segments as $segment) {
        if ($segment === '') {
            continue;
        }

        if (preg_match('/^\{([a-zA-Z_][a-zA-Z0-9_]*)\}$/', $segment, $m)) {
            $name = $m[1];

            if (in_array($name, $paramNames, true)) {
                throw new \InvalidArgumentException("Duplicate route parameter name: $name");
            }

            $paramNames[] = $name;
            $pattern .= '/' . '(?P<' . $name . '>[^/]+)';
        } else {
            if (preg_match('/[{}]/', $segment)) {
                throw new \InvalidArgumentException("Invalid route segment: $segment");
            }

            $pattern .= '/' . preg_quote($segment, '#');
        }
    }

    return [
        'pattern' => '#^' . $pattern . '$#',
        'param_names' => $paramNames,
    ];
}

function match_route(array $routes, string $method, string $path): array
{
    $normalizedPath = '/' . trim($path, '/');

    $methodMismatch = false;
    $compiledCache = [];

    foreach ($routes as $route) {
        $routeMethod = $route['method'];
        $routePath = $route['path'];

        if (strpos($routePath, '{') === false) {
            if ($routePath === $normalizedPath) {
                if ($routeMethod === $method) {
                    $handler = $route['handler'];

                    return [
                        'matched' => true,
                        'status' => 200,
                        'handler' => $handler,
                        'params' => [],
                        'has_params' => false,
                        'auth_required' => $route['auth'] ?? false,
                        'permission' => $route['permission'] ?? null,
                    ];
                }

                $methodMismatch = true;
            }
        } else {
            $key = $routePath;

            if (!isset($compiledCache[$key])) {
                $compiledCache[$key] = route_compile_pattern($routePath);
            }

            $compiled = $compiledCache[$key];

            if (preg_match($compiled['pattern'], $normalizedPath, $matches)) {
                if ($routeMethod === $method) {
                    $params = [];

                    foreach ($compiled['param_names'] as $name) {
                        $params[$name] = $matches[$name] ?? '';
                    }

                    $handler = $route['handler'];

                    return [
                        'matched' => true,
                        'status' => 200,
                        'handler' => $handler,
                        'params' => $params,
                        'has_params' => true,
                        'auth_required' => $route['auth'] ?? false,
                        'permission' => $route['permission'] ?? null,
                    ];
                }

                $methodMismatch = true;
            }
        }
    }

    if ($methodMismatch) {
        return [
            'matched' => false,
            'status' => 405,
            'handler' => null,
            'params' => [],
            'has_params' => false,
            'auth_required' => false,
            'permission' => null,
        ];
    }

    return [
        'matched' => false,
        'status' => 404,
        'handler' => null,
        'params' => [],
        'has_params' => false,
        'auth_required' => false,
        'permission' => null,
    ];
}

function route_parse_allowed_origins(string $originsStr): array
{
    $origins = explode(',', $originsStr);
    $parsed = [];

    foreach ($origins as $origin) {
        $trimmed = trim($origin);

        if ($trimmed === '') {
            continue;
        }

        $parts = parse_url($trimmed);

        if ($parts === false || !isset($parts['scheme']) || !isset($parts['host'])) {
            continue;
        }

        if (!in_array($parts['scheme'], ['http', 'https'], true)) {
            continue;
        }

        if (isset($parts['user']) || isset($parts['pass'])) {
            continue;
        }

        $normalized = $parts['scheme'] . '://' . strtolower($parts['host']);

        if (isset($parts['port'])) {
            $normalized .= ':' . $parts['port'];
        }

        if (isset($parts['path']) && $parts['path'] !== '/' && $parts['path'] !== '') {
            continue;
        }

        if (isset($parts['query'])) {
            continue;
        }

        if (isset($parts['fragment'])) {
            continue;
        }

        $parsed[] = $normalized;
    }

    return $parsed;
}

function route_handle_preflight(array $config): void
{
    $origin = request_origin();
    $reqMethod = request_header('Access-Control-Request-Method');
    $reqHeaders = request_header('Access-Control-Request-Headers');

    $response = build_preflight_response(
        $config['cors']['allowed_origins'] ?? '',
        $origin,
        $reqMethod,
        $reqHeaders
    );

    http_response_code($response['status_code']);

    foreach ($response['headers'] as $h) {
        header($h);
    }

    exit;
}

function route_add_cors_headers(string $allowedOriginsStr): void
{
    $origin = request_origin();

    if ($origin === null) {
        return;
    }

    $origins = route_parse_allowed_origins($allowedOriginsStr);
    $matched = null;

    foreach ($origins as $allowed) {
        if ($allowed === $origin) {
            $matched = $allowed;
            break;
        }
    }

    if ($matched !== null) {
        header('Access-Control-Allow-Origin: ' . $matched);
        header('Access-Control-Allow-Credentials: true');
        header('Vary: Origin');
    }
}

function route_request(array $routes, string $method, string $path): void
{
    $config = [];

    try {
        $config = app_config();
    } catch (\Throwable $e) {
        safe_error_response('Configuration error.', 500);
        return;
    }

    if ($method === 'OPTIONS') {
        route_handle_preflight($config);
        return;
    }

    route_add_cors_headers($config['cors']['allowed_origins'] ?? '');

    $result = match_route($routes, $method, $path);

    if ($result['matched']) {
        $handler = $result['handler'];

        if ($result['has_params']) {
            $handler($result['params']);
        } else {
            $handler();
        }
    } else {
        $statusMessages = [
            404 => 'Endpoint not found.',
            405 => 'Method not allowed.',
        ];

        safe_error_response($statusMessages[$result['status']] ?? 'Error.', $result['status']);
    }
}
