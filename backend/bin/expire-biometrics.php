<?php

declare(strict_types=1);

/*
 * BIO-005 cleanup sweep. Deletes usable biometric references that must no
 * longer exist:
 *   - the enrollment's term validity has ended (status becomes expired);
 *   - the Student is no longer active (status becomes revoked).
 * It also stores the resolved term end on an active or enrolling profile that has
 * no expiry date yet (faces enrolled while enrollments did not expire), so the
 * profile shows a date and follows Dean term edits. That backfill is not audited.
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
    'operation_uuid' => uuid_v4_string(),
];

$candidates = $pdo->prepare(
    "SELECT bp.student_id, s.student_number, bp.reference_expires_on,
            LOWER(COALESCE(s.status, '')) <> 'active' AS student_inactive
       FROM biometric_profiles bp
       JOIN students s ON s.student_id = bp.student_id
      WHERE bp.enrollment_status IN ('active', 'enrolling')
      ORDER BY bp.student_id"
);
$candidates->execute();
$rows = $candidates->fetchAll(PDO::FETCH_ASSOC);

$done = 0;
$wouldDelete = 0;
$dated = 0;
$failed = 0;
foreach ($rows as $row) {
    $inactive = in_array($row['student_inactive'], [true, 't', '1', 1], true);
    $label = sprintf('%s (student #%d)', $row['student_number'], (int) $row['student_id']);
    if (!$inactive && !student_biometric_expiry_due($pdo, (int) $row['student_id'], $row['reference_expires_on'], $today)) {
        if ($row['reference_expires_on'] === null) {
            $latest = academic_latest_term_end(academic_student_term_dates($pdo, (int) $row['student_id']));
            if ($latest !== null) {
                if ($dryRun) {
                    echo "WOULD DATE: {$label}: {$latest['endDate']}\n";
                    continue;
                }
                $pdo->beginTransaction();
                try {
                    academic_terms_lock($pdo);
                    $profile = student_biometric_profile($pdo, (int) $row['student_id'], true);
                    $latest = academic_latest_term_end(academic_student_term_dates($pdo, (int) $row['student_id']));
                    if ($profile !== null && $profile['reference_expires_on'] === null
                        && in_array($profile['enrollment_status'], ['active', 'enrolling'], true) && $latest !== null) {
                        $pdo->prepare('UPDATE biometric_profiles SET reference_expires_on = ?, reference_term_id = ?, reference_cs_id = ?, updated_at = CURRENT_TIMESTAMP(6) WHERE profile_id = ?')
                            ->execute([$latest['endDate'], $latest['termId'], $latest['cs_id'], (int) $profile['profile_id']]);
                        $dated++;
                        echo "DATED: {$label}: {$latest['endDate']}\n";
                    }
                    $pdo->commit();
                } catch (Throwable $e) {
                    if ($pdo->inTransaction()) {
                        $pdo->rollBack();
                    }
                    $failed++;
                    fwrite(STDERR, "FAILED: {$label}: " . $e->getMessage() . "\n");
                }
            }
        }
        continue;
    }
    $why = $inactive ? 'Student is not active' : "validity ended {$row['reference_expires_on']}";
    if ($dryRun) {
        $wouldDelete++;
        echo "WOULD DELETE: {$label}: {$why}\n";
        continue;
    }
    $pdo->beginTransaction();
    try {
        academic_terms_lock($pdo);
        $profile = student_biometric_profile($pdo, (int) $row['student_id'], true);
        if (!$inactive && ($profile === null || !student_biometric_expiry_due($pdo, (int) $row['student_id'], $profile['reference_expires_on'], $today))) {
            $pdo->commit();
            continue;
        }
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
    ? sprintf("%d biometric reference(s) would be deleted.\n", $wouldDelete)
    : sprintf("Deleted %d biometric reference(s); %d failed.\n", $done, $failed);
exit($failed > 0 ? 1 : 0);
