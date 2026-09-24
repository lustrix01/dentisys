<?php

declare(strict_types=1);

function google_auth_context(): array
{
    return [
        'request_id' => request_id(),
        'ip_address' => request_ip(),
        'user_agent' => request_user_agent(),
        'http_method' => request_method(),
        'endpoint' => request_path(),
    ];
}

function google_auth_error(string $code, string $message, int $status): void
{
    auth_controller_emit(auth_build_no_store_json_response([
        'status' => 'error',
        'code' => $code,
        'message' => $message,
    ], $status));
}

function google_auth_credentials_payload(array $credentials): array
{
    return [
        'type' => 'direct_login',
        'two_factor_required' => false,
        'two_factor_enrolled' => false,
        'access_token' => $credentials['access_token'],
        'user' => ['user_id' => $credentials['session']['user_id']],
    ];
}

function google_auth_mfa_payload(array $challenge): array
{
    return [
        'type' => 'two_factor_required',
        'two_factor_required' => true,
        'two_factor_enrolled' => true,
        'two_factor_challenge_token' => $challenge['two_factor_challenge_token'],
        'expires_in' => $challenge['expires_in'],
    ];
}

function google_auth_check_login_rate_limit(array $config, array $context): void
{
    $rateStorage = ['dir' => $config['rate_limit']['storage_dir']];
    $ipScope = bin2hex(hash('sha256', 'ip:' . $context['ip_address'], true));
    rate_limit_check($rateStorage, $ipScope, 'post_auth_google', 60, 30);
}

function google_auth_verify_login_credential(array $config, array $context, string $credential, ?callable $verifier = null): array
{
    google_auth_check_login_rate_limit($config, $context);
    return google_verify_id_token($config, $credential, $verifier);
}

function google_auth_identity_error_status(string $reason): int
{
    return $reason === 'not_configured' ? 501 : ($reason === 'domain_not_allowed' ? 403 : 401);
}

function google_auth_user_by_subject(PDO $pdo, string $subject): ?array
{
    $stmt = $pdo->prepare(
        'SELECT user_id, login_email, password_hash, role, display_name, status, token_version, google_subject
           FROM user_accounts
          WHERE google_subject = ?
          LIMIT 1'
    );
    $stmt->execute([$subject]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    return $user === false ? null : $user;
}

function google_auth_user_by_email(PDO $pdo, string $email): ?array
{
    $stmt = $pdo->prepare(
        'SELECT user_id, login_email, password_hash, role, display_name, status, token_version, google_subject
           FROM user_accounts
          WHERE login_email = ?
          LIMIT 1'
    );
    $stmt->execute([$email]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    return $user === false ? null : $user;
}

function google_auth_mfa_enabled(PDO $pdo, int $userId): bool
{
    $stmt = $pdo->prepare(
        "SELECT COUNT(*) FROM security_tokens
          WHERE user_id = ? AND purpose = 'mfa_credential'
            AND mfa_status = 'enabled' AND revoked_at IS NULL"
    );
    $stmt->execute([$userId]);
    $count = (int) $stmt->fetchColumn();
    if ($count > 1) {
        throw new TooManyMfaCredentialsException('Multiple enabled authenticator credentials found.');
    }
    return $count === 1;
}

function google_auth_validate_account(PDO $pdo, array $config, array $user): void
{
    if (($user['status'] ?? null) !== 'Active') {
        throw new InactiveAccountException((string) ($user['status'] ?? 'Inactive'));
    }
    if (($user['role'] ?? null) === 'student') {
        auth_assert_student_eligible($pdo, $config, (int) $user['user_id']);
    }
}

function handle_google_login(): void
{
    $context = google_auth_context();
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $body = request_body();
        if (!$body['has_body'] || !isset($body['data']['credential']) || !is_string($body['data']['credential'])) {
            google_auth_error('INVALID_GOOGLE_IDENTITY', 'Invalid Google identity.', 400);
            return;
        }

        $claims = google_auth_verify_login_credential($config, $context, $body['data']['credential']);

        $user = google_auth_user_by_subject($pdo, $claims['sub']);
        if ($user !== null) {
            $pdo->beginTransaction();
            try {
                $locked = auth_lock_user_for_session($pdo, (int) $user['user_id']);
                google_auth_validate_account($pdo, $config, $locked);
                if (google_auth_mfa_enabled($pdo, (int) $locked['user_id'])) {
                    $pdo->commit();
                    $challenge = auth_issue_two_factor_challenge($config, $locked, 'google');
                    auth_controller_emit(auth_build_no_store_json_response(google_auth_mfa_payload($challenge), 200));
                    return;
                }
                $credentials = auth_issue_credentials($pdo, $locked, $config, $context, 'google');
                google_auth_audit($pdo, $config, $context, 'google_login_success', 'Success', (int) $locked['user_id'], 'Google Sign-In completed.');
                $pdo->commit();
            } catch (Throwable $e) {
                if ($pdo->inTransaction()) { $pdo->rollBack(); }
                throw $e;
            }

            $response = auth_build_no_store_json_response(google_auth_credentials_payload($credentials), 200);
            $response['headers'] = array_merge($response['headers'], build_refresh_cookie_header(
                $credentials['refresh_token'],
                $credentials['cookie_ttl'],
                request_is_https($config, $_SERVER)
            ));
            auth_controller_emit($response);
            return;
        }

        $matching = google_auth_user_by_email($pdo, $claims['email']);
        if ($matching === null) {
            google_auth_audit($pdo, $config, $context, 'google_login_denied', 'Failed', null, 'No existing DentiSys account matched the verified Google identity.');
            google_auth_error('NO_EXISTING_ACCOUNT', 'No existing DentiSys account was found.', 404);
            return;
        }
        if (!empty($matching['google_subject'])) {
            google_auth_error('GOOGLE_LINK_CONFLICT', 'This DentiSys account is linked to another Google identity.', 409);
            return;
        }

        $challenge = google_issue_link_challenge($config, $matching, $claims['sub']);
        google_auth_audit($pdo, $config, $context, 'google_link_required', 'Success', (int) $matching['user_id'], 'Google identity requires explicit account linking.');
        auth_controller_emit(auth_build_no_store_json_response([
            'type' => 'account_link_required',
            'account_link_required' => true,
            'email' => $claims['email'],
            'link_challenge_token' => $challenge['token'],
            'expires_in' => $challenge['expires_in'],
        ], 200));
    } catch (GoogleIdentityException $e) {
        if (isset($pdo) && $pdo instanceof PDO) {
            google_auth_audit($pdo, $config, $context, 'google_login_denied', 'Failed', null, $e->getMessage());
        }
        google_auth_error(
            strtoupper($e->reason() === 'domain_not_allowed' ? 'GOOGLE_DOMAIN_NOT_ALLOWED' : ($e->reason() === 'not_configured' ? 'GOOGLE_NOT_CONFIGURED' : 'INVALID_GOOGLE_IDENTITY')),
            $e->getMessage(),
            google_auth_identity_error_status($e->reason())
        );
    } catch (InactiveAccountException $e) {
        google_auth_error('ACCOUNT_INACTIVE', 'This account is not active.', 403);
    } catch (TooManyMfaCredentialsException $e) {
        google_auth_error('AUTHENTICATION_ERROR', 'Authentication could not be completed.', 500);
    } catch (RateLimitException $e) {
        google_auth_error('RATE_LIMITED', 'Too many attempts.', 429);
    } catch (ValidationException $e) {
        google_auth_error('INVALID_GOOGLE_IDENTITY', 'Invalid Google identity.', 401);
    } catch (Throwable $e) {
        error_log('Google login error [' . ($context['request_id'] ?? '?') . ']: ' . sanitize_for_log($e));
        google_auth_error('AUTHENTICATION_ERROR', 'Authentication could not be completed.', 500);
    }
}

function handle_google_link(): void
{
    $context = google_auth_context();
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $token = auth_extract_bearer_token(request_header('Authorization') ?? '');
        $jwtKey = config_key_bytes_at_least($config['jwt']['signing_key_b64'], 32, 'JWT_SIGNING_KEY');
        $claims = jwt_decode($token, $jwtKey, 'google_link_challenge');
        $body = request_body();
        if (!$body['has_body']) {
            google_auth_error('PASSWORD_REQUIRED', 'Password confirmation is required.', 400);
            return;
        }
        $password = extract_password($body['data'], 'password');
        $rateStorage = ['dir' => $config['rate_limit']['storage_dir']];
        $ipScope = bin2hex(hash('sha256', 'ip:' . $context['ip_address'], true));
        rate_limit_check($rateStorage, $ipScope, 'post_auth_google_link', 60, 30);
        challenge_state_attempt($rateStorage, (string) $claims['jti'], 'google_link_challenge', 'complete_link');

        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare(
                'SELECT user_id, login_email, password_hash, role, display_name, status, token_version, google_subject
                   FROM user_accounts WHERE user_id = ? FOR UPDATE'
            );
            $stmt->execute([(int) $claims['sub']]);
            $user = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($user === false || (int) $user['token_version'] !== (int) ($claims['token_version'] ?? -1)) {
                throw new AuthException('Invalid link challenge.');
            }
            google_auth_validate_account($pdo, $config, $user);
            if (!password_verify($password, (string) $user['password_hash'])) {
                throw new InvalidCredentialsException('Invalid ownership password.');
            }
            if (!empty($user['google_subject'])) {
                throw new GoogleIdentityException('This DentiSys account is linked to another Google identity.', 'link_conflict');
            }

            challenge_state_consume($rateStorage, (string) $claims['jti'], 'google_link_challenge', 'complete_link');
            if (google_auth_mfa_enabled($pdo, (int) $user['user_id'])) {
                $challenge = auth_issue_two_factor_challenge($config, $user, 'google', (string) $claims['pending_google_subject']);
                $pdo->commit();
                auth_controller_emit(auth_build_no_store_json_response(google_auth_mfa_payload($challenge), 200));
                return;
            }

            $credentials = auth_issue_credentials($pdo, $user, $config, $context, 'google', (string) $claims['pending_google_subject']);
            google_auth_audit($pdo, $config, $context, 'google_link_success', 'Success', (int) $user['user_id'], 'Google identity linked after password confirmation.');
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) { $pdo->rollBack(); }
            throw $e;
        }

        $response = auth_build_no_store_json_response(google_auth_credentials_payload($credentials), 200);
        $response['headers'] = array_merge($response['headers'], build_refresh_cookie_header(
            $credentials['refresh_token'],
            $credentials['cookie_ttl'],
            request_is_https($config, $_SERVER)
        ));
        auth_controller_emit($response);
    } catch (GoogleIdentityException $e) {
        google_auth_error('GOOGLE_LINK_CONFLICT', $e->getMessage(), 409);
    } catch (InvalidCredentialsException $e) {
        if (isset($pdo) && $pdo instanceof PDO) {
            google_auth_audit($pdo, $config, $context, 'google_link_denied', 'Failed', isset($claims['sub']) ? (int) $claims['sub'] : null, 'Incorrect ownership password.');
        }
        google_auth_error('GOOGLE_LINK_PASSWORD_INVALID', 'Incorrect ownership password.', 401);
    } catch (InactiveAccountException $e) {
        google_auth_error('ACCOUNT_INACTIVE', 'This account is not active.', 403);
    } catch (RateLimitException $e) {
        google_auth_error('RATE_LIMITED', 'Too many attempts.', 429);
    } catch (ChallengeException | AuthException | RuntimeException $e) {
        $expired = str_contains(strtolower($e->getMessage()), 'expired');
        google_auth_error(
            $expired ? 'GOOGLE_LINK_CHALLENGE_EXPIRED' : 'INVALID_LINK_CHALLENGE',
            $expired ? 'The Google linking session expired. Choose Google again and retry.' : 'The Google linking session is invalid.',
            401
        );
    } catch (Throwable $e) {
        error_log('Google link error [' . ($context['request_id'] ?? '?') . ']: ' . sanitize_for_log($e));
        google_auth_error('AUTHENTICATION_ERROR', 'Authentication could not be completed.', 500);
    }
}

function google_auth_profile_link_audit_failure(
    ?PDO $pdo,
    array $config,
    array $context,
    ?int $userId,
    string $description
): void {
    if (!$pdo instanceof PDO) {
        return;
    }
    google_auth_audit($pdo, $config, $context, 'google_profile_link_denied', 'Failed', $userId, $description);
}

/**
 * Link Google from an already authenticated Profile Settings session.
 *
 * The authenticated session identifies the DentiSys account. The verified
 * Google email must match that account exactly (case-insensitively), and the
 * existing DentiSys password remains an explicit ownership proof. If TOTP is
 * enabled, the existing MFA challenge completes the binding through the same
 * path used by Google login.
 */
function handle_google_profile_link(): void
{
    $context = google_auth_context();
    $pdo = null;
    $config = [];
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authContext = auth_authenticated_context($pdo, $config);
        $body = request_body();
        if (!$body['has_body']
            || !isset($body['data']['credential'])
            || !is_string($body['data']['credential'])
            || trim($body['data']['credential']) === '') {
            google_auth_profile_link_audit_failure($pdo, $config, $context, (int) ($authContext['user_id'] ?? 0), 'Invalid Google identity payload.');
            google_auth_error('INVALID_GOOGLE_IDENTITY', 'Invalid Google identity.', 400);
            return;
        }

        $credential = trim($body['data']['credential']);
        $password = extract_password($body['data'], 'password');
        $claims = google_auth_verify_login_credential($config, $context, $credential);

        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare(
                'SELECT user_id, login_email, password_hash, role, display_name, status, token_version, google_subject
                   FROM user_accounts WHERE user_id = ? FOR UPDATE'
            );
            $stmt->execute([(int) $authContext['user_id']]);
            $user = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($user === false || (int) $user['token_version'] !== (int) ($authContext['token_version'] ?? -1)) {
                throw new AuthException('Authentication required.');
            }

            google_auth_validate_account($pdo, $config, $user);

            if (strcasecmp((string) $user['login_email'], (string) $claims['email']) !== 0) {
                throw new GoogleIdentityException(
                    'The Google account must use the same institutional email as this DentiSys account.',
                    'email_mismatch'
                );
            }

            if (!empty($user['google_subject'])) {
                if (hash_equals((string) $user['google_subject'], (string) $claims['sub'])) {
                    $pdo->commit();
                    auth_controller_emit(auth_build_no_store_json_response([
                        'type' => 'google_linked',
                        'status' => 'ok',
                        'linked' => true,
                    ], 200));
                    return;
                }
                throw new GoogleIdentityException(
                    'This DentiSys account is linked to another Google identity.',
                    'link_conflict'
                );
            }

            $subjectOwner = $pdo->prepare(
                'SELECT user_id FROM user_accounts WHERE google_subject = ? AND user_id <> ? FOR UPDATE'
            );
            $subjectOwner->execute([(string) $claims['sub'], (int) $user['user_id']]);
            if ($subjectOwner->fetchColumn() !== false) {
                throw new GoogleIdentityException(
                    'This Google identity is already linked to another DentiSys account.',
                    'link_conflict'
                );
            }

            if (!password_verify($password, (string) $user['password_hash'])) {
                throw new InvalidCredentialsException('Invalid ownership password.');
            }

            if (google_auth_mfa_enabled($pdo, (int) $user['user_id'])) {
                $challenge = auth_issue_two_factor_challenge(
                    $config,
                    $user,
                    'google',
                    (string) $claims['sub']
                );
                $pdo->commit();
                auth_controller_emit(auth_build_no_store_json_response([
                    'type' => 'two_factor_required',
                    'two_factor_required' => true,
                    'two_factor_enrolled' => true,
                    'two_factor_challenge_token' => $challenge['two_factor_challenge_token'],
                    'expires_in' => $challenge['expires_in'],
                ], 200));
                return;
            }

            $bind = $pdo->prepare(
                'UPDATE user_accounts SET google_subject = ? WHERE user_id = ? AND google_subject IS NULL'
            );
            $bind->execute([(string) $claims['sub'], (int) $user['user_id']]);
            if ($bind->rowCount() !== 1) {
                throw new GoogleIdentityException(
                    'This DentiSys account is linked to another Google identity.',
                    'link_conflict'
                );
            }
            google_auth_audit(
                $pdo,
                $config,
                $context,
                'google_profile_link_success',
                'Success',
                (int) $user['user_id'],
                'Google identity linked from Profile Settings after password confirmation.'
            );
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) { $pdo->rollBack(); }
            throw $e;
        }

        auth_controller_emit(auth_build_no_store_json_response([
            'type' => 'google_linked',
            'status' => 'ok',
            'linked' => true,
        ], 200));
    } catch (GoogleIdentityException $e) {
        google_auth_profile_link_audit_failure($pdo, $config, $context, isset($authContext['user_id']) ? (int) $authContext['user_id'] : null, $e->getMessage());
        $code = match ($e->reason()) {
            'email_mismatch' => 'GOOGLE_EMAIL_MISMATCH',
            'link_conflict' => 'GOOGLE_LINK_CONFLICT',
            'not_configured' => 'GOOGLE_NOT_CONFIGURED',
            'domain_not_allowed' => 'GOOGLE_DOMAIN_NOT_ALLOWED',
            default => 'INVALID_GOOGLE_IDENTITY',
        };
        $status = google_auth_identity_error_status($e->reason());
        if ($e->reason() === 'email_mismatch' || $e->reason() === 'link_conflict') {
            $status = 409;
        }
        google_auth_error($code, $e->getMessage(), $status);
    } catch (InvalidCredentialsException $e) {
        google_auth_profile_link_audit_failure($pdo, $config, $context, isset($authContext['user_id']) ? (int) $authContext['user_id'] : null, 'Incorrect ownership password.');
        google_auth_error('GOOGLE_LINK_PASSWORD_INVALID', 'Incorrect ownership password.', 401);
    } catch (AuthException | ChallengeException $e) {
        google_auth_profile_link_audit_failure($pdo, $config, $context, isset($authContext['user_id']) ? (int) $authContext['user_id'] : null, 'Authenticated profile session was invalid or expired.');
        google_auth_error('AUTHENTICATION_REQUIRED', 'Your session has expired. Please log in again.', 401);
    } catch (InactiveAccountException $e) {
        google_auth_profile_link_audit_failure($pdo, $config, $context, isset($authContext['user_id']) ? (int) $authContext['user_id'] : null, 'Account is inactive.');
        google_auth_error('ACCOUNT_INACTIVE', 'This account is not active.', 403);
    } catch (TooManyMfaCredentialsException $e) {
        google_auth_profile_link_audit_failure($pdo, $config, $context, isset($authContext['user_id']) ? (int) $authContext['user_id'] : null, 'Multiple enabled authenticator credentials found.');
        google_auth_error('AUTHENTICATION_ERROR', 'Authentication could not be completed.', 500);
    } catch (RateLimitException $e) {
        google_auth_profile_link_audit_failure($pdo, $config, $context, isset($authContext['user_id']) ? (int) $authContext['user_id'] : null, 'Google linking rate limit exceeded.');
        google_auth_error('RATE_LIMITED', 'Too many attempts.', 429);
    } catch (ValidationException $e) {
        google_auth_profile_link_audit_failure($pdo, $config, $context, isset($authContext['user_id']) ? (int) $authContext['user_id'] : null, 'Invalid Google identity payload.');
        google_auth_error('INVALID_GOOGLE_IDENTITY', 'Invalid Google identity.', 401);
    } catch (Throwable $e) {
        google_auth_profile_link_audit_failure($pdo, $config, $context, isset($authContext['user_id']) ? (int) $authContext['user_id'] : null, 'Google profile linking failed.');
        error_log('Google profile link error [' . ($context['request_id'] ?? '?') . ']: ' . sanitize_for_log($e));
        google_auth_error('AUTHENTICATION_ERROR', 'Authentication could not be completed.', 500);
    }
}

function handle_google_link_status(): void
{
    $context = google_auth_context();
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authContext = auth_authenticated_context($pdo, $config);
        $stmt = $pdo->prepare('SELECT google_subject FROM user_accounts WHERE user_id = ? LIMIT 1');
        $stmt->execute([(int) $authContext['user_id']]);
        $subject = $stmt->fetchColumn();
        auth_controller_emit(auth_build_no_store_json_response([
            'status' => 'ok',
            'linked' => is_string($subject) && $subject !== '',
        ], 200));
    } catch (AuthException | ChallengeException $e) {
        google_auth_error('AUTHENTICATION_REQUIRED', 'Your session has expired. Please log in again.', 401);
    } catch (Throwable $e) {
        error_log('Google link status error [' . ($context['request_id'] ?? '?') . ']: ' . sanitize_for_log($e));
        google_auth_error('AUTHENTICATION_ERROR', 'Authentication could not be completed.', 500);
    }
}

