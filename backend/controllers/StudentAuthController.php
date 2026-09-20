<?php

declare(strict_types=1);

function student_auth_context(): array
{
    return [
        'request_id' => request_id(),
        'ip_address' => request_ip(),
        'user_agent' => request_user_agent(),
        'http_method' => request_method(),
        'endpoint' => request_path(),
    ];
}

function student_auth_unavailable_response(): void
{
    auth_controller_emit(auth_build_no_store_message_response(
        'Student authentication is currently unavailable.',
        503
    ));
}

function student_auth_generic_422(array $errors): void
{
    // Keep policy failures deterministic so token validity cannot affect the
    // response body. Request correlation remains available in server logs.
    auth_controller_emit(auth_build_no_store_json_response([
        'status' => 'error',
        'code' => 'VALIDATION_ERROR',
        'message' => 'Validation failed.',
        'errors' => $errors,
    ], 422));
}

function student_auth_validation_response(array $errors): void
{
    $response = build_validation_error_response($errors);
    $response['headers'] = array_merge($response['headers'], build_no_store_headers());
    auth_controller_emit($response);
}

function student_auth_success_response(array $payload, int $statusCode = 200): void
{
    auth_controller_emit(auth_build_no_store_json_response($payload, $statusCode));
}

function student_auth_error_response(string $message, int $statusCode): void
{
    auth_controller_emit(auth_build_no_store_message_response($message, $statusCode));
}

function student_auth_credentials_response(array $credentials): void
{
    $response = auth_build_no_store_json_response([
        'type' => 'direct_login',
        'two_factor_required' => false,
        'two_factor_enrolled' => false,
        'access_token' => $credentials['access_token'],
        'user' => ['user_id' => $credentials['session']['user_id']],
    ], 200);
    $isHttps = request_is_https(app_config(), $_SERVER);
    $response['headers'] = array_merge(
        $response['headers'],
        build_refresh_cookie_header($credentials['refresh_token'], $credentials['cookie_ttl'], $isHttps)
    );
    auth_controller_emit($response);
}

function handle_student_invitation_create(): void
{
    $context = student_auth_context();
    try {
        $config = app_config();
        if (!student_auth_is_enabled($config)) {
            student_auth_error_response('Student account activation is unavailable.', 503);
            return;
        }
        $pdo = create_pdo($config);
        $authCtx = faculty_verify_auth($pdo, $config);
        if ($authCtx['role'] !== 'faculty') {
            student_auth_error_response('Only Faculty can invite Students.', 403);
            return;
        }
        $body = request_body();
        if (!$body['has_body']) {
            student_auth_error_response('Request body required.', 400);
            return;
        }
        $data = $body['data'];
        if (array_diff(array_keys($data), ['studentId', 'classId']) !== []) {
            student_auth_error_response('Invalid request.', 400);
            return;
        }
        $studentId = filter_var($data['studentId'] ?? null, FILTER_VALIDATE_INT);
        $classId = filter_var($data['classId'] ?? null, FILTER_VALIDATE_INT);
        if (!$studentId || !$classId || $studentId < 1 || $classId < 1) {
            student_auth_error_response('Canonical Student and class identifiers are required.', 422);
            return;
        }

        $pdo->beginTransaction();
        try {
            $studentStmt = $pdo->prepare(
                "SELECT s.student_id, s.student_number, s.first_name, s.last_name, s.bu_email, s.status,
                        s.student_account_user_id, s.user_id, cs.cs_id, cs.cs_name
                   FROM students s
                   JOIN enrollments e ON e.student_id = s.student_id
                   JOIN class_sections cs ON cs.cs_id = e.cs_id
                  WHERE s.student_id = ? AND cs.cs_id = ? AND e.status = 'Active'
                    AND lower(cs.status) = 'active' AND cs.instructor_user_id = ?
                  FOR UPDATE OF s, e, cs"
            );
            $studentStmt->execute([(int) $studentId, (int) $classId, (int) $authCtx['user_id']]);
            $student = $studentStmt->fetch(PDO::FETCH_ASSOC);
            if ($student === false || strtolower((string) $student['status']) !== 'active') {
                throw new DomainException('Student must be active and enrolled in a class assigned to this Faculty member.');
            }
            if ($student['user_id'] !== null) {
                throw new DomainException('This canonical Student record is linked to a Secretary account and cannot be invited as a Student.');
            }
            $email = validate_institutional_email((string) ($student['bu_email'] ?? ''));
            $account = null;
            if ($student['student_account_user_id'] !== null) {
                $accountStmt = $pdo->prepare(
                    'SELECT user_id, login_email, role, status, display_name, google_subject FROM user_accounts WHERE user_id = ? FOR UPDATE'
                );
                $accountStmt->execute([(int) $student['student_account_user_id']]);
                $account = $accountStmt->fetch(PDO::FETCH_ASSOC) ?: null;
                if ($account === null || $account['role'] !== 'student'
                    || $account['status'] !== 'Pending Activation'
                    || strtolower(trim((string) $account['login_email'])) !== strtolower(trim($email))) {
                    throw new DomainException('This Student identity is already linked to an account that cannot be re-invited. Manual reconciliation is required.');
                }
                if (!empty($account['google_subject'])) {
                    $evidence = $pdo->prepare(
                        "SELECT COUNT(*) FROM security_tokens
                          WHERE purpose = 'student_activation' AND user_id = ? AND related_student_id = ?"
                    );
                    $evidence->execute([(int) $account['user_id'], (int) $student['student_id']]);
                    if ((int) $evidence->fetchColumn() < 1) {
                        throw new DomainException('This pending Student account has a Google identity that cannot be safely cleared. Manual reconciliation is required.');
                    }
                    $clearGoogle = $pdo->prepare('UPDATE user_accounts SET google_subject = NULL WHERE user_id = ?');
                    $clearGoogle->execute([(int) $account['user_id']]);
                }
            } else {
                $emailCheck = $pdo->prepare('SELECT user_id FROM user_accounts WHERE lower(login_email) = lower(?) FOR UPDATE');
                $emailCheck->execute([$email]);
                if ($emailCheck->fetchColumn() !== false) {
                    throw new DomainException('An account already exists for this institutional email. Manual reconciliation is required.');
                }
                $placeholderHash = password_hash(student_auth_activation_raw_token(), PASSWORD_DEFAULT);
                $displayName = trim((string) $student['first_name'] . ' ' . (string) $student['last_name']);
                $insertAccount = $pdo->prepare(
                    "INSERT INTO user_accounts (login_email, password_hash, role, display_name, status, created_at)
                     VALUES (?, ?, 'student', ?, 'Pending Activation', CURRENT_TIMESTAMP(6)) RETURNING user_id"
                );
                $insertAccount->execute([$email, $placeholderHash, $displayName]);
                $accountId = (int) $insertAccount->fetchColumn();
                $linkStudent = $pdo->prepare(
                    'UPDATE students SET student_account_user_id = ? WHERE student_id = ? AND student_account_user_id IS NULL AND user_id IS NULL'
                );
                $linkStudent->execute([$accountId, (int) $student['student_id']]);
                if ($linkStudent->rowCount() !== 1) {
                    throw new DomainException('Student identity changed while issuing the invitation.');
                }
                $account = [
                    'user_id' => $accountId,
                    'login_email' => $email,
                    'role' => 'student',
                    'status' => 'Pending Activation',
                    'display_name' => $displayName,
                ];
            }

            $accountId = (int) $account['user_id'];
            $now = new DateTimeImmutable('now', new DateTimeZone('UTC'));
            $nowSql = $now->format('Y-m-d H:i:s.u');
            $expiresSql = $now->add(new DateInterval('P1D'))->format('Y-m-d H:i:s.u');
            $revoke = $pdo->prepare(
                "UPDATE security_tokens SET revoked_at = ?, revocation_reason = 'Replaced by a Faculty-authorized Student invitation'
                  WHERE purpose = 'student_activation' AND user_id = ? AND used_at IS NULL AND revoked_at IS NULL"
            );
            $revoke->execute([$nowSql, $accountId]);
            $rawToken = student_auth_activation_raw_token();
            $digest = hash('sha256', $rawToken, true);
            $tokenStmt = $pdo->prepare(
                "INSERT INTO security_tokens (purpose, user_id, related_student_id, related_cs_id, token_digest, issued_at, expires_at)
                 VALUES ('student_activation', ?, ?, ?, ?, ?, ?) RETURNING token_id"
            );
            $tokenStmt->bindValue(1, $accountId, PDO::PARAM_INT);
            $tokenStmt->bindValue(2, (int) $student['student_id'], PDO::PARAM_INT);
            $tokenStmt->bindValue(3, (int) $classId, PDO::PARAM_INT);
            pdo_bind_binary($tokenStmt, 4, $digest);
            $tokenStmt->bindValue(5, $nowSql, PDO::PARAM_STR);
            $tokenStmt->bindValue(6, $expiresSql, PDO::PARAM_STR);
            $tokenStmt->execute();
            $tokenId = (int) $tokenStmt->fetchColumn();

            $invitationLink = app_url($config, '/activate-student', ['token' => $rawToken]);
            $subject = 'DentiSys Student Invitation';
            $messageBody = student_auth_activation_email($student, $invitationLink);
            $outbox = $pdo->prepare(
                "INSERT INTO email_outbox
                 (sender_user_id, recipient_email, recipient_name, subject, email_type, message_body, status, operation_uuid)
                 VALUES (?, ?, ?, ?, 'Student Invitation', ?, 'Pending', ?) RETURNING email_id"
            );
            $outbox->execute([
                $authCtx['user_id'], $email,
                trim((string) $student['first_name'] . ' ' . (string) $student['last_name']),
                $subject, $messageBody, uuid_v4_string(),
            ]);
            $emailId = (int) $outbox->fetchColumn();

            $macKey = config_key_bytes_at_least($config['audit']['mac_key_b64'], 32, 'AUDIT_MAC_KEY');
            $auditContext = audit_begin_operation($pdo);
            audit_finish_operation($pdo, $auditContext, [
                'module_code' => 'faculty', 'action_code' => 'student_invited', 'event_status' => 'Success',
                'actor_user_id' => $authCtx['user_id'], 'actor_username' => $authCtx['login_email'],
                'actor_role' => $authCtx['role'], 'actor_display_name' => $authCtx['display_name'],
                'session_id' => $authCtx['session_id'], 'scope_cs_id' => (int) $classId,
                'target_type' => 'security_token', 'target_id' => (string) $tokenId,
                'description' => "Faculty invited canonical Student {$student['student_number']} to {$student['cs_name']}.",
                'reason' => null, 'http_method' => $context['http_method'], 'endpoint' => $context['endpoint'],
                'request_id' => $context['request_id'], 'ip_address' => $context['ip_address'], 'user_agent' => $context['user_agent'],
            ], $macKey);
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) { $pdo->rollBack(); }
            throw $e;
        }

        $sent = send_email($email, $subject, $messageBody, $config, true);
        $finish = $pdo->prepare(
            'UPDATE email_outbox SET status = ?, sent_at = ?, failure_reason = ? WHERE email_id = ?'
        );
        $finish->execute([
            $sent ? 'Sent' : 'Failed',
            $sent ? (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d H:i:s.u') : null,
            $sent ? null : 'SMTP delivery failed or is not configured.',
            $emailId,
        ]);
        $link = $invitationLink;
        $showDevLink = !empty($config['show_dev_invitation_link']);
        student_auth_success_response([
            'status' => 'ok',
            'invitation' => [
                'studentId' => (string) $studentId,
                'classId' => (string) $classId,
                'email' => $email,
                'expiresAt' => $expiresSql,
            ],
            'invitation_link' => $showDevLink ? $link : null,
            'delivery_status' => $sent ? 'Sent' : 'Failed',
            'message' => $sent ? 'Student invitation issued and sent.' : 'Student invitation issued, but email delivery failed.',
        ], 201);
    } catch (ValidationException $e) {
        student_auth_validation_response($e->getErrors());
    } catch (DomainException $e) {
        student_auth_error_response($e->getMessage(), 409);
    } catch (AuthException | ChallengeException | \RuntimeException $e) {
        student_auth_error_response('Authentication required.', 401);
    } catch (PDOException $e) {
        if ((string) $e->getCode() === '23505') {
            student_auth_error_response('This Student invitation conflicts with another account or live token.', 409);
            return;
        }
        error_log('Student invitation error [' . ($context['request_id'] ?? '?') . ']: ' . sanitize_for_log($e));
        student_auth_error_response('Unable to issue Student invitation.', 500);
    } catch (Throwable $e) {
        error_log('Student invitation error [' . ($context['request_id'] ?? '?') . ']: ' . sanitize_for_log($e));
        student_auth_error_response('Unable to issue Student invitation.', 500);
    }
}

function handle_student_invitation_get(): void
{
    try {
        $config = app_config();
        if (!student_auth_is_enabled($config)) {
            student_auth_error_response('Student account activation is unavailable.', 503);
            return;
        }
        $token = is_string($_GET['token'] ?? null) ? $_GET['token'] : '';
        if (!preg_match(STUDENT_ACTIVATION_TOKEN_PATTERN, $token)) {
            student_auth_error_response('Invalid or expired Student invitation.', 400);
            return;
        }
        $pdo = create_pdo($config);
        $tokenRow = student_auth_activation_context($pdo, hash('sha256', $token, true));
        if ($tokenRow === null || $tokenRow['related_cs_id'] === null
            || $tokenRow['used_at'] !== null || $tokenRow['revoked_at'] !== null
            || new DateTimeImmutable((string) $tokenRow['expires_at'], new DateTimeZone('UTC')) <= new DateTimeImmutable('now', new DateTimeZone('UTC'))) {
            student_auth_error_response('Invalid or expired Student invitation.', 400);
            return;
        }
        $stmt = $pdo->prepare(
            "SELECT s.student_id, s.student_number, s.first_name, s.last_name, s.bu_email,
                    ua.login_email, cs.cs_name
               FROM students s
               JOIN user_accounts ua ON ua.user_id = ?
               JOIN class_sections cs ON cs.cs_id = ?
              WHERE s.student_id = ? AND s.student_account_user_id = ua.user_id
                AND s.user_id IS NULL AND ua.role = 'student' AND ua.status = 'Pending Activation'
                AND lower(s.status) = 'active' AND lower(s.bu_email) = lower(ua.login_email)"
        );
        $stmt->execute([(int) $tokenRow['user_id'], (int) $tokenRow['related_cs_id'], (int) $tokenRow['related_student_id']]);
        $student = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($student === false || !student_auth_active_class_enrollment($pdo, (int) $tokenRow['related_student_id'], (int) $tokenRow['related_cs_id'])) {
            student_auth_error_response('Invalid or expired Student invitation.', 400);
            return;
        }
        try {
            validate_institutional_email((string) $student['bu_email']);
        } catch (ValidationException) {
            student_auth_error_response('Invalid or expired Student invitation.', 400);
            return;
        }
        student_auth_success_response([
            'status' => 'ok',
            'invitation' => [
                'studentName' => trim((string) $student['first_name'] . ' ' . (string) $student['last_name']),
                'studentNumber' => (string) $student['student_number'],
                'email' => (string) $student['login_email'],
                'className' => (string) $student['cs_name'],
                'expiresAt' => (string) $tokenRow['expires_at'],
            ],
        ], 200);
    } catch (Throwable $e) {
        error_log('Student invitation inspection error: ' . sanitize_for_log($e));
        student_auth_error_response('Unable to inspect Student invitation.', 500);
    }
}

function handle_student_activate(): void
{
    $context = student_auth_context();
    try {
        $config = app_config();
        if (!student_auth_is_enabled($config)) {
            student_auth_unavailable_response();
            return;
        }

        $body = request_body();
        if (!$body['has_body']) {
            student_auth_error_response('Invalid request.', 400);
            return;
        }
        $data = $body['data'];
        if (array_diff(array_keys($data), ['token', 'password', 'credential']) !== []
            || !array_key_exists('token', $data)
            || !array_key_exists('password', $data)
            || (isset($data['credential']) && !is_string($data['credential']))) {
            student_auth_error_response('Invalid request.', 400);
            return;
        }
        $token = $data['token'];
        if (!is_string($token) || !preg_match(STUDENT_ACTIVATION_TOKEN_PATTERN, $token)) {
            student_auth_error_response('Invalid or expired activation token.', 400);
            return;
        }

        try {
            $password = extract_password($data, 'password');
            validate_password_policy($password);
        } catch (InvalidCredentialsException $e) {
            student_auth_generic_422([['field' => 'password', 'message' => $e->getMessage()]]);
            return;
        } catch (ValidationException $e) {
            student_auth_generic_422($e->getErrors());
            return;
        }

        // This is the first token-dependent operation in the endpoint.
        $tokenDigest = hash('sha256', $token, true);
        $pdo = create_pdo($config);
        $contextRow = student_auth_activation_context($pdo, $tokenDigest);
        if ($contextRow === null || $contextRow['related_cs_id'] === null
            || $contextRow['used_at'] !== null || $contextRow['revoked_at'] !== null
            || new DateTimeImmutable((string) $contextRow['expires_at'], new DateTimeZone('UTC')) <= new DateTimeImmutable('now', new DateTimeZone('UTC'))) {
            student_auth_error_response('Invalid or expired activation token.', 400);
            return;
        }

        $identityStmt = $pdo->prepare(
            "SELECT ua.login_email
               FROM user_accounts ua
               JOIN students s ON s.student_account_user_id = ua.user_id
              WHERE ua.user_id = ? AND s.student_id = ? AND s.user_id IS NULL
                AND ua.role = 'student' AND ua.status = 'Pending Activation'
                AND lower(s.status) = 'active' AND lower(s.bu_email) = lower(ua.login_email)"
        );
        $identityStmt->execute([(int) $contextRow['user_id'], (int) $contextRow['related_student_id']]);
        $invitedEmail = $identityStmt->fetchColumn();
        if (!is_string($invitedEmail)
            || !student_auth_active_class_enrollment($pdo, (int) $contextRow['related_student_id'], (int) $contextRow['related_cs_id'])) {
            student_auth_error_response('Invalid or expired activation token.', 400);
            return;
        }
        try {
            $invitedEmail = validate_institutional_email($invitedEmail);
        } catch (ValidationException) {
            student_auth_error_response('Invalid or expired activation token.', 400);
            return;
        }
        $googleSubject = null;
        if (isset($data['credential'])) {
            $claims = google_verify_id_token($config, $data['credential']);
            if (strtolower(trim($claims['email'])) !== strtolower(trim($invitedEmail))) {
                student_auth_error_response('Google identity does not match the invited Student email.', 409);
                return;
            }
            $googleSubject = $claims['sub'];
        }

        $passwordHash = password_hash($password, PASSWORD_DEFAULT);
        $pdo->beginTransaction();
        try {
            // Lock order: Student, active enrollment, account, activation token.
            $studentStmt = $pdo->prepare(
                "SELECT * FROM students WHERE student_id = ? FOR UPDATE"
            );
            $studentStmt->execute([(int) $contextRow['related_student_id']]);
            $student = $studentStmt->fetch(PDO::FETCH_ASSOC);

            $hasEnrollment = $student !== false
                ? student_auth_active_class_enrollment($pdo, (int) $student['student_id'], (int) $contextRow['related_cs_id'], true)
                : false;

            $accountStmt = $pdo->prepare(
                "SELECT user_id, login_email, role, display_name, status, google_subject
                   FROM user_accounts WHERE user_id = ? FOR UPDATE"
            );
            $accountStmt->execute([(int) $contextRow['user_id']]);
            $account = $accountStmt->fetch(PDO::FETCH_ASSOC);

            $tokenStmt = $pdo->prepare(
                "SELECT * FROM security_tokens
                  WHERE token_id = ? AND purpose = 'student_activation'
                  FOR UPDATE"
            );
            $tokenStmt->execute([(int) $contextRow['token_id']]);
            $lockedToken = $tokenStmt->fetch(PDO::FETCH_ASSOC);

            $institutionalEmailValid = false;
            if ($student !== false && $student['bu_email'] !== null) {
                try {
                    $institutionalEmailValid = validate_institutional_email((string) $student['bu_email'])
                        === strtolower(trim((string) $student['bu_email']));
                } catch (ValidationException) {
                    $institutionalEmailValid = false;
                }
            }

            $valid = $student !== false
                && $account !== false
                && $lockedToken !== false
                && (int) $lockedToken['user_id'] === (int) $account['user_id']
                && (int) $lockedToken['related_student_id'] === (int) $student['student_id']
                && (int) $lockedToken['related_cs_id'] === (int) $contextRow['related_cs_id']
                && $lockedToken['used_at'] === null
                && $lockedToken['revoked_at'] === null
                && new DateTimeImmutable((string) $lockedToken['expires_at'], new DateTimeZone('UTC')) > new DateTimeImmutable('now', new DateTimeZone('UTC'))
                && $account['status'] === 'Pending Activation'
                && $account['role'] === 'student'
                && (int) $student['student_account_user_id'] === (int) $account['user_id']
                && $student['user_id'] === null
                && strtolower((string) $student['status']) === 'active'
                && $student['bu_email'] !== null
                && strtolower(trim((string) $student['bu_email'])) === strtolower(trim((string) $account['login_email']))
                && $institutionalEmailValid
                && $hasEnrollment;

            if (!$valid) {
                $pdo->rollBack();
                student_auth_error_response('Invalid or expired activation token.', 400);
                return;
            }

            if ($googleSubject !== null) {
                $subjectStmt = $pdo->prepare('SELECT user_id FROM user_accounts WHERE google_subject = ? AND user_id <> ? FOR UPDATE');
                $subjectStmt->execute([$googleSubject, (int) $account['user_id']]);
                if ($subjectStmt->fetchColumn() !== false) {
                    throw new DomainException('This Google identity is already linked to another account.');
                }
            }

            $nowSql = (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d H:i:s.u');
            $update = $pdo->prepare(
                "UPDATE user_accounts SET password_hash = ?, google_subject = ?, status = 'Active', updated_at = ? WHERE user_id = ?"
            );
            $update->execute([$passwordHash, $googleSubject, $nowSql, $account['user_id']]);
            $used = $pdo->prepare(
                "UPDATE security_tokens SET used_at = ? WHERE token_id = ? AND used_at IS NULL AND revoked_at IS NULL"
            );
            $used->execute([$nowSql, $lockedToken['token_id']]);
            if ($used->rowCount() !== 1) {
                throw new DomainException('Invalid or expired activation token.');
            }
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) { $pdo->rollBack(); }
            throw $e;
        }

        student_auth_audit($pdo, $config, $context, 'student_activation_completed', 'Success', [
            'actor_user_id' => (int) $account['user_id'],
            'actor_username' => $account['login_email'],
            'actor_role' => 'student',
            'actor_display_name' => $account['display_name'],
            'target_type' => 'user_account',
            'target_id' => (string) $account['user_id'],
            'description' => 'Student account activation completed.',
        ]);
        student_auth_success_response([
            'status' => 'ok',
            'message' => 'Student account activated. You may now sign in.',
        ], 200);
    } catch (GoogleIdentityException $e) {
        student_auth_error_response($e->getMessage(), google_auth_identity_error_status($e->reason()));
    } catch (DomainException $e) {
        student_auth_error_response($e->getMessage(), 409);
    } catch (PDOException $e) {
        if ((string) $e->getCode() === '23505') {
            student_auth_error_response('This Google identity is already linked to another account.', 409);
            return;
        }
        error_log('Student activation error [' . ($context['request_id'] ?? '?') . ']: ' . sanitize_for_log($e));
        student_auth_error_response('Internal server error.', 500);
    } catch (Throwable $e) {
        error_log('Student activation error [' . ($context['request_id'] ?? '?') . ']: ' . sanitize_for_log($e));
        student_auth_error_response('Internal server error.', 500);
    }
}

function handle_development_mock_student_session(): void
{
    $context = student_auth_context();
    try {
        $config = app_config();
        if (!student_auth_mock_is_available($config)) {
            safe_error_response('Endpoint not found.', 404);
            return;
        }
        $pdo = create_pdo($config);
        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare(
                "SELECT user_id, login_email, password_hash, role, display_name, status, token_version
                   FROM user_accounts
                  WHERE login_email = 'student@bicol-u.edu.ph'
                    AND role = 'student'
                  FOR UPDATE"
            );
            $stmt->execute();
            $user = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($user === false) {
                throw new AuthException('Development Student fixture is unavailable.');
            }
            auth_assert_student_eligible($pdo, $config, (int) $user['user_id'], true);
            $credentials = auth_issue_credentials($pdo, $user, $config, $context, 'development_mock');
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) { $pdo->rollBack(); }
            throw $e;
        }
        student_auth_audit($pdo, $config, $context, 'development_mock_student_session_created', 'Success', [
            'actor_user_id' => $credentials['session']['user_id'],
            'actor_username' => $user['login_email'],
            'actor_role' => 'student',
            'actor_display_name' => $user['display_name'],
            'session_id' => $credentials['session']['session_id'],
            'target_type' => 'auth_session',
            'target_id' => (string) $credentials['session']['session_id'],
            'description' => 'Development mock Student server session issued.',
        ]);
        student_auth_credentials_response($credentials);
    } catch (Throwable $e) {
        error_log('Development Student session error [' . ($context['request_id'] ?? '?') . ']: ' . sanitize_for_log($e));
        safe_error_response('Development Student session is unavailable.', 503);
    }
}
