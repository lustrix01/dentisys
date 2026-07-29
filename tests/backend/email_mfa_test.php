<?php

declare(strict_types=1);

require_once __DIR__ . '/../../backend/app/config.php';
require_once __DIR__ . '/../../backend/app/email_mfa.php';

function assert_email_mfa(bool $condition, string $label): void
{
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$label}\n");
        exit(1);
    }
    echo "PASS: {$label}\n";
}

$config = [
    'mfa' => [
        'email_otp_hmac_key_b64' => base64_encode(str_repeat('K', 32)),
    ],
];
$jti = str_repeat('a', 32);
$first = email_mfa_code_hash($config, $jti, '123456');
$same = email_mfa_code_hash($config, $jti, '123456');
$otherCode = email_mfa_code_hash($config, $jti, '654321');
$otherJti = email_mfa_code_hash($config, str_repeat('b', 32), '123456');

assert_email_mfa(hash_equals($first, $same), 'Email-code HMAC is deterministic for verification');
assert_email_mfa(!hash_equals($first, $otherCode), 'Different code produces different HMAC');
assert_email_mfa(!hash_equals($first, $otherJti), 'Challenge JTI is bound into HMAC');
assert_email_mfa(!str_contains($first, '123456'), 'Plaintext code is not present in stored HMAC');
assert_email_mfa(email_mfa_mask_address('faculty@bicol-u.edu.ph') === 'fa*****@bicol-u.edu.ph', 'Canonical address is masked');

echo "ALL EMAIL MFA UNIT TESTS PASSED\n";
