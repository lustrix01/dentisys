<?php

declare(strict_types=1);

class AttendanceSessionException extends RuntimeException
{
    public readonly int $statusCode;
    public readonly string $errorCode;

    public function __construct(string $message, int $statusCode, string $errorCode)
    {
        $this->statusCode = $statusCode;
        $this->errorCode = $errorCode;
        parent::__construct($message, $statusCode);
    }
}

function attendance_session_now_utc(): DateTimeImmutable
{
    return new DateTimeImmutable('now', new DateTimeZone('UTC'));
}

function attendance_session_creation_date(mixed $value, array $config, ?DateTimeImmutable $now = null): string
{
    $today = app_local_date($config, $now ?? attendance_session_now_utc());
    $raw = is_string($value) ? trim($value) : '';
    $date = DateTimeImmutable::createFromFormat('!Y-m-d', $raw);
    $errors = DateTimeImmutable::getLastErrors();
    if (!$date || ($errors !== false && ($errors['warning_count'] || $errors['error_count'])) || $date->format('Y-m-d') !== $raw) {
        throw new ValidationException(['sessionDate' => 'Session date must be a valid YYYY-MM-DD date.']);
    }
    if ($raw < $today) throw new ValidationException(['sessionDate' => 'Past attendance session dates are not allowed.']);
    return $raw;
}

function attendance_session_creation_status(string $date, ?string $opening, array $config): string
{
    $now = attendance_session_now_utc()->setTimezone(new DateTimeZone($config['app']['operational_timezone']));
    if ($date > $now->format('Y-m-d') && $opening === null) {
        throw new ValidationException(['openingTime' => 'A scheduled session requires opening time, Present cutoff and Late cutoff.']);
    }
    return $date . ' ' . ($opening ?? '00:00:00') > $now->format('Y-m-d H:i:s') ? 'scheduled' : 'active';
}

/** Called while holding the class-section row lock when creating or editing. */
function attendance_session_booking_conflict(PDO $pdo, int $csId, string $date, ?string $opening, string $end, ?int $excludeSessionId = null): ?string
{
    $exclude = $excludeSessionId !== null ? ' AND s.session_id <> ?' : '';
    $stmt = $pdo->prepare("SELECT s.session_date, s.opening_time, s.class_end_time, s.created_by_role,
        u.display_name AS creator_name FROM attendance_sessions s
        LEFT JOIN user_accounts u ON u.user_id = s.owner_user_id
        WHERE s.cs_id = ? AND s.session_date = ? AND s.status IN ('active', 'scheduled')
          AND COALESCE(s.opening_time, TIME '00:00') < CAST(? AS time)
          AND CAST(? AS time) < COALESCE(s.class_end_time, TIME '23:59:59')
        {$exclude} ORDER BY s.opening_time, s.session_id LIMIT 1");
    $params = [$csId, $date, $end, $opening ?? '00:00:00'];
    if ($excludeSessionId !== null) {
        $params[] = $excludeSessionId;
    }
    $stmt->execute($params);
    $existing = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$existing) return null;
    $role = ($existing['created_by_role'] ?? '') === 'faculty' ? 'Faculty' : 'Secretary';
    $name = trim((string) ($existing['creator_name'] ?? ''));
    $from = isset($existing['opening_time']) ? substr($existing['opening_time'], 0, 5) : '00:00';
    $to = isset($existing['class_end_time']) ? substr($existing['class_end_time'], 0, 5) : '23:59';
    return "A schedule already exists on {$date} from {$from} to {$to} (Asia/Manila), created by {$role}" . ($name !== '' ? " {$name}" : '') . '.';
}

function attendance_session_bool(mixed $value): bool
{
    return in_array($value, [true, 't', 'true', '1', 1], true);
}

function attendance_session_timestamp(?string $value): ?string
{
    if ($value === null || trim($value) === '') {
        return null;
    }

    try {
        return (new DateTimeImmutable($value, new DateTimeZone('UTC')))->format('Y-m-d\\TH:i:s.u\\Z');
    } catch (Throwable) {
        return $value;
    }
}

function attendance_session_parse_time(array $data, string $field): ?string
{
    if (!array_key_exists($field, $data) || $data[$field] === null || trim((string) $data[$field]) === '') {
        return null;
    }

    $raw = trim((string) $data[$field]);
    $time = DateTimeImmutable::createFromFormat('!H:i', $raw, new DateTimeZone('UTC'));
    $errors = DateTimeImmutable::getLastErrors();
    if (!$time || ($errors !== false && ($errors['warning_count'] > 0 || $errors['error_count'] > 0)) || $time->format('H:i') !== $raw) {
        throw new ValidationException([[
            'field' => $field,
            'message' => 'Time must use the HH:MM format.',
        ]]);
    }

    return $time->format('H:i:s');
}

function attendance_session_timing_from_request(array $data): array
{
    $opening = attendance_session_parse_time($data, 'openingTime');
    $present = attendance_session_parse_time($data, 'presentCutoff');
    $late = attendance_session_parse_time($data, 'lateCutoff');

    if ($opening === null && $present === null && $late === null) {
        return [null, null, null];
    }

    if ($opening === null || $present === null || $late === null) {
        throw new ValidationException([[
            'field' => 'openingTime',
            'message' => 'Opening time, Present cutoff, and Late cutoff must be provided together.',
        ]]);
    }

    if (!($opening < $present && $present < $late)) {
        throw new ValidationException([[
            'field' => 'openingTime',
            'message' => 'Opening time must be before Present cutoff, which must be before Late cutoff.',
        ]]);
    }

    return [$opening, $present, $late];
}

/**
 * ATT-001: required class end time (HH:MM, Asia/Manila) on the session day, at
 * or after the Late cutoff. A session for today cannot end in the past.
 */
function attendance_session_class_end_time_from_request(
    array $data,
    ?string $lateCutoff,
    string $sessionDate,
    array $config
): string {
    $classEnd = attendance_session_parse_time($data, 'classEndTime');
    if ($classEnd === null) {
        throw new ValidationException([['field' => 'classEndTime', 'message' => 'Class end time is required.']]);
    }
    if ($lateCutoff !== null && $classEnd < $lateCutoff) {
        throw new ValidationException([['field' => 'classEndTime', 'message' => 'Class end time must be at or after the Late cutoff.']]);
    }
    $timezone = new DateTimeZone((string) $config['app']['operational_timezone']);
    $end = new DateTimeImmutable($sessionDate . ' ' . $classEnd, $timezone);
    if ($end <= attendance_session_now_utc()) {
        throw new ValidationException([['field' => 'classEndTime', 'message' => 'Class end time has already passed.']]);
    }
    return $classEnd;
}

function attendance_session_require_timing_for_biometric(
    bool $biometricRequired,
    ?string $opening,
    ?string $present,
    ?string $late
): void {
    if (!$biometricRequired || ($opening !== null && $present !== null && $late !== null)) {
        return;
    }

    throw new ValidationException([[
        'field' => 'openingTime',
        'message' => 'Biometric-required sessions must provide openingTime, presentCutoff, and lateCutoff.',
    ]]);
}

function attendance_session_request_bool(array $data, string $field, bool $default): bool
{
    if (!array_key_exists($field, $data) || $data[$field] === null || $data[$field] === '') {
        return $default;
    }

    $value = filter_var($data[$field], FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
    if ($value === null) {
        throw new ValidationException([[
            'field' => $field,
            'message' => 'Field must be a boolean.',
        ]]);
    }

    return $value;
}

function attendance_session_request_float(array $data, string $field, ?float $minimum = null, ?float $maximum = null): ?float
{
    if (!array_key_exists($field, $data) || $data[$field] === null || $data[$field] === '') {
        return null;
    }
    if (is_bool($data[$field]) || !is_numeric($data[$field]) || !is_finite((float) $data[$field])) {
        throw new ValidationException([[
            'field' => $field,
            'message' => 'Field must be a finite number.',
        ]]);
    }

    $value = (float) $data[$field];
    if (($minimum !== null && $value < $minimum) || ($maximum !== null && $value > $maximum)) {
        throw new ValidationException([[
            'field' => $field,
            'message' => 'Field is outside the permitted range.',
        ]]);
    }

    return $value;
}

function attendance_session_fetch_for_manager(
    PDO $pdo,
    int $userId,
    string $role,
    int $sessionId,
    bool $forUpdate = false
): ?array {
    $scope = $role === 'faculty'
        ? 'cs.instructor_user_id = :manager_user_id'
        : 'cs.secretary_user_id = :manager_user_id';
    $sql = "SELECT s.session_id, s.cs_id, s.secretary_user_id, s.owner_user_id,
                    s.session_date, s.session_code, s.room, s.started_at, s.ended_at,
                    s.status, s.geofence_enabled, s.geofence_latitude,
                    s.geofence_longitude, s.geofence_radius_meters,
                    s.biometric_required, s.opening_time, s.present_cutoff_time,
                    s.late_cutoff_time, s.class_end_time, s.revoked_at, s.revoked_by_user_id,
                    s.revocation_reason, s.created_at, s.updated_at, s.created_by_role,
                    cs.cs_name, cs.block, c.course_id, c.course_code,
                    c.name AS course_name, u.display_name AS instructor_name
               FROM attendance_sessions s
               JOIN class_sections cs ON cs.cs_id = s.cs_id
               JOIN courses c ON c.course_id = cs.course_id
               LEFT JOIN user_accounts u ON u.user_id = cs.instructor_user_id
              WHERE s.session_id = :session_id
                AND {$scope}
              LIMIT 1";
    if ($forUpdate) {
        $sql .= ' FOR UPDATE OF s';
    }

    $stmt = $pdo->prepare($sql);
    $stmt->execute([
        ':session_id' => $sessionId,
        ':manager_user_id' => $userId,
    ]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row === false ? null : $row;
}

/** Preserve each role's creation parsing, defaults, aliases and validation messages. */
function attendance_session_update_values(array $data, array $config, string $role): array
{
    $today = app_local_date($config, attendance_session_now_utc());
    $sessionDate = $role === 'faculty'
        ? attendance_session_creation_date(trim((string) ($data['sessionDate'] ?? ($data['date'] ?? $today))), $config)
        : secretary_attendance_session_date($data, attendance_session_now_utc(), $config);
    [$openingTime, $presentCutoff, $lateCutoff] = attendance_session_timing_from_request($data);
    $classEndTime = attendance_session_class_end_time_from_request($data, $lateCutoff, $sessionDate, $config);

    $room = null;
    if ($role === 'faculty') {
        if (array_key_exists('room', $data) && trim((string) $data['room']) !== '') {
            $room = validate_required_string($data, 'room', 1, 255);
        }
        $biometricRequired = attendance_session_request_bool($data, 'biometricRequired', false);
    } else {
        if (array_key_exists('room', $data) && $data['room'] !== null && $data['room'] !== '') {
            $room = validate_required_string($data, 'room', 1, 255);
        }
        $biometricRequired = secretary_attendance_session_bool($data, array_key_exists('biometricRequired', $data) ? 'biometricRequired' : 'requireFace', false);
    }
    attendance_session_require_timing_for_biometric($biometricRequired, $openingTime, $presentCutoff, $lateCutoff);
    if ($role === 'faculty') {
        $geofenceEnabled = attendance_session_request_bool($data, 'geofenceEnabled', $biometricRequired);
        $latitude = attendance_session_request_float($data, 'geofenceLatitude', -90, 90);
        $longitude = attendance_session_request_float($data, 'geofenceLongitude', -180, 180);
        $radius = attendance_session_request_float($data, 'geofenceRadiusMeters', 0.01, 999999.99);
    } else {
        $geofenceEnabled = secretary_attendance_session_bool($data, array_key_exists('geofenceEnabled', $data) ? 'geofenceEnabled' : 'requireGeo', $biometricRequired);
        $latitude = secretary_attendance_session_optional_float($data, 'geofenceLatitude', -90, 90);
        $longitude = secretary_attendance_session_optional_float($data, 'geofenceLongitude', -180, 180);
        $radius = secretary_attendance_session_optional_float($data, 'geofenceRadiusMeters', 0.01, 999999.99);
    }
    if (($latitude === null) !== ($longitude === null)) {
        throw new ValidationException([['field' => 'geofenceLatitude', 'message' => 'Geofence latitude and longitude must be provided together.']]);
    }
    if ($geofenceEnabled && $latitude === null) {
        throw new ValidationException([['field' => 'geofenceLatitude', 'message' => 'A geofenced session requires the session location (latitude and longitude).']]);
    }
    if ($geofenceEnabled && $radius === null) {
        $radius = 100.0;
    }

    return [
        'session_date' => $sessionDate, 'opening_time' => $openingTime,
        'present_cutoff_time' => $presentCutoff, 'late_cutoff_time' => $lateCutoff,
        'class_end_time' => $classEndTime, 'room' => $room,
        'biometric_required' => $biometricRequired, 'geofence_enabled' => $geofenceEnabled,
        'geofence_latitude' => $latitude, 'geofence_longitude' => $longitude,
        'geofence_radius_meters' => $radius,
    ];
}

function attendance_session_update_audit_state(array $values): array
{
    foreach (['biometric_required', 'geofence_enabled'] as $field) {
        $values[$field] = attendance_session_bool($values[$field]);
    }
    // The audit writer requires decimal values as strings, never floats.
    foreach (['geofence_latitude', 'geofence_longitude', 'geofence_radius_meters'] as $field) {
        $values[$field] = $values[$field] !== null ? (string) $values[$field] : null;
    }
    return $values;
}

function attendance_session_update(PDO $pdo, array $config, array $authCtx, array $context, array $data, string $role): array
{
    $sessionId = faculty_attendance_positive_int($data['sessionId'] ?? null);
    if ($sessionId === null || $sessionId <= 0 || $sessionId > 2147483647) {
        throw new AttendanceSessionException('A valid attendance session ID is required.', 400, 'BAD_REQUEST');
    }
    $values = attendance_session_update_values($data, $config, $role);
    $userId = (int) $authCtx['user_id'];
    $session = attendance_session_fetch_for_manager($pdo, $userId, $role, $sessionId);
    if ($session === null) {
        throw new AttendanceSessionException('Attendance session was not found in an assigned class.', 404, 'NOT_FOUND');
    }
    // The class section is immutable; request csId/classSectionId are ignored.
    $csId = (int) $session['cs_id'];
    $pdo->beginTransaction();
    try {
        $managerColumn = $role === 'faculty' ? 'instructor_user_id' : 'secretary_user_id';
        $lock = $pdo->prepare("SELECT cs_id FROM class_sections WHERE cs_id = ? AND {$managerColumn} = ? AND LOWER(status) = 'active' FOR UPDATE");
        $lock->execute([$csId, $userId]);
        if ($lock->fetchColumn() === false) {
            throw new AttendanceSessionException('Attendance session was not found in an assigned class.', 404, 'NOT_FOUND');
        }
        $session = attendance_session_fetch_for_manager($pdo, $userId, $role, $sessionId, true);
        if ($session === null) {
            throw new AttendanceSessionException('Attendance session was not found in an assigned class.', 404, 'NOT_FOUND');
        }
        if ($session['status'] !== 'scheduled') {
            throw new AttendanceSessionException('Only scheduled sessions can be edited.', 409, 'ATTENDANCE_SESSION_NOT_EDITABLE');
        }
        // On Secretary insert these are the actor, not the assigned class Secretary.
        if ($role === 'secretary' && (($session['created_by_role'] ?? null) !== 'secretary'
            || (int) ($session['secretary_user_id'] ?? 0) !== $userId
            || (int) ($session['owner_user_id'] ?? 0) !== $userId)) {
            throw new AttendanceSessionException('You can edit only sessions you created.', 403, 'ATTENDANCE_SESSION_EDIT_FORBIDDEN');
        }
        if (academic_class_section_is_past($pdo, $csId)) {
            throw new AttendanceSessionException('Past school-year classes are view-only.', 409, 'CONFLICT');
        }
        $conflict = attendance_session_booking_conflict($pdo, $csId, $values['session_date'], $values['opening_time'], $values['class_end_time'], $sessionId);
        if ($conflict !== null) {
            throw new AttendanceSessionException($conflict, 409, 'CONFLICT');
        }
        $values['status'] = attendance_session_creation_status($values['session_date'], $values['opening_time'], $config);
        $nowSql = attendance_session_now_utc()->format('Y-m-d H:i:s.u');
        $update = $pdo->prepare(
            "UPDATE attendance_sessions SET session_date = :session_date, opening_time = :opening_time,
                present_cutoff_time = :present_cutoff_time, late_cutoff_time = :late_cutoff_time,
                class_end_time = :class_end_time, room = :room, biometric_required = :biometric_required,
                geofence_enabled = :geofence_enabled, geofence_latitude = :geofence_latitude,
                geofence_longitude = :geofence_longitude, geofence_radius_meters = :geofence_radius_meters,
                status = :status, updated_at = :updated_at
             WHERE session_id = :id AND status = 'scheduled'"
        );
        $params = $values;
        $params['biometric_required'] = $values['biometric_required'] ? 1 : 0;
        $params['geofence_enabled'] = $values['geofence_enabled'] ? 1 : 0;
        $update->execute($params + ['updated_at' => $nowSql, 'id' => $sessionId]);
        if ($update->rowCount() !== 1) {
            throw new AttendanceSessionException('Only scheduled sessions can be edited.', 409, 'ATTENDANCE_SESSION_NOT_EDITABLE');
        }
        $updatedSession = attendance_session_fetch_for_manager($pdo, $userId, $role, $sessionId);
        // Audit the persisted row so NUMERIC rounding is reflected in the after-state.
        $before = attendance_session_update_audit_state(array_intersect_key($session, $values));
        $after = attendance_session_update_audit_state(array_intersect_key($updatedSession, $values));
        attendance_session_record_audit(
            $pdo, $config, $authCtx, $context, 'attendance_session_updated', $sessionId, $csId,
            "Updated attendance session '{$session['session_code']}' for class section #{$csId}.", null, $before, $after
        );
        $pdo->commit();
        return $updatedSession;
    } catch (PDOException $e) {
        if ($pdo->inTransaction()) { $pdo->rollBack(); }
        if (($e->errorInfo[0] ?? (string) $e->getCode()) === '23505') {
            throw new AttendanceSessionException('An active attendance session or duplicate session code already exists for this class section.', 409, 'CONFLICT');
        }
        throw $e;
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) { $pdo->rollBack(); }
        throw $e;
    }
}

function attendance_session_fetch_for_student(
    PDO $pdo,
    int $sessionId,
    int $studentId,
    bool $forUpdate = false
): ?array {
    $sql = "SELECT s.session_id, s.cs_id, s.secretary_user_id, s.owner_user_id,
                    s.session_date, s.session_code, s.room, s.started_at, s.ended_at,
                    s.status, s.geofence_enabled, s.geofence_latitude,
                    s.geofence_longitude, s.geofence_radius_meters,
                    s.biometric_required, s.opening_time, s.present_cutoff_time,
                    s.late_cutoff_time, s.class_end_time, s.revoked_at, s.revoked_by_user_id,
                    s.revocation_reason, s.created_at, s.updated_at,
                    e.enrollment_id, e.student_id, e.status AS enrollment_status,
                    cs.cs_name, cs.block, c.course_id, c.course_code,
                    c.name AS course_name, u.display_name AS instructor_name
               FROM attendance_sessions s
               JOIN class_sections cs ON cs.cs_id = s.cs_id
               JOIN courses c ON c.course_id = cs.course_id
               JOIN enrollments e ON e.cs_id = cs.cs_id AND e.student_id = :student_id
               LEFT JOIN user_accounts u ON u.user_id = cs.instructor_user_id
              WHERE s.session_id = :session_id
                AND e.status = 'Active'
              LIMIT 1";
    if ($forUpdate) {
        $sql .= ' FOR UPDATE OF s, e';
    }

    $stmt = $pdo->prepare($sql);
    $stmt->execute([
        ':session_id' => $sessionId,
        ':student_id' => $studentId,
    ]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row === false ? null : $row;
}

function attendance_session_map(array $row, bool $includeLocation = false): array
{
    $mapped = [
        'id' => (int) $row['session_id'],
        'sessionId' => (string) $row['session_id'],
        'csId' => (int) $row['cs_id'],
        'classId' => (string) $row['cs_id'],
        'className' => $row['cs_name'] ?? null,
        'classSection' => [
            'id' => (string) $row['cs_id'],
            'name' => $row['cs_name'] ?? null,
            'block' => $row['block'] ?? null,
        ],
        'course' => [
            'id' => (int) $row['course_id'],
            'code' => $row['course_code'],
            'name' => $row['course_name'],
        ],
        'courseCode' => $row['course_code'],
        'instructorName' => $row['instructor_name'] ?? null,
        'sessionDate' => $row['session_date'],
        'sessionCode' => $row['session_code'],
        'room' => $row['room'],
        'startedAt' => attendance_session_timestamp((string) $row['started_at']),
        'endedAt' => attendance_session_timestamp($row['ended_at'] !== null ? (string) $row['ended_at'] : null),
        'status' => strtolower((string) $row['status']),
        'openingTime' => $row['opening_time'] !== null ? substr((string) $row['opening_time'], 0, 5) : null,
        'presentCutoff' => $row['present_cutoff_time'] !== null ? substr((string) $row['present_cutoff_time'], 0, 5) : null,
        'lateCutoff' => $row['late_cutoff_time'] !== null ? substr((string) $row['late_cutoff_time'], 0, 5) : null,
        'classEndTime' => isset($row['class_end_time']) ? substr((string) $row['class_end_time'], 0, 5) : null,
        'timingConfigured' => $row['opening_time'] !== null && $row['present_cutoff_time'] !== null && $row['late_cutoff_time'] !== null,
        'geofenceEnabled' => attendance_session_bool($row['geofence_enabled']),
        'geofenceRadiusMeters' => $row['geofence_radius_meters'] !== null ? (float) $row['geofence_radius_meters'] : null,
        'biometricRequired' => attendance_session_bool($row['biometric_required']),
        'revokedAt' => attendance_session_timestamp($row['revoked_at'] !== null ? (string) $row['revoked_at'] : null),
        'revocationReason' => $row['revocation_reason'] ?? null,
        'createdAt' => attendance_session_timestamp((string) $row['created_at']),
        'updatedAt' => attendance_session_timestamp((string) $row['updated_at']),
    ];

    if ($includeLocation) {
        $mapped['geofenceLatitude'] = $row['geofence_latitude'] !== null ? (float) $row['geofence_latitude'] : null;
        $mapped['geofenceLongitude'] = $row['geofence_longitude'] !== null ? (float) $row['geofence_longitude'] : null;
    }

    return $mapped;
}

function attendance_session_timing_decision(array $session, DateTimeImmutable $nowUtc, array $config): array
{
    $status = strtolower((string) ($session['status'] ?? ''));
    if ($status === 'revoked') {
        return ['allowed' => false, 'code' => 'session_revoked', 'status' => null];
    }
    if ($status === 'scheduled') {
        return ['allowed' => false, 'code' => 'attendance_not_open', 'status' => null];
    }
    if ($status !== 'active') {
        return ['allowed' => false, 'code' => 'session_not_active', 'status' => null];
    }
    if ($session['opening_time'] === null || $session['present_cutoff_time'] === null || $session['late_cutoff_time'] === null) {
        return ['allowed' => false, 'code' => 'session_timing_unconfigured', 'status' => null];
    }

    $timezone = new DateTimeZone((string) $config['app']['operational_timezone']);
    $nowLocal = $nowUtc->setTimezone($timezone);
    $date = (string) $session['session_date'];
    $opening = new DateTimeImmutable($date . ' ' . $session['opening_time'], $timezone);
    $presentCutoff = new DateTimeImmutable($date . ' ' . $session['present_cutoff_time'], $timezone);
    $lateCutoff = new DateTimeImmutable($date . ' ' . $session['late_cutoff_time'], $timezone);

    if ($nowLocal < $opening) {
        return ['allowed' => false, 'code' => 'attendance_not_open', 'status' => null];
    }
    if ($nowLocal < $presentCutoff) {
        return ['allowed' => true, 'code' => null, 'status' => 'present'];
    }
    if ($nowLocal < $lateCutoff) {
        return ['allowed' => true, 'code' => null, 'status' => 'late'];
    }

    return ['allowed' => false, 'code' => 'attendance_capture_closed', 'status' => null];
}

function attendance_session_resolve_absences(PDO $pdo, int $sessionId, DateTimeImmutable $nowUtc): int
{
    if (!$pdo->inTransaction()) {
        throw new AttendanceSessionException('Attendance resolution requires a transaction.', 500, 'attendance_resolution_failed');
    }

    $nowSql = $nowUtc->format('Y-m-d H:i:s.u');
    $stmt = $pdo->prepare(
        "INSERT INTO attendance_records (
             enrollment_id, attendance_session_id, session_date, session_code,
             session_start, session_end, status, verification_method,
             time_recorded, created_at
         )
         SELECT e.enrollment_id, s.session_id, s.session_date, s.session_code,
                s.opening_time, s.late_cutoff_time, 'absent', 'system_resolution',
                ?, ?
           FROM attendance_sessions s
           JOIN enrollments e ON e.cs_id = s.cs_id AND e.status = 'Active'
          WHERE s.session_id = ?
            AND s.status = 'ended'
            -- A legacy manual mark may cover the day; another session's mark
            -- never resolves attendance for this session.
            AND NOT EXISTS (
                SELECT 1 FROM attendance_records r
                  LEFT JOIN attendance_sessions rs ON rs.session_id = r.attendance_session_id
                 WHERE r.enrollment_id = e.enrollment_id
                   AND (r.attendance_session_id = s.session_id
                        OR (r.session_date = s.session_date
                            AND r.attendance_session_id IS NULL))
            )
         ON CONFLICT DO NOTHING"
    );
    $stmt->execute([$nowSql, $nowSql, $sessionId]);
    return $stmt->rowCount();
}

/**
 * Request metadata for audit events written while serving a request.
 */
function attendance_session_request_context(): array
{
    return [
        'request_id' => request_id(),
        'ip_address' => request_ip(),
        'user_agent' => request_user_agent(),
        'http_method' => request_method(),
        'endpoint' => request_path(),
    ];
}

/**
 * ATT-003: end every active session whose class end time has passed
 * (Asia/Manila) and resolve students without a record to Absent, as of the
 * class end time. Called when sessions are read or used, so a session ends
 * by the time anyone looks at it. Each session ends in its own transaction
 * and is audited as a system action. Returns the number of sessions ended.
 */
function attendance_sessions_end_overdue(PDO $pdo, array $config, array $context): int
{
    if ($pdo->inTransaction()) {
        throw new AttendanceSessionException('Automatic session end must run outside a transaction.', 500, 'attendance_resolution_failed');
    }
    $timezone = new DateTimeZone((string) $config['app']['operational_timezone']);
    $nowLocal = attendance_session_now_utc()->setTimezone($timezone);
    $candidates = $pdo->prepare(
        "SELECT session_id, cs_id FROM attendance_sessions
          WHERE status IN ('active', 'scheduled') AND class_end_time IS NOT NULL
            AND (session_date < ? OR (session_date = ? AND class_end_time <= ?))
          ORDER BY session_id"
    );
    $today = $nowLocal->format('Y-m-d');
    $candidates->execute([$today, $today, $nowLocal->format('H:i:s')]);
    $system = ['user_id' => null, 'login_email' => null, 'role' => 'system', 'display_name' => 'Automatic session end', 'session_id' => null];
    $ended = 0;
    foreach ($candidates->fetchAll(PDO::FETCH_ASSOC) as $candidate) {
        $sessionId = (int) $candidate['session_id'];
        $pdo->beginTransaction();
        try {
            $pdo->prepare('SELECT cs_id FROM class_sections WHERE cs_id = ? FOR UPDATE')->execute([$candidate['cs_id']]);
            $lock = $pdo->prepare(
                "SELECT session_id, cs_id, session_code, session_date, class_end_time, status
                   FROM attendance_sessions
                  WHERE session_id = ? AND status IN ('active', 'scheduled')
                  FOR UPDATE SKIP LOCKED"
            );
            $lock->execute([(int) $sessionId]);
            $session = $lock->fetch(PDO::FETCH_ASSOC);
            if ($session === false) {
                $pdo->commit();
                continue;
            }
            $endUtc = (new DateTimeImmutable($session['session_date'] . ' ' . $session['class_end_time'], $timezone))
                ->setTimezone(new DateTimeZone('UTC'));
            $endSql = $endUtc->format('Y-m-d H:i:s.u');
            $update = $pdo->prepare(
                "UPDATE attendance_sessions SET status = 'ended', ended_at = ?, updated_at = ?
                  WHERE session_id = ? AND status IN ('active', 'scheduled')"
            );
            $update->execute([$endSql, attendance_session_now_utc()->format('Y-m-d H:i:s.u'), (int) $sessionId]);
            $absent = attendance_session_resolve_absences($pdo, (int) $sessionId, $endUtc);
            attendance_session_record_audit(
                $pdo, $config, $system, $context, 'attendance_session_auto_ended', (int) $sessionId, (int) $session['cs_id'],
                "Attendance session '{$session['session_code']}' ended automatically at its class end time; {$absent} student(s) resolved to Absent.",
                null,
                ['session_id' => (int) $sessionId, 'status' => $session['status']],
                ['session_id' => (int) $sessionId, 'status' => 'ended', 'ended_at' => $endSql, 'resolved_absent_count' => $absent]
            );
            $pdo->commit();
            $ended++;
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }
    attendance_sessions_open_due($pdo, $config, $context, $nowLocal);
    return $ended;
}

function attendance_sessions_open_due(PDO $pdo, array $config, array $context, DateTimeImmutable $nowLocal): void
{
    $due = $pdo->prepare("SELECT session_id, cs_id, session_date, opening_time FROM attendance_sessions WHERE status = 'scheduled'
        AND session_date = ? AND opening_time <= ? AND class_end_time > ? ORDER BY session_id");
    $due->execute([$nowLocal->format('Y-m-d'), $nowLocal->format('H:i:s'), $nowLocal->format('H:i:s')]);
    foreach ($due->fetchAll(PDO::FETCH_ASSOC) as $candidate) {
        $pdo->beginTransaction();
        try {
            $pdo->prepare('SELECT cs_id FROM class_sections WHERE cs_id = ? FOR UPDATE')->execute([$candidate['cs_id']]);
            $openedAt = (new DateTimeImmutable($candidate['session_date'] . ' ' . $candidate['opening_time'], $nowLocal->getTimezone()))->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s.u');
            // An overdue predecessor may be skipped while biometric verification
            // holds its lock. Leave the next booking queued until it can end.
            $active = $pdo->prepare("SELECT 1 FROM attendance_sessions WHERE cs_id = ? AND session_date = ? AND status = 'active'");
            $active->execute([$candidate['cs_id'], $candidate['session_date']]);
            if ($active->fetchColumn() !== false) {
                $pdo->commit();
                continue;
            }
            $update = $pdo->prepare("UPDATE attendance_sessions SET status = 'active', started_at = ?, updated_at = ? WHERE session_id = ? AND status = 'scheduled' RETURNING session_code");
            $update->execute([$openedAt, attendance_session_now_utc()->format('Y-m-d H:i:s.u'), $candidate['session_id']]);
            $code = $update->fetchColumn();
            if ($code !== false) {
                $system = ['user_id' => null, 'login_email' => null, 'role' => 'system', 'display_name' => 'Automatic session opening', 'session_id' => null];
                attendance_session_record_audit($pdo, $config, $system, $context, 'attendance_session_auto_opened', (int) $candidate['session_id'], (int) $candidate['cs_id'],
                    "Scheduled attendance session '{$code}' opened automatically.", null,
                    ['status' => 'scheduled'], ['status' => 'active']);
            }
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $e;
        }
    }
}

/**
 * Append one manual-correction history row. The caller's transaction holds the
 * attendance record lock; the record keeps its original verification_method.
 */
function attendance_record_correction_insert(
    PDO $pdo,
    int $recordId,
    string $previousStatus,
    string $newStatus,
    ?string $reason,
    int $actorUserId,
    string $actorRole
): void {
    $stmt = $pdo->prepare(
        'INSERT INTO attendance_record_corrections
            (record_id, previous_status, new_status, reason, corrected_by_user_id, corrected_by_role)
         VALUES (?, ?, ?, ?, ?, ?)'
    );
    $stmt->execute([$recordId, $previousStatus, $newStatus, $reason, $actorUserId, $actorRole]);
}

/**
 * ATT-006 Excused requests with display details. $scopeSql restricts the rows
 * (for example to one Faculty member's or Secretary's classes).
 */
function attendance_excused_requests_rows(PDO $pdo, string $scopeSql, array $params, int $limit = 200): array
{
    $stmt = $pdo->prepare(
        "SELECT xr.request_id, xr.status, xr.reason, xr.session_date, xr.session_code, xr.requested_at,
                xr.decided_at, xr.decision_note, xr.attendance_session_id,
                requester.display_name AS requested_by, decider.display_name AS decided_by,
                s.student_id, s.student_number,
                COALESCE(pi.name_prefix, s.name_prefix) AS name_prefix,
                COALESCE(pi.first_name, s.first_name) AS first_name,
                COALESCE(pi.middle_name, s.middle_name) AS middle_name,
                COALESCE(pi.last_name, s.last_name) AS last_name,
                COALESCE(pi.name_suffix, s.name_suffix) AS name_suffix,
                cs.cs_id, cs.cs_name, c.course_code,
                (SELECT r.status FROM attendance_records r
                   LEFT JOIN attendance_sessions rs ON rs.session_id = r.attendance_session_id
                  WHERE r.enrollment_id = xr.enrollment_id AND r.session_date = xr.session_date
                    AND (r.attendance_session_id = xr.attendance_session_id OR r.attendance_session_id IS NULL)
                    AND (rs.session_id IS NULL OR rs.status <> 'revoked')
                  ORDER BY r.record_id DESC LIMIT 1) AS current_status
           FROM attendance_excused_requests xr
           JOIN enrollments e ON e.enrollment_id = xr.enrollment_id
           JOIN students s ON s.student_id = e.student_id
           LEFT JOIN person_identities pi ON pi.person_id = s.person_id
           JOIN class_sections cs ON cs.cs_id = e.cs_id
           JOIN courses c ON c.course_id = cs.course_id
           JOIN user_accounts requester ON requester.user_id = xr.requested_by_user_id
           LEFT JOIN user_accounts decider ON decider.user_id = xr.decided_by_user_id
          WHERE {$scopeSql}
          ORDER BY CASE xr.status WHEN 'pending' THEN 0 ELSE 1 END, xr.requested_at DESC, xr.request_id DESC
          LIMIT " . max(1, min(500, $limit))
    );
    $stmt->execute($params);
    return array_map(static fn(array $row): array => [
        'id' => (string) $row['request_id'],
        'status' => $row['status'],
        'studentId' => (string) $row['student_id'],
        'studentNumber' => $row['student_number'],
        'studentName' => account_identity_display_name($row),
        'classId' => (string) $row['cs_id'],
        'className' => $row['cs_name'],
        'courseCode' => $row['course_code'],
        'sessionId' => $row['attendance_session_id'] !== null ? (string) $row['attendance_session_id'] : null,
        'sessionDate' => $row['session_date'],
        'sessionCode' => $row['session_code'],
        'currentStatus' => $row['current_status'],
        'reason' => $row['reason'],
        'requestedBy' => $row['requested_by'],
        'requestedAt' => attendance_session_timestamp((string) $row['requested_at']),
        'decidedBy' => $row['decided_by'],
        'decidedAt' => attendance_session_timestamp($row['decided_at'] !== null ? (string) $row['decided_at'] : null),
        'decisionNote' => $row['decision_note'],
    ], $stmt->fetchAll(PDO::FETCH_ASSOC));
}

function attendance_session_record_audit(
    PDO $pdo,
    array $config,
    array $authCtx,
    array $context,
    string $actionCode,
    int $sessionId,
    int $csId,
    string $description,
    ?string $reason,
    ?array $beforeState,
    ?array $afterState,
    string $status = 'Success'
): void {
    if (!$pdo->inTransaction()) {
        throw new AuditException('Attendance session audit requires a transaction.');
    }

    $macKey = config_key_bytes_at_least($config['audit']['mac_key_b64'], 32, 'AUDIT_MAC_KEY');
    $auditCtx = audit_begin_operation($pdo);
    audit_finish_operation($pdo, $auditCtx, [
        'module_code' => 'attendance_session',
        'action_code' => $actionCode,
        'event_status' => $status,
        'actor_user_id' => $authCtx['user_id'] ?? null,
        'actor_username' => $authCtx['login_email'] ?? null,
        'actor_role' => $authCtx['role'] ?? null,
        'actor_display_name' => $authCtx['display_name'] ?? null,
        'session_id' => $authCtx['session_id'] ?? null,
        'scope_cs_id' => $csId,
        'target_type' => 'attendance_session',
        'target_id' => (string) $sessionId,
        'description' => $description,
        'reason' => $reason,
        'http_method' => $context['http_method'] ?? null,
        'endpoint' => $context['endpoint'] ?? null,
        'request_id' => $context['request_id'] ?? null,
        'ip_address' => $context['ip_address'] ?? null,
        'user_agent' => $context['user_agent'] ?? null,
    ], $macKey, $beforeState, $afterState);
}

/**
 * Human-readable attendance session code, e.g. CS12-20260928-A1B2C3.
 * Shared by Faculty- and Secretary-started sessions.
 */
function attendance_session_code(int $csId, string $sessionDate): string
{
    return 'CS' . $csId . '-' . str_replace('-', '', $sessionDate) . '-' . strtoupper(bin2hex(random_bytes(3)));
}
