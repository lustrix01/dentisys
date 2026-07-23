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
        auth_controller_emit(auth_build_no_store_json_response([
            'status' => 'ok',
            'mfa' => [
                'enabled' => (int) ($status['enabled_count'] ?? 0) === 1,
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
            'message' => 'MFA credential revoked. Enrollment is required at the next login.',
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

        $authHeader = request_header('Authorization') ?? '';
        $token = auth_extract_bearer_token($authHeader);
        $jwtKey = config_key_bytes_at_least($config['jwt']['signing_key_b64'], 32, 'JWT_SIGNING_KEY');
        $claims = jwt_decode($token, $jwtKey, 'mfa_enrollment');

        if (!isset($claims['enrollment_stage']) || $claims['enrollment_stage'] !== 'start') {
            auth_controller_emit(auth_build_no_store_message_response('Invalid enrollment stage.', 401));
            return;
        }

        $result = mfa_runtime_enroll_start($pdo, $config, $claims, $context);

        auth_controller_emit(auth_build_no_store_json_response([
            'confirmation_token' => $result['confirmation_token'],
            'provisioning_uri' => $result['provisioning_uri'],
            'base32_secret' => $result['base32_secret'],
            'dev_mfa_code' => $result['dev_mfa_code'] ?? null,
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

        $authHeader = request_header('Authorization') ?? '';
        $rawToken = auth_extract_bearer_token($authHeader);
        $jwtKey = config_key_bytes_at_least($config['jwt']['signing_key_b64'], 32, 'JWT_SIGNING_KEY');
        $claims = jwt_decode($rawToken, $jwtKey, 'mfa_enrollment');

        if (!isset($claims['enrollment_stage']) || $claims['enrollment_stage'] !== 'confirm') {
            auth_controller_emit(auth_build_no_store_message_response('Invalid enrollment stage.', 401));
            return;
        }

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

        $result = mfa_runtime_enroll_confirm($pdo, $config, $claims, $code, $context);

        $cred = $result['credentials'];
        $response = auth_build_no_store_json_response([
            'access_token' => $cred['access_token'],
            'user' => [
                'user_id' => $cred['session']['user_id'],
            ],
            'recovery_codes' => $result['recovery_codes'],
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

        $result = mfa_runtime_verify($pdo, $config, $claims, $code, $context);

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
