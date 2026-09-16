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

function handle_student_signup(): void
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
            student_auth_error_response('Request body required.', 400);
            return;
        }
        $data = $body['data'];
        if (array_diff(array_keys($data), ['email']) !== [] || !array_key_exists('email', $data)) {
            student_auth_error_response('Invalid request.', 400);
            return;
        }
        $email = validate_institutional_email((string) $data['email']);

        $rateStorage = ['dir' => $config['rate_limit']['storage_dir']];
        $ipScope = bin2hex(hash('sha256', 'ip:' . $context['ip_address'], true));
        $emailScope = bin2hex(hash('sha256', 'student-signup:' . $email, true));
        rate_limit_check($rateStorage, $ipScope, 'post_student_signup', 60, 20);
        rate_limit_check($rateStorage, $emailScope, 'post_student_signup_email', 3600, 5);

        $pdo = create_pdo($config);
        student_auth_audit($pdo, $config, $context, 'student_signup_requested', 'Success', [
            'target_type' => 'student_signup_request',
            'target_id' => student_auth_email_fingerprint($email),
            'description' => 'Student signup request received for an institutional email.',
            'reason' => 'request_received',
        ]);
        $pdo->beginTransaction();
        $rawToken = null;
        $student = null;
        $accountId = null;
        try {
            $studentStmt = $pdo->prepare(
                "SELECT student_id, student_number, first_name, last_name, bu_email, status,
                        student_account_user_id, user_id
                   FROM students
                  WHERE lower(bu_email) = lower(?)
                  FOR UPDATE"
            );
            $studentStmt->execute([$email]);
            $students = $studentStmt->fetchAll(PDO::FETCH_ASSOC);

            if (count($students) === 1) {
                $student = $students[0];
                $hasEnrollment = student_auth_active_enrollment($pdo, (int) $student['student_id'], true);
                $eligible = strtolower((string) $student['status']) === 'active'
                    && $student['bu_email'] !== null
                    && $hasEnrollment;

                // Account is locked only after Student and enrollment rows.
                $account = null;
                if ($eligible && $student['student_account_user_id'] !== null) {
                    $accountStmt = $pdo->prepare(
                        "SELECT user_id, login_email, role, status, display_name
                           FROM user_accounts
                          WHERE user_id = ?
                          FOR UPDATE"
                    );
                    $accountStmt->execute([(int) $student['student_account_user_id']]);
                    $account = $accountStmt->fetch(PDO::FETCH_ASSOC) ?: null;
                }

                if ($eligible && $student['student_account_user_id'] === null && $student['user_id'] === null) {
                    $accountByEmail = $pdo->prepare(
                        "SELECT user_id, login_email, role, status, display_name
                           FROM user_accounts
                          WHERE lower(login_email) = lower(?)
                          FOR UPDATE"
                    );
                    $accountByEmail->execute([$email]);
                    $account = $accountByEmail->fetch(PDO::FETCH_ASSOC) ?: null;
                    $eligible = $account === null;
                }

                $canIssue = $eligible
                    && $student['student_account_user_id'] === null
                    && $student['user_id'] === null
                    && $account === null;
                $canResend = $eligible
                    && $account !== null
                    && (int) $student['student_account_user_id'] === (int) $account['user_id']
                    && $student['user_id'] === null
                    && $account['role'] === 'student'
                    && $account['status'] === 'Pending Activation'
                    && strtolower(trim((string) $account['login_email'])) === strtolower(trim($email));

                if ($canIssue) {
                    $placeholder = base64url_encode(random_bytes(32));
                    $passwordHash = password_hash($placeholder, PASSWORD_DEFAULT);
                    $displayName = trim((string) $student['first_name'] . ' ' . (string) $student['last_name']);
                    $insert = $pdo->prepare(
                        "INSERT INTO user_accounts
                            (login_email, password_hash, role, display_name, status, created_at)
                         VALUES (?, ?, 'student', ?, 'Pending Activation', CURRENT_TIMESTAMP(6))
                         RETURNING user_id"
                    );
                    $insert->execute([$email, $passwordHash, $displayName]);
                    $accountId = (int) $insert->fetchColumn();
                    $link = $pdo->prepare(
                        "UPDATE students SET student_account_user_id = ? WHERE student_id = ? AND student_account_user_id IS NULL"
                    );
                    $link->execute([$accountId, $student['student_id']]);
                    if ($link->rowCount() !== 1) {
                        throw new DomainException('Student link changed during activation request.');
                    }
                    $rawToken = student_auth_activation_raw_token();
                    $digest = hash('sha256', $rawToken, true);
                    $expires = (new DateTimeImmutable('now', new DateTimeZone('UTC')))
                        ->add(new DateInterval('P1D'))
                        ->format('Y-m-d H:i:s.u');
                    $tokenStmt = $pdo->prepare(
                        "INSERT INTO security_tokens
                            (purpose, user_id, related_student_id, token_digest, issued_at, expires_at)
                         VALUES ('student_activation', ?, ?, ?, CURRENT_TIMESTAMP(6), ?)"
                    );
                    $tokenStmt->bindValue(1, $accountId, PDO::PARAM_INT);
                    $tokenStmt->bindValue(2, (int) $student['student_id'], PDO::PARAM_INT);
                    pdo_bind_binary($tokenStmt, 3, $digest);
                    $tokenStmt->bindValue(4, $expires, PDO::PARAM_STR);
                    $tokenStmt->execute();
                } elseif ($canResend) {
                    $accountId = (int) $account['user_id'];
                    $revoke = $pdo->prepare(
                        "UPDATE security_tokens
                            SET revoked_at = CURRENT_TIMESTAMP(6), revocation_reason = 'Replaced by Student activation resend'
                          WHERE purpose = 'student_activation'
                            AND user_id = ?
                            AND used_at IS NULL
                            AND revoked_at IS NULL"
                    );
                    $revoke->execute([$accountId]);

                    $rawToken = student_auth_activation_raw_token();
                    $digest = hash('sha256', $rawToken, true);
                    $expires = (new DateTimeImmutable('now', new DateTimeZone('UTC')))
                        ->add(new DateInterval('P1D'))
                        ->format('Y-m-d H:i:s.u');
                    $tokenStmt = $pdo->prepare(
                        "INSERT INTO security_tokens
                            (purpose, user_id, related_student_id, token_digest, issued_at, expires_at)
                         VALUES ('student_activation', ?, ?, ?, CURRENT_TIMESTAMP(6), ?)"
                    );
                    $tokenStmt->bindValue(1, $accountId, PDO::PARAM_INT);
                    $tokenStmt->bindValue(2, (int) $student['student_id'], PDO::PARAM_INT);
                    pdo_bind_binary($tokenStmt, 3, $digest);
                    $tokenStmt->bindValue(4, $expires, PDO::PARAM_STR);
                    $tokenStmt->execute();
                }
            }
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) { $pdo->rollBack(); }
            throw $e;
        }

        if ($rawToken !== null && $student !== null) {
            $link = app_url($config, '/activate-student', ['token' => $rawToken]);
            send_email(
                $email,
                'DentiSys Student Account Activation',
                student_auth_activation_email($student, $link),
                $config,
                true
            );
            student_auth_audit($pdo, $config, $context, 'student_activation_issued', 'Success', [
                'actor_user_id' => null,
                'target_type' => 'user_account',
                'target_id' => (string) $accountId,
                'description' => 'Student activation instructions issued.',
            ]);
        }

        student_auth_success_response([
            'status' => 'ok',
            'message' => 'If an eligible Student record matches that email, activation instructions will be sent.',
        ], 202);
    } catch (ValidationException $e) {
        student_auth_validation_response($e->getErrors());
    } catch (RateLimitException $e) {
        student_auth_error_response('Too many requests.', 429);
    } catch (Throwable $e) {
        error_log('Student signup error [' . ($context['request_id'] ?? '?') . ']: ' . sanitize_for_log($e));
        student_auth_error_response('Internal server error.', 500);
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
        if (array_diff(array_keys($data), ['token', 'password']) !== []
            || !array_key_exists('token', $data)
            || !array_key_exists('password', $data)) {
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
        if ($contextRow === null) {
            student_auth_error_response('Invalid or expired activation token.', 400);
            return;
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
                ? student_auth_active_enrollment($pdo, (int) $student['student_id'], true)
                : false;

            $accountStmt = $pdo->prepare(
                "SELECT user_id, login_email, role, display_name, status
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

            $valid = $student !== false
                && $account !== false
                && $lockedToken !== false
                && (int) $lockedToken['user_id'] === (int) $account['user_id']
                && (int) $lockedToken['related_student_id'] === (int) $student['student_id']
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
                && $hasEnrollment;

            if (!$valid) {
                $pdo->rollBack();
                student_auth_error_response('Invalid or expired activation token.', 400);
                return;
            }

            $nowSql = (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d H:i:s.u');
            $update = $pdo->prepare(
                "UPDATE user_accounts SET password_hash = ?, status = 'Active', updated_at = ? WHERE user_id = ?"
            );
            $update->execute([$passwordHash, $nowSql, $account['user_id']]);
            $used = $pdo->prepare(
                "UPDATE security_tokens SET used_at = ? WHERE token_id = ? AND used_at IS NULL"
            );
            $used->execute([$nowSql, $lockedToken['token_id']]);
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
