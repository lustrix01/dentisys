<?php

declare(strict_types=1);

$root = getenv('REPO_ROOT') ?: dirname(__DIR__, 2);
$host = getenv('DB_TEST_HOST') ?: 'db';
$port = (int) (getenv('DB_TEST_PORT') ?: 5432);
$name = getenv('DB_TEST_NAME') ?: 'dentisys';
$user = getenv('DB_TEST_USER') ?: 'dentisys';
$pass = getenv('DB_TEST_PASS') ?: 'local-development-password';

require_once $root . '/backend/app/config.php';
require_once $root . '/backend/vendor/autoload.php';
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
require_once $root . '/backend/app/google_auth.php';
require_once $root . '/backend/controllers/GoogleAuthController.php';
require_once $root . '/backend/controllers/FacultyInvitationController.php';
require_once $root . '/backend/controllers/StudentAuthController.php';
require_once $root . '/backend/controllers/HealthController.php';

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

function integration_http_json(string $path, string $accessToken, array $payload): array
{
    $headers = "Content-Type: application/json\r\nAccept: application/json\r\n";
    if ($accessToken !== '') {
        $headers .= "Authorization: Bearer {$accessToken}\r\n";
    }
    $context = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => $headers,
            'content' => json_encode($payload, JSON_THROW_ON_ERROR),
            'ignore_errors' => true,
            'timeout' => 10,
        ],
    ]);
    $body = @file_get_contents('http://127.0.0.1' . $path, false, $context);
    $status = 0;
    foreach ($http_response_header ?? [] as $headerLine) {
        if (preg_match('/^HTTP\/\S+\s+(\d{3})/', $headerLine, $match)) {
            $status = (int) $match[1];
            break;
        }
    }
    return [$status, is_string($body) ? (json_decode($body, true) ?: []) : []];
}

function integration_http_get_json(string $path, string $accessToken): array
{
    $context = stream_context_create([
        'http' => [
            'method' => 'GET',
            'header' => "Accept: application/json\r\nAuthorization: Bearer {$accessToken}\r\n",
            'ignore_errors' => true,
            'timeout' => 10,
        ],
    ]);
    $body = @file_get_contents('http://127.0.0.1' . $path, false, $context);
    $status = 0;
    foreach ($http_response_header ?? [] as $headerLine) {
        if (preg_match('/^HTTP\/\S+\s+(\d{3})/', $headerLine, $match)) {
            $status = (int) $match[1];
            break;
        }
    }
    return [$status, is_string($body) ? (json_decode($body, true) ?: []) : []];
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
    '006_google_sign_in_phase_1.sql',
    '007_assessment_transmutation.sql',
    '008_invite_only_onboarding.sql',
    '009_persistent_attendance_sessions.sql',
];
$appliedMigrations = $pdo->query('SELECT version FROM _schema_migrations ORDER BY version')->fetchAll(PDO::FETCH_COLUMN);
expect_same($expectedMigrations, $appliedMigrations, 'PostgreSQL migrations are applied in the expected order');

// Exercise schema-readiness detection against the real disposable database by
// removing only the ledger entry, without reversing any applied schema change.
$staleMigration = '007_assessment_transmutation.sql';
$ledgerEntry = $pdo->prepare('SELECT version, applied_at FROM _schema_migrations WHERE version = ?');
$ledgerEntry->execute([$staleMigration]);
$originalLedgerRow = $ledgerEntry->fetch(PDO::FETCH_ASSOC);
expect_true(is_array($originalLedgerRow), 'Required migration ledger entry exists before stale-schema check');

$deletedLedgerEntry = false;
$staleHealth = null;
try {
    $deleteLedgerEntry = $pdo->prepare('DELETE FROM _schema_migrations WHERE version = ?');
    $deleteLedgerEntry->execute([$staleMigration]);
    $deletedLedgerEntry = $deleteLedgerEntry->rowCount() === 1;
    if (!$deletedLedgerEntry) {
        throw new RuntimeException('Unable to remove the required migration ledger entry for stale-schema testing.');
    }
    $staleHealth = health_payload();
} finally {
    if ($deletedLedgerEntry) {
        $restoreLedgerEntry = $pdo->prepare(
            'INSERT INTO _schema_migrations (version, applied_at) VALUES (?, ?)'
        );
        $restoreLedgerEntry->execute([
            $originalLedgerRow['version'],
            $originalLedgerRow['applied_at'],
        ]);
    }
}
expect_same(503, $staleHealth['statusCode'], 'Missing required migration returns HTTP 503');
expect_same('error', $staleHealth['body']['status'], 'Stale migration health status is error');
expect_same('up', $staleHealth['body']['database'], 'Stale migration keeps database connectivity up');
expect_same('schema_outdated', $staleHealth['body']['error_code'], 'Missing required migration returns schema_outdated');
expect_true(
    str_contains((string) ($staleHealth['body']['message'] ?? ''), 'migrate.ps1'),
    'Stale migration health response contains an actionable migration instruction'
);

$currentHealth = health_payload();
expect_same(200, $currentHealth['statusCode'], 'Restored migration ledger returns HTTP 200');
expect_same('ok', $currentHealth['body']['status'], 'Current migration health status is ok');
expect_same('up', $currentHealth['body']['database'], 'Current migration health reports database up');
echo "PASS: Stale and current migration-ledger health responses verified.\n";

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

// Exercise the real Admin settings API against the disposable PostgreSQL
// stack, including persistence, client-side validation, and JSONB key merging.
[$adminLoginStatus, $adminLoginBody] = integration_http_json('/api/auth/login', '', [
    'email' => 'admin@bicol-u.edu.ph',
    'password' => $demoPasswords['admin@bicol-u.edu.ph'],
]);
expect_same(200, $adminLoginStatus, 'Admin settings integration login returns HTTP 200');
$adminAccessToken = (string) ($adminLoginBody['access_token'] ?? '');
expect_true($adminAccessToken !== '', 'Admin settings integration login returns an access token');

// Persistent Secretary attendance-session lifecycle coverage.
[$secretaryLoginStatus, $secretaryLoginBody] = integration_http_json('/api/auth/login', '', [
    'email' => 'secretary@bicol-u.edu.ph',
    'password' => $demoPasswords['secretary@bicol-u.edu.ph'],
]);
expect_same(200, $secretaryLoginStatus, 'Secretary session integration login returns HTTP 200');
$secretaryAccessToken = (string) ($secretaryLoginBody['access_token'] ?? '');
expect_true($secretaryAccessToken !== '', 'Secretary session integration login returns an access token');

$secretaryClassStmt = $pdo->prepare(
    "SELECT cs_id
     FROM class_sections
     WHERE secretary_user_id = (
         SELECT user_id FROM user_accounts WHERE login_email = 'secretary@bicol-u.edu.ph'
     )
       AND status = 'Active'
     ORDER BY cs_id
     LIMIT 1"
);
$secretaryClassStmt->execute();
$secretarySessionClassId = (int) $secretaryClassStmt->fetchColumn();
expect_true($secretarySessionClassId > 0, 'Seeded Secretary has an active assigned class for session tests');

$sessionConfig = app_config();
$sessionNowUtc = new DateTimeImmutable('now', new DateTimeZone('UTC'));
$sessionLocalTimezone = new DateTimeZone($sessionConfig['app']['operational_timezone']);
$sessionDate = app_local_date($sessionConfig, $sessionNowUtc);
[$activeBeforeStatus, $activeBeforeBody] = integration_http_get_json(
    '/api/secretary/attendance/session/active?csId=' . $secretarySessionClassId,
    $secretaryAccessToken
);
expect_same(200, $activeBeforeStatus, 'Secretary active-session lookup returns HTTP 200 when no session exists');
expect_same(null, $activeBeforeBody['activeSession'] ?? null, 'Secretary active-session lookup returns null when no session exists');

$sessionCode = 'INTEGRATION-SESSION-' . strtoupper(bin2hex(random_bytes(4)));
[$startSessionStatus, $startSessionBody] = integration_http_json('/api/secretary/attendance/session', $secretaryAccessToken, [
    'csId' => $secretarySessionClassId,
    'sessionDate' => $sessionDate,
    'sessionCode' => $sessionCode,
    'room' => 'Integration Attendance Room',
    'biometricRequired' => true,
    'geofenceEnabled' => true,
    'geofenceLatitude' => 13.1436,
    'geofenceLongitude' => 123.7438,
]);
expect_same(201, $startSessionStatus, 'Authorized Secretary can start an attendance session');
$startedSession = $startSessionBody['session'] ?? [];
$attendanceSessionId = (int) ($startedSession['sessionId'] ?? 0);
expect_true($attendanceSessionId > 0, 'Started attendance session returns an authoritative database ID');
expect_same($sessionCode, $startedSession['sessionCode'] ?? null, 'Started attendance session preserves the server-persisted session code');
expect_same('active', $startedSession['status'] ?? null, 'Started attendance session returns active status');
expect_same((string) $secretarySessionClassId, (string) ($startedSession['classId'] ?? ''), 'Started attendance session is tied to the requested class section');

$sessionRowStmt = $pdo->prepare(
    'SELECT session_id, cs_id, secretary_user_id, session_date, session_code, status,
            ended_at, geofence_enabled, geofence_latitude, geofence_longitude,
            geofence_radius_meters, biometric_required
       FROM attendance_sessions
      WHERE session_id = ?'
);
$sessionRowStmt->execute([$attendanceSessionId]);
$sessionRow = $sessionRowStmt->fetch(PDO::FETCH_ASSOC);
expect_true(is_array($sessionRow), 'Started attendance session persists in PostgreSQL');
expect_same((string) $secretarySessionClassId, (string) ($sessionRow['cs_id'] ?? ''), 'Persisted session retains its class section');
expect_same($sessionCode, $sessionRow['session_code'] ?? null, 'Persisted session retains its session code');
expect_same('active', $sessionRow['status'] ?? null, 'Persisted session status is active');
expect_same(null, $sessionRow['ended_at'] ?? null, 'Persisted active session has no end timestamp');
expect_same('100.00', $sessionRow['geofence_radius_meters'] ?? null, 'Biometric geofencing defaults to a 100-meter radius');

[$activeSessionStatus, $activeSessionBody] = integration_http_get_json(
    '/api/secretary/attendance/session/active?csId=' . $secretarySessionClassId,
    $secretaryAccessToken
);
expect_same(200, $activeSessionStatus, 'Secretary active-session lookup returns HTTP 200 for an active session');
expect_same((string) $attendanceSessionId, (string) ($activeSessionBody['activeSession']['sessionId'] ?? ''), 'Active-session lookup returns the authoritative session ID');
expect_same($sessionCode, $activeSessionBody['activeSession']['sessionCode'] ?? null, 'Active-session lookup returns the persisted session code');

[$duplicateSessionStatus, $duplicateSessionBody] = integration_http_json('/api/secretary/attendance/session', $secretaryAccessToken, [
    'csId' => $secretarySessionClassId,
    'sessionDate' => $sessionDate,
    'sessionCode' => $sessionCode . '-DUPLICATE',
]);
expect_same(409, $duplicateSessionStatus, 'Second active session for the same class is rejected');
expect_same('error', $duplicateSessionBody['status'] ?? null, 'Duplicate active session returns the standard error payload');

$futureDate = $sessionNowUtc->setTimezone($sessionLocalTimezone)->modify('+1 day')->format('Y-m-d');
[$futureSessionStatus, $futureSessionBody] = integration_http_json('/api/secretary/attendance/session', $secretaryAccessToken, [
    'csId' => $secretarySessionClassId,
    'sessionDate' => $futureDate,
]);
expect_same(422, $futureSessionStatus, 'Future attendance session date is rejected server-side');
expect_same('VALIDATION_ERROR', $futureSessionBody['code'] ?? null, 'Future attendance session date uses the validation error contract');

$unassignedClassStmt = $pdo->prepare(
    "SELECT cs_id
     FROM class_sections
     WHERE cs_id <> ? AND secretary_user_id IS NULL AND status = 'Active'
     ORDER BY cs_id
     LIMIT 1"
);
$unassignedClassStmt->execute([$secretarySessionClassId]);
$unassignedClassId = (int) $unassignedClassStmt->fetchColumn();
expect_true($unassignedClassId > 0, 'Integration fixture exposes an unassigned class for authorization testing');
[$unassignedSessionStatus] = integration_http_json('/api/secretary/attendance/session', $secretaryAccessToken, [
    'csId' => $unassignedClassId,
    'sessionDate' => $sessionDate,
]);
expect_same(403, $unassignedSessionStatus, 'Secretary cannot start a session for an unassigned class');

[$invalidSectionStatus] = integration_http_json('/api/secretary/attendance/session', $secretaryAccessToken, [
    'csId' => 999999,
    'sessionDate' => $sessionDate,
]);
expect_same(403, $invalidSectionStatus, 'Secretary cannot start a session for an invalid or unauthorized class section');

$sessionEnrollmentStmt = $pdo->prepare(
    'SELECT enrollment_id FROM enrollments WHERE cs_id = ? ORDER BY enrollment_id LIMIT 1'
);
$sessionEnrollmentStmt->execute([$secretarySessionClassId]);
$sessionEnrollmentId = (int) $sessionEnrollmentStmt->fetchColumn();
expect_true($sessionEnrollmentId > 0, 'Assigned Secretary class has an enrollment for attendance-linkage testing');

$sessionAttendanceStmt = $pdo->prepare(
    "INSERT INTO attendance_records
        (enrollment_id, attendance_session_id, session_date, session_code, status, verification_method, secretary_user_id)
     VALUES (?, ?, ?, ?, 'present', 'integration_fixture',
             (SELECT secretary_user_id FROM class_sections WHERE cs_id = ?))
     RETURNING record_id"
);
$sessionAttendanceStmt->execute([
    $sessionEnrollmentId,
    $attendanceSessionId,
    $sessionDate,
    $sessionCode,
    $secretarySessionClassId,
]);
$sessionAttendanceRecordId = (int) $sessionAttendanceStmt->fetchColumn();
expect_true($sessionAttendanceRecordId > 0, 'Attendance record can reference the persistent session');

$linkedAttendanceStmt = $pdo->prepare(
    'SELECT attendance_session_id FROM attendance_records WHERE record_id = ?'
);
$linkedAttendanceStmt->execute([$sessionAttendanceRecordId]);
expect_same((string) $attendanceSessionId, (string) $linkedAttendanceStmt->fetchColumn(), 'Attendance record preserves the session foreign-key linkage');

$invalidForeignKeyRejected = false;
try {
    $invalidSessionAttendanceStmt = $pdo->prepare(
        "INSERT INTO attendance_records (enrollment_id, attendance_session_id, session_date, session_code, status)
         VALUES (?, 999999, ?, ?, 'present')"
    );
    $invalidSessionAttendanceStmt->execute([$sessionEnrollmentId, $sessionDate, $sessionCode . '-INVALID']);
} catch (PDOException $e) {
    $invalidForeignKeyRejected = ($e->errorInfo[0] ?? (string) $e->getCode()) === '23503';
}
expect_true($invalidForeignKeyRejected, 'Invalid attendance-session foreign keys are rejected by PostgreSQL');

[$endSessionStatus, $endSessionBody] = integration_http_json('/api/secretary/attendance/session/end', $secretaryAccessToken, [
    'sessionId' => (string) $attendanceSessionId,
]);
expect_same(200, $endSessionStatus, 'Authorized Secretary can end an active attendance session');
expect_same('ended', $endSessionBody['session']['status'] ?? null, 'Ended session response reports ended status');
expect_true(($endSessionBody['session']['endedAt'] ?? null) !== null, 'Ended session response includes an authoritative end timestamp');

$sessionRowStmt->execute([$attendanceSessionId]);
$endedSessionRow = $sessionRowStmt->fetch(PDO::FETCH_ASSOC);
expect_same('ended', $endedSessionRow['status'] ?? null, 'Ended session persists ended status in PostgreSQL');
expect_true(($endedSessionRow['ended_at'] ?? null) !== null, 'Ended session persists its end timestamp');

[$activeAfterEndStatus, $activeAfterEndBody] = integration_http_get_json(
    '/api/secretary/attendance/session/active?csId=' . $secretarySessionClassId,
    $secretaryAccessToken
);
expect_same(200, $activeAfterEndStatus, 'Active-session lookup remains available after ending a session');
expect_same(null, $activeAfterEndBody['activeSession'] ?? null, 'Ended session no longer appears as active');

[$repeatEndStatus] = integration_http_json('/api/secretary/attendance/session/end', $secretaryAccessToken, [
    'sessionId' => (string) $attendanceSessionId,
]);
expect_same(409, $repeatEndStatus, 'Ending an already-ended session returns a conflict');

[$secretaryAttendanceStatus, $secretaryAttendanceBody] = integration_http_get_json('/api/secretary/attendance', $secretaryAccessToken);
expect_same(200, $secretaryAttendanceStatus, 'Secretary attendance reads remain available after session linkage');
$linkedAttendanceRows = array_values(array_filter(
    $secretaryAttendanceBody['records'] ?? [],
    static fn(array $record): bool => (string) ($record['id'] ?? '') === (string) $sessionAttendanceRecordId,
));
expect_same(1, count($linkedAttendanceRows), 'Secretary attendance reads return the linked attendance record');
expect_same((string) $attendanceSessionId, $linkedAttendanceRows[0]['attendanceSessionId'] ?? null, 'Secretary attendance reads expose the session linkage');

$sessionAuditStmt = $pdo->prepare(
    "SELECT action_code, target_type, target_id, scope_cs_id
     FROM audit_events
     WHERE target_type = 'attendance_session' AND target_id = ?
     ORDER BY sequence_number"
);
$sessionAuditStmt->execute([(string) $attendanceSessionId]);
$sessionAuditRows = $sessionAuditStmt->fetchAll(PDO::FETCH_ASSOC);
expect_same(2, count($sessionAuditRows), 'Session start and end each create an audit event');
expect_same('attendance_session_started', $sessionAuditRows[0]['action_code'] ?? null, 'Session start audit action is recorded');
expect_same('attendance_session_ended', $sessionAuditRows[1]['action_code'] ?? null, 'Session end audit action is recorded');
expect_same((string) $secretarySessionClassId, (string) ($sessionAuditRows[0]['scope_cs_id'] ?? ''), 'Session audit is scoped to the assigned class section');
echo "PASS: Persistent Secretary attendance-session integration coverage completed.\n";

$originalAdminGradingDefaultsJson = (string) $pdo->query(
    "SELECT setting_value FROM system_settings WHERE setting_key = 'grading_defaults'"
)->fetchColumn();
$originalAdminGradingDefaults = json_decode($originalAdminGradingDefaultsJson, true, 512, JSON_THROW_ON_ERROR);
$unrelatedSettingsKey = 'admin_settings_integration_' . bin2hex(random_bytes(4));
$unrelatedSettingsValue = ['marker' => bin2hex(random_bytes(8)), 'nested' => ['preserve' => true]];
$gradingDefaultsWithSentinel = $originalAdminGradingDefaults;
$gradingDefaultsWithSentinel[$unrelatedSettingsKey] = $unrelatedSettingsValue;
$pdo->prepare(
    "UPDATE system_settings SET setting_value = ?, updated_at = CURRENT_TIMESTAMP(6)
     WHERE setting_key = 'grading_defaults'"
)->execute([json_encode($gradingDefaultsWithSentinel, JSON_THROW_ON_ERROR)]);

[$adminSettingsGetStatus, $adminSettingsGetBody] = integration_http_get_json('/api/admin/settings', $adminAccessToken);
expect_same(200, $adminSettingsGetStatus, 'Existing Admin transmutation defaults can be read through the API');
$adminSettingsBefore = $adminSettingsGetBody['settings'] ?? [];
expect_same(50, $adminSettingsBefore['transmutationDefaults']['minimumPercentage'] ?? null, 'Admin settings API initially reads minimum 50');
expect_same(100, $adminSettingsBefore['transmutationDefaults']['maximumPercentage'] ?? null, 'Admin settings API initially reads maximum 100');

$validAdminSettings = $adminSettingsBefore;
$validAdminSettings['transmutationDefaults'] = ['minimumPercentage' => 55, 'maximumPercentage' => 100];
[$adminSettingsSaveStatus, $adminSettingsSaveBody] = integration_http_json('/api/admin/settings', $adminAccessToken, $validAdminSettings);
expect_same(200, $adminSettingsSaveStatus, 'Valid Admin transmutation-default update returns HTTP 200');
expect_same(55, $adminSettingsSaveBody['settings']['transmutationDefaults']['minimumPercentage'] ?? null, 'Admin settings save response reports minimum 55');
expect_same(100, $adminSettingsSaveBody['settings']['transmutationDefaults']['maximumPercentage'] ?? null, 'Admin settings save response reports maximum 100');

[$adminSettingsReloadStatus, $adminSettingsReloadBody] = integration_http_get_json('/api/admin/settings', $adminAccessToken);
expect_same(200, $adminSettingsReloadStatus, 'Admin settings reload returns HTTP 200 after valid save');
expect_same(55, $adminSettingsReloadBody['settings']['transmutationDefaults']['minimumPercentage'] ?? null, 'Admin settings reload persists minimum 55');
expect_same(100, $adminSettingsReloadBody['settings']['transmutationDefaults']['maximumPercentage'] ?? null, 'Admin settings reload persists maximum 100');

$invalidAdminSettings = $validAdminSettings;
$invalidAdminSettings['transmutationDefaults'] = ['minimumPercentage' => 90, 'maximumPercentage' => 80];
[$invalidAdminSettingsStatus, $invalidAdminSettingsBody] = integration_http_json('/api/admin/settings', $adminAccessToken, $invalidAdminSettings);
expect_same(422, $invalidAdminSettingsStatus, 'Invalid Admin transmutation bounds return HTTP 422 instead of a server error');
expect_same('VALIDATION_ERROR', $invalidAdminSettingsBody['code'] ?? null, 'Invalid Admin transmutation bounds use the standard validation error response');
expect_true(str_contains((string) ($invalidAdminSettingsBody['message'] ?? ''), 'valid transmutation bounds'), 'Invalid Admin transmutation bounds include a clear validation message');
[$adminSettingsAfterInvalidStatus, $adminSettingsAfterInvalidBody] = integration_http_get_json('/api/admin/settings', $adminAccessToken);
expect_same(200, $adminSettingsAfterInvalidStatus, 'Admin settings remain readable after rejected invalid bounds');
expect_same(55, $adminSettingsAfterInvalidBody['settings']['transmutationDefaults']['minimumPercentage'] ?? null, 'Rejected Admin settings update does not persist invalid minimum');
expect_same(100, $adminSettingsAfterInvalidBody['settings']['transmutationDefaults']['maximumPercentage'] ?? null, 'Rejected Admin settings update does not persist invalid maximum');

$updatedAdminGradingDefaults = json_decode((string) $pdo->query(
    "SELECT setting_value FROM system_settings WHERE setting_key = 'grading_defaults'"
)->fetchColumn(), true, 512, JSON_THROW_ON_ERROR);
expect_same($unrelatedSettingsValue, $updatedAdminGradingDefaults[$unrelatedSettingsKey] ?? null, 'Admin settings save preserves unrelated grading-default JSONB keys');
$expectedUnrelatedAdminSettings = array_diff_key(
    $gradingDefaultsWithSentinel,
    array_flip(['default_weights', 'retention_gwa_threshold', 'transmutation_defaults'])
);
$unrelatedSettingsPreservedStmt = $pdo->prepare(
    "SELECT (setting_value - ARRAY['default_weights', 'retention_gwa_threshold', 'transmutation_defaults']::text[]) = ?::jsonb
     FROM system_settings WHERE setting_key = 'grading_defaults'"
);
$unrelatedSettingsPreservedStmt->execute([json_encode($expectedUnrelatedAdminSettings, JSON_THROW_ON_ERROR)]);
expect_same(true, (bool) $unrelatedSettingsPreservedStmt->fetchColumn(), 'Admin settings update leaves all unrelated grading-default fields unchanged');
$pdo->prepare(
    "UPDATE system_settings SET setting_value = ?, updated_at = CURRENT_TIMESTAMP(6)
     WHERE setting_key = 'grading_defaults'"
)->execute([$originalAdminGradingDefaultsJson]);
echo "PASS: Admin settings API persistence, validation, and JSONB preservation verified.\n";

$expectedColumns = [
    ['enrollments', 'grade_components_json', 'jsonb'],
    ['enrollments', 'remedial_state_json', 'jsonb'],
    ['security_tokens', 'metadata_json', 'jsonb'],
    ['audit_events', 'before_state_json', 'text'],
    ['audit_events', 'after_state_json', 'text'],
    ['audit_events', 'scope_cs_id', 'integer'],
    ['students', 'student_account_user_id', 'integer'],
    ['auth_sessions', 'authentication_source', 'text'],
    ['user_accounts', 'google_subject', 'character varying'],
    ['assessments', 'transmutation_enabled', 'boolean'],
    ['assessments', 'transmutation_minimum_percentage', 'numeric'],
    ['assessments', 'transmutation_maximum_percentage', 'numeric'],
    ['assessments', 'attendance_session_date', 'date'],
    ['assessments', 'attendance_session_code', 'character varying'],
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
$googleIndexCount = (int) $pdo->query("SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'uq_user_accounts_google_subject'")->fetchColumn();
expect_same(1, $googleIndexCount, 'Google subject uniqueness index is present');
$transmutationDefaults = $pdo->query(
    "SELECT setting_value->'transmutation_defaults'->>'minimum_percentage',
            setting_value->'transmutation_defaults'->>'maximum_percentage'
     FROM system_settings WHERE setting_key = 'grading_defaults'"
)->fetch(PDO::FETCH_NUM);
expect_same(['50', '100'], $transmutationDefaults, 'Grading defaults include the approved transmutation bounds');

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

// Email knowledge alone must not expose any Student onboarding operation.
$legacyBefore = $pdo->query("SELECT user_id, student_account_user_id FROM students WHERE student_id = 24")->fetch(PDO::FETCH_ASSOC);
$legacyTokenCountBefore = (int) $pdo->query("SELECT COUNT(*) FROM security_tokens WHERE purpose = 'student_activation' AND related_student_id = 24")->fetchColumn();
$legacyAccountCountBefore = (int) $pdo->query("SELECT COUNT(*) FROM user_accounts")->fetchColumn();
[$emailOnlyStatus] = integration_http_json('/api/auth/student/signup', '', ['email' => 'secretary@bicol-u.edu.ph']);
expect_same(404, $emailOnlyStatus, 'Email-only Student self-signup endpoint is retired');
$legacyAfter = $pdo->query("SELECT user_id, student_account_user_id FROM students WHERE student_id = 24")->fetch(PDO::FETCH_ASSOC);
expect_same($legacyBefore, $legacyAfter, 'Email-only onboarding leaves legacy Secretary identity links unchanged');
expect_same($legacyTokenCountBefore, (int) $pdo->query("SELECT COUNT(*) FROM security_tokens WHERE purpose = 'student_activation' AND related_student_id = 24")->fetchColumn(), 'Email-only onboarding creates no Student invitation token');
expect_same($legacyAccountCountBefore, (int) $pdo->query("SELECT COUNT(*) FROM user_accounts")->fetchColumn(), 'Email-only onboarding creates no account');

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

$googleContext = [
    'request_id' => 'google-integration-' . bin2hex(random_bytes(4)),
    'ip_address' => '127.0.0.2',
    'user_agent' => 'Google Integration Test',
    'http_method' => 'POST',
    'endpoint' => '/api/auth/google',
];

// Faculty invitations are Admin-authorized and replace public registration.
[$facultyLoginStatus, $facultyLoginBody] = integration_http_json('/api/auth/login', '', [
    'email' => 'faculty@bicol-u.edu.ph',
    'password' => $demoPasswords['faculty@bicol-u.edu.ph'],
]);
expect_same(200, $facultyLoginStatus, 'Faculty integration login succeeds');
$facultyAccessToken = (string) ($facultyLoginBody['access_token'] ?? '');

$facultyInvitationEmail = 'invite-faculty-' . bin2hex(random_bytes(4)) . '@bicol-u.edu.ph';
[$facultyInvitationStatus, $facultyInvitationBody] = integration_http_json('/api/admin/faculty-invitations', $adminAccessToken, [
    'name' => 'Dr. Invitation Faculty',
    'email' => $facultyInvitationEmail,
]);
expect_same(201, $facultyInvitationStatus, 'Admin can issue a Faculty invitation');
expect_same(null, $facultyInvitationBody['invitation_link'] ?? null, 'Test environment does not expose raw invitation tokens');
expect_same('Sent', $facultyInvitationBody['delivery_status'] ?? null, 'Faculty invitation reports successful email delivery separately from issuance');
$facultyInvitationAccountStmt = $pdo->prepare('SELECT user_id, role, status FROM user_accounts WHERE login_email = ?');
$facultyInvitationAccountStmt->execute([$facultyInvitationEmail]);
$facultyInvitationAccount = $facultyInvitationAccountStmt->fetch(PDO::FETCH_ASSOC);
expect_same('faculty', $facultyInvitationAccount['role'] ?? null, 'Faculty invitation fixes the Faculty role');
expect_same('Pending Activation', $facultyInvitationAccount['status'] ?? null, 'Invited Faculty cannot log in before acceptance');
$facultyInvitationTokenStmt = $pdo->prepare(
    "SELECT octet_length(token_digest) AS digest_length, used_at, revoked_at,
            (expires_at - issued_at) >= INTERVAL '6 days 23 hours' AS seven_day_lifetime
       FROM security_tokens WHERE purpose = 'faculty_invitation' AND user_id = ?
       ORDER BY token_id DESC LIMIT 1"
);
$facultyInvitationTokenStmt->execute([(int) $facultyInvitationAccount['user_id']]);
$facultyInvitationToken = $facultyInvitationTokenStmt->fetch(PDO::FETCH_ASSOC);
expect_same(32, (int) ($facultyInvitationToken['digest_length'] ?? 0), 'Faculty invitation persists only a 32-byte digest');
expect_true(in_array($facultyInvitationToken['seven_day_lifetime'] ?? null, [true, 't', '1', 1], true), 'Faculty invitation uses a seven-day expiry');
$legacyFacultyName = 'Dr. Invitation Faculty, DMD';
$pdo->prepare('UPDATE user_accounts SET display_name = ?, status = ? WHERE user_id = ?')->execute([$legacyFacultyName, 'Pending Approval', (int) $facultyInvitationAccount['user_id']]);
[$facultyReissueStatus] = integration_http_json('/api/admin/faculty-invitations/reissue', $adminAccessToken, [
    'id' => (string) $facultyInvitationAccount['user_id'],
]);
expect_same(201, $facultyReissueStatus, 'Admin can reissue an unaccepted Faculty invitation with a legacy display name');
$reissuedFacultyAccountStmt = $pdo->prepare('SELECT login_email, display_name, status FROM user_accounts WHERE user_id = ?');
$reissuedFacultyAccountStmt->execute([(int) $facultyInvitationAccount['user_id']]);
$reissuedFacultyAccount = $reissuedFacultyAccountStmt->fetch(PDO::FETCH_ASSOC);
expect_same($facultyInvitationEmail, $reissuedFacultyAccount['login_email'] ?? null, 'Faculty reissue preserves the stored email identity');
expect_same($legacyFacultyName, $reissuedFacultyAccount['display_name'] ?? null, 'Faculty reissue preserves the stored display name');
expect_same('Pending Activation', $reissuedFacultyAccount['status'] ?? null, 'Faculty reissue returns the account to pending activation');
[$facultyReissueMismatchStatus] = integration_http_json('/api/admin/faculty-invitations/reissue', $adminAccessToken, [
    'id' => (string) $facultyInvitationAccount['user_id'],
    'email' => 'different-' . bin2hex(random_bytes(4)) . '@bicol-u.edu.ph',
]);
expect_same(400, $facultyReissueMismatchStatus, 'Faculty reissue rejects browser-supplied identity changes');
$facultyTokenStatesStmt = $pdo->prepare(
    "SELECT COUNT(*) FILTER (WHERE used_at IS NULL AND revoked_at IS NULL) AS live_count,
            COUNT(*) FILTER (WHERE revoked_at IS NOT NULL) AS revoked_count
       FROM security_tokens WHERE purpose = 'faculty_invitation' AND user_id = ?"
);
$facultyTokenStatesStmt->execute([(int) $facultyInvitationAccount['user_id']]);
$facultyTokenStates = $facultyTokenStatesStmt->fetch(PDO::FETCH_ASSOC);
expect_same(1, (int) ($facultyTokenStates['live_count'] ?? 0), 'Faculty reissue leaves exactly one unconsumed live token');
expect_same(1, (int) ($facultyTokenStates['revoked_count'] ?? 0), 'Faculty reissue revokes the previous invitation');
[$facultyListStatus, $facultyListBody] = integration_http_get_json('/api/admin/faculty-invitations', $adminAccessToken);
expect_same(200, $facultyListStatus, 'Admin can view Faculty invitation state');
$listedFacultyInvitation = array_values(array_filter($facultyListBody['invitations'] ?? [], static fn(array $item): bool => $item['email'] === $facultyInvitationEmail))[0] ?? null;
expect_same('Pending', $listedFacultyInvitation['status'] ?? null, 'Faculty invitation list reports the current pending state');
$listedLegacyFaculty = array_values(array_filter($facultyListBody['invitations'] ?? [], static fn(array $item): bool => $item['email'] === 'faculty@bicol-u.edu.ph'))[0] ?? null;
expect_same('Not invited', $listedLegacyFaculty['status'] ?? null, 'Legacy Active Faculty is not falsely labeled as having accepted an invitation');
[$nonAdminInviteStatus] = integration_http_json('/api/admin/faculty-invitations', $facultyAccessToken, [
    'name' => 'Unauthorized Faculty',
    'email' => 'unauthorized-' . bin2hex(random_bytes(4)) . '@bicol-u.edu.ph',
]);
expect_same(403, $nonAdminInviteStatus, 'Faculty cannot issue Admin-authorized Faculty invitations');
[$activeFacultyConflictStatus] = integration_http_json('/api/admin/faculty-invitations', $adminAccessToken, [
    'name' => 'Existing Faculty',
    'email' => 'faculty@bicol-u.edu.ph',
]);
expect_same(409, $activeFacultyConflictStatus, 'Admin invitation does not overwrite an Active Faculty account');
[$publicFacultySignupStatus] = integration_http_json('/api/auth/register', '', ['name' => 'Public Signup', 'email' => 'public-signup@bicol-u.edu.ph', 'password' => 'PublicPass123!']);
expect_same(404, $publicFacultySignupStatus, 'Public Faculty registration endpoint is retired');

$knownFacultyToken = base64url_encode(random_bytes(32));
$knownFacultyDigest = hash('sha256', $knownFacultyToken, true);
$acceptFacultyEmail = 'accept-faculty-' . bin2hex(random_bytes(4)) . '@bicol-u.edu.ph';
$acceptFacultyInsert = $pdo->prepare(
    "INSERT INTO user_accounts (login_email, password_hash, role, display_name, status, created_at)
     VALUES (?, ?, 'faculty', 'Dr. Acceptance Faculty', 'Pending Activation', CURRENT_TIMESTAMP(6))
     RETURNING user_id"
);
$acceptFacultyInsert->execute([$acceptFacultyEmail, password_hash(base64url_encode(random_bytes(32)), PASSWORD_DEFAULT)]);
$acceptFacultyId = (int) $acceptFacultyInsert->fetchColumn();
$acceptFacultyTokenInsert = $pdo->prepare(
    "INSERT INTO security_tokens (purpose, user_id, token_digest, issued_at, expires_at)
     VALUES ('faculty_invitation', ?, ?, CURRENT_TIMESTAMP(6), CURRENT_TIMESTAMP(6) + INTERVAL '7 days')"
);
$acceptFacultyTokenInsert->bindValue(1, $acceptFacultyId, PDO::PARAM_INT);
pdo_bind_binary($acceptFacultyTokenInsert, 2, $knownFacultyDigest);
$acceptFacultyTokenInsert->execute();
[$facultyInspectStatus, $facultyInspectBody] = integration_http_get_json('/api/auth/faculty/invitation?token=' . rawurlencode($knownFacultyToken), '');
expect_same(200, $facultyInspectStatus, 'Valid Faculty invitation is inspectable');
expect_same($acceptFacultyEmail, $facultyInspectBody['invitation']['email'] ?? null, 'Inspection shows the invited Faculty identity');
[$facultyAcceptStatus] = integration_http_json('/api/auth/faculty/activate', '', ['token' => $knownFacultyToken, 'password' => 'FacultyInvitePass123!']);
expect_same(200, $facultyAcceptStatus, 'Faculty invitation acceptance activates with a required password');
$acceptedFacultyStmt = $pdo->prepare('SELECT role, status, password_hash FROM user_accounts WHERE user_id = ?');
$acceptedFacultyStmt->execute([$acceptFacultyId]);
$acceptedFaculty = $acceptedFacultyStmt->fetch(PDO::FETCH_ASSOC);
expect_same('faculty', $acceptedFaculty['role'] ?? null, 'Faculty acceptance preserves the invited role');
expect_same('Active', $acceptedFaculty['status'] ?? null, 'Faculty acceptance requires no second approval');
expect_true(password_verify('FacultyInvitePass123!', (string) ($acceptedFaculty['password_hash'] ?? '')), 'Faculty acceptance stores the created DentiSys password');
[$facultyReplayStatus] = integration_http_json('/api/auth/faculty/activate', '', ['token' => $knownFacultyToken, 'password' => 'AnotherFacultyPass123!']);
expect_same(400, $facultyReplayStatus, 'Consumed Faculty invitation cannot be reused');
[$unknownFacultyTokenStatus] = integration_http_json('/api/auth/faculty/activate', '', ['token' => base64url_encode(random_bytes(32)), 'password' => 'AnotherFacultyPass123!']);
expect_same(400, $unknownFacultyTokenStatus, 'Unknown Faculty invitation cannot be accepted');
[$acceptedFacultyLoginStatus] = integration_http_json('/api/auth/login', '', ['email' => $acceptFacultyEmail, 'password' => 'FacultyInvitePass123!']);
expect_same(200, $acceptedFacultyLoginStatus, 'Activated Faculty can log in with the created password');
[$acceptedFacultyListStatus, $acceptedFacultyListBody] = integration_http_get_json('/api/admin/faculty-invitations', $adminAccessToken);
expect_same(200, $acceptedFacultyListStatus, 'Admin can inspect accepted Faculty invitation state');
$listedAcceptedFaculty = array_values(array_filter($acceptedFacultyListBody['invitations'] ?? [], static fn(array $item): bool => $item['email'] === $acceptFacultyEmail))[0] ?? null;
expect_same('Accepted', $listedAcceptedFaculty['status'] ?? null, 'Faculty accepted through the invitation lifecycle is labeled Accepted');

$expiredFacultyToken = base64url_encode(random_bytes(32));
$expiredFacultyDigest = hash('sha256', $expiredFacultyToken, true);
$expiredFacultyEmail = 'expired-faculty-' . bin2hex(random_bytes(4)) . '@bicol-u.edu.ph';
$expiredFacultyInsert = $pdo->prepare(
    "INSERT INTO user_accounts (login_email, password_hash, role, display_name, status, created_at)
     VALUES (?, ?, 'faculty', 'Expired Invitation Faculty', 'Pending Activation', CURRENT_TIMESTAMP(6)) RETURNING user_id"
);
$expiredFacultyInsert->execute([$expiredFacultyEmail, password_hash(base64url_encode(random_bytes(32)), PASSWORD_DEFAULT)]);
$expiredFacultyId = (int) $expiredFacultyInsert->fetchColumn();
$expiredFacultyTokenInsert = $pdo->prepare(
    "INSERT INTO security_tokens (purpose, user_id, token_digest, issued_at, expires_at)
     VALUES ('faculty_invitation', ?, ?, CURRENT_TIMESTAMP(6) - INTERVAL '8 days', CURRENT_TIMESTAMP(6) - INTERVAL '1 day')"
);
$expiredFacultyTokenInsert->bindValue(1, $expiredFacultyId, PDO::PARAM_INT);
pdo_bind_binary($expiredFacultyTokenInsert, 2, $expiredFacultyDigest);
$expiredFacultyTokenInsert->execute();
[$expiredFacultyAcceptStatus] = integration_http_json('/api/auth/faculty/activate', '', ['token' => $expiredFacultyToken, 'password' => 'FacultyInvitePass123!']);
expect_same(400, $expiredFacultyAcceptStatus, 'Expired Faculty invitation cannot be accepted');
$revokeExpiredFacultyToken = $pdo->prepare('UPDATE security_tokens SET revoked_at = CURRENT_TIMESTAMP(6) WHERE purpose = ? AND token_digest = ?');
$revokeExpiredFacultyToken->bindValue(1, 'faculty_invitation', PDO::PARAM_STR);
pdo_bind_binary($revokeExpiredFacultyToken, 2, $expiredFacultyDigest);
$revokeExpiredFacultyToken->execute();
[$revokedFacultyAcceptStatus] = integration_http_json('/api/auth/faculty/activate', '', ['token' => $expiredFacultyToken, 'password' => 'FacultyInvitePass123!']);
expect_same(400, $revokedFacultyAcceptStatus, 'Revoked Faculty invitation cannot be accepted');

$studentClassStmt = $pdo->prepare(
    "SELECT cs.cs_id FROM class_sections cs JOIN user_accounts ua ON ua.user_id = cs.instructor_user_id
      WHERE ua.login_email = 'faculty@bicol-u.edu.ph' AND lower(cs.status) = 'active' ORDER BY cs.cs_id LIMIT 1"
);
$studentClassStmt->execute();
$studentClassId = (int) $studentClassStmt->fetchColumn();
expect_true($studentClassId > 0, 'Student invitation fixture uses a class owned by Faculty');
$invitedStudentEmail = 'invite-student-' . bin2hex(random_bytes(4)) . '@bicol-u.edu.ph';
$invitedStudentNumber = 'INV-' . bin2hex(random_bytes(4));
$invitedStudentInsert = $pdo->prepare(
    'INSERT INTO students (student_number, first_name, last_name, bu_email, status)
     VALUES (?, ?, ?, ?, ?) RETURNING student_id'
);
$invitedStudentInsert->execute([$invitedStudentNumber, 'Invited', 'Student', $invitedStudentEmail, 'active']);
$invitedStudentId = (int) $invitedStudentInsert->fetchColumn();
$invitedEnrollmentInsert = $pdo->prepare("INSERT INTO enrollments (student_id, cs_id, status) VALUES (?, ?, 'Active')");
$invitedEnrollmentInsert->execute([$invitedStudentId, $studentClassId]);
[$emailOnlyStatus] = integration_http_json('/api/auth/student/signup', '', ['email' => $invitedStudentEmail]);
expect_same(404, $emailOnlyStatus, 'Student email alone cannot begin onboarding');
$uninvitedLinkStmt = $pdo->prepare('SELECT student_account_user_id FROM students WHERE student_id = ?');
$uninvitedLinkStmt->execute([$invitedStudentId]);
expect_same(null, $uninvitedLinkStmt->fetchColumn(), 'Email-only attempt leaves the canonical Student unlinked');
[$adminStudentInviteStatus] = integration_http_json('/api/faculty/student-invitations', $adminAccessToken, ['studentId' => (string) $invitedStudentId, 'classId' => (string) $studentClassId]);
expect_same(403, $adminStudentInviteStatus, 'Admin cannot issue a Faculty-authorized Student invitation');
[$studentInviteStatus, $studentInviteBody] = integration_http_json('/api/faculty/student-invitations', $facultyAccessToken, ['studentId' => (string) $invitedStudentId, 'classId' => (string) $studentClassId]);
expect_same(201, $studentInviteStatus, 'Owning Faculty can invite the canonical active Student');
expect_same('Sent', $studentInviteBody['delivery_status'] ?? null, 'Student invitation reports successful email delivery separately from issuance');
$studentEmailOutboxStmt = $pdo->prepare(
    "SELECT eo.status, eo.email_type, eo.recipient_email
       FROM email_outbox eo
       JOIN user_accounts ua ON ua.user_id = eo.sender_user_id
      WHERE ua.login_email = 'faculty@bicol-u.edu.ph' AND eo.recipient_email = ?
      ORDER BY eo.email_id DESC LIMIT 1"
);
$studentEmailOutboxStmt->execute([$invitedStudentEmail]);
$studentEmailOutbox = $studentEmailOutboxStmt->fetch(PDO::FETCH_ASSOC);
expect_same('Sent', $studentEmailOutbox['status'] ?? null, 'Sent Student invitation is persisted in the Faculty email history ledger');
expect_same('Student Invitation', $studentEmailOutbox['email_type'] ?? null, 'Student invitation history retains its email category');
expect_same($invitedStudentEmail, $studentEmailOutbox['recipient_email'] ?? null, 'Student invitation history retains the canonical recipient');
$pendingStudentStmt = $pdo->prepare(
    'SELECT ua.user_id, ua.role, ua.status, s.student_account_user_id
       FROM students s JOIN user_accounts ua ON ua.user_id = s.student_account_user_id
      WHERE s.student_id = ?'
);
$pendingStudentStmt->execute([$invitedStudentId]);
$pendingStudent = $pendingStudentStmt->fetch(PDO::FETCH_ASSOC);
expect_same('student', $pendingStudent['role'] ?? null, 'Student invitation creates a Student account');
expect_same('Pending Activation', $pendingStudent['status'] ?? null, 'Invited Student cannot log in before acceptance');
expect_same((int) $pendingStudent['user_id'], (int) $pendingStudent['student_account_user_id'], 'Student invitation sets the canonical account link');
$studentTokenStmt = $pdo->prepare(
    "SELECT related_student_id, related_cs_id, octet_length(token_digest) AS digest_length,
            (expires_at - issued_at) >= INTERVAL '23 hours' AS day_lifetime
       FROM security_tokens WHERE purpose = 'student_activation' AND user_id = ? ORDER BY token_id DESC LIMIT 1"
);
$studentTokenStmt->execute([(int) $pendingStudent['user_id']]);
$issuedStudentToken = $studentTokenStmt->fetch(PDO::FETCH_ASSOC);
expect_same($invitedStudentId, (int) ($issuedStudentToken['related_student_id'] ?? 0), 'Student activation token binds the canonical Student');
expect_same($studentClassId, (int) ($issuedStudentToken['related_cs_id'] ?? 0), 'Student activation token binds the authorized class');
expect_same(32, (int) ($issuedStudentToken['digest_length'] ?? 0), 'Student invitation stores a token digest');
expect_true(in_array($issuedStudentToken['day_lifetime'] ?? null, [true, 't', '1', 1], true), 'Student invitation uses a 24-hour expiry');
$wrongSectionId = (int) $pdo->query("SELECT cs_id FROM class_sections WHERE cs_id <> {$studentClassId} ORDER BY cs_id LIMIT 1")->fetchColumn();
if ($wrongSectionId > 0) {
    $tokenCountBeforeWrongSection = (int) $pdo->query("SELECT COUNT(*) FROM security_tokens WHERE purpose = 'student_activation' AND user_id = " . (int) $pendingStudent['user_id'])->fetchColumn();
    [$wrongSectionStatus] = integration_http_json('/api/faculty/student-invitations', $facultyAccessToken, ['studentId' => (string) $invitedStudentId, 'classId' => (string) $wrongSectionId]);
    expect_same(409, $wrongSectionStatus, 'Faculty cannot invite through a class without the exact active enrollment');
    expect_same($tokenCountBeforeWrongSection, (int) $pdo->query("SELECT COUNT(*) FROM security_tokens WHERE purpose = 'student_activation' AND user_id = " . (int) $pendingStudent['user_id'])->fetchColumn(), 'Wrong-class request creates no Student invitation token');
}
[$studentReissueStatus] = integration_http_json('/api/faculty/student-invitations', $facultyAccessToken, ['studentId' => (string) $invitedStudentId, 'classId' => (string) $studentClassId]);
expect_same(201, $studentReissueStatus, 'Faculty can reissue a pending Student invitation');
expect_true((int) $pdo->query("SELECT COUNT(*) FROM security_tokens WHERE purpose = 'student_activation' AND user_id = " . (int) $pendingStudent['user_id'] . " AND revoked_at IS NOT NULL")->fetchColumn() > 0, 'Student reissue revokes obsolete activation tokens');

// The API reissue above intentionally leaves one live token. Revoke that
// fixture token before inserting a deterministic token for acceptance below.
$pdo->prepare("UPDATE security_tokens SET revoked_at = CURRENT_TIMESTAMP(6) WHERE purpose = 'student_activation' AND user_id = ? AND used_at IS NULL AND revoked_at IS NULL")
    ->execute([(int) $pendingStudent['user_id']]);

$knownStudentToken = base64url_encode(random_bytes(32));
$knownStudentDigest = hash('sha256', $knownStudentToken, true);
$knownStudentTokenInsert = $pdo->prepare(
    "INSERT INTO security_tokens (purpose, user_id, related_student_id, related_cs_id, token_digest, issued_at, expires_at)
     VALUES ('student_activation', ?, ?, ?, ?, CURRENT_TIMESTAMP(6), CURRENT_TIMESTAMP(6) + INTERVAL '24 hours')"
);
$knownStudentTokenInsert->bindValue(1, (int) $pendingStudent['user_id'], PDO::PARAM_INT);
$knownStudentTokenInsert->bindValue(2, $invitedStudentId, PDO::PARAM_INT);
$knownStudentTokenInsert->bindValue(3, $studentClassId, PDO::PARAM_INT);
pdo_bind_binary($knownStudentTokenInsert, 4, $knownStudentDigest);
$knownStudentTokenInsert->execute();
[$studentInspectStatus, $studentInspectBody] = integration_http_get_json('/api/auth/student/invitation?token=' . rawurlencode($knownStudentToken), '');
expect_same(200, $studentInspectStatus, 'Valid class-scoped Student invitation is inspectable');
expect_same($invitedStudentEmail, $studentInspectBody['invitation']['email'] ?? null, 'Student inspection shows canonical institutional email');
expect_same($invitedStudentNumber, $studentInspectBody['invitation']['studentNumber'] ?? null, 'Student inspection shows canonical Student number');
[$studentAcceptStatus] = integration_http_json('/api/auth/student/activate', '', ['token' => $knownStudentToken, 'password' => 'StudentInvitePass123!']);
expect_same(200, $studentAcceptStatus, 'Student accepts the Faculty invitation with a required password');
$acceptedStudentStmt = $pdo->prepare(
    'SELECT ua.status, ua.password_hash, s.student_account_user_id, s.user_id
       FROM user_accounts ua JOIN students s ON s.student_account_user_id = ua.user_id
      WHERE s.student_id = ?'
);
$acceptedStudentStmt->execute([$invitedStudentId]);
$acceptedStudent = $acceptedStudentStmt->fetch(PDO::FETCH_ASSOC);
expect_same('Active', $acceptedStudent['status'] ?? null, 'Eligible invited Student becomes Active');
expect_true(password_verify('StudentInvitePass123!', (string) ($acceptedStudent['password_hash'] ?? '')), 'Student acceptance stores the created DentiSys password');
expect_same(null, $acceptedStudent['user_id'] ?? null, 'Student acceptance does not rewrite a Secretary link');
expect_same((int) $pendingStudent['user_id'], (int) $acceptedStudent['student_account_user_id'], 'Student acceptance preserves its canonical account relationship');
[$acceptedStudentLoginStatus] = integration_http_json('/api/auth/login', '', ['email' => $invitedStudentEmail, 'password' => 'StudentInvitePass123!']);
expect_same(200, $acceptedStudentLoginStatus, 'Activated Student can use password authentication');

$unscopedEmail = 'unscoped-' . bin2hex(random_bytes(4)) . '@bicol-u.edu.ph';
$unscopedStudentInsert = $pdo->prepare(
    'INSERT INTO students (student_number, first_name, last_name, bu_email, status)
     VALUES (?, ?, ?, ?, ?) RETURNING student_id'
);
$unscopedStudentInsert->execute(['LEG-' . bin2hex(random_bytes(4)), 'Legacy', 'Student', $unscopedEmail, 'active']);
$unscopedStudentId = (int) $unscopedStudentInsert->fetchColumn();
$unscopedEnrollment = $pdo->prepare("INSERT INTO enrollments (student_id, cs_id, status) VALUES (?, ?, 'Active')");
$unscopedEnrollment->execute([$unscopedStudentId, $studentClassId]);
[$unscopedInviteStatus] = integration_http_json('/api/faculty/student-invitations', $facultyAccessToken, ['studentId' => (string) $unscopedStudentId, 'classId' => (string) $studentClassId]);
expect_same(201, $unscopedInviteStatus, 'Second active Student invitation fixture is created');
$unscopedAccountStmt = $pdo->prepare('SELECT student_account_user_id FROM students WHERE student_id = ?');
$unscopedAccountStmt->execute([$unscopedStudentId]);
$unscopedAccountId = (int) $unscopedAccountStmt->fetchColumn();
$pdo->prepare("UPDATE security_tokens SET revoked_at = CURRENT_TIMESTAMP(6) WHERE purpose = 'student_activation' AND user_id = ? AND used_at IS NULL AND revoked_at IS NULL")
    ->execute([$unscopedAccountId]);
$unscopedToken = base64url_encode(random_bytes(32));
$unscopedDigest = hash('sha256', $unscopedToken, true);
$unscopedTokenInsert = $pdo->prepare(
    "INSERT INTO security_tokens (purpose, user_id, related_student_id, token_digest, issued_at, expires_at)
     VALUES ('student_activation', ?, ?, ?, CURRENT_TIMESTAMP(6), CURRENT_TIMESTAMP(6) + INTERVAL '24 hours')"
);
$unscopedTokenInsert->bindValue(1, $unscopedAccountId, PDO::PARAM_INT);
$unscopedTokenInsert->bindValue(2, $unscopedStudentId, PDO::PARAM_INT);
pdo_bind_binary($unscopedTokenInsert, 3, $unscopedDigest);
$unscopedTokenInsert->execute();
[$unscopedActivationStatus] = integration_http_json('/api/auth/student/activate', '', ['token' => $unscopedToken, 'password' => 'StudentInvitePass123!']);
expect_same(400, $unscopedActivationStatus, 'Legacy Student token without class scope is rejected');
$unscopedStateStmt = $pdo->prepare('SELECT status FROM user_accounts WHERE user_id = ?');
$unscopedStateStmt->execute([$unscopedAccountId]);
expect_same('Pending Activation', $unscopedStateStmt->fetchColumn(), 'Rejected unscoped token leaves account pending');
$unscopedUsedStmt = $pdo->prepare('SELECT used_at FROM security_tokens WHERE purpose = ? AND token_digest = ?');
$unscopedUsedStmt->bindValue(1, 'student_activation', PDO::PARAM_STR);
pdo_bind_binary($unscopedUsedStmt, 2, $unscopedDigest);
$unscopedUsedStmt->execute();
expect_same(null, $unscopedUsedStmt->fetchColumn(), 'Rejected unscoped token remains unused');
// Direct Google sessions persist provenance and remain visible to the normal
// access-token and /api/auth/me paths.
$directGoogleEmail = 'postgres-google-direct-' . bin2hex(random_bytes(4)) . '@bicol-u.edu.ph';
$directGoogleUserId = $insertFixtureAccount($pdo, $directGoogleEmail, 'faculty');
$pdo->beginTransaction();
$directGoogleLocked = auth_lock_user_for_session($pdo, $directGoogleUserId);
$directGoogleCredentials = auth_issue_credentials($pdo, $directGoogleLocked, $config, $googleContext, 'google');
$pdo->commit();
$directSource = $pdo->prepare('SELECT authentication_source FROM auth_sessions WHERE session_id = ?');
$directSource->execute([(int) $directGoogleCredentials['session']['session_id']]);
expect_same('google', $directSource->fetchColumn(), 'Google session persists authentication_source=google');
$directGoogleAuthContext = auth_verify_access_token(
    $pdo,
    $config,
    $directGoogleCredentials['access_token'],
    config_key_bytes_at_least($config['jwt']['signing_key_b64'], 32, 'JWT_SIGNING_KEY')
);
expect_same('google', $directGoogleAuthContext['authentication_source'], 'Access-token validation preserves Google provenance');
$directGoogleMe = auth_runtime_me($pdo, $config, $googleContext + [
    'auth_header' => 'Bearer ' . $directGoogleCredentials['access_token'],
]);
expect_same('google', $directGoogleMe['authentication_source'], 'Normal /api/auth/me recognizes Google provenance');

// First-time binding is performed inside the same transaction as session
// issuance and is protected by the partial unique subject index.
$bindingEmail = 'postgres-google-binding-' . bin2hex(random_bytes(4)) . '@bicol-u.edu.ph';
$bindingUserId = $insertFixtureAccount($pdo, $bindingEmail, 'faculty');
$bindingSubject = 'google-binding-' . bin2hex(random_bytes(6));
$pdo->beginTransaction();
$bindingLocked = auth_lock_user_for_session($pdo, $bindingUserId);
$bindingCredentials = auth_issue_credentials($pdo, $bindingLocked, $config, $googleContext, 'google', $bindingSubject);
$pdo->commit();
$bindingRow = $pdo->prepare('SELECT google_subject FROM user_accounts WHERE user_id = ?');
$bindingRow->execute([$bindingUserId]);
expect_same($bindingSubject, $bindingRow->fetchColumn(), 'First-time Google subject binding is persisted');
$bindingSessionSource = $pdo->prepare('SELECT authentication_source FROM auth_sessions WHERE session_id = ?');
$bindingSessionSource->execute([(int) $bindingCredentials['session']['session_id']]);
expect_same('google', $bindingSessionSource->fetchColumn(), 'Bound Google session persists Google provenance');

$pdo->beginTransaction();
try {
    $lockedExistingBinding = auth_lock_user_for_session($pdo, $bindingUserId);
    auth_issue_credentials($pdo, $lockedExistingBinding, $config, $googleContext, 'google', 'google-replacement-subject');
    $pdo->commit();
    expect_true(false, 'Existing Google subject cannot be replaced');
} catch (Throwable) {
    if ($pdo->inTransaction()) { $pdo->rollBack(); }
}
$bindingRow->execute([$bindingUserId]);
expect_same($bindingSubject, $bindingRow->fetchColumn(), 'Existing Google subject remains unchanged after replacement attempt');

$duplicateBindingEmail = 'postgres-google-duplicate-' . bin2hex(random_bytes(4)) . '@bicol-u.edu.ph';
$duplicateBindingUserId = $insertFixtureAccount($pdo, $duplicateBindingEmail, 'faculty');
$duplicateBindingRejected = false;
$pdo->beginTransaction();
try {
    $duplicateLocked = auth_lock_user_for_session($pdo, $duplicateBindingUserId);
    auth_issue_credentials($pdo, $duplicateLocked, $config, $googleContext, 'google', $bindingSubject);
    $pdo->commit();
} catch (Throwable) {
    $duplicateBindingRejected = true;
    if ($pdo->inTransaction()) { $pdo->rollBack(); }
}
expect_true($duplicateBindingRejected, 'One Google subject cannot be bound to two accounts');
$duplicateSubject = $pdo->prepare('SELECT google_subject FROM user_accounts WHERE user_id = ?');
$duplicateSubject->execute([$duplicateBindingUserId]);
expect_same(null, $duplicateSubject->fetchColumn(), 'Failed duplicate binding rolls back the subject update');
$duplicateSessions = $pdo->prepare('SELECT COUNT(*) FROM auth_sessions WHERE user_id = ?');
$duplicateSessions->execute([$duplicateBindingUserId]);
expect_same(0, (int) $duplicateSessions->fetchColumn(), 'Failed duplicate binding creates no session');

$createMfaFixture = static function (PDO $pdo, array $config, string $email): array {
    $userInsert = $pdo->prepare(
        "INSERT INTO user_accounts (login_email, password_hash, role, display_name, status, created_at)
         VALUES (?, ?, 'faculty', 'Google MFA Integration User', 'Active', CURRENT_TIMESTAMP(6))
         RETURNING user_id"
    );
    $userInsert->execute([$email, password_hash('GoogleMfaPass1!', PASSWORD_DEFAULT)]);
    $userId = (int) $userInsert->fetchColumn();
    $secret = mfa_generate_secret();
    $encrypted = mfa_encrypt_secret($secret, config_key_bytes_exact($config['mfa']['encryption_key_b64'], 32, 'MFA_ENCRYPTION_KEY'));
    $mfaInsert = $pdo->prepare(
        "INSERT INTO security_tokens
            (purpose, user_id, ciphertext, nonce, auth_tag, enc_key_version, enc_algorithm,
             totp_algorithm, digit_count, period_seconds, mfa_status, mfa_verified_at)
         VALUES ('mfa_credential', ?, ?, ?, ?, 1, 'AES-256-GCM', 'sha1', 6, 30, 'enabled', CURRENT_TIMESTAMP(6))"
    );
    $mfaInsert->bindValue(1, $userId, PDO::PARAM_INT);
    pdo_bind_binary($mfaInsert, 2, $encrypted['ciphertext']);
    pdo_bind_binary($mfaInsert, 3, $encrypted['nonce']);
    pdo_bind_binary($mfaInsert, 4, $encrypted['auth_tag']);
    $mfaInsert->execute();
    $recovery = mfa_generate_recovery_codes(1);
    $recoveryInsert = $pdo->prepare(
        "INSERT INTO security_tokens (purpose, user_id, secret_hash, issued_at)
         VALUES ('mfa_recovery', ?, ?, CURRENT_TIMESTAMP(6))"
    );
    $recoveryInsert->execute([$userId, $recovery['hashes'][0]]);
    return ['user_id' => $userId, 'secret' => $secret, 'recovery_code' => $recovery['codes'][0]];
};

// TOTP completion defers Google binding until MFA succeeds.
$totpFixture = $createMfaFixture($pdo, $config, 'postgres-google-totp-' . bin2hex(random_bytes(4)) . '@bicol-u.edu.ph');
$totpUserStmt = $pdo->prepare('SELECT user_id, login_email, role, display_name, status, token_version FROM user_accounts WHERE user_id = ?');
$totpUserStmt->execute([$totpFixture['user_id']]);
$totpUser = $totpUserStmt->fetch(PDO::FETCH_ASSOC);
$totpChallenge = auth_issue_two_factor_challenge($config, $totpUser, 'google', 'google-totp-pending-' . bin2hex(random_bytes(5)));
$totpClaims = jwt_decode(
    $totpChallenge['two_factor_challenge_token'],
    config_key_bytes_at_least($config['jwt']['signing_key_b64'], 32, 'JWT_SIGNING_KEY'),
    'mfa_challenge'
);
$totpCode = mfa_compute_totp($totpFixture['secret'], intdiv(time(), 30))['code'];
$totpResult = mfa_runtime_verify($pdo, $config, $totpClaims, $totpCode, $googleContext + ['endpoint' => '/api/auth/mfa/verify']);
$totpSubject = $pdo->prepare('SELECT google_subject FROM user_accounts WHERE user_id = ?');
$totpSubject->execute([$totpFixture['user_id']]);
expect_same($totpClaims['pending_google_subject'], $totpSubject->fetchColumn(), 'Successful TOTP persists the pending Google subject');
$totpSessionSource = $pdo->prepare('SELECT authentication_source FROM auth_sessions WHERE session_id = ?');
$totpSessionSource->execute([(int) $totpResult['credentials']['session']['session_id']]);
expect_same('google', $totpSessionSource->fetchColumn(), 'Successful TOTP creates a Google-provenance session');

// Recovery completion follows the same deferred-binding path on a separate
// fixture account.
$recoveryFixture = $createMfaFixture($pdo, $config, 'postgres-google-recovery-' . bin2hex(random_bytes(4)) . '@bicol-u.edu.ph');
$recoveryUserStmt = $pdo->prepare('SELECT user_id, login_email, role, display_name, status, token_version FROM user_accounts WHERE user_id = ?');
$recoveryUserStmt->execute([$recoveryFixture['user_id']]);
$recoveryUser = $recoveryUserStmt->fetch(PDO::FETCH_ASSOC);
$recoveryChallenge = auth_issue_two_factor_challenge($config, $recoveryUser, 'google', 'google-recovery-pending-' . bin2hex(random_bytes(5)));
$recoveryClaims = jwt_decode(
    $recoveryChallenge['two_factor_challenge_token'],
    config_key_bytes_at_least($config['jwt']['signing_key_b64'], 32, 'JWT_SIGNING_KEY'),
    'mfa_challenge'
);
$recoveryResult = mfa_runtime_recover($pdo, $config, $recoveryClaims, $recoveryFixture['recovery_code'], $googleContext + ['endpoint' => '/api/auth/mfa/recover']);
$recoverySubject = $pdo->prepare('SELECT google_subject FROM user_accounts WHERE user_id = ?');
$recoverySubject->execute([$recoveryFixture['user_id']]);
expect_same($recoveryClaims['pending_google_subject'], $recoverySubject->fetchColumn(), 'Successful recovery persists the pending Google subject');
$recoverySessionSource = $pdo->prepare('SELECT authentication_source FROM auth_sessions WHERE session_id = ?');
$recoverySessionSource->execute([(int) $recoveryResult['credentials']['session']['session_id']]);
expect_same('google', $recoverySessionSource->fetchColumn(), 'Successful recovery creates a Google-provenance session');

// Failed and expired MFA challenges do not persist a pending subject.
$failedMfaFixture = $createMfaFixture($pdo, $config, 'postgres-google-mfa-failed-' . bin2hex(random_bytes(4)) . '@bicol-u.edu.ph');
$failedUserStmt = $pdo->prepare('SELECT user_id, login_email, role, display_name, status, token_version FROM user_accounts WHERE user_id = ?');
$failedUserStmt->execute([$failedMfaFixture['user_id']]);
$failedUser = $failedUserStmt->fetch(PDO::FETCH_ASSOC);
$failedChallenge = auth_issue_two_factor_challenge($config, $failedUser, 'google', 'google-failed-pending-' . bin2hex(random_bytes(5)));
$failedClaims = jwt_decode($failedChallenge['two_factor_challenge_token'], config_key_bytes_at_least($config['jwt']['signing_key_b64'], 32, 'JWT_SIGNING_KEY'), 'mfa_challenge');
try {
    mfa_runtime_verify($pdo, $config, $failedClaims, '000000', $googleContext + ['endpoint' => '/api/auth/mfa/verify']);
    expect_true(false, 'Failed MFA code is rejected');
} catch (Throwable) {
    $failedSubject = $pdo->prepare('SELECT google_subject FROM user_accounts WHERE user_id = ?');
    $failedSubject->execute([$failedMfaFixture['user_id']]);
    expect_same(null, $failedSubject->fetchColumn(), 'Failed MFA does not persist the pending Google subject');
}
$expiredChallenge = auth_issue_two_factor_challenge($config, $failedUser, 'google', 'google-expired-pending-' . bin2hex(random_bytes(5)));
$expiredClaims = jwt_decode($expiredChallenge['two_factor_challenge_token'], config_key_bytes_at_least($config['jwt']['signing_key_b64'], 32, 'JWT_SIGNING_KEY'), 'mfa_challenge');
$expiredPath = challenge_state_path(['dir' => $config['rate_limit']['storage_dir']], $expiredClaims['jti'], 'mfa_challenge', 'complete_login');
$expiredState = json_decode((string) file_get_contents($expiredPath), true);
$expiredState['expires_at'] = time() - 1;
file_put_contents($expiredPath, json_encode($expiredState, JSON_THROW_ON_ERROR));
try {
    mfa_runtime_verify($pdo, $config, $expiredClaims, '000000', $googleContext + ['endpoint' => '/api/auth/mfa/verify']);
    expect_true(false, 'Expired MFA challenge is rejected');
} catch (Throwable) {
    $failedSubject->execute([$failedMfaFixture['user_id']]);
    expect_same(null, $failedSubject->fetchColumn(), 'Expired MFA does not persist the pending Google subject');
}

$studentContext = [
    'request_id' => 'p03-student-' . bin2hex(random_bytes(4)),
    'ip_address' => '127.0.0.1',
    'user_agent' => 'P03 Student Integration Test',
    'http_method' => 'POST',
    'endpoint' => '/api/auth/login',
];
$studentConfig = $config;
$studentConfig['features']['student_auth_enabled'] = false;
$studentLogin = auth_runtime_login($pdo, $studentConfig, [
    'email' => 'student@bicol-u.edu.ph',
    'password' => 'Student123!',
], $studentContext);
expect_same('direct_login', $studentLogin['type'], 'Development Student password login succeeds');
$studentCredentials = $studentLogin['credentials'];
$studentAuthContext = auth_verify_access_token(
    $pdo,
    $studentConfig,
    $studentCredentials['access_token'],
    config_key_bytes_at_least($config['jwt']['signing_key_b64'], 32, 'JWT_SIGNING_KEY')
);
expect_same('student', $studentAuthContext['role'], 'Student access token validates with the Student role');
expect_same(26, $studentAuthContext['student']['student_id'], 'Student access context carries canonical Student identity');
$studentMe = auth_runtime_me($pdo, $studentConfig, $studentContext + [
    'auth_header' => 'Bearer ' . $studentCredentials['access_token'],
]);
expect_true(isset($studentMe['authentication_source'], $studentMe['student']), 'Student /api/auth/me shape includes provenance and nested Student identity');

$studentRefresh = auth_runtime_refresh($pdo, $studentConfig, $studentContext, $studentCredentials['refresh_token']);
expect_same('rotated', $studentRefresh['type'], 'Established Student refresh succeeds when Student auth is disabled');
$studentCredentials['refresh_token'] = $studentRefresh['child_raw_token'];

$studentGoogleSubject = 'p03-student-google-' . bin2hex(random_bytes(4));
$pdo->beginTransaction();
$studentGoogleLocked = auth_lock_user_for_session($pdo, 10);
google_auth_validate_account($pdo, $studentConfig, $studentGoogleLocked);
$studentGoogleCredentials = auth_issue_credentials($pdo, $studentGoogleLocked, $studentConfig, $studentContext, 'google', $studentGoogleSubject);
$pdo->commit();
$studentGoogleSource = $pdo->prepare('SELECT authentication_source FROM auth_sessions WHERE session_id = ?');
$studentGoogleSource->execute([(int) $studentGoogleCredentials['session']['session_id']]);
expect_same('google', $studentGoogleSource->fetchColumn(), 'Established Student Google session succeeds when Student auth is disabled');
$studentGoogleAuthContext = auth_verify_access_token(
    $pdo,
    $studentConfig,
    $studentGoogleCredentials['access_token'],
    config_key_bytes_at_least($studentConfig['jwt']['signing_key_b64'], 32, 'JWT_SIGNING_KEY')
);
expect_same('student', $studentGoogleAuthContext['role'], 'Student Google session preserves the Student role');

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
$generatedFacultyAccessToken = auth_issue_access_token(
    ['user_id' => $locked['user_id'], 'role' => $locked['role'], 'token_version' => $locked['token_version']],
    $session,
    config_key_bytes_at_least($config['jwt']['signing_key_b64'], 32, 'JWT_SIGNING_KEY')
)['token'];

// Authoritative Faculty Attendance Monitoring worksheet coverage. This uses
// isolated real enrollments and sections so the read/mutation contract can be
// verified without relying on browser-local attendance state.
$attendanceFixtureSuffix = strtoupper(bin2hex(random_bytes(4)));
$attendanceCourseId = (int) $pdo->query('SELECT course_id FROM courses ORDER BY course_id LIMIT 1')->fetchColumn();
$attendanceSeedFacultyId = (int) $pdo->query(
    "SELECT user_id FROM user_accounts WHERE login_email = 'faculty@bicol-u.edu.ph'"
)->fetchColumn();
$attendanceSecretaryId = (int) $pdo->query(
    "SELECT user_id FROM user_accounts WHERE login_email = 'secretary@bicol-u.edu.ph'"
)->fetchColumn();
$attendanceClassStmt = $pdo->prepare(
    "INSERT INTO class_sections (cs_name, course_id, instructor_user_id, semester, school_year, block, status)
     VALUES (?, ?, ?, '1ST', '2026-2027', 'FA', 'Active')
     RETURNING cs_id"
);
$attendanceClassStmt->execute(['Attendance Fixture ' . $attendanceFixtureSuffix, $attendanceCourseId, $userId]);
$attendanceClassId = (int) $attendanceClassStmt->fetchColumn();
$attendanceClassStmt->execute(['Attendance Other Fixture ' . $attendanceFixtureSuffix, $attendanceCourseId, $attendanceSeedFacultyId]);
$attendanceOtherClassId = (int) $attendanceClassStmt->fetchColumn();
$attendanceStudentStmt = $pdo->prepare(
    "INSERT INTO students (student_number, first_name, last_name, bu_email, status)
     VALUES (?, ?, ?, ?, 'active')
     RETURNING student_id"
);
$attendanceStudentStmt->execute([
    'ATT-' . $attendanceFixtureSuffix . '-A',
    'Attendance',
    'Alpha',
    'attendance-alpha-' . strtolower($attendanceFixtureSuffix) . '@bicol-u.edu.ph',
]);
$attendanceStudentOneId = (int) $attendanceStudentStmt->fetchColumn();
$attendanceStudentStmt->execute([
    'ATT-' . $attendanceFixtureSuffix . '-B',
    'Attendance',
    'Beta',
    'attendance-beta-' . strtolower($attendanceFixtureSuffix) . '@bicol-u.edu.ph',
]);
$attendanceStudentTwoId = (int) $attendanceStudentStmt->fetchColumn();
$attendanceStudentStmt->execute([
    'ATT-' . $attendanceFixtureSuffix . '-X',
    'Attendance',
    'Foreign',
    'attendance-foreign-' . strtolower($attendanceFixtureSuffix) . '@bicol-u.edu.ph',
]);
$attendanceForeignStudentId = (int) $attendanceStudentStmt->fetchColumn();
$attendanceEnrollmentStmt = $pdo->prepare(
    "INSERT INTO enrollments (student_id, cs_id, status, date_enrolled)
     VALUES (?, ?, 'Active', CURRENT_DATE)
     RETURNING enrollment_id"
);
$attendanceEnrollmentStmt->execute([$attendanceStudentOneId, $attendanceClassId]);
$attendanceEnrollmentOneId = (int) $attendanceEnrollmentStmt->fetchColumn();
$attendanceEnrollmentStmt->execute([$attendanceStudentTwoId, $attendanceClassId]);
$attendanceEnrollmentTwoId = (int) $attendanceEnrollmentStmt->fetchColumn();
$attendanceEnrollmentStmt->execute([$attendanceForeignStudentId, $attendanceOtherClassId]);
$attendanceForeignEnrollmentId = (int) $attendanceEnrollmentStmt->fetchColumn();
$attendanceToday = app_local_date($config, new DateTimeImmutable('now', new DateTimeZone('UTC')));
$attendancePastDate = (new DateTimeImmutable($attendanceToday, new DateTimeZone('UTC')))->modify('-1 day')->format('Y-m-d');
$attendanceFutureDate = (new DateTimeImmutable($attendanceToday, new DateTimeZone('UTC')))->modify('+1 day')->format('Y-m-d');

[$attendanceCurrentReadStatus, $attendanceCurrentReadBody] = integration_http_get_json(
    '/api/faculty/attendance?csId=' . $attendanceClassId . '&date=' . $attendanceToday,
    $generatedFacultyAccessToken
);
expect_same(200, $attendanceCurrentReadStatus, 'Faculty can read an owned worksheet for the current application-local date');
expect_same($attendanceToday, $attendanceCurrentReadBody['worksheet']['date'] ?? null, 'Worksheet read preserves the selected application-local date');

[$attendanceFutureReadStatus, $attendanceFutureReadBody] = integration_http_get_json(
    '/api/faculty/attendance?csId=' . $attendanceClassId . '&date=' . $attendanceFutureDate,
    $generatedFacultyAccessToken
);
expect_same(422, $attendanceFutureReadStatus, 'Faculty worksheet rejects a future application-local date');
expect_same('VALIDATION_ERROR', $attendanceFutureReadBody['code'] ?? null, 'Future worksheet date uses the validation error contract');

[$attendancePastReadStatus, $attendancePastReadBody] = integration_http_get_json(
    '/api/faculty/attendance?csId=' . $attendanceClassId . '&date=' . $attendancePastDate,
    $generatedFacultyAccessToken
);
expect_same(200, $attendancePastReadStatus, 'Faculty can read an owned worksheet for a past date');
expect_same((string) $attendanceClassId, $attendancePastReadBody['worksheet']['classSection']['id'] ?? null, 'Worksheet is scoped to the selected owned class section');
expect_same(null, $attendancePastReadBody['worksheet']['attendanceSession'] ?? null, 'Worksheet reports no attendance session when none exists');
expect_same(2, count($attendancePastReadBody['worksheet']['roster'] ?? []), 'Worksheet roster comes from the two real active enrollments');
foreach (($attendancePastReadBody['worksheet']['roster'] ?? []) as $attendanceRosterRow) {
    expect_same(null, $attendanceRosterRow['id'] ?? null, 'Missing attendance rows are represented without a record ID');
    expect_same(null, $attendanceRosterRow['status'] ?? null, 'Missing attendance rows remain unresolved rather than becoming absent');
}

[$attendanceForeignReadStatus, $attendanceForeignReadBody] = integration_http_get_json(
    '/api/faculty/attendance?csId=' . $attendanceOtherClassId . '&date=' . $attendancePastDate,
    $generatedFacultyAccessToken
);
expect_same(403, $attendanceForeignReadStatus, 'Faculty cannot read another Faculty member\'s class section');
expect_same('FACULTY_SECTION_ACCESS_DENIED', $attendanceForeignReadBody['code'] ?? null, 'Unowned worksheet read returns the ownership error code');

[$attendanceCreateStatus, $attendanceCreateBody] = integration_http_json('/api/faculty/attendance/override', $generatedFacultyAccessToken, [
    'csId' => (string) $attendanceClassId,
    'enrollmentId' => (string) $attendanceEnrollmentOneId,
    'sessionDate' => $attendancePastDate,
    'status' => 'present',
]);
expect_same(200, $attendanceCreateStatus, 'Faculty can create an initial attendance row without a correction reason');
expect_same('created', $attendanceCreateBody['operation'] ?? null, 'Missing attendance mutation reports a created record');
$attendanceRecordOneId = (int) ($attendanceCreateBody['recordId'] ?? 0);
expect_true($attendanceRecordOneId > 0, 'Created attendance row returns its authoritative record ID');
$attendanceRecordOneStmt = $pdo->prepare(
    'SELECT enrollment_id, session_date, attendance_session_id, status, verification_method FROM attendance_records WHERE record_id = ?'
);
$attendanceRecordOneStmt->execute([$attendanceRecordOneId]);
$attendanceRecordOne = $attendanceRecordOneStmt->fetch(PDO::FETCH_ASSOC);
expect_same((string) $attendanceEnrollmentOneId, (string) ($attendanceRecordOne['enrollment_id'] ?? ''), 'Created attendance row belongs to the selected enrollment');
expect_same($attendancePastDate, $attendanceRecordOne['session_date'] ?? null, 'Created attendance row persists the selected worksheet date');
expect_same(null, $attendanceRecordOne['attendance_session_id'] ?? null, 'No Secretary session is fabricated for an unlinked attendance row');
expect_same('present', $attendanceRecordOne['status'] ?? null, 'Created attendance row persists the requested status');
expect_same('manual_faculty', $attendanceRecordOne['verification_method'] ?? null, 'Faculty-created attendance preserves manual provenance');

$attendanceInitialAuditStmt = $pdo->prepare(
    "SELECT reason, before_state_json, after_state_json
       FROM audit_events
      WHERE action_code = 'faculty_attendance_change' AND target_id = ?
      ORDER BY sequence_number ASC
      LIMIT 1"
);
$attendanceInitialAuditStmt->execute([$attendanceRecordOneId]);
$attendanceInitialAudit = $attendanceInitialAuditStmt->fetch(PDO::FETCH_ASSOC);
expect_same(null, $attendanceInitialAudit['reason'] ?? null, 'Initial attendance does not fabricate a correction reason');
expect_same(null, json_decode((string) ($attendanceInitialAudit['before_state_json'] ?? ''), true), 'Initial attendance audit before-state is null');
$attendanceInitialAfter = json_decode((string) ($attendanceInitialAudit['after_state_json'] ?? ''), true);
expect_same('present', $attendanceInitialAfter['status'] ?? null, 'Initial attendance audit after-state records present');

[$attendanceFreshReadStatus, $attendanceFreshReadBody] = integration_http_get_json(
    '/api/faculty/attendance?csId=' . $attendanceClassId . '&date=' . $attendancePastDate,
    $generatedFacultyAccessToken
);
expect_same(200, $attendanceFreshReadStatus, 'Fresh worksheet read succeeds after the Faculty save');
$attendanceFreshOne = array_values(array_filter(
    $attendanceFreshReadBody['worksheet']['roster'] ?? [],
    static fn(array $row): bool => (string) ($row['enrollmentId'] ?? '') === (string) $attendanceEnrollmentOneId
))[0] ?? null;
expect_same((string) $attendanceRecordOneId, $attendanceFreshOne['id'] ?? null, 'Fresh worksheet read returns the persisted attendance record');
expect_same('present', $attendanceFreshOne['status'] ?? null, 'Fresh worksheet read returns the persisted attendance status');

$attendanceAuditCountStmt = $pdo->prepare(
    "SELECT COUNT(*)
       FROM audit_events
      WHERE action_code = 'faculty_attendance_change' AND scope_cs_id = ?"
);
$attendanceAuditCountStmt->execute([$attendanceClassId]);
$attendanceAuditCountBeforeNoOp = (int) $attendanceAuditCountStmt->fetchColumn();
[$attendanceNoOpStatus, $attendanceNoOpBody] = integration_http_json('/api/faculty/attendance/override', $generatedFacultyAccessToken, [
    'recordId' => (string) $attendanceRecordOneId,
    'status' => 'present',
]);
expect_same(200, $attendanceNoOpStatus, 'Submitting the existing attendance status is a successful no-op');
expect_same('unchanged', $attendanceNoOpBody['operation'] ?? null, 'No-op attendance response identifies the unchanged record');
expect_same(false, $attendanceNoOpBody['changed'] ?? null, 'No-op attendance response reports no mutation');
$attendanceAuditCountStmt->execute([$attendanceClassId]);
expect_same($attendanceAuditCountBeforeNoOp, (int) $attendanceAuditCountStmt->fetchColumn(), 'No-op attendance does not append an audit event');

[$attendanceCorrectionMissingReasonStatus, $attendanceCorrectionMissingReasonBody] = integration_http_json('/api/faculty/attendance/override', $generatedFacultyAccessToken, [
    'recordId' => (string) $attendanceRecordOneId,
    'status' => 'absent',
]);
expect_same(422, $attendanceCorrectionMissingReasonStatus, 'Existing attendance correction requires a reason');
expect_same('VALIDATION_ERROR', $attendanceCorrectionMissingReasonBody['code'] ?? null, 'Missing correction reason uses the validation error contract');
[$attendanceCorrectionStatus, $attendanceCorrectionBody] = integration_http_json('/api/faculty/attendance/override', $generatedFacultyAccessToken, [
    'recordId' => (string) $attendanceRecordOneId,
    'status' => 'absent',
    'reason' => 'Faculty corrected the persisted status',
]);
expect_same(200, $attendanceCorrectionStatus, 'Existing attendance correction succeeds with a reason');
expect_same('updated', $attendanceCorrectionBody['operation'] ?? null, 'Existing attendance correction reports an update');
$attendanceCorrectionAuditStmt = $pdo->prepare(
    "SELECT reason, before_state_json, after_state_json
       FROM audit_events
      WHERE action_code = 'faculty_attendance_change' AND target_id = ?
      ORDER BY sequence_number DESC
      LIMIT 1"
);
$attendanceCorrectionAuditStmt->execute([$attendanceRecordOneId]);
$attendanceCorrectionAudit = $attendanceCorrectionAuditStmt->fetch(PDO::FETCH_ASSOC);
expect_same('Faculty corrected the persisted status', $attendanceCorrectionAudit['reason'] ?? null, 'Correction reason is preserved in audit context');
$attendanceCorrectionBefore = json_decode((string) ($attendanceCorrectionAudit['before_state_json'] ?? ''), true);
$attendanceCorrectionAfter = json_decode((string) ($attendanceCorrectionAudit['after_state_json'] ?? ''), true);
expect_same('present', $attendanceCorrectionBefore['status'] ?? null, 'Correction audit before-state records present');
expect_same('absent', $attendanceCorrectionAfter['status'] ?? null, 'Correction audit after-state records absent');

$attendanceSessionCode = 'FAC-ATT-' . $attendanceFixtureSuffix;
$attendanceSessionInsert = $pdo->prepare(
    "INSERT INTO attendance_sessions (cs_id, secretary_user_id, session_date, session_code, status, ended_at)
     VALUES (?, ?, ?, ?, 'ended', CURRENT_TIMESTAMP(6))
     RETURNING session_id"
);
$attendanceSessionInsert->execute([$attendanceClassId, $attendanceSecretaryId, $attendancePastDate, $attendanceSessionCode]);
$attendanceSessionId = (int) $attendanceSessionInsert->fetchColumn();
expect_true($attendanceSessionId > 0, 'Faculty worksheet fixture has an authoritative Secretary-created session');
$attendanceSessionInsert->execute([$attendanceClassId, $attendanceSecretaryId, $attendancePastDate, $attendanceSessionCode . '-TWO']);
$attendanceSessionTwoId = (int) $attendanceSessionInsert->fetchColumn();
expect_true($attendanceSessionTwoId > 0, 'Faculty worksheet fixture has a second Secretary-created session on the same date');

[$attendanceMultipleSessionReadStatus, $attendanceMultipleSessionReadBody] = integration_http_get_json(
    '/api/faculty/attendance?csId=' . $attendanceClassId . '&date=' . $attendancePastDate,
    $generatedFacultyAccessToken
);
expect_same(200, $attendanceMultipleSessionReadStatus, 'Faculty worksheet read succeeds when multiple sessions exist for a date');
expect_same(null, $attendanceMultipleSessionReadBody['worksheet']['attendanceSession'] ?? null, 'Multiple sessions are not collapsed into a singular implicit session');
expect_same(2, count($attendanceMultipleSessionReadBody['worksheet']['attendanceSessions'] ?? []), 'Worksheet exposes all matching sessions for the selected date');

[$attendanceLinkedCreateStatus, $attendanceLinkedCreateBody] = integration_http_json('/api/faculty/attendance/override', $generatedFacultyAccessToken, [
    'csId' => (string) $attendanceClassId,
    'enrollmentId' => (string) $attendanceEnrollmentTwoId,
    'sessionDate' => $attendancePastDate,
    'sessionId' => (string) $attendanceSessionId,
    'status' => 'present',
]);
expect_same(200, $attendanceLinkedCreateStatus, 'Faculty can create an attendance row linked to an existing Secretary session');
$attendanceLinkedRecordId = (int) ($attendanceLinkedCreateBody['recordId'] ?? 0);
expect_same((string) $attendanceSessionId, (string) ($attendanceLinkedCreateBody['attendanceSessionId'] ?? ''), 'Linked attendance response returns the existing session ID');

[$attendanceLinkedUpdateStatus, $attendanceLinkedUpdateBody] = integration_http_json('/api/faculty/attendance/override', $generatedFacultyAccessToken, [
    'recordId' => (string) $attendanceLinkedRecordId,
    'csId' => (string) $attendanceClassId,
    'enrollmentId' => (string) $attendanceEnrollmentTwoId,
    'sessionDate' => $attendancePastDate,
    'sessionId' => (string) $attendanceSessionId,
    'status' => 'late',
    'reason' => 'Faculty corrected linked record',
]);
expect_same(200, $attendanceLinkedUpdateStatus, 'Faculty can update an existing linked attendance record');
expect_same('updated', $attendanceLinkedUpdateBody['operation'] ?? null, 'Existing attendance mutation reports an update');
$attendanceLinkedRowStmt = $pdo->prepare(
    'SELECT COUNT(*) AS row_count, MAX(attendance_session_id) AS session_id, MAX(status) AS status FROM attendance_records WHERE enrollment_id = ? AND session_date = ?'
);
$attendanceLinkedRowStmt->execute([$attendanceEnrollmentTwoId, $attendancePastDate]);
$attendanceLinkedRow = $attendanceLinkedRowStmt->fetch(PDO::FETCH_ASSOC);
expect_same('1', (string) ($attendanceLinkedRow['row_count'] ?? ''), 'Updating a linked attendance row creates no duplicate record');
expect_same((string) $attendanceSessionId, (string) ($attendanceLinkedRow['session_id'] ?? ''), 'Faculty mutation preserves the existing attendance-session linkage');
expect_same('late', $attendanceLinkedRow['status'] ?? null, 'Faculty mutation persists the corrected linked status');

[$attendanceSessionReadStatus, $attendanceSessionReadBody] = integration_http_get_json(
    '/api/faculty/attendance?csId=' . $attendanceClassId . '&date=' . $attendancePastDate . '&sessionId=' . $attendanceSessionId,
    $generatedFacultyAccessToken
);
expect_same(200, $attendanceSessionReadStatus, 'Faculty can read a worksheet for an explicit attendance session');
expect_same((string) $attendanceSessionId, $attendanceSessionReadBody['worksheet']['attendanceSession']['sessionId'] ?? null, 'Explicit worksheet read returns the selected session');
$attendanceSessionTwo = array_values(array_filter(
    $attendanceSessionReadBody['worksheet']['roster'] ?? [],
    static fn(array $row): bool => (string) ($row['enrollmentId'] ?? '') === (string) $attendanceEnrollmentTwoId
))[0] ?? null;
expect_same('late', $attendanceSessionTwo['status'] ?? null, 'Explicit session worksheet returns the corrected status');
expect_same((string) $attendanceSessionId, $attendanceSessionTwo['attendanceSessionId'] ?? null, 'Explicit session worksheet returns the linked session ID');

[$attendanceMismatchedSessionStatus, $attendanceMismatchedSessionBody] = integration_http_json('/api/faculty/attendance/override', $generatedFacultyAccessToken, [
    'csId' => (string) $attendanceClassId,
    'enrollmentId' => (string) $attendanceEnrollmentOneId,
    'sessionDate' => $attendanceToday,
    'sessionId' => (string) $attendanceSessionId,
    'status' => 'present',
]);
expect_same(422, $attendanceMismatchedSessionStatus, 'Explicit session from another worksheet date is rejected');
expect_same('ATTENDANCE_SESSION_MISMATCH', $attendanceMismatchedSessionBody['code'] ?? null, 'Mismatched explicit session uses the session error contract');

$attendanceUnlinkedSessionInsert = $pdo->prepare(
    "INSERT INTO attendance_sessions (cs_id, secretary_user_id, session_date, session_code, status, ended_at)
     VALUES (?, ?, ?, ?, 'ended', CURRENT_TIMESTAMP(6))
     RETURNING session_id"
);
$attendanceUnlinkedSessionInsert->execute([$attendanceClassId, $attendanceSecretaryId, $attendanceToday, $attendanceSessionCode . '-TODAY']);
$attendanceTodaySessionId = (int) $attendanceUnlinkedSessionInsert->fetchColumn();
[$attendanceUnlinkedAfterSessionStatus, $attendanceUnlinkedAfterSessionBody] = integration_http_json('/api/faculty/attendance/override', $generatedFacultyAccessToken, [
    'csId' => (string) $attendanceClassId,
    'enrollmentId' => (string) $attendanceEnrollmentOneId,
    'sessionDate' => $attendanceToday,
    'status' => 'present',
]);
expect_same(200, $attendanceUnlinkedAfterSessionStatus, 'New attendance without sessionId succeeds when a Secretary session exists');
$attendanceUnlinkedAfterSessionId = (int) ($attendanceUnlinkedAfterSessionBody['recordId'] ?? 0);
$attendanceUnlinkedAfterSessionStmt = $pdo->prepare('SELECT attendance_session_id FROM attendance_records WHERE record_id = ?');
$attendanceUnlinkedAfterSessionStmt->execute([$attendanceUnlinkedAfterSessionId]);
expect_same(null, $attendanceUnlinkedAfterSessionStmt->fetchColumn(), 'New attendance without sessionId remains unlinked');

[$attendanceInvalidStatus, $attendanceInvalidBody] = integration_http_json('/api/faculty/attendance/override', $generatedFacultyAccessToken, [
    'recordId' => (string) $attendanceLinkedRecordId,
    'status' => 'unknown',
    'reason' => 'Invalid status test',
]);
expect_same(422, $attendanceInvalidStatus, 'Invalid attendance status is rejected');
expect_same('VALIDATION_ERROR', $attendanceInvalidBody['code'] ?? null, 'Invalid attendance status uses the validation error contract');

[$attendanceForeignStudentStatus, $attendanceForeignStudentBody] = integration_http_json('/api/faculty/attendance/override', $generatedFacultyAccessToken, [
    'csId' => (string) $attendanceClassId,
    'studentId' => (string) $attendanceForeignStudentId,
    'sessionDate' => $attendancePastDate,
    'status' => 'present',
    'reason' => 'Wrong section student test',
]);
expect_same(404, $attendanceForeignStudentStatus, 'Student from another section is rejected by the Faculty mutation');
expect_same('ENROLLMENT_NOT_FOUND', $attendanceForeignStudentBody['code'] ?? null, 'Wrong-section Student mutation returns the enrollment error code');

[$attendanceOtherFacultyStatus, $attendanceOtherFacultyBody] = integration_http_get_json(
    '/api/faculty/attendance?csId=' . $attendanceClassId . '&date=' . $attendancePastDate,
    $facultyAccessToken
);
expect_same(403, $attendanceOtherFacultyStatus, 'Unrelated Faculty cannot read another Faculty\'s worksheet');
expect_same('FACULTY_SECTION_ACCESS_DENIED', $attendanceOtherFacultyBody['code'] ?? null, 'Unrelated Faculty worksheet access is denied server-side');
[$attendanceOtherFacultyMutationStatus, $attendanceOtherFacultyMutationBody] = integration_http_json('/api/faculty/attendance/override', $facultyAccessToken, [
    'recordId' => (string) $attendanceRecordOneId,
    'status' => 'absent',
    'reason' => 'Unrelated faculty mutation test',
]);
expect_same(403, $attendanceOtherFacultyMutationStatus, 'Unrelated Faculty cannot mutate another Faculty\'s attendance record');
expect_same('FACULTY_SECTION_ACCESS_DENIED', $attendanceOtherFacultyMutationBody['code'] ?? null, 'Unrelated Faculty mutation is denied server-side');

$facultyAttendanceAuditStmt = $pdo->prepare(
    "SELECT actor_user_id, scope_cs_id, target_type, target_id, before_state_json, after_state_json
       FROM audit_events
      WHERE action_code = 'faculty_attendance_change' AND scope_cs_id = ?
      ORDER BY sequence_number DESC"
);
$facultyAttendanceAuditStmt->execute([$attendanceClassId]);
$facultyAttendanceAuditRows = $facultyAttendanceAuditStmt->fetchAll(PDO::FETCH_ASSOC);
expect_true(count($facultyAttendanceAuditRows) >= 3, 'Faculty attendance create and update mutations append audit events');
$linkedAuditFound = false;
foreach ($facultyAttendanceAuditRows as $facultyAttendanceAuditRow) {
    if ((string) ($facultyAttendanceAuditRow['target_id'] ?? '') !== (string) $attendanceLinkedRecordId) {
        continue;
    }
    $beforeAudit = json_decode((string) $facultyAttendanceAuditRow['before_state_json'], true);
    $afterAudit = json_decode((string) $facultyAttendanceAuditRow['after_state_json'], true);
    if (is_array($beforeAudit) && is_array($afterAudit)
        && ($beforeAudit['status'] ?? null) === 'present'
        && ($afterAudit['status'] ?? null) === 'late'
    ) {
        expect_same((string) $userId, (string) $facultyAttendanceAuditRow['actor_user_id'], 'Faculty attendance audit preserves the authenticated actor');
        expect_same((string) $attendanceClassId, (string) $facultyAttendanceAuditRow['scope_cs_id'], 'Faculty attendance audit preserves the class-section scope');
        expect_same('attendance_record', $facultyAttendanceAuditRow['target_type'] ?? null, 'Faculty attendance audit targets the attendance record');
        expect_same((string) $attendanceEnrollmentTwoId, (string) ($afterAudit['enrollmentId'] ?? ''), 'Faculty attendance audit identifies the enrollment target');
        $linkedAuditFound = true;
        break;
    }
}
expect_true($linkedAuditFound, 'Faculty attendance audit preserves before and after status state');

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

// Assessment-transmutation persistence regression coverage. This exercises the
// real faculty endpoints against isolated disposable fixtures so each result
// and enrollment write can be verified independently.
$gradeFixtureSuffix = bin2hex(random_bytes(4));
$gradeCourseCode = 'INT' . strtoupper($gradeFixtureSuffix);
$gradeCourseStmt = $pdo->prepare(
    "INSERT INTO courses (course_code, name, units, semester, grading_config)
     VALUES (?, 'Transmutation Integration Course', 3.0, '1ST', '{}'::jsonb)
     RETURNING course_id"
);
$gradeCourseStmt->execute([$gradeCourseCode]);
$gradeCourseId = (int) $gradeCourseStmt->fetchColumn();
$gradeClassStmt = $pdo->prepare(
    "INSERT INTO class_sections (cs_name, course_id, instructor_user_id, semester, school_year, status)
     VALUES (?, ?, ?, '1st', '2026-2027', 'Active')
     RETURNING cs_id"
);
$gradeClassStmt->execute(['Transmutation Fixture ' . $gradeFixtureSuffix, $gradeCourseId, $userId]);
$gradeClassId = (int) $gradeClassStmt->fetchColumn();
$gradeClassStmt->execute(['Transmutation Secondary Fixture ' . $gradeFixtureSuffix, $gradeCourseId, $userId]);
$gradeOtherClassId = (int) $gradeClassStmt->fetchColumn();
$seedFacultyId = (int) $pdo->query(
    "SELECT user_id FROM user_accounts WHERE login_email = 'faculty@bicol-u.edu.ph'"
)->fetchColumn();
expect_true($seedFacultyId > 0 && $seedFacultyId !== $userId, 'Separate Faculty owner exists for assessment authorization coverage');
$foreignClassStmt = $pdo->prepare(
    "INSERT INTO class_sections (cs_name, course_id, instructor_user_id, semester, school_year, status)
     VALUES (?, ?, ?, '1st', '2026-2027', 'Active')
     RETURNING cs_id"
);
$foreignClassStmt->execute(['Unowned Transmutation Fixture ' . $gradeFixtureSuffix, $gradeCourseId, $seedFacultyId]);
$unownedGradeClassId = (int) $foreignClassStmt->fetchColumn();
$gradeStudentStmt = $pdo->prepare(
    "INSERT INTO students (student_number, first_name, last_name, bu_email, status)
     VALUES (?, ?, 'Fixture', ?, 'active')
     RETURNING student_id"
);
$gradeStudentStmt->execute(['INT-' . $gradeFixtureSuffix . '-A', 'Grade A', 'grade-a-' . $gradeFixtureSuffix . '@bicol-u.edu.ph']);
$gradeStudentA = (int) $gradeStudentStmt->fetchColumn();
$gradeStudentStmt->execute(['INT-' . $gradeFixtureSuffix . '-B', 'Grade B', 'grade-b-' . $gradeFixtureSuffix . '@bicol-u.edu.ph']);
$gradeStudentB = (int) $gradeStudentStmt->fetchColumn();
$gradeStudentStmt->execute(['INT-' . $gradeFixtureSuffix . '-C', 'Grade C', 'grade-c-' . $gradeFixtureSuffix . '@bicol-u.edu.ph']);
$gradeStudentC = (int) $gradeStudentStmt->fetchColumn();
$gradeEnrollmentStmt = $pdo->prepare(
    "INSERT INTO enrollments (student_id, cs_id, status, date_enrolled)
     VALUES (?, ?, 'Active', CURRENT_DATE)
     RETURNING enrollment_id"
);
$gradeEnrollmentStmt->execute([$gradeStudentA, $gradeClassId]);
$gradeEnrollmentA = (int) $gradeEnrollmentStmt->fetchColumn();
$gradeEnrollmentStmt->execute([$gradeStudentB, $gradeClassId]);
$gradeEnrollmentB = (int) $gradeEnrollmentStmt->fetchColumn();
$gradeEnrollmentStmt->execute([$gradeStudentC, $gradeOtherClassId]);
$gradeEnrollmentC = (int) $gradeEnrollmentStmt->fetchColumn();
$gradeAssessmentStmt = $pdo->prepare(
    "INSERT INTO assessments (
        cs_id, title, type, grading_period, max_score, weight, status,
        transmutation_enabled, transmutation_minimum_percentage,
        transmutation_maximum_percentage, attendance_session_date,
        attendance_session_code
     ) VALUES (?, 'Transmutation Fixture Assessment', 'Quiz', 'Midterm', 50, 100, 'Active', TRUE, 50, 100, ?, ?)
     RETURNING assessment_id"
);
$gradeSessionDate = '2026-01-15';
$gradeSessionCode = 'INT-' . strtoupper($gradeFixtureSuffix);
$gradeAssessmentStmt->execute([$gradeClassId, $gradeSessionDate, $gradeSessionCode]);
$gradeAssessmentId = (int) $gradeAssessmentStmt->fetchColumn();
$gradeAttendanceStmt = $pdo->prepare(
    "INSERT INTO attendance_records (enrollment_id, session_date, session_code, status, verification_method)
     VALUES (?, ?, ?, ?, 'integration_fixture')
     RETURNING record_id"
);
$gradeAttendanceStmt->execute([$gradeEnrollmentA, $gradeSessionDate, $gradeSessionCode, 'present']);
$gradeAttendanceA = (int) $gradeAttendanceStmt->fetchColumn();
$gradeAttendanceStmt->execute([$gradeEnrollmentB, $gradeSessionDate, $gradeSessionCode, 'present']);
$gradeAttendanceB = (int) $gradeAttendanceStmt->fetchColumn();

$originalGradingDefaultsJson = (string) $pdo->query(
    "SELECT setting_value FROM system_settings WHERE setting_key = 'grading_defaults'"
)->fetchColumn();
$gradingDefaultsForFixture = json_decode($originalGradingDefaultsJson, true);
$gradingDefaultsForFixture['default_weights']['attendance'] = 0;
$pdo->prepare(
    "UPDATE system_settings SET setting_value = ?, updated_at = CURRENT_TIMESTAMP(6)
     WHERE setting_key = 'grading_defaults'"
)->execute([json_encode($gradingDefaultsForFixture, JSON_THROW_ON_ERROR)]);

$facultyAccessToken = auth_issue_access_token(
    ['user_id' => $locked['user_id'], 'role' => $locked['role'], 'token_version' => $locked['token_version']],
    $session,
    config_key_bytes_at_least($config['jwt']['signing_key_b64'], 32, 'JWT_SIGNING_KEY')
)['token'];
$saveAssessmentScores = static function (int $assessmentId, array $scoreRows) use ($facultyAccessToken): array {
    return integration_http_json('/api/faculty/scores', $facultyAccessToken, [
        'assessmentId' => (string) $assessmentId,
        'scores' => $scoreRows,
    ]);
};
$readRawAssessmentScore = static function (PDO $pdo, int $assessmentId, int $studentId): ?string {
    $stmt = $pdo->prepare('SELECT score FROM assessment_scores WHERE assessment_id = ? AND student_id = ?');
    $stmt->execute([$assessmentId, $studentId]);
    $score = $stmt->fetchColumn();
    return $score === false ? null : (string) $score;
};
$computeFixtureGrades = static function () use ($facultyAccessToken, $gradeClassId): array {
    return integration_http_json('/api/faculty/grades/compute', $facultyAccessToken, ['classId' => (string) $gradeClassId]);
};
$readFixtureGrades = static function (PDO $pdo) use ($gradeEnrollmentA, $gradeEnrollmentB): array {
    $stmt = $pdo->prepare(
        "SELECT enrollment_id, final_percentage, final_gwa, grade_components_json
         FROM enrollments WHERE enrollment_id IN (?, ?) ORDER BY enrollment_id"
    );
    $stmt->execute([$gradeEnrollmentA, $gradeEnrollmentB]);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
};

[$scoreSaveStatus, $scoreSaveBody] = $saveAssessmentScores($gradeAssessmentId, [
    ['studentId' => (string) $gradeStudentA, 'score' => 25, 'remarks' => 'Raw score API round trip A'],
    ['studentId' => (string) $gradeStudentB, 'score' => 25, 'remarks' => 'Raw score API round trip B'],
]);
expect_same(200, $scoreSaveStatus, 'Faculty can save valid raw scores through the real scores API');
expect_same(2, $scoreSaveBody['savedCount'] ?? null, 'Score-save response reports both submitted students');
expect_same('25.00', $readRawAssessmentScore($pdo, $gradeAssessmentId, $gradeStudentA), 'Raw score 25 persists exactly for student A against max score 50');
expect_same('25.00', $readRawAssessmentScore($pdo, $gradeAssessmentId, $gradeStudentB), 'Raw score 25 persists exactly for student B against max score 50');
[$scoreGetStatus, $scoreGetBody] = integration_http_get_json(
    '/api/faculty/scores?assessmentId=' . $gradeAssessmentId,
    $facultyAccessToken,
);
expect_same(200, $scoreGetStatus, 'Fresh scores GET returns the persisted raw assessment scores');
$scoresByStudent = [];
foreach (($scoreGetBody['scores'] ?? []) as $scoreRow) {
    $scoresByStudent[(string) ($scoreRow['studentId'] ?? '')] = (float) ($scoreRow['score'] ?? -1);
}
expect_same(25.0, $scoresByStudent[(string) $gradeStudentA] ?? null, 'Fresh scores GET returns raw 25 for student A');
expect_same(25.0, $scoresByStudent[(string) $gradeStudentB] ?? null, 'Fresh scores GET returns raw 25 for student B');

[$scoreUpdateStatus] = $saveAssessmentScores($gradeAssessmentId, [
    ['studentId' => (string) $gradeStudentA, 'score' => 24, 'remarks' => 'Student-row isolation check'],
]);
expect_same(200, $scoreUpdateStatus, 'Faculty can update one existing student score');
expect_same('24.00', $readRawAssessmentScore($pdo, $gradeAssessmentId, $gradeStudentA), 'Score update changes only the requested student row');
expect_same('25.00', $readRawAssessmentScore($pdo, $gradeAssessmentId, $gradeStudentB), 'Score update does not overwrite another student row');
[$restoreScoreStatus] = $saveAssessmentScores($gradeAssessmentId, [
    ['studentId' => (string) $gradeStudentA, 'score' => 25, 'remarks' => 'Raw score API round trip A'],
]);
expect_same(200, $restoreScoreStatus, 'Faculty can restore the raw 25 fixture value before computation');

[$wrongClassScoreStatus, $wrongClassScoreBody] = $saveAssessmentScores($gradeAssessmentId, [
    ['studentId' => (string) $gradeStudentC, 'score' => 25, 'remarks' => 'Wrong-class rejection check'],
]);
expect_same(422, $wrongClassScoreStatus, 'Faculty score API rejects a student enrolled only in another class');
expect_same('error', $wrongClassScoreBody['status'] ?? null, 'Wrong-class score association returns an error response');
expect_same(null, $readRawAssessmentScore($pdo, $gradeAssessmentId, $gradeStudentC), 'Wrong-class score association creates no score row');
expect_same('25.00', $readRawAssessmentScore($pdo, $gradeAssessmentId, $gradeStudentA), 'Rejected wrong-class score leaves student A unchanged');
expect_same('25.00', $readRawAssessmentScore($pdo, $gradeAssessmentId, $gradeStudentB), 'Rejected wrong-class score leaves student B unchanged');

[$computeStatus, $computeBody] = $computeFixtureGrades();
expect_same(200, $computeStatus, 'Two enrollment grade computation returns HTTP 200');
$computedByEnrollment = [];
foreach (($computeBody['results'] ?? []) as $result) {
    $computedByEnrollment[(string) ($result['enrollmentId'] ?? '')] = $result;
}
expect_true(isset($computedByEnrollment[(string) $gradeEnrollmentA], $computedByEnrollment[(string) $gradeEnrollmentB]), 'Returned grade results identify both distinct enrollments');
$initialGrades = $readFixtureGrades($pdo);
expect_same(2, count($initialGrades), 'Two enrollment grade rows are persisted');
expect_same('75.00', $initialGrades[0]['final_percentage'], 'Present transmutation persists the default 50-to-100 result for enrollment A');
expect_same('75.00', $initialGrades[1]['final_percentage'], 'Present transmutation persists the default 50-to-100 result for enrollment B');
expect_same('25.00', $readRawAssessmentScore($pdo, $gradeAssessmentId, $gradeStudentA), 'Present recomputation preserves student A raw score 25');
expect_same('25.00', $readRawAssessmentScore($pdo, $gradeAssessmentId, $gradeStudentB), 'Present recomputation preserves student B raw score 25');
expect_same((string) $gradeEnrollmentA, (string) $computedByEnrollment[(string) $gradeEnrollmentA]['enrollmentId'], 'Returned enrollment A result matches its persisted row');
expect_same((string) $gradeEnrollmentB, (string) $computedByEnrollment[(string) $gradeEnrollmentB]['enrollmentId'], 'Returned enrollment B result matches its persisted row');

$pdo->prepare('UPDATE attendance_records SET status = \'absent\' WHERE record_id = ?')->execute([$gradeAttendanceB]);
[$computeStatus, $computeBody] = $computeFixtureGrades();
expect_same(200, $computeStatus, 'Absent transmutation recomputation returns HTTP 200');
$absentGrades = $readFixtureGrades($pdo);
expect_same('75.00', $absentGrades[0]['final_percentage'], 'Absent attendance does not overwrite another enrollment result');
expect_same('0.00', $absentGrades[1]['final_percentage'], 'Absent attendance contributes zero to the transmuted assessment');
expect_same('25.00', $readRawAssessmentScore($pdo, $gradeAssessmentId, $gradeStudentB), 'Absent recomputation preserves the raw score 25');

$pdo->prepare('UPDATE attendance_records SET status = \'late\' WHERE record_id = ?')->execute([$gradeAttendanceA]);
$pdo->prepare('UPDATE attendance_records SET status = \'excused\' WHERE record_id = ?')->execute([$gradeAttendanceB]);
[$computeStatus, $computeBody] = $computeFixtureGrades();
expect_same(200, $computeStatus, 'Late and excused recomputation returns HTTP 200');
$lateExcusedGrades = $readFixtureGrades($pdo);
expect_same('75.00', $lateExcusedGrades[0]['final_percentage'], 'Late attendance uses the same transformation as present');
expect_same('75.00', $lateExcusedGrades[1]['final_percentage'], 'Excused attendance uses the same transformation as present');
expect_same('25.00', $readRawAssessmentScore($pdo, $gradeAssessmentId, $gradeStudentA), 'Late recomputation preserves the raw score 25');
expect_same('25.00', $readRawAssessmentScore($pdo, $gradeAssessmentId, $gradeStudentB), 'Excused recomputation preserves the raw score 25');

$pdo->prepare(
    "UPDATE enrollments SET final_percentage = 88, final_gwa = 2.00, grade_components_json = '{\"fixture\":\"preserved\"}'::jsonb
     WHERE enrollment_id = ?"
)->execute([$gradeEnrollmentB]);
$rawScoreBeforeMissing = (float) $pdo->query(
    "SELECT score FROM assessment_scores WHERE assessment_id = {$gradeAssessmentId} AND student_id = {$gradeStudentB}"
)->fetchColumn();
$pdo->prepare('DELETE FROM attendance_records WHERE record_id = ?')->execute([$gradeAttendanceB]);
[$missingAttendanceSaveStatus] = $saveAssessmentScores($gradeAssessmentId, [
    ['studentId' => (string) $gradeStudentB, 'score' => 25, 'remarks' => 'Save despite missing linked attendance'],
]);
expect_same(200, $missingAttendanceSaveStatus, 'Raw score save succeeds while exact linked attendance is missing');
expect_same('25.00', $readRawAssessmentScore($pdo, $gradeAssessmentId, $gradeStudentB), 'Missing attendance does not prevent raw score persistence');
[$computeStatus, $computeBody] = $computeFixtureGrades();
expect_same(200, $computeStatus, 'Missing linked attendance computation returns HTTP 200 with per-enrollment status');
$missingResult = null;
foreach (($computeBody['results'] ?? []) as $result) {
    if ((string) ($result['enrollmentId'] ?? '') === (string) $gradeEnrollmentB) {
        $missingResult = $result;
        break;
    }
}
expect_same('incomplete_attendance', $missingResult['status'] ?? null, 'Missing linked attendance returns incomplete_attendance');
$missingGrades = $readFixtureGrades($pdo);
expect_same('88.00', $missingGrades[1]['final_percentage'], 'Missing linked attendance preserves the existing persisted grade');
$rawScoreAfterMissing = (float) $pdo->query(
    "SELECT score FROM assessment_scores WHERE assessment_id = {$gradeAssessmentId} AND student_id = {$gradeStudentB}"
)->fetchColumn();
expect_same($rawScoreBeforeMissing, $rawScoreAfterMissing, 'Missing linked attendance does not alter the raw assessment score');

$wrongLinkStmt = $pdo->prepare(
    "INSERT INTO attendance_records (enrollment_id, session_date, session_code, status, verification_method)
     VALUES (?, ?, ?, 'present', 'integration_fixture')"
);
$wrongLinkStmt->execute([$gradeEnrollmentB, $gradeSessionDate, $gradeSessionCode . '-WRONG']);
[$computeStatus, $computeBody] = $computeFixtureGrades();
$wrongLinkResult = null;
foreach (($computeBody['results'] ?? []) as $result) {
    if ((string) ($result['enrollmentId'] ?? '') === (string) $gradeEnrollmentB) {
        $wrongLinkResult = $result;
        break;
    }
}
expect_same('incomplete_attendance', $wrongLinkResult['status'] ?? null, 'Wrong session code or enrollment link cannot satisfy transmutation attendance');

$pdo->prepare('DELETE FROM attendance_records WHERE enrollment_id = ?')->execute([$gradeEnrollmentB]);
$gradeAttendanceStmt->execute([$gradeEnrollmentB, $gradeSessionDate, $gradeSessionCode, 'absent']);
$gradeAttendanceB = (int) $gradeAttendanceStmt->fetchColumn();
[$overrideStatus, $overrideBody] = integration_http_json('/api/faculty/attendance/override', $facultyAccessToken, [
    'recordId' => $gradeAttendanceB,
    'status' => 'present',
    'reason' => 'Integration attendance correction',
]);
expect_same(200, $overrideStatus, 'Attendance correction returns HTTP 200');
[$computeStatus, $computeBody] = $computeFixtureGrades();
expect_same(200, $computeStatus, 'Corrected attendance recomputation returns HTTP 200');
$correctedGrades = $readFixtureGrades($pdo);
expect_same('75.00', $correctedGrades[1]['final_percentage'], 'Attendance correction changes the subsequent persisted effective grade');
$rawScoreAfterCorrection = (float) $pdo->query(
    "SELECT score FROM assessment_scores WHERE assessment_id = {$gradeAssessmentId} AND student_id = {$gradeStudentB}"
)->fetchColumn();
expect_same($rawScoreBeforeMissing, $rawScoreAfterCorrection, 'Attendance correction preserves the raw assessment score');

$pdo->prepare("UPDATE assessments SET status = 'Archived' WHERE assessment_id = ?")->execute([$gradeAssessmentId]);
$rawAssessmentStmt = $pdo->prepare(
    "INSERT INTO assessments (cs_id, title, type, grading_period, max_score, weight, status)
     VALUES (?, 'Raw Fixture Assessment', 'Quiz', 'Midterm', 100, 100, 'Active')
     RETURNING assessment_id"
);
$rawAssessmentStmt->execute([$gradeClassId]);
$rawAssessmentId = (int) $rawAssessmentStmt->fetchColumn();
[$rawScoreSaveStatus, $rawScoreSaveBody] = $saveAssessmentScores($rawAssessmentId, [
    ['studentId' => (string) $gradeStudentA, 'score' => 25, 'remarks' => 'Non-transmuted raw score A'],
    ['studentId' => (string) $gradeStudentB, 'score' => 25, 'remarks' => 'Non-transmuted raw score B'],
]);
expect_same(200, $rawScoreSaveStatus, 'Non-transmuted assessment retains score-save API behavior');
expect_same(2, $rawScoreSaveBody['savedCount'] ?? null, 'Non-transmuted score save reports both saved students');
expect_same('25.00', $readRawAssessmentScore($pdo, $rawAssessmentId, $gradeStudentA), 'Non-transmuted API save persists raw 25 for student A');
expect_same('25.00', $readRawAssessmentScore($pdo, $rawAssessmentId, $gradeStudentB), 'Non-transmuted API save persists raw 25 for student B');
[$computeStatus, $computeBody] = $computeFixtureGrades();
expect_same(200, $computeStatus, 'Non-transmuted assessment computation returns HTTP 200');
$rawGrades = $readFixtureGrades($pdo);
expect_same('25.00', $rawGrades[0]['final_percentage'], 'Non-transmuted assessment retains normal raw-percentage behavior for enrollment A');
expect_same('25.00', $rawGrades[1]['final_percentage'], 'Non-transmuted assessment retains normal raw-percentage behavior for enrollment B');

$disabledAssessmentTitle = 'Faculty API Disabled Assessment ' . $gradeFixtureSuffix;
$disabledAssessmentPayload = [[
    'title' => $disabledAssessmentTitle,
    'type' => 'Quiz',
    'subjectCode' => $gradeCourseCode,
    'classId' => (string) $gradeClassId,
    'gradingPeriod' => 'Midterm',
    'maxScore' => 25,
    'weight' => 20,
    'dueDate' => '2026-04-01',
    'instructions' => 'Disabled assessment persistence fixture.',
    'status' => 'Active',
    'transmutationEnabled' => false,
    'transmutationMinimumPercentage' => 45,
    'transmutationMaximumPercentage' => 95,
    'attendanceSessionDate' => null,
    'attendanceSessionCode' => null,
]];
[$disabledAssessmentStatus, $disabledAssessmentBody] = integration_http_json(
    '/api/faculty/assessments',
    $facultyAccessToken,
    $disabledAssessmentPayload,
);
expect_same(200, $disabledAssessmentStatus, 'Faculty can create a disabled assessment for an owned class');
expect_same(1, count($disabledAssessmentBody['assessments'] ?? []), 'Disabled assessment success response confirms one persisted assessment');
$disabledAssessmentId = (string) ($disabledAssessmentBody['assessments'][0]['id'] ?? '');
expect_true($disabledAssessmentId !== '', 'Disabled assessment success response includes its database ID');
expect_same((string) $gradeClassId, $disabledAssessmentBody['assessments'][0]['classId'] ?? null, 'Disabled assessment response identifies the intended class ID');
expect_same($disabledAssessmentTitle, $disabledAssessmentBody['assessments'][0]['title'] ?? null, 'Disabled assessment response identifies the intended title');
$disabledAssessmentRowStmt = $pdo->prepare(
    "SELECT a.cs_id, a.title, a.type, a.max_score, a.transmutation_enabled,
            a.transmutation_minimum_percentage, a.transmutation_maximum_percentage,
            a.attendance_session_date, a.attendance_session_code, c.course_code
       FROM assessments a
       JOIN class_sections cs ON cs.cs_id = a.cs_id
       JOIN courses c ON c.course_id = cs.course_id
      WHERE a.assessment_id = ?"
);
$disabledAssessmentRowStmt->execute([(int) $disabledAssessmentId]);
$disabledAssessmentRow = $disabledAssessmentRowStmt->fetch(PDO::FETCH_ASSOC);
expect_true(is_array($disabledAssessmentRow), 'Disabled assessment creates a real PostgreSQL assessment row');
expect_same((string) $gradeClassId, (string) $disabledAssessmentRow['cs_id'], 'Disabled assessment row belongs to the intended class-section ID');
expect_same($gradeCourseCode, $disabledAssessmentRow['course_code'], 'Disabled assessment row resolves to the intended course');
expect_same($disabledAssessmentTitle, $disabledAssessmentRow['title'], 'Disabled assessment row preserves its title');
expect_same(false, filter_var($disabledAssessmentRow['transmutation_enabled'], FILTER_VALIDATE_BOOLEAN), 'Disabled assessment row remains transmutation-disabled');
expect_same('45.00', $disabledAssessmentRow['transmutation_minimum_percentage'], 'Disabled assessment row preserves its minimum bound');
expect_same('95.00', $disabledAssessmentRow['transmutation_maximum_percentage'], 'Disabled assessment row preserves its maximum bound');
expect_same(null, $disabledAssessmentRow['attendance_session_date'], 'Disabled assessment requires no attendance date');
expect_same(null, $disabledAssessmentRow['attendance_session_code'], 'Disabled assessment requires no attendance code');
[$disabledAssessmentsGetStatus, $disabledAssessmentsGetBody] = integration_http_get_json('/api/faculty/assessments', $facultyAccessToken);
expect_same(200, $disabledAssessmentsGetStatus, 'Faculty can read assessments after a fresh GET');
$disabledAssessmentReadRows = array_values(array_filter(
    $disabledAssessmentsGetBody,
    static fn(array $assessment): bool => (string) ($assessment['id'] ?? '') === $disabledAssessmentId,
));
expect_same(1, count($disabledAssessmentReadRows), 'Fresh assessment GET returns the exact disabled assessment ID');
expect_same((string) $gradeClassId, $disabledAssessmentReadRows[0]['classId'] ?? null, 'Fresh assessment GET returns the disabled assessment under its intended class');
expect_same($gradeCourseCode, $disabledAssessmentReadRows[0]['subjectCode'] ?? null, 'Fresh assessment GET returns the disabled assessment under its actual course');
$misassignedDisabledCount = $pdo->prepare('SELECT COUNT(*) FROM assessments WHERE title = ? AND cs_id = ?');
$misassignedDisabledCount->execute([$disabledAssessmentTitle, $gradeOtherClassId]);
expect_same(0, (int) $misassignedDisabledCount->fetchColumn(), 'Another owned section does not receive the disabled assessment');

$enabledAssessmentTitle = 'Faculty API Enabled Assessment ' . $gradeFixtureSuffix;
$enabledAssessmentPayload = [[
    'title' => $enabledAssessmentTitle,
    'type' => 'Assignment',
    'subjectCode' => $gradeCourseCode,
    'classId' => (string) $gradeClassId,
    'gradingPeriod' => 'Final',
    'maxScore' => 40,
    'weight' => 15,
    'dueDate' => '2026-04-15',
    'instructions' => 'Enabled assessment persistence fixture.',
    'status' => 'Active',
    'transmutationEnabled' => true,
    'transmutationMinimumPercentage' => 55,
    'transmutationMaximumPercentage' => 100,
    'attendanceSessionDate' => $gradeSessionDate,
    'attendanceSessionCode' => $gradeSessionCode,
]];
[$enabledAssessmentStatus, $enabledAssessmentBody] = integration_http_json(
    '/api/faculty/assessments',
    $facultyAccessToken,
    $enabledAssessmentPayload,
);
expect_same(200, $enabledAssessmentStatus, 'Faculty can create an enabled assessment with valid attendance linkage');
expect_same(1, count($enabledAssessmentBody['assessments'] ?? []), 'Enabled assessment success response confirms one persisted assessment');
$enabledAssessmentId = (string) ($enabledAssessmentBody['assessments'][0]['id'] ?? '');
expect_true($enabledAssessmentId !== '', 'Enabled assessment success response includes its database ID');
$enabledAssessmentRowStmt = $pdo->prepare(
    'SELECT cs_id, transmutation_enabled, transmutation_minimum_percentage,
            transmutation_maximum_percentage, attendance_session_date, attendance_session_code
       FROM assessments WHERE assessment_id = ?'
);
$enabledAssessmentRowStmt->execute([(int) $enabledAssessmentId]);
$enabledAssessmentRow = $enabledAssessmentRowStmt->fetch(PDO::FETCH_ASSOC);
expect_true(is_array($enabledAssessmentRow), 'Enabled assessment creates a real PostgreSQL assessment row');
expect_same((string) $gradeClassId, (string) $enabledAssessmentRow['cs_id'], 'Enabled assessment row belongs to the intended class-section ID');
expect_same(true, filter_var($enabledAssessmentRow['transmutation_enabled'], FILTER_VALIDATE_BOOLEAN), 'Enabled assessment row preserves enabled transmutation');
expect_same('55.00', $enabledAssessmentRow['transmutation_minimum_percentage'], 'Enabled assessment row preserves its minimum override');
expect_same('100.00', $enabledAssessmentRow['transmutation_maximum_percentage'], 'Enabled assessment row preserves its maximum override');
expect_same($gradeSessionDate, $enabledAssessmentRow['attendance_session_date'], 'Enabled assessment row preserves its linked attendance date');
expect_same($gradeSessionCode, $enabledAssessmentRow['attendance_session_code'], 'Enabled assessment row preserves its linked attendance code');
[$enabledAssessmentsGetStatus, $enabledAssessmentsGetBody] = integration_http_get_json('/api/faculty/assessments', $facultyAccessToken);
expect_same(200, $enabledAssessmentsGetStatus, 'Faculty can read enabled assessments after a fresh GET');
$enabledAssessmentReadRows = array_values(array_filter(
    $enabledAssessmentsGetBody,
    static fn(array $assessment): bool => (string) ($assessment['id'] ?? '') === $enabledAssessmentId,
));
expect_same(1, count($enabledAssessmentReadRows), 'Fresh assessment GET returns the exact enabled assessment ID');
expect_same((string) $gradeClassId, $enabledAssessmentReadRows[0]['classId'] ?? null, 'Fresh assessment GET keeps enabled assessment in its intended section');
expect_same(true, $enabledAssessmentReadRows[0]['transmutationEnabled'] ?? null, 'Fresh assessment GET preserves enabled transmutation');
expect_same($gradeSessionDate, $enabledAssessmentReadRows[0]['attendanceSessionDate'] ?? null, 'Fresh assessment GET preserves the attendance date');
expect_same($gradeSessionCode, $enabledAssessmentReadRows[0]['attendanceSessionCode'] ?? null, 'Fresh assessment GET preserves the attendance code');

$enabledEditPayload = $enabledAssessmentPayload;
$enabledEditPayload[0]['id'] = $enabledAssessmentId;
$enabledEditPayload[0]['instructions'] = 'Edited while preserving enabled transmutation.';
[$enabledEditStatus, $enabledEditBody] = integration_http_json(
    '/api/faculty/assessments',
    $facultyAccessToken,
    $enabledEditPayload,
);
expect_same(200, $enabledEditStatus, 'Faculty can update an owned assessment');
expect_same($enabledAssessmentId, $enabledEditBody['assessments'][0]['id'] ?? null, 'Assessment edit response retains the original database ID');
$enabledEditRowStmt = $pdo->prepare(
    'SELECT title, type, grading_period, max_score, weight, due_date, instructions,
            transmutation_enabled, transmutation_minimum_percentage,
            transmutation_maximum_percentage, attendance_session_date, attendance_session_code
       FROM assessments WHERE assessment_id = ?'
);
$enabledEditRowStmt->execute([(int) $enabledAssessmentId]);
$enabledEditRow = $enabledEditRowStmt->fetch(PDO::FETCH_ASSOC);
expect_same($enabledAssessmentTitle, $enabledEditRow['title'] ?? null, 'Assessment edit preserves the unchanged title');
expect_same('Assignment', $enabledEditRow['type'] ?? null, 'Assessment edit preserves the category');
expect_same('Final', $enabledEditRow['grading_period'] ?? null, 'Assessment edit preserves the grading period');
expect_same('40.00', $enabledEditRow['max_score'] ?? null, 'Assessment edit preserves the maximum score');
expect_same('15.00', $enabledEditRow['weight'] ?? null, 'Assessment edit preserves the weight');
expect_same('2026-04-15', $enabledEditRow['due_date'] ?? null, 'Assessment edit preserves the due date');
expect_same('Edited while preserving enabled transmutation.', $enabledEditRow['instructions'] ?? null, 'Assessment edit applies the requested text change');
expect_same(true, filter_var($enabledEditRow['transmutation_enabled'] ?? false, FILTER_VALIDATE_BOOLEAN), 'Assessment edit preserves enabled transmutation');
expect_same('55.00', $enabledEditRow['transmutation_minimum_percentage'] ?? null, 'Assessment edit preserves the minimum override');
expect_same('100.00', $enabledEditRow['transmutation_maximum_percentage'] ?? null, 'Assessment edit preserves the maximum override');
expect_same($gradeSessionDate, $enabledEditRow['attendance_session_date'] ?? null, 'Assessment edit preserves linked attendance date');
expect_same($gradeSessionCode, $enabledEditRow['attendance_session_code'] ?? null, 'Assessment edit preserves linked attendance code');
[$enabledEditGetStatus, $enabledEditGetBody] = integration_http_get_json('/api/faculty/assessments', $facultyAccessToken);
expect_same(200, $enabledEditGetStatus, 'Edited assessment remains readable after a fresh GET');
$enabledEditReadRows = array_values(array_filter(
    $enabledEditGetBody,
    static fn(array $assessment): bool => (string) ($assessment['id'] ?? '') === $enabledAssessmentId,
));
expect_same(1, count($enabledEditReadRows), 'Fresh GET returns the edited assessment under its original ID');
expect_same(true, $enabledEditReadRows[0]['transmutationEnabled'] ?? null, 'Fresh GET preserves transmutation through an edit');
expect_same(55.0, (float) ($enabledEditReadRows[0]['transmutationMinimumPercentage'] ?? -1), 'Fresh GET preserves edited assessment minimum');
expect_same(100.0, (float) ($enabledEditReadRows[0]['transmutationMaximumPercentage'] ?? -1), 'Fresh GET preserves edited assessment maximum');
expect_same($gradeSessionDate, $enabledEditReadRows[0]['attendanceSessionDate'] ?? null, 'Fresh GET preserves linked date through an edit');
expect_same($gradeSessionCode, $enabledEditReadRows[0]['attendanceSessionCode'] ?? null, 'Fresh GET preserves linked code through an edit');

$unownedAssessmentTitle = 'Faculty API Rejected Unowned Assessment ' . $gradeFixtureSuffix;
[$unownedAssessmentStatus, $unownedAssessmentBody] = integration_http_json('/api/faculty/assessments', $facultyAccessToken, [[
    'title' => $unownedAssessmentTitle,
    'type' => 'Quiz',
    'classId' => (string) $unownedGradeClassId,
    'gradingPeriod' => 'Midterm',
    'maxScore' => 10,
    'status' => 'Active',
    'transmutationEnabled' => false,
]]);
expect_same(403, $unownedAssessmentStatus, 'Faculty cannot create an assessment for a class assigned to another Faculty member');
expect_same('error', $unownedAssessmentBody['status'] ?? null, 'Rejected unowned assessment is reported as an error');
$unownedAssessmentCount = $pdo->prepare('SELECT COUNT(*) FROM assessments WHERE title = ?');
$unownedAssessmentCount->execute([$unownedAssessmentTitle]);
expect_same(0, (int) $unownedAssessmentCount->fetchColumn(), 'Rejected unowned assessment creates no database row');

$pdo->beginTransaction();
$pdo->prepare('DELETE FROM assessment_scores WHERE assessment_id IN (?, ?)')->execute([$gradeAssessmentId, $rawAssessmentId]);
$pdo->prepare('DELETE FROM attendance_records WHERE enrollment_id IN (?, ?, ?)')->execute([$gradeEnrollmentA, $gradeEnrollmentB, $gradeEnrollmentC]);
$pdo->prepare('DELETE FROM enrollments WHERE enrollment_id IN (?, ?, ?)')->execute([$gradeEnrollmentA, $gradeEnrollmentB, $gradeEnrollmentC]);
$pdo->prepare('DELETE FROM students WHERE student_id IN (?, ?, ?)')->execute([$gradeStudentA, $gradeStudentB, $gradeStudentC]);
$pdo->prepare('DELETE FROM assessments WHERE assessment_id IN (?, ?, ?, ?)')->execute([
    $gradeAssessmentId,
    $rawAssessmentId,
    (int) $disabledAssessmentId,
    (int) $enabledAssessmentId,
]);
// Faculty attendance mutations are audited with a class-section scope. The
// append-only audit foreign key intentionally prevents deleting those sections;
// archive all disposable sections and preserve their truthful history. The
// old timestamp keeps later live tests selecting the seeded active sections.
$pdo->prepare(
    "UPDATE class_sections
        SET status = 'Archived', created_at = TIMESTAMP '2000-01-01 00:00:00'
      WHERE cs_id IN (?, ?, ?, ?, ?)"
)->execute([
    $attendanceClassId,
    $attendanceOtherClassId,
    $gradeClassId,
    $gradeOtherClassId,
    $unownedGradeClassId,
]);
$pdo->prepare(
    "UPDATE system_settings SET setting_value = ?, updated_at = CURRENT_TIMESTAMP(6)
     WHERE setting_key = 'grading_defaults'"
)->execute([$originalGradingDefaultsJson]);
$pdo->commit();
echo "PASS: Persisted assessment-transmutation integration coverage completed.\n";

echo "ALL POSTGRESQL INTEGRATION TESTS PASSED.\n";
