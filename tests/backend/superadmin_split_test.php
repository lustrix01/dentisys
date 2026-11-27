<?php

declare(strict_types=1);

// Backlog 13.9 Dean and Superadmin split, DB-free checks written from docs/contracts/dean-superadmin-split.md.
// The database and HTTP behaviour is in tests/database/superadmin_split_integration.php.
require_once __DIR__ . '/../../backend/app/config.php';
require_once __DIR__ . '/../../backend/app/jwt.php';
require_once __DIR__ . '/../../backend/app/validation.php';
require_once __DIR__ . '/../../backend/app/account_identity.php';
require_once __DIR__ . '/../../backend/app/audit_catalogue.php';
require_once __DIR__ . '/../../backend/app/auth_runtime.php';

function assert_split(bool $condition, string $label): void
{
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$label}\n");
        exit(1);
    }
    echo "PASS: {$label}\n";
}

$root = __DIR__ . '/../../';
$read = static fn(string $rel): string => (string) file_get_contents($root . $rel);
$routes = $read('backend/routes/api.php');
$admin = $read('backend/controllers/AdminController.php');
$mfa = $read('backend/controllers/MfaController.php');
$script = $read('backend/bin/account-admin.php');

// ---- DS1, DS2, DS4: migration 068 ----
$migrationPath = $root . 'database/migrations/068_superadmin_role.sql';
assert_split(is_file($migrationPath), 'Migration 068_superadmin_role.sql exists');
$m068 = (string) file_get_contents($migrationPath);
assert_split(str_contains($m068, 'ck_user_accounts_role') && str_contains($m068, 'ck_role_permissions_role') && substr_count($m068, "'superadmin'") >= 3, 'DS1: both role checks are dropped and re-added with superadmin');
assert_split(preg_match('/CREATE UNIQUE INDEX\s+(IF NOT EXISTS\s+)?uq_user_accounts_one_superadmin\s+ON\s+user_accounts\s*\(\s*\(\s*role\s*\)\s*\)\s+WHERE\s+role\s*=\s*\'superadmin\'/i', $m068) === 1, 'DS2: a partial unique index on (role) allows one superadmin row');
assert_split(str_contains($m068, 'account_identity_email_role_conflict') && str_contains(substr($m068, (int) strpos($m068, 'account_identity_email_role_conflict')), 'superadmin'), 'DS4: the identity email-role conflict function treats superadmin as staff');
assert_split(!preg_match('/\b(DELETE\s+FROM|DROP\s+TABLE|TRUNCATE)\b/i', $m068), 'DS1: migration 068 is additive (no row deletes, no table drops)');

// ---- Routes (4.1, 4.3) ----
foreach ([['POST', '/api/auth/mfa/enroll/start'], ['POST', '/api/auth/mfa/enroll/confirm'], ['POST', '/api/auth/mfa/settings/revoke'], ['POST', '/api/auth/faculty/invitation'], ['POST', '/api/auth/faculty/activate']] as [$method, $path]) {
    // The invitation lookup is a GET today; accept either verb for it.
    assert_split(str_contains($routes, "'path' => '{$path}'"), "{$path} stays routed (URLs do not change)");
}

// 4.1: which verify function guards which handler.
$handlerBody = static function (string $handler) use ($root): ?string {
    foreach (glob($root . 'backend/controllers/*.php') ?: [] as $file) {
        $src = (string) file_get_contents($file);
        if (preg_match('/^function ' . preg_quote($handler, '/') . '\(/m', $src, $m, PREG_OFFSET_CAPTURE) === 1) {
            $start = $m[0][1];
            $next = strpos($src, "\nfunction ", $start + 10);
            return substr($src, $start, ($next === false ? strlen($src) : $next) - $start);
        }
    }
    return null;
};
$routeHandler = static function (string $method, string $path) use ($routes): ?string {
    return preg_match("/'method' => '{$method}',\s*'path' => '" . preg_quote($path, '/') . "',\s*'handler' => '([a-z0-9_]+)'/", $routes, $m) === 1 ? $m[1] : null;
};
assert_split($routeHandler('POST', '/api/admin/people/transfer-dean') === 'handle_admin_people', 'POST /api/admin/people/transfer-dean is registered on the people handler');
$superOnly = [['GET', '/api/admin/academic-terms'], ['POST', '/api/admin/academic-terms'], ['POST', '/api/admin/academic-terms/preview'], ['POST', '/api/admin/academic-terms/delete'], ['POST', '/api/admin/academic-terms/copy'],
    ['GET', '/api/admin/courses'], ['POST', '/api/admin/courses/update'], ['POST', '/api/admin/courses/retire'], ['POST', '/api/admin/courses/restore'],
    ['GET', '/api/admin/rooms'], ['POST', '/api/admin/rooms'], ['GET', '/api/admin/overview'], ['GET', '/api/admin/people'], ['POST', '/api/admin/people/transfer-dean'],
    ['POST', '/api/admin/people/deactivate'], ['POST', '/api/admin/people/move-email'], ['GET', '/api/admin/face-flags'], ['POST', '/api/admin/face-flags/dismiss'],
    ['GET', '/api/admin/face-revoke-requests'], ['POST', '/api/admin/face-revoke-requests/approve'], ['POST', '/api/admin/face-revoke-requests/reject']];
foreach ($superOnly as [$method, $path]) {
    $handler = $routeHandler($method, $path);
    $body = $handler === null ? null : $handlerBody($handler);
    if ($body !== null && preg_match('/^\s*return\s+([a-z0-9_]+)\(|^\s*([a-z0-9_]+)\(/m', substr($body, (int) strpos($body, '{') + 1), $dm)) {
        $delegate = $dm[1] !== '' ? $dm[1] : $dm[2];
        $delegateBody = $handlerBody($delegate);
        if ($delegateBody !== null) $body .= "\n" . $delegateBody;
    }
    assert_split($body !== null && str_contains($body, 'superadmin_verify_auth(') && !preg_match('/(?<!super)admin_verify_auth\(/', $body), "4.1: {$method} {$path} checks the Superadmin role only");
}
$deanOnly = [['GET', '/api/admin/dashboard/kpis'], ['GET', '/api/admin/reports/summary'], ['GET', '/api/admin/faculty-invitations'], ['POST', '/api/admin/faculty-invitations'], ['GET', '/api/admin/email-logs']];
foreach ($deanOnly as [$method, $path]) {
    $handler = $routeHandler($method, $path);
    $body = $handler === null ? null : $handlerBody($handler);
    assert_split($body !== null && !str_contains($body, 'superadmin_verify_auth('), "4.1: {$method} {$path} stays a Dean route (no Superadmin check)");
}
assert_split(preg_match('/function superadmin_verify_auth\(PDO \$pdo, array \$config\)/', $admin) === 1 && str_contains($admin, 'Access denied. Superadmin privileges required.'), '4.1: superadmin_verify_auth exists with the 403 message');
$verifySuper = (string) substr($admin, (int) strpos($admin, 'function superadmin_verify_auth'), 1800);
assert_split(str_contains($verifySuper, "'superadmin'") && str_contains($verifySuper, '403'), '4.1: superadmin_verify_auth requires role superadmin and answers 403');
assert_split(!str_contains($read('backend/controllers/SuperadminController.php'), 'X-DentiSys-View'), 'No Superadmin mode header is read (the role is the account)');

// ---- jwt.php accepts the role ----
$key = str_repeat('A', 32);
$superClaims = ['sub' => 7, 'role' => 'superadmin', 'sid' => '550e8400-e29b-41d4-a716-446655440000', 'jti' => 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
    'token_type' => 'access', 'token_version' => 0, 'iat' => 1000000000, 'exp' => 2000000000];
$decoded = jwt_decode(jwt_encode($superClaims, $key), $key, 'access', fn(): int => 1500000000);
assert_split(($decoded['role'] ?? null) === 'superadmin', 'jwt.php accepts role superadmin in an access token');

// ---- DS11-DS13: Superadmin sign-in and 2FA (server answers, source level; behaviour is in the integration test) ----
assert_split(str_contains($mfa, 'two_factor_required') && str_contains($mfa, '2FA is required for the Superadmin and cannot be turned off.'), 'DS13: revoke is refused with two_factor_required and the contract message');
$authRuntime = $read('backend/app/auth_runtime.php');
assert_split(str_contains($authRuntime, 'two_factor_setup_required') && str_contains($authRuntime, 'two_factor_setup_token'), 'DS11: sign-in can answer with the setup-required type and setup token');

// ---- Audit catalogue (section 7) ----
foreach (['superadmin_invited' => ['Superadmin invited', AUDIT_AREA_PEOPLE], 'superadmin_2fa_reset' => ['Superadmin 2FA reset on the server', AUDIT_AREA_SECURITY]] as $code => [$label, $area]) {
    $info = audit_code_info($code);
    assert_split($info['label'] === $label && $info['area'] === $area && $info['deanVisible'] === true, "{$code} is labelled, in its area and in the Superadmin overview");
}
foreach (['mfa_reset_by_dean' => '2FA reset', 'sessions_ended_by_dean' => 'Signed out everywhere', 'student_invitation_resent_by_dean' => 'Student invitation resent',
    'student_invitation_revoked_by_dean' => 'Student invitation revoked', 'account_name_changed_by_dean' => 'Name corrected', 'dean_transferred' => 'Dean role handed over'] as $code => $label) {
    assert_split(audit_code_info($code)['label'] === $label, "Section 7: {$code} reads \"{$label}\" (neutral, the Who column shows the actor)");
}
assert_split(audit_code_info('mfa_reset_by_dean')['deanVisible'] === true && audit_code_info('dean_transferred')['deanVisible'] === true, 'Section 7: existing people codes stay in the Superadmin overview');

// ---- DS7: Dean audit-logs is own rows only; scope, role, card and lookup are ignored ----
$deanParams = audit_read_params(['scope' => 'class_work', 'role' => 'nonsense', 'card' => 'nonsense', 'facultyId' => '3', 'classId' => '9', 'studentId' => '12'], 'admin');
assert_split($deanParams['scope'] === 'overview' && $deanParams['role'] === '' && $deanParams['card'] === '' && $deanParams['facultyId'] === '' && $deanParams['classId'] === '' && $deanParams['studentId'] === '', 'DS7: the Dean query ignores scope, role, card and the class-work filters (no error)');
assert_split(audit_read_params(['scope' => 'class_work', 'role' => 'faculty', 'card' => 'mfaTurnedOff'], 'faculty')['scope'] === 'overview', 'DS7: Faculty (the model for the Dean) ignores the same values');
// ---- DS8: Superadmin keeps today's Dean behaviour ----
$super = audit_read_params(['scope' => 'class_work', 'area' => 'Grading', 'facultyId' => '3', 'classId' => '9', 'studentId' => '12', 'role' => 'superadmin', 'card' => 'mfaTurnedOff'], 'superadmin');
assert_split($super['scope'] === 'class_work' && $super['area'] === 'Grading' && $super['facultyId'] === '3' && $super['classId'] === '9' && $super['studentId'] === '12' && $super['role'] === 'superadmin' && $super['card'] === 'mfaTurnedOff', 'DS8: the Superadmin query takes scope, class-work filters, role superadmin and attention cards');
assert_split(audit_read_params([], 'superadmin')['scope'] === 'overview', 'DS8: the Superadmin query defaults to the overview');
foreach ([['role' => 'bogus'], ['card' => 'bogus'], ['scope' => 'everything']] as $bad) {
    try {
        audit_read_params($bad, 'superadmin');
        assert_split(false, 'DS8: the Superadmin query rejects ' . json_encode($bad));
    } catch (ValidationException) {
        assert_split(true, 'DS8: the Superadmin query rejects ' . json_encode($bad));
    }
}
assert_split(in_array(AUDIT_AREA_PEOPLE, audit_areas_for('superadmin'), true) && in_array(AUDIT_AREA_SETTINGS, audit_areas_for('superadmin'), true) && in_array(AUDIT_AREA_SECURITY, audit_areas_for('superadmin'), true), 'DS8: the Superadmin areas are the old Dean overview areas');

// ---- Section 8 wording ----
assert_split((new InactiveAccountException('Disabled'))->getMessage() === 'Account status: Disabled. Contact the Superadmin.', 'Section 8: a deactivated sign-in says "Contact the Superadmin."');
$faculty = $read('backend/controllers/FacultyController.php');
assert_split(substr_count($faculty, "'This course was retired. Ask the Superadmin to restore it.', 409, 'course_retired'") === 2, 'Section 8: a retired course says "Ask the Superadmin to restore it."');
$stale = [];
foreach (array_merge(glob($root . 'backend/app/*.php') ?: [], glob($root . 'backend/controllers/*.php') ?: [], ['backend/bin/account-admin.php' => $root . 'backend/bin/account-admin.php']) as $file) {
    foreach (preg_split('/\R/', (string) file_get_contents($file)) ?: [] as $n => $line) {
        $trim = ltrim($line);
        if (str_starts_with($trim, '*') || str_starts_with($trim, '//') || str_starts_with($trim, '/*')) {
            continue; // comments may keep the old words
        }
        if (preg_match('/Contact the Dean|Ask the Dean|retired by the Dean|by the Dean\'|Reset by the Dean|Signed out by the Dean|contact the Dean/', $line) === 1) {
            $stale[] = basename($file) . ':' . ($n + 1);
        }
    }
}
assert_split($stale === [], 'Section 8: no user-visible "the Dean" wording is left where the Superadmin now acts (' . implode(', ', $stale) . ')');

// ---- 4.3: Dean row actions and the handover (source level; HTTP behaviour is in the integration test) ----
$people = $read('backend/controllers/SuperadminController.php');
assert_split(str_contains($people, "'dean_not_deactivatable'") && str_contains($people, 'The Dean cannot be deactivated. Hand the Dean role to a Faculty member instead.'), '4.3: a Dean deactivation is refused with dean_not_deactivatable and its message');
assert_split(str_contains($people, 'Email moves are for accounts that have signed up.'), '4.3: move_not_allowed carries the new message');
$allBackend = '';
foreach (array_merge(glob($root . 'backend/app/*.php') ?: [], glob($root . 'backend/controllers/*.php') ?: []) as $file) {
    $allBackend .= (string) file_get_contents($file);
}
foreach (["'not_active_faculty'", 'Only an active Faculty member can become Dean.', "'term_in_progress'", "'new_dean_has_classes'", 'Choose what happens to the current Dean.', "'dean_transferred'"] as $needle) {
    assert_split(str_contains($allBackend, $needle), "4.3: the transfer-dean logic knows {$needle}");
}

// ---- Section 6: server script ----
foreach (["'create-superadmin'", "'reset-superadmin-2fa'", "'move-email'", "'unretire-email'", 'Type YES to continue', "'role' => 'system'", '--skip-if-exists', 'Superadmin already exists; nothing to do.'] as $needle) {
    assert_split(str_contains($script, $needle), "Section 6: account-admin.php has {$needle}");
}
foreach (["'superadmin_invited'", "'superadmin_2fa_reset'"] as $needle) {
    assert_split(str_contains($allBackend, $needle), "Section 7: the audit code {$needle} is written");
}
assert_split(!str_contains($script, "'transfer-dean'") && !str_contains($script, '--old-dean'), 'Section 6: the transfer-dean command is gone from account-admin.php');
assert_split(!preg_match('/--password|\bpassword\b\s*=>\s*\$options/i', $script), 'Section 6: no script command takes a password');

// Section 9 dev seed (DB-free; check-postgres cannot read the seed authenticator, it uses another MFA key).
$seedSql = (string) @file_get_contents(__DIR__ . '/../../database/seeds/development-demo.sql');
$seedGen = (string) @file_get_contents(__DIR__ . '/../../database/seeds/generate_development_demo.py');
assert_split(str_contains($seedSql, "superadmin@bicol-u.edu.ph") && str_contains($seedSql, "'superadmin'"), 'Dev seed: the Superadmin account is in development-demo.sql');
assert_split(str_contains($seedSql, "'mfa_credential'") && str_contains($seedGen, 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'), 'Dev seed: the Superadmin has an authenticator with the documented development secret');
