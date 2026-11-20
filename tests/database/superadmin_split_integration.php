<?php

declare(strict_types=1);

// Backlog 13.9 Dean and Superadmin split (docs/contracts/dean-superadmin-split.md, section 9): database rules, route ownership, the
// Dean row actions and the handover, My Activity for the Dean, the server script, and the Superadmin sign-in with required 2FA.
// Included by the full disposable PostgreSQL suite right after superadmin_integration.php, so it reuses that file's helpers
// ($saAccount, $saAuditRows, $mvRun, $saGet, $saPost) and the Superadmin session from postgres_integration_test.php
// ($superUserId, $superEmail, $superAccessToken, $superSession). Every row it makes carries $spTag.

// The fixed development TOTP secret of the seeded Superadmin (database/seeds/generate_development_demo.py), base32.
// FILL IN once the seed worker reports it; while it is empty the seed check below only proves the seeded account has 2FA.
const SUPERADMIN_DEV_TOTP_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

$spTag = 'sp' . strtolower(bin2hex(random_bytes(3)));
$spLetters = strtr($spTag, '0123456789', 'abcdefghij'); // names take letters only
$spPass = 'Superadm1n!Pass';
$spMfaKey = config_key_bytes_exact(app_config()['mfa']['encryption_key_b64'], 32, 'MFA_ENCRYPTION_KEY');
$spGet = static fn(string $path, ?string $token = null): array => integration_http_get_json($path, $token ?? $superAccessToken);
$spPost = static fn(string $path, array $body, ?string $token = null): array => integration_http_json($path, $token ?? $superAccessToken, $body);
$spCount = static fn(string $sql, array $args = []): int => (static function () use ($pdo, $sql, $args): int {
    $stmt = $pdo->prepare($sql);
    $stmt->execute($args);
    return (int) $stmt->fetchColumn();
})();
$spOne = static function (string $sql, array $args = []) use ($pdo): mixed {
    $stmt = $pdo->prepare($sql);
    $stmt->execute($args);
    $value = $stmt->fetchColumn();
    return $value === false ? null : $value;
};
$spRows = static function (string $sql, array $args = []) use ($pdo): array {
    $stmt = $pdo->prepare($sql);
    $stmt->execute($args);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
};
$spAudit = static fn(string $code, string $targetId): array => $spRows('SELECT actor_role, actor_user_id, reason FROM audit_events WHERE action_code = ? AND target_id = ? ORDER BY event_id', [$code, $targetId]);
$spOutbox = static fn(string $email): int => $spCount('SELECT COUNT(*) FROM email_outbox WHERE recipient_email = ?', [$email]);
$spRole = static fn(int $id): ?string => $spOne('SELECT role FROM user_accounts WHERE user_id = ?', [$id]);
$spVersion = static fn(int $id): int => (int) $spOne('SELECT token_version FROM user_accounts WHERE user_id = ?', [$id]);
$spLiveSessions = static fn(int $id): int => $spCount('SELECT COUNT(*) FROM auth_sessions WHERE user_id = ? AND revoked_at IS NULL', [$id]);
$spTotp = static function (string $secret, int $offset = 0): string {
    return mfa_compute_totp($secret, intdiv(time(), 30) + $offset)['code'];
};
$spForgetStep = static function (int $userId) use ($pdo): void { // the replay guard accepts a step once; the test needs several codes in one 30-second window
    $pdo->prepare("UPDATE security_tokens SET last_accepted_step = NULL WHERE user_id = ? AND purpose = 'mfa_credential'")->execute([$userId]);
};
$spSecretOf = static function (int $userId) use ($pdo, $spMfaKey): ?string {
    $stmt = $pdo->prepare("SELECT ciphertext, nonce, auth_tag FROM security_tokens WHERE user_id = ? AND purpose = 'mfa_credential' AND mfa_status = 'enabled' AND revoked_at IS NULL");
    $stmt->execute([$userId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row === false ? null : mfa_decrypt_secret(pdo_binary_value($row['ciphertext']), pdo_binary_value($row['nonce']), pdo_binary_value($row['auth_tag']), $spMfaKey);
};
// 12.8: the Superadmin signs in on its own page, so its sign-ins pass $superPage = true; everyone else uses the shared /login.
$spLogin = static fn(string $email, string $password, bool $superPage = false): array => integration_http_json('/api/auth/login', '', ['email' => $email, 'password' => $password] + ($superPage ? ['sign_in_page' => 'superadmin'] : []));
$spField = static fn(array $body, string $field): bool => in_array($field, array_column($body['errors'] ?? [], 'field'), true);

// ---- A. Database: migration 068 on existing data, one Superadmin row, identity (DS1, DS2, DS4) ----
foreach (['ck_user_accounts_role', 'ck_role_permissions_role'] as $spCheck) {
    expect_true(str_contains((string) $spOne('SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = ?', [$spCheck]), 'superadmin'), "DS1: {$spCheck} allows superadmin");
}
$spIndex = (string) $spOne("SELECT indexdef FROM pg_indexes WHERE indexname = 'uq_user_accounts_one_superadmin'");
expect_true(str_contains($spIndex, 'UNIQUE') && str_contains($spIndex, "'superadmin'"), 'DS2: uq_user_accounts_one_superadmin is a unique partial index on the superadmin role');
expect_same(1, $spCount("SELECT COUNT(*) FROM user_accounts WHERE role = 'superadmin'"), 'The database holds exactly one Superadmin row');
expect_true($spCount("SELECT COUNT(*) FROM user_accounts WHERE role = 'admin'") >= 1 && $spCount("SELECT COUNT(*) FROM user_accounts WHERE role IN ('faculty', 'secretary', 'student')") >= 3, 'Migration 068 left the existing Dean, Faculty, Secretary and Student rows alone');
try {
    $pdo->prepare("INSERT INTO user_accounts (login_email, password_hash, role, display_name, status) VALUES (?, ?, 'superadmin', 'Second Super', 'Active')")->execute(["sp-second-{$spTag}@bicol-u.edu.ph", password_hash($spPass, PASSWORD_DEFAULT)]);
    expect_true(false, 'DS2: a second Superadmin row is refused');
} catch (PDOException $spSecond) {
    expect_same('23505', (string) $spSecond->getCode(), 'DS2: a second Superadmin row is refused by the unique index');
}
try {
    $pdo->prepare("INSERT INTO user_accounts (login_email, password_hash, role, display_name, status) VALUES (?, ?, 'auditor', 'Odd Role', 'Active')")->execute(["sp-odd-{$spTag}@bicol-u.edu.ph", password_hash($spPass, PASSWORD_DEFAULT)]);
    expect_true(false, 'DS1: an unknown role is still refused');
} catch (PDOException $spOdd) {
    expect_same('23514', (string) $spOdd->getCode(), 'DS1: an unknown role is still refused by the role check');
}
// DS4 is the app's identity rule (as for the Dean's email), not a database constraint on students.
require_once $root . '/backend/app/account_identity.php';
expect_true(account_identity_email_role_conflict($pdo, $superEmail, 'student') !== null, 'DS4: the Superadmin email cannot become a Student record');
expect_true(account_identity_email_role_conflict($pdo, $superEmail, 'faculty') !== null, 'DS4: the Superadmin email cannot be invited as Faculty');
$pdo->prepare("INSERT INTO students (student_number, first_name, last_name, bu_email, status) VALUES (?, 'Sp', 'Link', ?, 'active')")->execute(["SP-{$spTag}-2", "sp-link-{$spTag}@bicol-u.edu.ph"]);
$spLinked = false;
try {
    $pdo->beginTransaction();
    $pdo->prepare('UPDATE students SET student_account_user_id = ? WHERE student_number = ?')->execute([$superUserId, "SP-{$spTag}-2"]);
    $pdo->commit();
    $spLinked = true;
} catch (PDOException) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
}
expect_true(!$spLinked, 'DS4: a Student record cannot be linked to the Superadmin account (the canonical Student link needs a Student role)');
[$spInviteStatus] = $spPost('/api/admin/faculty-invitations', ['firstName' => 'Take', 'lastName' => 'Super' . $spLetters, 'email' => $superEmail], $adminAccessToken);
expect_true(in_array($spInviteStatus, [409, 422], true), 'DS4: a Faculty invitation to the Superadmin email is refused');
expect_same(1, $spCount('SELECT COUNT(*) FROM user_accounts WHERE login_email = ?', [$superEmail]), 'DS4: the refused invitation created no second account');
// The dev seed lists the Superadmin with its documented password and a fixed development TOTP secret (section 9).
// The seed's authenticator is encrypted with the development MFA key; check-postgres uses another key, so it cannot be read there.
$spDevMfaKey = app_config()['mfa']['encryption_key_b64'] === 'ZGVudGlzeXMtZGV2LW1mYS1lbmNyeXB0LWtleS0zMmI=';
if (!$spDevMfaKey) echo "SKIP: Dev seed authenticator checks (this run does not use the development MFA key)\n";
if ($superFromSeed && $spDevMfaKey && str_contains((string) @file_get_contents(__DIR__ . '/../../database/seeds/generate_development_demo.py'), 'superadmin@')) {
    expect_true(password_verify('Superadmin123!', (string) $spOne('SELECT password_hash FROM user_accounts WHERE user_id = ?', [$superUserId])), 'Dev seed: the Superadmin password is the documented Superadmin123!');
    $spSeedSecret = $spSecretOf($superUserId);
    expect_true($spSeedSecret !== null, 'Dev seed: the Superadmin has an authenticator (2FA is required for it)');
    if (SUPERADMIN_DEV_TOTP_SECRET !== '') {
        expect_same(SUPERADMIN_DEV_TOTP_SECRET, $spSeedSecret, 'Dev seed: the Superadmin authenticator holds the fixed development TOTP secret');
    }
}

// ---- B. Route ownership (4.1): every route refuses the wrong role ----
[, $spStudentLogin] = $spLogin('student@bicol-u.edu.ph', 'Student123!');
$spStudentToken = (string) ($spStudentLogin['access_token'] ?? '');
$spWho = [['Dean', $adminAccessToken], ['Faculty', $seedFacultyAccessToken], ['Secretary', $secretaryAccessToken], ['Student', $spStudentToken], ['anonymous', '']];
$spExpect = static fn(string $who): int => $who === 'anonymous' ? 401 : 403;
$spCall = static fn(string $method, string $path, string $token): int => $method === 'GET' ? integration_http_get_json($path, $token)[0] : integration_http_json($path, $token, ['id' => 1, 'userId' => 1, 'roomId' => 1, 'studentId' => 1, 'flagId' => 1])[0];
$spSuperRoutes = [['GET', '/api/admin/academic-terms'], ['POST', '/api/admin/academic-terms'], ['POST', '/api/admin/academic-terms/preview'], ['POST', '/api/admin/academic-terms/delete'], ['POST', '/api/admin/academic-terms/copy'],
    ['GET', '/api/admin/courses'], ['POST', '/api/admin/courses/update'], ['POST', '/api/admin/courses/retire'], ['POST', '/api/admin/courses/restore'],
    ['GET', '/api/admin/rooms'], ['POST', '/api/admin/rooms'], ['POST', '/api/admin/rooms/update'], ['POST', '/api/admin/rooms/retire'], ['POST', '/api/admin/room-categories'], ['POST', '/api/admin/room-categories/update'],
    ['GET', '/api/admin/overview'], ['GET', '/api/admin/people'], ['GET', '/api/admin/people/filters'], ['POST', '/api/admin/people/deactivate'], ['POST', '/api/admin/people/reactivate'], ['POST', '/api/admin/people/sign-out'],
    ['POST', '/api/admin/people/reset-2fa'], ['POST', '/api/admin/people/move-email'], ['POST', '/api/admin/people/name'], ['POST', '/api/admin/people/transfer-dean'],
    ['POST', '/api/admin/people/invitation/resend'], ['POST', '/api/admin/people/invitation/revoke'], ['GET', '/api/admin/face-flags'], ['POST', '/api/admin/face-flags/dismiss'], ['POST', '/api/admin/biometrics/revoke']];
foreach ($spSuperRoutes as [$spMethod, $spPath]) {
    foreach ($spWho as [$spWhoName, $spToken]) {
        expect_same($spExpect($spWhoName), $spCall($spMethod, $spPath, $spToken), "4.1: {$spWhoName} gets {$spExpect($spWhoName)} on {$spMethod} {$spPath}");
    }
}
foreach ([['/api/admin/academic-terms'], ['/api/admin/courses'], ['/api/admin/rooms'], ['/api/admin/overview'], ['/api/admin/people'], ['/api/admin/people/filters'], ['/api/admin/face-flags']] as [$spPath]) {
    expect_same(200, $spGet($spPath)[0], "4.1: the Superadmin reads GET {$spPath}");
}
$spDeanRoutes = [['GET', '/api/admin/dashboard/kpis'], ['GET', '/api/admin/retention/criteria'], ['GET', '/api/admin/faculty-invitations'], ['POST', '/api/admin/faculty-invitations'], ['POST', '/api/admin/faculty-invitations/reissue'], ['GET', '/api/admin/email-logs']];
foreach ($spDeanRoutes as [$spMethod, $spPath]) {
    expect_same(403, $spCall($spMethod, $spPath, $superAccessToken), "4.1: the Superadmin gets 403 on the Dean route {$spMethod} {$spPath}");
    expect_same(403, $spCall($spMethod, $spPath, $seedFacultyAccessToken), "4.1: Faculty gets 403 on {$spMethod} {$spPath}");
    expect_same(401, $spCall($spMethod, $spPath, ''), "4.1: anonymous gets 401 on {$spMethod} {$spPath}");
    if ($spMethod === 'GET') {
        expect_same(200, $spCall($spMethod, $spPath, $adminAccessToken), "4.1: the Dean still reads {$spPath}");
    }
}
expect_same(403, $spGet('/api/admin/reports/summary')[0], '4.1: the Superadmin gets 403 on the Dean reports');
expect_same(200, $spGet('/api/admin/reports/summary', $adminAccessToken)[0], '4.1: the Dean still reads the reports');
foreach (['/api/admin/profile', '/api/admin/settings'] as $spPath) {
    expect_same([200, 200, 403, 401], [$spGet($spPath)[0], $spGet($spPath, $adminAccessToken)[0], $spGet($spPath, $seedFacultyAccessToken)[0], $spGet($spPath, '')[0]], "4.1: {$spPath} serves the Superadmin and the Dean, not Faculty, not anonymous");
}
[, $spOwnProfile] = $spGet('/api/admin/profile');
expect_true(str_contains(json_encode($spOwnProfile), $superEmail), 'The Superadmin profile shows its own login email');
expect_same(200, $spGet('/api/admin/audit-logs')[0] === 200 && $spGet('/api/admin/audit-logs', $adminAccessToken)[0] === 200 ? 200 : 0, '4.1: /api/admin/audit-logs serves both roles (different views)');
expect_same([200, 200, 200, 403, 403], [$spGet('/api/rooms', $adminAccessToken)[0], $spGet('/api/rooms', $seedFacultyAccessToken)[0], $spGet('/api/rooms', $secretaryAccessToken)[0], $spGet('/api/rooms')[0], $spGet('/api/rooms', $spStudentToken)[0]], '4.1: /api/rooms keeps the role list admin, faculty, secretary (the Superadmin and Students are refused)');
foreach (['/api/faculty/classes', '/api/secretary/dashboard/kpis', '/api/student/dashboard'] as $spPath) {
    // Student routes answer 401 to every non-Student account (as for the Dean); Faculty and Secretary routes answer 403.
    expect_true(in_array($spGet($spPath)[0], [401, 403], true), "D2: the Superadmin is never Faculty, Secretary or Student ({$spPath})");
}
$spCourseAudit = $spRows("SELECT actor_role FROM audit_events WHERE action_code IN ('course_retired', 'course_restored', 'course_updated') ORDER BY event_id DESC LIMIT 1");
expect_same('superadmin', $spCourseAudit[0]['actor_role'] ?? null, 'Section 7: new audit rows from Superadmin actions store actor role superadmin');

// ---- E. The Dean's Audit Trail is My Activity: own rows only (DS7); the Superadmin keeps the overview (DS8) ----
$readWrite($readDean, 'class_management', 'class_code_regenerated', 'Success', "Dean own row {$spTag}", ['target_type' => 'user_account', 'target_id' => (string) $readDean['user_id']]);
[$spDeanStatus, $spDean] = $spGet('/api/admin/audit-logs?q=' . rawurlencode($spTag), $adminAccessToken);
// A "Dean role handed over" row that targets the Dean also shows in the Dean's own list (section 7), whoever did it.
$spDeanOwn = array_values(array_filter($spDean['entries'] ?? [], static fn(array $e): bool => ($e['details']['technical']['actionCode'] ?? '') !== 'dean_transferred' && $e['what'] !== 'Dean role handed over'));
$spDeanWho = array_values(array_unique(array_map(static fn(array $e): string => (string) ($e['who']['email'] ?? ''), $spDeanOwn)));
expect_true($spDeanStatus === 200 && $spDeanOwn !== [] && $spDeanWho === [$readDean['login_email']], 'DS7: the Dean lists only rows the Dean account did (status ' . $spDeanStatus . ', actors ' . json_encode($spDeanWho) . ')');
expect_true(!in_array('Sign-in failed', array_column($spDean['entries'] ?? [], 'what'), true) && !in_array('Scores changed', array_column($spDean['entries'] ?? [], 'what'), true), 'DS7: the Dean sees no other account\'s sign-in failures or class work');
expect_true(empty($spDean['attention'] ?? null) && !array_key_exists('classOptions', $spDean) && ($spDean['scope'] ?? 'overview') === 'overview', 'DS7: no attention cards and no class-work options for the Dean');
[, $spDeanSignins] = $spGet('/api/admin/audit-logs?signins=1&q=' . rawurlencode($readTag), $adminAccessToken);
expect_same(1, count(array_filter($spDeanSignins['entries'] ?? [], static fn(array $e): bool => $e['what'] === 'Signed in')), 'DS7: the Dean\'s own sign-in is behind the Sign-ins filter');
[, $spDeanNoSign] = $spGet('/api/admin/audit-logs?q=' . rawurlencode($readTag), $adminAccessToken);
expect_same(0, count(array_filter($spDeanNoSign['entries'] ?? [], static fn(array $e): bool => $e['what'] === 'Signed in')), 'DS7: sign-ins stay hidden without the filter');
[$spIgnoredStatus, $spIgnored] = $spGet('/api/admin/audit-logs?scope=class_work&role=superadmin&card=nonsense&lookup=students&q=' . rawurlencode($spTag), $adminAccessToken);
expect_true($spIgnoredStatus === 200 && ($spIgnored['scope'] ?? 'overview') === 'overview' && !array_key_exists('students', $spIgnored) && ($spIgnored['entries'] ?? []) === ($spDean['entries'] ?? []), 'DS7: scope, role, card and lookup are ignored for the Dean (no error, same rows)');
[, $spSuperView] = $spGet('/api/admin/audit-logs?q=' . rawurlencode($spTag));
expect_same([], $spSuperView['entries'] ?? ['x'], 'DS8: a Dean row that is not an overview code stays out of the Superadmin overview');
[, $spSuperDean] = $spGet('/api/admin/audit-logs?q=' . rawurlencode($readTag));
expect_true(!in_array($readDean['login_email'], array_map(static fn(array $e): string => (string) ($e['who']['email'] ?? ''), $spSuperDean['entries'] ?? []), true), 'DS8: the Superadmin overview lists the Superadmin\'s own rows, not the Dean\'s');
[$spRoleFilter] = $spGet('/api/admin/audit-logs?role=superadmin');
[$spRoleBad] = $spGet('/api/admin/audit-logs?role=nobody');
expect_same([200, 422], [$spRoleFilter, $spRoleBad], 'DS8: the role filter now accepts superadmin and still refuses unknown roles');

// ---- D. Handover and the Dean row (4.3) ----
$spDeanId = (int) $readDean['user_id'];
$spDeanEmail = (string) $readDean['login_email'];
$spToday = (new DateTimeImmutable('now', new DateTimeZone('Asia/Manila')))->format('Y-m-d');
$spFrozen = $spRows('SELECT id, start_date, end_date FROM academic_terms WHERE start_date IS NOT NULL AND end_date IS NOT NULL AND start_date <= ? AND end_date >= ?', [$spToday, $spToday]);
foreach ($spFrozen as $spTerm) { // no term in progress while the handover rules are tried; restored below
    $pdo->prepare("UPDATE academic_terms SET start_date = LEAST(start_date, (?::date - 3)), end_date = (?::date - 2) WHERE id = ?")->execute([$spToday, $spToday, $spTerm['id']]);
}
$spF1 = $saAccount("sp-f1-{$spTag}@bicol-u.edu.ph", 'faculty', "Sp One {$spTag}");
$spF2 = $saAccount("sp-f2-{$spTag}@bicol-u.edu.ph", 'faculty', "Sp Two {$spTag}");
$spF3 = $saAccount("sp-f3-{$spTag}@bicol-u.edu.ph", 'faculty', "Sp Three {$spTag}");
$spOff = $saAccount("sp-off-{$spTag}@bicol-u.edu.ph", 'faculty', "Sp Off {$spTag}");
$spPending = $saAccount("sp-pen-{$spTag}@bicol-u.edu.ph", 'faculty', "Sp Pending {$spTag}");
$spSecretaryUser = $saAccount("sp-sec-{$spTag}@bicol-u.edu.ph", 'secretary', "Sp Secretary {$spTag}", "SP-{$spTag}-S");
$pdo->exec("UPDATE user_accounts SET status = 'Disabled', disabled_at = CURRENT_TIMESTAMP(6) WHERE user_id = {$spOff}");
$pdo->exec("UPDATE user_accounts SET status = 'Pending Activation' WHERE user_id = {$spPending}");
$spEmailOf = static fn(int $id): string => (string) $spOne('SELECT login_email FROM user_accounts WHERE user_id = ?', [$id]);
$spTransfer = static fn(array $body, ?string $token = null): array => $spPost('/api/admin/people/transfer-dean', $body, $token);
$spSnapshot = static fn(): array => [$spRole($spDeanId), $spRole($spF1), $spVersion($spDeanId), $spVersion($spF1), $spCount("SELECT COUNT(*) FROM audit_events WHERE action_code = 'dean_transferred'"), $spOutbox($spDeanEmail), $spOutbox($spEmailOf($spF1))];
$spUntouched = $spSnapshot();
$spReason = 'New Dean appointed';

[$spStatus, $spBody] = $spTransfer(['toUserId' => $spF1, 'reason' => $spReason]);
expect_true($spStatus === 422 && $spField($spBody, 'oldDean') && str_contains(json_encode($spBody), 'Choose what happens to the current Dean.'), '4.3: a missing oldDean is 422 on oldDean');
[$spStatus, $spBody] = $spTransfer(['toUserId' => $spF1, 'oldDean' => 'maybe', 'reason' => $spReason]);
expect_true($spStatus === 422 && $spField($spBody, 'oldDean'), '4.3: another oldDean value is 422 on oldDean');
foreach ([['missing', null], ['short', 'Short'], ['long', str_repeat('x', 241)]] as [$spWhat, $spBadReason]) {
    [$spStatus, $spBody] = $spTransfer(['toUserId' => $spF1, 'oldDean' => 'faculty'] + ($spBadReason === null ? [] : ['reason' => $spBadReason]));
    expect_true($spStatus === 422 && $spField($spBody, 'reason'), "4.3: a {$spWhat} reason is 422 on reason");
}
foreach ([['a Student', $saStudent], ['a Secretary', $spSecretaryUser], ['a deactivated Faculty member', $spOff], ['an invited Faculty member', $spPending], ['the Dean', $spDeanId], ['an unknown account', 999999999]] as [$spWhat, $spTarget]) {
    [$spStatus, $spBody] = $spTransfer(['toUserId' => $spTarget, 'oldDean' => 'faculty', 'reason' => $spReason]);
    expect_true($spStatus === 422 && ($spBody['code'] ?? '') === 'not_active_faculty' && ($spBody['message'] ?? '') === 'Only an active Faculty member can become Dean.', "4.3: {$spWhat} is refused with not_active_faculty");
}
expect_same($spUntouched, $spSnapshot(), '4.3: every refusal so far changed nothing (roles, sessions, audit, email)');

$pdo->exec("INSERT INTO academic_terms (school_year, semester, start_date, end_date) VALUES ('2098-2099', '1ST', CURRENT_DATE - 30, CURRENT_DATE + 30)");
[$spStatus, $spBody] = $spTransfer(['toUserId' => $spF1, 'oldDean' => 'faculty', 'reason' => $spReason]);
$pdo->exec("DELETE FROM academic_terms WHERE school_year = '2098-2099'");
expect_true($spStatus === 409 && ($spBody['code'] ?? '') === 'term_in_progress' && str_starts_with((string) ($spBody['message'] ?? ''), 'A term is in progress (') && str_ends_with((string) ($spBody['message'] ?? ''), 'Hand over the Dean role between terms.'), '4.3: a term in progress refuses the handover with term_in_progress');
expect_same($spUntouched, $spSnapshot(), '4.3: the term refusal changed nothing');

$spCourseId = (int) $spOne("SELECT course_id FROM courses ORDER BY course_id LIMIT 1");
$spBusyClass = $pdo->prepare("INSERT INTO class_sections (cs_name, course_id, instructor_user_id, semester, school_year, status) VALUES (?, ?, ?, '1ST', '2098-2099', 'Active') RETURNING cs_id");
$spBusyClass->execute(["SP-BUSY-{$spTag}", $spCourseId, $spF3]);
$spBusyClassId = (int) $spBusyClass->fetchColumn();
[$spStatus, $spBody] = $spTransfer(['toUserId' => $spF3, 'oldDean' => 'faculty', 'reason' => $spReason]);
expect_true($spStatus === 409 && ($spBody['code'] ?? '') === 'new_dean_has_classes' && ($spBody['classes'][0]['csId'] ?? 0) === $spBusyClassId, '4.3: a new Dean with a class whose term has not ended is refused with new_dean_has_classes and the class list');
expect_same('faculty', $spRole($spF3), '4.3: the class refusal changed nothing');
$pdo->exec("UPDATE class_sections SET archive_reason = 'finished', archived_at = CURRENT_TIMESTAMP(6) WHERE cs_id = {$spBusyClassId}");

// Rollback: a failure inside the transaction leaves both accounts, the sessions, the audit log and the mailbox as they were.
$spTrigger = true;
try {
    $pdo->exec("CREATE FUNCTION sp_block_demotion() RETURNS trigger LANGUAGE plpgsql AS \$f\$ BEGIN RAISE EXCEPTION 'sp rollback fixture'; END \$f\$");
    $pdo->exec("CREATE TRIGGER sp_block_demotion BEFORE UPDATE ON user_accounts FOR EACH ROW WHEN (OLD.user_id = {$spDeanId} AND NEW.role = 'faculty') EXECUTE FUNCTION sp_block_demotion()");
} catch (PDOException $spNoTrigger) {
    $spTrigger = false;
    echo "SKIP: 4.3 rollback check (cannot create the fixture trigger: {$spNoTrigger->getMessage()})\n";
}
if ($spTrigger) {
    [$spStatus] = $spTransfer(['toUserId' => $spF1, 'oldDean' => 'faculty', 'reason' => $spReason]);
    $pdo->exec('DROP TRIGGER sp_block_demotion ON user_accounts');
    $pdo->exec('DROP FUNCTION sp_block_demotion()');
    expect_true($spStatus >= 400, '4.3: a failing handover is reported as an error');
    expect_same($spUntouched, $spSnapshot(), '4.3: a handover that fails midway rolls back entirely (roles, token versions, audit, email)');
}

// Success 1: Faculty member F1 becomes Dean; the outgoing Dean becomes Faculty (still teaches). Both are signed out and emailed.
[$spF1LoginStatus, $spF1Login] = $spLogin($spEmailOf($spF1), $saPass);
$spF1OldToken = (string) ($spF1Login['access_token'] ?? '');
expect_same(200, $spF1LoginStatus, 'Setup: the future Dean signs in before the handover');
$spDeanOldToken = $adminAccessToken;
$spMailBefore = [$spOutbox($spDeanEmail), $spOutbox($spEmailOf($spF1))];
[$spStatus, $spBody] = $spTransfer(['toUserId' => $spF1, 'oldDean' => 'faculty', 'reason' => $spReason]);
expect_true($spStatus === 200 && ($spBody['status'] ?? '') === 'ok' && ($spBody['dean']['userId'] ?? 0) === $spF1 && ($spBody['dean']['isDean'] ?? null) === true && ($spBody['formerDean']['userId'] ?? 0) === $spDeanId && ($spBody['formerDean']['status'] ?? '') === 'active' && ($spBody['formerDean']['isDean'] ?? null) === false, '4.3: the handover answers {status, dean, formerDean}');
expect_same(['admin', 'faculty'], [$spRole($spF1), $spRole($spDeanId)], '4.3: the target becomes admin and the outgoing Dean becomes Faculty');
expect_same('Active', $spOne('SELECT status FROM user_accounts WHERE user_id = ?', [$spDeanId]), '4.3: the outgoing Dean stays active when they become Faculty');
expect_same([0, 0], [$spLiveSessions($spDeanId), $spLiveSessions($spF1)], '4.3: both are signed out everywhere');
expect_same([401, 401], [$spGet('/api/admin/profile', $spDeanOldToken)[0], $spGet('/api/faculty/classes', $spF1OldToken)[0]], '4.3: both old access tokens stop working');
$spTransferAudit = $spAudit('dean_transferred', (string) $spF1);
expect_true(count($spTransferAudit) === 1 && $spTransferAudit[0]['actor_role'] === 'superadmin' && (int) $spTransferAudit[0]['actor_user_id'] === $superUserId && $spTransferAudit[0]['reason'] === $spReason, '4.3: dean_transferred is audited once, actor the Superadmin, with the reason');
expect_same([$spMailBefore[0] + 1, $spMailBefore[1] + 1], [$spOutbox($spDeanEmail), $spOutbox($spEmailOf($spF1))], '4.3: both people are emailed after the commit');
[, $spListed] = $spGet('/api/admin/people?kind=faculty&status=all&q=' . rawurlencode("sp-f1-{$spTag}"));
expect_true(count($spListed['people'] ?? []) === 1 && ($spListed['people'][0]['isDean'] ?? null) === true && ($spListed['people'][0]['kind'] ?? '') === 'faculty', 'DS9: the new Dean is listed under Faculty with isDean true');

// Dean row actions (F1 is the Dean now).
[$spF1Login2Status, $spF1Login2] = $spLogin($spEmailOf($spF1), $saPass);
expect_same(200, $spF1Login2Status, 'Setup: the new Dean signs in');
[$spStatus, $spBody] = $spPost('/api/admin/people/sign-out', ['userId' => $spF1, 'reason' => 'Shared computer left open']);
expect_true($spStatus === 200 && ($spBody['person']['isDean'] ?? null) === true && $spLiveSessions($spF1) === 0 && $spGet('/api/admin/profile', (string) ($spF1Login2['access_token'] ?? ''))[0] === 401, '4.3: sign out everywhere works on the Dean row');
expect_same('superadmin', $spAudit('sessions_ended_by_dean', (string) $spF1)[0]['actor_role'] ?? null, '4.3: the Dean sign-out is audited with actor role superadmin');
$pdo->prepare("INSERT INTO security_tokens (purpose, user_id, mfa_status, mfa_verified_at) VALUES ('mfa_credential', ?, 'enabled', CURRENT_TIMESTAMP(6))")->execute([$spF1]);
[$spStatus, $spBody] = $spPost('/api/admin/people/reset-2fa', ['userId' => $spF1, 'reason' => 'Lost the phone']);
expect_true($spStatus === 200 && ($spBody['person']['twoFactor'] ?? null) === false && count($spAudit('mfa_reset_by_dean', (string) $spF1)) === 1, '4.3: reset 2FA works on the Dean row and is audited');
[$spStatus, $spBody] = $spPost('/api/admin/people/name', ['userId' => $spF1, 'reason' => 'Misspelled at registration', 'name' => ['firstName' => 'Dean', 'lastName' => "Renamed{$spLetters}"]]);
expect_true($spStatus === 200 && ($spBody['person']['name'] ?? '') === "Dean Renamed{$spLetters}" && count($spAudit('account_name_changed_by_dean', (string) $spF1)) === 1, '4.3: edit name works on the Dean row and is audited');
[$spStatus, $spBody] = $spPost('/api/admin/people/deactivate', ['userId' => $spF1, 'reason' => 'Trying to deactivate the Dean']);
expect_true($spStatus === 422 && ($spBody['code'] ?? '') === 'dean_not_deactivatable' && ($spBody['message'] ?? '') === 'The Dean cannot be deactivated. Hand the Dean role to a Faculty member instead.' && $spOne('SELECT status FROM user_accounts WHERE user_id = ?', [$spF1]) === 'Active', '4.3: deactivating the Dean is 422 dean_not_deactivatable and changes nothing');
foreach (['resend', 'revoke'] as $spInvitationAction) {
    [$spStatus, $spBody] = $spPost("/api/admin/people/invitation/{$spInvitationAction}", ['userId' => $spF1]);
    // 4.3 only says the action is not shown for the Dean; the API refuses it (404 person_not_found: invitations are for Faculty and Students).
    expect_true(in_array([$spStatus, $spBody['code'] ?? ''], [[409, 'no_pending_invitation'], [404, 'person_not_found']], true), "4.3: the Dean has no invitation to {$spInvitationAction}");
}
$spMovedDean = "sp-newdean-{$spTag}@bicol-u.edu.ph";
[$spStatus, $spBody] = $spPost('/api/admin/people/move-email', ['userId' => $spF1, 'newEmail' => $spMovedDean, 'reason' => 'Mailbox changed at the college', 'idChecked' => true]);
expect_true($spStatus === 200 && ($spBody['person']['email'] ?? '') === $spMovedDean && ($spBody['person']['isDean'] ?? null) === true && $spRole($spF1) === 'admin', '4.3: move to a new email works on the Dean row and keeps the Dean role');
expect_same('superadmin', $spAudit('account_email_moved', (string) $spF1)[0]['actor_role'] ?? null, '4.3: the Dean email move is audited with actor role superadmin');

// Success 2: oldDean "deactivate" (left the college).
[$spStatus, $spBody] = $spTransfer(['toUserId' => $spF2, 'oldDean' => 'deactivate', 'reason' => 'Dean left the college']);
expect_true($spStatus === 200 && ($spBody['dean']['userId'] ?? 0) === $spF2 && ($spBody['formerDean']['status'] ?? '') === 'deactivated', '4.3: with oldDean deactivate the outgoing Dean is deactivated');
expect_same(['admin', 'faculty', 'Disabled'], [$spRole($spF2), $spRole($spF1), $spOne('SELECT status FROM user_accounts WHERE user_id = ?', [$spF1])], '4.3: F2 is the Dean, F1 is a deactivated Faculty account');
expect_true($spOne('SELECT disabled_at FROM user_accounts WHERE user_id = ?', [$spF1]) !== null && $spLiveSessions($spF1) === 0 && $spLiveSessions($spF2) === 0, '4.3: the deactivated former Dean has disabled_at set and no session');
expect_same(1, count($spAudit('dean_transferred', (string) $spF2)), '4.3: the second handover is audited once');
// Hand the role back to the real Dean so the rest of the suite is unchanged.
[$spStatus, $spBody] = $spTransfer(['toUserId' => $spDeanId, 'oldDean' => 'faculty', 'reason' => 'Dean role returned to the original Dean']);
expect_true($spStatus === 200 && $spRole($spDeanId) === 'admin' && $spRole($spF2) === 'faculty', '4.3: the role can be handed to a former Dean (an active Faculty member)');
[$spReloginStatus, $spRelogin] = $spLogin($spDeanEmail, $demoPasswords['admin@bicol-u.edu.ph']);
expect_same(200, $spReloginStatus, 'The original Dean signs in again');
$adminAccessToken = (string) ($spRelogin['access_token'] ?? '');
foreach ($spFrozen as $spTerm) {
    $pdo->prepare('UPDATE academic_terms SET start_date = ?, end_date = ? WHERE id = ?')->execute([$spTerm['start_date'], $spTerm['end_date'], $spTerm['id']]);
}

// ---- C. Server script and the Superadmin sign-in with required 2FA (D3, D17-D19, DS10-DS14, section 6) ----
$spOrig = $superUserId;
$spCreate = static fn(string $email, string $stdin = "YES\n", string $reason = 'Create the college Superadmin'): array => $mvRun(['create-superadmin', '--email', $email, '--first', 'Sam', '--last', "Super{$spLetters}", '--reason', $reason], $stdin);
$spNewEmail = "sp-super-{$spTag}@bicol-u.edu.ph";
$pdo->exec("UPDATE user_accounts SET role = 'faculty' WHERE user_id = {$spOrig}"); // no Superadmin exists while the create command is tried; undone below
expect_same(0, $spCount("SELECT COUNT(*) FROM user_accounts WHERE role = 'superadmin'"), 'Setup: no Superadmin row while create-superadmin is tried');
[$spCode] = $mvRun(['reset-superadmin-2fa', '--reason', 'Lost the authenticator'], "YES\n");
[$spCode2] = $mvRun(['move-email', '--to', $spNewEmail, '--reason', 'Someone new takes the job'], "YES\n");
expect_true($spCode !== 0 && $spCode2 !== 0, 'Section 6: reset-superadmin-2fa and move-email refuse when there is no Superadmin');
$pdo->prepare("INSERT INTO students (student_number, first_name, last_name, bu_email, status) VALUES (?, 'Sp', 'Taken', ?, 'active')")->execute(["SP-{$spTag}-T", "sp-student-{$spTag}@bicol-u.edu.ph"]);
[$spInviteStatus] = $spPost('/api/admin/faculty-invitations', ['firstName' => 'Pending', 'lastName' => 'Invitee' . $spLetters, 'email' => "sp-invited-{$spTag}@bicol-u.edu.ph"], $adminAccessToken);
expect_same(201, $spInviteStatus, 'Setup: a pending Faculty invitation exists');
$pdo->prepare('INSERT INTO retired_emails (email, user_id, reason) VALUES (?, ?, ?)')->execute(["sp-retired-{$spTag}@bicol-u.edu.ph", $spF1, 'Fixture']);
foreach ([['another domain', "sp-x-{$spTag}@gmail.com"], ['an address an account uses', $superEmail], ['an address a Student record uses', "sp-student-{$spTag}@bicol-u.edu.ph"],
    ['an address a Faculty invitation uses', "sp-invited-{$spTag}@bicol-u.edu.ph"], ['a retired address', "sp-retired-{$spTag}@bicol-u.edu.ph"]] as [$spWhat, $spEmail]) {
    [$spCode] = $spCreate($spEmail);
    expect_true($spCode !== 0 && $spCount("SELECT COUNT(*) FROM user_accounts WHERE role = 'superadmin'") === 0, "D17: create-superadmin refuses {$spWhat} and creates nothing");
}
[$spCode] = $spCreate($spNewEmail, "YES\n", 'short');
[$spCodeNo] = $spCreate($spNewEmail, "no\n");
expect_true($spCode !== 0 && $spCodeNo !== 0 && $spCount('SELECT COUNT(*) FROM user_accounts WHERE login_email = ?', [$spNewEmail]) === 0, 'Section 6: a short reason, or anything but YES, creates nothing');

$spMailBefore = $spOutbox($spNewEmail);
[$spCode, $spOut] = $spCreate(strtoupper($spNewEmail));
expect_same(0, $spCode, 'Section 6: create-superadmin succeeds when no Superadmin exists');
$spNewRow = $spRows("SELECT user_id, login_email, role, status, display_name FROM user_accounts WHERE role = 'superadmin'");
expect_true(count($spNewRow) === 1 && $spNewRow[0]['login_email'] === $spNewEmail && $spNewRow[0]['status'] === 'Pending Activation' && str_starts_with($spNewRow[0]['display_name'], 'Sam '), 'D3, DS3: it creates the one Superadmin as Pending Activation with the lower-cased email and the composed name');
$spNewId = (int) $spNewRow[0]['user_id'];
$spLive = static fn(): array => $spRows("SELECT token_id, (expires_at - issued_at) = INTERVAL '7 days' AS seven FROM security_tokens WHERE user_id = ? AND purpose = 'faculty_invitation' AND used_at IS NULL AND revoked_at IS NULL", [$spNewId]);
$spLiveOne = $spLive();
expect_true(count($spLiveOne) === 1 && in_array($spLiveOne[0]['seven'], [true, 't', '1', 1], true), 'DS3, D19: one set-password link (faculty_invitation, 7 days) is issued');
expect_same($spMailBefore + 1, $spOutbox($spNewEmail), 'D19: the set-password link is emailed to the new address');
// superadmin_invited targets the invitation token (like first_dean_invited); find it by the email in its description.
$spInvitedFor = static fn(string $email): array => $spRows("SELECT actor_role, actor_user_id, reason FROM audit_events WHERE action_code = 'superadmin_invited' AND description LIKE ? ORDER BY event_id", ['%(' . $email . ').']);
$spInvited = $spInvitedFor($spNewEmail);
expect_true(count($spInvited) === 1 && $spInvited[0]['actor_role'] === 'system' && $spInvited[0]['reason'] === 'Create the college Superadmin', 'Section 7: superadmin_invited is audited once as System with the reason');
[$spCode] = $spCreate($spNewEmail);
$spLiveTwo = $spLive();
expect_true($spCode === 0 && $spCount("SELECT COUNT(*) FROM user_accounts WHERE role = 'superadmin'") === 1 && (int) $spOne("SELECT user_id FROM user_accounts WHERE role = 'superadmin'") === $spNewId, 'Section 6: running create-superadmin again for a pending account reuses it');
expect_true(count($spLiveTwo) === 1 && (int) $spLiveTwo[0]['token_id'] !== (int) $spLiveOne[0]['token_id'] && $spOutbox($spNewEmail) === $spMailBefore + 2, 'Section 6: the old link is revoked and one new link is sent');
expect_same(2, count($spInvitedFor($spNewEmail)), 'Section 7: the reissue is audited too');

// DS10: the invitation lookup and activation accept the Superadmin's invitation like the first Dean's.
$pdo->prepare("UPDATE security_tokens SET revoked_at = CURRENT_TIMESTAMP(6), revocation_reason = 'Test fixture' WHERE user_id = ? AND purpose = 'faculty_invitation' AND used_at IS NULL AND revoked_at IS NULL")->execute([$spNewId]);
$spKnownToken = base64url_encode(random_bytes(32));
$spTokenInsert = $pdo->prepare("INSERT INTO security_tokens (purpose, user_id, token_digest, issued_at, expires_at) VALUES ('faculty_invitation', ?, ?, CURRENT_TIMESTAMP(6), CURRENT_TIMESTAMP(6) + INTERVAL '7 days')");
$spTokenInsert->bindValue(1, $spNewId, PDO::PARAM_INT);
pdo_bind_binary($spTokenInsert, 2, hash('sha256', $spKnownToken, true));
$spTokenInsert->execute();
[$spInspectStatus, $spInspect] = integration_http_get_json('/api/auth/faculty/invitation?token=' . rawurlencode($spKnownToken), '');
expect_true($spInspectStatus === 200 && ($spInspect['invitation']['email'] ?? '') === $spNewEmail, 'DS10: the Superadmin invitation can be inspected');
[$spActivateStatus, $spActivate] = integration_http_json('/api/auth/faculty/activate', '', ['token' => $spKnownToken, 'password' => $spPass]);
expect_same(200, $spActivateStatus, 'DS10: accepting the invitation sets the password');
expect_same('/superadmin/sign-in', $spActivate['sign_in_path'] ?? null, '12.8: accepting the Superadmin invitation answers sign_in_path /superadmin/sign-in');
expect_same(['superadmin', 'Active'], [$spRole($spNewId), $spOne('SELECT status FROM user_accounts WHERE user_id = ?', [$spNewId])], 'DS10: the account stays a Superadmin and becomes Active');
expect_true(password_verify($spPass, (string) $spOne('SELECT password_hash FROM user_accounts WHERE user_id = ?', [$spNewId])), 'DS10: the password the person typed is the stored one');
expect_same(400, integration_http_json('/api/auth/faculty/activate', '', ['token' => $spKnownToken, 'password' => 'Another1!Passw0rd'])[0], 'DS10: a used invitation cannot be accepted again');
[$spCode] = $spCreate("sp-other-{$spTag}@bicol-u.edu.ph");
expect_true($spCode !== 0 && $spCount("SELECT COUNT(*) FROM user_accounts WHERE role = 'superadmin'") === 1 && $spOutbox("sp-other-{$spTag}@bicol-u.edu.ph") === 0, 'Section 6: create-superadmin refuses a second Superadmin once one is Active');

// DS11: no 2FA yet -> no session, only a short-lived setup token.
$spSessionsBefore = $spCount('SELECT COUNT(*) FROM auth_sessions WHERE user_id = ?', [$spNewId]);
expect_same(401, $spLogin($spNewEmail, 'Wrong1!Passw0rd', true)[0], 'DS11: a wrong password is refused as for anyone');
[$spLoginStatus, $spLoginBody] = $spLogin($spNewEmail, $spPass, true);
expect_true($spLoginStatus === 200 && ($spLoginBody['type'] ?? '') === 'two_factor_setup_required' && ($spLoginBody['two_factor_required'] ?? null) === true && ($spLoginBody['two_factor_enrolled'] ?? null) === false
    && is_string($spLoginBody['two_factor_setup_token'] ?? null) && ($spLoginBody['expires_in'] ?? 0) === 300, 'DS11: a Superadmin without 2FA gets two_factor_setup_required with a 300-second setup token');
expect_true(!array_key_exists('access_token', $spLoginBody) && !array_key_exists('user', $spLoginBody) && $spCount('SELECT COUNT(*) FROM auth_sessions WHERE user_id = ?', [$spNewId]) === $spSessionsBefore, 'DS11: no session and no access token exist yet');
$spSetup = (string) $spLoginBody['two_factor_setup_token'];
foreach ([['GET', '/api/admin/overview'], ['GET', '/api/admin/profile'], ['GET', '/api/auth/me'], ['GET', '/api/auth/mfa/settings'], ['POST', '/api/auth/mfa/settings/recovery-codes'], ['POST', '/api/auth/mfa/settings/revoke'],
    // Logout is left out: it works from the refresh cookie, ignores any Bearer token and answers 200 without opening anything.
    ['POST', '/api/auth/mfa/verify'], ['POST', '/api/auth/refresh'], ['GET', '/api/admin/people']] as [$spMethod, $spPath]) {
    expect_same(401, $spMethod === 'GET' ? integration_http_get_json($spPath, $spSetup)[0] : integration_http_json($spPath, $spSetup, ['code' => '123456'])[0], "DS12: the setup token opens nothing else ({$spMethod} {$spPath} is 401)");
}
// DS12: enrol with the setup token; the session exists only after the code is confirmed.
[$spStartStatus, $spStart] = integration_http_json('/api/auth/mfa/enroll/start', $spSetup, []);
expect_true($spStartStatus === 200 && is_string($spStart['confirmation_token'] ?? null) && is_string($spStart['base32_secret'] ?? null), 'DS12: enroll/start accepts the setup token');
$spSecret = (string) $spStart['base32_secret'];
[$spWrongStatus, $spWrong] = integration_http_json('/api/auth/mfa/enroll/confirm', $spSetup, ['confirmation_token' => $spStart['confirmation_token'], 'code' => $spTotp($spSecret) === '000000' ? '111111' : '000000']);
expect_true($spWrongStatus >= 400 && !array_key_exists('access_token', $spWrong) && $spCount('SELECT COUNT(*) FROM auth_sessions WHERE user_id = ?', [$spNewId]) === $spSessionsBefore, 'DS12: a wrong code confirms nothing and opens no session');
[$spConfirmStatus, $spConfirm] = integration_http_json('/api/auth/mfa/enroll/confirm', $spSetup, ['confirmation_token' => $spStart['confirmation_token'], 'code' => $spTotp($spSecret)]);
expect_true($spConfirmStatus === 200 && is_array($spConfirm['recovery_codes'] ?? null) && count($spConfirm['recovery_codes']) === 8 && is_string($spConfirm['access_token'] ?? null), 'DS12: confirm stores the authenticator, returns the 8 recovery codes once and issues the session');
$spSession = (string) $spConfirm['access_token'];
expect_same([200, 200], [$spGet('/api/admin/overview', $spSession)[0], $spGet('/api/admin/profile', $spSession)[0]], 'DS12: the new session opens the Superadmin pages');
expect_same($spSecret, $spSecretOf($spNewId), 'DS12: the authenticator that was set up is the stored one');
// mfa_enrollment_completed targets the authenticator token; count it by its actor.
expect_true($spCount("SELECT COUNT(*) FROM audit_events WHERE action_code = 'mfa_enrollment_completed' AND actor_user_id = ?", [$spNewId]) === 1 && $spCount("SELECT COUNT(*) FROM audit_events WHERE action_code = 'login_success' AND actor_user_id = ?", [$spNewId]) >= 1, 'DS12: 2FA turned on and login_success are audited');
expect_same(401, integration_http_json('/api/auth/mfa/enroll/start', $spSetup, [])[0] === 200 ? 0 : 401, 'DS12: once 2FA exists the setup token no longer starts an enrolment');

// DS13: 2FA cannot be turned off; recovery codes can be regenerated. DS14: the login email is read-only. D5: Change Name works as for the Dean.
$spForgetStep($spNewId);
[$spRevokeStatus, $spRevoke] = $spPost('/api/auth/mfa/settings/revoke', ['code' => $spTotp($spSecret)], $spSession);
expect_true($spRevokeStatus === 403 && ($spRevoke['code'] ?? '') === 'two_factor_required' && ($spRevoke['message'] ?? '') === '2FA is required for the Superadmin and cannot be turned off.' && $spSecretOf($spNewId) === $spSecret, 'DS13: turning 2FA off is refused with 403 two_factor_required and the authenticator stays');
$spForgetStep($spNewId);
[$spRegenStatus, $spRegen] = $spPost('/api/auth/mfa/settings/recovery-codes', ['code' => $spTotp($spSecret)], $spSession);
expect_true($spRegenStatus === 200 && is_array($spRegen['recovery_codes'] ?? null) && count($spRegen['recovery_codes']) >= 1, 'DS13: regenerating recovery codes works as for the Dean');
$spForgetStep($spNewId);
[$spNameStatus, $spName] = $spPost('/api/admin/profile', ['prefix' => '', 'firstName' => 'Sam', 'middleName' => '', 'lastName' => "Renamed{$spLetters}", 'suffix' => '', 'code' => $spTotp($spSecret)], $spSession);
$spForgetStep($spNewId);
// An email slipped into the same request is refused or ignored; either way the login email stays (DS14, checked below).
$spPost('/api/admin/profile', ['prefix' => '', 'firstName' => 'Sam', 'middleName' => '', 'lastName' => "Hijack{$spLetters}", 'suffix' => '', 'email' => "sp-hijack-{$spTag}@bicol-u.edu.ph", 'code' => $spTotp($spSecret)], $spSession);
expect_true($spNameStatus === 200 && ($spName['name'] ?? '') === "Sam Renamed{$spLetters}", 'D5: the Superadmin changes its own name in Profile like the Dean');
expect_same($spNewEmail, $spOne('SELECT login_email FROM user_accounts WHERE user_id = ?', [$spNewId]), 'DS14: the Superadmin login email does not change through Profile');
[$spResetRequest] = integration_http_json('/api/auth/password/reset-request', '', ['email' => $spNewEmail]);
expect_true($spResetRequest === 200 && $spCount("SELECT COUNT(*) FROM security_tokens WHERE user_id = ? AND purpose = 'password_reset' AND used_at IS NULL AND revoked_at IS NULL", [$spNewId]) === 1, 'D5: Forgot Password works for the Superadmin as for the Dean');

// With 2FA the sign-in uses the existing code step.
$spForgetStep($spNewId);
[$spChallengeStatus, $spChallenge] = $spLogin($spNewEmail, $spPass, true);
expect_true($spChallengeStatus === 200 && ($spChallenge['type'] ?? '') === 'two_factor_required' && is_string($spChallenge['two_factor_challenge_token'] ?? null), 'DS11: a Superadmin with 2FA gets the existing code step');
[$spVerifyStatus, $spVerify] = integration_http_json('/api/auth/mfa/verify', (string) $spChallenge['two_factor_challenge_token'], ['code' => $spTotp($spSecret)]);
expect_true($spVerifyStatus === 200 && is_string($spVerify['access_token'] ?? null) && $spGet('/api/admin/overview', (string) $spVerify['access_token'])[0] === 200, 'DS11: the code opens the session');

// 12.8: the Superadmin signs in on /superadmin/sign-in only; every other role signs in on /login only. A wrong page answers and counts like a wrong password.
$spPageAudit = static fn(string $like): int => $spCount("SELECT COUNT(*) FROM audit_events WHERE action_code = 'login_failed' AND description LIKE ?", [$like]);
$spWrongPageRows = static fn(string $email): int => $spPageAudit("%{$email}: wrong sign-in page.");
[$spPageStatus, $spPageBody] = $spLogin($spNewEmail, $spPass);
expect_true($spPageStatus === 401 && ($spPageBody['message'] ?? '') === 'Invalid credentials.', '12.8: the Superadmin on /login is refused as 401 "Invalid credentials."');
expect_true(!array_key_exists('access_token', $spPageBody) && !array_key_exists('two_factor_challenge_token', $spPageBody) && !array_key_exists('two_factor_setup_token', $spPageBody), '12.8: the refusal carries no token and no 2FA step');
expect_same(1, $spWrongPageRows($spNewEmail), '12.8: the Superadmin on /login writes one login_failed audit row ending "wrong sign-in page."');
$spForgetStep($spNewId);
expect_same('two_factor_required', $spLogin($spNewEmail, $spPass, true)[1]['type'] ?? null, '12.8: the Superadmin on /superadmin/sign-in reaches the 2FA step as before');
[$spPageStatus, $spPageBody] = $spLogin($spEmailOf($spF2), $saPass, true);
expect_true($spPageStatus === 401 && ($spPageBody['message'] ?? '') === 'Invalid credentials.', '12.8: Faculty on /superadmin/sign-in is refused as 401 "Invalid credentials."');
expect_same(1, $spWrongPageRows($spEmailOf($spF2)), '12.8: Faculty on the Superadmin page writes one "wrong sign-in page." audit row');
expect_same(200, $spLogin($spEmailOf($spF2), $saPass)[0], '12.8: the same Faculty account still signs in on /login');
foreach ([['Dean', $spDeanEmail, $demoPasswords['admin@bicol-u.edu.ph']], ['Secretary', $spEmailOf($spSecretaryUser), $saPass]] as [$spRoleName, $spRoleEmail, $spRolePass]) {
    expect_same(401, $spLogin($spRoleEmail, $spRolePass, true)[0], "12.8: the {$spRoleName} on /superadmin/sign-in is refused");
    expect_same(200, $spLogin($spRoleEmail, $spRolePass)[0], "12.8: the {$spRoleName} still signs in on /login");
}
// A wrong password on the wrong page is the ordinary wrong-password path (no "wrong sign-in page" row).
$spBefore = $spWrongPageRows($spEmailOf($spF2));
expect_same(401, $spLogin($spEmailOf($spF2), 'Wrong1!Passw0rd', true)[0], '12.8: a wrong password on the wrong page is refused');
expect_same($spBefore, $spWrongPageRows($spEmailOf($spF2)), '12.8: a wrong password on the wrong page is audited as a wrong password, not as the wrong page');
// The page check comes before the status check: a deactivated account with the right password gets 401, not 403.
expect_same(401, $spLogin($spEmailOf($spOff), $saPass, true)[0], '12.8: a deactivated Faculty account on the Superadmin page is 401');
expect_same(403, $spLogin($spEmailOf($spOff), $saPass)[0], '12.8: the deactivated account on /login keeps its normal 403');
// A bad value is a 400 and counts nowhere.
foreach (['login', 'Superadmin', '', 'admin'] as $spBadPage) {
    [$spBadStatus, $spBad] = integration_http_json('/api/auth/login', '', ['email' => $spNewEmail, 'password' => $spPass, 'sign_in_page' => $spBadPage]);
    expect_true($spBadStatus === 400 && $spField($spBad, 'sign_in_page'), '12.8: sign_in_page ' . json_encode($spBadPage) . ' is a 400 on sign_in_page');
}
expect_same(400, integration_http_json('/api/auth/login', '', ['email' => $spNewEmail, 'password' => $spPass, 'sign_in_page' => null])[0], '12.8: sign_in_page null is a 400');
expect_same(400, integration_http_json('/api/auth/google', '', ['credential' => 'x', 'sign_in_page' => 'login'])[0], '12.8: Google sign-in with a bad sign_in_page is a 400');
// Wrong-page refusals count toward the per-email lock: the sixth try is blocked even on the right page with the right password.
$spLockId = $saAccount("sp-lock-{$spTag}@bicol-u.edu.ph", 'faculty', "Sp Lock {$spTag}");
$spLockEmail = $spEmailOf($spLockId);
for ($spTry = 1; $spTry <= 5; $spTry++) { // like a wrong password, the fifth failure is the one that starts the lock
    expect_same($spTry < 5 ? 401 : 429, $spLogin($spLockEmail, $saPass, true)[0], "12.8: wrong-page try {$spTry} of 5 is " . ($spTry < 5 ? '401' : '429 (the lock starts)'));
}
expect_same(5, $spWrongPageRows($spLockEmail), '12.8: each of the five wrong-page tries is audited');
expect_same(429, $spLogin($spLockEmail, $saPass)[0], '12.8: five wrong-page refusals lock the email: the sixth try on the right page is blocked');

// 12.8: reset-confirm answers the sign-in page of the account's role.
$spResetRaw = bin2hex(random_bytes(16));
$pdo->prepare("INSERT INTO security_tokens (purpose, user_id, secret_hash, issued_at, expires_at) VALUES ('password_reset', ?, ?, CURRENT_TIMESTAMP(6), CURRENT_TIMESTAMP(6) + INTERVAL '1 hour')")->execute([$spNewId, hash('sha256', $spResetRaw)]);
[$spResetStatus, $spResetBody] = integration_http_json('/api/auth/password/reset-confirm', '', ['token' => $spResetRaw, 'password' => 'Superadm1n!Reset2']);
expect_true($spResetStatus === 200 && ($spResetBody['sign_in_path'] ?? null) === '/superadmin/sign-in', '12.8: the Superadmin password reset answers sign_in_path /superadmin/sign-in');
$pdo->prepare('UPDATE user_accounts SET password_hash = ? WHERE user_id = ?')->execute([password_hash_user_password($spPass), $spNewId]); // the later checks use $spPass
$spFacultyResetRaw = bin2hex(random_bytes(16));
$pdo->prepare("INSERT INTO security_tokens (purpose, user_id, secret_hash, issued_at, expires_at) VALUES ('password_reset', ?, ?, CURRENT_TIMESTAMP(6), CURRENT_TIMESTAMP(6) + INTERVAL '1 hour')")->execute([$spF3, hash('sha256', $spFacultyResetRaw)]);
[$spResetStatus, $spResetBody] = integration_http_json('/api/auth/password/reset-confirm', '', ['token' => $spFacultyResetRaw, 'password' => 'Faculty!Reset2Pass']);
expect_true($spResetStatus === 200 && ($spResetBody['sign_in_path'] ?? null) === '/login', '12.8: a Faculty password reset answers sign_in_path /login');

// D18: lockout reset on the server.
$spOldSession = (string) $spVerify['access_token'];
[$spCode] = $mvRun(['reset-superadmin-2fa', '--reason', 'Lost the authenticator'], "no\n");
expect_true($spCode !== 0 && $spSecretOf($spNewId) === $spSecret, 'Section 6: reset-superadmin-2fa without YES changes nothing');
[$spCode] = $mvRun(['reset-superadmin-2fa', '--reason', 'Lost the authenticator and the recovery codes'], "YES\n");
expect_same(0, $spCode, 'D18: reset-superadmin-2fa succeeds for a Superadmin with 2FA');
expect_same(0, $spCount("SELECT COUNT(*) FROM security_tokens WHERE user_id = ? AND purpose IN ('mfa_credential', 'mfa_recovery') AND revoked_at IS NULL", [$spNewId]), 'D18: the authenticator and the recovery codes are revoked');
expect_true($spLiveSessions($spNewId) === 0 && $spGet('/api/admin/overview', $spOldSession)[0] === 401, 'D18: the Superadmin is signed out everywhere');
$spReset = $spAudit('superadmin_2fa_reset', (string) $spNewId);
expect_true(count($spReset) === 1 && $spReset[0]['actor_role'] === 'system' && $spReset[0]['reason'] === 'Lost the authenticator and the recovery codes', 'Section 7: superadmin_2fa_reset is audited once as System with the reason');
[$spCode] = $mvRun(['reset-superadmin-2fa', '--reason', 'Resetting a second time'], "YES\n");
expect_true($spCode !== 0 && count($spAudit('superadmin_2fa_reset', (string) $spNewId)) === 1, 'Section 6: reset-superadmin-2fa refuses when the Superadmin has no 2FA');
expect_same('two_factor_setup_required', $spLogin($spNewEmail, $spPass, true)[1]['type'] ?? null, 'D18: the next sign-in opens Set up 2FA again');

// D4, D17, section 6: move-email moves the Superadmin's email; the Dean's moves are in the app.
$spMoved = "sp-super-moved-{$spTag}@bicol-u.edu.ph";
foreach ([['another domain', "sp-m-{$spTag}@gmail.com"], ['an address an account uses', $superEmail], ['a retired address', "sp-retired-{$spTag}@bicol-u.edu.ph"]] as [$spWhat, $spEmail]) {
    [$spCode] = $mvRun(['move-email', '--to', $spEmail, '--reason', 'Someone new takes the job'], "YES\n");
    expect_true($spCode !== 0 && $spOne('SELECT login_email FROM user_accounts WHERE user_id = ?', [$spNewId]) === $spNewEmail, "D17: move-email refuses {$spWhat}");
}
$pdo->prepare('UPDATE user_accounts SET google_subject = ? WHERE user_id = ?')->execute(["google-{$spTag}", $spNewId]);
$spMailBefore = [$spOutbox($spNewEmail), $spOutbox($spMoved)];
[$spCode] = $mvRun(['move-email', '--to', strtoupper($spMoved), '--reason', 'Someone new takes the job'], "YES\n");
expect_same(0, $spCode, 'D4: move-email moves the Superadmin to a new address');
expect_same([$spMoved, $spNewEmail], [$spOne('SELECT login_email FROM user_accounts WHERE user_id = ?', [$spNewId]), $spOne('SELECT email FROM retired_emails WHERE user_id = ?', [$spNewId])], 'D17: the email changes and the old address is retired');
expect_true($spLiveSessions($spNewId) === 0 && $spOne('SELECT google_subject FROM user_accounts WHERE user_id = ?', [$spNewId]) === null, 'D4: the Superadmin is signed out and the Google link is removed');
expect_true($spLogin($spMoved, $spPass, true)[0] !== 200 && $spLogin($spNewEmail, $spPass, true)[0] !== 200, 'D4: the old password no longer signs in on either address');
expect_same([$spMailBefore[0], $spMailBefore[1] + 1], [$spOutbox($spNewEmail), $spOutbox($spMoved)], 'D4: a set-password link goes to the new address only');
expect_same(1, count($spAudit('account_email_moved', (string) $spNewId)), 'Section 7: the move is audited once');
[$spCode] = $mvRun(['unretire-email', $spNewEmail, '--reason', 'College gave it back'], "YES\n");
expect_same(0, $spCode, 'Section 6: unretire-email is unchanged');

// Put the original Superadmin back; the new test account becomes a deactivated Faculty row (the one-Superadmin index frees the slot first).
$pdo->exec("UPDATE user_accounts SET role = 'faculty', status = 'Disabled', disabled_at = CURRENT_TIMESTAMP(6) WHERE user_id = {$spNewId}");
$pdo->exec("UPDATE user_accounts SET role = 'superadmin' WHERE user_id = {$spOrig}");
expect_same([$spOrig], array_map('intval', array_column($spRows("SELECT user_id FROM user_accounts WHERE role = 'superadmin'"), 'user_id')), 'Cleanup: the original Superadmin is the one Superadmin again');
$superAccessToken = $superSession();
expect_same(200, $spGet('/api/admin/overview')[0], 'Cleanup: the Superadmin session works again for the rest of the suite');
