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

        // Check user_accounts first
        $stmt = $pdo->prepare("SELECT user_id, login_email AS email, display_name, role FROM user_accounts WHERE login_email = ?");
        $stmt->execute([$email]);
        $targetUser = $stmt->fetch(PDO::FETCH_ASSOC);

        // If not found in user_accounts, check students
        if ($targetUser === false) {
            $stuStmt = $pdo->prepare("SELECT user_id, bu_email AS email, CONCAT(first_name, ' ', last_name) AS display_name, 'student' AS role FROM students WHERE bu_email = ?");
            $stuStmt->execute([$email]);
            $targetUser = $stuStmt->fetch(PDO::FETCH_ASSOC);
        }

        $resetToken = bin2hex(random_bytes(16));
        $tokenHash = hash('sha256', $resetToken);

        $now = new DateTimeImmutable('now', new DateTimeZone('UTC'));
        $nowSql = $now->format('Y-m-d H:i:s.u');
        $expiresSql = $now->add(new DateInterval('PT15M'))->format('Y-m-d H:i:s.u');

        $resetLink = "http://localhost:5173/reset-password?token={$resetToken}";
        $userId = ($targetUser !== false && !empty($targetUser['user_id'])) ? (int) $targetUser['user_id'] : null;
        $displayName = ($targetUser !== false && !empty($targetUser['display_name'])) ? $targetUser['display_name'] : 'Faculty / User';
        $recipientEmail = $email;

        $pdo->beginTransaction();
        try {
            $macKey = config_key_bytes_at_least($config['audit']['mac_key_b64'], 32, 'AUDIT_MAC_KEY');
            $auditCtx = audit_begin_operation($pdo);

            $metaJson = json_encode(['email' => $recipientEmail, 'display_name' => $displayName]);
            $ins = $pdo->prepare(
                "INSERT INTO security_tokens (purpose, user_id, secret_hash, issued_at, expires_at, metadata_json)
                 VALUES ('password_reset', ?, ?, ?, ?, ?)"
            );
            $ins->execute([$userId, $tokenHash, $nowSql, $expiresSql, $metaJson]);
            $stId = (int) $pdo->lastInsertId();

            // Send email via PHPMailer
            $subject = "DentiSys Password Reset Instructions";
            $htmlBody = "
                <h2>DentiSys Account Password Reset</h2>
                <p>Dear <strong>" . htmlspecialchars($displayName) . "</strong>,</p>
                <p>We received a request to reset your DentiSys account password. Click the secure link below to reset your password. This link will expire in <strong>15 minutes</strong>:</p>
                <p><a href='" . htmlspecialchars($resetLink) . "' style='padding:12px 20px; background-color:#2563eb; color:#ffffff; text-decoration:none; border-radius:4px; font-weight:bold;'>Reset My Password</a></p>
                <p>Or copy and paste this URL into your browser:</p>
                <p><code>" . htmlspecialchars($resetLink) . "</code></p>
                <p>If you did not request a password reset, please ignore this message or notify system administrators.</p>
                <p><em>DentiSys Official Security Team</em></p>
            ";
            $textBody = "DentiSys Password Reset\n\nDear {$displayName},\n\nUse the link below to reset your password (expires in 15 minutes):\n{$resetLink}";

            $emailRes = send_system_email(
                $pdo,
                $recipientEmail,
                $displayName,
                $subject,
                $htmlBody,
                $textBody,
                'Password Reset',
                false
            );

            audit_finish_operation($pdo, $auditCtx, [
                'module_code' => 'auth',
                'action_code' => 'password_reset_requested',
                'event_status' => 'Success',
                'actor_user_id' => $userId,
                'actor_username' => $recipientEmail,
                'actor_role' => $targetUser !== false ? ($targetUser['role'] ?? 'user') : 'user',
                'actor_display_name' => $displayName,
                'session_id' => null,
                'target_type' => 'security_token',
                'target_id' => (string) $stId,
                'description' => "Password reset requested & email dispatched to {$recipientEmail}.",
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
            'token' => $resetToken,
            'reset_link' => $resetLink,
            'email_status' => $emailRes['message'] ?? 'Sent',
            'message' => 'If an account exists, a password reset email has been sent.',
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
            "SELECT token_id, user_id, issued_at, expires_at, used_at, revoked_at, metadata_json
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

        $meta = !empty($tokenRow['metadata_json']) ? json_decode($tokenRow['metadata_json'], true) : [];
        $email = $meta['email'] ?? '';
        $displayName = $meta['display_name'] ?? 'Faculty Member';
        $userId = !empty($tokenRow['user_id']) ? (int) $tokenRow['user_id'] : null;

        $passwordHash = password_hash($password, PASSWORD_DEFAULT);
        $nowSql = (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d H:i:s.u');

        $pdo->beginTransaction();
        try {
            $macKey = config_key_bytes_at_least($config['audit']['mac_key_b64'], 32, 'AUDIT_MAC_KEY');
            $auditCtx = audit_begin_operation($pdo);

            // 1. If user_id exists in user_accounts, update password
            if ($userId !== null && $userId > 0) {
                $upd = $pdo->prepare("UPDATE user_accounts SET password_hash = ?, token_version = token_version + 1 WHERE user_id = ?");
                $upd->execute([$passwordHash, $userId]);
            } elseif (!empty($email)) {
                // Check if user_accounts row exists by email
                $chkUser = $pdo->prepare("SELECT user_id, role, display_name FROM user_accounts WHERE login_email = ?");
                $chkUser->execute([$email]);
                $existingUser = $chkUser->fetch(PDO::FETCH_ASSOC);

                if ($existingUser !== false) {
                    $userId = (int) $existingUser['user_id'];
                    $displayName = $existingUser['display_name'];
                    $upd = $pdo->prepare("UPDATE user_accounts SET password_hash = ?, token_version = token_version + 1 WHERE user_id = ?");
                    $upd->execute([$passwordHash, $userId]);
                } else {
                    // Create new user_account row if missing
                    $insUser = $pdo->prepare(
                        "INSERT INTO user_accounts (login_email, password_hash, role, display_name, status, created_at, approved_at)
                         VALUES (?, ?, 'faculty', ?, 'Active', NOW(6), NOW(6))"
                    );
                    $insUser->execute([$email, $passwordHash, $displayName]);
                    $userId = (int) $pdo->lastInsertId();

                    // If student row exists with this email, link user_id
                    $updStu = $pdo->prepare("UPDATE students SET user_id = ? WHERE bu_email = ? AND user_id IS NULL");
                    $updStu->execute([$userId, $email]);
                }
            }

            // 2. Mark token as used
            $markUsed = $pdo->prepare("UPDATE security_tokens SET used_at = ? WHERE token_id = ?");
            $markUsed->execute([$nowSql, $tokenRow['token_id']]);

            audit_finish_operation($pdo, $auditCtx, [
                'module_code' => 'auth',
                'action_code' => 'password_reset_completed',
                'event_status' => 'Success',
                'actor_user_id' => $userId,
                'actor_username' => $email ?: 'user',
                'actor_role' => 'faculty',
                'actor_display_name' => $displayName,
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
