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
];
$demoAccounts = $pdo->query(
    "SELECT login_email, password_hash FROM user_accounts
     WHERE status = 'Active'
       AND login_email IN ('admin@bicol-u.edu.ph', 'faculty@bicol-u.edu.ph', 'secretary@bicol-u.edu.ph')"
)->fetchAll(PDO::FETCH_KEY_PAIR);
expect_same(3, count($demoAccounts), 'Manual seed exposes all documented demo accounts');
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
];
foreach ($expectedColumns as [$table, $column, $dataType]) {
    $stmt = $pdo->prepare(
        'SELECT COUNT(*) FROM information_schema.columns
         WHERE table_schema = \'public\' AND table_name = ? AND column_name = ? AND data_type = ?'
    );
    $stmt->execute([$table, $column, $dataType]);
    expect_same(1, (int) $stmt->fetchColumn(), "PostgreSQL schema exposes {$table}.{$column} as {$dataType}");
}

$migrationCount = (int) $pdo->query("SELECT COUNT(*) FROM _schema_migrations WHERE version = '004_postgresql_runtime_compatibility.sql'")->fetchColumn();
expect_same(1, $migrationCount, 'Compatibility migration is recorded');

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
]);
$config['rate_limit']['storage_dir'] = sys_get_temp_dir() . '/dentisys-postgres-test-' . bin2hex(random_bytes(4));
mkdir($config['rate_limit']['storage_dir'], 0700, true);

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
