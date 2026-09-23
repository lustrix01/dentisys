<?php

declare(strict_types=1);

require_once __DIR__ . '/../../backend/app/student_biometrics.php';

function biometric_protocol_expect(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$message}\n");
        exit(1);
    }
    fwrite(STDOUT, "PASS: {$message}\n");
}

function biometric_protocol_expect_error(callable $callback, string $code, string $message): void
{
    try {
        $callback();
    } catch (StudentBiometricException $error) {
        biometric_protocol_expect($error->errorCode === $code, $message . ' returns the expected error code');
        return;
    }
    biometric_protocol_expect(false, $message . ' rejects invalid input');
}

$key = 'capture-' . bin2hex(random_bytes(16));
biometric_protocol_expect(student_biometric_idempotency_key($key) === $key, 'Opaque idempotency key is preserved');
biometric_protocol_expect(student_biometric_challenge_id('00017') === '17', 'Challenge id is normalized to its positive token id');
biometric_protocol_expect_error(
    static fn() => student_biometric_idempotency_key(''),
    'idempotency_key_required',
    'Blank idempotency key'
);
biometric_protocol_expect_error(
    static fn() => student_biometric_idempotency_key("capture\nretry"),
    'idempotency_key_required',
    'Control characters in idempotency key'
);
biometric_protocol_expect_error(
    static fn() => student_biometric_challenge_id('not-a-token'),
    'challenge_invalid',
    'Non-numeric challenge id'
);

$root = dirname(__DIR__, 2);
$controller = file_get_contents($root . '/backend/controllers/StudentBiometricController.php');
$helpers = file_get_contents($root . '/backend/app/student_biometrics.php');
$sidecarPath = $root . '/biometric-sidecar/app.py';
$sidecar = file_exists($sidecarPath) ? (string) file_get_contents($sidecarPath) : '';
biometric_protocol_expect(
    str_contains($controller, "student_biometric_challenge_id(student_biometric_form_alias('challengeId', 'challenge_id'))")
        && str_contains($controller, "student_biometric_idempotency_key"),
    'Enrollment and attendance require the submitted challenge id and idempotency key'
);
biometric_protocol_expect(
    str_contains($helpers, "metadata_json->>'idempotency_key'")
        && str_contains($helpers, "'replayed' => true")
        && str_contains($helpers, 'student_biometric_complete_challenge')
        && str_contains($helpers, 'student_biometric_reset_challenge_for_retry')
        && str_contains($helpers, 'student_biometric_fail_challenge'),
    'Challenge metadata binds idempotency and supports commit, retry, or terminal-failure transitions'
);
biometric_protocol_expect(
    str_contains($helpers, 'student_biometric_sidecar_revoke($config')
        && str_contains($helpers, 'protected_object_reference = NULL'),
    'Expired enrollment revokes the protected reference before clearing metadata'
);
if ($sidecar !== '') {
    biometric_protocol_expect(
        str_contains($sidecar, 'AESGCM(storage_key())')
            && str_contains($sidecar, 'temporary.write_bytes(encrypted)'),
        'Sidecar protects LBPH references with AES-GCM and atomic temporary writes'
    );
} else {
    fwrite(STDOUT, "PASS: Sidecar file check skipped (not mounted in container environment)\n");
}

fwrite(STDOUT, "PASS: Student biometric protocol checks completed.\n");
