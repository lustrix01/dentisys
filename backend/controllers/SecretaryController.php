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
        $authCtx = auth_verify_access_token($pdo, $token, $jwtKey);

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
                 VALUES ('secretary_invitation', ?, ?, ?, ?, ?, ?, ?)"
            );
            $ins->execute([
                $authCtx['user_id'], $assignment['student_id'], $assignment['cs_id'],
                $tokenHash, $nowSql, $expiresSql, $metadata,
            ]);
            $stId = (int) $pdo->lastInsertId();

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

        $invitationLink = "http://localhost:5173/activate-secretary?token={$invToken}";
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
             VALUES (?, ?, ?, ?, 'Secretary Invitation', ?, 'Pending', ?)"
        );
        $outbox->execute([$authCtx['user_id'], $email, $studentName, $subject, $body, $operationUuid]);
        $emailId = (int) $pdo->lastInsertId();
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
            'token' => $invToken,
            'invitation_link' => $invitationLink,
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
             SET revoked_at = NOW(6), revocation_reason = 'Revoked by issuing faculty member'
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
                "SELECT student_id, user_id, bu_email
                   FROM students
                  WHERE student_id = ?
                  FOR UPDATE"
            );
            $studentLock->execute([(int) $row['related_student_id']]);
            $student = $studentLock->fetch(PDO::FETCH_ASSOC);
            if (!$student
                || $student['user_id'] !== null
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
                 VALUES (?, ?, 'secretary', ?, 'Class Secretary', 'Active', ?)"
            );
            $ins->execute([$email, $passwordHash, $displayName, $nowSql]);
            $userId = (int) $pdo->lastInsertId();

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
        $authCtx = auth_verify_access_token($pdo, $token, $jwtKey);
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

function handle_secretary_attendance_get(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = secretary_verify_auth($pdo, $config);

        $stmt = $pdo->prepare(
            "SELECT r.record_id, r.enrollment_id, r.session_date, r.session_code, r.status,
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
            email_mfa_update_account_identity($pdo, (int) $authCtx['user_id'], $name, $email);
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
