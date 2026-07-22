<?php

declare(strict_types=1);

class AuthException extends \RuntimeException
{
}

function auth_lock_user_for_session(PDO $pdo, int $userId): array
{
    if (!$pdo->inTransaction()) {
        throw new AuthException('auth_lock_user_for_session requires an active transaction.');
    }

    $stmt = $pdo->prepare(
        "SELECT user_id, login_email, role, display_name, status, token_version
         FROM user_accounts
         WHERE user_id = ?
         FOR UPDATE"
    );
    $stmt->execute([$userId]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($user === false) {
        throw new AuthException('User not found.');
    }

    return $user;
}

function auth_create_session(
    PDO $pdo,
    array $lockedUser,
    string $ipAddress,
    string $userAgent,
    ?string $deviceId,
    DateTimeImmutable $absoluteExpiry,
    ?callable $clock = null
): array {
    if (!$pdo->inTransaction()) {
        throw new AuthException('auth_create_session requires an active transaction.');
    }

    if (!isset($lockedUser['user_id']) || !isset($lockedUser['role']) || !isset($lockedUser['token_version'])) {
        throw new AuthException('lockedUser must contain user_id, role, and token_version.');
    }

    if (strlen($ipAddress) > 45) {
        throw new AuthException('IP address exceeds 45 characters.');
    }

    $ua = $userAgent;

    if (strlen($ua) > 512) {
        $ua = mb_substr($ua, 0, 512);
    }

    if (!mb_check_encoding($ua, 'UTF-8')) {
        $ua = '';
    }

    if ($deviceId !== null && strlen($deviceId) > 100) {
        throw new AuthException('Device ID exceeds 100 characters.');
    }

    $clock = $clock ?? fn(): DateTimeImmutable => new DateTimeImmutable('now', new DateTimeZone('UTC'));
    $now = $clock();
    $nowSql = $now->format('Y-m-d H:i:s.u');
    $expiresSql = $absoluteExpiry->format('Y-m-d H:i:s.u');

    if ($absoluteExpiry <= $now) {
        throw new AuthException('Session absolute expiry must be later than creation time.');
    }

    $sessionUuid = uuid_v4_string();

    $stmt = $pdo->prepare(
        "INSERT INTO auth_sessions
         (session_uuid, user_id, issued_token_version, ip_address, user_agent, device_id, last_seen_at, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    $stmt->execute([
        $sessionUuid,
        $lockedUser['user_id'],
        $lockedUser['token_version'],
        $ipAddress,
        $ua,
        $deviceId,
        $nowSql,
        $nowSql,
        $expiresSql,
    ]);

    $sessionId = (int) $pdo->lastInsertId();

    return [
        'session_id' => $sessionId,
        'session_uuid' => $sessionUuid,
        'user_id' => $lockedUser['user_id'],
        'issued_token_version' => $lockedUser['token_version'],
        'created_at' => $nowSql,
        'expires_at' => $expiresSql,
    ];
}

function auth_issue_initial_refresh_token(
    PDO $pdo,
    array $session,
    int $userId,
    DateTimeImmutable $expiresAt,
    ?callable $randomBytes = null
): array {
    if (!$pdo->inTransaction()) {
        throw new AuthException('auth_issue_initial_refresh_token requires an active transaction.');
    }

    if (!isset($session['session_id'])) {
        throw new AuthException('Session array must contain session_id.');
    }

    if ($session['user_id'] !== $userId) {
        throw new AuthException('Session user ID does not match supplied user ID.');
    }

    $sessionExpiresAt = isset($session['expires_at']) ? new DateTimeImmutable($session['expires_at'], new DateTimeZone('UTC')) : null;

    if ($sessionExpiresAt !== null && $expiresAt > $sessionExpiresAt) {
        throw new AuthException('Refresh token expiry must not exceed session absolute expiry.');
    }

    $randomBytes = $randomBytes ?? fn(int $len): string => random_bytes($len);
    $rawBytes = $randomBytes(32);
    $rawToken = base64url_encode($rawBytes);
    $digest = hash('sha256', $rawToken, true);
    $familyUuid = uuid_v4_string();
    $expiresSql = $expiresAt->format('Y-m-d H:i:s.u');
    $issuedSql = (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d H:i:s.u');

    $stmt = $pdo->prepare(
        "INSERT INTO security_tokens
         (purpose, user_id, session_id, token_digest, family_uuid, parent_token_id, issued_at, expires_at)
         VALUES ('refresh', ?, ?, ?, ?, NULL, ?, ?)"
    );
    $stmt->execute([
        $userId,
        $session['session_id'],
        $digest,
        $familyUuid,
        $issuedSql,
        $expiresSql,
    ]);

    $tokenId = (int) $pdo->lastInsertId();

    return [
        'raw_token' => $rawToken,
        'token_id' => $tokenId,
        'family_uuid' => $familyUuid,
        'issued_at' => $issuedSql,
        'expires_at' => $expiresSql,
    ];
}

function auth_issue_access_token(
    array $lockedUser,
    array $session,
    string $keyBytes,
    int $ttlSeconds = 900,
    ?callable $clock = null
): array {
    if (strlen($keyBytes) < 32) {
        throw new AuthException('JWT signing key must be at least 32 bytes.');
    }

    if ($ttlSeconds < 1 || $ttlSeconds > 86400) {
        throw new AuthException('TTL must be between 1 and 86400 seconds.');
    }

    $clock = $clock ?? fn(): int => time();
    $now = $clock();

    $jti = jwt_generate_jti();

    $claims = [
        'sub' => $lockedUser['user_id'],
        'role' => $lockedUser['role'],
        'sid' => $session['session_uuid'],
        'jti' => $jti,
        'token_type' => 'access',
        'token_version' => $lockedUser['token_version'],
        'iat' => $now,
        'exp' => $now + $ttlSeconds,
    ];

    $encoded = jwt_encode($claims, $keyBytes);

    return [
        'token' => $encoded,
        'claims' => $claims,
    ];
}

function auth_verify_access_token(
    PDO $pdo,
    string $token,
    string $keyBytes,
    ?callable $clock = null
): array {
    try {
        $claims = jwt_decode($token, $keyBytes, 'access', $clock);
    } catch (\Throwable $e) {
        throw new AuthException('Invalid or expired token.', 0, $e);
    }

    $stmt = $pdo->prepare(
        "SELECT user_id, login_email, role, display_name, status, token_version
         FROM user_accounts WHERE user_id = ?"
    );
    $stmt->execute([$claims['sub']]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($user === false) {
        throw new AuthException('Account not found.');
    }

    if ($user['status'] !== 'Active') {
        throw new AuthException('Account is not active.');
    }

    if ((int) $user['token_version'] !== $claims['token_version']) {
        throw new AuthException('Token version mismatch.');
    }

    if ($user['role'] !== $claims['role']) {
        throw new AuthException('Role mismatch.');
    }

    $stmt = $pdo->prepare(
        "SELECT session_id, session_uuid, user_id, issued_token_version, revoked_at, expires_at
         FROM auth_sessions WHERE session_uuid = ?"
    );
    $stmt->execute([$claims['sid']]);
    $session = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($session === false) {
        throw new AuthException('Session not found.');
    }

    if ((int) $session['issued_token_version'] !== (int) $user['token_version']) {
        throw new AuthException('Session issued token version mismatch.');
    }

    if ((int) $session['user_id'] !== (int) $claims['sub']) {
        throw new AuthException('Session does not belong to the token subject.');
    }

    if ($session['revoked_at'] !== null) {
        throw new AuthException('Session is revoked.');
    }

    $clock = $clock ?? fn(): int => time();
    $sessionExpiresAt = new DateTimeImmutable($session['expires_at']);

    if ($sessionExpiresAt->getTimestamp() <= $clock()) {
        throw new AuthException('Session has expired.');
    }

    $jtiDigest = hash('sha256', $claims['jti'], true);
    $stmt = $pdo->prepare(
        "SELECT 1 FROM security_tokens
         WHERE token_digest = ? AND purpose = 'access_token_blacklist'"
    );
    $stmt->execute([$jtiDigest]);
    $blacklisted = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($blacklisted !== false) {
        throw new AuthException('Token JTI is blacklisted.');
    }

    return [
        'user_id' => (int) $user['user_id'],
        'login_email' => $user['login_email'],
        'role' => $user['role'],
        'display_name' => $user['display_name'],
        'session_id' => (int) $session['session_id'],
        'session_uuid' => $session['session_uuid'],
        'jti' => $claims['jti'],
        'exp' => $claims['exp'],
        'token_version' => (int) $user['token_version'],
    ];
}

function auth_extract_bearer_token(string $header): string
{
    $trimmed = ltrim($header);
    $parts = explode(' ', $trimmed, 2);

    if (count($parts) !== 2) {
        throw new AuthException('Authorization header must use the Bearer scheme.');
    }

    if (strtolower($parts[0]) !== 'bearer') {
        throw new AuthException('Authorization header must use the Bearer scheme.');
    }

    $token = trim($parts[1]);

    if ($token === '') {
        throw new AuthException('Bearer token is empty.');
    }

    return $token;
}

function auth_revoke_session(
    PDO $pdo,
    int $sessionId,
    string $reason,
    DateTimeImmutable $revokedAt
): void {
    if (!$pdo->inTransaction()) {
        throw new AuthException('auth_revoke_session requires an active transaction.');
    }

    $revokedSql = $revokedAt->format('Y-m-d H:i:s.u');

    $stmt = $pdo->prepare(
        "UPDATE auth_sessions
         SET revoked_at = ?, revocation_reason = ?
         WHERE session_id = ?"
    );
    $stmt->execute([$revokedSql, $reason, $sessionId]);

    $stmt2 = $pdo->prepare(
        "UPDATE security_tokens
         SET revoked_at = ?, revocation_reason = ?
         WHERE session_id = ? AND purpose = 'refresh' AND revoked_at IS NULL"
    );
    $stmt2->execute([$revokedSql, $reason, $sessionId]);
}

function auth_invalidate_account(PDO $pdo, int $userId): void
{
    if (!$pdo->inTransaction()) {
        throw new AuthException('auth_invalidate_account requires an active transaction.');
    }

    $stmt = $pdo->prepare(
        "UPDATE user_accounts SET token_version = token_version + 1 WHERE user_id = ?"
    );
    $stmt->execute([$userId]);
}
