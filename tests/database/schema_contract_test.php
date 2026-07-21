<?php

declare(strict_types=1);

$repo = dirname(__DIR__, 2);
$pass = getenv('DB_ROOT_PASS') ?: 'local-root-password';

function run(string $cmd): array { $o=[]; $c=0; exec($cmd,$o,$c); return ['o'=>$o,'c'=>$c]; }
function ok(array $r, string $l): void { if($r['c']!==0){ fwrite(STDERR,"FAIL: $l\n".implode("\n",$r['o'])."\n"); exit(1); } echo "PASS: $l\n"; }
function nok(array $r, string $l): void { if($r['c']===0){ fwrite(STDERR,"FAIL: $l -- expected error\n"); exit(1); } echo "PASS: $l\n"; }
function q(string $db, string $sql): string {
    global $repo, $pass;
    $cmd = "docker compose --project-directory " . escapeshellarg($repo) . " exec -T db mariadb -u root -p" . escapeshellarg($pass) . " " . escapeshellarg($db) . " --batch --skip-column-names -e " . escapeshellarg($sql);
    $r = run($cmd);
    if ($r['c'] !== 0) throw new RuntimeException(implode("\n", $r['o']));
    return trim(implode("\n", $r['o']));
}
function db_run(string $db, string $sql): void { q($db, $sql); }
function db_try(string $db, string $sql): array {
    global $repo, $pass;
    return run("docker compose --project-directory " . escapeshellarg($repo) . " exec -T db mariadb -u root -p" . escapeshellarg($pass) . " " . escapeshellarg($db) . " -e " . escapeshellarg($sql) . " 2>&1");
}
function source_migration(string $db, string $file): void {
    global $repo, $pass;
    $cfile = '/tmp/' . basename($file);
    run("docker cp " . escapeshellarg($file) . " dentisys-db-1:" . escapeshellarg($cfile));
    db_run($db, "source " . $cfile);
}

$dbPrefix = 'dentisys_test_schema_';
$db = $dbPrefix . substr(md5(uniqid()), 0, 6);
echo "=== Phase 2 Baseline Schema Contract Test ===\nDB: $db\n\n";

run("docker compose --project-directory " . escapeshellarg($repo) . " exec -T db mariadb -u root -p" . escapeshellarg($pass) . " -e " . escapeshellarg("DROP DATABASE IF EXISTS $db; CREATE DATABASE $db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"));

// Create _schema_migrations (normally done by migrate.ps1)
db_run($db, "CREATE TABLE IF NOT EXISTS _schema_migrations (version VARCHAR(255) NOT NULL PRIMARY KEY, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");

$migrationDir = $repo . '/database/migrations';
$baselineFiles = [
    '001_baseline_schema.sql',
    '002_seed_rbac.sql',
    '003_seed_system_settings.sql',
];

foreach ($baselineFiles as $f) {
    $full = "$migrationDir/$f";
    if (!file_exists($full)) {
        fwrite(STDERR, "FAIL: migration file not found: $full\n");
        exit(1);
    }
    source_migration($db, $full);
    db_run($db, "INSERT INTO _schema_migrations (version) VALUES ('$f');");
}
ok(['c'=>0], 'All 3 baseline migrations applied');

echo "\n--- Table count ---\n";
$tbl = (int)q($db, "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='$db' AND TABLE_TYPE='BASE TABLE'");
echo "Tables: $tbl (expected 16)\n"; if ($tbl !== 16) { fwrite(STDERR,"FAIL: table count $tbl != 16\n"); exit(1); }
ok(['c'=>0], '16 physical tables (15 application + 1 _schema_migrations)');

echo "\n--- Application table count ---\n";
$appTables = [
    'user_accounts','role_permissions','students','class_sections','courses',
    'enrollments','assessments','assessment_scores','attendance_records',
    'biometric_profiles','auth_sessions','security_tokens','audit_events',
    'email_outbox','system_settings'
];
$missing = [];
foreach ($appTables as $t) {
    $cnt = (int)q($db, "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='$db' AND TABLE_NAME='$t'");
    if ($cnt !== 1) { $missing[] = $t; }
}
if (count($missing) > 0) { fwrite(STDERR,"FAIL: missing tables: " . implode(', ', $missing) . "\n"); exit(1); }
$expectedApp = count($appTables);
$allTables = q($db, "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='$db' AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME");
$actualApp = 0;
foreach (explode("\n", $allTables) as $t) {
    $t = trim($t);
    if ($t !== '' && $t !== '_schema_migrations') { $actualApp++; }
}
if ($actualApp !== $expectedApp) {
    fwrite(STDERR, "FAIL: app table count $actualApp != $expectedApp\n");
    fwrite(STDERR, "ALL TABLES IN DB:\n$allTables\n");
    exit(1);
}
ok(['c'=>0], "15 application tables verified");

echo "\n--- RBAC seed count ---\n";
$rbac = (int)q($db, "SELECT COUNT(*) FROM role_permissions");
echo "RBAC rows: $rbac (expected 125)\n"; if ($rbac !== 125) exit(1);
ok(['c'=>0], '125 role_permissions');

$roles = q($db, "SELECT DISTINCT role_name FROM role_permissions ORDER BY role_name");
echo "Distinct roles: " . str_replace("\n", ', ', $roles) . " (expected 3)\n";
if (count(explode("\n", trim($roles))) !== 3) exit(1);
ok(['c'=>0], '3 distinct roles');

$secretaryChecks = [
    'assessment_scores' => 'assessment_scores',
    'grades' => 'grades',
    'retention_cases' => 'retention_cases',
    'remedial_exams' => 'remedial_exams',
    'facial_templates' => 'facial_templates',
    'system_settings' => 'system_settings',
];
foreach ($secretaryChecks as $resource => $label) {
    $cnt = (int)q($db, "SELECT COUNT(*) FROM role_permissions WHERE role_name='secretary' AND resource='$resource'");
    if ($cnt !== 0) { fwrite(STDERR,"FAIL: secretary should not have access to $resource\n"); exit(1); }
}
ok(['c'=>0], 'Secretary has no prohibited resource grants');

$secretaryRead = (int)q($db, "SELECT COUNT(*) FROM role_permissions WHERE role_name='secretary' AND resource='students' AND action='read'");
if ($secretaryRead !== 1) exit(1);
ok(['c'=>0], 'Secretary has students read access');

$secretaryAttRead = (int)q($db, "SELECT COUNT(*) FROM role_permissions WHERE role_name='secretary' AND resource='attendance' AND action='read_records'");
$secretaryAttOverride = (int)q($db, "SELECT COUNT(*) FROM role_permissions WHERE role_name='secretary' AND resource='attendance' AND action='override'");
if ($secretaryAttRead !== 1 || $secretaryAttOverride !== 1) exit(1);
ok(['c'=>0], 'Secretary has attendance read_records and override (but not create_session or mark)');

$secretaryAttMark = (int)q($db, "SELECT COUNT(*) FROM role_permissions WHERE role_name='secretary' AND resource='attendance' AND action IN ('create_session', 'mark')");
if ($secretaryAttMark !== 0) exit(1);
ok(['c'=>0], 'Secretary does NOT have attendance.create_session or attendance.mark');

$facultyArchive = (int)q($db, "SELECT COUNT(*) FROM role_permissions WHERE role_name='faculty' AND resource='enrollments' AND action='archive'");
if ($facultyArchive !== 1) exit(1);
ok(['c'=>0], 'Faculty has enrollments.archive (assigned_class)');

$noDupes = (int)q($db, "SELECT COUNT(*) FROM (SELECT role_name, resource, action, scope, COUNT(*) AS cnt FROM role_permissions GROUP BY role_name, resource, action, scope HAVING cnt > 1) dupes");
if ($noDupes !== 0) exit(1);
ok(['c'=>0], 'No duplicate role/resource/action/scope tuples');

echo "\n--- System settings baseline count ---\n";
$settings = (int)q($db, "SELECT COUNT(*) FROM system_settings");
echo "System settings rows: $settings (expected 5)\n"; if ($settings !== 5) exit(1);
ok(['c'=>0], '5 system_settings rows from baseline');

$chainHead = (int)q($db, "SELECT COUNT(*) FROM system_settings WHERE setting_key='audit_chain_head' AND is_internal=1");
if ($chainHead !== 1) exit(1);
ok(['c'=>0], 'audit_chain_head internal setting exists');

echo "\n--- Trigger count ---\n";
$trig = (int)q($db, "SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA='$db'");
echo "Triggers: $trig (expected 4)\n"; if ($trig !== 4) exit(1);
ok(['c'=>0], '4 triggers');

echo "\n--- Required triggers ---\n";
$noUpdateAudit = (int)q($db, "SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA='$db' AND TRIGGER_NAME='trg_audit_events_no_update'");
if ($noUpdateAudit !== 1) exit(1);
ok(['c'=>0], 'trg_audit_events_no_update');

$noDeleteAudit = (int)q($db, "SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA='$db' AND TRIGGER_NAME='trg_audit_events_no_delete'");
if ($noDeleteAudit !== 1) exit(1);
ok(['c'=>0], 'trg_audit_events_no_delete');

$noDeleteInternal = (int)q($db, "SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA='$db' AND TRIGGER_NAME='trg_system_settings_internal_no_delete'");
if ($noDeleteInternal !== 1) exit(1);
ok(['c'=>0], 'trg_system_settings_internal_no_delete');

$identityGuard = (int)q($db, "SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA='$db' AND TRIGGER_NAME='trg_system_settings_internal_identity_guard'");
if ($identityGuard !== 1) exit(1);
ok(['c'=>0], 'trg_system_settings_internal_identity_guard');

echo "\n--- Audit append-only behavior ---\n";
db_run($db, "INSERT INTO audit_events (event_uuid, sequence_number, occurred_at, module_code, action_code, event_status, previous_event_mac, event_mac, mac_key_version, canonical_schema_version) VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 999999, NOW(6), 'T', 't', 'Success', 0x0000000000000000000000000000000000000000000000000000000000000000, 0x0000000000000000000000000000000000000000000000000000000000000001, 1, 1)");
nok(db_try($db, "UPDATE audit_events SET description='x' WHERE event_uuid='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'"), 'T01: audit_events UPDATE rejected');
nok(db_try($db, "DELETE FROM audit_events WHERE event_uuid='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'"), 'T02: audit_events DELETE rejected');
ok(['c'=>0], 'Audit append-only triggers work');

echo "\n--- System settings internal guard ---\n";
nok(db_try($db, "DELETE FROM system_settings WHERE setting_key='audit_chain_head'"), 'T03: internal delete rejected');
ok(['c'=>0], 'Internal delete guard works');

echo "\n--- Unique constraints ---\n";
$uqList = [
    'uq_user_accounts_login_email',
    'uq_students_student_number',
    'uq_students_user_id',
    'uq_enrollments_student_cs',
    'uq_assessment_scores',
    'uq_attendance_enrollment_date_code',
    'uq_biometric_profiles_student',
    'uq_auth_sessions_session_uuid',
    'uq_security_tokens_token_digest',
    'uq_security_tokens_parent_token_id',
    'uq_audit_events_event_uuid',
    'uq_audit_events_sequence',
    'uq_email_outbox_operation_uuid',
    'uq_system_settings_key',
    'uq_role_permissions',
    'uq_courses_course_code',
];
foreach ($uqList as $u) {
    $cnt = (int)q($db, "SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA='$db' AND CONSTRAINT_NAME='$u' AND CONSTRAINT_TYPE='UNIQUE'");
    if ($cnt !== 1) { fwrite(STDERR,"FAIL: missing unique constraint: $u\n"); exit(1); }
}
ok(['c'=>0], 'All required unique constraints exist');

echo "\n--- Foreign keys ---\n";
$fkCount = (int)q($db, "SELECT COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA='$db'");
if ($fkCount < 20) { fwrite(STDERR,"FAIL: expected at least 20 foreign keys, found $fkCount\n"); exit(1); }
ok(['c'=>0], "At least 20 foreign keys ($fkCount)");

echo "\n--- BINARY(32) columns ---\n";
$bin = (int)q($db, "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='$db' AND DATA_TYPE='binary' AND CHARACTER_MAXIMUM_LENGTH=32");
if ($bin < 4) { fwrite(STDERR,"FAIL: expected at least 4 BINARY(32) columns, found $bin\n"); exit(1); }
ok(['c'=>0], "BINARY(32) columns exist ($bin)");

echo "\n=== Phase 2: Explicit Development Seed Execution (database/seed.sql) ===\n";
source_migration($db, "$repo/database/seed.sql");
ok(['c'=>0], 'database/seed.sql executed cleanly');

$rbacAfterSeed = (int)q($db, "SELECT COUNT(*) FROM role_permissions");
if ($rbacAfterSeed !== 125) { fwrite(STDERR, "FAIL: role_permissions count $rbacAfterSeed != 125 after seed execution\n"); exit(1); }
ok(['c'=>0], 'role_permissions count preserved at 125 after seed');

$invalidEmails = (int)q($db, "SELECT COUNT(*) FROM email_outbox WHERE email_type NOT IN ('Privacy Consent','At-Risk Notification','Secretary Invitation','Faculty Registration Approved','Faculty Registration Rejected','Other')");
if ($invalidEmails !== 0) { fwrite(STDERR,"FAIL: invalid email_type enum values found in email_outbox\n"); exit(1); }
ok(['c'=>0], 'All email_outbox.email_type values in seed are valid');

// Verify migration runner execution on seeded database does not record seed.sql
$cmdRunner = "powershell -NoProfile -ExecutionPolicy Bypass -File " . escapeshellarg($repo . '\scripts\migrate.ps1') . " -HostName 127.0.0.1 -Port 3306 -DatabaseName " . escapeshellarg($db) . " -User root -Password " . escapeshellarg($pass) . " 2>&1";
$rRunner = run($cmdRunner);
ok($rRunner, 'Migration runner executed on seeded DB without error');

$historyCount = (int)q($db, "SELECT COUNT(*) FROM _schema_migrations");
if ($historyCount !== 3) { fwrite(STDERR, "FAIL: _schema_migrations count $historyCount != 3 after runner rerun on seeded DB\n"); exit(1); }
$seedRecord = (int)q($db, "SELECT COUNT(*) FROM _schema_migrations WHERE version LIKE '%seed.sql%'");
if ($seedRecord !== 0) { fwrite(STDERR, "FAIL: database/seed.sql was recorded in _schema_migrations\n"); exit(1); }
ok(['c'=>0], 'database/seed.sql is NOT recorded in _schema_migrations');

echo "\n--- Cleanup ---\n";
run("docker compose --project-directory " . escapeshellarg($repo) . " exec -T db mariadb -u root -p" . escapeshellarg($pass) . " -e 'DROP DATABASE IF EXISTS $db'");
echo "ALL BASELINE SCHEMA CONTRACT & SEED VALIDATION TESTS PASSED\n";
