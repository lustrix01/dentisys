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
                    s.late_cutoff_time, s.revoked_at, s.revoked_by_user_id,
                    s.revocation_reason, s.created_at, s.updated_at,
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
                    s.late_cutoff_time, s.revoked_at, s.revoked_by_user_id,
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
            AND NOT EXISTS (
                SELECT 1 FROM attendance_records r
                 WHERE r.enrollment_id = e.enrollment_id
                   AND r.attendance_session_id = s.session_id
            )
         ON CONFLICT DO NOTHING"
    );
    $stmt->execute([$nowSql, $nowSql, $sessionId]);
    return $stmt->rowCount();
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
