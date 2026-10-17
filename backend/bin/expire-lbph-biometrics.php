<?php

declare(strict_types=1);

/*
 * BIO-007 cleanup sweep. Deletes legacy LBPH references after the switch to
 * YuNet/SFace so Students can re-enroll with the current face-verification model.
 * Consent is kept so the Student can re-enroll. Recorded attendance is untouched.
 *
 * Usage (inside the web container):
 *   docker compose exec web php /var/www/html/backend/bin/expire-lbph-biometrics.php --dry-run
 *   docker compose exec web php /var/www/html/backend/bin/expire-lbph-biometrics.php
 */

require __DIR__ . '/../app/bootstrap.php';

$dryRun = in_array('--dry-run', $argv, true);
$config = app_config();
$pdo = create_pdo($config);

$systemActor = [
    'user_id' => null,
    'login_email' => null,
    'role' => 'system',
    'display_name' => 'LBPH biometric expiry sweep',
    'session_id' => null,
];
$context = [
    'request_id' => 'expire-lbph-biometrics-' . uuid_v4_string(),
    'ip_address' => null,
    'user_agent' => 'backend/bin/expire-lbph-biometrics.php',
    'http_method' => 'CLI',
    'endpoint' => 'bin/expire-lbph-biometrics.php',
    'operation_uuid' => uuid_v4_string(),
];

$candidates = $pdo->prepare(
    "SELECT bp.student_id, s.student_number
       FROM biometric_profiles bp
       JOIN students s ON s.student_id = bp.student_id
      WHERE bp.enrollment_status IN ('active', 'enrolling')
        AND bp.protected_object_reference LIKE 'lbph/%'
      ORDER BY bp.student_id"
);
$candidates->execute();
$rows = $candidates->fetchAll(PDO::FETCH_ASSOC);

$done = 0;
$wouldDelete = 0;
$failed = 0;
foreach ($rows as $row) {
    $studentId = (int) $row['student_id'];
    $label = sprintf('%s (student #%d)', $row['student_number'], $studentId);
    $why = 'face-verification model changed; re-enrollment is required';
    if ($dryRun) {
        $wouldDelete++;
        echo "WOULD DELETE: {$label}: {$why}\n";
        continue;
    }
    $pdo->beginTransaction();
    try {
        academic_terms_lock($pdo);
        $profile = student_biometric_profile($pdo, $studentId, true);
        if ($profile === null
            || !in_array((string) $profile['enrollment_status'], ['active', 'enrolling'], true)
            || !str_starts_with((string) ($profile['protected_object_reference'] ?? ''), 'lbph/')) {
            $pdo->commit();
            continue;
        }
        $invalidated = student_biometric_invalidate(
            $pdo, $config, $systemActor, $context, $studentId,
            'expired',
            'biometric_enrollment_expired',
            'Biometric enrollment expired because the face-verification model changed; re-enrollment is required.',
            $why
        );
        $pdo->commit();
        if (!$invalidated) {
            continue;
        }
        $done++;
        echo "DELETED: {$label}: {$why}\n";
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        $failed++;
        fwrite(STDERR, "FAILED: {$label}: " . $e->getMessage() . "\n");
    }
}

echo $dryRun
    ? sprintf("%d biometric reference(s) would be deleted.\n", $wouldDelete)
    : sprintf("Deleted %d biometric reference(s); %d failed.\n", $done, $failed);
exit($failed > 0 ? 1 : 0);
