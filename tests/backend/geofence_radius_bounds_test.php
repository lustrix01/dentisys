<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/backend/app/config.php';
require_once dirname(__DIR__, 2) . '/backend/app/validation.php';
require_once dirname(__DIR__, 2) . '/backend/app/audit.php';
require_once dirname(__DIR__, 2) . '/backend/app/attendance_sessions.php';
require_once dirname(__DIR__, 2) . '/backend/controllers/FacultyController.php';
require_once dirname(__DIR__, 2) . '/backend/controllers/SecretaryController.php';

function geofence_radius_assert(bool $condition, string $message): void
{
    if (!$condition) { fwrite(STDERR, "FAIL: {$message}\n"); exit(1); }
    fwrite(STDOUT, "PASS: {$message}\n");
}

function geofence_radius_rejected(callable $validate): bool
{
    try {
        $validate();
    } catch (ValidationException $e) {
        $errors = $e->getErrors();
        return count($errors) === 1 && $errors[0]['field'] === 'geofenceRadiusMeters';
    }
    return false;
}

$helpers = [
    'attendance_session_request_float' => static fn(array $data): ?float => attendance_session_request_float($data, 'geofenceRadiusMeters', ATTENDANCE_GEOFENCE_RADIUS_MIN_METERS, ATTENDANCE_GEOFENCE_RADIUS_MAX_METERS),
    'secretary_attendance_session_optional_float' => static fn(array $data): ?float => secretary_attendance_session_optional_float($data, 'geofenceRadiusMeters', ATTENDANCE_GEOFENCE_RADIUS_MIN_METERS, ATTENDANCE_GEOFENCE_RADIUS_MAX_METERS),
];

foreach ($helpers as $name => $helper) {
    foreach ([50, 2000, 100, '50', 1234.5] as $valid) {
        $value = $helper(['geofenceRadiusMeters' => $valid]);
        geofence_radius_assert($value === (float) $valid, "{$name} accepts {$valid}");
    }
    foreach ([49.99, 0, -1, 2000.01, 1000000, INF, 1e400] as $invalid) {
        geofence_radius_assert(geofence_radius_rejected(static fn() => $helper(['geofenceRadiusMeters' => $invalid])), "{$name} rejects " . var_export($invalid, true) . " with field geofenceRadiusMeters");
    }
    geofence_radius_assert($helper([]) === null && $helper(['geofenceRadiusMeters' => null]) === null, "{$name} leaves an absent or null radius unset");
}

$config = app_config(['APP_ENV' => 'test', 'APP_TIMEZONE' => 'Asia/Manila']);
$date = attendance_session_now_utc()->setTimezone(new DateTimeZone('Asia/Manila'))->modify('+3 days')->format('Y-m-d');
$payload = ['sessionDate' => $date, 'openingTime' => '08:00', 'presentCutoff' => '09:00', 'lateCutoff' => '10:00', 'classEndTime' => '11:00', 'room' => 'Room 1'];
$secretaryGeo = $payload + ['requireGeo' => 'yes', 'geofenceLatitude' => '13.1', 'geofenceLongitude' => '123.7'];
geofence_radius_assert(attendance_session_update_values($secretaryGeo + ['geofenceRadiusMeters' => 2000], $config, 'secretary')['geofence_radius_meters'] === 2000.0, 'Secretary session values accept the maximum radius');
geofence_radius_assert(geofence_radius_rejected(static fn() => attendance_session_update_values($secretaryGeo + ['geofenceRadiusMeters' => 2000.01], $config, 'secretary')), 'Secretary session values reject a 2000.01 m radius with field geofenceRadiusMeters');
geofence_radius_assert(geofence_radius_rejected(static fn() => attendance_session_update_values($secretaryGeo + ['geofenceRadiusMeters' => 49.99], $config, 'secretary')), 'Secretary session values reject a 49.99 m radius with field geofenceRadiusMeters');
geofence_radius_assert(geofence_radius_rejected(static fn() => attendance_session_update_values($secretaryGeo + ['geofenceRadiusMeters' => 1000000], $config, 'secretary')), 'Secretary session values reject a 1000000 m radius with field geofenceRadiusMeters');
geofence_radius_assert(geofence_radius_rejected(static fn() => attendance_session_update_values($secretaryGeo + ['geofenceRadiusMeters' => 0], $config, 'secretary')), 'Secretary session values reject a zero radius with field geofenceRadiusMeters');
