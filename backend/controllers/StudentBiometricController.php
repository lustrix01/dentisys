<?php

declare(strict_types=1);

function student_biometric_http_context(): array
{
    return [
        'request_id' => request_id(),
        'ip_address' => request_ip(),
        'user_agent' => request_user_agent(),
        'http_method' => request_method(),
        'endpoint' => request_path(),
    ];
}

function student_biometric_emit_exception(Throwable $e): void
{
    if ($e instanceof ValidationException) {
        validation_error_response($e->getErrors());
        return;
    }
    if ($e instanceof StudentBiometricException) {
        emit_response(build_error_response($e->getMessage(), $e->statusCode, $e->errorCode));
        return;
    }
    if ($e instanceof AuthException) {
        emit_response(build_error_response($e->getMessage(), 401, 'AUTHENTICATION_REQUIRED'));
        return;
    }
    error_log('Student biometric error: ' . sanitize_for_log($e));
    safe_error_response('Internal server error.', 500);
}

function student_biometric_controller_context(): array
{
    $config = app_config();
    $pdo = create_pdo($config);
    $authCtx = student_biometric_authenticate($pdo, $config);
    $identity = student_biometric_identity($pdo, $config, $authCtx);
    return [$config, $pdo, $authCtx, $identity];
}

function student_biometric_form_alias(string $primary, string $alias): string
{
    $primaryPresent = array_key_exists($primary, $_POST);
    $aliasPresent = array_key_exists($alias, $_POST);
    $primaryValue = $primaryPresent ? trim((string) $_POST[$primary]) : null;
    $aliasValue = $aliasPresent ? trim((string) $_POST[$alias]) : null;
    if ($primaryValue !== null && $aliasValue !== null && $primaryValue !== $aliasValue) {
        throw new StudentBiometricException("{$primary} and {$alias} must match.", 422, 'VALIDATION_ERROR');
    }
    return $primaryValue ?? $aliasValue ?? '';
}

function student_biometric_failure_audit(
    array $config,
    array $authCtx,
    array $context,
    int $studentId,
    string $action,
    string $reason,
    ?int $scopeCsId = null
): void {
    try {
        $pdo = create_pdo($config);
        $pdo->beginTransaction();
        $context['scope_cs_id'] = $scopeCsId;
        student_biometric_record_audit(
            $pdo, $config, $authCtx, $context, $action, $studentId,
            'Student biometric operation failed.', $reason, null, null, 'Failed'
        );
        $pdo->commit();
    } catch (Throwable $e) {
        error_log('Student biometric failure audit skipped: ' . sanitize_for_log($e));
    }
}

function handle_student_biometric_profile_get(): void
{
    $context = student_biometric_http_context();
    try {
        [$config, $pdo, $authCtx, $identity] = student_biometric_controller_context();
        $pdo->beginTransaction();
        try {
            $row = student_biometric_profile($pdo, $identity['student_id'], true);
            $row = student_biometric_expire_if_needed($pdo, $config, $authCtx, $context, $identity['student_id'], $row);
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) { $pdo->rollBack(); }
            throw $e;
        }
        json_response(student_biometric_profile_response($row, $config), 200);
    } catch (Throwable $e) {
        student_biometric_emit_exception($e);
    }
}

function handle_student_biometric_consent(): void
{
    $context = student_biometric_http_context();
    try {
        [$config, $pdo, $authCtx, $identity] = student_biometric_controller_context();
        $body = request_body();
        if (!$body['has_body']) {
            throw new StudentBiometricException('Request body required.', 400, 'BAD_REQUEST');
        }
        $granted = filter_var($body['data']['granted'] ?? null, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
        $disclosureVersion = trim((string) ($body['data']['disclosureVersion'] ?? ''));
        if ($granted === null || $disclosureVersion === '' || strlen($disclosureVersion) > 100) {
            throw new ValidationException([['field' => 'granted', 'message' => 'A boolean consent decision and disclosure version are required.']]);
        }
        if (!$granted) {
            $existing = student_biometric_profile($pdo, $identity['student_id']);
            if ($existing !== null && $existing['protected_object_reference'] !== null) {
                student_biometric_require_sidecar($config);
                student_biometric_sidecar_revoke($config, (string) $existing['protected_object_reference']);
            }
        }
        $now = attendance_session_now_utc()->format('Y-m-d H:i:s.u');
        $pdo->beginTransaction();
        try {
            $row = student_biometric_profile($pdo, $identity['student_id'], true);
            $before = student_biometric_snapshot($row);
            if ($row === null) {
                $insert = $pdo->prepare(
                    "INSERT INTO biometric_profiles (
                         student_id, consent_status, face_enrolled,
                         consent_disclosure_version, consent_responded_at,
                         enrollment_status, recorded_by_user_id, created_at, updated_at
                     ) VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?)"
                );
                $insert->execute([
                    $identity['student_id'],
                    $granted ? 'approved' : 'declined',
                    $disclosureVersion,
                    $now,
                    $granted ? 'not_enrolled' : 'revoked',
                    $authCtx['user_id'],
                    $now,
                    $now,
                ]);
            } elseif ($granted) {
                $status = in_array($row['enrollment_status'], ['revoked', 'expired'], true)
                    ? 'not_enrolled'
                    : $row['enrollment_status'];
                $update = $pdo->prepare(
                    "UPDATE biometric_profiles
                        SET consent_status = 'approved', consent_disclosure_version = ?,
                            consent_responded_at = ?, enrollment_status = ?,
                            revoked_at = NULL, revoked_by_user_id = NULL,
                            recorded_by_user_id = ?, updated_at = ?
                      WHERE profile_id = ?"
                );
                $update->execute([$disclosureVersion, $now, $status, $authCtx['user_id'], $now, (int) $row['profile_id']]);
            } else {
                $update = $pdo->prepare(
                    "UPDATE biometric_profiles
                        SET consent_status = 'declined', consent_disclosure_version = ?,
                            consent_responded_at = ?, enrollment_status = 'revoked',
                            face_enrolled = 0, template_reference = NULL,
                            image_references = NULL, protected_object_reference = NULL,
                            reference_expires_on = NULL, usable_sample_count = NULL,
                            revoked_at = ?, revoked_by_user_id = ?, recorded_by_user_id = ?,
                            updated_at = ?
                      WHERE profile_id = ?"
                );
                $update->execute([$disclosureVersion, $now, $now, $authCtx['user_id'], $authCtx['user_id'], $now, (int) $row['profile_id']]);
            }
            $row = student_biometric_profile($pdo, $identity['student_id'], true);
            student_biometric_record_audit(
                $pdo, $config, $authCtx, $context,
                $granted ? 'biometric_consent_granted' : 'biometric_consent_revoked',
                $identity['student_id'],
                $granted ? 'Student granted biometric consent.' : 'Student revoked biometric consent.',
                null, $before, student_biometric_snapshot($row)
            );
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) { $pdo->rollBack(); }
            throw $e;
        }
        json_response(student_biometric_profile_response($row, $config), 200);
    } catch (Throwable $e) {
        student_biometric_emit_exception($e);
    }
}

function handle_student_biometric_challenge(): void
{
    try {
        [$config, $pdo, $authCtx, $identity] = student_biometric_controller_context();
        student_biometric_require_sidecar($config);
        $body = request_body();
        $data = $body['has_body'] ? $body['data'] : [];
        $purpose = (string) ($data['purpose'] ?? '');
        if (!in_array($purpose, ['enrollment', 'attendance'], true)) {
            throw new ValidationException([['field' => 'purpose', 'message' => 'Purpose must be enrollment or attendance.']]);
        }
        $attendanceSessionId = null;
        $csId = null;
        if ($purpose === 'attendance') {
            $attendanceSessionId = ctype_digit((string) ($data['attendanceSessionId'] ?? ''))
                ? (int) $data['attendanceSessionId']
                : 0;
            if ($attendanceSessionId <= 0) {
                throw new ValidationException([['field' => 'attendanceSessionId', 'message' => 'A valid attendance session is required.']]);
            }
            $session = attendance_session_fetch_for_student($pdo, $attendanceSessionId, $identity['student_id']);
            if ($session === null) {
                throw new StudentBiometricException('Attendance session is not active for this Student.', 409, 'session_not_active');
            }
            $decision = attendance_session_timing_decision($session, attendance_session_now_utc(), $config);
            if (!$decision['allowed']) {
                throw new StudentBiometricException('Attendance capture is not available for this session.', 409, (string) $decision['code']);
            }
            $csId = (int) $session['cs_id'];
        } else {
            $profile = student_biometric_profile($pdo, $identity['student_id']);
            if ($profile !== null && $profile['consent_status'] !== 'approved') {
                throw new StudentBiometricException('Biometric consent is required before enrollment.', 409, 'consent_required');
            }
            if ($profile !== null && $profile['enrollment_status'] === 'enrolling') {
                throw new StudentBiometricException(
                    'A biometric enrollment operation is already in progress. Retry after it finishes.',
                    409,
                    'biometric_enrollment_in_progress'
                );
            }
        }
        $challenge = student_biometric_issue_challenge(
            $pdo, $config, (int) $authCtx['user_id'], $identity['student_id'], $csId, $attendanceSessionId, $purpose
        );
        json_response(student_biometric_challenge_response($challenge), 201);
    } catch (Throwable $e) {
        student_biometric_emit_exception($e);
    }
}

function handle_student_biometric_guidance(): void
{
    try {
        [$config, $pdo, $authCtx, $identity] = student_biometric_controller_context();
        student_biometric_require_sidecar($config);
        $purpose = trim((string) ($_POST['purpose'] ?? ''));
        if (!in_array($purpose, ['enrollment', 'attendance'], true)) {
            throw new ValidationException([['field' => 'purpose', 'message' => 'Purpose must be enrollment or attendance.']]);
        }
        $attendanceSessionId = null;
        if ($purpose === 'attendance') {
            $rawSessionId = trim((string) ($_POST['attendanceSessionId'] ?? $_POST['sessionId'] ?? ''));
            $attendanceSessionId = ctype_digit($rawSessionId) ? (int) $rawSessionId : 0;
            if ($attendanceSessionId <= 0) {
                throw new ValidationException([['field' => 'attendanceSessionId', 'message' => 'A valid attendance session is required.']]);
            }
        }
        $challengeId = student_biometric_form_alias('challengeId', 'challenge_id');
        $challengeToken = student_biometric_form_alias('challengeToken', 'challenge_token');
        $frames = student_biometric_uploaded_frames();
        if (count($frames) !== 1) {
            throw new StudentBiometricException('Exactly one guidance frame is required.', 422, 'quality_failed');
        }
        student_biometric_validate_guidance_challenge(
            $pdo,
            $identity['student_id'],
            $challengeToken,
            $purpose,
            $attendanceSessionId,
            $challengeId
        );
        json_response(student_biometric_sidecar_guidance($config, $frames[0]), 200);
    } catch (Throwable $e) {
        student_biometric_emit_exception($e);
    }
}

function handle_student_biometric_enrollment(): void
{
    $context = student_biometric_http_context();
    $previous = null;
    $studentId = 0;
    $authCtx = [];
    $config = [];
    $reference = null;
    $challengeTokenId = null;
    $idempotencyKey = null;
    try {
        [$config, $pdo, $authCtx, $identity] = student_biometric_controller_context();
        $studentId = $identity['student_id'];
        student_biometric_require_sidecar($config);
        $frames = student_biometric_uploaded_frames();
        if (count($frames) < 20) {
            throw new StudentBiometricException('At least twenty usable enrollment samples are required.', 422, 'enrollment_samples_insufficient');
        }
        $challengeId = student_biometric_challenge_id(student_biometric_form_alias('challengeId', 'challenge_id'));
        $challengeToken = student_biometric_form_alias('challengeToken', 'challenge_token');
        if ($challengeToken === '') {
            throw new StudentBiometricException('Biometric enrollment challenge is required.', 422, 'challenge_invalid');
        }
        $idempotencyValue = student_biometric_form_alias('idempotencyKey', 'idempotency_key');
        $idempotencyKey = student_biometric_idempotency_key($idempotencyValue !== '' ? $idempotencyValue : request_header('Idempotency-Key') ?? '');
        $pdo->beginTransaction();
        try {
            $previous = student_biometric_profile($pdo, $studentId, true);
            if ($previous === null || $previous['consent_status'] !== 'approved') {
                $pdo->rollBack();
                throw new StudentBiometricException('Biometric consent is required before enrollment.', 409, 'consent_required');
            }
            if ($previous['enrollment_status'] === 'enrolling') {
                throw new StudentBiometricException(
                    'A biometric enrollment operation is already in progress. Retry after it finishes.',
                    409,
                    'biometric_enrollment_in_progress'
                );
            }
            $challenge = student_biometric_consume_challenge(
                $pdo,
                $studentId,
                $challengeToken,
                'enrollment',
                null,
                $challengeId,
                $idempotencyKey
            );
            $challengeTokenId = (int) $challenge['tokenId'];
            if (($challenge['replayed'] ?? false) === true) {
                $replayedProfile = student_biometric_profile($pdo, $studentId, true);
                if ($replayedProfile !== null
                    && $replayedProfile['enrollment_status'] === 'active'
                    && $replayedProfile['protected_object_reference'] !== null) {
                    $pdo->commit();
                    json_response(student_biometric_profile_response($replayedProfile, $config), 200);
                    return;
                }
                throw new StudentBiometricException(
                    'The biometric operation already completed without an active enrollment. Request a new challenge.',
                    409,
                    'idempotency_conflict'
                );
            }
            $before = student_biometric_snapshot($previous);
            $update = $pdo->prepare("UPDATE biometric_profiles SET enrollment_status = 'enrolling', updated_at = ? WHERE profile_id = ?");
            $update->execute([attendance_session_now_utc()->format('Y-m-d H:i:s.u'), (int) $previous['profile_id']]);
            student_biometric_record_audit(
                $pdo, $config, $authCtx, $context, 'biometric_enrollment_started', $studentId,
                'Student biometric enrollment started.', null, $before, $before
            );
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) { $pdo->rollBack(); }
            throw $e;
        }

        $sidecar = student_biometric_sidecar_request($config, '/v1/enrollment', [
            'studentId' => (string) $studentId,
            'challengeActions' => json_encode($challenge['actions'], JSON_UNESCAPED_SLASHES),
        ], array_map(static fn(array $frame): array => $frame + ['field' => 'frames'], $frames));
        $reference = trim((string) ($sidecar['protectedObjectReference'] ?? ''));
        $usable = (int) ($sidecar['usableSampleCount'] ?? 0);
        if ($reference === '' || $usable < 20 || $usable > 30) {
            throw new StudentBiometricException('Biometric enrollment did not produce a valid protected reference.', 503, 'biometric_service_unavailable');
        }
        $expiresOn = student_biometric_reference_expiry($pdo, $studentId);
        $nowSql = attendance_session_now_utc()->format('Y-m-d H:i:s.u');
        $pdo->beginTransaction();
        try {
            $row = student_biometric_profile($pdo, $studentId, true);
            $before = student_biometric_snapshot($row);
            $update = $pdo->prepare(
                "UPDATE biometric_profiles
                    SET enrollment_status = 'active', face_enrolled = 1,
                        protected_object_reference = ?, reference_expires_on = ?,
                        usable_sample_count = ?, enrolled_at = ?, revoked_at = NULL,
                        revoked_by_user_id = NULL, template_reference = NULL,
                        image_references = NULL, updated_at = ?
                  WHERE profile_id = ?"
            );
            $update->execute([$reference, $expiresOn, $usable, $nowSql, $nowSql, (int) $row['profile_id']]);
            $row = student_biometric_profile($pdo, $studentId, true);
            student_biometric_complete_challenge($pdo, $challengeTokenId, (string) $idempotencyKey);
            student_biometric_record_audit(
                $pdo, $config, $authCtx, $context, 'biometric_enrollment_succeeded', $studentId,
                'Student biometric enrollment succeeded.', null, $before, student_biometric_snapshot($row)
            );
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) { $pdo->rollBack(); }
            if ($reference !== null) {
                try { student_biometric_sidecar_revoke($config, $reference); } catch (Throwable) { }
            }
            throw $e;
        }
        if ($previous !== null
            && $previous['protected_object_reference'] !== null
            && $previous['protected_object_reference'] !== $reference) {
            try {
                student_biometric_sidecar_revoke($config, (string) $previous['protected_object_reference']);
            } catch (Throwable $cleanupError) {
                error_log('Previous biometric reference cleanup deferred: ' . sanitize_for_log($cleanupError));
            }
        }
        json_response(student_biometric_profile_response($row, $config), 201);
    } catch (Throwable $e) {
        if ($reference !== null) {
            try {
                student_biometric_sidecar_revoke($config, $reference);
            } catch (Throwable $cleanupError) {
                error_log('Biometric enrollment reference cleanup skipped: ' . sanitize_for_log($cleanupError));
            }
        }
        if ($studentId > 0 && $previous !== null && $authCtx !== [] && $config !== []) {
            try {
                $restorePdo = create_pdo($config);
                $restorePdo->beginTransaction();
                $restore = $restorePdo->prepare(
                    "UPDATE biometric_profiles
                        SET enrollment_status = ?, face_enrolled = ?, protected_object_reference = ?,
                            reference_expires_on = ?, usable_sample_count = ?, enrolled_at = ?, updated_at = ?
                      WHERE profile_id = ?"
                );
                $restore->execute([
                    $previous['enrollment_status'], (int) $previous['face_enrolled'], $previous['protected_object_reference'],
                    $previous['reference_expires_on'], $previous['usable_sample_count'], $previous['enrolled_at'],
                    attendance_session_now_utc()->format('Y-m-d H:i:s.u'), (int) $previous['profile_id'],
                ]);
                if ($challengeTokenId !== null && $idempotencyKey !== null) {
                    $terminalChallengeFailure = $e instanceof StudentBiometricException
                        && in_array($e->errorCode, ['liveness_failed', 'quality_failed', 'biometric_verification_failed'], true);
                    if ($terminalChallengeFailure) {
                        student_biometric_fail_challenge($restorePdo, $challengeTokenId, $idempotencyKey);
                    } else {
                        student_biometric_reset_challenge_for_retry($restorePdo, $challengeTokenId, $idempotencyKey);
                    }
                }
                student_biometric_record_audit(
                    $restorePdo, $config, $authCtx, $context, 'biometric_enrollment_failed', $studentId,
                    'Student biometric enrollment failed.', $e instanceof StudentBiometricException ? $e->errorCode : 'biometric_service_unavailable',
                    student_biometric_snapshot($previous), student_biometric_snapshot($previous), 'Failed'
                );
                $restorePdo->commit();
            } catch (Throwable $auditError) {
                error_log('Student biometric enrollment rollback audit skipped: ' . sanitize_for_log($auditError));
            }
        }
        student_biometric_emit_exception($e);
    }
}

function handle_student_biometric_revoke(): void
{
    $context = student_biometric_http_context();
    try {
        [$config, $pdo, $authCtx, $identity] = student_biometric_controller_context();
        $row = student_biometric_profile($pdo, $identity['student_id']);
        if ($row !== null && $row['protected_object_reference'] !== null) {
            student_biometric_sidecar_revoke($config, (string) $row['protected_object_reference']);
        }
        $now = attendance_session_now_utc()->format('Y-m-d H:i:s.u');
        $pdo->beginTransaction();
        try {
            $row = student_biometric_profile($pdo, $identity['student_id'], true);
            if ($row === null) {
                $pdo->commit();
                json_response(student_biometric_profile_response(null, $config), 200);
                return;
            }
            $before = student_biometric_snapshot($row);
            $update = $pdo->prepare(
                "UPDATE biometric_profiles
                    SET consent_status = 'declined', enrollment_status = 'revoked', face_enrolled = 0,
                        template_reference = NULL, image_references = NULL, protected_object_reference = NULL,
                        reference_expires_on = NULL, usable_sample_count = NULL, revoked_at = ?,
                        revoked_by_user_id = ?, consent_responded_at = ?, updated_at = ?
                  WHERE profile_id = ?"
            );
            $update->execute([$now, $authCtx['user_id'], $now, $now, (int) $row['profile_id']]);
            $row = student_biometric_profile($pdo, $identity['student_id'], true);
            student_biometric_record_audit(
                $pdo, $config, $authCtx, $context, 'biometric_enrollment_revoked', $identity['student_id'],
                'Student biometric enrollment was revoked and deleted.', null, $before, student_biometric_snapshot($row)
            );
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) { $pdo->rollBack(); }
            throw $e;
        }
        json_response(student_biometric_profile_response($row, $config), 200);
    } catch (Throwable $e) {
        student_biometric_emit_exception($e);
    }
}

function handle_student_attendance_active_sessions(): void
{
    try {
        [$config, $pdo, $authCtx, $identity] = student_biometric_controller_context();
        $stmt = $pdo->prepare(
            "SELECT s.session_id, s.cs_id, s.secretary_user_id, s.owner_user_id,
                    s.session_date, s.session_code, s.room, s.started_at, s.ended_at,
                    s.status, s.geofence_enabled, s.geofence_latitude, s.geofence_longitude,
                    s.geofence_radius_meters, s.biometric_required, s.opening_time,
                    s.present_cutoff_time, s.late_cutoff_time, s.revoked_at,
                    s.revoked_by_user_id, s.revocation_reason, s.created_at, s.updated_at,
                    cs.cs_name, cs.block, c.course_id, c.course_code, c.name AS course_name,
                    u.display_name AS instructor_name, r.record_id, r.status AS record_status
               FROM attendance_sessions s
               JOIN class_sections cs ON cs.cs_id = s.cs_id
               JOIN courses c ON c.course_id = cs.course_id
               JOIN enrollments e ON e.cs_id = cs.cs_id AND e.student_id = ? AND e.status = 'Active'
               LEFT JOIN user_accounts u ON u.user_id = cs.instructor_user_id
               LEFT JOIN attendance_records r ON r.attendance_session_id = s.session_id AND r.enrollment_id = e.enrollment_id
              WHERE s.status = 'active'
              ORDER BY s.session_date DESC, s.started_at DESC"
        );
        $stmt->execute([$identity['student_id']]);
        $now = attendance_session_now_utc();
        $sessions = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $decision = attendance_session_timing_decision($row, $now, $config);
            $payload = attendance_session_map($row, false);
            $payload['captureOpen'] = $decision['allowed'];
            $payload['captureStatus'] = $decision['allowed'] ? $decision['status'] : $decision['code'];
            $payload['window'] = [
                'openingTime' => $payload['openingTime'],
                'presentCutoff' => $payload['presentCutoff'],
                'lateCutoff' => $payload['lateCutoff'],
                'timezone' => $config['app']['operational_timezone'],
            ];
            $payload['alreadyRecordedStatus'] = $row['record_status'] ?? null;
            $sessions[] = $payload;
        }
        json_response(['status' => 'ok', 'sessions' => $sessions, 'timezone' => $config['app']['operational_timezone']], 200);
    } catch (Throwable $e) {
        student_biometric_emit_exception($e);
    }
}

function student_biometric_post_float(string $field, ?float $minimum = null, ?float $maximum = null): ?float
{
    if (!array_key_exists($field, $_POST) || $_POST[$field] === '') {
        return null;
    }
    if (!is_numeric($_POST[$field]) || !is_finite((float) $_POST[$field])) {
        throw new StudentBiometricException('Location value is invalid.', 422, 'VALIDATION_ERROR');
    }
    $value = (float) $_POST[$field];
    if (($minimum !== null && $value < $minimum) || ($maximum !== null && $value > $maximum)) {
        throw new StudentBiometricException('Location value is invalid.', 422, 'VALIDATION_ERROR');
    }
    return $value;
}

function handle_student_attendance_biometric(): void
{
    $context = student_biometric_http_context();
    $studentId = 0;
    $authCtx = [];
    $config = [];
    try {
        [$config, $pdo, $authCtx, $identity] = student_biometric_controller_context();
        $studentId = $identity['student_id'];
        student_biometric_require_sidecar($config);
        $sessionId = ctype_digit((string) ($_POST['attendanceSessionId'] ?? $_POST['sessionId'] ?? ''))
            ? (int) ($_POST['attendanceSessionId'] ?? $_POST['sessionId'])
            : 0;
        if ($sessionId <= 0) {
            throw new StudentBiometricException('A valid attendance session is required.', 422, 'VALIDATION_ERROR');
        }
        $challengeToken = student_biometric_form_alias('challengeToken', 'challenge_token');
        $challengeId = student_biometric_challenge_id(student_biometric_form_alias('challengeId', 'challenge_id'));
        $idempotencyValue = student_biometric_form_alias('idempotencyKey', 'idempotency_key');
        $idempotencyKey = student_biometric_idempotency_key($idempotencyValue !== '' ? $idempotencyValue : request_header('Idempotency-Key') ?? '');
        $frames = student_biometric_uploaded_frames();
        $latitude = student_biometric_post_float('latitude', -90, 90);
        $longitude = student_biometric_post_float('longitude', -180, 180);
        $pdo->beginTransaction();
        try {
            $session = attendance_session_fetch_for_student($pdo, $sessionId, $studentId, true);
            if ($session === null || strtolower((string) $session['status']) !== 'active') {
                $pdo->rollBack();
                throw new StudentBiometricException('Attendance session is not active for this Student.', 409, 'session_not_active');
            }
            $existingStmt = $pdo->prepare(
                "SELECT r.record_id, r.status
                   FROM attendance_records r
                  WHERE r.attendance_session_id = ? AND r.enrollment_id = ?
                  LIMIT 1"
            );
            $existingStmt->execute([$sessionId, (int) $session['enrollment_id']]);
            $existing = $existingStmt->fetch(PDO::FETCH_ASSOC);
            if ($existing !== false) {
                $pdo->rollBack();
                $attendance = ['recordId' => (string) $existing['record_id'], 'status' => $existing['status']];
                $response = student_attendance_record_response(
                    'already_recorded',
                    'already_recorded',
                    'Attendance was already recorded for this session.',
                    $attendance
                );
                json_response($response, 200);
                return;
            }
            $decision = attendance_session_timing_decision($session, attendance_session_now_utc(), $config);
            if (!$decision['allowed']) {
                $pdo->rollBack();
                throw new StudentBiometricException('Attendance capture is not available for this session.', 409, (string) $decision['code']);
            }
            $profile = student_biometric_expire_if_needed($pdo, $config, $authCtx, $context, $studentId);
            if ($profile === null || $profile['consent_status'] !== 'approved') {
                $pdo->rollBack();
                throw new StudentBiometricException('Biometric consent is required before attendance capture.', 409, 'consent_required');
            }
            if ($profile['enrollment_status'] === 'expired') {
                $pdo->rollBack();
                throw new StudentBiometricException('Biometric enrollment has expired.', 409, 'enrollment_expired');
            }
            if ($profile['enrollment_status'] !== 'active' || $profile['protected_object_reference'] === null) {
                $pdo->rollBack();
                throw new StudentBiometricException('Biometric enrollment is not active.', 409, 'biometric_not_enrolled');
            }
            if (!student_biometric_geofence_passes($session, $latitude, $longitude)) {
                $pdo->rollBack();
                throw new StudentBiometricException('You are outside the permitted attendance location.', 409, 'geofence_failed');
            }
            $challenge = student_biometric_consume_challenge(
                $pdo,
                $studentId,
                $challengeToken,
                'attendance',
                $sessionId,
                $challengeId,
                $idempotencyKey
            );
            if (($challenge['replayed'] ?? false) === true && ($challenge['submissionState'] ?? '') === 'failed') {
                throw new StudentBiometricException(
                    'Biometric verification already failed for this challenge. Request a new challenge.',
                    422,
                    'biometric_verification_failed'
                );
            }
            try {
                $sidecar = student_biometric_sidecar_request($config, '/v1/verify', [
                    'protectedObjectReference' => (string) $profile['protected_object_reference'],
                    'challengeActions' => json_encode($challenge['actions'], JSON_UNESCAPED_SLASHES),
                    'studentId' => (string) $studentId,
                ], array_map(static fn(array $frame): array => $frame + ['field' => 'frames'], $frames));
                if (($sidecar['verified'] ?? false) !== true) {
                    throw new StudentBiometricException('Face could not be verified.', 422, 'biometric_verification_failed');
                }
            } catch (Throwable $e) {
                $terminalChallengeFailure = $e instanceof StudentBiometricException
                    && in_array($e->errorCode, ['liveness_failed', 'quality_failed', 'biometric_verification_failed'], true);
                if ($terminalChallengeFailure) {
                    student_biometric_fail_challenge($pdo, (int) $challenge['tokenId'], $idempotencyKey);
                } else {
                    student_biometric_reset_challenge_for_retry($pdo, (int) $challenge['tokenId'], $idempotencyKey);
                }
                $pdo->commit();
                throw $e;
            }
            $now = attendance_session_now_utc();
            $nowSql = $now->format('Y-m-d H:i:s.u');
            $insert = $pdo->prepare(
                "INSERT INTO attendance_records (
                    enrollment_id, attendance_session_id, session_date, session_code,
                    session_start, session_end, status, verification_method,
                    time_recorded, created_at
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, 'biometric', ?, ?)
                 ON CONFLICT DO NOTHING
                 RETURNING record_id"
            );
            $insert->execute([
                (int) $session['enrollment_id'], $sessionId, $session['session_date'], $session['session_code'],
                $session['opening_time'], $session['late_cutoff_time'], $decision['status'], $nowSql, $nowSql,
            ]);
            $recordId = $insert->fetchColumn();
            if ($recordId === false) {
                $existingStmt->execute([$sessionId, (int) $session['enrollment_id']]);
                $existing = $existingStmt->fetch(PDO::FETCH_ASSOC);
                $pdo->rollBack();
                $attendance = ['recordId' => (string) ($existing['record_id'] ?? ''), 'status' => $existing['status'] ?? null];
                $response = student_attendance_record_response(
                    'already_recorded',
                    'already_recorded',
                    'Attendance was already recorded for this session.',
                    $attendance
                );
                json_response($response, 200);
                return;
            }
            attendance_session_record_audit(
                $pdo, $config, $authCtx, $context, 'biometric_attendance_recorded', (int) $session['session_id'], (int) $session['cs_id'],
                "Recorded biometric attendance for Student #{$studentId}.", null, null,
                ['record_id' => (int) $recordId, 'student_id' => $studentId, 'status' => $decision['status'], 'verification_method' => 'biometric']
            );
            student_biometric_complete_challenge($pdo, (int) $challenge['tokenId'], $idempotencyKey);
            $pdo->commit();
            $attendance = [
                'recordId' => (string) $recordId,
                'status' => $decision['status'],
                'verificationMethod' => 'biometric',
                'recordedAt' => attendance_session_timestamp($nowSql),
            ];
            $response = student_attendance_record_response(
                (string) $decision['status'],
                'recorded',
                $decision['status'] === 'late' ? 'Attendance recorded as Late.' : 'Attendance recorded as Present.',
                $attendance
            );
            json_response($response, 201);
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) { $pdo->rollBack(); }
            throw $e;
        }
    } catch (Throwable $e) {
        if ($studentId > 0 && $authCtx !== [] && $config !== [] && $e instanceof StudentBiometricException
            && in_array($e->errorCode, ['geofence_failed', 'liveness_failed', 'quality_failed', 'biometric_verification_failed', 'biometric_service_unavailable'], true)) {
            student_biometric_failure_audit($config, $authCtx, $context, $studentId, 'biometric_verification_failed', $e->errorCode);
        }
        student_biometric_emit_exception($e);
    }
}

function handle_student_attendance_logs(): void
{
    try {
        [$config, $pdo, $authCtx, $identity] = student_biometric_controller_context();
        $stmt = $pdo->prepare(
            "SELECT r.record_id, r.attendance_session_id, r.session_date, r.session_code,
                    r.status, r.verification_method, r.time_recorded,
                    cs.cs_id, cs.cs_name, c.course_code, c.name AS course_name,
                    s.room
               FROM attendance_records r
               JOIN enrollments e ON e.enrollment_id = r.enrollment_id
               JOIN class_sections cs ON cs.cs_id = e.cs_id
               JOIN courses c ON c.course_id = cs.course_id
               LEFT JOIN attendance_sessions s ON s.session_id = r.attendance_session_id
              WHERE e.student_id = ?
              ORDER BY r.session_date DESC, r.record_id DESC"
        );
        $stmt->execute([$identity['student_id']]);
        $logs = array_map(static function (array $row): array {
            return [
                'recordId' => (string) $row['record_id'],
                'attendanceSessionId' => $row['attendance_session_id'] !== null ? (string) $row['attendance_session_id'] : null,
                'date' => $row['session_date'],
                'sessionCode' => $row['session_code'],
                'status' => $row['status'],
                'verificationMethod' => $row['verification_method'],
                'recordedAt' => $row['time_recorded'] !== null ? attendance_session_timestamp((string) $row['time_recorded']) : null,
                'course' => ['code' => $row['course_code'], 'name' => $row['course_name']],
                'classSection' => ['id' => (string) $row['cs_id'], 'name' => $row['cs_name']],
                'room' => $row['room'],
            ];
        }, $stmt->fetchAll(PDO::FETCH_ASSOC));
        json_response(student_attendance_logs_response($logs, $config['app']['operational_timezone']), 200);
    } catch (Throwable $e) {
        student_biometric_emit_exception($e);
    }
}
