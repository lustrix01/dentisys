<?php

declare(strict_types=1);

class StudentBiometricException extends RuntimeException
{
    public readonly int $statusCode;
    public readonly string $errorCode;
    public readonly array $details;

    public function __construct(string $message, int $statusCode, string $errorCode, array $details = [], ?Throwable $previous = null)
    {
        $this->statusCode = $statusCode;
        $this->errorCode = $errorCode;
        $this->details = $details;
        parent::__construct($message, $statusCode, $previous);
    }
}

function student_biometric_authenticate(PDO $pdo, array $config): array
{
    $header = request_header('Authorization') ?? '';
    if ($header === '') {
        throw new StudentBiometricException('Authorization header required.', 401, 'AUTHENTICATION_REQUIRED');
    }

    try {
        $token = auth_extract_bearer_token($header);
        $key = config_key_bytes_at_least($config['jwt']['signing_key_b64'], 32, 'JWT_SIGNING_KEY');
        return auth_verify_access_token($pdo, $config, $token, $key);
    } catch (Throwable $e) {
        throw new StudentBiometricException($e->getMessage(), 401, 'AUTHENTICATION_REQUIRED', [], $e);
    }
}

function student_biometric_identity(PDO $pdo, array $config, array $authCtx): array
{
    if (($authCtx['role'] ?? '') === 'student') {
        $student = auth_assert_student_eligible($pdo, $config, (int) $authCtx['user_id']);
        return [
            'student_id' => (int) $student['student_id'],
            'student_number' => (string) $student['student_number'],
        ];
    }

    if (($authCtx['role'] ?? '') !== 'secretary') {
        throw new StudentBiometricException('Student self-service is unavailable for this role.', 403, 'ACCESS_DENIED');
    }

    $stmt = $pdo->prepare(
        "SELECT s.student_id, s.student_number, s.bu_email, s.status AS student_status,
                ua.login_email, ua.status AS account_status
           FROM students s
           JOIN user_accounts ua ON ua.user_id = ?
          WHERE (s.student_account_user_id = ? OR s.user_id = ?)
          ORDER BY s.student_id"
    );
    $userId = (int) $authCtx['user_id'];
    $stmt->execute([$userId, $userId, $userId]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    if (count($rows) !== 1) {
        throw new StudentBiometricException('Secretary Student identity is unavailable.', 403, 'STUDENT_IDENTITY_UNAVAILABLE');
    }
    $row = $rows[0];
    if ($row['account_status'] !== 'Active' || strtolower((string) $row['student_status']) !== 'active') {
        throw new StudentBiometricException('Student identity is not active.', 403, 'STUDENT_IDENTITY_UNAVAILABLE');
    }
    if ($row['bu_email'] === null || strtolower(trim((string) $row['bu_email'])) !== strtolower(trim((string) $row['login_email']))) {
        throw new StudentBiometricException('Secretary Student identity is unavailable.', 403, 'STUDENT_IDENTITY_UNAVAILABLE');
    }

    return [
        'student_id' => (int) $row['student_id'],
        'student_number' => (string) $row['student_number'],
    ];
}

function student_biometric_require_sidecar(array $config): void
{
    $provider = $config['providers']['biometrics'] ?? [];
    if (($provider['active'] ?? 'disabled') !== 'sidecar'
        || trim((string) ($provider['sidecar_url'] ?? '')) === ''
        || trim((string) ($provider['sidecar_shared_secret'] ?? '')) === '') {
        throw new StudentBiometricException(
            'Biometric service is unavailable. Use manual attendance or try again later.',
            503,
            'biometric_service_unavailable'
        );
    }
}

function student_biometric_profile(PDO $pdo, int $studentId, bool $forUpdate = false): ?array
{
    $sql = "SELECT profile_id, student_id, consent_status, face_enrolled,
                    consent_disclosure_version, enrolled_at, consent_responded_at,
                    revoked_at, revoked_by_user_id, recorded_by_user_id,
                    enrollment_status, protected_object_reference,
                    reference_expires_on, usable_sample_count, created_at, updated_at
               FROM biometric_profiles
              WHERE student_id = ?";
    if ($forUpdate) {
        $sql .= ' FOR UPDATE';
    }
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$studentId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row === false ? null : $row;
}

function student_biometric_snapshot(?array $row): ?array
{
    if ($row === null) {
        return null;
    }

    return [
        'profile_id' => (int) $row['profile_id'],
        'student_id' => (int) $row['student_id'],
        'consent_status' => $row['consent_status'],
        'enrollment_status' => $row['enrollment_status'],
        'face_enrolled' => (int) $row['face_enrolled'],
        'enrolled_at' => $row['enrolled_at'],
        'reference_expires_on' => $row['reference_expires_on'],
        'usable_sample_count' => $row['usable_sample_count'] !== null ? (int) $row['usable_sample_count'] : null,
    ];
}

function student_biometric_payload(?array $row, array $config): array
{
    if ($row === null) {
        return [
            'consentGranted' => false,
            'enrollmentStatus' => 'not_enrolled',
            'enrolledAt' => null,
            'expiresAt' => null,
            'usableSampleCount' => null,
            'requiredUsableSamples' => 20,
            'manualFallbackAvailable' => true,
        ];
    }

    return [
        'consentGranted' => $row['consent_status'] === 'approved',
        'enrollmentStatus' => $row['enrollment_status'],
        'enrolledAt' => $row['enrolled_at'] !== null ? attendance_session_timestamp((string) $row['enrolled_at']) : null,
        'expiresAt' => $row['reference_expires_on'],
        'usableSampleCount' => $row['usable_sample_count'] !== null ? (int) $row['usable_sample_count'] : null,
        'requiredUsableSamples' => 20,
        'manualFallbackAvailable' => true,
        'operationalTimezone' => $config['app']['operational_timezone'],
    ];
}

function student_biometric_profile_response(?array $row, array $config): array
{
    $payload = student_biometric_payload($row, $config);
    return [
        'status' => 'ok',
        'biometric' => $payload,
    ] + $payload;
}

function student_biometric_challenge_response(array $challenge): array
{
    return [
        'status' => 'ok',
        'challenge' => $challenge,
    ] + $challenge;
}

function student_attendance_record_response(
    string $resultStatus,
    string $operation,
    string $message,
    array $attendance
): array {
    return [
        'status' => $resultStatus,
        'ok' => true,
        'responseStatus' => 'ok',
        'operation' => $operation,
        'code' => $resultStatus,
        'message' => $message,
        'recordId' => $attendance['recordId'] ?? null,
        'attendanceStatus' => $resultStatus === 'already_recorded'
            ? ($attendance['status'] ?? null)
            : $resultStatus,
        'verificationMethod' => $attendance['verificationMethod'] ?? null,
        'recordedAt' => $attendance['recordedAt'] ?? null,
        'attendance' => $attendance,
    ];
}

function student_attendance_logs_response(array $records, string $timezone): array
{
    return [
        'status' => 'ok',
        'records' => $records,
        'total' => count($records),
        'logs' => $records,
        'timezone' => $timezone,
    ];
}

function student_biometric_expire_if_needed(
    PDO $pdo,
    array $config,
    array $authCtx,
    array $context,
    int $studentId,
    ?array $row = null
): ?array {
    $row ??= student_biometric_profile($pdo, $studentId, true);
    if ($row === null || $row['enrollment_status'] !== 'active' || $row['reference_expires_on'] === null) {
        return $row;
    }

    $today = app_local_date($config, attendance_session_now_utc());
    if ((string) $row['reference_expires_on'] >= $today) {
        return $row;
    }

    $update = $pdo->prepare(
        "UPDATE biometric_profiles
            SET enrollment_status = 'expired', face_enrolled = 0,
                usable_sample_count = NULL,
                updated_at = CURRENT_TIMESTAMP(6)
          WHERE profile_id = ?"
    );
    $update->execute([(int) $row['profile_id']]);
    $after = $row;
    $after['enrollment_status'] = 'expired';
    $after['face_enrolled'] = 0;
    $after['usable_sample_count'] = null;
    student_biometric_record_audit(
        $pdo, $config, $authCtx, $context, 'biometric_enrollment_expired', (int) $row['student_id'],
        'Biometric enrollment expired at the end of its academic validity period.', null,
        student_biometric_snapshot($row), student_biometric_snapshot($after)
    );
    $row = student_biometric_profile($pdo, $studentId, true);
    return $row;
}

function student_biometric_reference_expiry(PDO $pdo, int $studentId): string
{
    $stmt = $pdo->prepare(
        "SELECT MAX(cs.term_end_date)
           FROM enrollments e
           JOIN class_sections cs ON cs.cs_id = e.cs_id
          WHERE e.student_id = ?
            AND LOWER(e.status) = 'active'
            AND LOWER(cs.status) = 'active'
            AND cs.term_end_date IS NOT NULL"
    );
    $stmt->execute([$studentId]);
    $expiry = $stmt->fetchColumn();
    if (!is_string($expiry) || $expiry === '') {
        throw new StudentBiometricException(
            'Biometric enrollment requires an active academic term with an end date.',
            409,
            'biometric_reference_expiry_unavailable'
        );
    }
    return $expiry;
}

function student_biometric_actions(): array
{
    $actions = ['blink', 'turn_left', 'turn_right'];
    shuffle($actions);
    return array_slice($actions, 0, 2);
}

function student_biometric_issue_challenge(
    PDO $pdo,
    array $config,
    int $userId,
    int $studentId,
    ?int $csId,
    ?int $attendanceSessionId,
    string $purpose
): array {
    $ttl = (int) ($config['providers']['biometrics']['challenge_ttl_seconds'] ?? 0);
    if ($ttl <= 0) {
        throw new StudentBiometricException('Biometric challenge timing is not configured.', 503, 'biometric_service_unavailable');
    }
    $now = attendance_session_now_utc();
    $expires = $now->modify('+' . $ttl . ' seconds');
    $rawToken = base64url_encode(random_bytes(32));
    $actions = student_biometric_actions();
    $metadata = json_encode([
        'purpose' => $purpose,
        'attendance_session_id' => $attendanceSessionId,
        'actions' => $actions,
    ], JSON_UNESCAPED_SLASHES);
    if ($metadata === false) {
        throw new StudentBiometricException('Biometric challenge could not be created.', 500, 'biometric_challenge_failed');
    }
    $stmt = $pdo->prepare(
        "INSERT INTO security_tokens (
             purpose, user_id, related_student_id, related_cs_id, token_digest,
             issued_at, expires_at, metadata_jsonb
         ) VALUES ('biometric_challenge', ?, ?, ?, ?, ?, ?, ?::jsonb)
         RETURNING token_id"
    );
    $digest = hash('sha256', $rawToken, true);
    pdo_bind_binary($stmt, 5, $digest);
    $stmt->bindValue(1, $userId, PDO::PARAM_INT);
    $stmt->bindValue(2, $studentId, PDO::PARAM_INT);
    $stmt->bindValue(3, $csId, $csId === null ? PDO::PARAM_NULL : PDO::PARAM_INT);
    $stmt->bindValue(6, $now->format('Y-m-d H:i:s.u'), PDO::PARAM_STR);
    $stmt->bindValue(7, $expires->format('Y-m-d H:i:s.u'), PDO::PARAM_STR);
    $stmt->bindValue(8, $metadata, PDO::PARAM_STR);
    $stmt->execute();
    $tokenId = (int) $stmt->fetchColumn();

    return [
        'challengeId' => (string) $tokenId,
        'challengeToken' => $rawToken,
        'actions' => $actions,
        'expiresAt' => $expires->format('Y-m-d\\TH:i:s.u\\Z'),
    ];
}

function student_biometric_consume_challenge(
    PDO $pdo,
    int $studentId,
    string $rawToken,
    string $purpose,
    ?int $attendanceSessionId
): array {
    if ($rawToken === '') {
        throw new StudentBiometricException('Biometric challenge is required.', 422, 'challenge_invalid');
    }
    $digest = hash('sha256', $rawToken, true);
    $stmt = $pdo->prepare(
        "SELECT token_id, related_student_id, related_cs_id, expires_at, used_at, revoked_at, metadata_jsonb
           FROM security_tokens
          WHERE purpose = 'biometric_challenge'
            AND related_student_id = ?
            AND token_digest = ?
          FOR UPDATE"
    );
    pdo_bind_binary($stmt, 2, $digest);
    $stmt->execute([$studentId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($row === false) {
        throw new StudentBiometricException('Biometric challenge is invalid.', 422, 'challenge_invalid');
    }
    $metadata = json_decode((string) ($row['metadata_jsonb'] ?? '{}'), true);
    if (!is_array($metadata) || ($metadata['purpose'] ?? null) !== $purpose) {
        throw new StudentBiometricException('Biometric challenge is invalid.', 422, 'challenge_invalid');
    }
    if ($attendanceSessionId !== null && (int) ($metadata['attendance_session_id'] ?? 0) !== $attendanceSessionId) {
        throw new StudentBiometricException('Biometric challenge is invalid for this session.', 422, 'challenge_invalid');
    }
    if ($row['used_at'] !== null || $row['revoked_at'] !== null) {
        throw new StudentBiometricException('Biometric challenge has already been used.', 422, 'challenge_invalid');
    }
    $now = attendance_session_now_utc();
    if (new DateTimeImmutable((string) $row['expires_at'], new DateTimeZone('UTC')) <= $now) {
        throw new StudentBiometricException('Biometric challenge has expired.', 422, 'challenge_expired');
    }
    $update = $pdo->prepare("UPDATE security_tokens SET used_at = ? WHERE token_id = ? AND used_at IS NULL");
    $update->execute([$now->format('Y-m-d H:i:s.u'), (int) $row['token_id']]);
    if ($update->rowCount() !== 1) {
        throw new StudentBiometricException('Biometric challenge has already been used.', 422, 'challenge_invalid');
    }
    return [
        'tokenId' => (int) $row['token_id'],
        'actions' => array_values($metadata['actions'] ?? []),
        'relatedCsId' => $row['related_cs_id'] !== null ? (int) $row['related_cs_id'] : null,
    ];
}

function student_biometric_uploaded_frames(): array
{
    $files = $_FILES['frames'] ?? $_FILES['samples'] ?? null;
    if (!is_array($files)) {
        throw new StudentBiometricException('At least one biometric frame is required.', 422, 'VALIDATION_ERROR');
    }
    $names = is_array($files['name'] ?? null) ? $files['name'] : [$files['name'] ?? 'frame'];
    $tmpNames = is_array($files['tmp_name'] ?? null) ? $files['tmp_name'] : [$files['tmp_name'] ?? ''];
    $errors = is_array($files['error'] ?? null) ? $files['error'] : [$files['error'] ?? UPLOAD_ERR_NO_FILE];
    $sizes = is_array($files['size'] ?? null) ? $files['size'] : [$files['size'] ?? 0];
    $frames = [];
    foreach ($tmpNames as $index => $tmpName) {
        if (($errors[$index] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK || !is_file((string) $tmpName)) {
            throw new StudentBiometricException('A biometric frame could not be uploaded.', 422, 'VALIDATION_ERROR');
        }
        if ((int) ($sizes[$index] ?? 0) <= 0 || (int) ($sizes[$index] ?? 0) > 10 * 1024 * 1024) {
            throw new StudentBiometricException('Biometric frame size is invalid.', 422, 'VALIDATION_ERROR');
        }
        $frames[] = [
            'path' => (string) $tmpName,
            'name' => basename((string) ($names[$index] ?? 'frame')),
        ];
    }
    if ($frames === [] || count($frames) > 30) {
        throw new StudentBiometricException('An enrollment operation accepts between one and thirty frames.', 422, 'VALIDATION_ERROR');
    }
    return $frames;
}

function student_biometric_sidecar_request(array $config, string $path, array $fields, array $files = []): array
{
    student_biometric_require_sidecar($config);
    $provider = $config['providers']['biometrics'];
    $boundary = '----DentiSysBiometric' . bin2hex(random_bytes(12));
    $body = '';
    foreach ($fields as $name => $value) {
        $body .= "--{$boundary}\r\n";
        $body .= 'Content-Disposition: form-data; name="' . addcslashes((string) $name, '"\\') . "\"\r\n\r\n";
        $body .= (string) $value . "\r\n";
    }
    foreach ($files as $file) {
        $content = file_get_contents($file['path']);
        if ($content === false) {
            throw new StudentBiometricException('Biometric frame could not be read.', 422, 'VALIDATION_ERROR');
        }
        $name = addcslashes((string) ($file['field'] ?? 'frames'), '"\\');
        $filename = addcslashes((string) ($file['name'] ?? 'frame'), '"\\');
        $body .= "--{$boundary}\r\n";
        $body .= "Content-Disposition: form-data; name=\"{$name}\"; filename=\"{$filename}\"\r\n";
        $body .= "Content-Type: application/octet-stream\r\n\r\n";
        $body .= $content . "\r\n";
    }
    $body .= "--{$boundary}--\r\n";
    $url = rtrim((string) $provider['sidecar_url'], '/') . '/' . ltrim($path, '/');
    $headers = [
        'Content-Type: multipart/form-data; boundary=' . $boundary,
        'Content-Length: ' . strlen($body),
        'X-DentiSys-Sidecar-Secret: ' . (string) $provider['sidecar_shared_secret'],
    ];
    $context = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => implode("\r\n", $headers),
            'content' => $body,
            'timeout' => max(1, (int) ($provider['request_timeout_seconds'] ?? 20)),
            'ignore_errors' => true,
        ],
    ]);
    $response = @file_get_contents($url, false, $context);
    $status = 0;
    foreach ($http_response_header ?? [] as $header) {
        if (preg_match('/^HTTP\/\S+\s+(\d+)/i', $header, $matches)) {
            $status = (int) $matches[1];
            break;
        }
    }
    $decoded = is_string($response) ? json_decode($response, true) : null;
    if (!is_array($decoded)) {
        throw new StudentBiometricException('Biometric service is unavailable. Use manual attendance or try again later.', 503, 'biometric_service_unavailable');
    }
    if ($status < 200 || $status >= 300 || ($decoded['ok'] ?? false) !== true) {
        $code = is_string($decoded['code'] ?? null) ? $decoded['code'] : 'biometric_service_unavailable';
        $allowed = ['liveness_failed', 'biometric_verification_failed', 'biometric_service_unavailable', 'quality_failed'];
        if (!in_array($code, $allowed, true)) {
            $code = 'biometric_service_unavailable';
        }
        throw new StudentBiometricException((string) ($decoded['message'] ?? 'Biometric verification failed.'), $status >= 400 && $status < 500 ? $status : 503, $code);
    }
    return $decoded;
}

function student_biometric_sidecar_revoke(array $config, string $reference): void
{
    student_biometric_require_sidecar($config);
    $provider = $config['providers']['biometrics'];
    $payload = json_encode(['protectedObjectReference' => $reference], JSON_UNESCAPED_SLASHES);
    if ($payload === false) {
        throw new StudentBiometricException('Biometric service request could not be created.', 503, 'biometric_service_unavailable');
    }
    $url = rtrim((string) $provider['sidecar_url'], '/') . '/v1/reference/revoke';
    $context = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => "Content-Type: application/json\r\nX-DentiSys-Sidecar-Secret: " . (string) $provider['sidecar_shared_secret'],
            'content' => $payload,
            'timeout' => max(1, (int) ($provider['request_timeout_seconds'] ?? 20)),
            'ignore_errors' => true,
        ],
    ]);
    $response = @file_get_contents($url, false, $context);
    $decoded = is_string($response) ? json_decode($response, true) : null;
    if (!is_array($decoded) || ($decoded['ok'] ?? false) !== true) {
        throw new StudentBiometricException('Biometric reference could not be revoked. Use manual attendance until it is resolved.', 503, 'biometric_service_unavailable');
    }
}

function student_biometric_haversine_meters(float $lat1, float $lon1, float $lat2, float $lon2): float
{
    $earthRadius = 6371000.0;
    $latDelta = deg2rad($lat2 - $lat1);
    $lonDelta = deg2rad($lon2 - $lon1);
    $a = sin($latDelta / 2) ** 2
        + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($lonDelta / 2) ** 2;
    return $earthRadius * 2 * atan2(sqrt($a), sqrt(max(0.0, 1 - $a)));
}

function student_biometric_geofence_passes(array $session, ?float $latitude, ?float $longitude): bool
{
    if (!attendance_session_bool($session['geofence_enabled'] ?? false)) {
        return true;
    }
    if ($latitude === null || $longitude === null
        || $session['geofence_latitude'] === null || $session['geofence_longitude'] === null
        || $session['geofence_radius_meters'] === null) {
        return false;
    }
    return student_biometric_haversine_meters(
        $latitude,
        $longitude,
        (float) $session['geofence_latitude'],
        (float) $session['geofence_longitude']
    ) <= (float) $session['geofence_radius_meters'];
}

function student_biometric_record_audit(
    PDO $pdo,
    array $config,
    array $authCtx,
    array $context,
    string $actionCode,
    int $studentId,
    string $description,
    ?string $reason,
    ?array $beforeState,
    ?array $afterState,
    string $status = 'Success'
): void {
    if (!$pdo->inTransaction()) {
        throw new AuditException('Student biometric audit requires a transaction.');
    }
    $macKey = config_key_bytes_at_least($config['audit']['mac_key_b64'], 32, 'AUDIT_MAC_KEY');
    $auditCtx = audit_begin_operation($pdo);
    audit_finish_operation($pdo, $auditCtx, [
        'module_code' => 'student_biometric',
        'action_code' => $actionCode,
        'event_status' => $status,
        'actor_user_id' => $authCtx['user_id'] ?? null,
        'actor_username' => $authCtx['login_email'] ?? null,
        'actor_role' => $authCtx['role'] ?? null,
        'actor_display_name' => $authCtx['display_name'] ?? null,
        'session_id' => $authCtx['session_id'] ?? null,
        'scope_cs_id' => $context['scope_cs_id'] ?? null,
        'target_type' => 'student_biometric_profile',
        'target_id' => (string) $studentId,
        'description' => $description,
        'reason' => $reason,
        'http_method' => $context['http_method'] ?? null,
        'endpoint' => $context['endpoint'] ?? null,
        'request_id' => $context['request_id'] ?? null,
        'ip_address' => $context['ip_address'] ?? null,
        'user_agent' => $context['user_agent'] ?? null,
    ], $macKey, $beforeState, $afterState);
}
