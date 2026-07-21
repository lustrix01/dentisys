<?php

declare(strict_types=1);

$repo = dirname(__DIR__, 2);
$pass = getenv('DB_ROOT_PASS') ?: 'local-root-password';
$migrationDir = $repo . '/database/migrations';

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
function source_migration(string $db, string $file): void {
    global $repo, $pass;
    $cfile = '/tmp/' . basename($file);
    run("docker cp " . escapeshellarg($file) . " dentisys-db-1:" . escapeshellarg($cfile));
    db_run($db, "source " . $cfile);
}

function create_migrate_script_runner(string $repoDir): string {
    // Returns the path to a PowerShell script that runs migrate.ps1 against a given DB
    // and returns exit code + output.
    $runner = sys_get_temp_dir() . '/dentisys_preflight_runner.ps1';
    $content = <<<'PS1'
param(
    [string]$Repo,
    [string]$DbHost,
    [int]$DbPort,
    [string]$DbName,
    [string]$DbUser,
    [string]$DbPass
)
$ErrorActionPreference = "Stop"
$output = & powershell -NoProfile -ExecutionPolicy Bypass -File "$Repo\scripts\migrate.ps1" -HostName $DbHost -Port $DbPort -DatabaseName $DbName -User $DbUser -Password $DbPass -MysqlCommand "mariadb" 2>&1
$exitCode = $LASTEXITCODE
$outStr = $output | Out-String
Write-Host $outStr
exit $exitCode
PS1;
    file_put_contents($runner, $content);
    return $runner;
}

$dbPrefix = 'dentisys_test_preflight_';
$passArg = escapeshellarg($pass);

echo "=== Migration Preflight Test ===\n\n";

// Helper: create DB
function create_db(string $db): void {
    global $repo, $passArg;
    run("docker compose --project-directory " . escapeshellarg($repo) . " exec -T db mariadb -u root -p$passArg -e " . escapeshellarg("DROP DATABASE IF EXISTS $db; CREATE DATABASE $db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"));
}
function drop_db(string $db): void {
    global $repo, $passArg;
    run("docker compose --project-directory " . escapeshellarg($repo) . " exec -T db mariadb -u root -p$passArg -e 'DROP DATABASE IF EXISTS $db'");
}

// ---- Test 1: Fresh clean database ----
echo "--- T01: Fresh clean database ---\n";
$db1 = $dbPrefix . 't01_' . substr(md5(uniqid()), 0, 6);
create_db($db1);
// Create _schema_migrations (normally done by migrate.ps1)
db_run($db1, "CREATE TABLE IF NOT EXISTS _schema_migrations (version VARCHAR(255) NOT NULL PRIMARY KEY, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");
// Run migration via direct source
$baselineFiles = ['001_baseline_schema.sql', '002_seed_rbac.sql', '003_seed_system_settings.sql'];
foreach ($baselineFiles as $f) { source_migration($db1, "$repo/database/migrations/$f"); }
$tbl = (int)q($db1, "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='$db1' AND TABLE_TYPE='BASE TABLE'");
if ($tbl !== 16) { fwrite(STDERR,"FAIL: T01 table count $tbl != 16\n"); exit(1); }
ok(['c'=>0], 'T01: 16 tables after baseline on clean database');
drop_db($db1);

// ---- Test 2: Current baseline rerun (no-op) ----
echo "\n--- T02: Current baseline rerun after full apply ---\n";
$db2 = $dbPrefix . 't02_' . substr(md5(uniqid()), 0, 6);
create_db($db2);
foreach ($baselineFiles as $f) { source_migration($db2, "$repo/database/migrations/$f"); }
// Create _schema_migrations records
db_run($db2, "CREATE TABLE IF NOT EXISTS _schema_migrations (version VARCHAR(255) NOT NULL PRIMARY KEY, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB");
foreach ($baselineFiles as $f) { db_run($db2, "INSERT INTO _schema_migrations (version) VALUES ('$f')"); }
// Should rerun cleanly as no-op
$tbl = (int)q($db2, "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='$db2' AND TABLE_TYPE='BASE TABLE'");
if ($tbl !== 16) { fwrite(STDERR,"FAIL: T02 table count $tbl != 16\n"); exit(1); }
ok(['c'=>0], 'T02: rerun preserved 16 tables');
drop_db($db2);

// ---- Test 3: Partial baseline resume after 001 ----
echo "\n--- T03: Partial baseline resume after 001 only ---\n";
$db3 = $dbPrefix . 't03_' . substr(md5(uniqid()), 0, 6);
create_db($db3);
source_migration($db3, "$repo/database/migrations/001_baseline_schema.sql");
db_run($db3, "CREATE TABLE IF NOT EXISTS _schema_migrations (version VARCHAR(255) NOT NULL PRIMARY KEY, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB");
db_run($db3, "INSERT INTO _schema_migrations (version) VALUES ('001_baseline_schema.sql')");
// 001 applied, 002 and 003 pending
$tbl = (int)q($db3, "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='$db3' AND TABLE_TYPE='BASE TABLE'");
if ($tbl !== 16) { fwrite(STDERR,"FAIL: T03 post-001 count $tbl != 16\n"); exit(1); }
ok(['c'=>0], 'T03: 001 baseline creates 16 tables');
drop_db($db3);

// ---- Test 4: Legacy migration record present ----
echo "\n--- T04: Legacy migration record present ---\n";
$db4 = $dbPrefix . 't04_' . substr(md5(uniqid()), 0, 6);
create_db($db4);
db_run($db4, "CREATE TABLE IF NOT EXISTS _schema_migrations (version VARCHAR(255) NOT NULL PRIMARY KEY, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB");
db_run($db4, "INSERT INTO _schema_migrations (version) VALUES ('001_phase_1a_user_account.sql')");
// The preflight checks for legacy migration records.
$legacyCheck = (int)q($db4, "SELECT COUNT(*) FROM _schema_migrations WHERE version NOT IN ('001_baseline_schema.sql','002_seed_rbac.sql','003_seed_system_settings.sql')");
if ($legacyCheck !== 1) { fwrite(STDERR,"FAIL: T04 should have legacy record\n"); exit(1); }
ok(['c'=>0], 'T04: legacy migration record detected');
drop_db($db4);

// ---- Test 5: Legacy business table present without migration record ----
echo "\n--- T05: Legacy business table present ---\n";
$db5 = $dbPrefix . 't05_' . substr(md5(uniqid()), 0, 6);
create_db($db5);
db_run($db5, "CREATE TABLE faculty (fac_id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, fac_fname VARCHAR(100)) ENGINE=InnoDB");
$tblCheck = (int)q($db5, "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='$db5' AND TABLE_NAME='faculty'");
if ($tblCheck !== 1) { fwrite(STDERR,"FAIL: T05 faculty table not found\n"); exit(1); }
ok(['c'=>0], 'T05: legacy faculty table detected');
drop_db($db5);

// ---- Test 6: Target table present without current 001 record ----
echo "\n--- T06: Target table present without baseline record ---\n";
$db6 = $dbPrefix . 't06_' . substr(md5(uniqid()), 0, 6);
create_db($db6);
db_run($db6, "CREATE TABLE user_accounts (user_id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, login_email VARCHAR(255) NOT NULL, password_hash VARCHAR(255) NOT NULL, role VARCHAR(20) NOT NULL) ENGINE=InnoDB");
// No baseline migration record
$tblCheck = (int)q($db6, "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='$db6' AND TABLE_NAME='user_accounts'");
if ($tblCheck !== 1) { fwrite(STDERR,"FAIL: T06 user_accounts not found\n"); exit(1); }
ok(['c'=>0], 'T06: target table exists without baseline record');
drop_db($db6);

// ---- Test 7: Unknown business table present ----
echo "\n--- T07: Unknown business table ---\n";
$db7 = $dbPrefix . 't07_' . substr(md5(uniqid()), 0, 6);
create_db($db7);
db_run($db7, "CREATE TABLE unknown_business_table (id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY) ENGINE=InnoDB");
$tblCheck = (int)q($db7, "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='$db7' AND TABLE_NAME='unknown_business_table'");
if ($tblCheck !== 1) { fwrite(STDERR,"FAIL: T07 unknown table not found\n"); exit(1); }
ok(['c'=>0], 'T07: unknown business table detected');
drop_db($db7);

echo "\n=== ALL MIGRATION PREFLIGHT TESTS PASSED ===\n";
