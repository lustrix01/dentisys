<?php

declare(strict_types=1);

if (!function_exists('sanitize_for_log')) {
    function sanitize_for_log(\Throwable $e): string
    {
        return get_class($e) . ' [' . ($e->getCode() > 0 ? $e->getCode() : 0) . ']';
    }
}

function handle_secretary_invite(): void
{
    $context = [
        'request_id' => request_id(),
        'ip_address' => request_ip(),
        'user_agent' => request_user_agent(),
        'http_method' => request_method(),
        'endpoint' => request_path(),
        'auth_header' => request_header('Authorization') ?? '',
    ];

    try {
        $config = app_config();
        $pdo = create_pdo($config);

        $authHeader = $context['auth_header'];
        if ($authHeader === '') {
            auth_error_response('Authorization header required.', 401);
            return;
        }

        $token = auth_extract_bearer_token($authHeader);
        $jwtKey = config_key_bytes_at_least($config['jwt']['signing_key_b64'], 32, 'JWT_SIGNING_KEY');
        $authCtx = auth_verify_access_token($pdo, $config, $token, $jwtKey);

        if (!in_array($authCtx['role'], ['faculty', 'admin'], true)) {
            safe_error_response('Access denied. Faculty or administrator privileges required.', 403);
            return;
        }

        $body = request_body();
        if (!$body['has_body']) {
            safe_error_response('Request body required.', 400);
            return;
        }

        $data = $body['data'];
        $studentName = validate_person_name($data, 'student_name', 2, 255);
        $studentNumber = validate_required_string($data, 'student_number', 1, 50);
        $className = validate_required_string($data, 'class_name', 2, 255);
        $email = validate_institutional_email($data['email'] ?? '');

        $scopeSql = "SELECT s.student_id, s.user_id AS student_user_id, s.bu_email,
                            CONCAT_WS(' ', s.first_name, NULLIF(s.middle_name, ''), s.last_name) AS persisted_name,
                            cs.cs_id, cs.cs_name
                     FROM students s
                     JOIN enrollments e ON e.student_id = s.student_id
                     JOIN class_sections cs ON cs.cs_id = e.cs_id
                     WHERE s.student_number = ? AND cs.cs_name = ?";
        $scopeParams = [$studentNumber, $className];
        if ($authCtx['role'] === 'faculty') {
            $scopeSql .= " AND cs.instructor_user_id = ?";
            $scopeParams[] = $authCtx['user_id'];
        }
        $scope = $pdo->prepare($scopeSql . " LIMIT 1");
        $scope->execute($scopeParams);
        $assignment = $scope->fetch(PDO::FETCH_ASSOC);
        if (!$assignment) {
            safe_error_response('The student is not enrolled in the selected assigned class.', 403);
            return;
        }
        $persistedEmail = validate_institutional_email((string) ($assignment['bu_email'] ?? ''));
        if (!hash_equals($persistedEmail, $email)) {
            safe_error_response('Invitation email must match the student institutional email on record.', 422);
            return;
        }
        $persistedName = normalize_person_name((string) ($assignment['persisted_name'] ?? ''));
        if ($persistedName === '' || mb_strtolower($persistedName) !== mb_strtolower($studentName)) {
            safe_error_response('Invitation name must match the selected student record.', 422);
            return;
        }
        $accountCheck = $pdo->prepare("SELECT user_id FROM user_accounts WHERE login_email = ? LIMIT 1");
        $accountCheck->execute([$persistedEmail]);
        if ($accountCheck->fetchColumn() !== false || $assignment['student_user_id'] !== null) {
            safe_error_response('This student already has an account. Revoke or reassign the existing secretary account instead.', 409);
            return;
        }
        $studentName = $persistedName;
        $email = $persistedEmail;

        $invToken = bin2hex(random_bytes(16));
        $tokenHash = hash('sha256', $invToken);

        $now = new DateTimeImmutable('now', new DateTimeZone('UTC'));
        $nowSql = $now->format('Y-m-d H:i:s.u');
        $expiresSql = $now->add(new DateInterval('P7D'))->format('Y-m-d H:i:s.u');

        $metadata = json_encode([
            'token' => $invToken,
            'student_name' => $studentName,
            'student_number' => $studentNumber,
            'class_name' => $className,
            'email' => $email,
            'faculty_name' => $authCtx['display_name'],
        ], JSON_UNESCAPED_SLASHES);

        $pdo->beginTransaction();
        try {
            $macKey = config_key_bytes_at_least($config['audit']['mac_key_b64'], 32, 'AUDIT_MAC_KEY');
            $auditCtx = audit_begin_operation($pdo);

            $ins = $pdo->prepare(
                "INSERT INTO security_tokens
                 (purpose, user_id, related_student_id, related_cs_id, secret_hash, issued_at, expires_at, metadata_json)
                 VALUES ('secretary_invitation', ?, ?, ?, ?, ?, ?, ?) RETURNING token_id"
            );
            $ins->execute([
                $authCtx['user_id'], $assignment['student_id'], $assignment['cs_id'],
                $tokenHash, $nowSql, $expiresSql, $metadata,
            ]);
            $stId = (int) $ins->fetchColumn();

            audit_finish_operation($pdo, $auditCtx, [
                'module_code' => 'secretary',
                'action_code' => 'secretary_invited',
                'event_status' => 'Success',
                'actor_user_id' => $authCtx['user_id'],
                'actor_username' => $authCtx['login_email'],
                'actor_role' => $authCtx['role'],
                'actor_display_name' => $authCtx['display_name'],
                'session_id' => $authCtx['session_id'],
                'scope_cs_id' => (int) $assignment['cs_id'],
                'target_type' => 'security_token',
                'target_id' => (string) $stId,
                'description' => "Invited {$studentName} ({$email}) as Class Secretary for {$className}.",
                'reason' => null,
                'http_method' => $context['http_method'],
                'endpoint' => $context['endpoint'],
                'request_id' => $context['request_id'],
                'ip_address' => $context['ip_address'],
                'user_agent' => $context['user_agent'],
            ], $macKey);

            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) { $pdo->rollBack(); }
            throw $e;
        }

        $invitationLink = app_url($config, '/activate-secretary', ['token' => $invToken]);
        $subject = 'DentiSys Class Secretary Invitation';
        $facultyName = htmlspecialchars((string) $authCtx['display_name']);
        $safeStudentName = htmlspecialchars((string) $studentName);
        $safeClassName = htmlspecialchars((string) $className);
        $safeLink = htmlspecialchars($invitationLink);

        $body = "<p>Hello {$safeStudentName},</p>" .
                "<p>You have been invited by <strong>{$facultyName}</strong> to register as the Class Secretary for <strong>{$safeClassName}</strong> on DentiSys.</p>" .
                "<p>Please click the link below to set up your password and activate your Class Secretary account:</p>" .
                "<p><a href=\"{$safeLink}\">{$safeLink}</a></p>" .
                "<p>This invitation link will expire in 7 days. If you were not expecting this invitation, please ignore this email.</p>";

        $operationUuid = uuid_v4_string();
        $outbox = $pdo->prepare(
            "INSERT INTO email_outbox
             (sender_user_id, recipient_email, recipient_name, subject, email_type, message_body, status, operation_uuid)
             VALUES (?, ?, ?, ?, 'Secretary Invitation', ?, 'Pending', ?) RETURNING email_id"
        );
        $outbox->execute([$authCtx['user_id'], $email, $studentName, $subject, $body, $operationUuid]);
        $emailId = (int) $outbox->fetchColumn();
        $sent = send_email($email, $subject, $body, $config);
        $finish = $pdo->prepare(
            "UPDATE email_outbox SET status = ?, sent_at = ?, failure_reason = ? WHERE email_id = ?"
        );
        $finish->execute([
            $sent ? 'Sent' : 'Failed',
            $sent ? (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d H:i:s.u') : null,
            $sent ? null : 'SMTP delivery failed or is not configured.',
            $emailId,
        ]);

        $showDevLink = !empty($config['show_dev_invitation_link']);

        json_response([
            'status' => 'ok',
            'token' => $showDevLink ? $invToken : null,
            'invitation_link' => $showDevLink ? $invitationLink : null,
            'dev_invitation_link' => $showDevLink ? $invitationLink : null,
            'delivery_status' => $sent ? 'Sent' : 'Failed',
            'message' => $sent
                ? 'Class Secretary invitation issued and sent successfully.'
                : 'Invitation was issued, but email delivery failed. Use the development link only in local development.',
        ], 201);
    } catch (ValidationException $e) {
        validation_error_response($e->getErrors());
    } catch (AuthException | ChallengeException | \RuntimeException $e) {
        auth_error_response('Authentication required.', 401);
    } catch (\Throwable $e) {
        error_log('Secretary invite error [' . ($context['request_id'] ?? '?') . ']: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

function handle_secretary_list_invitations(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = faculty_verify_auth($pdo, $config);
        $stmt = $pdo->prepare(
            "SELECT token_id, issued_at, expires_at, used_at, revoked_at, metadata_json
             FROM security_tokens
             WHERE purpose = 'secretary_invitation' AND user_id = ?
             ORDER BY issued_at DESC"
        );
        $stmt->execute([$authCtx['user_id']]);
        $now = new DateTimeImmutable('now', new DateTimeZone('UTC'));
        $items = array_map(static function (array $row) use ($now): array {
            $meta = json_decode($row['metadata_json'] ?? '{}', true);
            $status = $row['revoked_at'] ? 'Revoked'
                : ($row['used_at'] ? 'Accepted'
                : (new DateTimeImmutable($row['expires_at'], new DateTimeZone('UTC')) <= $now ? 'Expired' : 'Pending'));
            return [
                'id' => (string) $row['token_id'],
                'studentId' => $meta['student_number'] ?? '',
                'studentName' => $meta['student_name'] ?? '',
                'email' => $meta['email'] ?? '',
                'facultyName' => $meta['faculty_name'] ?? '',
                'className' => $meta['class_name'] ?? '',
                'classId' => '',
                'token' => $meta['token'] ?? '',
                'status' => $status,
                'createdAt' => $row['issued_at'],
                'expiresAt' => $row['expires_at'],
            ];
        }, $stmt->fetchAll(PDO::FETCH_ASSOC));
        json_response(['status' => 'ok', 'invitations' => $items], 200);
    } catch (\Throwable $e) {
        error_log('Secretary invitation list error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

function handle_secretary_revoke_invitation(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = faculty_verify_auth($pdo, $config);
        $body = request_body();
        $tokenId = $body['has_body'] ? (int) ($body['data']['invitationId'] ?? 0) : 0;
        if ($tokenId <= 0) {
            safe_error_response('Invitation identifier is required.', 422);
            return;
        }
        $stmt = $pdo->prepare(
            "UPDATE security_tokens
             SET revoked_at = CURRENT_TIMESTAMP(6), revocation_reason = 'Revoked by issuing faculty member'
             WHERE token_id = ? AND purpose = 'secretary_invitation' AND user_id = ?
               AND used_at IS NULL AND revoked_at IS NULL"
        );
        $stmt->execute([$tokenId, $authCtx['user_id']]);
        if ($stmt->rowCount() === 0) {
            safe_error_response('Pending invitation not found.', 404);
            return;
        }
        json_response(['status' => 'ok', 'message' => 'Invitation revoked successfully.'], 200);
    } catch (\Throwable $e) {
        error_log('Secretary invitation revoke error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

function handle_secretary_get_invitation(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);

        $token = $_GET['token'] ?? '';
        if ($token === '' || !preg_match('/^[a-f0-9]{32}$/', $token)) {
            safe_error_response('Invalid or missing invitation token.', 400);
            return;
        }

        $tokenHash = hash('sha256', $token);
        $stmt = $pdo->prepare(
            "SELECT token_id, secret_hash, issued_at, expires_at, used_at, revoked_at, metadata_json
             FROM security_tokens
             WHERE purpose = 'secretary_invitation' AND secret_hash = ?"
        );
        $stmt->execute([$tokenHash]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($row === false) {
            safe_error_response('Invitation token not found or invalid.', 404);
            return;
        }

        if ($row['revoked_at'] !== null) {
            safe_error_response('This invitation has been revoked.', 410);
            return;
        }

        if ($row['used_at'] !== null) {
            safe_error_response('This invitation has already been accepted.', 409);
            return;
        }

        $expiresAt = new DateTimeImmutable($row['expires_at'], new DateTimeZone('UTC'));
        if ($expiresAt <= new DateTimeImmutable('now', new DateTimeZone('UTC'))) {
            safe_error_response('This invitation has expired.', 410);
            return;
        }

        $meta = json_decode($row['metadata_json'] ?? '{}', true);

        json_response([
            'status' => 'ok',
            'invitation' => [
                'token' => $token,
                'studentName' => $meta['student_name'] ?? 'Student',
                'studentNumber' => $meta['student_number'] ?? '',
                'email' => $meta['email'] ?? '',
                'className' => $meta['class_name'] ?? 'Class Section',
                'facultyName' => $meta['faculty_name'] ?? 'Faculty Instructor',
                'expiresAt' => $row['expires_at'],
            ],
        ], 200);
    } catch (\Throwable $e) {
        error_log('Secretary get invitation error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

function handle_secretary_activate(): void
{
    $context = [
        'request_id' => request_id(),
        'ip_address' => request_ip(),
        'user_agent' => request_user_agent(),
        'http_method' => request_method(),
        'endpoint' => request_path(),
    ];

    try {
        $config = app_config();
        $pdo = create_pdo($config);

        $body = request_body();
        if (!$body['has_body']) {
            safe_error_response('Request body required.', 400);
            return;
        }

        $data = $body['data'];
        $token = $data['token'] ?? '';
        if ($token === '' || !preg_match('/^[a-f0-9]{32}$/', $token)) {
            safe_error_response('Invalid or missing invitation token.', 400);
            return;
        }

        $password = extract_password($data, 'password');
        validate_password_policy($password);

        $tokenHash = hash('sha256', $token);
        $stmt = $pdo->prepare(
            "SELECT token_id, user_id, related_student_id, related_cs_id, secret_hash,
                    issued_at, expires_at, used_at, revoked_at, metadata_json
             FROM security_tokens
             WHERE purpose = 'secretary_invitation' AND secret_hash = ?"
        );
        $stmt->execute([$tokenHash]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($row === false || $row['revoked_at'] !== null || $row['used_at'] !== null) {
            safe_error_response('Invalid or expired invitation token.', 400);
            return;
        }

        $expiresAt = new DateTimeImmutable($row['expires_at'], new DateTimeZone('UTC'));
        if ($expiresAt <= new DateTimeImmutable('now', new DateTimeZone('UTC'))) {
            safe_error_response('Invalid or expired invitation token.', 400);
            return;
        }

        $meta = json_decode($row['metadata_json'] ?? '{}', true);
        $email = $meta['email'] ?? '';
        $displayName = $meta['student_name'] ?? 'Class Secretary';

        if ($email === '') {
            safe_error_response('Invitation metadata corrupted.', 500);
            return;
        }

        $passwordHash = password_hash($password, PASSWORD_DEFAULT);
        $nowSql = (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d H:i:s.u');

        $pdo->beginTransaction();
        try {
            $macKey = config_key_bytes_at_least($config['audit']['mac_key_b64'], 32, 'AUDIT_MAC_KEY');
            $auditCtx = audit_begin_operation($pdo);

            $studentLock = $pdo->prepare(
                "SELECT student_id, user_id, student_account_user_id, bu_email
                    FROM students
                   WHERE student_id = ?
                   FOR UPDATE"
            );
            $studentLock->execute([(int) $row['related_student_id']]);
            $student = $studentLock->fetch(PDO::FETCH_ASSOC);
            if (!$student
                || $student['user_id'] !== null
                || $student['student_account_user_id'] !== null
                || mb_strtolower((string) $student['bu_email']) !== mb_strtolower((string) $email)
            ) {
                throw new DomainException('Invitation no longer matches an unlinked student account.');
            }

            $chk = $pdo->prepare("SELECT user_id FROM user_accounts WHERE login_email = ? FOR UPDATE");
            $chk->execute([$email]);
            $existingUser = $chk->fetch(PDO::FETCH_ASSOC);
            if ($existingUser !== false) {
                throw new DomainException('An account now exists for this email; activation was not applied.');
            }
            $ins = $pdo->prepare(
                "INSERT INTO user_accounts (login_email, password_hash, role, display_name, title, status, created_at)
                 VALUES (?, ?, 'secretary', ?, 'Class Secretary', 'Active', ?) RETURNING user_id"
            );
            $ins->execute([$email, $passwordHash, $displayName, $nowSql]);
            $userId = (int) $ins->fetchColumn();

            $linkStudent = $pdo->prepare("UPDATE students SET user_id = ? WHERE student_id = ? AND user_id IS NULL");
            $linkStudent->execute([$userId, (int) $row['related_student_id']]);
            $assignSection = $pdo->prepare("UPDATE class_sections SET secretary_user_id = ? WHERE cs_id = ?");
            $assignSection->execute([$userId, (int) $row['related_cs_id']]);

            // Mark token as used
            $markUsed = $pdo->prepare("UPDATE security_tokens SET used_at = ? WHERE token_id = ?");
            $markUsed->execute([$nowSql, $row['token_id']]);

            audit_finish_operation($pdo, $auditCtx, [
                'module_code' => 'secretary',
                'action_code' => 'secretary_activated',
                'event_status' => 'Success',
                'actor_user_id' => $userId,
                'actor_username' => $email,
                'actor_role' => 'secretary',
                'actor_display_name' => $displayName,
                'session_id' => null,
                'scope_cs_id' => (int) $row['related_cs_id'],
                'target_type' => 'user_account',
                'target_id' => (string) $userId,
                'description' => "Class Secretary account activated for {$displayName} ({$email}).",
                'reason' => null,
                'http_method' => $context['http_method'],
                'endpoint' => $context['endpoint'],
                'request_id' => $context['request_id'],
                'ip_address' => $context['ip_address'],
                'user_agent' => $context['user_agent'],
            ], $macKey);

            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) { $pdo->rollBack(); }
            throw $e;
        }

        json_response([
            'status' => 'ok',
            'message' => 'Class Secretary account activated successfully. You may now sign in.',
        ], 200);
    } catch (ValidationException $e) {
        validation_error_response($e->getErrors());
    } catch (DomainException $e) {
        safe_error_response($e->getMessage(), 409);
    } catch (InvalidCredentialsException $e) {
        validation_error_response([['field' => 'password', 'message' => $e->getMessage()]]);
    } catch (\Throwable $e) {
        error_log('Secretary activate error [' . ($context['request_id'] ?? '?') . ']: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

function secretary_verify_auth(PDO $pdo, array $config): array
{
    $authHeader = request_header('Authorization') ?? '';
    if ($authHeader === '') {
        auth_error_response('Authorization header required.', 401);
        exit;
    }

    try {
        $token = auth_extract_bearer_token($authHeader);
        $jwtKey = config_key_bytes_at_least($config['jwt']['signing_key_b64'], 32, 'JWT_SIGNING_KEY');
        $authCtx = auth_verify_access_token($pdo, $config, $token, $jwtKey);
    } catch (AuthException | \RuntimeException $e) {
        auth_error_response($e->getMessage(), 401);
        exit;
    }

    if (!in_array($authCtx['role'], ['secretary', 'admin'], true)) {
        safe_error_response('Access denied. Class Secretary or administrator privileges required.', 403);
        exit;
    }

    return $authCtx;
}

function handle_secretary_dashboard_kpis(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = secretary_verify_auth($pdo, $config);

        // Retrieve assigned class for this secretary if present
        $csStmt = $pdo->prepare("SELECT cs_id, cs_name, lab_room, lec_room FROM class_sections WHERE secretary_user_id = ? ORDER BY cs_id ASC LIMIT 1");
        $csStmt->execute([$authCtx['user_id']]);
        $csRow = $csStmt->fetch(PDO::FETCH_ASSOC);

        $className = $csRow['cs_name'] ?? '';
        $classroomName = ($csRow['lab_room'] ?? null) ?: ($csRow['lec_room'] ?? null) ?: '';
        $classId = $csRow ? (string) $csRow['cs_id'] : '';

        // Count assigned students
        $studentStmt = $pdo->prepare(
            "SELECT DISTINCT s.student_id, s.first_name, s.last_name, s.student_number
             FROM students s
             JOIN enrollments e ON e.student_id = s.student_id
             JOIN class_sections cs ON cs.cs_id = e.cs_id
             WHERE cs.secretary_user_id = ?"
        );
        $studentStmt->execute([$authCtx['user_id']]);
        $students = $studentStmt ? $studentStmt->fetchAll(PDO::FETCH_ASSOC) : [];
        $totalStudents = count($students);

        // Fetch attendance records from database if available
        $attStmt = $pdo->prepare(
            "SELECT r.record_id, r.enrollment_id, r.session_date, r.status, r.override_reason, r.override_at
             FROM attendance_records r
             JOIN enrollments e ON e.enrollment_id = r.enrollment_id
             JOIN class_sections cs ON cs.cs_id = e.cs_id
             WHERE cs.secretary_user_id = ?
             ORDER BY r.created_at DESC"
        );
        $attStmt->execute([$authCtx['user_id']]);
        $attRecords = $attStmt ? $attStmt->fetchAll(PDO::FETCH_ASSOC) : [];

        $today = (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d');
        $todayCount = 0;
        $overriddenCount = 0;
        $presentOrLate = 0;
        $recentActivity = [];

        foreach ($attRecords as $rec) {
            if (($rec['session_date'] ?? '') === $today) {
                $todayCount++;
            }
            if (!empty($rec['override_reason']) || !empty($rec['override_at'])) {
                $overriddenCount++;
            }
            $st = strtolower($rec['status'] ?? '');
            if ($st === 'present' || $st === 'late') {
                $presentOrLate++;
            }
        }

        $totalRecords = count($attRecords);
        $attendanceRate = $totalRecords > 0 ? (int) round(($presentOrLate / $totalRecords) * 100) : 96;

        json_response([
            'status' => 'ok',
            'kpis' => [
                'assignedStudents' => $totalStudents,
                'attendanceRate' => $attendanceRate,
                'todayRecords' => $todayCount,
                'overriddenCount' => $overriddenCount,
            ],
            'recentActivity' => $recentActivity,
            'assignedClass' => [
                'classId' => $classId,
                'className' => $className,
                'classroomName' => $classroomName,
                'cctvCameraId' => null,
                'cctvStatus' => 'not_configured',
            ],
        ], 200);
    } catch (\Throwable $e) {
        error_log('Secretary dashboard error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

function secretary_attendance_session_now(): DateTimeImmutable
{
    // Session timestamps remain UTC. Calendar-date decisions project this
    // instant through app_config()['app']['operational_timezone'] separately.
    return new DateTimeImmutable('now', new DateTimeZone('UTC'));
}

function secretary_attendance_session_timestamp(?string $value): ?string
{
    if ($value === null || trim($value) === '') {
        return null;
    }

    try {
        return (new DateTimeImmutable($value, new DateTimeZone('UTC')))->format('Y-m-d\\TH:i:s.u\\Z');
    } catch (\Throwable $e) {
        return $value;
    }
}

function secretary_attendance_session_bool(array $data, string $field, bool $default): bool
{
    if (!array_key_exists($field, $data) || $data[$field] === null) {
        return $default;
    }

    $value = $data[$field];
    if (is_bool($value)) {
        return $value;
    }
    if (is_int($value) && ($value === 0 || $value === 1)) {
        return $value === 1;
    }
    if (is_string($value)) {
        $normalized = strtolower(trim($value));
        if (in_array($normalized, ['true', '1', 'yes'], true)) {
            return true;
        }
        if (in_array($normalized, ['false', '0', 'no'], true)) {
            return false;
        }
    }

    throw new ValidationException([[
        'field' => $field,
        'message' => 'Field must be a boolean.',
    ]]);
}

function secretary_attendance_session_optional_float(
    array $data,
    string $field,
    ?float $minimum = null,
    ?float $maximum = null
): ?float {
    if (!array_key_exists($field, $data) || $data[$field] === null || $data[$field] === '') {
        return null;
    }

    if (is_bool($data[$field]) || !is_numeric($data[$field])) {
        throw new ValidationException([[
            'field' => $field,
            'message' => 'Field must be numeric.',
        ]]);
    }

    $value = (float) $data[$field];
    if (!is_finite($value)) {
        throw new ValidationException([[
            'field' => $field,
            'message' => 'Field must be a finite number.',
        ]]);
    }
    if ($minimum !== null && $value < $minimum) {
        throw new ValidationException([[
            'field' => $field,
            'message' => "Field must be at least {$minimum}.",
        ]]);
    }
    if ($maximum !== null && $value > $maximum) {
        throw new ValidationException([[
            'field' => $field,
            'message' => "Field must be at most {$maximum}.",
        ]]);
    }

    return $value;
}

function secretary_attendance_session_date(array $data, DateTimeImmutable $now, array $config): string
{
    $today = app_local_date($config, $now);
    $rawDate = array_key_exists('sessionDate', $data)
        ? $data['sessionDate']
        : ($data['date'] ?? $today);

    if (!is_string($rawDate) || trim($rawDate) === '') {
        throw new ValidationException([[
            'field' => 'sessionDate',
            'message' => 'Session date must be a valid YYYY-MM-DD date.',
        ]]);
    }

    $rawDate = trim($rawDate);
    $date = DateTimeImmutable::createFromFormat('!Y-m-d', $rawDate, new DateTimeZone('UTC'));
    $errors = DateTimeImmutable::getLastErrors();
    if (
        !$date
        || ($errors !== false && ($errors['warning_count'] > 0 || $errors['error_count'] > 0))
        || $date->format('Y-m-d') !== $rawDate
    ) {
        throw new ValidationException([[
            'field' => 'sessionDate',
            'message' => 'Session date must be a valid YYYY-MM-DD date.',
        ]]);
    }

    if ($rawDate > $today) {
        throw new ValidationException([[
            'field' => 'sessionDate',
            'message' => 'Future attendance session dates are not allowed.',
        ]]);
    }

    return $rawDate;
}

function secretary_attendance_session_code(int $csId, string $sessionDate): string
{
    return 'CS' . $csId . '-' . str_replace('-', '', $sessionDate) . '-' . strtoupper(bin2hex(random_bytes(3)));
}

function secretary_attendance_session_fetch(
    PDO $pdo,
    int $secretaryUserId,
    ?int $sessionId = null,
    ?int $csId = null,
    bool $forUpdate = false,
    bool $activeOnly = false
): ?array {
    $where = [
        'cs.secretary_user_id = :secretary_user_id',
    ];
    $params = [':secretary_user_id' => $secretaryUserId];

    if ($sessionId !== null) {
        $where[] = 's.session_id = :session_id';
        $params[':session_id'] = $sessionId;
    }
    if ($csId !== null) {
        $where[] = 'cs.cs_id = :cs_id';
        $params[':cs_id'] = $csId;
    }
    if ($activeOnly) {
        $where[] = "s.status = 'active'";
    }

    $sql = "SELECT s.session_id, s.cs_id, s.secretary_user_id, s.owner_user_id, s.session_date,
                   s.session_code, s.room, s.started_at, s.ended_at, s.status,
                   s.geofence_enabled, s.geofence_latitude, s.geofence_longitude,
                   s.geofence_radius_meters, s.biometric_required, s.opening_time,
                   s.present_cutoff_time, s.late_cutoff_time, s.revoked_at,
                   s.revoked_by_user_id, s.revocation_reason, s.created_at,
                   s.updated_at, cs.cs_name, cs.block, c.course_id,
                   c.course_code, c.name AS course_name, u.display_name AS instructor_name
            FROM attendance_sessions s
            JOIN class_sections cs ON cs.cs_id = s.cs_id
            JOIN courses c ON c.course_id = cs.course_id
            LEFT JOIN user_accounts u ON u.user_id = cs.instructor_user_id
            WHERE " . implode(' AND ', $where) . "
            ORDER BY s.started_at DESC
            LIMIT 1";
    if ($forUpdate) {
        $sql .= ' FOR UPDATE OF s';
    }

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row === false ? null : $row;
}

function secretary_attendance_session_map(array $row): array
{
    return [
        'sessionId' => (string) $row['session_id'],
        'csId' => (int) $row['cs_id'],
        'classId' => (string) $row['cs_id'],
        'className' => $row['cs_name'],
        'classSection' => [
            'id' => (string) $row['cs_id'],
            'name' => $row['cs_name'],
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
        'startedAt' => secretary_attendance_session_timestamp((string) $row['started_at']),
        'endedAt' => secretary_attendance_session_timestamp($row['ended_at'] !== null ? (string) $row['ended_at'] : null),
        'status' => strtolower((string) $row['status']),
        'geofenceEnabled' => in_array($row['geofence_enabled'], [true, 't', '1', 1], true),
        'geofenceLatitude' => $row['geofence_latitude'] !== null ? (float) $row['geofence_latitude'] : null,
        'geofenceLongitude' => $row['geofence_longitude'] !== null ? (float) $row['geofence_longitude'] : null,
        'geofenceRadiusMeters' => $row['geofence_radius_meters'] !== null ? (float) $row['geofence_radius_meters'] : null,
        'biometricRequired' => in_array($row['biometric_required'], [true, 't', '1', 1], true),
        'openingTime' => $row['opening_time'] !== null ? substr((string) $row['opening_time'], 0, 5) : null,
        'presentCutoff' => $row['present_cutoff_time'] !== null ? substr((string) $row['present_cutoff_time'], 0, 5) : null,
        'lateCutoff' => $row['late_cutoff_time'] !== null ? substr((string) $row['late_cutoff_time'], 0, 5) : null,
        'timingConfigured' => $row['opening_time'] !== null && $row['present_cutoff_time'] !== null && $row['late_cutoff_time'] !== null,
        'revokedAt' => secretary_attendance_session_timestamp($row['revoked_at'] !== null ? (string) $row['revoked_at'] : null),
        'revocationReason' => $row['revocation_reason'] ?? null,
        'createdAt' => secretary_attendance_session_timestamp((string) $row['created_at']),
        'updatedAt' => secretary_attendance_session_timestamp((string) $row['updated_at']),
    ];
}

function handle_secretary_attendance_session_start(): void
{
    $context = [
        'request_id' => request_id(),
        'ip_address' => request_ip(),
        'user_agent' => request_user_agent(),
        'http_method' => request_method(),
        'endpoint' => request_path(),
    ];

    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = secretary_verify_auth($pdo, $config);
        $body = request_body();
        if (!$body['has_body']) {
            safe_error_response('Request body required.', 400);
            return;
        }

        $data = $body['data'];
        $csId = (int) ($data['csId'] ?? $data['classSectionId'] ?? 0);
        if ($csId <= 0) {
            throw new ValidationException([['field' => 'csId', 'message' => 'A valid class section is required.']]);
        }

        $now = secretary_attendance_session_now();
        $sessionDate = secretary_attendance_session_date($data, $now, $config);
        $room = null;
        if (array_key_exists('room', $data) && $data['room'] !== null && $data['room'] !== '') {
            $room = validate_required_string($data, 'room', 1, 255);
        }
        [$openingTime, $presentCutoff, $lateCutoff] = attendance_session_timing_from_request($data);

        $biometricRequired = secretary_attendance_session_bool(
            $data,
            array_key_exists('biometricRequired', $data) ? 'biometricRequired' : 'requireFace',
            false
        );
        attendance_session_require_timing_for_biometric(
            $biometricRequired,
            $openingTime,
            $presentCutoff,
            $lateCutoff
        );
        $geofenceEnabled = secretary_attendance_session_bool(
            $data,
            array_key_exists('geofenceEnabled', $data) ? 'geofenceEnabled' : 'requireGeo',
            $biometricRequired
        );
        $latitude = secretary_attendance_session_optional_float($data, 'geofenceLatitude', -90, 90);
        $longitude = secretary_attendance_session_optional_float($data, 'geofenceLongitude', -180, 180);
        $radius = secretary_attendance_session_optional_float($data, 'geofenceRadiusMeters');
        if (($latitude === null) !== ($longitude === null)) {
            throw new ValidationException([[
                'field' => 'geofenceLatitude',
                'message' => 'Geofence latitude and longitude must be provided together.',
            ]]);
        }
        if ($geofenceEnabled && $radius === null) {
            $radius = 100.0;
        }
        if ($radius !== null && $radius <= 0) {
            throw new ValidationException([[
                'field' => 'geofenceRadiusMeters',
                'message' => 'Geofence radius must be greater than zero.',
            ]]);
        }

        $sessionCode = null;
        if (array_key_exists('sessionCode', $data) && $data['sessionCode'] !== null && trim((string) $data['sessionCode']) !== '') {
            $sessionCode = validate_required_string($data, 'sessionCode', 1, 100);
        }
        $sessionCode ??= secretary_attendance_session_code($csId, $sessionDate);
        $nowSql = $now->format('Y-m-d H:i:s.u');

        $pdo->beginTransaction();
        try {
            $scopeStmt = $pdo->prepare(
                "SELECT cs.cs_id
                 FROM class_sections cs
                 WHERE cs.cs_id = ?
                   AND cs.secretary_user_id = ?
                   AND cs.status = 'Active'
                 FOR UPDATE"
            );
            $scopeStmt->execute([$csId, $authCtx['user_id']]);
            if ($scopeStmt->fetchColumn() === false) {
                $pdo->rollBack();
                safe_error_response('Class section is not assigned to this Secretary.', 403);
                return;
            }

            $activeStmt = $pdo->prepare(
                "SELECT session_id
                 FROM attendance_sessions
                 WHERE cs_id = ? AND status = 'active'
                 FOR UPDATE"
            );
            $activeStmt->execute([$csId]);
            if ($activeStmt->fetchColumn() !== false) {
                $pdo->rollBack();
                safe_error_response('An active attendance session already exists for this class section.', 409);
                return;
            }

            $insert = $pdo->prepare(
                "INSERT INTO attendance_sessions (
                    cs_id, secretary_user_id, owner_user_id, session_date, session_code, room,
                    started_at, status, geofence_enabled, geofence_latitude,
                    geofence_longitude, geofence_radius_meters, biometric_required,
                    opening_time, present_cutoff_time, late_cutoff_time,
                    created_at, updated_at
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 RETURNING session_id"
            );
            $insert->execute([
                $csId,
                $authCtx['user_id'],
                $authCtx['user_id'],
                $sessionDate,
                $sessionCode,
                $room,
                $nowSql,
                $geofenceEnabled,
                $latitude,
                $longitude,
                $radius,
                $biometricRequired,
                $openingTime,
                $presentCutoff,
                $lateCutoff,
                $nowSql,
                $nowSql,
            ]);
            $sessionId = (int) $insert->fetchColumn();

            $macKey = config_key_bytes_at_least($config['audit']['mac_key_b64'], 32, 'AUDIT_MAC_KEY');
            $auditCtx = audit_begin_operation($pdo);
            audit_finish_operation($pdo, $auditCtx, [
                'module_code' => 'secretary_attendance',
                'action_code' => 'attendance_session_started',
                'event_status' => 'Success',
                'actor_user_id' => $authCtx['user_id'],
                'actor_username' => $authCtx['login_email'],
                'actor_role' => $authCtx['role'],
                'actor_display_name' => $authCtx['display_name'],
                'session_id' => $authCtx['session_id'],
                'scope_cs_id' => $csId,
                'target_type' => 'attendance_session',
                'target_id' => (string) $sessionId,
                'description' => "Started attendance session '{$sessionCode}' for class section #{$csId}.",
                'reason' => null,
                'http_method' => $context['http_method'],
                'endpoint' => $context['endpoint'],
                'request_id' => $context['request_id'],
                'ip_address' => $context['ip_address'],
                'user_agent' => $context['user_agent'],
            ], $macKey, null, [
                'session_id' => $sessionId,
                'cs_id' => $csId,
                'session_date' => $sessionDate,
                'session_code' => $sessionCode,
                'status' => 'active',
                'started_at' => $nowSql,
            ]);

            $pdo->commit();
        } catch (\PDOException $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            $sqlState = $e->errorInfo[0] ?? (string) $e->getCode();
            if ($sqlState === '23505') {
                safe_error_response('An active attendance session or duplicate session code already exists for this class section.', 409);
                return;
            }
            throw $e;
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }

        $session = secretary_attendance_session_fetch($pdo, (int) $authCtx['user_id'], $sessionId);
        if ($session === null) {
            safe_error_response('Attendance session was created but could not be reloaded.', 500);
            return;
        }
        json_response([
            'status' => 'ok',
            'session' => secretary_attendance_session_map($session),
        ], 201);
    } catch (ValidationException $e) {
        validation_error_response($e->getErrors());
    } catch (\Throwable $e) {
        error_log('Secretary attendance session start error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

function handle_secretary_attendance_session_active(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = secretary_verify_auth($pdo, $config);

        $requestedCsId = null;
        if (isset($_GET['csId']) && $_GET['csId'] !== '') {
            if (!ctype_digit((string) $_GET['csId']) || (int) $_GET['csId'] <= 0) {
                validation_error_response([['field' => 'csId', 'message' => 'Class section ID must be a positive integer.']]);
                return;
            }
            $requestedCsId = (int) $_GET['csId'];
            $scopeStmt = $pdo->prepare(
                "SELECT 1 FROM class_sections WHERE cs_id = ? AND secretary_user_id = ?"
            );
            $scopeStmt->execute([$requestedCsId, $authCtx['user_id']]);
            if ($scopeStmt->fetchColumn() === false) {
                safe_error_response('Class section is not assigned to this Secretary.', 403);
                return;
            }
        }

        $session = secretary_attendance_session_fetch(
            $pdo,
            (int) $authCtx['user_id'],
            null,
            $requestedCsId,
            false,
            true
        );
        if ($session === null || strtolower((string) $session['status']) !== 'active') {
            json_response([
                'status' => 'ok',
                'activeSession' => null,
            ], 200);
            return;
        }

        json_response([
            'status' => 'ok',
            'activeSession' => secretary_attendance_session_map($session),
        ], 200);
    } catch (\Throwable $e) {
        error_log('Secretary active attendance session error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

function handle_secretary_attendance_session_end(): void
{
    $context = [
        'request_id' => request_id(),
        'ip_address' => request_ip(),
        'user_agent' => request_user_agent(),
        'http_method' => request_method(),
        'endpoint' => request_path(),
    ];

    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = secretary_verify_auth($pdo, $config);
        $body = request_body();
        if (!$body['has_body']) {
            safe_error_response('Request body required.', 400);
            return;
        }

        $sessionId = (int) ($body['data']['sessionId'] ?? $body['data']['id'] ?? 0);
        if ($sessionId <= 0) {
            throw new ValidationException([['field' => 'sessionId', 'message' => 'A valid attendance session ID is required.']]);
        }

        $now = secretary_attendance_session_now();
        $nowSql = $now->format('Y-m-d H:i:s.u');

        $pdo->beginTransaction();
        try {
            $session = secretary_attendance_session_fetch(
                $pdo,
                (int) $authCtx['user_id'],
                $sessionId,
                null,
                true
            );
            if ($session === null) {
                $pdo->rollBack();
                safe_error_response('Attendance session was not found in an assigned class.', 404);
                return;
            }
            if (strtolower((string) $session['status']) !== 'active') {
                $pdo->rollBack();
                safe_error_response('Attendance session has already ended.', 409);
                return;
            }

            $beforeState = [
                'session_id' => $sessionId,
                'cs_id' => (int) $session['cs_id'],
                'status' => 'active',
                'started_at' => (string) $session['started_at'],
                'ended_at' => null,
            ];
            $update = $pdo->prepare(
                "UPDATE attendance_sessions
                 SET status = 'ended', ended_at = ?, updated_at = ?
                 WHERE session_id = ? AND status = 'active'"
            );
            $update->execute([$nowSql, $nowSql, $sessionId]);
            if ($update->rowCount() !== 1) {
                $pdo->rollBack();
                safe_error_response('Attendance session could not be ended.', 409);
                return;
            }

            $resolvedAbsentCount = attendance_session_resolve_absences($pdo, $sessionId, $now);

            $macKey = config_key_bytes_at_least($config['audit']['mac_key_b64'], 32, 'AUDIT_MAC_KEY');
            $auditCtx = audit_begin_operation($pdo);
            audit_finish_operation($pdo, $auditCtx, [
                'module_code' => 'secretary_attendance',
                'action_code' => 'attendance_session_ended',
                'event_status' => 'Success',
                'actor_user_id' => $authCtx['user_id'],
                'actor_username' => $authCtx['login_email'],
                'actor_role' => $authCtx['role'],
                'actor_display_name' => $authCtx['display_name'],
                'session_id' => $authCtx['session_id'],
                'scope_cs_id' => (int) $session['cs_id'],
                'target_type' => 'attendance_session',
                'target_id' => (string) $sessionId,
                'description' => "Ended attendance session '{$session['session_code']}' for class section #{$session['cs_id']}.",
                'reason' => null,
                'http_method' => $context['http_method'],
                'endpoint' => $context['endpoint'],
                'request_id' => $context['request_id'],
                'ip_address' => $context['ip_address'],
                'user_agent' => $context['user_agent'],
            ], $macKey, $beforeState, [
                'session_id' => $sessionId,
                'cs_id' => (int) $session['cs_id'],
                'status' => 'ended',
                'started_at' => (string) $session['started_at'],
                'ended_at' => $nowSql,
                'resolved_absent_count' => $resolvedAbsentCount,
            ]);

            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }

        $session['status'] = 'ended';
        $session['ended_at'] = $nowSql;
        $session['updated_at'] = $nowSql;
        json_response([
            'status' => 'ok',
            'session' => secretary_attendance_session_map($session),
        ], 200);
    } catch (ValidationException $e) {
        validation_error_response($e->getErrors());
    } catch (\Throwable $e) {
        error_log('Secretary attendance session end error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

function handle_secretary_attendance_session_revoke(): void
{
    $context = [
        'request_id' => request_id(),
        'ip_address' => request_ip(),
        'user_agent' => request_user_agent(),
        'http_method' => request_method(),
        'endpoint' => request_path(),
    ];

    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = secretary_verify_auth($pdo, $config);
        $body = request_body();
        if (!$body['has_body']) {
            safe_error_response('Request body required.', 400);
            return;
        }
        $sessionId = (int) ($body['data']['sessionId'] ?? 0);
        $reason = array_key_exists('reason', $body['data']) ? trim((string) $body['data']['reason']) : null;
        if ($sessionId <= 0) {
            throw new ValidationException([['field' => 'sessionId', 'message' => 'A valid attendance session ID is required.']]);
        }
        if ($reason !== null && strlen($reason) > 500) {
            throw new ValidationException([['field' => 'reason', 'message' => 'Reason must not exceed 500 characters.']]);
        }
        $now = attendance_session_now_utc();
        $nowSql = $now->format('Y-m-d H:i:s.u');
        $pdo->beginTransaction();
        try {
            $session = secretary_attendance_session_fetch($pdo, (int) $authCtx['user_id'], $sessionId, null, true);
            if ($session === null) {
                $pdo->rollBack();
                safe_error_response('Attendance session was not found in an assigned class.', 404);
                return;
            }
            if (strtolower((string) $session['status']) !== 'active') {
                $pdo->rollBack();
                safe_error_response('Attendance session is not active.', 409);
                return;
            }
            $update = $pdo->prepare(
                "UPDATE attendance_sessions
                    SET status = 'revoked', revoked_at = ?, revoked_by_user_id = ?,
                        revocation_reason = ?, updated_at = ?
                  WHERE session_id = ? AND status = 'active'"
            );
            $update->execute([$nowSql, $authCtx['user_id'], $reason, $nowSql, $sessionId]);
            attendance_session_record_audit(
                $pdo, $config, $authCtx, $context, 'attendance_session_revoked', $sessionId, (int) $session['cs_id'],
                "Revoked attendance session '{$session['session_code']}' for class section #{$session['cs_id']}.", $reason,
                ['session_id' => $sessionId, 'status' => 'active'],
                ['session_id' => $sessionId, 'status' => 'revoked', 'revoked_at' => $nowSql]
            );
            $pdo->commit();
            $session['status'] = 'revoked';
            $session['revoked_at'] = $nowSql;
            $session['revoked_by_user_id'] = $authCtx['user_id'];
            $session['revocation_reason'] = $reason;
            $session['updated_at'] = $nowSql;
            json_response(['status' => 'ok', 'session' => secretary_attendance_session_map($session)], 200);
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) { $pdo->rollBack(); }
            throw $e;
        }
    } catch (ValidationException $e) {
        validation_error_response($e->getErrors());
    } catch (Throwable $e) {
        error_log('Secretary attendance session revoke error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

function handle_secretary_attendance_get(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = secretary_verify_auth($pdo, $config);

        $stmt = $pdo->prepare(
            "SELECT r.record_id, r.enrollment_id, r.attendance_session_id, r.session_date, r.session_code, r.status,
                    r.override_reason, r.override_at, s.student_id, s.student_number,
                    s.first_name, s.last_name, cs.cs_id, cs.cs_name, c.course_code
             FROM attendance_records r
             JOIN enrollments e ON r.enrollment_id = e.enrollment_id
             JOIN students s ON e.student_id = s.student_id
             JOIN class_sections cs ON cs.cs_id = e.cs_id
             JOIN courses c ON c.course_id = cs.course_id
             WHERE cs.secretary_user_id = ?
             ORDER BY r.session_date DESC, r.record_id DESC"
        );
        $stmt->execute([$authCtx['user_id']]);
        $records = $stmt ? $stmt->fetchAll(PDO::FETCH_ASSOC) : [];

        $mapped = array_map(function ($r) {
            return [
                'id' => (string) $r['record_id'],
                'attendanceSessionId' => $r['attendance_session_id'] !== null ? (string) $r['attendance_session_id'] : null,
                'studentId' => (string) $r['student_id'],
                'studentNumber' => $r['student_number'],
                'studentName' => trim($r['first_name'] . ' ' . $r['last_name']),
                'date' => $r['session_date'],
                'subjectCode' => $r['course_code'],
                'classId' => (string) $r['cs_id'],
                'className' => $r['cs_name'],
                'status' => strtolower($r['status']),
                'overrideReason' => $r['override_reason'] ?? null,
                'overrideAt' => $r['override_at'] ?? null,
            ];
        }, $records);

        json_response([
            'status' => 'ok',
            'records' => $mapped,
        ], 200);
    } catch (\Throwable $e) {
        error_log('Secretary attendance get error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

function handle_secretary_attendance_override(): void
{
    $context = [
        'request_id' => request_id(),
        'ip_address' => request_ip(),
        'user_agent' => request_user_agent(),
        'http_method' => request_method(),
        'endpoint' => request_path(),
    ];

    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = secretary_verify_auth($pdo, $config);

        $body = request_body();
        if (!$body['has_body']) {
            safe_error_response('Request body required.', 400);
            return;
        }

        $data = $body['data'];
        $studentId = validate_required_string($data, 'studentId', 1, 100);
        $recordId = isset($data['recordId']) ? (int) $data['recordId'] : 0;
        $status = validate_enum($data, 'status', ['present', 'late', 'absent', 'excused']);
        $reason = validate_required_string($data, 'reason', 8, 240);

        $nowSql = (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d H:i:s.u');

        $pdo->beginTransaction();
        try {
            $macKey = config_key_bytes_at_least($config['audit']['mac_key_b64'], 32, 'AUDIT_MAC_KEY');
            $auditCtx = audit_begin_operation($pdo);

            $lookupSql = "SELECT r.record_id, cs.cs_id
                          FROM attendance_records r
                          JOIN enrollments e ON e.enrollment_id = r.enrollment_id
                          JOIN students s ON s.student_id = e.student_id
                          JOIN class_sections cs ON cs.cs_id = e.cs_id
                          WHERE cs.secretary_user_id = :secretary_id
                            AND (s.student_id = :student_id OR s.student_number = :student_number)";
            $params = [
                ':secretary_id' => $authCtx['user_id'],
                ':student_id' => ctype_digit($studentId) ? (int) $studentId : 0,
                ':student_number' => $studentId,
            ];
            if ($recordId > 0) {
                $lookupSql .= " AND r.record_id = :record_id";
                $params[':record_id'] = $recordId;
            }
            $lookupSql .= " ORDER BY r.session_date DESC, r.record_id DESC LIMIT 1 FOR UPDATE";
            $lookup = $pdo->prepare($lookupSql);
            $lookup->execute($params);
            $targetRecord = $lookup->fetch(PDO::FETCH_ASSOC);
            $targetRecordId = (int) ($targetRecord['record_id'] ?? 0);
            $targetCsId = (int) ($targetRecord['cs_id'] ?? 0);
            if ($targetRecordId <= 0) {
                throw new ValidationException([['field' => 'recordId', 'message' => 'Attendance record was not found in an assigned class.']]);
            }

            $update = $pdo->prepare(
                "UPDATE attendance_records
                 SET status = ?, verification_method = 'manual_secretary', override_reason = ?,
                     override_by_user_id = ?, override_at = ?
                 WHERE record_id = ?"
            );
            $update->execute([$status, $reason, $authCtx['user_id'], $nowSql, $targetRecordId]);

            audit_finish_operation($pdo, $auditCtx, [
                'module_code' => 'secretary',
                'action_code' => 'secretary_attendance_override',
                'event_status' => 'Success',
                'actor_user_id' => $authCtx['user_id'],
                'actor_username' => $authCtx['login_email'],
                'actor_role' => $authCtx['role'],
                'actor_display_name' => $authCtx['display_name'],
                'session_id' => $authCtx['session_id'],
                'scope_cs_id' => $targetCsId,
                'target_type' => 'attendance_record',
                'target_id' => (string) $targetRecordId,
                'description' => "Manual attendance override applied for student ID {$studentId} to status '{$status}'. Reason: {$reason}",
                'reason' => $reason,
                'http_method' => $context['http_method'],
                'endpoint' => $context['endpoint'],
                'request_id' => $context['request_id'],
                'ip_address' => $context['ip_address'],
                'user_agent' => $context['user_agent'],
            ], $macKey);

            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) { $pdo->rollBack(); }
            throw $e;
        }

        json_response([
            'status' => 'ok',
            'message' => 'Manual attendance override saved and audit trail updated.',
            'record' => [
                'id' => (string) $targetRecordId,
                'status' => $status,
                'overrideReason' => $reason,
                'overrideAt' => $nowSql,
            ],
        ], 200);
    } catch (ValidationException $e) {
        validation_error_response($e->getErrors());
    } catch (\Throwable $e) {
        error_log('Secretary attendance override error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

function handle_secretary_profile_get(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = secretary_verify_auth($pdo, $config);

        $stmt = $pdo->prepare("SELECT user_id, login_email, display_name, title, theme FROM user_accounts WHERE user_id = ?");
        $stmt->execute([$authCtx['user_id']]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        $csStmt = $pdo->prepare("SELECT cs_name, lab_room, lec_room FROM class_sections WHERE secretary_user_id = ? ORDER BY cs_id LIMIT 1");
        $csStmt->execute([$authCtx['user_id']]);
        $csRow = $csStmt->fetch(PDO::FETCH_ASSOC);

        json_response([
            'status' => 'ok',
            'profile' => [
                'id' => (string) ($user['user_id'] ?? $authCtx['user_id']),
                'name' => $user['display_name'] ?? $authCtx['display_name'],
                'email' => $user['login_email'] ?? $authCtx['login_email'],
                'title' => $user['title'] ?? 'Class Secretary',
                'assignedClassName' => $csRow['cs_name'] ?? '',
                'classroomName' => ($csRow['lab_room'] ?? null) ?: ($csRow['lec_room'] ?? null) ?: '',
                'cctvCameraId' => null,
                'theme' => $user['theme'] ?? 'light',
            ],
        ], 200);
    } catch (\Throwable $e) {
        error_log('Secretary profile get error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

function handle_secretary_profile_update(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = secretary_verify_auth($pdo, $config);

        $body = request_body();
        if (!$body['has_body']) {
            safe_error_response('Request body required.', 400);
            return;
        }

        $data = $body['data'];
        $name = validate_person_name($data, 'name', 2, 255);
        $email = validate_institutional_email($data['email'] ?? '');

        $parts = explode(' ', $name);
        $lastName = count($parts) > 1 ? array_pop($parts) : '';
        $firstName = implode(' ', $parts) ?: $name;
        $pdo->beginTransaction();
        try {
            update_account_identity($pdo, (int) $authCtx['user_id'], $name, $email);
            $updStudent = $pdo->prepare("UPDATE students SET first_name = ?, last_name = ?, bu_email = ? WHERE user_id = ?");
            $updStudent->execute([$firstName, $lastName, $email, $authCtx['user_id']]);
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }

        json_response(['status' => 'ok', 'message' => 'Class Secretary profile updated successfully.'], 200);
    } catch (ValidationException $e) {
        validation_error_response($e->getErrors());
    } catch (\Throwable $e) {
        error_log('Secretary profile update error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

function handle_secretary_settings_get(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = secretary_verify_auth($pdo, $config);

        $stmt = $pdo->prepare("SELECT theme FROM user_accounts WHERE user_id = ?");
        $stmt->execute([$authCtx['user_id']]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        $classStmt = $pdo->prepare("SELECT cs_name FROM class_sections WHERE secretary_user_id = ? ORDER BY cs_id LIMIT 1");
        $classStmt->execute([$authCtx['user_id']]);
        $assignedClassName = $classStmt->fetchColumn();

        json_response([
            'status' => 'ok',
            'settings' => [
                'theme' => $user['theme'] ?? 'light',
                'assignedClassName' => is_string($assignedClassName) ? $assignedClassName : '',
            ],
        ], 200);
    } catch (\Throwable $e) {
        error_log('Secretary settings get error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

function handle_secretary_settings_update(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = secretary_verify_auth($pdo, $config);

        $body = request_body();
        if (!$body['has_body']) {
            safe_error_response('Request body required.', 400);
            return;
        }

        $data = $body['data'];
        $theme = validate_enum($data, 'theme', ['light', 'dark']);

        $upd = $pdo->prepare("UPDATE user_accounts SET theme = ? WHERE user_id = ?");
        $upd->execute([$theme, $authCtx['user_id']]);

        json_response(['status' => 'ok', 'message' => 'Class Secretary preferences saved successfully.'], 200);
    } catch (ValidationException $e) {
        validation_error_response($e->getErrors());
    } catch (\Throwable $e) {
        error_log('Secretary settings update error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}
