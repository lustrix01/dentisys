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
        $studentName = validate_required_string($data, 'student_name', 2, 255);
        $studentNumber = validate_optional_string($data, 'student_number', 1, 50) ?? 'STU-' . time();
        $className = validate_required_string($data, 'class_name', 2, 255);
        $email = validate_institutional_email($data['email'] ?? '');

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
                "INSERT INTO security_tokens (purpose, user_id, secret_hash, issued_at, expires_at, metadata_json)
                 VALUES ('secretary_invitation', ?, ?, ?, ?, ?)"
            );
            $ins->execute([$authCtx['user_id'], $tokenHash, $nowSql, $expiresSql, $metadata]);
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

        json_response([
            'status' => 'ok',
            'token' => $invToken,
            'invitation_link' => "http://localhost:5173/activate-secretary?token={$invToken}",
            'message' => 'Class Secretary invitation issued successfully.',
        ], 201);
    } catch (ValidationException $e) {
        validation_error_response($e->getErrors());
    } catch (AuthException | ChallengeException $e) {
        auth_error_response('Authentication required.', 401);
    } catch (\Throwable $e) {
        error_log('Secretary invite error [' . ($context['request_id'] ?? '?') . ']: ' . sanitize_for_log($e));
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
            "SELECT token_id, user_id, secret_hash, issued_at, expires_at, used_at, revoked_at, metadata_json
             FROM security_tokens
             WHERE purpose = 'secretary_invitation' AND secret_hash = ?"
        );
        $stmt->execute([$tokenHash]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($row === false || $row['revoked_at'] !== null || $row['used_at'] !== null) {
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

            // Create or update user_account
            $chk = $pdo->prepare("SELECT user_id FROM user_accounts WHERE login_email = ?");
            $chk->execute([$email]);
            $existingUser = $chk->fetch(PDO::FETCH_ASSOC);

            if ($existingUser !== false) {
                $userId = (int) $existingUser['user_id'];
                $upd = $pdo->prepare("UPDATE user_accounts SET password_hash = ?, role = 'secretary', status = 'Active' WHERE user_id = ?");
                $upd->execute([$passwordHash, $userId]);
            } else {
                $ins = $pdo->prepare(
                    "INSERT INTO user_accounts (login_email, password_hash, role, display_name, title, status, created_at)
                     VALUES (?, ?, 'secretary', ?, 'Class Secretary', 'Active', ?)"
                );
                $ins->execute([$email, $passwordHash, $displayName, $nowSql]);
                $userId = (int) $pdo->lastInsertId();
            }

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
    } catch (InvalidCredentialsException $e) {
        validation_error_response([['field' => 'password', 'message' => $e->getMessage()]]);
    } catch (\Throwable $e) {
        error_log('Secretary activate error [' . ($context['request_id'] ?? '?') . ']: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}
