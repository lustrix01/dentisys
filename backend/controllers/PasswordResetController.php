<?php

declare(strict_types=1);

if (!function_exists('sanitize_for_log')) {
    function sanitize_for_log(\Throwable $e): string
    {
        return get_class($e) . ' [' . ($e->getCode() > 0 ? $e->getCode() : 0) . ']';
    }
}

function handle_password_reset_request(): void
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

        $email = validate_email($body['data']['email'] ?? '');

        $stmt = $pdo->prepare("SELECT user_id, login_email, display_name, role FROM user_accounts WHERE login_email = ?");
        $stmt->execute([$email]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        $resetToken = bin2hex(random_bytes(16));
        $tokenHash = hash('sha256', $resetToken);

        if ($user !== false) {
            $now = new DateTimeImmutable('now', new DateTimeZone('UTC'));
            $nowSql = $now->format('Y-m-d H:i:s.u');
            $expiresSql = $now->add(new DateInterval('PT1H'))->format('Y-m-d H:i:s.u');

            $pdo->beginTransaction();
            try {
                $macKey = config_key_bytes_at_least($config['audit']['mac_key_b64'], 32, 'AUDIT_MAC_KEY');
                $auditCtx = audit_begin_operation($pdo);

                $ins = $pdo->prepare(
                    "INSERT INTO security_tokens (purpose, user_id, secret_hash, issued_at, expires_at)
                     VALUES ('password_reset', ?, ?, ?, ?)"
                );
                $ins->execute([$user['user_id'], $tokenHash, $nowSql, $expiresSql]);
                $stId = (int) $pdo->lastInsertId();

                audit_finish_operation($pdo, $auditCtx, [
                    'module_code' => 'auth',
                    'action_code' => 'password_reset_requested',
                    'event_status' => 'Success',
                    'actor_user_id' => $user['user_id'],
                    'actor_username' => $email,
                    'actor_role' => $user['role'],
                    'actor_display_name' => $user['display_name'],
                    'session_id' => null,
                    'target_type' => 'security_token',
                    'target_id' => (string) $stId,
                    'description' => 'Password reset requested.',
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
        }

        json_response([
            'status' => 'ok',
            'token' => $user !== false ? $resetToken : null,
            'reset_link' => $user !== false ? "http://localhost:5173/reset-password?token={$resetToken}" : null,
            'message' => 'If an account exists with that email address, password reset instructions have been issued.',
        ], 200);
    } catch (ValidationException $e) {
        validation_error_response($e->getErrors());
    } catch (\Throwable $e) {
        error_log('Password reset request error [' . ($context['request_id'] ?? '?') . ']: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

function handle_password_reset_confirm(): void
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
            safe_error_response('Invalid or missing password reset token.', 400);
            return;
        }

        $password = extract_password($data, 'password');
        validate_password_policy($password);

        $tokenHash = hash('sha256', $token);
        $stmt = $pdo->prepare(
            "SELECT token_id, user_id, issued_at, expires_at, used_at, revoked_at
             FROM security_tokens
             WHERE purpose = 'password_reset' AND secret_hash = ?"
        );
        $stmt->execute([$tokenHash]);
        $tokenRow = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($tokenRow === false || $tokenRow['revoked_at'] !== null || $tokenRow['used_at'] !== null) {
            safe_error_response('Invalid or expired password reset token.', 400);
            return;
        }

        $expiresAt = new DateTimeImmutable($tokenRow['expires_at'], new DateTimeZone('UTC'));
        if ($expiresAt <= new DateTimeImmutable('now', new DateTimeZone('UTC'))) {
            safe_error_response('Password reset token has expired.', 400);
            return;
        }

        $userId = (int) $tokenRow['user_id'];
        $userStmt = $pdo->prepare("SELECT user_id, login_email, display_name, role FROM user_accounts WHERE user_id = ?");
        $userStmt->execute([$userId]);
        $user = $userStmt->fetch(PDO::FETCH_ASSOC);

        if ($user === false) {
            safe_error_response('User account not found.', 404);
            return;
        }

        $passwordHash = password_hash($password, PASSWORD_DEFAULT);
        $nowSql = (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d H:i:s.u');

        $pdo->beginTransaction();
        try {
            $macKey = config_key_bytes_at_least($config['audit']['mac_key_b64'], 32, 'AUDIT_MAC_KEY');
            $auditCtx = audit_begin_operation($pdo);

            // Update password and increment token_version to invalidate existing sessions
            $upd = $pdo->prepare("UPDATE user_accounts SET password_hash = ?, token_version = token_version + 1 WHERE user_id = ?");
            $upd->execute([$passwordHash, $userId]);

            // Mark token as used
            $markUsed = $pdo->prepare("UPDATE security_tokens SET used_at = ? WHERE token_id = ?");
            $markUsed->execute([$nowSql, $tokenRow['token_id']]);

            audit_finish_operation($pdo, $auditCtx, [
                'module_code' => 'auth',
                'action_code' => 'password_reset_completed',
                'event_status' => 'Success',
                'actor_user_id' => $userId,
                'actor_username' => $user['login_email'],
                'actor_role' => $user['role'],
                'actor_display_name' => $user['display_name'],
                'session_id' => null,
                'target_type' => 'user_account',
                'target_id' => (string) $userId,
                'description' => 'Password reset completed.',
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
            'message' => 'Password reset successfully. You may now sign in with your new password.',
        ], 200);
    } catch (ValidationException $e) {
        validation_error_response($e->getErrors());
    } catch (InvalidCredentialsException $e) {
        validation_error_response([['field' => 'password', 'message' => $e->getMessage()]]);
    } catch (\Throwable $e) {
        error_log('Password reset confirm error [' . ($context['request_id'] ?? '?') . ']: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}
