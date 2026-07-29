<?php

declare(strict_types=1);

require_once __DIR__ . '/../../backend/app/request.php';

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
    } catch (RequestException $e) {
        if (!str_contains($e->getMessage(), $needle)) {
            fwrite(STDERR, "FAIL: $label -- message '" . $e->getMessage() . "' does not contain '$needle'\n");
            exit(1);
        }
    } catch (\Throwable $e) {
        if (!str_contains($e->getMessage(), $needle)) {
            fwrite(STDERR, "FAIL: $label -- unexpected exception: " . $e->getMessage() . "\n");
            exit(1);
        }
    }
    echo "PASS: $label\n";
}

echo "=== Request Parsing Unit Tests ===\n\n";

echo "--- JSON Object Parsing ---\n";

// Valid object
$result = parse_json_object_body('{"name":"test"}', 'application/json', 1024);
assert_same(true, $result['has_body'], 'Valid object: has_body=true');
assert_same('test', $result['data']['name'], 'Valid object: data parsed');

// Valid empty object
$result = parse_json_object_body('{}', 'application/json', 1024);
assert_same(true, $result['has_body'], 'Empty object: has_body=true');
assert_same([], $result['data'], 'Empty object: data empty');

// Empty body, no Content-Type
$result = parse_json_object_body('', null, 1024);
assert_same(false, $result['has_body'], 'No body: has_body=false');
assert_same([], $result['data'], 'No body: data empty');

// Empty body WITH Content-Type (important: must NOT treat as {}; must NOT throw 415)
$result = parse_json_object_body('', 'application/json', 1024);
assert_same(false, $result['has_body'], 'Empty body with JSON CT: has_body=false');
assert_same([], $result['data'], 'Empty body with JSON CT: data empty');

// Unsupported media type
assert_throws(fn() => parse_json_object_body('{"a":1}', 'text/plain', 1024), 'Unsupported Media Type', 'Text CT: 415');

// No Content-Type for nonempty
assert_throws(fn() => parse_json_object_body('{"a":1}', null, 1024), 'Unsupported Media Type', 'No CT for body: 415');

// Malformed JSON
assert_throws(fn() => parse_json_object_body('{invalid}', 'application/json', 1024), 'Malformed JSON', 'Malformed: 400');

// Top-level array
$result = parse_json_object_body('[1,2,3]', 'application/json', 1024);
assert_same(true, $result['has_body'], 'Array: has_body=true');
assert_same([1, 2, 3], $result['data'], 'Array: data parsed');

// Top-level scalar
assert_throws(fn() => parse_json_object_body('"hello"', 'application/json', 1024), 'must be a JSON object or array', 'Scalar: 400');

// Top-level number
assert_throws(fn() => parse_json_object_body('42', 'application/json', 1024), 'must be a JSON object or array', 'Number: 400');

// JSON with charset parameter
$result = parse_json_object_body('{"x":1}', 'application/json; charset=utf-8', 1024);
assert_same(true, $result['has_body'], 'JSON with charset: parsed');
assert_same(1, $result['data']['x'], 'JSON with charset: value');

// Oversized body
assert_throws(fn() => parse_json_object_body('{"data":"test"}', 'application/json', 1), 'exceeds maximum size', 'Oversized: 413');

echo "\n--- Request ID Generation ---\n";

$id = request_id();
assert_same(36, strlen($id), 'UUID v4 is 36 chars');
$parts = explode('-', $id);
assert_same(5, count($parts), 'UUID v4 has 5 parts');
assert_same(8, strlen($parts[0]), 'UUID part 1 length');
assert_same(4, strlen($parts[1]), 'UUID part 2 length');
assert_same(4, strlen($parts[2]), 'UUID part 3 length');
assert_same(4, strlen($parts[3]), 'UUID part 4 length');
assert_same(12, strlen($parts[4]), 'UUID part 5 length');

echo "\n--- request_ip ---\n";

$ips = request_ip();
assert_same(true, is_string($ips) && $ips !== '', 'request_ip returns non-empty string');

echo "\n--- request_user_agent ---\n";

$ua = request_user_agent();
assert_same(true, is_string($ua), 'request_user_agent returns string');

echo "\n=== ALL REQUEST PARSING TESTS PASSED ===\n";
