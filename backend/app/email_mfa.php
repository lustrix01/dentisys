<?php

declare(strict_types=1);

function email_mfa_mask_address(string $email): string
{
    [$local, $domain] = array_pad(explode('@', $email, 2), 2, '');
    $visible = mb_substr($local, 0, min(2, mb_strlen($local)));
    return $visible . str_repeat('*', max(3, mb_strlen($local) - mb_strlen($visible))) . '@' . $domain;
}

function email_mfa_digest(string $jti): string
{
    return hash('sha256', $jti, true);
}

function email_mfa_code_hash(array $config, string $jti, string $code): string
{
    $key = config_key_bytes_at_least(
        (string) $config['mfa']['email_otp_hmac_key_b64'],
        32,
        'EMAIL_OTP_HMAC_KEY_B64'
    );
    return hash_hmac('sha256', $jti . ':' . $code, $key);
}

function email_mfa_context(array $row): array
{
    $metadata = json_decode((string) ($row['metadata_json'] ?? ''), true);
    return is_array($metadata) ? $metadata : [];
}

/**
 * Updates the canonical account identity and invalidates email MFA only when
 * the canonical address actually changes. Joins an existing transaction so
 * role-specific profile data can be updated atomically.
 */
function email_mfa_update_account_identity(PDO $pdo, int $userId, string $displayName, string $loginEmail): bool
{
    $ownsTransaction = !$pdo->inTransaction();
    if ($ownsTransaction) {
        $pdo->beginTransaction();
    }

    try {
        $currentStmt = $pdo->prepare("SELECT login_email FROM user_accounts WHERE user_id = ? FOR UPDATE");
        $currentStmt->execute([$userId]);
        $currentEmail = $currentStmt->fetchColumn();
        if ($currentEmail === false) {
            throw new ChallengeException('Account was not found.');
        }
        $emailChanged = !hash_equals(mb_strtolower((string) $currentEmail), mb_strtolower($loginEmail));

        $update = $pdo->prepare(
            "UPDATE user_accounts
                SET display_name = ?,
                    login_email = ?,
                    email_mfa_enabled = CASE WHEN ? = 1 THEN 0 ELSE email_mfa_enabled END,
                    email_mfa_verified_at = CASE WHEN ? = 1 THEN NULL ELSE email_mfa_verified_at END
              WHERE user_id = ?"
        );
        $update->execute([$displayName, $loginEmail, $emailChanged ? 1 : 0, $emailChanged ? 1 : 0, $userId]);

        if ($emailChanged) {
            $revoke = $pdo->prepare(
                "UPDATE security_tokens
                    SET revoked_at = UTC_TIMESTAMP(6), revocation_reason = 'Account email updated'
                  WHERE user_id = ? AND purpose = 'email_otp'
                    AND used_at IS NULL AND revoked_at IS NULL"
            );
            $revoke->execute([$userId]);
        }

        if ($ownsTransaction) {
            $pdo->commit();
        }
        return $emailChanged;
    } catch (Throwable $e) {
        if ($ownsTransaction && $pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }
}

/**
 * Creates and delivers an email code. The previous code is revoked only after
 * the replacement has been delivered successfully.
 */
function email_mfa_issue(
    PDO $pdo,
    array $config,
    int $userId,
    string $jti,
    string $context,
    ?int $previousTokenId = null,
    ?string $action = null
): array {
    $userStmt = $pdo->prepare(
        "SELECT login_email, display_name, status
           FROM user_accounts
          WHERE user_id = ?"
    );
    $userStmt->execute([$userId]);
    $user = $userStmt->fetch(PDO::FETCH_ASSOC);
    if (!$user || $user['status'] !== 'Active') {
        throw new ChallengeException('Account is not active.');
    }

    $rateStmt = $pdo->prepare(
        "SELECT COUNT(*)
           FROM security_tokens
          WHERE user_id = ? AND purpose = 'email_otp'
            AND issued_at >= (UTC_TIMESTAMP(6) - INTERVAL 15 MINUTE)"
    );
    $rateStmt->execute([$userId]);
    if ((int) $rateStmt->fetchColumn() >= 5) {
        throw new RateLimitException('Too many email-code requests.');
    }

    if ($previousTokenId !== null) {
        $previousStmt = $pdo->prepare(
            "SELECT issued_at
               FROM security_tokens
              WHERE token_id = ? AND user_id = ? AND purpose = 'email_otp'"
        );
        $previousStmt->execute([$previousTokenId, $userId]);
        $issuedAt = $previousStmt->fetchColumn();
        if ($issuedAt !== false && new DateTimeImmutable((string) $issuedAt, new DateTimeZone('UTC')) > new DateTimeImmutable('-60 seconds', new DateTimeZone('UTC'))) {
            throw new RateLimitException('Please wait before requesting another code.');
        }
    }

    $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
    $now = new DateTimeImmutable('now', new DateTimeZone('UTC'));
    $expires = $now->modify('+5 minutes');
    $metadata = json_encode([
        'context' => $context,
        'action' => $action,
        'attempts' => 0,
    ], JSON_THROW_ON_ERROR);
    $operationUuid = uuid_v4_string();

    $pdo->beginTransaction();
    try {
        $insertToken = $pdo->prepare(
            "INSERT INTO security_tokens
                (purpose, user_id, token_digest, secret_hash, issued_at, expires_at, metadata_json)
             VALUES ('email_otp', ?, ?, ?, ?, ?, ?)"
        );
        $insertToken->execute([
            $userId,
            email_mfa_digest($jti),
            email_mfa_code_hash($config, $jti, $code),
            $now->format('Y-m-d H:i:s.u'),
            $expires->format('Y-m-d H:i:s.u'),
            $metadata,
        ]);
        $tokenId = (int) $pdo->lastInsertId();

        $insertOutbox = $pdo->prepare(
            "INSERT INTO email_outbox
                (sender_user_id, recipient_email, recipient_name, subject, email_type,
                 message_body, status, operation_uuid)
             VALUES (NULL, ?, ?, 'DentiSys authentication code', 'Authentication Code',
                     NULL, 'Pending', ?)"
        );
        $insertOutbox->execute([$user['login_email'], $user['display_name'], $operationUuid]);
        $outboxId = (int) $pdo->lastInsertId();

        $safeName = htmlspecialchars((string) $user['display_name'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $safeCode = htmlspecialchars($code, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $body = "<p>Hello {$safeName},</p><p>Your DentiSys authentication code is <strong>{$safeCode}</strong>.</p>"
            . '<p>It expires in five minutes and can be used once.</p>';
        $sent = send_email(
            (string) $user['login_email'],
            'DentiSys authentication code',
            $body,
            $config,
            true
        );

        if (!$sent) {
            $fail = $pdo->prepare(
                "UPDATE email_outbox SET status = 'Failed', failure_reason = 'SMTP delivery failed'
                  WHERE email_id = ?"
            );
            $fail->execute([$outboxId]);
            $revokeFailed = $pdo->prepare(
                "UPDATE security_tokens
                    SET revoked_at = UTC_TIMESTAMP(6), revocation_reason = 'Email delivery failed'
                  WHERE token_id = ?"
            );
            $revokeFailed->execute([$tokenId]);
            $pdo->commit();
            throw new MfaException('Authentication email could not be delivered.');
        }

        $sentStmt = $pdo->prepare(
            "UPDATE email_outbox SET status = 'Sent', sent_at = UTC_TIMESTAMP(6) WHERE email_id = ?"
        );
        $sentStmt->execute([$outboxId]);
        if ($previousTokenId !== null) {
            $revokePrevious = $pdo->prepare(
                "UPDATE security_tokens
                    SET revoked_at = UTC_TIMESTAMP(6), revocation_reason = 'Replaced after successful resend'
                  WHERE token_id = ? AND user_id = ? AND purpose = 'email_otp'
                    AND used_at IS NULL AND revoked_at IS NULL"
            );
            $revokePrevious->execute([$previousTokenId, $userId]);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }

    return [
        'token_id' => $tokenId,
        'masked_email' => email_mfa_mask_address((string) $user['login_email']),
        'expires_in' => 300,
        'resend_after' => 60,
    ];
}

function email_mfa_find(PDO $pdo, int $userId, string $jti, bool $forUpdate = false): array
{
    $sql = "SELECT * FROM security_tokens
             WHERE user_id = ? AND purpose = 'email_otp' AND token_digest = ?"
        . ($forUpdate ? ' FOR UPDATE' : '');
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$userId, email_mfa_digest($jti)]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        throw new ChallengeException('Email challenge was not found.');
    }
    return $row;
}

function email_mfa_verify(PDO $pdo, array $config, array $claims, string $code): array
{
    if (!preg_match('/^\d{6}$/', $code)) {
        throw new MfaException('Enter the six-digit email code.');
    }
    $pdo->beginTransaction();
    try {
        $row = email_mfa_find($pdo, (int) $claims['sub'], (string) $claims['jti'], true);
        if ($row['used_at'] !== null || $row['revoked_at'] !== null) {
            throw new ChallengeException('Email challenge is no longer active.');
        }
        if (new DateTimeImmutable((string) $row['expires_at'], new DateTimeZone('UTC')) <= new DateTimeImmutable('now', new DateTimeZone('UTC'))) {
            throw new ChallengeException('Email challenge has expired.');
        }
        $metadata = email_mfa_context($row);
        $attempts = (int) ($metadata['attempts'] ?? 0);
        if ($attempts >= 5) {
            throw new ChallengeException('Email challenge has no attempts remaining.');
        }
        if (!hash_equals((string) $row['secret_hash'], email_mfa_code_hash($config, (string) $claims['jti'], $code))) {
            $metadata['attempts'] = $attempts + 1;
            $failed = $pdo->prepare(
                "UPDATE security_tokens
                    SET metadata_json = ?,
                        revoked_at = CASE WHEN ? >= 5 THEN UTC_TIMESTAMP(6) ELSE revoked_at END,
                        revocation_reason = CASE WHEN ? >= 5 THEN 'Verification attempts exhausted' ELSE revocation_reason END
                  WHERE token_id = ?"
            );
            $failed->execute([json_encode($metadata, JSON_THROW_ON_ERROR), $attempts + 1, $attempts + 1, $row['token_id']]);
            $pdo->commit();
            throw new MfaException('Invalid email code.');
        }
        $consume = $pdo->prepare(
            "UPDATE security_tokens SET used_at = UTC_TIMESTAMP(6)
              WHERE token_id = ? AND used_at IS NULL AND revoked_at IS NULL"
        );
        $consume->execute([$row['token_id']]);
        if ($consume->rowCount() !== 1) {
            throw new ChallengeException('Email challenge was already used.');
        }
        $pdo->commit();
        return ['token' => $row, 'metadata' => $metadata];
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }
}
