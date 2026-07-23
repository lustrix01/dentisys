<?php

declare(strict_types=1);

require_once __DIR__ . '/mailer.php';

function mfa_runtime_enroll_start(PDO $pdo, array $config, array $tokenClaims, array $context): array
{
    $userId = (int) $tokenClaims['sub'];
    $jti = $tokenClaims['jti'];
    $tokenVersion = $tokenClaims['token_version'];
    $macKey = config_key_bytes_at_least($config['audit']['mac_key_b64'], 32, 'AUDIT_MAC_KEY');
    $mfaKey = config_key_bytes_exact($config['mfa']['encryption_key_b64'], 32, 'MFA_ENCRYPTION_KEY');
    $jwtKey = config_key_bytes_at_least($config['jwt']['signing_key_b64'], 32, 'JWT_SIGNING_KEY');

    $rateStorage = ['dir' => $config['rate_limit']['storage_dir']];
    $userScope = bin2hex(hash('sha256', 'user:' . $userId, true));
    rate_limit_check($rateStorage, $userScope, 'post_mfa_enroll_start', 300, 10);

    challenge_state_attempt($rateStorage, $jti, 'mfa_enrollment', 'enrollment_start');

    $pdo->beginTransaction();
    try {
        $auditCtx = audit_begin_operation($pdo);

        $locked = auth_lock_user_for_session($pdo, $userId);

        if ($locked['status'] !== 'Active') {
            throw new InactiveAccountException($locked['status']);
        }

        if ((int) $locked['token_version'] !== $tokenVersion) {
            throw new ChallengeException('Token version mismatch.');
        }

        $stmt = $pdo->prepare(
            "SELECT mfa_status FROM security_tokens
             WHERE user_id = ? AND purpose = 'mfa_credential'
             FOR UPDATE"
        );
        $stmt->execute([$userId]);
        $allRows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $enabledCount = 0;
        foreach ($allRows as $row) {
            if ($row['mfa_status'] === 'enabled') { $enabledCount++; }
        }

        if ($enabledCount >= 1) {
            throw new MfaException('MFA is already enabled for this account.');
        }

        $stmt = $pdo->prepare(
            "UPDATE security_tokens SET mfa_status = 'revoked', revoked_at = NOW(6), revocation_reason = 'Replaced by new enrollment'
             WHERE user_id = ? AND purpose = 'mfa_credential' AND mfa_status = 'pending'"
        );
        $stmt->execute([$userId]);

        challenge_state_consume($rateStorage, $jti, 'mfa_enrollment', 'enrollment_start');

        $secret = mfa_generate_secret();
        $enc = mfa_encrypt_secret($secret, $mfaKey);

        $confirmJti = jwt_generate_jti();
        $confirmToken = jwt_encode([
            'sub' => $userId,
            'jti' => $confirmJti,
            'token_type' => 'mfa_enrollment',
            'token_version' => (int) $locked['token_version'],
            'enrollment_stage' => 'confirm',
            'iat' => time(),
            'exp' => time() + 300,
        ], $jwtKey);

        challenge_state_init($rateStorage, $confirmJti, 'mfa_enrollment', 'enrollment_confirm', 5, 300);

        $metadata = json_encode(['confirm_jti' => $confirmJti]);

        $nowSql = (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d H:i:s.u');
        $expiresSql = (new DateTimeImmutable('now +600 seconds', new DateTimeZone('UTC')))->format('Y-m-d H:i:s.u');
        $issuedSql = $nowSql;

        $stmt = $pdo->prepare(
            "INSERT INTO security_tokens
             (purpose, user_id, issued_at, expires_at, ciphertext, nonce, auth_tag,
              enc_key_version, enc_algorithm, totp_algorithm, digit_count, period_seconds,
              mfa_status, metadata_json)
             VALUES ('mfa_credential', ?, ?, ?, ?, ?, ?, 1, 'AES-256-GCM', 'sha1', 6, 30, 'pending', ?)"
        );
        $stmt->execute([
            $userId, $issuedSql, $expiresSql,
            $enc['ciphertext'], $enc['nonce'], $enc['auth_tag'],
            $metadata,
        ]);
        $credentialId = (int) $pdo->lastInsertId();

        audit_finish_operation($pdo, $auditCtx, [
            'module_code' => 'mfa',
            'action_code' => 'mfa_enrollment_started',
            'event_status' => 'Success',
            'actor_user_id' => $userId,
            'actor_username' => $locked['login_email'],
            'actor_role' => $locked['role'],
            'actor_display_name' => $locked['display_name'],
            'session_id' => null,
            'target_type' => 'security_token',
            'target_id' => (string) $credentialId,
            'description' => 'MFA enrollment initiated.',
            'reason' => null,
            'http_method' => 'POST',
            'endpoint' => '/api/auth/mfa/enroll/start',
            'request_id' => $context['request_id'],
            'ip_address' => $context['ip_address'],
            'user_agent' => $context['user_agent'],
        ], $macKey);

        $pdo->commit();
    } catch (\Throwable $e) {
        if ($pdo->inTransaction()) { $pdo->rollBack(); }
        throw $e;
    }

    $currentStep = intdiv(time(), 30);
    $totpResult = mfa_compute_totp($secret, $currentStep);
    $otpCode = $totpResult['code'];

    $userEmail = $locked['login_email'];
    $safeEmail = htmlspecialchars((string) $userEmail);
    $safeCode = htmlspecialchars((string) $otpCode);
    $subject = 'DentiSys MFA Verification Code';
    $body = "<p>Hello,</p>" .
            "<p>Your DentiSys multi-factor authentication (MFA) verification code is: <strong>{$safeCode}</strong></p>" .
            "<p>This code will expire in 30 seconds. If you did not initiate this request, please contact your administrator immediately.</p>";

    try {
        send_email($userEmail, $subject, $body, $config);
    } catch (\Throwable $e) {
        error_log('MFA email notification failed non-fatally: ' . sanitize_for_log($e));
    }

    $showDevCode = !empty($config['show_dev_mfa_code']);

    return [
        'confirmation_token' => $confirmToken,
        'provisioning_uri' => 'otpauth://totp/DentiSys:' . urlencode($locked['login_email']) . '?secret=' . $secret . '&issuer=DentiSys',
        'base32_secret' => $secret,
        'dev_mfa_code' => $showDevCode ? $otpCode : null,
    ];
}

function mfa_runtime_enroll_confirm(PDO $pdo, array $config, array $tokenClaims, string $code, array $context): array
{
    $userId = (int) $tokenClaims['sub'];
    $jti = $tokenClaims['jti'];
    $tokenVersion = $tokenClaims['token_version'];
    $macKey = config_key_bytes_at_least($config['audit']['mac_key_b64'], 32, 'AUDIT_MAC_KEY');
    $mfaKey = config_key_bytes_exact($config['mfa']['encryption_key_b64'], 32, 'MFA_ENCRYPTION_KEY');
    $jwtKey = config_key_bytes_at_least($config['jwt']['signing_key_b64'], 32, 'JWT_SIGNING_KEY');

    $rateStorage = ['dir' => $config['rate_limit']['storage_dir']];
    $userScope = bin2hex(hash('sha256', 'user:' . $userId, true));
    rate_limit_check($rateStorage, $userScope, 'post_mfa_enroll_confirm', 300, 10);

    challenge_state_attempt($rateStorage, $jti, 'mfa_enrollment', 'enrollment_confirm');

    $pdo->beginTransaction();
    try {
        $auditCtx = audit_begin_operation($pdo);

        $locked = auth_lock_user_for_session($pdo, $userId);

        if ($locked['status'] !== 'Active') {
            throw new InactiveAccountException($locked['status']);
        }

        if ((int) $locked['token_version'] !== $tokenVersion) {
            throw new ChallengeException('Token version mismatch.');
        }

        $stmt = $pdo->prepare(
            "SELECT * FROM security_tokens
             WHERE user_id = ? AND purpose = 'mfa_credential' AND mfa_status = 'pending'
               AND JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.confirm_jti')) = ?
             FOR UPDATE"
        );
        $stmt->execute([$userId, $jti]);
        $pendingRows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        if (count($pendingRows) !== 1) {
            throw new ChallengeException('Invalid enrollment session.');
        }

        $pending = $pendingRows[0];

        if ($pending['metadata_json'] === null) {
            throw new ChallengeException('Invalid enrollment session.');
        }

        $decoded = json_decode($pending['metadata_json'], true);
        if (!is_array($decoded) || !isset($decoded['confirm_jti']) || $decoded['confirm_jti'] !== $jti) {
            throw new ChallengeException('Invalid enrollment session.');
        }

        $expiresAt = new DateTimeImmutable($pending['expires_at'], new DateTimeZone('UTC'));
        if ($expiresAt <= new DateTimeImmutable('now', new DateTimeZone('UTC'))) {
            throw new ChallengeException('Enrollment session has expired.');
        }

        if ($pending['ciphertext'] === null || $pending['nonce'] === null || $pending['auth_tag'] === null) {
            throw new MfaException('Corrupt MFA credential.');
        }

        $secret = mfa_decrypt_secret($pending['ciphertext'], $pending['nonce'], $pending['auth_tag'], $mfaKey);

        if ($secret === null) {
            throw new MfaException('Failed to decrypt MFA secret.');
        }

        $result = mfa_verify_window(
            $secret,
            $code,
            $pending['totp_algorithm'] ?? 'sha1',
            (int) ($pending['digit_count'] ?? 6),
            (int) ($pending['period_seconds'] ?? 30),
            1
        );

        if (!$result['valid']) {
            throw new MfaException('Invalid verification code.');
        }

        $matchedStep = $result['matched_step'];

        challenge_state_consume($rateStorage, $jti, 'mfa_enrollment', 'enrollment_confirm');

        $stmt = $pdo->prepare(
            "UPDATE security_tokens
             SET mfa_status = 'enabled', mfa_verified_at = NOW(6), last_accepted_step = ?
             WHERE token_id = ?"
        );
        $stmt->execute([$matchedStep, $pending['token_id']]);

        $recovery = mfa_generate_recovery_codes(8);
        $nowSql = (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d H:i:s.u');

        $recStmt = $pdo->prepare(
            "INSERT INTO security_tokens (purpose, user_id, secret_hash, issued_at)
             VALUES ('mfa_recovery', ?, ?, ?)"
        );
        foreach ($recovery['hashes'] as $hash) {
            $recStmt->execute([$userId, $hash, $nowSql]);
        }

        $credentials = auth_issue_credentials($pdo, $locked, $config, $context);

        audit_finish_operation($pdo, $auditCtx, [
            'module_code' => 'mfa',
            'action_code' => 'mfa_enrollment_completed',
            'event_status' => 'Success',
            'actor_user_id' => $userId,
            'actor_username' => $locked['login_email'],
            'actor_role' => $locked['role'],
            'actor_display_name' => $locked['display_name'],
            'session_id' => $credentials['session']['session_id'],
            'target_type' => 'security_token',
            'target_id' => (string) $pending['token_id'],
            'description' => 'MFA enrollment completed.',
            'reason' => null,
            'http_method' => 'POST',
            'endpoint' => '/api/auth/mfa/enroll/confirm',
            'request_id' => $context['request_id'],
            'ip_address' => $context['ip_address'],
            'user_agent' => $context['user_agent'],
        ], $macKey);

        $pdo->commit();
    } catch (\Throwable $e) {
        if ($pdo->inTransaction()) { $pdo->rollBack(); }
        throw $e;
    }

    return [
        'credentials' => $credentials,
        'recovery_codes' => $recovery['codes'],
    ];
}

function mfa_runtime_verify(PDO $pdo, array $config, array $tokenClaims, string $code, array $context): array
{
    $userId = (int) $tokenClaims['sub'];
    $jti = $tokenClaims['jti'];
    $tokenVersion = $tokenClaims['token_version'];
    $macKey = config_key_bytes_at_least($config['audit']['mac_key_b64'], 32, 'AUDIT_MAC_KEY');
    $mfaKey = config_key_bytes_exact($config['mfa']['encryption_key_b64'], 32, 'MFA_ENCRYPTION_KEY');

    $rateStorage = ['dir' => $config['rate_limit']['storage_dir']];
    $userScope = bin2hex(hash('sha256', 'user:' . $userId, true));
    rate_limit_check($rateStorage, $userScope, 'post_mfa_verify', 300, 10);

    challenge_state_attempt($rateStorage, $jti, 'mfa_challenge', 'complete_login');

    $pdo->beginTransaction();
    try {
        $auditCtx = audit_begin_operation($pdo);

        $locked = auth_lock_user_for_session($pdo, $userId);

        if ($locked['status'] !== 'Active') {
            throw new InactiveAccountException($locked['status']);
        }

        if ((int) $locked['token_version'] !== $tokenVersion) {
            throw new ChallengeException('Token version mismatch.');
        }

        $stmt = $pdo->prepare(
            "SELECT * FROM security_tokens
             WHERE user_id = ? AND purpose = 'mfa_credential' AND mfa_status = 'enabled'
             FOR UPDATE"
        );
        $stmt->execute([$userId]);
        $enabledRows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        if (count($enabledRows) !== 1) {
            throw new MfaException(count($enabledRows) === 0
                ? 'No MFA credential found.'
                : 'Multiple MFA credentials found.');
        }

        $cred = $enabledRows[0];

        $secret = mfa_decrypt_secret($cred['ciphertext'], $cred['nonce'], $cred['auth_tag'], $mfaKey);

        if ($secret === null) {
            throw new MfaException('Failed to decrypt MFA secret.');
        }

        $result = mfa_verify_window(
            $secret,
            $code,
            $cred['totp_algorithm'] ?? 'sha1',
            (int) ($cred['digit_count'] ?? 6),
            (int) ($cred['period_seconds'] ?? 30),
            1
        );

        if (!$result['valid']) {
            throw new MfaException('Invalid verification code.');
        }

        $matchedStep = $result['matched_step'];

        challenge_state_consume($rateStorage, $jti, 'mfa_challenge', 'complete_login');

        $stmt = $pdo->prepare(
            "UPDATE security_tokens
             SET last_accepted_step = ?
             WHERE token_id = ?
               AND (last_accepted_step IS NULL OR ? > last_accepted_step)"
        );
        $stmt->execute([$matchedStep, $cred['token_id'], $matchedStep]);

        if ($stmt->rowCount() === 0) {
            throw new MfaException('Verification code already used.');
        }

        $credentials = auth_issue_credentials($pdo, $locked, $config, $context);

        audit_finish_operation($pdo, $auditCtx, [
            'module_code' => 'mfa',
            'action_code' => 'mfa_verification_success',
            'event_status' => 'Success',
            'actor_user_id' => $userId,
            'actor_username' => $locked['login_email'],
            'actor_role' => $locked['role'],
            'actor_display_name' => $locked['display_name'],
            'session_id' => $credentials['session']['session_id'],
            'target_type' => 'security_token',
            'target_id' => (string) $cred['token_id'],
            'description' => 'MFA TOTP verification successful.',
            'reason' => null,
            'http_method' => 'POST',
            'endpoint' => '/api/auth/mfa/verify',
            'request_id' => $context['request_id'],
            'ip_address' => $context['ip_address'],
            'user_agent' => $context['user_agent'],
        ], $macKey);

        $pdo->commit();
    } catch (\Throwable $e) {
        if ($pdo->inTransaction()) { $pdo->rollBack(); }
        throw $e;
    }

    return ['credentials' => $credentials];
}

function mfa_runtime_recover(PDO $pdo, array $config, array $tokenClaims, string $code, array $context): array
{
    $userId = (int) $tokenClaims['sub'];
    $jti = $tokenClaims['jti'];
    $tokenVersion = $tokenClaims['token_version'];
    $macKey = config_key_bytes_at_least($config['audit']['mac_key_b64'], 32, 'AUDIT_MAC_KEY');

    $rateStorage = ['dir' => $config['rate_limit']['storage_dir']];
    $userScope = bin2hex(hash('sha256', 'user:' . $userId, true));
    rate_limit_check($rateStorage, $userScope, 'post_mfa_recover', 900, 5);

    challenge_state_attempt($rateStorage, $jti, 'mfa_challenge', 'complete_login');

    $canonical = mfa_normalize_recovery_code($code);

    $pdo->beginTransaction();
    try {
        $auditCtx = audit_begin_operation($pdo);

        $locked = auth_lock_user_for_session($pdo, $userId);

        if ($locked['status'] !== 'Active') {
            throw new InactiveAccountException($locked['status']);
        }

        if ((int) $locked['token_version'] !== $tokenVersion) {
            throw new ChallengeException('Token version mismatch.');
        }

        $stmt = $pdo->prepare(
            "SELECT * FROM security_tokens
             WHERE user_id = ? AND purpose = 'mfa_recovery' AND used_at IS NULL
             FOR UPDATE"
        );
        $stmt->execute([$userId]);
        $recoveryRows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $matchedRow = null;

        foreach ($recoveryRows as $row) {
            if (password_verify($canonical, $row['secret_hash'])) {
                $matchedRow = $row;
            }
        }

        if ($matchedRow === null) {
            throw new MfaException('Invalid recovery code.');
        }

        $matchCount = 0;
        foreach ($recoveryRows as $row) {
            if (password_verify($canonical, $row['secret_hash'])) {
                $matchCount++;
            }
        }

        if ($matchCount !== 1) {
            throw new MfaException('Invalid recovery code.');
        }

        challenge_state_consume($rateStorage, $jti, 'mfa_challenge', 'complete_login');

        $stmt = $pdo->prepare(
            "UPDATE security_tokens SET used_at = NOW(6) WHERE token_id = ?"
        );
        $stmt->execute([$matchedRow['token_id']]);

        $credentials = auth_issue_credentials($pdo, $locked, $config, $context);

        audit_finish_operation($pdo, $auditCtx, [
            'module_code' => 'mfa',
            'action_code' => 'mfa_recovery_success',
            'event_status' => 'Success',
            'actor_user_id' => $userId,
            'actor_username' => $locked['login_email'],
            'actor_role' => $locked['role'],
            'actor_display_name' => $locked['display_name'],
            'session_id' => $credentials['session']['session_id'],
            'target_type' => 'security_token',
            'target_id' => (string) $matchedRow['token_id'],
            'description' => 'MFA recovery verification successful.',
            'reason' => null,
            'http_method' => 'POST',
            'endpoint' => '/api/auth/mfa/recover',
            'request_id' => $context['request_id'],
            'ip_address' => $context['ip_address'],
            'user_agent' => $context['user_agent'],
        ], $macKey);

        $pdo->commit();
    } catch (\Throwable $e) {
        if ($pdo->inTransaction()) { $pdo->rollBack(); }
        throw $e;
    }

    return ['credentials' => $credentials];
}
