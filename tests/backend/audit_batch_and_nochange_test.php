<?php

declare(strict_types=1);

// SEC-005 R3 (no-change), R7 (readable descriptions), R12 (batch id): helper behaviour plus source contract.

require __DIR__ . '/../../backend/app/audit.php';

function assert_batch(bool $condition, string $label): void
{
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$label}\n");
        exit(1);
    }
    echo "PASS: {$label}\n";
}

function batch_src(string $relative): string
{
    $source = file_get_contents(__DIR__ . '/../../' . $relative);
    if ($source === false) {
        fwrite(STDERR, "FAIL: cannot read {$relative}\n");
        exit(1);
    }
    return $source;
}

assert_batch(audit_changed_fields(['a' => 1, 'b' => 'x'], ['a' => 1, 'b' => 'x']) === null, 'identical states report no change');
assert_batch(audit_changed_fields(['a' => '08:00', 'n' => null], ['a' => '08:00', 'n' => null]) === null, 'null-to-null is no change');
assert_batch(audit_changed_fields(['a' => 1, 'b' => 'x'], ['a' => 2, 'b' => 'x']) === [['a' => 1], ['a' => 2]], 'only the changed field is kept');
assert_batch(audit_changed_fields(['n' => null], ['n' => '0']) === [['n' => null], ['n' => '0']], 'null to "0" is a change');
assert_batch(audit_changed_fields(['m' => [['d' => 1]]], ['m' => [['d' => 1]]]) === null, 'equal nested arrays are no change');

$audit = batch_src('backend/app/audit.php');
assert_batch(str_contains($audit, "request_header('X-Audit-Batch-Id')") && str_contains($audit, 'strtolower($batch)'), 'batch id is read centrally from X-Audit-Batch-Id and lowercased');

$bio = batch_src('backend/app/student_biometrics.php');
assert_batch(str_contains($bio, "'operation_uuid' => \$context['operation_uuid'] ?? null"), 'biometric audit rows carry the context batch id');
foreach (['backend/bin/expire-biometrics.php', 'backend/bin/expire-lbph-biometrics.php'] as $job) {
    assert_batch(str_contains(batch_src($job), "'operation_uuid' => uuid_v4_string()"), "{$job} uses one batch id per run");
}

foreach ([
    'backend/controllers/StudentBiometricController.php' => "\$before['consent_status'] !== \$row['consent_status']",
    'backend/controllers/FacultyController.php' => 'audit_changed_fields($before, $after)',
    'backend/controllers/AdminController.php' => 'audit_changed_fields(',
    'backend/app/academic_year.php' => 'audit_changed_fields(',
    'backend/app/attendance_sessions.php' => 'audit_changed_fields($before, $after)',
    'backend/controllers/FacultyInvitationController.php' => 'audit_changed_fields(',
] as $file => $needle) {
    assert_batch(str_contains(batch_src($file), $needle), "{$file} skips the audit row when nothing changed");
}
assert_batch(str_contains(batch_src('backend/controllers/FacultyController.php'), 'audit_changed_fields($cmpBefore, $cmpAfter)'), 'class update compares before and after');

foreach (['backend/controllers/FacultyController.php', 'backend/controllers/SecretaryController.php', 'backend/app/attendance_sessions.php'] as $file) {
    $src = batch_src($file);
    assert_batch(!str_contains($src, 'for class section #'), "{$file} descriptions name the class, not 'class section #id'");
}
assert_batch(!str_contains(batch_src('backend/controllers/FacultyController.php'), 'enrollment #{$enrollmentId} recorded'), 'remedial description names student and class');
