<?php

declare(strict_types=1);

function expire_lbph_expect(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$message}\n");
        exit(1);
    }
    fwrite(STDOUT, "PASS: {$message}\n");
}

$command = file_get_contents(dirname(__DIR__, 2) . '/backend/bin/expire-lbph-biometrics.php');
expire_lbph_expect(is_string($command), 'LBPH expiry command source is available');
expire_lbph_expect(
    str_contains($command, "enrollment_status IN ('active', 'enrolling')")
        && str_contains($command, "protected_object_reference LIKE 'lbph/%'"),
    'Expiry selects only active or enrolling legacy LBPH references'
);
expire_lbph_expect(
    str_contains($command, 'student_biometric_profile($pdo, $studentId, true)')
        && str_contains($command, "str_starts_with((string) (\$profile['protected_object_reference'] ?? ''), 'lbph/')"),
    'Expiry re-reads the locked profile and skips references that have changed'
);
expire_lbph_expect(
    str_contains($command, 'student_biometric_invalidate(')
        && str_contains($command, "            'expired',")
        && str_contains($command, "            'biometric_enrollment_expired',"),
    'Expiry invalidates old enrollments with the existing expired audit action'
);
expire_lbph_expect(
    str_contains($command, "in_array('--dry-run', \$argv, true)")
        && str_contains($command, 'WOULD DELETE:'),
    'Expiry supports a non-mutating dry run'
);

fwrite(STDOUT, "PASS: LBPH biometric expiry checks completed.\n");
