<?php

declare(strict_types=1);

// Backlog 12.2 face enrolment flags, DB-free checks (docs/contracts/face-reenrolment.md). The database behaviour is in
// tests/database/face_flags_integration.php.
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
$sweep = (string) file_get_contents($root . 'backend/bin/expire-biometrics.php');
$sidecarPath = $root . 'biometric-sidecar/app.py'; // not mounted in the check container
$sidecar = file_exists($sidecarPath) ? (string) file_get_contents($sidecarPath) : '';
$migration = (string) file_get_contents($root . 'database/migrations/063_face_enrolment_flags.sql');

foreach ([['GET', '/api/admin/face-flags'], ['POST', '/api/admin/face-flags/dismiss']] as [$method, $path]) {
    assert_face_flags(str_contains($routes, "['method' => '{$method}', 'path' => '{$path}', 'handler' => 'handle_admin_face_flags']"), "{$method} {$path} is registered");
}
foreach (['face_flag_raised', 'face_flag_dismissed'] as $code) {
    $info = audit_catalogue()[$code] ?? null;
    assert_face_flags($info !== null && $info[1] === AUDIT_AREA_BIOMETRICS && $info[2] === true, "{$code} is a Dean-visible Biometrics code");
}
assert_face_flags(str_contains($migration, "CHECK (kind IN ('F1', 'F2'))") && str_contains($migration, "CHECK (status IN ('open', 'dismissed', 'revoked'))"), 'Migration 063 limits kind and status');
assert_face_flags(preg_match('/^\s+(score|template)/mi', $migration) === 0, 'The flag table has no score or template column');
// A flag never blocks: the raise step runs in a savepoint and swallows its own failure; the Student response never mentions flags.
assert_face_flags(str_contains($flags, 'SAVEPOINT face_flags') && str_contains($flags, 'ROLLBACK TO SAVEPOINT face_flags'), 'A failing flag step rolls back to a savepoint instead of failing the enrolment');
assert_face_flags(!str_contains($student, 'face_flags_list') && !str_contains(strtolower((string) file_get_contents($root . 'backend/app/student_biometrics.php')), 'flag'), 'The Student side never reads or returns flags');
assert_face_flags(str_contains($student, "'previousReference'") && str_contains($student, "\$sidecar['matchesPrevious']"), 'The enrolment passes the current reference and reads matchesPrevious');
assert_face_flags($sidecar === '' || str_contains($sidecar, '"matchesPrevious": matches_previous') && !preg_match('/logger\.\w+\([^)]*previous/', $sidecar), 'The sidecar returns matchesPrevious only, no score and no log of it');
assert_face_flags(str_contains($sweep, 'student_biometric_expiry_due') && str_contains($sweep, "'expired'"), 'The sweep expires enrollments at term end again');
echo "PASS: Face flag contract checks completed.\n";
