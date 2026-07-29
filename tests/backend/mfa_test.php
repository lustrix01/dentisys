<?php

declare(strict_types=1);

require_once __DIR__ . '/../../backend/vendor/autoload.php';
require_once __DIR__ . '/../../backend/app/mfa.php';

function assert_same(mixed $expected, mixed $actual, string $label): void
{
    if ($expected !== $actual) {
        fwrite(STDERR, "FAIL: {$label}\nExpected: " . var_export($expected, true) . "\nActual: " . var_export($actual, true) . "\n");
        exit(1);
    }
    echo "PASS: {$label}\n";
}

function assert_throws(callable $fn, string $needle, string $label): void
{
    try {
        $fn();
        fwrite(STDERR, "FAIL: {$label} -- expected exception\n");
        exit(1);
    } catch (Throwable $e) {
        if (!str_contains($e->getMessage(), $needle)) {
            fwrite(STDERR, "FAIL: {$label} -- {$e->getMessage()}\n");
            exit(1);
        }
    }
    echo "PASS: {$label}\n";
}

echo "=== Vendor-backed authenticator tests ===\n";

$secret = mfa_generate_secret();
assert_same(32, strlen($secret), '160-bit Base32 secret contains 32 symbols');
assert_same(true, (bool) preg_match('/^[A-Z2-7]+$/', $secret), 'Secret is valid unpadded Base32');

$payload = mfa_provisioning_payload('faculty+clinic@bicol-u.edu.ph', $secret);
assert_same(true, str_starts_with($payload['provisioning_uri'], 'otpauth://totp/'), 'Provisioning URI uses otpauth TOTP');
$query = [];
parse_str((string) parse_url($payload['provisioning_uri'], PHP_URL_QUERY), $query);
assert_same($secret, $query['secret'] ?? null, 'Provisioning URI contains secret');
assert_same('DentiSys', $query['issuer'] ?? null, 'Provisioning URI contains issuer');
assert_same('SHA1', $query['algorithm'] ?? null, 'Provisioning URI uses SHA-1');
assert_same('6', $query['digits'] ?? null, 'Provisioning URI uses six digits');
assert_same('30', $query['period'] ?? null, 'Provisioning URI uses 30-second period');
assert_same(true, str_starts_with($payload['qr_code_data_uri'], 'data:image/svg+xml;base64,'), 'QR is a server-generated SVG data URI');
$svg = base64_decode(substr($payload['qr_code_data_uri'], strlen('data:image/svg+xml;base64,')), true);
assert_same(true, is_string($svg) && str_contains($svg, '<svg'), 'QR data URI contains SVG');

$step = 5;
$code = mfa_compute_totp($secret, $step)['code'];
$verified = mfa_verify_window($secret, $code, 'sha1', 6, 30, 1, static fn(): int => $step * 30);
assert_same(true, $verified['valid'], 'Current TOTP verifies');
assert_same($step, $verified['matched_step'], 'Matched time slice is reported');

$previousCode = mfa_compute_totp($secret, $step - 1)['code'];
$adjacent = mfa_verify_window($secret, $previousCode, 'sha1', 6, 30, 1, static fn(): int => $step * 30);
assert_same(true, $adjacent['valid'], 'One adjacent time slice is accepted');
assert_same($step - 1, $adjacent['matched_step'], 'Adjacent matched slice is reported');

$outsideCode = mfa_compute_totp($secret, $step - 2)['code'];
$outside = mfa_verify_window($secret, $outsideCode, 'sha1', 6, 30, 1, static fn(): int => $step * 30);
assert_same(false, $outside['valid'], 'Code outside adjacent window is rejected');
assert_throws(
    static fn() => mfa_compute_totp($secret, $step, 'sha256', 6, 30),
    'SHA-1',
    'Non-standard credential parameters are rejected'
);

$key = str_repeat('X', 32);
$encrypted = mfa_encrypt_secret($secret, $key);
assert_same($secret, mfa_decrypt_secret($encrypted['ciphertext'], $encrypted['nonce'], $encrypted['auth_tag'], $key), 'AES-GCM secret roundtrip');
assert_same(null, mfa_decrypt_secret($encrypted['ciphertext'], $encrypted['nonce'], $encrypted['auth_tag'], str_repeat('Y', 32)), 'Wrong encryption key fails closed');

$recovery = mfa_generate_recovery_codes(8);
assert_same(8, count($recovery['codes']), 'Eight recovery codes generated');
$normalized = mfa_normalize_recovery_code($recovery['codes'][0]);
assert_same(true, password_verify($normalized, $recovery['hashes'][0]), 'Recovery code hashes verify');
assert_throws(static fn() => mfa_normalize_recovery_code('too-short'), 'exactly 32', 'Malformed recovery code rejected');

echo "=== ALL VENDOR-BACKED AUTHENTICATOR TESTS PASSED ===\n";
