<?php

declare(strict_types=1);

class InvalidCredentialsException extends \RuntimeException {}
class InactiveAccountException extends \RuntimeException
{
    public string $accountStatus;
    public function __construct(string $status, string $message = '')
    {
        $this->accountStatus = $status;
        parent::__construct($message ?: "Account status: $status", 403);
    }
}
class ChallengeException extends \RuntimeException {}
class MfaException extends \RuntimeException {}
class TooManyMfaCredentialsException extends \RuntimeException {}

function auth_get_dummy_hash(): string
{
    return '$2y$10$ZV3xQpmo43E.uXWEYmBKMOLs9VDb788jSmhdX3AUCm3.bZ8G2DH/O';
}

function extract_password(array $data, string $field): string
{
    if (!array_key_exists($field, $data)) {
        throw new InvalidCredentialsException('Password is required.');
    }

    $value = $data[$field];

    if (!is_string($value)) {
        throw new InvalidCredentialsException('Password must be a string.');
    }

    if (!mb_check_encoding($value, 'UTF-8')) {
        throw new InvalidCredentialsException('Password contains invalid encoding.');
    }

    reject_control_chars_no_trim($value, $field);

    $len = strlen($value);

    if ($len < 1) {
        throw new InvalidCredentialsException('Password is required.');
    }

    if ($len > 128) {
        throw new InvalidCredentialsException('Password is too long.');
    }

    return $value;
}

function reject_control_chars_no_trim(string $value, string $field): void
{
    $len = strlen($value);

    for ($i = 0; $i < $len; $i++) {
        $byte = ord($value[$i]);

        if ($byte < 0x20 && $byte !== 0x09 && $byte !== 0x0A) {
            throw new InvalidCredentialsException('Password contains invalid characters.');
        }

        if ($byte === 0x7F) {
            throw new InvalidCredentialsException('Password contains invalid characters.');
        }
    }
}

function auth_runtime_login(PDO $pdo, array $config, array $body, array $context): array
{
    $email = validate_email($body['email']);
    $password = extract_password($body, 'password');

    $rateStorage = [
        'dir' => $config['rate_limit']['storage_dir'],
    ];
    $ipScope = bin2hex(hash('sha256', 'ip:' . $context['ip_address'], true));
    rate_limit_check($rateStorage, $ipScope, 'post_auth_login', 900, 5);

    $stmt = $pdo->prepare(
        "SELECT user_id, login_email, password_hash, role, display_name, status, token_version
         FROM user_accounts WHERE login_email = ?"
    );
    $stmt->execute([$email]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($user === false) {
        password_verify($password, auth_get_dummy_hash());
        throw new InvalidCredentialsException('Invalid credentials.');
    }

    if (!password_verify($password, $user['password_hash'])) {
        throw new InvalidCredentialsException('Invalid credentials.');
    }

    if ($user['status'] !== 'Active') {
        throw new InactiveAccountException($user['status']);
    }

    $stmt = $pdo->prepare(
        "SELECT COUNT(*) FROM security_tokens
         WHERE user_id = ? AND purpose = 'mfa_credential' AND mfa_status = 'enabled'"
    );
    $stmt->execute([$user['user_id']]);
    $enabledCount = (int) $stmt->fetchColumn();

    $jwtKey = config_key_bytes_at_least($config['jwt']['signing_key_b64'], 32, 'JWT_SIGNING_KEY');
    $now = time();
    $jti = jwt_generate_jti();

    $challengeStorage = [
        'dir' => $config['rate_limit']['storage_dir'],
    ];

    if (filter_var($config['mfa']['required'] ?? true, FILTER_VALIDATE_BOOLEAN) === false) {
        $wasInTx = $pdo->inTransaction();
        if (!$wasInTx) { $pdo->beginTransaction(); }
        try {
            $credentials = auth_issue_credentials($pdo, $user, $config, $context);
            if (!$wasInTx) { $pdo->commit(); }
            return [
                'type' => 'direct_login',
                'credentials' => $credentials,
                'user' => $user,
            ];
        } catch (\Throwable $e) {
            if (!$wasInTx && $pdo->inTransaction()) { $pdo->rollBack(); }
            throw $e;
        }
    }

    if ($enabledCount === 0) {
        $enrollmentToken = jwt_encode([
            'sub' => (int) $user['user_id'],
            'jti' => $jti,
            'token_type' => 'mfa_enrollment',
            'token_version' => (int) $user['token_version'],
            'enrollment_stage' => 'start',
            'iat' => $now,
            'exp' => $now + 300,
        ], $jwtKey);
        challenge_state_init($challengeStorage, $jti, 'mfa_enrollment', 'enrollment_start', 5, 300);

        return [
            'type' => 'enrollment_start',
            'enrollment_token' => $enrollmentToken,
            'user' => $user,
        ];
    }

    if ($enabledCount === 1) {
        $challengeToken = jwt_encode([
            'sub' => (int) $user['user_id'],
            'jti' => $jti,
            'token_type' => 'mfa_challenge',
            'token_version' => (int) $user['token_version'],
            'iat' => $now,
            'exp' => $now + 300,
        ], $jwtKey);
        challenge_state_init($challengeStorage, $jti, 'mfa_challenge', 'complete_login', 5, 300);

        return [
            'type' => 'mfa_challenge',
            'mfa_session_token' => $challengeToken,
            'user' => $user,
        ];
    }

    throw new TooManyMfaCredentialsException('Multiple MFA credentials found. Contact support.');
}

function auth_runtime_me(PDO $pdo, array $config, array $context): array
{
    $authHeader = $context['auth_header'] ?? '';

    if ($authHeader === '') {
        throw new ChallengeException('Authorization header required.');
    }

    $token = auth_extract_bearer_token($authHeader);
    $jwtKey = config_key_bytes_at_least($config['jwt']['signing_key_b64'], 32, 'JWT_SIGNING_KEY');
    $authContext = auth_verify_access_token($pdo, $token, $jwtKey);

    return [
        'user_id' => $authContext['user_id'],
        'login_email' => $authContext['login_email'],
        'role' => $authContext['role'],
        'display_name' => $authContext['display_name'],
        'session_uuid' => $authContext['session_uuid'],
    ];
}

function auth_controller_emit(array $response): void
{
    $GLOBALS['_STAGE2B1B1_EMIT_COUNT'] = ($GLOBALS['_STAGE2B1B1_EMIT_COUNT'] ?? 0) + 1;
    $GLOBALS['_STAGE2B1B1_LAST_RESPONSE'] = $response;
    emit_response($response);
}

function auth_build_no_store_message_response(string $message, int $statusCode): array
{
    $response = build_error_response($message, $statusCode);
    $response['headers'] = array_merge(
        $response['headers'],
        build_no_store_headers()
    );
    return $response;
}

function auth_build_no_store_json_response(array $payload, int $statusCode): array
{
    $response = build_json_response($payload, $statusCode);
    $response['headers'] = array_merge(
        $response['headers'],
        build_no_store_headers()
    );
    return $response;
}

function auth_audit_denial(PDO $pdo, array $config, array $context, string $actionCode, string $description): void
{
    try {
        $macKey = config_key_bytes_at_least($config['audit']['mac_key_b64'], 32, 'AUDIT_MAC_KEY');

        $pdo->beginTransaction();
        try {
            $auditCtx = audit_begin_operation($pdo);
            audit_finish_operation($pdo, $auditCtx, [
                'module_code' => 'auth',
                'action_code' => $actionCode,
                'event_status' => 'Failed',
                'actor_user_id' => null,
                'actor_username' => null,
                'actor_role' => null,
                'actor_display_name' => null,
                'session_id' => null,
                'target_type' => null,
                'target_id' => null,
                'description' => $description,
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
    } catch (\Throwable $e) {
        error_log(sprintf(
            'Denial audit skipped [%s] [%s]: %s',
            $context['request_id'] ?? '?',
            $actionCode,
            $e->getMessage()
        ));
    }
}

const REFRESH_TOKEN_LENGTH = 43;
const REFRESH_TOKEN_PATTERN = '/^[A-Za-z0-9_-]{43}$/';

function auth_runtime_apply_reuse(
    PDO $pdo,
    array $auditCtx,
    array $tokenRow,
    array $sessionRow,
    array $lockedUser,
    array $context,
    string $macKey
): void {
    $now = new DateTimeImmutable('now', new DateTimeZone('UTC'));
    auth_revoke_session($pdo, $sessionRow['session_id'], 'Refresh token reuse detected', $now);
    audit_finish_operation($pdo, $auditCtx, [
        'module_code' => 'auth',
        'action_code' => 'refresh_reuse_detected',
        'event_status' => 'Warning',
        'actor_user_id' => $lockedUser['user_id'],
        'actor_username' => $lockedUser['login_email'],
        'actor_role' => $lockedUser['role'],
        'actor_display_name' => $lockedUser['display_name'],
        'session_id' => $sessionRow['session_id'],
        'target_type' => 'session',
        'target_id' => (string) $sessionRow['session_id'],
        'description' => 'Previously consumed refresh token presented. Session revoked.',
        'reason' => 'Refresh token reuse detected',
        'http_method' => $context['http_method'],
        'endpoint' => $context['endpoint'],
        'request_id' => $context['request_id'],
        'ip_address' => $context['ip_address'],
        'user_agent' => $context['user_agent'],
    ], $macKey);
}

function auth_runtime_refresh(PDO $pdo, array $config, array $context, string $refreshCookie): array
{
    $digest = hash('sha256', $refreshCookie, true);

    $stmt = $pdo->prepare(
        "SELECT * FROM security_tokens
         WHERE token_digest = ? AND purpose = 'refresh'
         LIMIT 1"
    );
    $stmt->execute([$digest]);
    $tokenRow = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($tokenRow === false) {
        throw new ChallengeException('Authentication required.');
    }

    $macKey = config_key_bytes_at_least($config['audit']['mac_key_b64'], 32, 'AUDIT_MAC_KEY');
    $jwtKey = config_key_bytes_at_least($config['jwt']['signing_key_b64'], 32, 'JWT_SIGNING_KEY');
    $rateStorage = ['dir' => $config['rate_limit']['storage_dir']];

    $pdo->beginTransaction();
    try {
        $auditCtx = audit_begin_operation($pdo);

        $stmtLock = $pdo->prepare(
            "SELECT * FROM security_tokens
             WHERE token_id = ? AND purpose = 'refresh'
             FOR UPDATE"
        );
        $stmtLock->execute([$tokenRow['token_id']]);
        $lockedToken = $stmtLock->fetch(PDO::FETCH_ASSOC);

        $stmtSess = $pdo->prepare(
            "SELECT * FROM auth_sessions WHERE session_id = ? FOR UPDATE"
        );
        $stmtSess->execute([$lockedToken['session_id']]);
        $sessionRow = $stmtSess->fetch(PDO::FETCH_ASSOC);

        if ($sessionRow === false) {
            throw new ChallengeException('Authentication required.');
        }

        $lockedUser = auth_lock_user_for_session($pdo, $sessionRow['user_id']);

        $sessionScope = bin2hex(hash('sha256', 'session:' . $sessionRow['session_uuid'], true));
        rate_limit_check($rateStorage, $sessionScope, 'post_auth_refresh', 60, 5);

        $sessionExpiresAt = new DateTimeImmutable($sessionRow['expires_at'], new DateTimeZone('UTC'));
        $nowUtc = new DateTimeImmutable('now', new DateTimeZone('UTC'));

        if ($sessionExpiresAt <= $nowUtc) {
            throw new ChallengeException('Authentication required.');
        }

        if ($sessionRow['revoked_at'] !== null) {
            throw new ChallengeException('Authentication required.');
        }

        if ($lockedUser['status'] !== 'Active') {
            throw new ChallengeException('Authentication required.');
        }

        if ((int) $sessionRow['issued_token_version'] !== (int) $lockedUser['token_version']) {
            throw new ChallengeException('Authentication required.');
        }

        if ((int) $lockedToken['user_id'] !== (int) $sessionRow['user_id']) {
            throw new ChallengeException('Authentication required.');
        }

        if ((int) $lockedToken['session_id'] !== (int) $sessionRow['session_id']) {
            throw new ChallengeException('Authentication required.');
        }

        if ($lockedToken['family_uuid'] === null || $lockedToken['family_uuid'] === '') {
            throw new ChallengeException('Authentication required.');
        }

        if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $lockedToken['family_uuid'])) {
            throw new ChallengeException('Authentication required.');
        }

        if ($lockedToken['used_at'] !== null) {
            if ($sessionRow['revoked_at'] === null) {
                auth_runtime_apply_reuse($pdo, $auditCtx, $lockedToken, $sessionRow, $lockedUser, $context, $macKey);
                $pdo->commit();
                return ['type' => 'reuse'];
            }
            throw new ChallengeException('Authentication required.');
        }

        $parentExpiry = new DateTimeImmutable($lockedToken['expires_at'], new DateTimeZone('UTC'));

        if ($parentExpiry <= $nowUtc) {
            throw new ChallengeException('Authentication required.');
        }

        if ($lockedToken['revoked_at'] !== null) {
            throw new ChallengeException('Authentication required.');
        }

        $childExpiry = $parentExpiry < $sessionExpiresAt ? $parentExpiry : $sessionExpiresAt;

        if ($childExpiry <= $nowUtc) {
            throw new AuthException('Child refresh token would be immediately expired.');
        }

        $upd = $pdo->prepare(
            "UPDATE security_tokens SET used_at = ? WHERE token_id = ? AND used_at IS NULL"
        );
        $nowSql = $nowUtc->format('Y-m-d H:i:s.u');
        $upd->execute([$nowSql, $lockedToken['token_id']]);

        if ($upd->rowCount() !== 1) {
            throw new AuthException('Failed to mark token consumed.');
        }

        $rawBytes = random_bytes(32);
        $childRawToken = base64url_encode($rawBytes);
        $childDigest = hash('sha256', $childRawToken, true);
        $childExpiresSql = $childExpiry->format('Y-m-d H:i:s.u');

        $stmtIns = $pdo->prepare(
            "INSERT INTO security_tokens
             (purpose, user_id, session_id, token_digest, family_uuid, parent_token_id, issued_at, expires_at)
             VALUES ('refresh', ?, ?, ?, ?, ?, ?, ?)"
        );
        $stmtIns->execute([
            $lockedToken['user_id'],
            $lockedToken['session_id'],
            $childDigest,
            $lockedToken['family_uuid'],
            $lockedToken['token_id'],
            $nowSql,
            $childExpiresSql,
        ]);
        $childTokenId = (int) $pdo->lastInsertId();

        $accessResult = auth_issue_access_token($lockedUser, $sessionRow, $jwtKey, 900);

        $childExpiryParsed = new DateTimeImmutable($childExpiresSql, new DateTimeZone('UTC'));
        $responseTime = new DateTimeImmutable('now', new DateTimeZone('UTC'));
        $cookieTtl = max(0, $childExpiryParsed->getTimestamp() - $responseTime->getTimestamp());

        audit_finish_operation($pdo, $auditCtx, [
            'module_code' => 'auth',
            'action_code' => 'refresh_rotation',
            'event_status' => 'Success',
            'actor_user_id' => (int) $lockedUser['user_id'],
            'actor_username' => $lockedUser['login_email'],
            'actor_role' => $lockedUser['role'],
            'actor_display_name' => $lockedUser['display_name'],
            'session_id' => (int) $sessionRow['session_id'],
            'target_type' => 'security_token',
            'target_id' => (string) $childTokenId,
            'description' => 'Refresh token rotated.',
            'http_method' => $context['http_method'],
            'endpoint' => $context['endpoint'],
            'request_id' => $context['request_id'],
            'ip_address' => $context['ip_address'],
            'user_agent' => $context['user_agent'],
        ], $macKey);

        $pdo->commit();

        return [
            'type' => 'rotated',
            'access_token' => $accessResult['token'],
            'child_raw_token' => $childRawToken,
            'cookie_ttl' => $cookieTtl,
            'user_id' => (int) $lockedUser['user_id'],
        ];
    } catch (\Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }
}

function auth_runtime_logout(PDO $pdo, array $config, array $context, string $refreshCookie): array
{
    $digest = hash('sha256', $refreshCookie, true);

    $stmt = $pdo->prepare(
        "SELECT * FROM security_tokens
         WHERE token_digest = ? AND purpose = 'refresh'
         LIMIT 1"
    );
    $stmt->execute([$digest]);
    $tokenRow = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($tokenRow === false) {
        return ['type' => 'completed'];
    }

    $macKey = config_key_bytes_at_least($config['audit']['mac_key_b64'], 32, 'AUDIT_MAC_KEY');

    $pdo->beginTransaction();
    try {
        $auditCtx = audit_begin_operation($pdo);

        $stmtLock = $pdo->prepare(
            "SELECT * FROM security_tokens
             WHERE token_id = ? AND purpose = 'refresh'
             FOR UPDATE"
        );
        $stmtLock->execute([$tokenRow['token_id']]);
        $lockedToken = $stmtLock->fetch(PDO::FETCH_ASSOC);

        if ($lockedToken['purpose'] !== 'refresh' || $lockedToken['user_id'] === null || $lockedToken['session_id'] === null) {
            throw new AuthException('Corrupt refresh token row.');
        }

        $stmtSess = $pdo->prepare(
            "SELECT * FROM auth_sessions WHERE session_id = ? FOR UPDATE"
        );
        $stmtSess->execute([$lockedToken['session_id']]);
        $sessionRow = $stmtSess->fetch(PDO::FETCH_ASSOC);

        if ($sessionRow === false) {
            throw new AuthException('Session not found for logout.');
        }

        if ((int) $lockedToken['user_id'] !== (int) $sessionRow['user_id']) {
            throw new AuthException('Token-session user mismatch during logout.');
        }

        $lockedUser = auth_lock_user_for_session($pdo, $sessionRow['user_id']);

        if ($sessionRow['revoked_at'] !== null) {
            $pdo->commit();
            return ['type' => 'completed'];
        }

        $now = new DateTimeImmutable('now', new DateTimeZone('UTC'));
        auth_revoke_session($pdo, $sessionRow['session_id'], 'User logout', $now);

        audit_finish_operation($pdo, $auditCtx, [
            'module_code' => 'auth',
            'action_code' => 'logout',
            'event_status' => 'Success',
            'actor_user_id' => (int) $lockedUser['user_id'],
            'actor_username' => $lockedUser['login_email'],
            'actor_role' => $lockedUser['role'],
            'actor_display_name' => $lockedUser['display_name'],
            'session_id' => (int) $sessionRow['session_id'],
            'target_type' => 'session',
            'target_id' => (string) $sessionRow['session_id'],
            'description' => 'User logged out.',
            'http_method' => $context['http_method'],
            'endpoint' => $context['endpoint'],
            'request_id' => $context['request_id'],
            'ip_address' => $context['ip_address'],
            'user_agent' => $context['user_agent'],
        ], $macKey);

        $pdo->commit();

        return ['type' => 'completed'];
    } catch (\Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }
}

function auth_issue_credentials(PDO $pdo, array $lockedUser, array $config, array $context): array
{
    $now = new DateTimeImmutable('now', new DateTimeZone('UTC'));
    $sessionExpiry = $now->add(new DateInterval('P7D'));
    $refreshExpiry = $sessionExpiry->modify('-1 second');

    $session = auth_create_session(
        $pdo,
        $lockedUser,
        $context['ip_address'],
        $context['user_agent'],
        null,
        $sessionExpiry
    );

    $refreshResult = auth_issue_initial_refresh_token(
        $pdo,
        $session,
        $lockedUser['user_id'],
        $refreshExpiry
    );

    $jwtKey = config_key_bytes_at_least($config['jwt']['signing_key_b64'], 32, 'JWT_SIGNING_KEY');
    $accessResult = auth_issue_access_token(
        $lockedUser,
        $session,
        $jwtKey,
        900
    );

    $refreshExpiryUtc = DateTimeImmutable::createFromFormat(
        'Y-m-d H:i:s.u',
        $refreshResult['expires_at'],
        new DateTimeZone('UTC')
    );
    $responseTime = new DateTimeImmutable('now', new DateTimeZone('UTC'));
    $cookieTtl = max(0, $refreshExpiryUtc->getTimestamp() - $responseTime->getTimestamp());

    return [
        'session' => $session,
        'refresh_token' => $refreshResult['raw_token'],
        'access_token' => $accessResult['token'],
        'access_claims' => $accessResult['claims'],
        'cookie_ttl' => $cookieTtl,
    ];
}
