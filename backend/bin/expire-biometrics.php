<?php

declare(strict_types=1);

/*
 * BIO-005 cleanup sweep. Deletes the usable biometric references of Students who
 * are no longer active (status becomes revoked). Enrollments do not expire at the
 * end of a term (backlog 12.2).
 * Each deletion goes through the biometric sidecar and is audited; consent is
 * kept so the Student can re-enroll. Recorded attendance is never touched.
 *
 * start-dev.ps1 runs it; an operator can also schedule it.
 *
 * Usage (inside the web container):
 *   docker compose exec web php /var/www/html/backend/bin/expire-biometrics.php --dry-run
 *   docker compose exec web php /var/www/html/backend/bin/expire-biometrics.php
 */

require __DIR__ . '/../app/bootstrap.php';

$dryRun = in_array('--dry-run', $argv, true);
$config = app_config();
$pdo = create_pdo($config);

$systemActor = [
    'user_id' => null,
    'login_email' => null,
    'role' => 'system',
    'display_name' => 'Biometric expiry sweep',
    'session_id' => null,
];
$context = [
    'request_id' => 'expire-biometrics-' . uuid_v4_string(),
    'ip_address' => null,
    'user_agent' => 'backend/bin/expire-biometrics.php',
    'http_method' => 'CLI',
    'endpoint' => 'bin/expire-biometrics.php',
    'operation_uuid' => uuid_v4_string(),
];

$candidates = $pdo->prepare(
    "SELECT bp.student_id, s.student_number
       FROM biometric_profiles bp
       JOIN students s ON s.student_id = bp.student_id
      WHERE bp.enrollment_status IN ('active', 'enrolling')
        AND LOWER(COALESCE(s.status, '')) <> 'active'
      ORDER BY bp.student_id"
);
$candidates->execute();
$rows = $candidates->fetchAll(PDO::FETCH_ASSOC);

$done = 0;
$wouldDelete = 0;
$failed = 0;
foreach ($rows as $row) {
    $label = sprintf('%s (student #%d)', $row['student_number'], (int) $row['student_id']);
    $why = 'Student is not active';
    if ($dryRun) {
        $wouldDelete++;
        echo "WOULD DELETE: {$label}: {$why}\n";
        continue;
    }
    $pdo->beginTransaction();
    try {
        academic_terms_lock($pdo);
        student_biometric_invalidate(
            $pdo, $config, $systemActor, $context, (int) $row['student_id'],
            'revoked', 'biometric_enrollment_revoked_inactive',
            'Biometric enrollment deleted because the Student is no longer active.',
            $why
        );
        $pdo->commit();
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
