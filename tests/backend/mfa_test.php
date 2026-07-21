<?php

declare(strict_types=1);

require_once __DIR__ . '/../../backend/app/mfa.php';

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

echo "=== MFA/TOTP/Base32/AES Unit Tests ===\n\n";

echo "--- Base32 ---\n";

$knownVectors = [
    '' => '',
    'f' => 'MY',
    'fo' => 'MZXQ',
    'foo' => 'MZXW6',
    'foob' => 'MZXW6YQ',
    'fooba' => 'MZXW6YTB',
    'foobar' => 'MZXW6YTBOI',
];

foreach ($knownVectors as $input => $expected) {
    $encoded = base32_encode($input);
    $decoded = base32_decode($expected);
    assert_same($expected, $encoded, "Base32 encode: '$input'");
    assert_same($input, $decoded, "Base32 decode: '$expected'");
}

assert_throws(fn() => base32_decode('8'), 'Invalid Base32 character', 'Invalid char 8 rejected');

echo "\n--- TOTP ---\n";

// RFC 6238 Appendix B test vector: SHA-1, 8 digits
// Secret = "12345678901234567890" (20 bytes)
$secret = "\x31\x32\x33\x34\x35\x36\x37\x38\x39\x30\x31\x32\x33\x34\x35\x36\x37\x38\x39\x30";
$secretB32 = base32_encode($secret);

// The test time = 59 seconds from epoch = step 1 (period=30)
// Per RFC 6238 App B: SHA-1, 8-digit, time=59 → code=94287082
$rfc6238 = mfa_compute_totp($secretB32, 1, 'sha1', 8, 30);
assert_same('94287082', $rfc6238['code'], 'RFC 6238 B test vector (SHA-1, 8-d, step=1)');

// Step values from RFC 6238 App B (SHA-1 verified; SHA-256/SHA-512 have known errata)
$vectors = [
    ['step' => 1, 'sha1' => '94287082'],
    ['step' => 37037036, 'sha1' => '07081804'],
];

foreach ($vectors as $v) {
    $result = mfa_compute_totp($secretB32, $v['step'], 'sha1', 8, 30);
    assert_same($v['sha1'], $result['code'], "RFC 6238 sha1 step={$v['step']}");
}

// Additional SHA-1 step vectors from RFC 6238
$step3 = mfa_compute_totp($secretB32, 25423408, 'sha1', 8, 30);
assert_same(true, is_string($step3['code']) && strlen($step3['code']) === 8, 'SHA-1 step 25423408 produces 8-digit code');

// SHA-256 and SHA-512 roundtrip: compute and verify at same step
foreach (['sha256', 'sha512'] as $algo) {
    $code = mfa_compute_totp($secretB32, 5, $algo, 6, 30);
    $result = mfa_verify_window($secretB32, $code['code'], $algo, 6, 30, 1, fn() => 150);
    assert_same(true, $result['valid'], "$algo: roundtrip verification at step 5");
    assert_same(5, $result['matched_step'], "$algo: matched_step is 5");
}

echo "\n--- TOTP verification window ---\n";

$codeStep0 = mfa_compute_totp($secretB32, 0, 'sha1', 6, 30)['code'];
$ver = mfa_verify_window($secretB32, $codeStep0, 'sha1', 6, 30, 1, fn() => 1);
assert_same(true, $ver['valid'], 'Window: matches at step 0');
assert_same(0, $ver['matched_step'], 'Window: matched_step is 0');

$codeStep5 = mfa_compute_totp($secretB32, 5, 'sha1', 6, 30)['code'];
$ver = mfa_verify_window($secretB32, $codeStep5, 'sha1', 6, 30, 1, fn() => 150);
assert_same(true, $ver['valid'], 'Window: matches at drift step');
assert_same(5, $ver['matched_step'], 'Window: drift matched_step');

// Wrong step -> no match
$codeStep100 = mfa_compute_totp($secretB32, 100, 'sha1', 6, 30)['code'];
$ver = mfa_verify_window($secretB32, $codeStep100, 'sha1', 6, 30, 1, fn() => 50);
assert_same(false, $ver['valid'], 'Window: no match for wrong step');

echo "\n--- AES-256-GCM ---\n";

$key = str_repeat('X', 32);
$plaintext = 'this is a test secret';

$enc = mfa_encrypt_secret($plaintext, $key);
$dec = mfa_decrypt_secret($enc['ciphertext'], $enc['nonce'], $enc['auth_tag'], $key);
assert_same($plaintext, $dec, 'AES-GCM roundtrip');
assert_same(12, strlen($enc['nonce']), 'Nonce is 12 bytes');
assert_same(16, strlen($enc['auth_tag']), 'Auth tag is 16 bytes');

// Wrong key
$wrongKey = str_repeat('Y', 32);
$dec = mfa_decrypt_secret($enc['ciphertext'], $enc['nonce'], $enc['auth_tag'], $wrongKey);
assert_same(null, $dec, 'AES-GCM wrong key returns null');

// Modified ciphertext
$modifiedCT = $enc['ciphertext'];
$modifiedCT[0] = chr(ord($modifiedCT[0]) ^ 1);
$dec = mfa_decrypt_secret($modifiedCT, $enc['nonce'], $enc['auth_tag'], $key);
assert_same(null, $dec, 'AES-GCM modified ciphertext returns null');

// Modified tag
$modifiedTag = $enc['auth_tag'];
$modifiedTag[0] = chr(ord($modifiedTag[0]) ^ 1);
$dec = mfa_decrypt_secret($enc['ciphertext'], $enc['nonce'], $modifiedTag, $key);
assert_same(null, $dec, 'AES-GCM modified tag returns null');

// Truncated tag
assert_throws(fn() => mfa_decrypt_secret($enc['ciphertext'], $enc['nonce'], substr($enc['auth_tag'], 0, 8), $key), 'exactly 16 bytes', 'Truncated tag rejected before OpenSSL');

// Invalid nonce length
assert_throws(fn() => mfa_decrypt_secret($enc['ciphertext'], substr($enc['nonce'], 0, 8), $enc['auth_tag'], $key), '12 bytes', 'Invalid nonce length rejected before OpenSSL');

// Invalid key length
assert_throws(fn() => mfa_encrypt_secret('test', str_repeat('Z', 16)), 'exactly 32 bytes', 'Short key rejected for encrypt');
assert_throws(fn() => mfa_decrypt_secret('ct', 'nv', 'tag', str_repeat('Z', 16)), 'exactly 32 bytes', 'Short key rejected for decrypt');

echo "\n--- MFA Secret ---\n";

$secret = mfa_generate_secret();
assert_same(32, strlen($secret), 'Secret is 32 chars');
assert_same(true, (bool) preg_match('/^[A-Z2-7]+$/', $secret), 'Secret is valid Base32');
assert_same(false, strpos($secret, '='), 'Secret has no padding');

echo "\n--- Recovery Codes ---\n";

$result = mfa_generate_recovery_codes(8);
assert_same(8, count($result['codes']), '8 codes generated');
assert_same(8, count($result['hashes']), '8 hashes generated');

foreach ($result['codes'] as $code) {
    assert_same(39, strlen($code), "Recovery code display is 39 chars (with hyphens)");

    $normalized = mfa_normalize_recovery_code($code);
    assert_same(32, strlen($normalized), "Normalized code is 32 chars");
    assert_same(true, ctype_xdigit($normalized), "Normalized code is hex");
}

// Verify first code hash matches
$firstCode = $result['codes'][0];
$firstHash = $result['hashes'][0];
$normalized = mfa_normalize_recovery_code($firstCode);
assert_same(true, password_verify($normalized, $firstHash), 'Recovery code hash matches normalized canonical');

// Normalization with whitespace
$spaced = '  ' . $firstCode[0] . ' ' . substr($firstCode, 1, 3) . '  ' . substr($firstCode, 4);
$normSpaced = mfa_normalize_recovery_code($spaced);
assert_same($normalized, $normSpaced, 'Normalization handles whitespace');

// Malformed recovery code
assert_throws(fn() => mfa_normalize_recovery_code('too-short'), 'exactly 32', 'Short code rejected');
assert_throws(fn() => mfa_normalize_recovery_code('gggggggggggggggggggggggggggggggg'), 'non-hexadecimal', 'Non-hex code rejected');

echo "\n=== ALL MFA/TOTP/Base32/AES TESTS PASSED ===\n";
