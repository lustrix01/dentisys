<?php

declare(strict_types=1);

if (!function_exists('sanitize_for_log')) {
function sanitize_for_log(\Throwable $e): string
{
    return get_class($e) . ' [' . ($e->getCode() > 0 ? $e->getCode() : 0) . ']';
}
}

function mfa_authenticated_context(PDO $pdo, array $config): array
{
    $token = auth_extract_bearer_token(request_header('Authorization') ?? '');
    $jwtKey = config_key_bytes_at_least($config['jwt']['signing_key_b64'], 32, 'JWT_SIGNING_KEY');
    return auth_verify_access_token($pdo, $token, $jwtKey);
}

function mfa_require_step_up(PDO $pdo, array $config, int $userId, string $code): void
{
    if (!preg_match('/^\d{6}$/', $code)) {
        throw new MfaException('A current 6-digit authenticator code is required.');
    }
    $stmt = $pdo->prepare(
        "SELECT token_id, ciphertext, nonce, auth_tag, totp_algorithm, digit_count,
                period_seconds, last_accepted_step
           FROM security_tokens
          WHERE user_id = ? AND purpose = 'mfa_credential'
            AND mfa_status = 'enabled' AND revoked_at IS NULL
          FOR UPDATE"
    );
    $stmt->execute([$userId]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    if (count($rows) !== 1) {
        throw new MfaException('An enabled MFA credential is required.');
    }
    $credential = $rows[0];
    $mfaKey = config_key_bytes_exact($config['mfa']['encryption_key_b64'], 32, 'MFA_ENCRYPTION_KEY');
    $secret = mfa_decrypt_secret(
        $credential['ciphertext'],
        $credential['nonce'],
        $credential['auth_tag'],
        $mfaKey
    );
    if ($secret === null) {
        throw new MfaException('Unable to verify the authenticator credential.');
    }
    $result = mfa_verify_window(
        $secret,
        $code,
        $credential['totp_algorithm'] ?? 'sha1',
        (int) ($credential['digit_count'] ?? 6),
        (int) ($credential['period_seconds'] ?? 30),
        1
    );
    if (!$result['valid']) {
        throw new MfaException('Invalid authenticator code.');
    }
    $matchedStep = (int) $result['matched_step'];
    $consume = $pdo->prepare(
        "UPDATE security_tokens
            SET last_accepted_step = ?
          WHERE token_id = ?
            AND (last_accepted_step IS NULL OR last_accepted_step < ?)"
    );
    $consume->execute([$matchedStep, $credential['token_id'], $matchedStep]);
    if ($consume->rowCount() !== 1) {
        throw new MfaException('Authenticator code was already used.');
    }
}

function handle_mfa_settings_status(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = mfa_authenticated_context($pdo, $config);
        $stmt = $pdo->prepare(
            "SELECT
                SUM(purpose = 'mfa_credential' AND mfa_status = 'enabled' AND revoked_at IS NULL) AS enabled_count,
                SUM(purpose = 'mfa_recovery' AND used_at IS NULL AND revoked_at IS NULL) AS recovery_count
             FROM security_tokens
             WHERE user_id = ?"
        );
        $stmt->execute([$authCtx['user_id']]);
        $status = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];
        $emailStmt = $pdo->prepare(
            "SELECT email_mfa_enabled, email_mfa_verified_at FROM user_accounts WHERE user_id = ?"
        );
        $emailStmt->execute([$authCtx['user_id']]);
        $emailStatus = $emailStmt->fetch(PDO::FETCH_ASSOC) ?: [];
        auth_controller_emit(auth_build_no_store_json_response([
            'status' => 'ok',
            'mfa' => [
                'enabled' => (int) ($status['enabled_count'] ?? 0) === 1,
                'authenticatorEnabled' => (int) ($status['enabled_count'] ?? 0) === 1,
                'emailEnabled' => (int) ($emailStatus['email_mfa_enabled'] ?? 0) === 1,
                'emailVerifiedAt' => $emailStatus['email_mfa_verified_at'] ?? null,
                'recoveryCodeCount' => (int) ($status['recovery_count'] ?? 0),
            ],
        ], 200));
    } catch (ChallengeException | AuthException $e) {
        auth_controller_emit(auth_build_no_store_message_response('Authentication required.', 401));
    } catch (\Throwable $e) {
        error_log('MFA settings status error: ' . sanitize_for_log($e));
        auth_controller_emit(auth_build_no_store_message_response('Internal server error.', 500));
    }
}

function handle_mfa_settings_recovery_codes(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = mfa_authenticated_context($pdo, $config);
        $body = request_body();
        $code = $body['has_body'] ? (string) ($body['data']['code'] ?? '') : '';
        $recovery = mfa_generate_recovery_codes(8);
        $nowSql = (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d H:i:s.u');

        $pdo->beginTransaction();
        try {
            mfa_require_step_up($pdo, $config, (int) $authCtx['user_id'], $code);
            $credential = $pdo->prepare(
                "SELECT token_id FROM security_tokens
                 WHERE user_id = ? AND purpose = 'mfa_credential'
                   AND mfa_status = 'enabled' AND revoked_at IS NULL
                 FOR UPDATE"
            );
            $credential->execute([$authCtx['user_id']]);
            if (count($credential->fetchAll(PDO::FETCH_ASSOC)) !== 1) {
                throw new MfaException('An enabled MFA credential is required.');
            }

            $revoke = $pdo->prepare(
                "UPDATE security_tokens
                 SET revoked_at = ?, revocation_reason = 'Recovery codes regenerated'
                 WHERE user_id = ? AND purpose = 'mfa_recovery'
                   AND used_at IS NULL AND revoked_at IS NULL"
            );
            $revoke->execute([$nowSql, $authCtx['user_id']]);

            $insert = $pdo->prepare(
                "INSERT INTO security_tokens (purpose, user_id, secret_hash, issued_at)
                 VALUES ('mfa_recovery', ?, ?, ?)"
            );
            foreach ($recovery['hashes'] as $hash) {
                $insert->execute([$authCtx['user_id'], $hash, $nowSql]);
            }
            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }

        auth_controller_emit(auth_build_no_store_json_response([
            'status' => 'ok',
            'message' => 'Recovery codes regenerated. Previous unused codes were revoked.',
            'recovery_codes' => $recovery['codes'],
        ], 200));
    } catch (ChallengeException | AuthException $e) {
        auth_controller_emit(auth_build_no_store_message_response('Authentication required.', 401));
    } catch (MfaException $e) {
        auth_controller_emit(auth_build_no_store_message_response($e->getMessage(), 422));
    } catch (\Throwable $e) {
        error_log('MFA recovery regeneration error: ' . sanitize_for_log($e));
        auth_controller_emit(auth_build_no_store_message_response('Internal server error.', 500));
    }
}

function handle_mfa_settings_revoke(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = mfa_authenticated_context($pdo, $config);
        $body = request_body();
        $code = $body['has_body'] ? (string) ($body['data']['code'] ?? '') : '';
        $nowSql = (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d H:i:s.u');

        $pdo->beginTransaction();
        try {
            mfa_require_step_up($pdo, $config, (int) $authCtx['user_id'], $code);
            $revoke = $pdo->prepare(
                "UPDATE security_tokens
                 SET mfa_status = CASE WHEN purpose = 'mfa_credential' THEN 'revoked' ELSE mfa_status END,
                     revoked_at = ?, revocation_reason = 'Revoked by account owner'
                 WHERE user_id = ? AND purpose IN ('mfa_credential', 'mfa_recovery')
                   AND revoked_at IS NULL"
            );
            $revoke->execute([$nowSql, $authCtx['user_id']]);
            if ($revoke->rowCount() === 0) {
                throw new MfaException('No active MFA credential was found.');
            }
            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }

        auth_controller_emit(auth_build_no_store_json_response([
            'status' => 'ok',
            'message' => 'Authenticator 2FA disabled.',
        ], 200));
    } catch (ChallengeException | AuthException $e) {
        auth_controller_emit(auth_build_no_store_message_response('Authentication required.', 401));
    } catch (MfaException $e) {
        auth_controller_emit(auth_build_no_store_message_response($e->getMessage(), 422));
    } catch (\Throwable $e) {
        error_log('MFA revoke error: ' . sanitize_for_log($e));
        auth_controller_emit(auth_build_no_store_message_response('Internal server error.', 500));
    }
}

function handle_mfa_enroll_start(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);

        $context = [
            'request_id' => request_id(),
            'ip_address' => request_ip(),
            'user_agent' => request_user_agent(),
            'http_method' => request_method(),
            'endpoint' => request_path(),
        ];

        $authCtx = mfa_authenticated_context($pdo, $config);
        $claims = [
            'sub' => (int) $authCtx['user_id'],
            'token_version' => (int) $authCtx['token_version'],
            'session_id' => (int) $authCtx['session_id'],
        ];

        $result = mfa_runtime_enroll_start($pdo, $config, $claims, $context);

        auth_controller_emit(auth_build_no_store_json_response([
            'confirmation_token' => $result['confirmation_token'],
            'provisioning_uri' => $result['provisioning_uri'],
            'qr_code_data_uri' => $result['qr_code_data_uri'],
            'base32_secret' => $result['base32_secret'],
        ], 200));
    } catch (ChallengeException | AuthException | \RuntimeException $e) {
        auth_controller_emit(auth_build_no_store_message_response($e->getMessage(), 401));
    } catch (MfaException $e) {
        auth_controller_emit(auth_build_no_store_message_response($e->getMessage(), 400));
    } catch (InactiveAccountException $e) {
        auth_controller_emit(auth_build_no_store_message_response($e->getMessage(), 403));
    } catch (RateLimitException $e) {
        auth_controller_emit(auth_build_no_store_message_response('Too many requests.', 429));
    } catch (\Throwable $e) {
        error_log('MFA enroll start error [' . ($context['request_id'] ?? '?') . ']: ' . sanitize_for_log($e));
        auth_controller_emit(auth_build_no_store_message_response('Internal server error.', 500));
    }
}

function handle_mfa_enroll_confirm(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);

        $context = [
            'request_id' => request_id(),
            'ip_address' => request_ip(),
            'user_agent' => request_user_agent(),
            'http_method' => request_method(),
            'endpoint' => request_path(),
        ];

        $authCtx = mfa_authenticated_context($pdo, $config);
        $jwtKey = config_key_bytes_at_least($config['jwt']['signing_key_b64'], 32, 'JWT_SIGNING_KEY');
        $body = request_body();

        if (!$body['has_body'] || !isset($body['data']['code'], $body['data']['confirmation_token'])) {
            auth_controller_emit(auth_build_no_store_message_response('Confirmation token and verification code required.', 400));
            return;
        }
        $claims = jwt_decode((string) $body['data']['confirmation_token'], $jwtKey, 'mfa_enrollment');
        if (($claims['enrollment_stage'] ?? null) !== 'confirm'
            || (int) $claims['sub'] !== (int) $authCtx['user_id']
            || (int) ($claims['session_id'] ?? 0) !== (int) $authCtx['session_id']) {
            auth_controller_emit(auth_build_no_store_message_response('Invalid enrollment session.', 401));
            return;
        }

        $code = (string) $body['data']['code'];

        if (strlen($code) < 1 || strlen($code) > 10) {
            auth_controller_emit(auth_build_no_store_message_response('Invalid verification code.', 400));
            return;
        }

        $result = mfa_runtime_enroll_confirm($pdo, $config, $claims, $code, $context);

        $response = auth_build_no_store_json_response([
            'status' => 'ok',
            'recovery_codes' => $result['recovery_codes'],
        ], 200);

        auth_controller_emit($response);
    } catch (ChallengeException | AuthException | \RuntimeException $e) {
        auth_controller_emit(auth_build_no_store_message_response($e->getMessage(), 401));
    } catch (MfaException $e) {
        auth_controller_emit(auth_build_no_store_message_response($e->getMessage(), 400));
    } catch (InactiveAccountException $e) {
        auth_controller_emit(auth_build_no_store_message_response($e->getMessage(), 403));
    } catch (RateLimitException $e) {
        auth_controller_emit(auth_build_no_store_message_response('Too many requests.', 429));
    } catch (\Throwable $e) {
        error_log('MFA enroll confirm error [' . ($context['request_id'] ?? '?') . ']: ' . sanitize_for_log($e));
        auth_controller_emit(auth_build_no_store_message_response('Internal server error.', 500));
    }
}

function handle_mfa_verify(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);

        $context = [
            'request_id' => request_id(),
            'ip_address' => request_ip(),
            'user_agent' => request_user_agent(),
            'http_method' => request_method(),
            'endpoint' => request_path(),
        ];

        $authHeader = request_header('Authorization') ?? '';
        $rawToken = auth_extract_bearer_token($authHeader);
        $jwtKey = config_key_bytes_at_least($config['jwt']['signing_key_b64'], 32, 'JWT_SIGNING_KEY');
        $claims = jwt_decode($rawToken, $jwtKey, 'mfa_challenge');

        $body = request_body();

        if (!$body['has_body'] || !isset($body['data']['code'])) {
            auth_controller_emit(auth_build_no_store_message_response('Verification code required.', 400));
            return;
        }

        $code = (string) $body['data']['code'];

        if (strlen($code) < 1 || strlen($code) > 10) {
            auth_controller_emit(auth_build_no_store_message_response('Invalid verification code.', 400));
            return;
        }

        if (($claims['method'] ?? null) === 'email') {
            email_mfa_verify($pdo, $config, $claims, $code);
            $pdo->beginTransaction();
            try {
                $locked = auth_lock_user_for_session($pdo, (int) $claims['sub']);
                if ((int) $locked['token_version'] !== (int) $claims['token_version']) {
                    throw new ChallengeException('Token version mismatch.');
                }
                $emailState = $pdo->prepare(
                    "SELECT email_mfa_enabled FROM user_accounts WHERE user_id = ? FOR UPDATE"
                );
                $emailState->execute([$locked['user_id']]);
                if ((int) $emailState->fetchColumn() !== 1) {
                    throw new ChallengeException('Email 2FA is no longer enabled.');
                }
                $cred = auth_issue_credentials($pdo, $locked, $config, $context);
                $pdo->commit();
            } catch (\Throwable $e) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                throw $e;
            }
            $result = ['credentials' => $cred];
        } else {
            $result = mfa_runtime_verify($pdo, $config, $claims, $code, $context);
        }

        $cred = $result['credentials'];
        $response = auth_build_no_store_json_response([
            'access_token' => $cred['access_token'],
            'user' => [
                'user_id' => $cred['session']['user_id'],
            ],
        ], 200);

        $isHttps = request_is_https($config, $_SERVER);
        $cookieHeaders = build_refresh_cookie_header(
            $cred['refresh_token'],
            $cred['cookie_ttl'],
            $isHttps
        );
        $response['headers'] = array_merge($response['headers'], $cookieHeaders);

        auth_controller_emit($response);
    } catch (ChallengeException | AuthException | \RuntimeException $e) {
        auth_controller_emit(auth_build_no_store_message_response($e->getMessage(), 401));
    } catch (MfaException $e) {
        auth_controller_emit(auth_build_no_store_message_response($e->getMessage(), 400));
    } catch (InactiveAccountException $e) {
        auth_controller_emit(auth_build_no_store_message_response($e->getMessage(), 403));
    } catch (RateLimitException $e) {
        auth_controller_emit(auth_build_no_store_message_response('Too many requests.', 429));
    } catch (\Throwable $e) {
        error_log('MFA verify error [' . ($context['request_id'] ?? '?') . ']: ' . sanitize_for_log($e));
        auth_controller_emit(auth_build_no_store_message_response('Internal server error.', 500));
    }
}

function handle_mfa_recover(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);

        $context = [
            'request_id' => request_id(),
            'ip_address' => request_ip(),
            'user_agent' => request_user_agent(),
            'http_method' => request_method(),
            'endpoint' => request_path(),
        ];

        $authHeader = request_header('Authorization') ?? '';
        $rawToken = auth_extract_bearer_token($authHeader);
        $jwtKey = config_key_bytes_at_least($config['jwt']['signing_key_b64'], 32, 'JWT_SIGNING_KEY');
        $claims = jwt_decode($rawToken, $jwtKey, 'mfa_challenge');

        $body = request_body();

        if (!$body['has_body'] || !isset($body['data']['code'])) {
            auth_controller_emit(auth_build_no_store_message_response('Recovery code required.', 400));
            return;
        }

        $code = (string) $body['data']['code'];

        $result = mfa_runtime_recover($pdo, $config, $claims, $code, $context);

        $cred = $result['credentials'];
        $response = auth_build_no_store_json_response([
            'access_token' => $cred['access_token'],
            'user' => [
                'user_id' => $cred['session']['user_id'],
            ],
        ], 200);

        $isHttps = request_is_https($config, $_SERVER);
        $cookieHeaders = build_refresh_cookie_header(
            $cred['refresh_token'],
            $cred['cookie_ttl'],
            $isHttps
        );
        $response['headers'] = array_merge($response['headers'], $cookieHeaders);

        auth_controller_emit($response);
    } catch (ChallengeException | AuthException | \RuntimeException $e) {
        auth_controller_emit(auth_build_no_store_message_response($e->getMessage(), 401));
    } catch (MfaException $e) {
        auth_controller_emit(auth_build_no_store_message_response($e->getMessage(), 400));
    } catch (InactiveAccountException $e) {
        auth_controller_emit(auth_build_no_store_message_response($e->getMessage(), 403));
    } catch (RateLimitException $e) {
        auth_controller_emit(auth_build_no_store_message_response('Too many requests.', 429));
    } catch (\Throwable $e) {
        error_log('MFA recover error [' . ($context['request_id'] ?? '?') . ']: ' . sanitize_for_log($e));
        auth_controller_emit(auth_build_no_store_message_response('Internal server error.', 500));
    }
}

function mfa_request_context(): array
{
    return [
        'request_id' => request_id(),
        'ip_address' => request_ip(),
        'user_agent' => request_user_agent(),
        'http_method' => request_method(),
        'endpoint' => request_path(),
    ];
}

function mfa_issue_challenge_token(array $config, array $user, string $method, string $jti): string
{
    $now = time();
    $jwtKey = config_key_bytes_at_least($config['jwt']['signing_key_b64'], 32, 'JWT_SIGNING_KEY');
    return jwt_encode([
        'sub' => (int) $user['user_id'],
        'jti' => $jti,
        'token_type' => 'mfa_challenge',
        'token_version' => (int) $user['token_version'],
        'method' => $method,
        'iat' => $now,
        'exp' => $now + 300,
    ], $jwtKey);
}

function handle_mfa_challenge_start(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $body = request_body();
        $method = $body['has_body'] ? (string) ($body['data']['method'] ?? '') : '';
        if (!in_array($method, ['email', 'authenticator'], true)) {
            throw new MfaException('Select email or authenticator.');
        }
        rate_limit_check(
            ['dir' => $config['rate_limit']['storage_dir']],
            bin2hex(hash('sha256', 'ip:' . request_ip(), true)),
            'post_mfa_challenge_start',
            300,
            20
        );

        $rawToken = auth_extract_bearer_token(request_header('Authorization') ?? '');
        $jwtKey = config_key_bytes_at_least($config['jwt']['signing_key_b64'], 32, 'JWT_SIGNING_KEY');
        $selection = jwt_decode($rawToken, $jwtKey, 'mfa_selection');
        if (!in_array($method, (array) ($selection['methods'] ?? []), true)) {
            throw new ChallengeException('The selected method is not available.');
        }

        $stmt = $pdo->prepare(
            "SELECT user_id, login_email, token_version, status, email_mfa_enabled
               FROM user_accounts WHERE user_id = ?"
        );
        $stmt->execute([(int) $selection['sub']]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$user || $user['status'] !== 'Active' || (int) $user['token_version'] !== (int) $selection['token_version']) {
            throw new ChallengeException('Account state changed. Sign in again.');
        }
        if ($method === 'email' && (int) $user['email_mfa_enabled'] !== 1) {
            throw new ChallengeException('Email 2FA is not enabled.');
        }
        if ($method === 'authenticator') {
            $enabled = $pdo->prepare(
                "SELECT COUNT(*) FROM security_tokens
                  WHERE user_id = ? AND purpose = 'mfa_credential'
                    AND mfa_status = 'enabled' AND revoked_at IS NULL"
            );
            $enabled->execute([$user['user_id']]);
            if ((int) $enabled->fetchColumn() !== 1) {
                throw new ChallengeException('Authenticator 2FA is not enabled.');
            }
        }

        $jti = jwt_generate_jti();
        $challengeToken = mfa_issue_challenge_token($config, $user, $method, $jti);
        $payload = [
            'type' => 'mfa_challenge',
            'method' => $method,
            'mfa_challenge_token' => $challengeToken,
            'expires_in' => 300,
        ];
        if ($method === 'authenticator') {
            challenge_state_init(
                ['dir' => $config['rate_limit']['storage_dir']],
                $jti,
                'mfa_challenge',
                'complete_login',
                5,
                300
            );
        } else {
            $payload = array_merge($payload, email_mfa_issue(
                $pdo,
                $config,
                (int) $user['user_id'],
                $jti,
                'login'
            ));
            unset($payload['token_id']);
        }
        auth_controller_emit(auth_build_no_store_json_response($payload, 200));
    } catch (RateLimitException $e) {
        auth_controller_emit(auth_build_no_store_message_response($e->getMessage(), 429));
    } catch (ChallengeException | AuthException | MfaException | RuntimeException $e) {
        auth_controller_emit(auth_build_no_store_message_response($e->getMessage(), 400));
    } catch (Throwable $e) {
        error_log('MFA challenge start error: ' . sanitize_for_log($e));
        auth_controller_emit(auth_build_no_store_message_response('Internal server error.', 500));
    }
}

function handle_mfa_email_resend(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $rawToken = auth_extract_bearer_token(request_header('Authorization') ?? '');
        $jwtKey = config_key_bytes_at_least($config['jwt']['signing_key_b64'], 32, 'JWT_SIGNING_KEY');
        $claims = jwt_decode($rawToken, $jwtKey, 'mfa_challenge');
        if (($claims['method'] ?? null) !== 'email') {
            throw new ChallengeException('This is not an email challenge.');
        }
        $previous = email_mfa_find($pdo, (int) $claims['sub'], (string) $claims['jti']);
        if ($previous['used_at'] !== null || $previous['revoked_at'] !== null) {
            throw new ChallengeException('Email challenge is no longer active.');
        }
        $userStmt = $pdo->prepare(
            "SELECT user_id, token_version FROM user_accounts
              WHERE user_id = ? AND status = 'Active' AND email_mfa_enabled = 1"
        );
        $userStmt->execute([(int) $claims['sub']]);
        $user = $userStmt->fetch(PDO::FETCH_ASSOC);
        if (!$user || (int) $user['token_version'] !== (int) $claims['token_version']) {
            throw new ChallengeException('Account state changed. Sign in again.');
        }
        $jti = jwt_generate_jti();
        $newToken = mfa_issue_challenge_token($config, $user, 'email', $jti);
        $delivery = email_mfa_issue(
            $pdo,
            $config,
            (int) $user['user_id'],
            $jti,
            'login',
            (int) $previous['token_id']
        );
        auth_controller_emit(auth_build_no_store_json_response([
            'type' => 'mfa_challenge',
            'method' => 'email',
            'mfa_challenge_token' => $newToken,
            'masked_email' => $delivery['masked_email'],
            'expires_in' => 300,
            'resend_after' => 60,
        ], 200));
    } catch (RateLimitException $e) {
        auth_controller_emit(auth_build_no_store_message_response($e->getMessage(), 429));
    } catch (ChallengeException | AuthException | MfaException | RuntimeException $e) {
        auth_controller_emit(auth_build_no_store_message_response($e->getMessage(), 400));
    } catch (Throwable $e) {
        error_log('MFA email resend error: ' . sanitize_for_log($e));
        auth_controller_emit(auth_build_no_store_message_response('Internal server error.', 500));
    }
}

function handle_mfa_settings_email_start(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = mfa_authenticated_context($pdo, $config);
        $body = request_body();
        $action = $body['has_body'] ? (string) ($body['data']['action'] ?? '') : '';
        if (!in_array($action, ['enable', 'disable'], true)) {
            throw new MfaException('Action must be enable or disable.');
        }
        $state = $pdo->prepare("SELECT email_mfa_enabled FROM user_accounts WHERE user_id = ?");
        $state->execute([$authCtx['user_id']]);
        $currentlyEnabled = (int) $state->fetchColumn() === 1;
        if (($action === 'enable') === $currentlyEnabled) {
            throw new MfaException("Email 2FA is already {$action}d.");
        }
        $jti = jwt_generate_jti();
        $now = time();
        $jwtKey = config_key_bytes_at_least($config['jwt']['signing_key_b64'], 32, 'JWT_SIGNING_KEY');
        $confirmationToken = jwt_encode([
            'sub' => (int) $authCtx['user_id'],
            'jti' => $jti,
            'token_type' => 'email_mfa_confirmation',
            'token_version' => (int) $authCtx['token_version'],
            'session_id' => (int) $authCtx['session_id'],
            'action' => $action,
            'iat' => $now,
            'exp' => $now + 300,
        ], $jwtKey);
        $delivery = email_mfa_issue($pdo, $config, (int) $authCtx['user_id'], $jti, 'settings', null, $action);
        auth_controller_emit(auth_build_no_store_json_response([
            'confirmation_token' => $confirmationToken,
            'masked_email' => $delivery['masked_email'],
            'expires_in' => 300,
            'resend_after' => 60,
        ], 200));
    } catch (RateLimitException $e) {
        auth_controller_emit(auth_build_no_store_message_response($e->getMessage(), 429));
    } catch (ChallengeException | AuthException | MfaException | RuntimeException $e) {
        auth_controller_emit(auth_build_no_store_message_response($e->getMessage(), 400));
    } catch (Throwable $e) {
        error_log('MFA email setting start error: ' . sanitize_for_log($e));
        auth_controller_emit(auth_build_no_store_message_response('Internal server error.', 500));
    }
}

function handle_mfa_settings_email_confirm(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = mfa_authenticated_context($pdo, $config);
        $body = request_body();
        if (!$body['has_body'] || !isset($body['data']['confirmation_token'], $body['data']['code'])) {
            throw new MfaException('Confirmation token and code are required.');
        }
        $jwtKey = config_key_bytes_at_least($config['jwt']['signing_key_b64'], 32, 'JWT_SIGNING_KEY');
        $claims = jwt_decode((string) $body['data']['confirmation_token'], $jwtKey, 'email_mfa_confirmation');
        if ((int) $claims['sub'] !== (int) $authCtx['user_id']
            || (int) ($claims['session_id'] ?? 0) !== (int) $authCtx['session_id']
            || !in_array($claims['action'] ?? null, ['enable', 'disable'], true)) {
            throw new ChallengeException('Invalid email 2FA confirmation.');
        }
        email_mfa_verify($pdo, $config, $claims, (string) $body['data']['code']);
        $enable = $claims['action'] === 'enable';
        $update = $pdo->prepare(
            "UPDATE user_accounts
                SET email_mfa_enabled = ?,
                    email_mfa_verified_at = CASE WHEN ? = 1 THEN UTC_TIMESTAMP(6) ELSE NULL END
              WHERE user_id = ?"
        );
        $update->execute([$enable ? 1 : 0, $enable ? 1 : 0, $authCtx['user_id']]);
        auth_controller_emit(auth_build_no_store_json_response([
            'status' => 'ok',
            'emailEnabled' => $enable,
        ], 200));
    } catch (ChallengeException | AuthException | MfaException | RuntimeException $e) {
        auth_controller_emit(auth_build_no_store_message_response($e->getMessage(), 400));
    } catch (Throwable $e) {
        error_log('MFA email setting confirm error: ' . sanitize_for_log($e));
        auth_controller_emit(auth_build_no_store_message_response('Internal server error.', 500));
    }
}
