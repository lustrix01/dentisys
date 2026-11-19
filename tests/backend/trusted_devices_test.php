<?php

declare(strict_types=1);

// Backlog 9.24 / AUTH-006 "Remember this device": the cookie, the match rule and the revocations, on an in-memory
// SQLite copy of the table (the real PostgreSQL behaviour is in tests/database/trusted_devices_integration.php).
// The contract: a device skips the 2FA code only with a valid cookie of the SAME account, not revoked, not expired and
// with the account's current token_version; a bad, expired or other-account cookie is ignored and cleared.

require_once __DIR__ . '/../../backend/app/security.php';
require_once __DIR__ . '/../../backend/app/audit_catalogue.php';

/** Stand-in for backend/app/audit.php (needs the full audit schema); records what the code asked to audit. */
function audit_record_action(PDO $pdo, array $config, array $authCtx, string $moduleCode, string $actionCode, ?string $targetType, ?string $targetId, string $description, array $extra = []): void
{
    $GLOBALS['td_audit'][] = ['module' => $moduleCode, 'code' => $actionCode, 'target' => $targetId, 'description' => $description, 'extra' => $extra];
}

require_once __DIR__ . '/../../backend/app/trusted_devices.php';

function td_ok(bool $condition, string $label): void
{
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$label}\n");
        exit(1);
    }
    echo "PASS: {$label}\n";
}

function td_same(mixed $expected, mixed $actual, string $label): void
{
    if ($expected !== $actual) {
        fwrite(STDERR, "FAIL: {$label}\nExpected: " . var_export($expected, true) . "\nActual: " . var_export($actual, true) . "\n");
        exit(1);
    }
    echo "PASS: {$label}\n";
}

/** SQLite needs AS before a table alias in UPDATE (PostgreSQL does not); only that spelling is rewritten. */
class TdSqlitePdo extends PDO
{
    public function prepare(string $query, array $options = []): PDOStatement|false
    {
        // SQLite also cannot use the alias inside RETURNING.
        if (str_contains($query, 'UPDATE mfa_trusted_devices d SET')) {
            [$head, $tail] = explode(' RETURNING ', $query, 2);
            $query = $head . ' RETURNING ' . preg_replace('/\bd\./', 'mfa_trusted_devices.', $tail);
        }
        return parent::prepare(str_replace('UPDATE mfa_trusted_devices d SET', 'UPDATE mfa_trusted_devices AS d SET', $query), $options);
    }
}

$pdo = new TdSqlitePdo('sqlite::memory:');
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$pdo->sqliteCreateFunction('now', static fn(): string => gmdate('Y-m-d H:i:s'), 0);
$pdo->exec('CREATE TABLE user_accounts (user_id INTEGER PRIMARY KEY, token_version INTEGER NOT NULL)');
$pdo->exec('CREATE TABLE mfa_trusted_devices (
    device_id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, token_hash TEXT NOT NULL UNIQUE, token_version INTEGER NOT NULL,
    user_agent TEXT, created_at TEXT, expires_at TEXT NOT NULL, last_used_at TEXT, revoked_at TEXT, revoked_reason TEXT)');
$pdo->exec('INSERT INTO user_accounts (user_id, token_version) VALUES (1, 0), (2, 0)');

$config = ['app' => ['is_https' => false, 'env' => 'development']];
$httpsConfig = ['app' => ['is_https' => true, 'env' => 'production']];
$future = gmdate('Y-m-d H:i:s', time() + 86400);
$past = gmdate('Y-m-d H:i:s', time() - 60);

$addDevice = static function (int $userId, int $tokenVersion = 0, ?string $expiresAt = null, ?string $revokedAt = null) use ($pdo, $future): string {
    $token = bin2hex(random_bytes(32));
    $pdo->prepare('INSERT INTO mfa_trusted_devices (user_id, token_hash, token_version, expires_at, revoked_at) VALUES (?, ?, ?, ?, ?)')
        ->execute([$userId, hash('sha256', $token), $tokenVersion, $expiresAt ?? $future, $revokedAt]);
    return $token;
};
$row = static function (string $token) use ($pdo): array {
    $stmt = $pdo->prepare('SELECT * FROM mfa_trusted_devices WHERE token_hash = ?');
    $stmt->execute([hash('sha256', $token)]);
    return $stmt->fetch(PDO::FETCH_ASSOC);
};
$check = static function (?string $cookie, array $user, ?array $cfg = null) use ($pdo, $config): array {
    unset($_COOKIE[TRUSTED_DEVICE_COOKIE]);
    if ($cookie !== null) {
        $_COOKIE[TRUSTED_DEVICE_COOKIE] = $cookie;
    }
    return trusted_device_check($pdo, $cfg ?? $config, $user);
};
$user1 = ['user_id' => 1, 'token_version' => 0];
$user2 = ['user_id' => 2, 'token_version' => 0];
$cleared = static fn(array $headers): bool => count($headers) === 1
    && str_starts_with($headers[0], 'Set-Cookie: trusted_device=;') && str_contains($headers[0], 'Max-Age=0');

echo "=== Remember this device: cookie ===\n";

td_same(2592000, TRUSTED_DEVICE_TTL_SECONDS, 'The device is remembered for 30 days (2592000 s)');
$token = str_repeat('ab', 32);
$header = build_trusted_device_cookie_header($token, false)[0];
td_same("Set-Cookie: trusted_device={$token}; HttpOnly; SameSite=Lax; Path=/api/auth; Max-Age=2592000", $header, 'Cookie: HttpOnly, SameSite=Lax, Path=/api/auth, Max-Age 30 days, no Secure over HTTP');
td_same($header . '; Secure', build_trusted_device_cookie_header($token, true)[0], 'Cookie is Secure over HTTPS');
$clear = build_trusted_device_clear_header(false)[0];
td_same('Set-Cookie: trusted_device=; HttpOnly; SameSite=Lax; Path=/api/auth; Max-Age=0', $clear, 'Clearing header: same name and Path, empty value, Max-Age=0');
td_same($clear . '; Secure', build_trusted_device_clear_header(true)[0], 'Clearing header is Secure over HTTPS');
td_same(hash('sha256', 'x'), trusted_device_hash('x'), 'Only the SHA-256 of the cookie value is stored');
td_same(['forgotten', 'two_factor_off', 'two_factor_on', 'recovery_regenerated'], array_keys(TRUSTED_DEVICE_REASONS), 'Each revocation reason has a name');

echo "\n=== Remember this device: sign-in match rule ===\n";

$good = $addDevice(1);
$result = $check($good, $user1);
td_same(true, $result['skip'], 'A valid cookie of the same account skips the code');
td_same([], $result['headers'], 'A matching cookie is not cleared');
$used = $row($good);
td_ok($used['last_used_at'] !== null, 'A match records last_used_at');
td_same($future, $used['expires_at'], 'A match does not extend the 30 days (expires_at unchanged)');

$result = $check(null, $user1);
td_same([false, []], [$result['skip'], $result['headers']], 'No cookie: the code is asked and nothing is cleared');

$result = $check(bin2hex(random_bytes(32)), $user1);
td_same(false, $result['skip'], 'A well-formed cookie that is not in the table does not skip');
td_ok($cleared($result['headers']), 'An unknown cookie is cleared');

foreach (['abc', strtoupper(str_repeat('ab', 32)), str_repeat('a', 63), str_repeat('a', 65), str_repeat('g', 64), $good . "\n"] as $i => $bad) {
    $result = $check($bad, $user1);
    td_same(false, $result['skip'], "Malformed cookie #{$i} does not skip");
    td_ok($cleared($result['headers']), "Malformed cookie #{$i} is cleared");
}

$other = $addDevice(2);
$result = $check($other, $user1);
td_same(false, $result['skip'], "Another account's cookie does not skip");
td_ok($cleared($result['headers']), "Another account's cookie is cleared");
td_same([true, null, 'cleared'], [$row($other)['revoked_at'] !== null, $row($other)['last_used_at'], $row($other)['revoked_reason']], "Presenting another account's cookie revokes its row (the cookie is cleared, so that browser no longer remembers its owner)");
td_same(false, $check($other, $user2)['skip'], "The owner's cleared cookie no longer skips");

$expired = $addDevice(1, 0, $past);
$result = $check($expired, $user1);
td_same(false, $result['skip'], 'An expired row does not skip');
td_ok($cleared($result['headers']), 'An expired cookie is cleared');

$revoked = $addDevice(1, 0, null, $past);
$result = $check($revoked, $user1);
td_same(false, $result['skip'], 'A revoked row does not skip');
td_ok($cleared($result['headers']), 'A revoked cookie is cleared');

$result = $check($good, ['user_id' => 1, 'token_version' => 1]);
td_same(false, $result['skip'], 'A moved token_version (password change, sign-out everywhere, reset, deactivation, email move, Dean handover) stops the skip');
td_ok($cleared($result['headers']), 'A stale-token_version cookie is cleared');
td_same('cleared', $row($good)['revoked_reason'], 'A stale-token_version row is revoked when its cookie is cleared (token_version never goes back)');

$_COOKIE[TRUSTED_DEVICE_COOKIE] = ['x'];
$result = trusted_device_check($pdo, $config, $user1);
td_same(false, $result['skip'], 'A cookie sent as an array never skips');
$result = $check($expired, $user1, $httpsConfig);
td_same('Set-Cookie: trusted_device=; HttpOnly; SameSite=Lax; Path=/api/auth; Max-Age=0; Secure', $result['headers'][0] ?? '', 'The clearing header is Secure on HTTPS');

echo "\n=== Remember this device: count and revocation ===\n";

$pdo->exec('DELETE FROM mfa_trusted_devices');
$pdo->exec('UPDATE user_accounts SET token_version = 3 WHERE user_id = 1');
$a = $addDevice(1, 3);
$b = $addDevice(1, 3);
$addDevice(1, 3, $past);            // expired
$addDevice(1, 3, null, $past);      // revoked
$addDevice(1, 2);                   // older token_version
$c = $addDevice(2, 0);
td_same(2, trusted_device_active_count($pdo, 1), 'Active count: only not-revoked, not-expired rows of the current token_version');
td_same(1, trusted_device_active_count($pdo, 2), 'Active count is per account');
td_same(0, trusted_device_active_count($pdo, 99), 'Active count of an account with none is 0');

$GLOBALS['td_audit'] = [];
$n = trusted_device_revoke_all($pdo, $config, ['user_id' => 1], 1, 'forgotten');
td_same(2, $n, 'Revoke-all returns how many devices were still active');
td_same(0, trusted_device_active_count($pdo, 1), 'After revoke-all no device is active');
td_same('forgotten', $row($a)['revoked_reason'], 'Revoked rows keep the reason');
td_ok($row($a)['revoked_at'] !== null && $row($b)['revoked_at'] !== null, 'Revoked rows get revoked_at');
td_same(false, $check($a, ['user_id' => 1, 'token_version' => 3])['skip'], 'A revoked cookie no longer skips');
td_same(1, trusted_device_active_count($pdo, 2), "Revoke-all leaves other accounts' devices alone");
td_same(null, $row($c)['revoked_at'], "Other account's row is not revoked");
td_same(1, count($GLOBALS['td_audit']), 'Revoke-all writes one audit row');
td_same(['mfa', 'trusted_devices_forgotten', '1'], [$GLOBALS['td_audit'][0]['module'], $GLOBALS['td_audit'][0]['code'], $GLOBALS['td_audit'][0]['target']], 'The audit row is mfa / trusted_devices_forgotten for the account');
td_same('Forgot 2 remembered devices.', $GLOBALS['td_audit'][0]['description'], 'The audit row says how many devices were forgotten');
td_same('Forget my trusted devices', $GLOBALS['td_audit'][0]['extra']['reason'] ?? null, 'The audit row carries the reason');

$GLOBALS['td_audit'] = [];
td_same(0, trusted_device_revoke_all($pdo, $config, ['user_id' => 1], 1, 'forgotten'), 'Revoke-all with nothing active returns 0');
td_same([], $GLOBALS['td_audit'], 'Revoke-all with nothing active writes no audit row');

foreach (['two_factor_off' => '2FA turned off', 'two_factor_on' => '2FA turned on', 'recovery_regenerated' => 'Recovery codes regenerated'] as $reason => $label) {
    $t = $addDevice(2, 0);
    $GLOBALS['td_audit'] = [];
    td_ok(trusted_device_revoke_all($pdo, $config, ['user_id' => 2], 2, $reason) >= 1, "Revoke-all for {$reason} counts the device");
    td_same($reason, $row($t)['revoked_reason'], "{$reason}: reason stored");
    td_same($label, $GLOBALS['td_audit'][0]['extra']['reason'] ?? null, "{$reason}: audit reason reads \"{$label}\"");
    td_same(false, $check($t, $user2)['skip'], "{$reason}: the device no longer skips");
}
$GLOBALS['td_audit'] = [];
$addDevice(2, 0);
td_same(1, trusted_device_revoke_all($pdo, $config, ['user_id' => 2], 2, 'forgotten'), 'Singular count');
td_same('Forgot 1 remembered device.', $GLOBALS['td_audit'][0]['description'] ?? null, 'The audit description is singular for one device');

echo "\n=== Remember this device: audit catalogue ===\n";

$catalogue = audit_catalogue();
td_ok(isset($catalogue['trusted_device_remembered']), 'Audit code trusted_device_remembered exists');
td_ok(isset($catalogue['trusted_devices_forgotten']), 'Audit code trusted_devices_forgotten exists');

echo "\n=== Remember this device: every sign-in path asks the same check ===\n";

// The Google and password sign-ins cannot run here (no database, no Google); the HTTP password path is exercised in
// tests/database/trusted_devices_integration.php. Here: each sign-in entry point that can issue a 2FA challenge calls the check.
$source = static fn(string $file): string => (string) file_get_contents(__DIR__ . '/../../backend/' . $file);
td_ok(str_contains($source('app/auth_runtime.php'), 'trusted_device_check('), 'Password sign-in (auth_runtime_login) asks the trusted-device check');
$google = $source('controllers/GoogleAuthController.php');
td_ok(substr_count($google, 'trusted_device_check(') >= 2, 'Google sign-in and Google link-on-sign-in both ask the trusted-device check');
td_ok(str_contains($source('controllers/MfaController.php'), "'remember_device'"), 'The 2FA verify endpoint reads remember_device');

echo "=== ALL TRUSTED-DEVICE BACKEND TESTS PASSED ===\n";
