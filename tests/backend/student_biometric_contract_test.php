<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/backend/app/config.php';
require_once dirname(__DIR__, 2) . '/backend/app/validation.php';
require_once dirname(__DIR__, 2) . '/backend/app/audit.php';
require_once dirname(__DIR__, 2) . '/backend/app/attendance_sessions.php';
require_once dirname(__DIR__, 2) . '/backend/app/student_biometrics.php';

function biometric_expect_true(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$message}\n");
        exit(1);
    }
    fwrite(STDOUT, "PASS: {$message}\n");
}

function biometric_expect_same(mixed $expected, mixed $actual, string $message): void
{
    biometric_expect_true($expected === $actual, $message . ' (expected ' . var_export($expected, true) . ', got ' . var_export($actual, true) . ')');
}

$config = app_config([
    'APP_ENV' => 'test',
    'APP_TIMEZONE' => 'Asia/Manila',
    'BIOMETRIC_CHALLENGE_TTL_SECONDS' => 120,
]);
$session = [
    'status' => 'active',
    'session_date' => '2026-09-22',
    'opening_time' => '08:00:00',
    'present_cutoff_time' => '09:00:00',
    'late_cutoff_time' => '12:00:00',
];

$boundary = attendance_session_timing_decision($session, new DateTimeImmutable('2026-09-21 23:59:59', new DateTimeZone('UTC')), $config);
biometric_expect_same('attendance_not_open', $boundary['code'], 'Asia/Manila opening boundary is not evaluated using the UTC calendar date');

$opening = attendance_session_timing_decision($session, new DateTimeImmutable('2026-09-22 00:00:00', new DateTimeZone('UTC')), $config);
biometric_expect_true($opening['allowed'] === true, 'Asia/Manila opening time accepts attendance when UTC is still the same absolute instant');
biometric_expect_same('present', $opening['status'], 'Attendance before the Present cutoff is Present');

$late = attendance_session_timing_decision($session, new DateTimeImmutable('2026-09-22 01:00:00', new DateTimeZone('UTC')), $config);
biometric_expect_same('late', $late['status'], 'Attendance at the Present cutoff is Late');

$closed = attendance_session_timing_decision($session, new DateTimeImmutable('2026-09-22 04:00:00', new DateTimeZone('UTC')), $config);
biometric_expect_same('attendance_capture_closed', $closed['code'], 'Attendance at the Late cutoff is closed');

$mapped = attendance_session_map([
    'session_id' => 7,
    'cs_id' => 11,
    'cs_name' => 'CLIN301-Sec-A',
    'block' => 'A',
    'course_id' => 3,
    'course_code' => 'CLIN301',
    'course_name' => 'Clinical Practice',
    'instructor_name' => 'Faculty',
    'session_date' => '2026-09-22',
    'session_code' => 'TEST-7',
    'room' => 'Room 1',
    'started_at' => '2026-09-22 00:00:00.000000',
    'ended_at' => null,
    'status' => 'active',
    'opening_time' => '08:00:00',
    'present_cutoff_time' => '09:00:00',
    'late_cutoff_time' => '12:00:00',
    'geofence_enabled' => false,
    'geofence_radius_meters' => null,
    'geofence_latitude' => null,
    'geofence_longitude' => null,
    'biometric_required' => true,
    'revoked_at' => null,
    'revocation_reason' => null,
    'created_at' => '2026-09-22 00:00:00.000000',
    'updated_at' => '2026-09-22 00:00:00.000000',
], false);
biometric_expect_true(!array_key_exists('geofenceLatitude', $mapped) && !array_key_exists('geofenceLongitude', $mapped), 'Student session payload does not expose the configured geofence center');
biometric_expect_true(array_key_exists('id', $mapped) && is_int($mapped['id']) && $mapped['id'] === 7, 'Student session payload exposes a numeric id');
biometric_expect_same('08:00', $mapped['openingTime'], 'Session payload exposes the configured opening time');

$payload = student_biometric_payload([
    'consent_status' => 'approved',
    'enrollment_status' => 'active',
    'enrolled_at' => '2026-09-22 00:00:00.000000',
    'reference_expires_on' => '2026-12-31',
    'usable_sample_count' => 20,
], $config);
biometric_expect_true(!array_key_exists('protectedObjectReference', $payload) && !array_key_exists('templateReference', $payload), 'Student biometric profile payload never exposes protected references');
biometric_expect_same('active', $payload['enrollmentStatus'], 'Student biometric profile reports the authoritative enrollment state');
$profileResponse = student_biometric_profile_response([
    'consent_status' => 'approved',
    'enrollment_status' => 'active',
    'enrolled_at' => '2026-09-22 00:00:00.000000',
    'reference_expires_on' => '2026-12-31',
    'usable_sample_count' => 20,
], $config);
foreach (['consentGranted', 'enrollmentStatus', 'enrolledAt', 'expiresAt', 'usableSampleCount', 'requiredUsableSamples', 'manualFallbackAvailable'] as $field) {
    biometric_expect_true(array_key_exists($field, $profileResponse), "Biometric profile response exposes {$field} at top level");
}
biometric_expect_true(!array_key_exists('protectedObjectReference', $profileResponse), 'Biometric profile response does not expose protected references at top level');

$challengeResponse = student_biometric_challenge_response([
    'challengeId' => '17',
    'challengeToken' => 'opaque-token',
    'actions' => ['blink', 'turn_left'],
    'expiresAt' => '2026-09-22T08:02:00.000000Z',
]);
foreach (['challengeId', 'challengeToken', 'actions', 'expiresAt'] as $field) {
    biometric_expect_true(array_key_exists($field, $challengeResponse), "Challenge response exposes {$field} at top level");
}

$presentResponse = student_attendance_record_response(
    'present',
    'recorded',
    'Attendance recorded as Present.',
    ['recordId' => '9', 'status' => 'present', 'verificationMethod' => 'biometric', 'recordedAt' => '2026-09-22T08:01:00.000000Z']
);
biometric_expect_same('present', $presentResponse['status'], 'Biometric attendance response exposes Present status at top level');
biometric_expect_true(isset($presentResponse['message']) && $presentResponse['message'] !== '', 'Biometric attendance response exposes a top-level message');
$alreadyResponse = student_attendance_record_response(
    'already_recorded',
    'already_recorded',
    'Attendance was already recorded for this session.',
    ['recordId' => '9', 'status' => 'present']
);
biometric_expect_same('already_recorded', $alreadyResponse['status'], 'Duplicate biometric attendance response exposes already_recorded status at top level');
$logsResponse = student_attendance_logs_response([['recordId' => '9', 'status' => 'present']], 'Asia/Manila');
biometric_expect_true(isset($logsResponse['records'], $logsResponse['total']) && $logsResponse['total'] === 1, 'Attendance logs response exposes records and total at top level');

$manualTimingAccepted = true;
attendance_session_require_timing_for_biometric(false, null, null, null);
try {
    attendance_session_require_timing_for_biometric(true, null, null, null);
    $manualTimingAccepted = false;
} catch (ValidationException) {
}
biometric_expect_true($manualTimingAccepted, 'Biometric-required sessions reject missing timing while manual sessions remain allowed');

for ($i = 0; $i < 20; $i++) {
    $actions = student_biometric_actions();
    biometric_expect_true(count($actions) === 2 && count(array_unique($actions)) === 2, 'Each liveness challenge has exactly two distinct actions');
}

$auditState = audit_redact_state(['protected_object_reference' => 'lbph/opaque', 'status' => 'active']);
biometric_expect_same('[REDACTED]', $auditState['protected_object_reference'], 'Audit state redacts protected biometric references');

$migration = file_get_contents(dirname(__DIR__, 2) . '/database/migrations/011_student_biometric_attendance.sql');
biometric_expect_true(str_contains($migration, 'opening_time') && str_contains($migration, "status IN ('active', 'ended', 'revoked')"), 'Migration contains session timing and revocation state');
biometric_expect_true(str_contains($migration, 'uq_attendance_records_enrollment_session'), 'Migration enforces one attendance result per enrollment and session');

$routes = file_get_contents(dirname(__DIR__, 2) . '/backend/routes/api.php');
foreach ([
    ['GET', '/api/student/biometric/profile'],
    ['PUT', '/api/student/biometric/consent'],
    ['POST', '/api/student/biometric/liveness/challenge'],
    ['POST', '/api/student/biometric/enrollment'],
    ['DELETE', '/api/student/biometric/profile'],
    ['GET', '/api/student/attendance/sessions/active'],
    ['POST', '/api/student/attendance/biometric'],
    ['GET', '/api/student/attendance/logs'],
] as [$method, $path]) {
    biometric_expect_true(
        str_contains($routes, "'method' => '{$method}'") && str_contains($routes, "'path' => '{$path}'"),
        "Frozen Student route {$method} {$path} is registered"
    );
}
$controller = file_get_contents(dirname(__DIR__, 2) . '/backend/controllers/StudentBiometricController.php');
$biometricHelpers = file_get_contents(dirname(__DIR__, 2) . '/backend/app/student_biometrics.php');
$biometricSource = $controller . $biometricHelpers;
foreach (['consent_required', 'biometric_not_enrolled', 'enrollment_expired', 'session_not_active', 'challenge_expired', 'challenge_invalid', 'liveness_failed', 'biometric_verification_failed', 'geofence_failed', 'already_recorded', 'biometric_service_unavailable'] as $errorCode) {
    biometric_expect_true(str_contains($biometricSource, "'{$errorCode}'"), "Stable biometric error code {$errorCode} is represented");
}
biometric_expect_true(str_contains($controller, "status = 'revoked'") && str_contains($controller, "attendance_session_fetch_for_student"), 'Revocation blocks Student capture while preserving the session record path');
biometric_expect_true(str_contains($controller, 'function handle_student_attendance_logs') && str_contains($controller, 'WHERE e.student_id = ?'), 'Student attendance logs are scoped to the authenticated Student identity');
biometric_expect_true(str_contains($controller, "biometric_enrollment_succeeded") && str_contains($controller, "biometric_enrollment_revoked"), 'Biometric profile lifecycle actions are audited');
$facultyController = file_get_contents(dirname(__DIR__, 2) . '/backend/controllers/FacultyController.php');
$secretaryController = file_get_contents(dirname(__DIR__, 2) . '/backend/controllers/SecretaryController.php');
biometric_expect_true(str_contains($facultyController, 'attendance_session_require_timing_for_biometric') && str_contains($secretaryController, 'attendance_session_require_timing_for_biometric'), 'Faculty and Secretary session creation enforce timing for biometric-required sessions');

fwrite(STDOUT, "PASS: Student biometric backend contract checks completed.\n");
