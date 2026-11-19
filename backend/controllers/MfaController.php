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
    return auth_verify_access_token($pdo, $config, $token, $jwtKey);
}

/** DS12: the two enrol routes also accept the Superadmin's short-lived setup token (no session yet). It opens nothing else. */
function mfa_enroll_context(PDO $pdo, array $config): array
{
    $token = auth_extract_bearer_token(request_header('Authorization') ?? '');
    $jwtKey = config_key_bytes_at_least($config['jwt']['signing_key_b64'], 32, 'JWT_SIGNING_KEY');
    try {
        $claims = jwt_decode($token, $jwtKey, 'mfa_setup');
    } catch (\Throwable $e) {
        return auth_verify_access_token($pdo, $config, $token, $jwtKey);
    }
    // The token dies with the account's sessions: still an Active Superadmin with the same token_version.
    $stmt = $pdo->prepare('SELECT role, status, token_version FROM user_accounts WHERE user_id = ?');
    $stmt->execute([(int) $claims['sub']]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row || $row['role'] !== 'superadmin' || $row['status'] !== 'Active' || (int) $row['token_version'] !== (int) $claims['token_version']) {
        throw new AuthException('Authentication required.');
    }
    return ['user_id' => (int) $claims['sub'], 'role' => 'superadmin', 'token_version' => (int) $claims['token_version'], 'session_id' => 0, 'setup_claims' => $claims];
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
    $ciphertext = pdo_binary_value($credential['ciphertext']);
    $nonce = pdo_binary_value($credential['nonce']);
    $authTag = pdo_binary_value($credential['auth_tag']);
    if ($ciphertext === null || $nonce === null || $authTag === null) {
        throw new MfaException('Corrupt MFA credential.');
    }
    $secret = mfa_decrypt_secret($ciphertext, $nonce, $authTag, $mfaKey);
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

// Same per-user budget as name-change confirmation (10 attempts / 5 minutes).
function mfa_settings_confirm_rate_limit(array $config, int $userId): void
{
    $rateStorage = ['dir' => $config['rate_limit']['storage_dir']];
    $userScope = bin2hex(hash('sha256', 'user:' . $userId, true));
    rate_limit_check($rateStorage, $userScope, 'post_mfa_settings_confirm', 300, 10);
}

function handle_mfa_settings_status(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = mfa_authenticated_context($pdo, $config);
        $stmt = $pdo->prepare(
            "SELECT
                COUNT(*) FILTER (WHERE purpose = 'mfa_credential' AND mfa_status = 'enabled' AND revoked_at IS NULL) AS enabled_count,
                COUNT(*) FILTER (WHERE purpose = 'mfa_recovery' AND used_at IS NULL AND revoked_at IS NULL) AS recovery_count
             FROM security_tokens
             WHERE user_id = ?"
        );
        $stmt->execute([$authCtx['user_id']]);
        $status = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];
        auth_controller_emit(auth_build_no_store_json_response([
            'status' => 'ok',
            'two_factor' => [
                'enabled' => (int) ($status['enabled_count'] ?? 0) === 1,
                'authenticator_enabled' => (int) ($status['enabled_count'] ?? 0) === 1,
                'recovery_code_count' => (int) ($status['recovery_count'] ?? 0),
                'trusted_device_count' => trusted_device_active_count($pdo, (int) $authCtx['user_id']),
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
        mfa_settings_confirm_rate_limit($config, (int) $authCtx['user_id']);
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
            audit_record_action(
                $pdo, $config, $authCtx, 'mfa', 'mfa_recovery_codes_regenerated', 'user_account', (string) $authCtx['user_id'],
                'Regenerated recovery codes.'
            );
            trusted_device_revoke_all($pdo, $config, $authCtx, (int) $authCtx['user_id'], 'recovery_regenerated');
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
    } catch (RateLimitException $e) {
        auth_controller_emit(auth_build_no_store_message_response('Too many requests.', 429));
    } catch (\Throwable $e) {
        error_log('MFA recovery regeneration error: ' . sanitize_for_log($e));
        auth_controller_emit(auth_build_no_store_message_response('Internal server error.', 500));
    }
}

/** 9.24: signed-in user forgets every remembered device of their own account; no code needed. */
function handle_mfa_trusted_devices_forget(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = mfa_authenticated_context($pdo, $config);
        $userId = (int) $authCtx['user_id'];
        $rateStorage = ['dir' => $config['rate_limit']['storage_dir']];
        rate_limit_check($rateStorage, bin2hex(hash('sha256', 'user:' . $userId, true)), 'post_mfa_trusted_forget', 300, 10);

        $pdo->beginTransaction();
        try {
            $forgotten = trusted_device_revoke_all($pdo, $config, $authCtx, $userId, 'forgotten');
            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }

        auth_controller_emit(auth_build_no_store_json_response(['forgotten' => $forgotten], 200));
    } catch (ChallengeException | AuthException $e) {
        auth_controller_emit(auth_build_no_store_message_response('Authentication required.', 401));
    } catch (RateLimitException $e) {
        auth_controller_emit(auth_build_no_store_message_response('Too many requests.', 429));
    } catch (\Throwable $e) {
        error_log('MFA trusted devices forget error: ' . sanitize_for_log($e));
        auth_controller_emit(auth_build_no_store_message_response('Internal server error.', 500));
    }
}

function handle_mfa_settings_revoke(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = mfa_authenticated_context($pdo, $config);
        if (($authCtx['role'] ?? null) === 'superadmin') { // DS13
            auth_controller_emit(auth_build_no_store_json_response([
                'status' => 'error',
                'code' => 'two_factor_required',
                'message' => '2FA is required for the Superadmin and cannot be turned off.',
            ], 403));
            return;
        }
        $body = request_body();
        $code = $body['has_body'] ? (string) ($body['data']['code'] ?? '') : '';
        mfa_settings_confirm_rate_limit($config, (int) $authCtx['user_id']);
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
            audit_record_action(
                $pdo, $config, $authCtx, 'mfa', 'mfa_revoked', 'user_account', (string) $authCtx['user_id'],
                'Disabled authenticator 2FA and revoked unused recovery codes.',
                ['reason' => 'Revoked by account owner']
            );
            trusted_device_revoke_all($pdo, $config, $authCtx, (int) $authCtx['user_id'], 'two_factor_off');
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
    } catch (RateLimitException $e) {
        auth_controller_emit(auth_build_no_store_message_response('Too many requests.', 429));
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

        $authCtx = mfa_enroll_context($pdo, $config);
        $claims = [
            'sub' => (int) $authCtx['user_id'],
            'token_version' => (int) $authCtx['token_version'],
            'session_id' => isset($authCtx['setup_claims']) ? null : (int) $authCtx['session_id'],
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

        $authCtx = mfa_enroll_context($pdo, $config);
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

        $payload = [
            'status' => 'ok',
            'recovery_codes' => $result['recovery_codes'],
        ];
        $cred = null;
        if (isset($authCtx['setup_claims'])) {
            // DS12: 2FA is now on, so issue the session exactly like a direct login.
            $setup = $authCtx['setup_claims'];
            $pdo->beginTransaction();
            try {
                $locked = auth_lock_user_for_session($pdo, (int) $authCtx['user_id']);
                if ($locked['status'] !== 'Active') {
                    throw new InactiveAccountException($locked['status']);
                }
                $cred = auth_issue_credentials(
                    $pdo,
                    $locked,
                    $config,
                    $context,
                    (string) ($setup['authentication_source'] ?? 'password'),
                    isset($setup['pending_google_subject']) ? (string) $setup['pending_google_subject'] : null
                );
                audit_record_action(
                    $pdo,
                    $config,
                    ['user_id' => (int) $locked['user_id'], 'login_email' => $locked['login_email'], 'role' => $locked['role'], 'display_name' => $locked['display_name']],
                    'auth',
                    'login_success',
                    'user_account',
                    (string) $locked['user_id'],
                    ($setup['authentication_source'] ?? 'password') === 'google' ? 'Signed in with Google after setting up 2FA.' : 'Signed in with password after setting up 2FA.',
                    ['context' => $context]
                );
                $pdo->commit();
            } catch (\Throwable $e) {
                if ($pdo->inTransaction()) { $pdo->rollBack(); }
                throw $e;
            }
            $payload['access_token'] = $cred['access_token'];
            $payload['user'] = ['user_id' => $cred['session']['user_id']];
        }

        $response = auth_build_no_store_json_response($payload, 200);
        if ($cred !== null) {
            $response['headers'] = array_merge($response['headers'], build_refresh_cookie_header(
                $cred['refresh_token'],
                $cred['cookie_ttl'],
                request_is_https($config, $_SERVER)
            ));
        }

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

        if (($claims['method'] ?? null) !== 'authenticator') {
            throw new ChallengeException('Authenticator 2FA is required.');
        }

        $rememberDevice = false;
        if (array_key_exists('remember_device', $body['data'])) {
            if (!is_bool($body['data']['remember_device'])) {
                auth_controller_emit(auth_build_no_store_message_response('remember_device must be true or false.', 400));
                return;
            }
            $rememberDevice = $body['data']['remember_device'];
        }

        $result = mfa_runtime_verify($pdo, $config, $claims, $code, $context, $rememberDevice);

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
        if ($result['trusted_device_token'] !== null) {
            $response['headers'] = array_merge($response['headers'], build_trusted_device_cookie_header($result['trusted_device_token'], $isHttps));
        }

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
