<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/backend/app/config.php';
require_once dirname(__DIR__, 2) . '/backend/app/validation.php';
require_once dirname(__DIR__, 2) . '/backend/app/audit.php';
require_once dirname(__DIR__, 2) . '/backend/app/attendance_sessions.php';
require_once dirname(__DIR__, 2) . '/backend/controllers/FacultyController.php';
require_once dirname(__DIR__, 2) . '/backend/controllers/SecretaryController.php';

function edit_schedule_assert(bool $condition, string $message): void
{
    if (!$condition) { fwrite(STDERR, "FAIL: {$message}\n"); exit(1); }
    fwrite(STDOUT, "PASS: {$message}\n");
}

class EditScheduleStatement extends PDOStatement
{
    public array $params = [];
    public mixed $result = false;

    public function __construct() {}

    public function execute(?array $params = null): bool
    {
        $this->params = $params ?? [];
        return true;
    }

    public function fetch(int $mode = PDO::FETCH_DEFAULT, int $cursorOrientation = PDO::FETCH_ORI_NEXT, int $cursorOffset = 0): mixed
    {
        return $this->result;
    }
}

class EditSchedulePdo extends PDO
{
    public string $sql = '';
    public EditScheduleStatement $statement;

    public function __construct() { $this->statement = new EditScheduleStatement(); }

    public function prepare(string $query, array $options = []): PDOStatement|false
    {
        $this->sql = $query;
        return $this->statement;
    }
}

$pdo = new EditSchedulePdo();
edit_schedule_assert(attendance_session_booking_conflict($pdo, 3, '2026-10-12', '08:00:00', '11:00:00', 17) === null, 'Editing has no conflict when the query finds no other booking');
edit_schedule_assert(str_contains($pdo->sql, 's.session_id <> ?'), 'Edit conflict SQL excludes the edited session');
edit_schedule_assert($pdo->statement->params === [3, '2026-10-12', '11:00:00', '08:00:00', 17], 'Edit conflict parameters keep the excluded ID separate from the time bounds');
attendance_session_booking_conflict($pdo, 3, '2026-10-12', null, '11:00:00');
edit_schedule_assert(!str_contains($pdo->sql, 's.session_id <>') && $pdo->statement->params === [3, '2026-10-12', '11:00:00', '00:00:00'], 'Creation retains its original conflict query and parameters');
$pdo->statement->result = ['created_by_role' => 'secretary', 'creator_name' => 'Fixture Secretary', 'opening_time' => '08:00:00', 'class_end_time' => '11:00:00'];
edit_schedule_assert(attendance_session_booking_conflict($pdo, 3, '2026-10-12', '08:00:00', '11:00:00', 17) === 'A schedule already exists on 2026-10-12 from 08:00 to 11:00 (Asia/Manila), created by Secretary Fixture Secretary.', 'Edit preserves the exact booking-conflict message');

$routes = require dirname(__DIR__, 2) . '/backend/routes/api.php';
foreach (['faculty', 'secretary'] as $role) {
    $matches = array_values(array_filter($routes, static fn(array $route): bool => $route['path'] === "/api/{$role}/attendance/session/update"));
    edit_schedule_assert(count($matches) === 1 && $matches[0]['method'] === 'POST'
        && $matches[0]['handler'] === "handle_{$role}_attendance_session_update" && !$matches[0]['has_params'], "{$role} update route is registered as a POST handler");
}

$config = app_config(['APP_ENV' => 'test', 'APP_TIMEZONE' => 'Asia/Manila']);
$date = attendance_session_now_utc()->setTimezone(new DateTimeZone('Asia/Manila'))->modify('+3 days')->format('Y-m-d');
$payload = ['sessionDate' => $date, 'openingTime' => '08:00', 'presentCutoff' => '09:00', 'lateCutoff' => '10:00', 'classEndTime' => '11:00', 'room' => 'Room 1'];
$facultyValues = attendance_session_update_values($payload, $config, 'faculty');
edit_schedule_assert($facultyValues['opening_time'] === '08:00:00' && $facultyValues['class_end_time'] === '11:00:00' && $facultyValues['room'] === 'Room 1', 'Update reuses creation time and room parsing');
edit_schedule_assert(!$facultyValues['biometric_required'] && !$facultyValues['geofence_enabled'], 'Faculty update preserves creation flag defaults');
$secretaryValues = attendance_session_update_values($payload + ['requireFace' => 'yes', 'requireGeo' => 'yes', 'geofenceLatitude' => '13.1', 'geofenceLongitude' => '123.7'], $config, 'secretary');
edit_schedule_assert($secretaryValues['biometric_required'] && $secretaryValues['geofence_enabled'] && $secretaryValues['geofence_radius_meters'] === 100.0, 'Secretary update preserves creation aliases and default geofence radius');
$editAuditState = attendance_session_update_audit_state($secretaryValues);
edit_schedule_assert($editAuditState['geofence_latitude'] === '13.1' && $editAuditState['geofence_longitude'] === '123.7' && $editAuditState['geofence_radius_meters'] === '100', 'Edit audit encodes decimal settings as strings required by the audit writer');
edit_schedule_assert(audit_redact_state($editAuditState) === $editAuditState, 'Geofenced edit state passes the actual audit-state validator');
$previousEditAuditState = attendance_session_update_audit_state(array_merge($facultyValues, ['biometric_required' => 't', 'geofence_enabled' => 't', 'geofence_latitude' => '13.100000', 'geofence_longitude' => '123.700000', 'geofence_radius_meters' => '100.00']));
edit_schedule_assert($previousEditAuditState['biometric_required'] && $previousEditAuditState['geofence_latitude'] === '13.100000' && audit_redact_state($previousEditAuditState) === $previousEditAuditState, 'Edit audit preserves previous persisted decimal values without floating-point conversion');
foreach ([null, 0, -1, true, '12x', [], 2147483648, '999999999999999999999999'] as $invalidId) {
    try {
        attendance_session_update($pdo, $config, [], [], ['sessionId' => $invalidId], 'faculty');
        edit_schedule_assert(false, 'Invalid session ID must fail before database access');
    } catch (AttendanceSessionException $e) {
        edit_schedule_assert($e->statusCode === 400 && $e->errorCode === 'BAD_REQUEST', 'Invalid session ID returns BAD_REQUEST');
    }
}
foreach (['faculty', 'secretary'] as $role) {
    try {
        attendance_session_update_values(array_merge($payload, ['classEndTime' => '09:00']), $config, $role);
        edit_schedule_assert(false, 'Invalid class end must fail');
    } catch (ValidationException $e) {
        edit_schedule_assert($e->getErrors() === [['field' => 'classEndTime', 'message' => 'Class end time must be at or after the Late cutoff.']], "{$role} update preserves the creation end-time validation message");
    }
}
