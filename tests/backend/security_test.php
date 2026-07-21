<?php

declare(strict_types=1);

require_once __DIR__ . '/../../backend/app/config.php';
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

function assert_contains(string $needle, string $haystack, string $label): void
{
    if (!str_contains($haystack, $needle)) {
        fwrite(STDERR, "FAIL: $label\nExpected to find: $needle\nIn: $haystack\n");
        exit(1);
    }
    echo "PASS: $label\n";
}

function assert_not_contains(string $needle, string $haystack, string $label): void
{
    if (str_contains($haystack, $needle)) {
        fwrite(STDERR, "FAIL: $label\nUnexpected: $needle\nIn: $haystack\n");
        exit(1);
    }
    echo "PASS: $label\n";
}

function assert_throws(callable $fn, string $needle, string $label): void
{
    try {
        $fn();
        fwrite(STDERR, "FAIL: $label -- expected exception\n");
        exit(1);
    } catch (\Throwable $e) {
        if (!str_contains($e->getMessage(), $needle)) {
            fwrite(STDERR, "FAIL: $label -- " . $e->getMessage() . " (expected: $needle)\n");
            exit(1);
        }
    }
    echo "PASS: $label\n";
}

echo "=== Security Header/CORS/Cookie Tests ===\n\n";

echo "--- request_is_https ---\n";

$devConfig = ['app' => ['is_https' => false, 'env' => 'development']];
$prodConfig = ['app' => ['is_https' => true, 'env' => 'production']];

assert_same(false, request_is_https($devConfig, ['HTTPS' => 'off']), 'Dev+off: false');
assert_same(false, request_is_https($devConfig, []), 'Dev+no HTTPS: false');
assert_same(true, request_is_https($devConfig, ['HTTPS' => 'on']), 'Dev+HTTPS on: true');
assert_same(true, request_is_https($devConfig, ['HTTPS' => '1']), 'Dev+HTTPS 1: true');
assert_same(true, request_is_https($prodConfig, ['HTTPS' => 'off']), 'Prod+config: true');

// X-Forwarded-Proto not trusted
assert_same(false, request_is_https($devConfig, ['HTTP_X_FORWARDED_PROTO' => 'https']), 'Dev+XFP: false (not trusted)');

echo "\n--- should_send_hsts ---\n";

assert_same(false, should_send_hsts($devConfig, ['HTTPS' => 'on']), 'Development: no HSTS');
assert_same(true, should_send_hsts($prodConfig, ['HTTPS' => 'on']), 'Production+HTTPS: HSTS');
// When APP_IS_HTTPS is configured true, HSTS is sent regardless of server state
$prodNoHttpsConfig = ['app' => ['is_https' => false, 'env' => 'production']];
assert_same(false, should_send_hsts($prodNoHttpsConfig, ['HTTPS' => 'off']), 'Production+no HTTPS: no HSTS');
assert_same(true, should_send_hsts($prodNoHttpsConfig, ['HTTPS' => 'on']), 'Production+HTTPS on: HSTS');

echo "\n--- CORS Headers ---\n";

$cors = build_cors_headers('http://localhost:5173');
$corsStr = implode("\n", $cors);
assert_contains('Access-Control-Allow-Origin: http://localhost:5173', $corsStr, 'CORS: origin');
assert_contains('Access-Control-Allow-Credentials: true', $corsStr, 'CORS: credentials');
assert_contains('Vary: Origin', $corsStr, 'CORS: vary');

echo "\n--- Preflight Response ---\n";

$preflight = build_preflight_response('http://localhost:5173', 'http://localhost:5173', 'POST', 'Content-Type');
assert_same(true, $preflight['allowed'], 'Preflight: allowed');
assert_same(204, $preflight['status_code'], 'Preflight: 204');

$headersStr = implode("\n", $preflight['headers']);
assert_contains('Access-Control-Allow-Methods', $headersStr, 'Preflight: methods');
assert_contains('Access-Control-Max-Age: 86400', $headersStr, 'Preflight: max age');

// Disallowed method
$preflight = build_preflight_response('http://localhost:5173', 'http://localhost:5173', 'PURGE', 'Content-Type');
assert_same(false, $preflight['allowed'], 'Preflight: disallowed method');

// Disallowed header
$preflight = build_preflight_response('http://localhost:5173', 'http://localhost:5173', 'POST', 'X-Custom-Header');
assert_same(false, $preflight['allowed'], 'Preflight: disallowed header');

// No wildcard with credentials
$cors = build_cors_headers('http://localhost:5173');
$corsStr = implode("\n", $cors);
assert_not_contains('*', $corsStr, 'No wildcard origin');

echo "\n--- Refresh Cookie ---\n";

$cookie = build_refresh_cookie_header('testtoken123', 604800, false);
$cookieStr = implode("\n", $cookie);
assert_contains('HttpOnly', $cookieStr, 'Cookie: HttpOnly');
assert_contains('SameSite=Lax', $cookieStr, 'Cookie: SameSite');
assert_contains('Path=/api/auth', $cookieStr, 'Cookie: Path');
assert_contains('Max-Age=604800', $cookieStr, 'Cookie: Max-Age');
assert_not_contains('Secure', $cookieStr, 'Cookie: no Secure when not HTTPS');

$secureCookie = build_refresh_cookie_header('testtoken123', 604800, true);
$secureStr = implode("\n", $secureCookie);
assert_contains('Secure', $secureStr, 'Cookie: Secure when HTTPS');
assert_contains('HttpOnly', $secureStr, 'Secure cookie: HttpOnly');
assert_contains('SameSite=Lax', $secureStr, 'Secure cookie: SameSite');

// Clear cookie
$clear = build_clear_cookie_header(false);
$clearStr = implode("\n", $clear);
assert_contains('Max-Age=0', $clearStr, 'Clear cookie: Max-Age=0');
assert_contains('HttpOnly', $clearStr, 'Clear cookie: HttpOnly');
assert_not_contains('Secure', $clearStr, 'Clear cookie: no Secure');
assert_contains('Path=/api/auth', $clearStr, 'Clear cookie: path');

$clearSec = build_clear_cookie_header(true);
assert_contains('Secure', implode("\n", $clearSec), 'Clear cookie: Secure when HTTPS');

echo "\n--- Header Injection Rejection ---\n";

assert_throws(fn() => build_refresh_cookie_header("token\r\nInjected", 3600, false), 'invalid characters', 'Cookie rejects CRLF injection');

echo "\n--- No-Store Headers ---\n";

$noStore = build_no_store_headers();
$noStoreStr = implode("\n", $noStore);
assert_contains('Cache-Control: no-store', $noStoreStr, 'No-store header');
assert_contains('Pragma: no-cache', $noStoreStr, 'Pragma no-cache header');

echo "\n=== ALL SECURITY HEADER TESTS PASSED ===\n";
