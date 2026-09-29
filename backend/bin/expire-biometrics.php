<?php

declare(strict_types=1);

/*
 * BIO-005 cleanup sweep. Deletes usable biometric references that must no
 * longer exist:
 *   - the enrollment's semester validity has ended (status becomes expired);
 *   - the Student is no longer active (status becomes revoked).
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
$today = app_local_date($config, attendance_session_now_utc());

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
];

$candidates = $pdo->prepare(
    "SELECT bp.student_id, s.student_number, bp.reference_expires_on,
            LOWER(COALESCE(s.status, '')) <> 'active' AS student_inactive
       FROM biometric_profiles bp
       JOIN students s ON s.student_id = bp.student_id
      WHERE bp.enrollment_status IN ('active', 'enrolling')
        AND (LOWER(COALESCE(s.status, '')) <> 'active'
             OR (bp.reference_expires_on IS NOT NULL AND bp.reference_expires_on < ?))
      ORDER BY bp.student_id"
);
$candidates->execute([$today]);
$rows = $candidates->fetchAll(PDO::FETCH_ASSOC);

$done = 0;
$failed = 0;
foreach ($rows as $row) {
    $inactive = in_array($row['student_inactive'], [true, 't', '1', 1], true);
    $label = sprintf('%s (student #%d)', $row['student_number'], (int) $row['student_id']);
    $why = $inactive ? 'Student is not active' : "validity ended {$row['reference_expires_on']}";
    if ($dryRun) {
        echo "WOULD DELETE: {$label}: {$why}\n";
        continue;
    }
    $pdo->beginTransaction();
    try {
        student_biometric_invalidate(
            $pdo, $config, $systemActor, $context, (int) $row['student_id'],
            $inactive ? 'revoked' : 'expired',
            $inactive ? 'biometric_enrollment_revoked_inactive' : 'biometric_enrollment_expired',
            $inactive
                ? 'Biometric enrollment deleted because the Student is no longer active.'
                : 'Biometric enrollment expired at the end of its academic validity period.',
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
    ? sprintf("%d biometric reference(s) would be deleted.\n", count($rows))
    : sprintf("Deleted %d biometric reference(s); %d failed.\n", $done, $failed);
exit($failed > 0 ? 1 : 0);
