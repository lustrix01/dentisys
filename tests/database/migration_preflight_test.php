<?php

declare(strict_types=1);

$repo = dirname(__DIR__, 2);
$pass = getenv('DB_ROOT_PASS') ?: 'local-root-password';
$migrationDir = $repo . '/database/migrations';

function run(string $cmd): array {
    $o = [];
    $c = 0;
    exec($cmd, $o, $c);
    return ['o' => $o, 'c' => $c];
}

function ok(array $r, string $l): void {
    if ($r['c'] !== 0) {
        fwrite(STDERR, "FAIL: $l\n" . implode("\n", $r['o']) . "\n");
        exit(1);
    }
    echo "PASS: $l\n";
}

function nok(array $r, string $l): void {
    if ($r['c'] === 0) {
        fwrite(STDERR, "FAIL: $l -- expected error\n" . implode("\n", $r['o']) . "\n");
        exit(1);
    }
    echo "PASS: $l\n";
}

function q(string $db, string $sql): string {
    global $repo, $pass;
    $cmd = "docker compose --project-directory " . escapeshellarg($repo) . " exec -T db mariadb -u root -p" . escapeshellarg($pass) . " " . escapeshellarg($db) . " --batch --skip-column-names -e " . escapeshellarg($sql);
    $r = run($cmd);
    if ($r['c'] !== 0) throw new RuntimeException(implode("\n", $r['o']));
    return trim(implode("\n", $r['o']));
}

function db_run(string $db, string $sql): void { q($db, $sql); }

function create_db(string $db): void {
    global $repo, $pass;
    run("docker compose --project-directory " . escapeshellarg($repo) . " exec -T db mariadb -u root -p" . escapeshellarg($pass) . " -e " . escapeshellarg("DROP DATABASE IF EXISTS $db; CREATE DATABASE $db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"));
}

function drop_db(string $db): void {
    global $repo, $pass;
    run("docker compose --project-directory " . escapeshellarg($repo) . " exec -T db mariadb -u root -p" . escapeshellarg($pass) . " -e " . escapeshellarg("DROP DATABASE IF EXISTS $db;"));
}

function run_migrate(string $dbName, int $port = 3306, ?string $user = 'root', ?string $password = null): array {
    global $repo, $pass;
    $userVal = $user ?? 'root';
    $passVal = $password ?? $pass;
    $cmd = "powershell -NoProfile -ExecutionPolicy Bypass -File " . escapeshellarg($repo . '\scripts\migrate.ps1') . " -HostName 127.0.0.1 -Port $port -DatabaseName " . escapeshellarg($dbName) . " -User " . escapeshellarg($userVal) . " -Password " . escapeshellarg($passVal) . " 2>&1";
    return run($cmd);
}

$dbPrefix = 'dentisys_test_preflight_';

echo "=== Migration Preflight & Runner Test Suite ===\n\n";

// ---- Case 1: Clean first execution (init.sql + 001-003 run) ----
echo "--- Case 1: Clean first execution ---\n";
$db1 = $dbPrefix . 'c01_' . substr(md5(uniqid()), 0, 6);
try {
    create_db($db1);
    $r1 = run_migrate($db1);
    ok($r1, 'Case 1: Clean first execution completed');
    $records = (int)q($db1, "SELECT COUNT(*) FROM _schema_migrations");
    if ($records !== 3) {
        fwrite(STDERR, "FAIL: Case 1 recorded count $records != 3\n");
        exit(1);
    }
    echo "PASS: Case 1: 3 migration records created in _schema_migrations\n";
} finally {
    drop_db($db1);
}

// ---- Case 2: Second execution rerun skip ----
echo "\n--- Case 2: Second execution rerun skip ---\n";
$db2 = $dbPrefix . 'c02_' . substr(md5(uniqid()), 0, 6);
try {
    create_db($db2);
    run_migrate($db2);
    $r2 = run_migrate($db2);
    ok($r2, 'Case 2: Rerun exit code is 0');
    $out = implode("\n", $r2['o']);
    if (strpos($out, 'SKIP: 001_baseline_schema.sql') === false || strpos($out, 'SKIP: 003_seed_system_settings.sql') === false) {
        fwrite(STDERR, "FAIL: Case 2 did not report expected SKIP messages\n$out\n");
        exit(1);
    }
    echo "PASS: Case 2: Rerun skipped all 3 migrations\n";
} finally {
    drop_db($db2);
}

// ---- Case 3: Partial contiguous history (001-002 recorded, 003 pending) ----
echo "\n--- Case 3: Partial contiguous history ---\n";
$db3 = $dbPrefix . 'c03_' . substr(md5(uniqid()), 0, 6);
try {
    create_db($db3);
    // Execute init.sql and 001-002 manually
    db_run($db3, "CREATE TABLE IF NOT EXISTS _schema_migrations (version VARCHAR(255) NOT NULL PRIMARY KEY, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");
    $baseFiles = ['001_baseline_schema.sql', '002_seed_rbac.sql'];
    foreach ($baseFiles as $bf) {
        $sql = file_get_contents("$repo/database/migrations/$bf");
        $tmpFile = "/tmp/$bf";
        run("docker cp " . escapeshellarg("$repo/database/migrations/$bf") . " dentisys-db-1:$tmpFile");
        db_run($db3, "source $tmpFile;");
        db_run($db3, "INSERT INTO _schema_migrations (version) VALUES ('$bf');");
    }
    // Now run migrate.ps1 - should skip 001-002 and apply 003
    $r3 = run_migrate($db3);
    ok($r3, 'Case 3: Partial history resume completed');
    $records3 = (int)q($db3, "SELECT COUNT(*) FROM _schema_migrations");
    if ($records3 !== 3) {
        fwrite(STDERR, "FAIL: Case 3 total records $records3 != 3\n");
        exit(1);
    }
    echo "PASS: Case 3: 003 applied successfully after 001-002 baseline\n";
} finally {
    drop_db($db3);
}

// ---- Case 4: Unknown recorded migration rejection ----
echo "\n--- Case 4: Unknown recorded migration rejection ---\n";
$db4 = $dbPrefix . 'c04_' . substr(md5(uniqid()), 0, 6);
try {
    create_db($db4);
    db_run($db4, "CREATE TABLE IF NOT EXISTS _schema_migrations (version VARCHAR(255) NOT NULL PRIMARY KEY, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");
    db_run($db4, "INSERT INTO _schema_migrations (version) VALUES ('999_unknown_migration.sql');");
    $r4 = run_migrate($db4);
    nok($r4, 'Case 4: Rejected unknown migration record');
} finally {
    drop_db($db4);
}

// ---- Case 5: Non-contiguous history rejection (001 and 003 recorded, 002 missing) ----
echo "\n--- Case 5: Non-contiguous history rejection ---\n";
$db5 = $dbPrefix . 'c05_' . substr(md5(uniqid()), 0, 6);
try {
    create_db($db5);
    db_run($db5, "CREATE TABLE IF NOT EXISTS _schema_migrations (version VARCHAR(255) NOT NULL PRIMARY KEY, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");
    db_run($db5, "INSERT INTO _schema_migrations (version) VALUES ('001_baseline_schema.sql');");
    db_run($db5, "INSERT INTO _schema_migrations (version) VALUES ('003_seed_system_settings.sql');");
    $r5 = run_migrate($db5);
    nok($r5, 'Case 5: Rejected non-contiguous history gap');
} finally {
    drop_db($db5);
}

// ---- Case 6: Dynamic direct-child migration discovery ----
echo "\n--- Case 6: Dynamic direct-child migration discovery ---\n";
$db6 = $dbPrefix . 'c06_' . substr(md5(uniqid()), 0, 6);
$tempMigrationFile = "$migrationDir/999_temp_test_migration.sql";
try {
    create_db($db6);
    file_put_contents($tempMigrationFile, "-- Temp migration\nSELECT 1;\n");
    $r6 = run_migrate($db6);
    ok($r6, 'Case 6: Dynamic migration discovery completed');
    $records6 = (int)q($db6, "SELECT COUNT(*) FROM _schema_migrations WHERE version='999_temp_test_migration.sql'");
    if ($records6 !== 1) {
        fwrite(STDERR, "FAIL: Temp migration 999_temp_test_migration.sql was not recorded\n");
        exit(1);
    }
    echo "PASS: Case 6: Dynamic direct-child migration discovered and applied\n";
} finally {
    if (file_exists($tempMigrationFile)) {
        unlink($tempMigrationFile);
    }
    drop_db($db6);
}

// ---- Case 7: Exclusion of archive/ subdirectory ----
echo "\n--- Case 7: Exclusion of archive/ subdirectory ---\n";
$db7 = $dbPrefix . 'c07_' . substr(md5(uniqid()), 0, 6);
try {
    create_db($db7);
    $r7 = run_migrate($db7);
    ok($r7, 'Case 7: Migration ran cleanly');
    $archiveRecorded = (int)q($db7, "SELECT COUNT(*) FROM _schema_migrations WHERE version LIKE '%archive%' OR version LIKE '%phase%'");
    if ($archiveRecorded !== 0) {
        fwrite(STDERR, "FAIL: Case 7 recorded archive migration files\n");
        exit(1);
    }
    echo "PASS: Case 7: Archive subdirectories correctly excluded from migrations\n";
} finally {
    drop_db($db7);
}

// ---- Case 8: Exclusion of database/seed.sql ----
echo "\n--- Case 8: Exclusion of database/seed.sql ---\n";
$db8 = $dbPrefix . 'c8_' . substr(md5(uniqid()), 0, 6);
try {
    create_db($db8);
    $r8 = run_migrate($db8);
    ok($r8, 'Case 8: Migration completed');
    $seedRecorded = (int)q($db8, "SELECT COUNT(*) FROM _schema_migrations WHERE version='seed.sql'");
    if ($seedRecorded !== 0) {
        fwrite(STDERR, "FAIL: seed.sql was incorrectly recorded as a migration\n");
        exit(1);
    }
    echo "PASS: Case 8: database/seed.sql correctly excluded from migration execution\n";
} finally {
    drop_db($db8);
}

// ---- Case 9: Missing database/init.sql rejection ----
echo "\n--- Case 9: Missing database/init.sql rejection ---\n";
$db9 = $dbPrefix . 'c9_' . substr(md5(uniqid()), 0, 6);
$initPath = "$repo/database/init.sql";
$bakPath = "$repo/database/init.sql.bak_test";
try {
    create_db($db9);
    rename($initPath, $bakPath);
    $r9 = run_migrate($db9);
    nok($r9, 'Case 9: Missing database/init.sql rejected');
} finally {
    if (file_exists($bakPath)) {
        rename($bakPath, $initPath);
    }
    drop_db($db9);
}

// ---- Case 10: Failed init command exits non-zero ----
echo "\n--- Case 10: Failed init command exits non-zero ---\n";
$db10 = $dbPrefix . 'c10_' . substr(md5(uniqid()), 0, 6);
$r10 = run_migrate($db10, 3306, 'root', 'invalid-password-12345');
nok($r10, 'Case 10: Invalid DB credentials exited non-zero');

echo "\n=== ALL 10 MIGRATION PREFLIGHT TESTS PASSED ===\n";
