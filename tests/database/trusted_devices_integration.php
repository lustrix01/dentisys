<?php

declare(strict_types=1);

// Backlog 9.24 / AUTH-006 "Remember this device" against the real stack: migration 069 and the HTTP behaviour.
// Included by postgres_integration_test.php at the end, so it reuses its $pdo, $config, $createMfaFixture and $superSession.
// Every account it makes is its own (a fresh faculty account with 2FA, or one without), so each TOTP step is used once per account.

$tdTag = strtolower(bin2hex(random_bytes(3)));
$tdPassword = 'GoogleMfaPass1!'; // the password $createMfaFixture sets
$tdNewPassword = 'TrustedNew9#Pass';
$tdDay = 86400;

/** One HTTP call with an optional Cookie header; returns status, decoded JSON, and every Set-Cookie line (name=value; attributes). */
$tdHttp = static function (string $method, string $path, string $token = '', ?array $payload = null, string $cookie = '', string $userAgent = 'Trusted Device Integration Test'): array {
    $headers = "Accept: application/json\r\nContent-Type: application/json\r\nUser-Agent: {$userAgent}\r\n";
    if ($token !== '') {
        $headers .= "Authorization: Bearer {$token}\r\n";
    }
    if ($cookie !== '') {
        $headers .= "Cookie: {$cookie}\r\n";
    }
    $http = ['method' => $method, 'header' => $headers, 'ignore_errors' => true, 'timeout' => 15];
    if ($payload !== null) {
        $http['content'] = json_encode($payload, JSON_THROW_ON_ERROR);
    }
    $raw = @file_get_contents('http://127.0.0.1' . $path, false, stream_context_create(['http' => $http]));
    $status = 0;
    $cookies = [];
    foreach ($http_response_header ?? [] as $line) {
        if ($status === 0 && preg_match('/^HTTP\/\S+\s+(\d{3})/', $line, $m)) {
            $status = (int) $m[1];
        }
        if (stripos($line, 'Set-Cookie:') === 0) {
            $cookies[] = trim(substr($line, strlen('Set-Cookie:')));
        }
    }
    return ['status' => $status, 'json' => is_string($raw) ? (json_decode($raw, true) ?: []) : [], 'cookies' => $cookies];
};
$tdTrustedValue = static function (array $resp): ?string {
    foreach ($resp['cookies'] as $c) {
        if (preg_match('/^trusted_device=([0-9a-f]{64});/', $c, $m)) {
            return $m[1];
        }
    }
    return null;
};
$tdTrustedCleared = static function (array $resp): bool {
    foreach ($resp['cookies'] as $c) {
        if (preg_match('/^trusted_device=;/', $c) && str_contains($c, 'Max-Age=0') && str_contains($c, 'Path=/api/auth')) {
            return true;
        }
    }
    return false;
};
$tdHasCookie = static function (array $resp, string $name): bool {
    foreach ($resp['cookies'] as $c) {
        if (str_starts_with($c, $name . '=') && !str_starts_with($c, $name . '=;')) {
            return true;
        }
    }
    return false;
};
$tdCode = static fn(string $secret, int $offset = 0): string => mfa_compute_totp($secret, intdiv(time(), 30) + $offset)['code'];
$tdCookieHeader = static fn(?string $value): string => $value === null ? '' : 'trusted_device=' . $value;

/** A faculty account with 2FA on (a TOTP secret and one recovery code). */
$tdUser = static function (string $label) use ($pdo, $config, $createMfaFixture, $tdTag): array {
    $email = "td-{$label}-{$tdTag}@bicol-u.edu.ph";
    $fixture = $createMfaFixture($pdo, $config, $email);
    return $fixture + ['email' => $email];
};
/** A faculty account without 2FA. */
$tdPlainUser = static function (string $label) use ($pdo, $tdTag, $tdPassword): array {
    $email = "td-{$label}-{$tdTag}@bicol-u.edu.ph";
    $stmt = $pdo->prepare("INSERT INTO user_accounts (login_email, password_hash, role, display_name, status, created_at)
        VALUES (?, ?, 'faculty', 'Trusted Device Plain User', 'Active', CURRENT_TIMESTAMP(6)) RETURNING user_id");
    $stmt->execute([$email, password_hash($tdPassword, PASSWORD_DEFAULT)]);
    return ['user_id' => (int) $stmt->fetchColumn(), 'email' => $email];
};
// The server allows 100 sign-ins a minute per address (auth_runtime.php), and every sign-in of the whole suite
// comes from 127.0.0.1. This file tests remembered devices, not that limit, so each sign-in here starts it again;
// otherwise a late sign-in was sometimes refused with 429 depending on how fast the suite ran.
$tdLimiterDir = (string) getenv('RATE_LIMIT_STORAGE_DIR');
$tdLimiterScope = bin2hex(hash('sha256', 'ip:127.0.0.1', true));
$tdAtLimit = new ArrayObject([0]); // sign-ins that would have been refused: printed at the end
$tdLogin = static function (string $email, ?string $cookieValue = null, ?string $password = null) use ($tdHttp, $tdCookieHeader, $tdPassword, $tdLimiterDir, $tdLimiterScope, $tdAtLimit): array {
    if ($tdLimiterDir !== '') {
        $path = rate_limit_storage_path(['dir' => $tdLimiterDir], $tdLimiterScope, 'post_auth_login');
        $state = is_file($path) ? json_decode((string) file_get_contents($path), true) : null;
        if (is_array($state) && (($state['count'] ?? 0) >= 100 || ($state['blocked_until'] ?? 0) > time())) {
            $tdAtLimit[0]++;
        }
        rate_limit_clear(['dir' => $tdLimiterDir], $tdLimiterScope, 'post_auth_login');
    }
    return $tdHttp('POST', '/api/auth/login', '', ['email' => $email, 'password' => $password ?? $tdPassword], $tdCookieHeader($cookieValue));
};
$tdVerify = static fn(array $login, string $code, mixed $remember = 'omit', ?string $cookieValue = null, string $userAgent = 'Trusted Device Integration Test') => $tdHttp(
    'POST', '/api/auth/mfa/verify', (string) ($login['json']['two_factor_challenge_token'] ?? ''),
    ['code' => $code] + ($remember === 'omit' ? [] : ['remember_device' => $remember]), $tdCookieHeader($cookieValue), $userAgent
);
/** Password step, then the code step with the box ticked: the browser now holds the cookie. */
$tdRemember = static function (array $user, int $offset = 0, ?string $sendCookie = null) use ($tdLogin, $tdVerify, $tdCode, $tdTrustedValue): array {
    $login = $tdLogin($user['email']);
    $verify = $tdVerify($login, $tdCode($user['secret'], $offset), true, $sendCookie);
    return ['cookie' => $tdTrustedValue($verify), 'access' => (string) ($verify['json']['access_token'] ?? ''), 'login' => $login, 'verify' => $verify];
};
$tdRows = static function (int $userId) use ($pdo): array {
    $stmt = $pdo->prepare('SELECT * FROM mfa_trusted_devices WHERE user_id = ? ORDER BY device_id');
    $stmt->execute([$userId]);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
};
$tdRowByCookie = static function (string $cookie) use ($pdo): ?array {
    $stmt = $pdo->prepare('SELECT * FROM mfa_trusted_devices WHERE token_hash = ?');
    $stmt->execute([hash('sha256', $cookie)]);
    return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
};
$tdInsertRow = static function (int $userId, int $tokenVersion, string $expiresSql = "now() + interval '1 day'", bool $revoked = false) use ($pdo): string {
    $cookie = bin2hex(random_bytes(32));
    $pdo->prepare("INSERT INTO mfa_trusted_devices (user_id, token_hash, token_version, expires_at, revoked_at) VALUES (?, ?, ?, {$expiresSql}, " . ($revoked ? 'now()' : 'NULL') . ')')
        ->execute([$userId, hash('sha256', $cookie), $tokenVersion]);
    return $cookie;
};
$tdTokenVersion = static function (int $userId) use ($pdo): int {
    $stmt = $pdo->prepare('SELECT token_version FROM user_accounts WHERE user_id = ?');
    $stmt->execute([$userId]);
    return (int) $stmt->fetchColumn();
};
$tdAudit = static function (string $code, int $userId) use ($pdo): array {
    $stmt = $pdo->prepare('SELECT description, reason, actor_user_id FROM audit_events WHERE action_code = ? AND (target_id = ? OR actor_user_id = ?) ORDER BY event_id DESC');
    $stmt->execute([$code, (string) $userId, $userId]);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
};
$tdSettingsCount = static function (string $access) use ($tdHttp): mixed {
    $r = $tdHttp('GET', '/api/auth/mfa/settings', $access);
    return $r['status'] === 200 ? ($r['json']['two_factor']['trusted_device_count'] ?? null) : "HTTP {$r['status']}";
};
/** The password step with a cookie: true when it landed past the code step (a direct login with an access token). */
$tdSkips = static function (array $resp): bool {
    return $resp['status'] === 200 && ($resp['json']['two_factor_required'] ?? null) === false && ($resp['json']['access_token'] ?? '') !== '';
};
$tdAsksCode = static function (array $resp): bool {
    return $resp['status'] === 200 && ($resp['json']['two_factor_required'] ?? null) === true && ($resp['json']['two_factor_challenge_token'] ?? '') !== '' && !isset($resp['json']['access_token']);
};

// ---- Migration 069: table, constraints, cascade ----
$tdColumns = $pdo->query("SELECT column_name, data_type, is_nullable, character_maximum_length FROM information_schema.columns WHERE table_name = 'mfa_trusted_devices' ORDER BY ordinal_position")->fetchAll(PDO::FETCH_ASSOC);
$tdColumnMap = [];
foreach ($tdColumns as $c) {
    $tdColumnMap[$c['column_name']] = $c;
}
expect_same(
    ['device_id', 'user_id', 'token_hash', 'token_version', 'user_agent', 'created_at', 'expires_at', 'last_used_at', 'revoked_at', 'revoked_reason'],
    array_keys($tdColumnMap),
    'Migration 069: mfa_trusted_devices has the contract columns'
);
foreach (['device_id', 'user_id', 'token_hash', 'token_version', 'created_at', 'expires_at'] as $col) {
    expect_same('NO', $tdColumnMap[$col]['is_nullable'] ?? null, "Migration 069: {$col} is NOT NULL");
}
foreach (['user_agent', 'last_used_at', 'revoked_at', 'revoked_reason'] as $col) {
    expect_same('YES', $tdColumnMap[$col]['is_nullable'] ?? null, "Migration 069: {$col} is nullable");
}
expect_same(64, (int) $tdColumnMap['token_hash']['character_maximum_length'], 'Migration 069: token_hash holds a SHA-256 hex (64 characters)');
expect_same(255, (int) $tdColumnMap['user_agent']['character_maximum_length'], 'Migration 069: user_agent is at most 255 characters');
expect_same('timestamp with time zone', $tdColumnMap['expires_at']['data_type'], 'Migration 069: expires_at is a timestamptz');

$tdProbe = $tdPlainUser('probe');
$tdProbeInsert = $pdo->prepare('INSERT INTO mfa_trusted_devices (user_id, token_hash, token_version, user_agent, expires_at) VALUES (?, ?, 0, ?, now() + interval \'1 day\')');
$tdProbeHash = hash('sha256', 'probe-' . $tdTag);
$tdProbeInsert->execute([$tdProbe['user_id'], $tdProbeHash, 'ua']);
$tdProbeRow = $tdRows($tdProbe['user_id'])[0];
expect_true($tdProbeRow['created_at'] !== null && $tdProbeRow['last_used_at'] === null && $tdProbeRow['revoked_at'] === null && $tdProbeRow['revoked_reason'] === null, 'Migration 069: a new row has created_at and no last_used_at, revoked_at or reason');
$tdExpectError = static function (callable $fn, string $sqlState, string $label): void {
    try {
        $fn();
        expect_true(false, $label . ' (no error)');
    } catch (PDOException $e) {
        expect_same($sqlState, $e->getCode(), $label);
    }
};
$tdExpectError(static fn() => $tdProbeInsert->execute([$tdProbe['user_id'], $tdProbeHash, 'ua']), '23505', 'Migration 069: token_hash is unique');
$tdExpectError(static fn() => $tdProbeInsert->execute([$tdProbe['user_id'], str_repeat('a', 65), 'ua']), '22001', 'Migration 069: a token_hash longer than 64 characters is refused');
$tdExpectError(static fn() => $tdProbeInsert->execute([$tdProbe['user_id'], hash('sha256', 'long-ua-' . $tdTag), str_repeat('u', 256)]), '22001', 'Migration 069: a user_agent longer than 255 characters is refused');
$tdExpectError(static fn() => $tdProbeInsert->execute([2147483000, hash('sha256', 'no-user-' . $tdTag), 'ua']), '23503', 'Migration 069: user_id must be an existing account');
$tdExpectError(static fn() => $pdo->prepare('INSERT INTO mfa_trusted_devices (user_id, token_hash, token_version) VALUES (?, ?, 0)')->execute([$tdProbe['user_id'], hash('sha256', 'no-expiry-' . $tdTag)]), '23502', 'Migration 069: expires_at is required');
$tdExpectError(static fn() => $pdo->prepare('INSERT INTO mfa_trusted_devices (user_id, token_hash, expires_at) VALUES (?, ?, now())')->execute([$tdProbe['user_id'], hash('sha256', 'no-version-' . $tdTag)]), '23502', 'Migration 069: token_version is required');
expect_true(
    (bool) $pdo->query("SELECT 1 FROM pg_indexes WHERE tablename = 'mfa_trusted_devices' AND indexdef ILIKE '%(user_id)%'")->fetchColumn(),
    'Migration 069: user_id is indexed'
);
$pdo->prepare('DELETE FROM user_accounts WHERE user_id = ?')->execute([$tdProbe['user_id']]);
expect_same(0, count($tdRows($tdProbe['user_id'])), 'Migration 069: deleting the account deletes its trusted devices (ON DELETE CASCADE)');

// ---- Sign-in: nothing is remembered unless the box is ticked ----
$tdPlainTick = $tdUser('notick');
$tdLoginA = $tdLogin($tdPlainTick['email']);
expect_true($tdAsksCode($tdLoginA), 'Password step of an account with 2FA asks for the code when no cookie is sent');
expect_same([], array_values(array_filter($tdLoginA['cookies'], static fn($c) => str_starts_with($c, 'trusted_device='))), 'No trusted_device cookie is set or cleared when none was sent');
$tdVerifyA = $tdVerify($tdLoginA, $tdCode($tdPlainTick['secret'], -1));
expect_same(200, $tdVerifyA['status'], 'Verify without remember_device signs in');
expect_same(null, $tdTrustedValue($tdVerifyA), 'remember_device omitted: no trusted_device cookie (default false)');
expect_same(0, count($tdRows($tdPlainTick['user_id'])), 'remember_device omitted: no row is stored');
$tdLoginB = $tdLogin($tdPlainTick['email']);
$tdVerifyB = $tdVerify($tdLoginB, $tdCode($tdPlainTick['secret'], 0), false);
expect_same(200, $tdVerifyB['status'], 'Verify with remember_device false signs in');
expect_same([null, 0], [$tdTrustedValue($tdVerifyB), count($tdRows($tdPlainTick['user_id']))], 'remember_device false: no cookie and no row');
expect_true($tdAsksCode($tdLogin($tdPlainTick['email'])), 'Unticked: the next sign-in still asks for the code');

// ---- remember_device must be a boolean ----
$tdBool = $tdUser('bool');
$tdBoolLogin = $tdLogin($tdBool['email']);
foreach (['true', 'yes', 1, 0, 'false', null, [], ['x']] as $i => $badValue) {
    $r = $tdVerify($tdBoolLogin, $tdCode($tdBool['secret'], 0), $badValue);
    expect_same(400, $r['status'], 'remember_device that is not a boolean is refused with 400 (case ' . $i . ')');
}
expect_same(0, count($tdRows($tdBool['user_id'])), 'A refused remember_device stores nothing');
$tdBoolOk = $tdVerify($tdBoolLogin, $tdCode($tdBool['secret'], 0), true);
expect_same(200, $tdBoolOk['status'], 'The same challenge still verifies after the refused requests (the code was not spent)');

// ---- Ticked: cookie, row, audit; then the skip ----
$tdMain = $tdUser('main');
$tdLongAgent = 'Agent/' . str_repeat('x', 400);
$tdMainLogin = $tdLogin($tdMain['email']);
$tdMainVerify = $tdVerify($tdMainLogin, $tdCode($tdMain['secret'], 0), true, null, $tdLongAgent);
$tdMainCookie = $tdTrustedValue($tdMainVerify);
expect_same(200, $tdMainVerify['status'], 'Verify with remember_device true signs in');
expect_true($tdMainCookie !== null, 'Verify with remember_device true sets a 64-hex trusted_device cookie');
$tdSetCookieLine = '';
foreach ($tdMainVerify['cookies'] as $c) {
    if (str_starts_with($c, 'trusted_device=')) {
        $tdSetCookieLine = $c;
    }
}
expect_same("trusted_device={$tdMainCookie}; HttpOnly; SameSite=Lax; Path=/api/auth; Max-Age=2592000", $tdSetCookieLine, 'Cookie attributes: HttpOnly, SameSite=Lax, Path=/api/auth, Max-Age=2592000, not Secure over HTTP');
expect_true($tdHasCookie($tdMainVerify, 'refresh_token') && $tdHasCookie($tdMainVerify, 'trusted_device'), 'The verify response keeps BOTH the refresh_token and the trusted_device Set-Cookie headers');
$tdMainRows = $tdRows($tdMain['user_id']);
expect_same(1, count($tdMainRows), 'Ticking stores one row');
expect_same(hash('sha256', (string) $tdMainCookie), trim((string) $tdMainRows[0]['token_hash']), 'Only the SHA-256 of the cookie is stored');
expect_true(trim((string) $tdMainRows[0]['token_hash']) !== $tdMainCookie, 'The cookie value itself is not stored');
expect_same($tdTokenVersion($tdMain['user_id']), (int) $tdMainRows[0]['token_version'], "The row stores the account's token_version");
$tdUa = (string) $tdMainRows[0]['user_agent'];
expect_true($tdUa !== '' && strlen($tdUa) <= 255 && str_starts_with($tdUa, 'Agent/'), 'The user agent is stored, cut to 255 characters');
$tdSpan = (int) $pdo->query("SELECT extract(epoch FROM expires_at - created_at)::int FROM mfa_trusted_devices WHERE device_id = " . (int) $tdMainRows[0]['device_id'])->fetchColumn();
expect_true(abs($tdSpan - 30 * $tdDay) <= 5, 'The device is remembered for 30 days from the tick');
expect_same(1, count($tdAudit('trusted_device_remembered', $tdMain['user_id'])), 'Ticking writes one trusted_device_remembered audit row');

$tdSkip1 = $tdLogin($tdMain['email'], $tdMainCookie);
expect_true($tdSkips($tdSkip1), 'A valid cookie of the same account signs in without the code (direct login, access token, no challenge)');
expect_true($tdHasCookie($tdSkip1, 'refresh_token'), 'The skipped sign-in still sets the refresh cookie');
expect_true(!$tdTrustedCleared($tdSkip1), 'A matching cookie is not cleared');
[$tdMeStatus] = integration_http_get_json('/api/auth/me', (string) ($tdSkip1['json']['access_token'] ?? ''));
expect_same(200, $tdMeStatus, 'The access token of a skipped sign-in works');
$tdSignIn = $tdAudit('login_success', $tdMain['user_id'])[0]['description'] ?? '';
expect_true(str_contains($tdSignIn, '2FA skipped on a remembered device'), 'The sign-in audit row says "2FA skipped on a remembered device"');
$tdAfterRow = $tdRowByCookie((string) $tdMainCookie);
expect_true($tdAfterRow['last_used_at'] !== null, 'A skipped sign-in records last_used_at');
expect_same([$tdMainRows[0]['expires_at'], $tdMainRows[0]['created_at']], [$tdAfterRow['expires_at'], $tdAfterRow['created_at']], 'The 30 days are fixed: a later sign-in does not move expires_at');
expect_true($tdSkips($tdLogin($tdMain['email'], $tdMainCookie)), 'The cookie works again on a later sign-in (not single use)');
$tdWrongPassword = $tdLogin($tdMain['email'], $tdMainCookie, 'Wrong-Password9#');
expect_same(401, $tdWrongPassword['status'], 'The password is always required: a valid cookie with a wrong password is refused');
expect_same(null, $tdWrongPassword['json']['access_token'] ?? null, 'A wrong password with a valid cookie gives no access token');
expect_true(str_contains(json_encode($tdAudit('trusted_device_remembered', $tdMain['user_id'])), 'Remembered'), 'The remembered-device audit row is readable');
$tdMainAfterCount = $tdSettingsCount((string) ($tdSkip1['json']['access_token'] ?? ''));
expect_same(1, $tdMainAfterCount, 'GET /api/auth/mfa/settings reports trusted_device_count 1');

// ---- Bad cookies fall back to the code step and are cleared ----
foreach (['zzz', strtoupper(str_repeat('ab', 32)), str_repeat('a', 63), bin2hex(random_bytes(32))] as $i => $badCookie) {
    $r = $tdLogin($tdMain['email'], $badCookie);
    expect_true($tdAsksCode($r), "Bad cookie #{$i}: the code step is asked");
    expect_true($tdTrustedCleared($r), "Bad cookie #{$i}: the cookie is cleared (Max-Age=0, Path=/api/auth)");
}
expect_true($tdSkips($tdLogin($tdMain['email'], $tdMainCookie)), 'Bad cookies do not revoke the real row');

$tdExpiredUser = $tdUser('expired');
$tdExpired = $tdRemember($tdExpiredUser, 0);
$pdo->prepare("UPDATE mfa_trusted_devices SET expires_at = now() - interval '1 second' WHERE user_id = ?")->execute([$tdExpiredUser['user_id']]);
$tdExpiredTry = $tdLogin($tdExpiredUser['email'], $tdExpired['cookie']);
expect_true($tdAsksCode($tdExpiredTry) && $tdTrustedCleared($tdExpiredTry), 'An expired row does not skip, and the cookie is cleared (no message, the code step just shows)');

// An account's cookie never works for another account.
$tdOwner = $tdUser('owner');
$tdOther = $tdUser('other');
$tdOwnerSession = $tdRemember($tdOwner, 0);
$tdCross = $tdLogin($tdOther['email'], $tdOwnerSession['cookie']);
expect_true($tdAsksCode($tdCross), "Another account's cookie does not skip the code");
expect_true($tdTrustedCleared($tdCross), "Another account's cookie is cleared");
$tdOwnerAfter = $tdLogin($tdOwner['email'], $tdOwnerSession['cookie']);
expect_true($tdAsksCode($tdOwnerAfter), "The owner's cleared cookie no longer skips (one browser remembers one account)");
expect_same(0, trusted_device_active_count($pdo, $tdOwner['user_id']), "The owner's Profile no longer counts the cleared browser");

// One browser remembers one account: a later tick replaces the earlier row (the old cookie still held by the browser at the tick).
$tdRepl = $tdUser('replace');
$tdReplFirst = $tdRemember($tdRepl, -1);
$tdReplSecond = $tdRemember($tdRepl, 0, $tdReplFirst['cookie']);
expect_true($tdReplSecond['cookie'] !== null && $tdReplSecond['cookie'] !== $tdReplFirst['cookie'], 'A second tick in the same browser issues a new cookie');
$tdReplOld = $tdRowByCookie((string) $tdReplFirst['cookie']);
expect_true($tdReplOld !== null && $tdReplOld['revoked_at'] !== null, 'The earlier row is revoked when the same browser ticks again');
expect_true($tdAsksCode($tdLogin($tdRepl['email'], $tdReplFirst['cookie'])), 'The replaced cookie no longer skips');
expect_true($tdSkips($tdLogin($tdRepl['email'], $tdReplSecond['cookie'])), 'The new cookie skips');
expect_same(1, $tdSettingsCount($tdReplSecond['access']), 'Replacing leaves one remembered device');

$tdTakeover = $tdUser('takeover');
$tdTakeoverTick = $tdRemember($tdTakeover, 0, $tdOwnerSession['cookie']);
expect_true($tdTakeoverTick['cookie'] !== null, 'Another account can tick in a browser that holds the owner cookie');
expect_true($tdAsksCode($tdLogin($tdOwner['email'], $tdOwnerSession['cookie'])), "Another account's later tick replaces the earlier account's row in that browser (explicit cookie)");

// Realistic order: the password step answers a foreign cookie with a clearing header, then the code step carries no cookie.
$tdBrowserA = $tdUser('browser-a');
$tdBrowserB = $tdUser('browser-b');
$tdBrowserASession = $tdRemember($tdBrowserA, 0);
$tdBrowserBLogin = $tdLogin($tdBrowserB['email'], $tdBrowserASession['cookie']);
expect_true($tdTrustedCleared($tdBrowserBLogin), 'Browser order: the foreign cookie is cleared at the password step');
$tdBrowserBVerify = $tdVerify($tdBrowserBLogin, $tdCode($tdBrowserB['secret'], 0), true, null);
expect_true($tdTrustedValue($tdBrowserBVerify) !== null, 'Browser order: the second account ticks');
$tdBrowserARow = $tdRowByCookie((string) $tdBrowserASession['cookie']);
expect_true($tdBrowserARow !== null && $tdBrowserARow['revoked_at'] !== null, 'Browser order: the first account no longer remembers that browser (contract: one browser remembers one account)');

// Recovery-code sign-in never remembers.
$tdRec = $tdUser('recovery');
$tdRecLogin = $tdLogin($tdRec['email']);
$tdRecResult = $tdHttp('POST', '/api/auth/mfa/recover', (string) ($tdRecLogin['json']['two_factor_challenge_token'] ?? ''), ['code' => $tdRec['recovery_code'], 'remember_device' => true]);
expect_same(200, $tdRecResult['status'], 'A recovery code signs in');
expect_same(null, $tdTrustedValue($tdRecResult), 'Recovery-code sign-in sets no trusted_device cookie even if remember_device is sent');
expect_same(0, count($tdRows($tdRec['user_id'])), 'Recovery-code sign-in stores no trusted device');
expect_true($tdAsksCode($tdLogin($tdRec['email'])), 'After a recovery-code sign-in the next sign-in still asks for a code');

// ---- Revocations ----
$tdAssertStopped = static function (array $user, array $session, string $label) use ($tdLogin, $tdAsksCode, $tdTrustedCleared, $tdRowByCookie): void {
    $r = $tdLogin($user['email'], $session['cookie'], $user['password'] ?? null);
    expect_true($tdAsksCode($r), "{$label}: the cookie no longer skips the code");
    expect_true($tdTrustedCleared($r), "{$label}: the dead cookie is cleared");
};

// password change (a token_version move, over the real endpoint)
$tdPw = $tdUser('pwchange');
$tdPwSession = $tdRemember($tdPw, 0);
$tdPwChange = $tdHttp('POST', '/api/auth/password/change', $tdPwSession['access'], ['current_password' => $tdPassword, 'new_password' => $tdNewPassword, 'confirm_password' => $tdNewPassword]);
expect_same(200, $tdPwChange['status'], 'Trusted-device fixture changes its password');
$tdAssertStopped($tdPw + ['password' => $tdNewPassword], $tdPwSession, 'Password change');

// raw token_version move (stands in for password reset, 2FA reset, email move, Dean handover)
$tdTv = $tdUser('tokenversion');
$tdTvSession = $tdRemember($tdTv, 0);
$pdo->prepare('UPDATE user_accounts SET token_version = token_version + 1 WHERE user_id = ?')->execute([$tdTv['user_id']]);
$tdAssertStopped($tdTv, $tdTvSession, 'token_version bump');
expect_same(0, trusted_device_active_count($pdo, $tdTv['user_id']), 'token_version bump: the device is not counted as remembered any more');

// sign-out everywhere (Superadmin People & Accounts), then deactivation and reactivation
$tdOut = $tdUser('signout');
$tdOutSession = $tdRemember($tdOut, 0);
[$tdOutStatus] = integration_http_json('/api/admin/people/sign-out', $superSession(), ['userId' => $tdOut['user_id'], 'reason' => 'Trusted device test']);
expect_same(200, $tdOutStatus, 'The Superadmin signs the account out everywhere');
$tdAssertStopped($tdOut, $tdOutSession, 'Sign out everywhere');

$tdOff = $tdUser('deactivate');
$tdOffSession = $tdRemember($tdOff, 0);
[$tdDeactStatus] = integration_http_json('/api/admin/people/deactivate', $superSession(), ['userId' => $tdOff['user_id'], 'reason' => 'Trusted device test']);
[$tdReactStatus] = integration_http_json('/api/admin/people/reactivate', $superSession(), ['userId' => $tdOff['user_id'], 'reason' => 'Trusted device test']);
expect_same([200, 200], [$tdDeactStatus, $tdReactStatus], 'The Superadmin deactivates and reactivates the account');
$tdAssertStopped($tdOff, $tdOffSession, 'Deactivation');

// 2FA turned off, then on again
$tdTwo = $tdUser('twofactor');
$tdTwoSession = $tdRemember($tdTwo, -1);
expect_same(1, $tdSettingsCount($tdTwoSession['access']), 'Before turning 2FA off the profile counts 1 remembered device');
$tdOffResult = $tdHttp('POST', '/api/auth/mfa/settings/revoke', $tdTwoSession['access'], ['code' => $tdCode($tdTwo['secret'], 0)]);
expect_same(200, $tdOffResult['status'], 'The account turns 2FA off');
$tdTwoRow = $tdRowByCookie((string) $tdTwoSession['cookie']);
expect_true($tdTwoRow['revoked_at'] !== null, 'Turning 2FA off revokes the remembered devices');
expect_same('two_factor_off', $tdTwoRow['revoked_reason'], 'Turning 2FA off records its reason');
expect_true(str_contains(json_encode($tdAudit('trusted_devices_forgotten', $tdTwo['user_id'])), '2FA turned off'), 'Turning 2FA off writes a trusted_devices_forgotten audit row with its reason');
$tdNoTwoLogin = $tdLogin($tdTwo['email'], $tdTwoSession['cookie']);
expect_true($tdSkips($tdNoTwoLogin), 'With 2FA off the sign-in has no code step');
$tdEnrollStart = $tdHttp('POST', '/api/auth/mfa/enroll/start', (string) ($tdNoTwoLogin['json']['access_token'] ?? ''), []);
expect_same(200, $tdEnrollStart['status'], 'The account starts 2FA enrolment again');
$tdNewSecret = (string) ($tdEnrollStart['json']['base32_secret'] ?? '');
$tdEnrollConfirm = $tdHttp('POST', '/api/auth/mfa/enroll/confirm', (string) ($tdNoTwoLogin['json']['access_token'] ?? ''), ['confirmation_token' => $tdEnrollStart['json']['confirmation_token'] ?? '', 'code' => $tdCode($tdNewSecret, 0)]);
expect_same(200, $tdEnrollConfirm['status'], 'The account confirms 2FA again');
expect_true($tdAsksCode($tdLogin($tdTwo['email'], $tdTwoSession['cookie'])), 'A cookie from before 2FA was turned off never skips the new 2FA');

// 2FA turned on: a device row left active under an account that had no 2FA is revoked by enrolment
$tdEnrol = $tdPlainUser('enrol');
$tdStale = $tdInsertRow($tdEnrol['user_id'], $tdTokenVersion($tdEnrol['user_id']));
$tdEnrolLogin = $tdLogin($tdEnrol['email'], $tdStale);
expect_true($tdSkips($tdEnrolLogin), 'Sanity: an account without 2FA signs in directly');
$tdStart = $tdHttp('POST', '/api/auth/mfa/enroll/start', (string) $tdEnrolLogin['json']['access_token'], []);
$tdConfirm = $tdHttp('POST', '/api/auth/mfa/enroll/confirm', (string) $tdEnrolLogin['json']['access_token'], ['confirmation_token' => $tdStart['json']['confirmation_token'] ?? '', 'code' => $tdCode((string) ($tdStart['json']['base32_secret'] ?? ''), 0)]);
expect_same(200, $tdConfirm['status'], 'The account without 2FA turns 2FA on');
$tdStaleRow = $tdRowByCookie($tdStale);
expect_true($tdStaleRow['revoked_at'] !== null, 'Turning 2FA on revokes devices remembered earlier');
expect_same('two_factor_on', $tdStaleRow['revoked_reason'], 'Turning 2FA on records its reason');
expect_true($tdAsksCode($tdLogin($tdEnrol['email'], $tdStale)), 'After 2FA is turned on the old cookie asks for the code');

// recovery-code regeneration
$tdRegen = $tdUser('regen');
$tdRegenSession = $tdRemember($tdRegen, -1);
$tdRegenResult = $tdHttp('POST', '/api/auth/mfa/settings/recovery-codes', $tdRegenSession['access'], ['code' => $tdCode($tdRegen['secret'], 0)]);
expect_same(200, $tdRegenResult['status'], 'The account regenerates its recovery codes');
$tdRegenRow = $tdRowByCookie((string) $tdRegenSession['cookie']);
expect_same('recovery_regenerated', $tdRegenRow['revoked_reason'] ?? null, 'Regenerating recovery codes revokes the remembered devices');
$tdAssertStopped($tdRegen, $tdRegenSession, 'Recovery-code regeneration');

// Forget my trusted devices
$tdForgetUser = $tdUser('forget');
$tdForgetFirst = $tdRemember($tdForgetUser, -1);
$tdForgetSecond = $tdRemember($tdForgetUser, 0); // another browser: no cookie sent
expect_same(2, $tdSettingsCount($tdForgetFirst['access']), 'Two browsers remembered: the profile counts 2');
expect_same(401, $tdHttp('POST', '/api/auth/mfa/trusted-devices/forget')['status'], 'Forget without a session is 401');
expect_same(401, $tdHttp('POST', '/api/auth/mfa/trusted-devices/forget', 'not-a-token')['status'], 'Forget with a bad token is 401');
expect_same(2, $tdSettingsCount($tdForgetFirst['access']), 'A refused forget changes nothing');
$tdForget = $tdHttp('POST', '/api/auth/mfa/trusted-devices/forget', $tdForgetFirst['access']);
expect_same(200, $tdForget['status'], 'Forget answers 200');
expect_same(['forgotten' => 2], $tdForget['json'], 'Forget answers {"forgotten": 2}');
expect_same(0, $tdSettingsCount($tdForgetFirst['access']), 'After forget the profile counts 0');
expect_same(['forgotten', 'forgotten'], array_column($tdRows($tdForgetUser['user_id']), 'revoked_reason'), 'Forget records its reason on every row');
$tdAssertStopped($tdForgetUser, $tdForgetFirst, 'Forget (first browser)');
$tdAssertStopped($tdForgetUser, $tdForgetSecond, 'Forget (second browser)');
$tdForgetAudit = $tdAudit('trusted_devices_forgotten', $tdForgetUser['user_id']);
expect_same('Forgot 2 remembered devices.', $tdForgetAudit[0]['description'] ?? null, 'Forget writes one audit row with the count');
$tdForgetAgain = $tdHttp('POST', '/api/auth/mfa/trusted-devices/forget', $tdForgetFirst['access']);
expect_same([200, ['forgotten' => 0]], [$tdForgetAgain['status'], $tdForgetAgain['json']], 'Forgetting with none left answers {"forgotten": 0}');
expect_same(count($tdForgetAudit), count($tdAudit('trusted_devices_forgotten', $tdForgetUser['user_id'])), 'Forgetting with none left writes no audit row');
expect_true($tdAsksCode($tdLogin($tdForgetUser['email'])), 'After forget a sign-in without a cookie asks for the code');

// Forget touches only the caller's own account
$tdMate = $tdUser('mate');
$tdMateSession = $tdRemember($tdMate, 0);
$tdForgetOwn = $tdUser('forgetown');
$tdForgetOwnSession = $tdRemember($tdForgetOwn, 0);
$tdHttp('POST', '/api/auth/mfa/trusted-devices/forget', $tdForgetOwnSession['access']);
expect_true($tdSkips($tdLogin($tdMate['email'], $tdMateSession['cookie'])), "Forget leaves other accounts' remembered devices alone");

// The profile count only counts devices that still skip
$tdCount = $tdUser('count');
$tdCountSession = $tdRemember($tdCount, 0);
$tdInsertRow($tdCount['user_id'], $tdTokenVersion($tdCount['user_id']), "now() - interval '1 minute'");
$tdInsertRow($tdCount['user_id'], $tdTokenVersion($tdCount['user_id']), "now() + interval '1 day'", true);
$tdInsertRow($tdCount['user_id'], $tdTokenVersion($tdCount['user_id']) - 1);
expect_same(1, $tdSettingsCount($tdCountSession['access']), 'trusted_device_count ignores expired, revoked and older-token_version rows');
expect_same(401, $tdHttp('GET', '/api/auth/mfa/settings')['status'], 'The settings endpoint still needs a session');

// ---- Audit catalogue ----
$tdCatalogue = audit_catalogue();
expect_true(isset($tdCatalogue['trusted_device_remembered']) && isset($tdCatalogue['trusted_devices_forgotten']), 'The audit catalogue has trusted_device_remembered and trusted_devices_forgotten');

expect_true($tdLimiterDir !== '', 'Sanity: RATE_LIMIT_STORAGE_DIR is set, so this file resets the per-address sign-in limit');
echo "Trusted devices: {$tdAtLimit[0]} sign-in(s) here found the per-address sign-in limit already reached (reset before sending).\n";
