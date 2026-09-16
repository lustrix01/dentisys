<?php

declare(strict_types=1);

$root = getenv('REPO_ROOT') ?: dirname(__DIR__, 2);
$host = getenv('DB_TEST_HOST') ?: 'db';
$port = (int) (getenv('DB_TEST_PORT') ?: 5432);
$name = getenv('DB_TEST_NAME') ?: 'dentisys';
$user = getenv('DB_TEST_USER') ?: 'dentisys';
$pass = getenv('DB_TEST_PASS') ?: 'local-development-password';

require_once $root . '/backend/app/config.php';
require_once $root . '/backend/app/database.php';
require_once $root . '/backend/app/jwt.php';
require_once $root . '/backend/app/audit.php';
require_once $root . '/backend/app/auth.php';
require_once $root . '/backend/app/auth_runtime.php';
require_once $root . '/backend/app/mfa.php';
require_once $root . '/backend/app/mfa_runtime.php';
require_once $root . '/backend/app/ratelimit.php';
require_once $root . '/backend/app/validation.php';
require_once $root . '/backend/app/security.php';
require_once $root . '/backend/app/student_auth.php';

function expect_true(bool $condition, string $label): void
{
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$label}\n");
        exit(1);
    }
    echo "PASS: {$label}\n";
}

function expect_same(mixed $expected, mixed $actual, string $label): void
{
    expect_true($expected === $actual, $label . ' (expected ' . var_export($expected, true) . ', got ' . var_export($actual, true) . ')');
}

$pdo = create_pdo([
    'db' => [
        'host' => $host,
        'port' => $port,
        'name' => $name,
        'user' => $user,
        'pass' => $pass,
    ],
]);

$expectedMigrations = [
    '001_baseline_schema.sql',
    '002_seed_rbac.sql',
    '003_seed_system_settings.sql',
    '004_postgresql_runtime_compatibility.sql',
    '005_student_identity_authentication.sql',
];
$appliedMigrations = $pdo->query('SELECT version FROM _schema_migrations ORDER BY version')->fetchAll(PDO::FETCH_COLUMN);
expect_same($expectedMigrations, $appliedMigrations, 'PostgreSQL migrations are applied in the expected order');

$schemaGrant = (int) $pdo->query(
    "SELECT CASE WHEN has_schema_privilege(current_user, 'public', 'USAGE') THEN 1 ELSE 0 END"
)->fetchColumn();
expect_same(1, $schemaGrant, 'Application role has public schema usage');
$tableGrants = (int) $pdo->query(
    "SELECT CASE WHEN has_table_privilege(current_user, 'user_accounts', 'SELECT,INSERT,UPDATE,DELETE') THEN 1 ELSE 0 END"
)->fetchColumn();
expect_same(1, $tableGrants, 'Application role has runtime table privileges');

$demoPasswords = [
    'admin@bicol-u.edu.ph' => 'Admin123!',
    'faculty@bicol-u.edu.ph' => 'Faculty123!',
    'secretary@bicol-u.edu.ph' => 'Secretary123!',
    'student@bicol-u.edu.ph' => 'Student123!',
];
$demoAccounts = $pdo->query(
    "SELECT login_email, password_hash FROM user_accounts
     WHERE status = 'Active'
       AND login_email IN ('admin@bicol-u.edu.ph', 'faculty@bicol-u.edu.ph', 'secretary@bicol-u.edu.ph', 'student@bicol-u.edu.ph')"
)->fetchAll(PDO::FETCH_KEY_PAIR);
expect_same(4, count($demoAccounts), 'Manual seed exposes all documented demo accounts');
foreach ($demoPasswords as $demoEmail => $demoPassword) {
    expect_true(
        isset($demoAccounts[$demoEmail]) && password_verify($demoPassword, $demoAccounts[$demoEmail]),
        "Documented password is usable for {$demoEmail}"
    );
}

$expectedColumns = [
    ['enrollments', 'grade_components_json', 'jsonb'],
    ['enrollments', 'remedial_state_json', 'jsonb'],
    ['security_tokens', 'metadata_json', 'jsonb'],
    ['audit_events', 'before_state_json', 'text'],
    ['audit_events', 'after_state_json', 'text'],
    ['audit_events', 'scope_cs_id', 'integer'],
    ['students', 'student_account_user_id', 'integer'],
    ['auth_sessions', 'authentication_source', 'text'],
];
foreach ($expectedColumns as [$table, $column, $dataType]) {
    $stmt = $pdo->prepare(
        'SELECT COUNT(*) FROM information_schema.columns
         WHERE table_schema = \'public\' AND table_name = ? AND column_name = ? AND data_type = ?'
    );
    $stmt->execute([$table, $column, $dataType]);
    expect_same(1, (int) $stmt->fetchColumn(), "PostgreSQL schema exposes {$table}.{$column} as {$dataType}");
}

$migrationCount = (int) $pdo->query("SELECT COUNT(*) FROM _schema_migrations WHERE version = '005_student_identity_authentication.sql'")->fetchColumn();
expect_same(1, $migrationCount, 'P03 Student identity migration is recorded');

$legacySecretary = $pdo->query("SELECT user_id, student_account_user_id FROM students WHERE student_id = 24")->fetch(PDO::FETCH_ASSOC);
expect_same(9, (int) ($legacySecretary['user_id'] ?? 0), 'Legacy Secretary link remains present');
expect_same(null, $legacySecretary['student_account_user_id'] ?? null, 'P03 does not backfill legacy Secretary links');
$studentFixture = $pdo->query("SELECT ua.user_id, s.student_account_user_id FROM user_accounts ua JOIN students s ON s.student_account_user_id = ua.user_id WHERE ua.login_email = 'student@bicol-u.edu.ph'")->fetch(PDO::FETCH_ASSOC);
expect_same(10, (int) ($studentFixture['user_id'] ?? 0), 'Development Student canonical account link is present');
expect_same(10, (int) ($studentFixture['student_account_user_id'] ?? 0), 'Development Student fixture links to its account');

// P03 canonical-link invariant: deferred triggers must reject an orphaned
// role=student account even when a canonical Student link is removed or moved.
$fixturePrefix = 'p03-invariant-' . bin2hex(random_bytes(4));
$insertFixtureAccount = static function (PDO $pdo, string $email, string $role): int {
    $stmt = $pdo->prepare(
        "INSERT INTO user_accounts (login_email, password_hash, role, display_name, status, created_at)
         VALUES (?, ?, ?, ?, 'Active', CURRENT_TIMESTAMP(6))
         RETURNING user_id"
    );
    $stmt->execute([$email, password_hash('FixturePass1!', PASSWORD_DEFAULT), $role, 'P03 Invariant Fixture']);
    return (int) $stmt->fetchColumn();
};
$insertFixtureStudent = static function (PDO $pdo, string $number, string $email, int $accountId): int {
    $stmt = $pdo->prepare(
        "INSERT INTO students (student_number, first_name, last_name, bu_email, status, student_account_user_id)
         VALUES (?, 'Invariant', 'Fixture', ?, 'active', ?)
         RETURNING student_id"
    );
    $stmt->execute([$number, $email, $accountId]);
    return (int) $stmt->fetchColumn();
};

$pdo->beginTransaction();
$accountA = $insertFixtureAccount($pdo, $fixturePrefix . '-a@bicol-u.edu.ph', 'student');
$studentA = $insertFixtureStudent($pdo, $fixturePrefix . '-a', $fixturePrefix . '-a@bicol-u.edu.ph', $accountA);
$accountB = $insertFixtureAccount($pdo, $fixturePrefix . '-b@bicol-u.edu.ph', 'secretary');
$accountC = $insertFixtureAccount($pdo, $fixturePrefix . '-c@bicol-u.edu.ph', 'student');
$studentC = $insertFixtureStudent($pdo, $fixturePrefix . '-c', $fixturePrefix . '-c@bicol-u.edu.ph', $accountC);
$accountD = $insertFixtureAccount($pdo, $fixturePrefix . '-d@bicol-u.edu.ph', 'secretary');
$pdo->commit();

$unlinkRejected = false;
$pdo->beginTransaction();
$pdo->prepare('UPDATE students SET student_account_user_id = NULL WHERE student_id = ?')->execute([$studentA]);
try {
    $pdo->commit();
} catch (Throwable) {
    $unlinkRejected = true;
    if ($pdo->inTransaction()) { $pdo->rollBack(); }
}
expect_true($unlinkRejected, 'Canonical Student link to NULL cannot orphan a role-Student account');

$moveRejected = false;
$pdo->beginTransaction();
$pdo->prepare('UPDATE students SET student_account_user_id = ? WHERE student_id = ?')->execute([$accountB, $studentA]);
try {
    $pdo->commit();
} catch (Throwable) {
    $moveRejected = true;
    if ($pdo->inTransaction()) { $pdo->rollBack(); }
}
expect_true($moveRejected, 'Moving a canonical link away from a role-Student account requires old-account validity');

$pdo->beginTransaction();
$pdo->prepare("UPDATE user_accounts SET role = 'secretary', login_email = ? WHERE user_id = ?")->execute([$fixturePrefix . '-c-legacy@bicol-u.edu.ph', $accountC]);
$pdo->prepare('UPDATE students SET bu_email = ?, student_account_user_id = ? WHERE student_id = ?')->execute([$fixturePrefix . '-d@bicol-u.edu.ph', $accountD, $studentC]);
$pdo->prepare("UPDATE user_accounts SET role = 'student' WHERE user_id = ?")->execute([$accountD]);
$pdo->commit();
$canonicalDestination = $pdo->prepare('SELECT student_account_user_id FROM students WHERE student_id = ?');
$canonicalDestination->execute([$studentC]);
expect_same($accountD, (int) $canonicalDestination->fetchColumn(), 'Atomic Student account/link reassignment commits when both final states are valid');

$deleteRejected = false;
$pdo->beginTransaction();
$pdo->prepare('DELETE FROM students WHERE student_id = ?')->execute([$studentA]);
try {
    $pdo->commit();
} catch (Throwable) {
    $deleteRejected = true;
    if ($pdo->inTransaction()) { $pdo->rollBack(); }
}
expect_true($deleteRejected, 'Deleting the canonical Student row cannot orphan a role-Student account');

// Legacy Secretary-linked records are eligibility-blind no-ops: exercise the
// public signup endpoint and verify neither identity nor token state changes.
$legacyBefore = $pdo->query("SELECT user_id, student_account_user_id FROM students WHERE student_id = 24")->fetch(PDO::FETCH_ASSOC);
$legacyTokenCountBefore = (int) $pdo->query("SELECT COUNT(*) FROM security_tokens WHERE purpose = 'student_activation' AND related_student_id = 24")->fetchColumn();
$legacyAccountCountBefore = (int) $pdo->query("SELECT COUNT(*) FROM user_accounts")->fetchColumn();
$httpContext = stream_context_create([
    'http' => [
        'method' => 'POST',
        'header' => "Content-Type: application/json\r\nAccept: application/json\r\n",
        'content' => json_encode(['email' => 'secretary@bicol-u.edu.ph'], JSON_THROW_ON_ERROR),
        'ignore_errors' => true,
        'timeout' => 10,
    ],
]);
$httpBody = @file_get_contents('http://127.0.0.1/api/auth/student/signup', false, $httpContext);
$httpStatus = 0;
foreach ($http_response_header ?? [] as $headerLine) {
    if (preg_match('/^HTTP\/\S+\s+(\d{3})/', $headerLine, $match)) {
        $httpStatus = (int) $match[1];
        break;
    }
}
expect_same(202, $httpStatus, 'Legacy Secretary-linked signup returns generic HTTP 202');
expect_true(is_string($httpBody) && str_contains($httpBody, 'If an eligible Student record matches that email'), 'Legacy Secretary-linked signup returns the generic body');
expect_true((bool) array_filter($http_response_header ?? [], static fn(string $header): bool => stripos($header, 'Cache-Control: no-store') === 0), 'Student signup response carries Cache-Control: no-store');
$legacyAfter = $pdo->query("SELECT user_id, student_account_user_id FROM students WHERE student_id = 24")->fetch(PDO::FETCH_ASSOC);
expect_same($legacyBefore, $legacyAfter, 'Legacy Secretary link and canonical NULL remain unchanged after signup');
expect_same($legacyTokenCountBefore, (int) $pdo->query("SELECT COUNT(*) FROM security_tokens WHERE purpose = 'student_activation' AND related_student_id = 24")->fetchColumn(), 'Legacy Secretary-linked signup creates no activation token');
expect_same($legacyAccountCountBefore, (int) $pdo->query("SELECT COUNT(*) FROM user_accounts")->fetchColumn(), 'Legacy Secretary-linked signup creates no account');
$signupAudit = $pdo->query("SELECT target_id, description, reason
                              FROM audit_events
                             WHERE action_code = 'student_signup_requested'
                             ORDER BY event_id DESC LIMIT 1")->fetch(PDO::FETCH_ASSOC);
expect_true($signupAudit !== false, 'Valid institutional Student signup appends a request audit event');
expect_same(student_auth_email_fingerprint('secretary@bicol-u.edu.ph'), $signupAudit['target_id'] ?? null, 'Signup audit records only the normalized-email fingerprint');
expect_true(!str_contains((string) ($signupAudit['description'] ?? ''), 'secretary@bicol-u.edu.ph'), 'Signup audit does not store the raw institutional email');
expect_same('request_received', $signupAudit['reason'] ?? null, 'Signup audit uses a bounded request reason code');

$invalidContext = stream_context_create([
    'http' => [
        'method' => 'POST',
        'header' => "Content-Type: application/json\r\nAccept: application/json\r\n",
        'content' => json_encode(['unexpected' => 'field'], JSON_THROW_ON_ERROR),
        'ignore_errors' => true,
        'timeout' => 10,
    ],
]);
@file_get_contents('http://127.0.0.1/api/auth/student/signup', false, $invalidContext);
$invalidStatus = 0;
foreach ($http_response_header ?? [] as $headerLine) {
    if (preg_match('/^HTTP\/\S+\s+(\d{3})/', $headerLine, $match)) {
        $invalidStatus = (int) $match[1];
        break;
    }
}
expect_same(400, $invalidStatus, 'Student signup validation failure preserves HTTP 400');
expect_true((bool) array_filter($http_response_header ?? [], static fn(string $header): bool => stripos($header, 'Cache-Control: no-store') === 0), 'Student signup validation failure carries Cache-Control: no-store');

// Remove only the isolated fixtures. Final role/link states are valid before
// deletion, so the deferred identity triggers permit this cleanup.
$pdo->beginTransaction();
$pdo->prepare("UPDATE user_accounts SET role = 'secretary' WHERE user_id IN (?, ?, ?, ?)")->execute([$accountA, $accountB, $accountC, $accountD]);
$pdo->prepare('UPDATE students SET student_account_user_id = NULL WHERE student_id IN (?, ?)')->execute([$studentA, $studentC]);
$pdo->prepare('DELETE FROM students WHERE student_id IN (?, ?)')->execute([$studentA, $studentC]);
$pdo->prepare('DELETE FROM user_accounts WHERE user_id IN (?, ?, ?, ?)')->execute([$accountA, $accountB, $accountC, $accountD]);
$pdo->commit();

$fk = (int) $pdo->query("SELECT COUNT(*) FROM pg_constraint WHERE conname = 'fk_audit_scope_class_section'")->fetchColumn();
expect_same(1, $fk, 'Audit scope foreign key exists');

$email = 'postgres-test-' . bin2hex(random_bytes(4)) . '@bicol-u.edu.ph';
$passwordHash = password_hash('TestPass1!', PASSWORD_DEFAULT);
$userInsert = $pdo->prepare(
    "INSERT INTO user_accounts (login_email, password_hash, role, display_name, status, created_at)
     VALUES (?, ?, 'faculty', 'PostgreSQL Integration User', 'Active', CURRENT_TIMESTAMP(6))
     RETURNING user_id"
);
$userInsert->execute([$email, $passwordHash]);
$userId = (int) $userInsert->fetchColumn();
expect_true($userId > 0, 'Generated user ID returned by PostgreSQL');

$config = app_config([
    'DB_HOST' => $host,
    'DB_PORT' => $port,
    'DB_NAME' => $name,
    'DB_USER' => $user,
    'DB_PASS' => $pass,
    'JWT_SIGNING_KEY_B64' => base64_encode(str_repeat('J', 32)),
    'MFA_ENCRYPTION_KEY_B64' => base64_encode(str_repeat('E', 32)),
    'AUDIT_MAC_KEY_B64' => base64_encode(str_repeat('M', 32)),
    'STUDENT_AUTH_ENABLED' => 'true',
]);
$config['rate_limit']['storage_dir'] = sys_get_temp_dir() . '/dentisys-postgres-test-' . bin2hex(random_bytes(4));
mkdir($config['rate_limit']['storage_dir'], 0700, true);

$studentContext = [
    'request_id' => 'p03-student-' . bin2hex(random_bytes(4)),
    'ip_address' => '127.0.0.1',
    'user_agent' => 'P03 Student Integration Test',
    'http_method' => 'POST',
    'endpoint' => '/api/auth/login',
];
$studentLogin = auth_runtime_login($pdo, $config, [
    'email' => 'student@bicol-u.edu.ph',
    'password' => 'Student123!',
], $studentContext);
expect_same('direct_login', $studentLogin['type'], 'Development Student password login succeeds');
$studentCredentials = $studentLogin['credentials'];
$studentAuthContext = auth_verify_access_token(
    $pdo,
    $config,
    $studentCredentials['access_token'],
    config_key_bytes_at_least($config['jwt']['signing_key_b64'], 32, 'JWT_SIGNING_KEY')
);
expect_same('student', $studentAuthContext['role'], 'Student access token validates with the Student role');
expect_same(26, $studentAuthContext['student']['student_id'], 'Student access context carries canonical Student identity');
$studentMe = auth_runtime_me($pdo, $config, $studentContext + [
    'auth_header' => 'Bearer ' . $studentCredentials['access_token'],
]);
expect_true(isset($studentMe['authentication_source'], $studentMe['student']), 'Student /api/auth/me shape includes provenance and nested Student identity');

// Development-mock provenance is revalidated against the current runtime
// gate at access and refresh time. Logout intentionally remains unconditional
// so a disabled development session can still be revoked and cleared.
$mockConfig = $config;
$mockConfig['app']['env'] = 'test';
$mockConfig['mocks']['identity'] = true;
$mockConfig['features']['student_auth_enabled'] = true;
$pdo->beginTransaction();
$mockLockedStudent = auth_lock_user_for_session($pdo, 10);
$developmentCredentials = auth_issue_credentials($pdo, $mockLockedStudent, $mockConfig, $studentContext, 'development_mock');
$pdo->commit();
$sourceStmt = $pdo->prepare('SELECT authentication_source FROM auth_sessions WHERE session_id = ?');
$sourceStmt->execute([(int) $developmentCredentials['session']['session_id']]);
expect_same('development_mock', $sourceStmt->fetchColumn(), 'Development fixture session persists development-mock provenance');

$disabledMockConfig = $mockConfig;
$disabledMockConfig['mocks']['identity'] = false;
$devAccessRejected = false;
try {
    auth_verify_access_token(
        $pdo,
        $disabledMockConfig,
        $developmentCredentials['access_token'],
        config_key_bytes_at_least($disabledMockConfig['jwt']['signing_key_b64'], 32, 'JWT_SIGNING_KEY')
    );
} catch (AuthException) {
    $devAccessRejected = true;
}
expect_true($devAccessRejected, 'Disabled development identity rejects an existing development-mock access token');

$devRefreshRejected = false;
try {
    auth_runtime_refresh($pdo, $disabledMockConfig, $studentContext, $developmentCredentials['refresh_token']);
} catch (ChallengeException) {
    $devRefreshRejected = true;
}
expect_true($devRefreshRejected, 'Disabled development identity rejects an existing development-mock refresh token');

// Password Student provenance is independent of the development identity
// provider flag.
$passwordStillValid = auth_verify_access_token(
    $pdo,
    $disabledMockConfig,
    $studentCredentials['access_token'],
    config_key_bytes_at_least($disabledMockConfig['jwt']['signing_key_b64'], 32, 'JWT_SIGNING_KEY')
);
expect_same('password', $passwordStillValid['authentication_source'], 'Password Student session remains valid when the mock flag is disabled');

foreach (['production', 'single-server'] as $blockedEnvironment) {
    $blockedConfig = $mockConfig;
    $blockedConfig['app']['env'] = $blockedEnvironment;
    $blockedConfig['mocks']['identity'] = false;
    $productionRejected = false;
    try {
        auth_verify_access_token(
            $pdo,
            $blockedConfig,
            $developmentCredentials['access_token'],
            config_key_bytes_at_least($blockedConfig['jwt']['signing_key_b64'], 32, 'JWT_SIGNING_KEY')
        );
    } catch (AuthException) {
        $productionRejected = true;
    }
    expect_true($productionRejected, "{$blockedEnvironment} rejects persisted development-mock Student sessions");
}

$logoutResult = auth_runtime_logout($pdo, $disabledMockConfig, $studentContext, $developmentCredentials['refresh_token']);
expect_same('completed', $logoutResult['type'], 'Logout revokes a development-mock session after its mock flag is disabled');
$revokedStmt = $pdo->prepare('SELECT revoked_at FROM auth_sessions WHERE session_id = ?');
$revokedStmt->execute([(int) $developmentCredentials['session']['session_id']]);
$revokedAt = $revokedStmt->fetchColumn();
expect_true($revokedAt !== false && $revokedAt !== null, 'Disabled development-mock session is revoked by logout');

$denialAuditBefore = (int) $pdo->query("SELECT COUNT(*) FROM audit_events WHERE action_code = 'student_auth_eligibility_denied'")->fetchColumn();
$pdo->beginTransaction();
$pdo->prepare("UPDATE students SET status = 'disabled' WHERE student_id = 26")->execute();
$eligibilityDenied = false;
try {
    auth_verify_access_token(
        $pdo,
        $config,
        $studentCredentials['access_token'],
        config_key_bytes_at_least($config['jwt']['signing_key_b64'], 32, 'JWT_SIGNING_KEY')
    );
} catch (AuthException) {
    $eligibilityDenied = true;
}
$pdo->rollBack();
expect_true($eligibilityDenied, 'Central Student eligibility invariant denies an inactive Student');
$denialAudit = $pdo->query("SELECT actor_role, target_id, description, reason, actor_username
                              FROM audit_events
                             WHERE action_code = 'student_auth_eligibility_denied'
                             ORDER BY event_id DESC LIMIT 1")->fetch(PDO::FETCH_ASSOC);
expect_true($denialAudit !== false && (int) $denialAudit['target_id'] === 10, 'Student eligibility denial audit survives the rejected transaction rollback');
expect_same('student', $denialAudit['actor_role'] ?? null, 'Eligibility denial audit identifies the Student actor role');
expect_same('student_inactive', $denialAudit['reason'] ?? null, 'Eligibility denial audit uses a bounded reason code');
expect_same(null, $denialAudit['actor_username'] ?? null, 'Eligibility denial audit does not store the Student login email');
expect_true(!str_contains((string) ($denialAudit['description'] ?? ''), $studentCredentials['access_token']), 'Eligibility denial audit stores no access token');
expect_true($denialAuditBefore < (int) $pdo->query("SELECT COUNT(*) FROM audit_events WHERE action_code = 'student_auth_eligibility_denied'")->fetchColumn(), 'Eligibility denial audit event is appended');

$pdo->beginTransaction();
$pdo->prepare("UPDATE enrollments SET status = 'Archived' WHERE enrollment_id = 26")->execute();
$pdo->commit();
try {
    $studentLoginWithoutEnrollment = auth_runtime_login($pdo, $config, [
        'email' => 'student@bicol-u.edu.ph',
        'password' => 'Student123!',
    ], $studentContext);
    expect_same('direct_login', $studentLoginWithoutEnrollment['type'], 'Post-activation Student login survives loss of active enrollment');

    $studentRefresh = auth_runtime_refresh($pdo, $config, $studentContext, $studentCredentials['refresh_token']);
    expect_same('rotated', $studentRefresh['type'], 'Post-activation Student refresh survives loss of active enrollment');

    $ownedEnrollmentRejected = false;
    try {
        require_owned_enrollment($pdo, $config, $studentAuthContext, 26);
    } catch (AuthException) {
        $ownedEnrollmentRejected = true;
    }
    expect_true($ownedEnrollmentRejected, 'Inactive Student enrollment is rejected by require_owned_enrollment');
} finally {
    $pdo->prepare("UPDATE enrollments SET status = 'Active' WHERE enrollment_id = 26")->execute();
}

$pdo->beginTransaction();
$locked = auth_lock_user_for_session($pdo, $userId);
$session = auth_create_session(
    $pdo,
    $locked,
    '127.0.0.1',
    'PostgreSQL Integration Test',
    null,
    new DateTimeImmutable('+1 hour', new DateTimeZone('UTC')),
);
$refresh = auth_issue_initial_refresh_token(
    $pdo,
    $session,
    $userId,
    new DateTimeImmutable('+50 minutes', new DateTimeZone('UTC')),
);
$pdo->commit();
expect_true($session['session_id'] > 0 && $refresh['token_id'] > 0, 'Session and refresh IDs use RETURNING');
$facultyMe = auth_runtime_me($pdo, $config, [
    'auth_header' => 'Bearer ' . auth_issue_access_token(
        ['user_id' => $locked['user_id'], 'role' => $locked['role'], 'token_version' => $locked['token_version']],
        $session,
        config_key_bytes_at_least($config['jwt']['signing_key_b64'], 32, 'JWT_SIGNING_KEY')
    )['token'],
    'ip_address' => '127.0.0.1',
    'user_agent' => 'PostgreSQL Integration Test',
    'http_method' => 'GET',
    'endpoint' => '/api/auth/me',
]);
expect_true(isset($facultyMe['authentication_source']) && !array_key_exists('student', $facultyMe), 'Non-Student /api/auth/me omits nested Student identity');

$digestStmt = $pdo->prepare('SELECT token_digest FROM security_tokens WHERE token_id = ?');
$digestStmt->execute([$refresh['token_id']]);
$storedDigest = pdo_binary_value($digestStmt->fetchColumn());
expect_same(hash('sha256', $refresh['raw_token'], true), $storedDigest, 'BYTEA refresh digest round-trips as binary');

$pdo->beginTransaction();
$auditContext = audit_begin_operation($pdo);
$auditResult = audit_finish_operation($pdo, $auditContext, [
    'module_code' => 'integration',
    'action_code' => 'postgres_roundtrip',
    'event_status' => 'Success',
    'actor_user_id' => $userId,
    'actor_username' => $email,
    'actor_role' => 'faculty',
    'actor_display_name' => 'PostgreSQL Integration User',
    'session_id' => $session['session_id'],
    'scope_cs_id' => 1,
    'target_type' => 'test',
    'target_id' => (string) $userId,
    'description' => 'PostgreSQL integration audit event.',
    'reason' => 'integration',
    'http_method' => 'TEST',
    'endpoint' => '/integration',
    'request_id' => 'postgres-integration-' . bin2hex(random_bytes(4)),
    'correlation_id' => 'postgres-correlation',
    'operation_uuid' => '00000000-0000-4000-8000-000000000001',
    'ip_address' => '127.0.0.1',
    'user_agent' => 'PostgreSQL Integration Test',
    'device_id' => 'integration-device',
    'device_name' => 'integration',
], str_repeat('M', 32), ['test' => 'before'], ['test' => 'after']);
$pdo->commit();
expect_true($auditResult['sequence_number'] > 0, 'Audit event writes through PostgreSQL');

$tamperBlocked = false;
try {
    $tamper = $pdo->prepare("UPDATE audit_events SET description = 'tampered' WHERE event_uuid = ?");
    $tamper->execute([$auditResult['event_uuid']]);
} catch (PDOException) {
    $tamperBlocked = true;
}
expect_true($tamperBlocked, 'Audit immutability trigger rejects updates');

$description = $pdo->prepare('SELECT description FROM audit_events WHERE event_uuid = ?');
$description->execute([$auditResult['event_uuid']]);
expect_same('PostgreSQL integration audit event.', $description->fetchColumn(), 'Rejected audit update preserved the row');

echo "ALL POSTGRESQL INTEGRATION TESTS PASSED.\n";
