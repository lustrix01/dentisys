<?php

declare(strict_types=1);

// Backlog 12.2 & 12.9 face enrolment flags and revocation approval (docs/contracts/face-reenrolment.md, docs/contracts/face-revoke-approval.md).
// The database behaviour is in tests/database/face_flags_integration.php.
require_once __DIR__ . '/../../backend/app/audit_catalogue.php';

function assert_face_flags(bool $condition, string $label): void
{
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$label}\n");
        exit(1);
    }
    echo "PASS: {$label}\n";
}

$root = __DIR__ . '/../../';
$routes = (string) file_get_contents($root . 'backend/routes/api.php');
$flags = (string) file_get_contents($root . 'backend/app/face_flags.php');
$student = (string) file_get_contents($root . 'backend/controllers/StudentBiometricController.php');
$studentHelpers = (string) file_get_contents($root . 'backend/app/student_biometrics.php');
$sweep = (string) file_get_contents($root . 'backend/bin/expire-biometrics.php');
$sidecarPath = $root . 'biometric-sidecar/app.py'; // not mounted in the check container
$sidecar = file_exists($sidecarPath) ? (string) file_get_contents($sidecarPath) : '';
$migration063 = (string) file_get_contents($root . 'database/migrations/063_face_enrolment_flags.sql');
$migration072 = (string) file_get_contents($root . 'database/migrations/072_face_revoke_requests.sql');

foreach ([['GET', '/api/admin/face-flags'], ['POST', '/api/admin/face-flags/dismiss']] as [$method, $path]) {
    assert_face_flags(str_contains($routes, "['method' => '{$method}', 'path' => '{$path}', 'handler' => 'handle_admin_face_flags']"), "{$method} {$path} is registered");
}
foreach ([
    ['GET', '/api/admin/face-revoke-requests', 'handle_admin_face_revoke_requests'],
    ['POST', '/api/admin/face-revoke-requests/approve', 'handle_admin_face_revoke_request_approve'],
    ['POST', '/api/admin/face-revoke-requests/reject', 'handle_admin_face_revoke_request_reject'],
    ['POST', '/api/student/biometric/revoke-request', 'handle_student_biometric_revoke_request_create'],
    ['POST', '/api/student/biometrics/revoke-request', 'handle_student_biometric_revoke_request_create'],
    ['DELETE', '/api/student/biometric/revoke-request', 'handle_student_biometric_revoke_request_cancel'],
    ['DELETE', '/api/student/biometrics/revoke-request', 'handle_student_biometric_revoke_request_cancel'],
    ['DELETE', '/api/student/biometric/profile', 'handle_student_biometric_revoke'],
    ['DELETE', '/api/student/biometrics', 'handle_student_biometric_revoke'],
    ['GET', '/api/student/biometrics', 'handle_student_biometric_profile_get'],
    ['POST', '/api/student/biometrics/enrollment', 'handle_student_biometric_enrollment'],
] as [$method, $path, $handler]) {
    assert_face_flags(
        preg_match("/'method' => '" . preg_quote($method, '/') . "',\s*'path' => '" . preg_quote($path, '/') . "',\s*'handler' => '" . preg_quote($handler, '/') . "'/", $routes) === 1,
        "{$method} {$path} is registered to {$handler}"
    );
}
foreach ([
    'face_flag_raised',
    'face_flag_dismissed',
    'biometric_revoke_requested',
    'biometric_revoke_request_cancelled',
    'biometric_revoke_request_approved',
    'biometric_revoke_request_rejected',
] as $code) {
    $info = audit_catalogue()[$code] ?? null;
    assert_face_flags($info !== null && $info[1] === AUDIT_AREA_BIOMETRICS && $info[2] === true, "{$code} is a Superadmin-visible Biometrics code");
}
assert_face_flags(str_contains($migration063, "CHECK (kind IN ('F1', 'F2'))") && str_contains($migration063, "CHECK (status IN ('open', 'dismissed', 'revoked'))"), 'Migration 063 limits kind and status');
assert_face_flags(preg_match('/^\s+(score|template)/mi', $migration063) === 0, 'The flag table has no score or template column');
assert_face_flags(
    str_contains($migration072, "CHECK (kind IN ('F1', 'F2', 'F3'))")
        && str_contains($migration072, 'CREATE TABLE face_revoke_requests')
        && str_contains($migration072, 'CHECK (char_length(trim(reason)) BETWEEN 8 AND 240)')
        && str_contains($migration072, "CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled'))")
        && str_contains($migration072, 'face_revoke_requests_one_pending_idx')
        && str_contains($migration072, 'face_revoke_requests_term_approved_idx'),
    'Migration 072 expands flag kind to F1/F2/F3 and creates face_revoke_requests with indexes'
);
assert_face_flags(preg_match('/^\s+(score|template)/mi', $migration072) === 0, 'The revoke request table has no score or template column');
// A flag never blocks: the raise step runs in a savepoint and swallows its own failure; the Student response never mentions flags.
assert_face_flags(str_contains($flags, 'SAVEPOINT face_flags') && str_contains($flags, 'ROLLBACK TO SAVEPOINT face_flags'), 'A failing flag step rolls back to a savepoint instead of failing the enrolment');
assert_face_flags(!str_contains($student, 'face_flags_list') && !str_contains(strtolower($studentHelpers), 'flag'), 'The Student side never reads or returns flags');
assert_face_flags(str_contains($student, "'previousReference'") && str_contains($student, "\$sidecar['matchesPrevious']"), 'The enrolment passes the current reference and reads matchesPrevious');
assert_face_flags(
    str_contains($student, "'revocation_approval_required'")
        && str_contains($student, "'face_update_mismatch'")
        && str_contains($student, 'Your face could not be matched to your current registration. If this is you, please request a revocation instead.'),
    'Student direct delete requires approval and mismatched update returns 409 face_update_mismatch'
);
assert_face_flags(
    !str_contains(substr($flags, (int) strpos($flags, 'function face_flags_after_enrolment'), 900), "'F1'")
        && str_contains($flags, "'F2'")
        && str_contains($flags, "'F3'")
        && str_contains($flags, 'face_revoke_request_approve')
        && str_contains($flags, 'face_revoke_request_reject'),
    'F1 creation is retired while F2, F3, and revoke request approve/reject helpers exist'
);
assert_face_flags(
    substr_count($studentHelpers, 'student_biometric_cancel_pending_revoke_request(') >= 2,
    'Expiry and invalidation auto-cancel pending face revocation requests'
);
assert_face_flags($sidecar === '' || str_contains($sidecar, '"matchesPrevious": matches_previous') && !preg_match('/logger\.\w+\([^)]*previous/', $sidecar), 'The sidecar returns matchesPrevious only, no score and no log of it');
assert_face_flags(str_contains($sweep, 'student_biometric_expiry_due') && str_contains($sweep, "'expired'"), 'The sweep expires enrollments at term end again');
echo "PASS: Face flag contract checks completed.\n";
