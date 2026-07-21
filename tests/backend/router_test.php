<?php

declare(strict_types=1);

require_once __DIR__ . '/../../backend/app/config.php';
require_once __DIR__ . '/../../backend/app/request.php';
require_once __DIR__ . '/../../backend/app/response.php';
require_once __DIR__ . '/../../backend/app/router.php';
require_once __DIR__ . '/../../backend/app/security.php';

function assert_same(mixed $expected, mixed $actual, string $label): void
{
    if ($expected !== $actual) {
        fwrite(STDERR, "FAIL: $label\nExpected: " . var_export($expected, true) . "\nActual: " . var_export($actual, true) . "\n");
        exit(1);
    }
    echo "PASS: $label\n";
}

function assert_throws(callable $fn, string $needle, string $label): void
{
    try {
        $fn();
        fwrite(STDERR, "FAIL: $label -- expected exception containing '$needle'\n");
        exit(1);
    } catch (\Throwable $e) {
        if (!str_contains($e->getMessage(), $needle)) {
            fwrite(STDERR, "FAIL: $label -- exception message '" . $e->getMessage() . "' does not contain '$needle'\n");
            exit(1);
        }
    }
    echo "PASS: $label\n";
}

$healthHandler = function () {};

$testRoutes = [
    ['method' => 'GET', 'path' => '/api/health', 'handler' => $healthHandler],
    ['method' => 'GET', 'path' => '/api/students/{student_id}', 'handler' => fn(array $p) => $p],
    ['method' => 'GET', 'path' => '/api/courses/{course_id}', 'handler' => fn(array $p) => $p],
    ['method' => 'POST', 'path' => '/api/auth/login', 'handler' => $healthHandler],
    ['method' => 'GET', 'path' => '/api/class-sections/{cs_id}/students', 'handler' => fn(array $p) => $p],
];

echo "=== Router Unit Tests ===\n\n";

echo "--- Exact Match ---\n";

$result = match_route($testRoutes, 'GET', '/api/health');
assert_same(true, $result['matched'], 'Exact health route matches');
assert_same(200, $result['status'], 'Health route status 200');
assert_same(false, $result['has_params'], 'Health route has no params');
assert_same([], $result['params'], 'Health route empty params');

$result = match_route($testRoutes, 'POST', '/api/health');
assert_same(false, $result['matched'], 'POST health 405');
assert_same(405, $result['status'], 'POST health status 405');

echo "\n--- Parameterized Routes ---\n";

$result = match_route($testRoutes, 'GET', '/api/students/42');
assert_same(true, $result['matched'], 'Student 42 matched');
assert_same(true, $result['has_params'], 'Student route has params');
assert_same('42', $result['params']['student_id'], 'Student ID extracted');

$result = match_route($testRoutes, 'GET', '/api/courses/CLIN401');
assert_same(true, $result['matched'], 'Course matched');
assert_same('CLIN401', $result['params']['course_id'], 'Course code extracted');

$result = match_route($testRoutes, 'GET', '/api/class-sections/CLINIC-A/students');
assert_same(true, $result['matched'], 'Multi-segment route matched');
assert_same('CLINIC-A', $result['params']['cs_id'], 'CS ID extracted');

echo "\n--- Not Found ---\n";

$result = match_route($testRoutes, 'GET', '/api/nonexistent');
assert_same(false, $result['matched'], 'Unknown path 404');
assert_same(404, $result['status'], 'Unknown path status 404');

echo "\n--- 405 ---\n";

$result = match_route($testRoutes, 'DELETE', '/api/auth/login');
assert_same(false, $result['matched'], 'Wrong method 405');
assert_same(405, $result['status'], 'Wrong method status 405');

echo "\n--- Duplicate Parameter Names ---\n";

assert_throws(
    fn() => route_compile_pattern('/api/{id}/items/{id}'),
    'Duplicate',
    'Duplicate parameter rejected'
);

echo "\n--- CORS Origin Parsing ---\n";

$origins = route_parse_allowed_origins('http://localhost:5173, https://example.com');
assert_same(2, count($origins), 'Two origins parsed');
assert_same('http://localhost:5173', $origins[0], 'First origin correct');
assert_same('https://example.com', $origins[1], 'Second origin correct');

$origins = route_parse_allowed_origins('http://localhost');
assert_same('http://localhost', $origins[0], 'Origin without port');

$origins = route_parse_allowed_origins('');
assert_same(0, count($origins), 'Empty string yields no origins');

$origins = route_parse_allowed_origins('http://user:pass@host.com');
assert_same(0, count($origins), 'Origin with userinfo rejected');

echo "\n--- Preflight Builder ---\n";

$preflight = build_preflight_response('http://localhost:5173', 'http://localhost:5173', 'POST', 'Content-Type');
assert_same(true, $preflight['allowed'], 'Valid preflight allowed');
assert_same(204, $preflight['status_code'], 'Valid preflight 204');

$preflight = build_preflight_response('http://localhost:5173', 'http://evil.com', 'POST', 'Content-Type');
assert_same(false, $preflight['allowed'], 'Invalid origin disallowed');
assert_same(403, $preflight['status_code'], 'Invalid origin 403');

$preflight = build_preflight_response('http://localhost:5173', null, 'POST', 'Content-Type');
assert_same(false, $preflight['allowed'], 'Null origin disallowed');

echo "\n=== ALL ROUTER TESTS PASSED ===\n";
