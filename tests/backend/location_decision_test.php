<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/backend/app/config.php';
require_once dirname(__DIR__, 2) . '/backend/app/validation.php';
require_once dirname(__DIR__, 2) . '/backend/app/audit.php';
require_once dirname(__DIR__, 2) . '/backend/app/attendance_sessions.php';
require_once dirname(__DIR__, 2) . '/backend/app/student_biometrics.php';
require_once dirname(__DIR__, 2) . '/backend/controllers/FacultyController.php';
require_once dirname(__DIR__, 2) . '/backend/controllers/SecretaryController.php';

function location_expect(bool $condition, string $message): void
{
    if (!$condition) { fwrite(STDERR, "FAIL: {$message}\n"); exit(1); }
    fwrite(STDOUT, "PASS: {$message}\n");
}

function location_session(float $radius, bool $enabled = true): array
{
    return ['geofence_enabled' => $enabled, 'geofence_latitude' => 13.1436, 'geofence_longitude' => 123.7438, 'geofence_radius_meters' => $radius];
}

// A point `$meters` north of the session centre (1 degree of latitude is about 111,195 m on this sphere).
function location_north(float $meters): float
{
    return 13.1436 + rad2deg($meters / 6371000.0);
}

function location_result(array $session, ?float $lat, ?float $lon, ?float $accuracy): string
{
    return student_biometric_location_decision($session, $lat, $lon, $accuracy)['result'];
}

$lon = 123.7438;
$inside = student_biometric_location_decision(location_session(100), location_north(40), $lon, 20.0);
location_expect($inside['result'] === 'inside' && $inside['distanceMeters'] === 40 && $inside['radiusMeters'] === 100 && $inside['accuracyMeters'] === 20 && $inside['accuracyLimitMeters'] === 100, 'inside fix reports distance, radius, accuracy and limit');
$outside = student_biometric_location_decision(location_session(100), location_north(2400), $lon, 20.0);
location_expect($outside['result'] === 'outside' && $outside['distanceMeters'] === 2400, 'outside fix reports the distance');
location_expect(location_result(location_session(100), location_north(99.9), $lon, 20.0) === 'inside', 'just inside the radius is inside');
location_expect(location_result(location_session(100), location_north(100.5), $lon, 20.0) === 'outside', 'just beyond the radius is outside');
location_expect(location_result(location_session(100), 13.1436, $lon, 100.0) === 'inside', 'accuracy equal to the limit is accepted');
location_expect(location_result(location_session(100), 13.1436, $lon, 100.1) === 'imprecise', 'accuracy just above the limit is imprecise');
location_expect(location_result(location_session(50), 13.1436, $lon, 60.0) === 'imprecise', 'radius 50 with accuracy 60 is imprecise (limit is the radius)');
location_expect(location_result(location_session(150), 13.1436, $lon, 101.0) === 'imprecise', 'radius 150 with accuracy 101 is imprecise (limit capped at 100)');
location_expect(location_result(location_session(150), 13.1436, $lon, 100.0) === 'inside', 'radius 150 with accuracy 100 is accepted');
foreach ([null, 0.0, -5.0, NAN, INF] as $badAccuracy) {
    location_expect(location_result(location_session(100), 13.1436, $lon, $badAccuracy) === 'imprecise', 'accuracy ' . var_export($badAccuracy, true) . ' is imprecise');
}
$missing = student_biometric_location_decision(location_session(100), null, null, 10.0);
location_expect($missing['result'] === 'imprecise' && $missing['distanceMeters'] === null, 'missing coordinates are imprecise with no distance');
$off = student_biometric_location_decision(location_session(100, false), null, null, null);
location_expect($off['result'] === 'not_required', 'geofence off needs no location');

location_expect(student_biometric_geofence_passes(location_session(100), 13.1436, $lon, 20.0) === true, 'submit passes an inside, precise fix');
location_expect(student_biometric_geofence_passes(location_session(100), 13.1436, $lon, 500.0) === false, 'submit rejects an inside but imprecise fix');
location_expect(student_biometric_geofence_passes(location_session(100), 13.1436, $lon, null) === false, 'submit rejects a fix with no accuracy');
location_expect(student_biometric_geofence_passes(location_session(100), location_north(500), $lon, 10.0) === false, 'submit rejects an outside fix');
location_expect(student_biometric_geofence_passes(location_session(100, false), null, null, null) === true, 'submit passes when geofence is off');

// Session edit changes only what the request sends; unsent fields keep their stored value (ATT-002).
// Creation defaults live in the controllers; the parser below is shared and defaults omitted flags to off.
$config = app_config(['APP_ENV' => 'test', 'APP_TIMEZONE' => 'Asia/Manila']);
$date = attendance_session_now_utc()->setTimezone(new DateTimeZone('Asia/Manila'))->modify('+3 days')->format('Y-m-d');
$stored = ['session_date' => $date, 'opening_time' => '08:00:00', 'present_cutoff_time' => '09:00:00', 'late_cutoff_time' => '10:00:00', 'class_end_time' => '11:00:00', 'room' => 'Room 1',
    'biometric_required' => true, 'geofence_enabled' => false, 'geofence_latitude' => null, 'geofence_longitude' => null, 'geofence_radius_meters' => null];
$storedGeo = ['biometric_required' => false, 'geofence_enabled' => true, 'geofence_latitude' => '13.2000000', 'geofence_longitude' => '123.8000000', 'geofence_radius_meters' => '300.00'] + $stored;
$edit = static fn(array $request, array $session, string $role) => attendance_session_update_values(attendance_session_merge_stored_request($request, $session, $role), $config, $role);
$geo = ['geofenceLatitude' => 13.1, 'geofenceLongitude' => 123.7, 'geofenceRadiusMeters' => 150];
$rejects = static function (callable $fn): bool { try { $fn(); } catch (ValidationException $e) { return true; } return false; };
foreach (['faculty' => ['biometricRequired', 'geofenceEnabled'], 'secretary' => ['requireFace', 'requireGeo']] as $role => [$bioKey, $geoKey]) {
    $same = $edit(['room' => 'Room 1'], $storedGeo, $role);
    location_expect($same['geofence_enabled'] === true && $same['geofence_latitude'] === 13.2 && $same['geofence_longitude'] === 123.8 && $same['geofence_radius_meters'] === 300.0 && $same['biometric_required'] === false, "$role edit sending only the room keeps geofence, location, radius and biometric");
    $onlyRoom = $edit(['room' => 'New'], $stored, $role);
    location_expect($onlyRoom['room'] === 'New' && $onlyRoom['session_date'] === $date && $onlyRoom['opening_time'] === '08:00:00' && $onlyRoom['present_cutoff_time'] === '09:00:00' && $onlyRoom['late_cutoff_time'] === '10:00:00' && $onlyRoom['class_end_time'] === '11:00:00' && $onlyRoom['biometric_required'] === true && $onlyRoom['geofence_enabled'] === false, "$role edit sending only the room keeps date, times and flags");
    location_expect($edit(['room' => ''], $stored, $role)['room'] === null, "$role edit sending an empty room clears it");
    location_expect($edit([$bioKey => true], $storedGeo, $role)['geofence_enabled'] === true, "$role edit sending only biometric leaves geofence unchanged");
    location_expect($edit([$geoKey => true] + $geo, $stored, $role)['biometric_required'] === true, "$role edit sending only geofence leaves biometric unchanged");
    location_expect($edit([$bioKey => false], $stored, $role)['biometric_required'] === false, "$role explicit biometric false turns it off");
    $off = $edit([$geoKey => false], $storedGeo, $role);
    location_expect($off['geofence_enabled'] === false && $off['geofence_latitude'] === null && $off['biometric_required'] === false, "$role explicit geofence false turns it off and leaves biometric");
    $on = $edit([$geoKey => true] + $geo, $storedGeo, $role);
    location_expect($on['geofence_latitude'] === 13.1 && $on['geofence_radius_meters'] === 150.0, "$role explicit geofence true uses the sent location");
    location_expect($rejects(fn() => $edit([$geoKey => true], $stored, $role)), "$role geofence on without any stored or sent location is rejected");
    $pin = $edit(['geofenceLatitude' => 13.5, 'geofenceLongitude' => 123.9], $storedGeo, $role);
    location_expect($pin['geofence_latitude'] === 13.5 && $pin['geofence_radius_meters'] === 300.0, "$role edit moving only the pin keeps the stored radius");
    location_expect($rejects(fn() => $edit(['presentCutoff' => '10:30'], $stored, $role)), "$role edit sending only presentCutoff is validated against the stored late cutoff");
    location_expect($edit(['presentCutoff' => '09:30'], $stored, $role)['present_cutoff_time'] === '09:30:00', "$role edit sending a valid presentCutoff keeps the other times");
    location_expect($rejects(fn() => $edit(['geofenceRadiusMeters' => 20], $storedGeo, $role)), "$role radius is validated on edit");
    $noTiming = ['opening_time' => null, 'present_cutoff_time' => null, 'late_cutoff_time' => null] + $stored;
    location_expect($rejects(fn() => $edit([$bioKey => true], $noTiming, $role)), "$role biometric turned on without timing is rejected");
}
location_expect($edit(['requireGeo' => true] + $geo, $stored, 'secretary')['geofence_enabled'] === true, 'Secretary requireGeo overrides a stored-off geofence');
location_expect($edit(['requireGeo' => false], $storedGeo, 'secretary')['geofence_enabled'] === false, 'Secretary requireGeo false overrides a stored-on geofence');
location_expect($edit(['requireFace' => false], $stored, 'secretary')['biometric_required'] === false, 'Secretary requireFace false overrides a stored-on biometric');
location_expect($edit(['date' => $date], $stored, 'secretary')['session_date'] === $date, 'Secretary date alias is not shadowed by the stored sessionDate');

// Endpoint wiring (the handler needs a database; the live behaviour is covered by the Postgres gate).
$root = dirname(__DIR__, 2);
$routes = (string) file_get_contents($root . '/backend/routes/api.php');
$controller = (string) file_get_contents($root . '/backend/controllers/StudentBiometricController.php');
location_expect(str_contains($routes, "'path' => '/api/student/attendance/location-check'") && str_contains($routes, 'handle_student_attendance_location_check'), 'location-check route is registered');
location_expect(str_contains($controller, "student_biometric_post_float('accuracy')") && str_contains($controller, "'location_imprecise'"), 'submit reads accuracy and rejects imprecise fixes with location_imprecise');
$checkHandler = substr($controller, (int) strpos($controller, 'function handle_student_attendance_location_check'));
$checkHandler = substr($checkHandler, 0, (int) strpos($checkHandler, 'function handle_student_attendance_logs'));
location_expect(!preg_match('/INSERT|UPDATE |DELETE|error_log|audit/i', $checkHandler), 'location-check handler stores and logs nothing');
