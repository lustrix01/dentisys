<?php

declare(strict_types=1);

/**
 * "Remember this device" for the 2FA code at sign-in (backlog 9.24, spec AUTH-006).
 * The cookie value is random; only its SHA-256 is stored. A row stops matching when it is revoked, past its
 * fixed 30 days, or when the account's token_version moved on (password change, sign-out everywhere, 2FA reset, ...).
 */

const TRUSTED_DEVICE_COOKIE = 'trusted_device';
const TRUSTED_DEVICE_TTL_SECONDS = 2592000; // 30 days, fixed from creation

const TRUSTED_DEVICE_REASONS = [
    'forgotten' => 'Forget my trusted devices',
    'two_factor_off' => '2FA turned off',
    'two_factor_on' => '2FA turned on',
    'recovery_regenerated' => 'Recovery codes regenerated',
];

function trusted_device_hash(string $token): string
{
    return hash('sha256', $token);
}

function build_trusted_device_cookie_header(string $token, bool $secure): array
{
    return [
        'Set-Cookie: ' . TRUSTED_DEVICE_COOKIE . "=$token; HttpOnly; SameSite=Lax; Path=/api/auth; Max-Age="
            . TRUSTED_DEVICE_TTL_SECONDS . ($secure ? '; Secure' : ''),
    ];
}

function build_trusted_device_clear_header(bool $secure): array
{
    return [
        'Set-Cookie: ' . TRUSTED_DEVICE_COOKIE . '=; HttpOnly; SameSite=Lax; Path=/api/auth; Max-Age=0' . ($secure ? '; Secure' : ''),
    ];
}

/** The request's trusted_device cookie, or null when absent. A malformed value comes back as '' (never matches, gets cleared). */
function trusted_device_request_token(): ?string
{
    if (!isset($_COOKIE[TRUSTED_DEVICE_COOKIE]) || !is_string($_COOKIE[TRUSTED_DEVICE_COOKIE])) {
        return null;
    }
    $value = $_COOKIE[TRUSTED_DEVICE_COOKIE];
    return preg_match('/^[0-9a-f]{64}$/', $value) === 1 ? $value : '';
}

/**
 * Sign-in step: may this request skip the 2FA code for $user (an account with 2FA on)?
 * Returns ['skip' => bool, 'headers' => string[]]; headers clear a cookie that did not match.
 * A match only updates last_used_at; the 30 days are never extended.
 */
function trusted_device_check(PDO $pdo, array $config, array $user): array
{
    $token = trusted_device_request_token();
    if ($token === null) {
        return ['skip' => false, 'headers' => []];
    }
    if ($token !== '') {
        $stmt = $pdo->prepare(
            'SELECT device_id FROM mfa_trusted_devices
              WHERE token_hash = ? AND user_id = ? AND token_version = ?
                AND revoked_at IS NULL AND expires_at > now()'
        );
        $stmt->execute([trusted_device_hash($token), (int) $user['user_id'], (int) $user['token_version']]);
        $deviceId = $stmt->fetchColumn();
        if ($deviceId !== false) {
            $pdo->prepare('UPDATE mfa_trusted_devices SET last_used_at = now() WHERE device_id = ?')->execute([(int) $deviceId]);
            return ['skip' => true, 'headers' => []];
        }
        // The cookie is being cleared, so its row (another account's, expired or stale) can never match again:
        // revoke it so that account's Profile count stops including this browser (one browser remembers one account).
        $pdo->prepare("UPDATE mfa_trusted_devices SET revoked_at = now(), revoked_reason = 'cleared' WHERE token_hash = ? AND revoked_at IS NULL")
            ->execute([trusted_device_hash($token)]);
    }
    return ['skip' => false, 'headers' => build_trusted_device_clear_header(request_is_https($config, $_SERVER))];
}

/**
 * After a successful authenticator code with the box ticked (inside the caller's transaction, after its own audit row):
 * revokes the row this browser's old cookie pointed to, stores a new row and writes the audit row. Returns the cookie value.
 */
function trusted_device_remember(PDO $pdo, array $config, array $locked, array $context): string
{
    $old = trusted_device_request_token();
    if ($old !== null && $old !== '') {
        $pdo->prepare("UPDATE mfa_trusted_devices SET revoked_at = now(), revoked_reason = 'replaced' WHERE token_hash = ? AND revoked_at IS NULL")
            ->execute([trusted_device_hash($old)]);
    }
    $token = bin2hex(random_bytes(32));
    $pdo->prepare(
        "INSERT INTO mfa_trusted_devices (user_id, token_hash, token_version, user_agent, expires_at)
         VALUES (?, ?, ?, ?, now() + interval '" . TRUSTED_DEVICE_TTL_SECONDS . " seconds')"
    )->execute([
        (int) $locked['user_id'],
        trusted_device_hash($token),
        (int) $locked['token_version'],
        mb_substr((string) ($context['user_agent'] ?? ''), 0, 255),
    ]);
    audit_record_action(
        $pdo, $config, $locked, 'mfa', 'trusted_device_remembered', 'user_account', (string) $locked['user_id'],
        'Remembered this device for 30 days.', ['context' => $context]
    );
    return $token;
}

/** Remembered devices that still skip the code: not revoked, not expired, token_version current. */
function trusted_device_active_count(PDO $pdo, int $userId): int
{
    $stmt = $pdo->prepare(
        'SELECT COUNT(*) FROM mfa_trusted_devices d
           JOIN user_accounts u ON u.user_id = d.user_id AND u.token_version = d.token_version
          WHERE d.user_id = ? AND d.revoked_at IS NULL AND d.expires_at > now()'
    );
    $stmt->execute([$userId]);
    return (int) $stmt->fetchColumn();
}

/**
 * Revokes every open row of the account (inside the caller's transaction). $reason is a key of TRUSTED_DEVICE_REASONS.
 * Returns how many were still active; writes one audit row when that is more than 0.
 */
function trusted_device_revoke_all(PDO $pdo, array $config, array $actor, int $userId, string $reason, ?array $context = null): int
{
    $stmt = $pdo->prepare(
        'UPDATE mfa_trusted_devices d SET revoked_at = now(), revoked_reason = ?
          WHERE d.user_id = ? AND d.revoked_at IS NULL
      RETURNING (d.expires_at > now() AND d.token_version = (SELECT u.token_version FROM user_accounts u WHERE u.user_id = d.user_id)) AS active'
    );
    $stmt->execute([$reason, $userId]);
    $count = 0;
    foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $active) {
        if ($active === true || $active === 't' || $active === '1' || $active === 1) {
            $count++;
        }
    }
    if ($count > 0) {
        audit_record_action(
            $pdo, $config, $actor, 'mfa', 'trusted_devices_forgotten', 'user_account', (string) $userId,
            "Forgot {$count} remembered " . ($count === 1 ? 'device.' : 'devices.'),
            ['reason' => TRUSTED_DEVICE_REASONS[$reason] ?? $reason] + ($context !== null ? ['context' => $context] : [])
        );
    }
    return $count;
}
