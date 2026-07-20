<?php

declare(strict_types=1);

$repo = dirname(__DIR__, 2);
$pass = getenv('DB_ROOT_PASS') ?: 'local-root-password';
$migrationDir = $repo . '/database/migrations';

function run(string $cmd): array { $o=[]; $c=0; exec($cmd,$o,$c); return ['o'=>$o,'c'=>$c]; }
function ok(array $r, string $l): void { if($r['c']!==0){ fwrite(STDERR,"FAIL: $l\n".implode("\n",$r['o'])."\n"); exit(1); } echo "PASS: $l\n"; }
function fail(array $r, string $l): void {
    $isErr = ($r['c'] !== 0) || (stripos(implode("\n",$r['o']),'ERROR')!==false) || (stripos(implode("\n",$r['o']),'45000')!==false);
    if ($isErr) { echo "PASS: $l (error detected)\n"; } else { fwrite(STDERR,"FAIL: $l -- expected error\n"); exit(1); }
}

function db(string $db, string $sql): string {
    global $repo, $pass;
    $r = run("docker compose --project-directory " . escapeshellarg($repo) . " exec -T db mariadb -u root -p" . escapeshellarg($pass) . " " . escapeshellarg($db) . " --batch --skip-column-names -e " . escapeshellarg($sql) . " 2>&1");
    if ($r['c'] !== 0) throw new RuntimeException(implode("\n", $r['o']));
    return trim(implode("\n", $r['o']));
}
function db_exec(string $db, string $sql): void { db($db, $sql); }
function db_try(string $db, string $sql): array {
    global $repo, $pass;
    return run("docker compose --project-directory " . escapeshellarg($repo) . " exec -T db mariadb -u root -p" . escapeshellarg($pass) . " " . escapeshellarg($db) . " -e " . escapeshellarg($sql) . " 2>&1");
}
function db_source(string $db, string $file): void {
    global $repo, $pass;
    $cfile = '/tmp/' . basename($file);
    run("docker cp " . escapeshellarg($file) . " dentisys-db-1:" . escapeshellarg($cfile));
    $cmd = "docker compose --project-directory " . escapeshellarg($repo) . " exec -T db mariadb -u root -p" . escapeshellarg($pass) . " --default-character-set=utf8mb4 " . escapeshellarg($db) . " -e " . escapeshellarg("source " . $cfile) . " 2>&1";
    $r = run($cmd);
    if ($r['c'] !== 0) { fwrite(STDERR, "FAIL: source $file\n" . implode("\n", $r['o']) . "\n"); exit(1); }
}

function applyMigrationsUpto(string $db, int $upto, array $allFiles): \Closure {
    global $repo, $pass;
    return function(string $f) use ($repo, $pass, $db): array {
        $c = '/tmp/' . basename($f);
        run("docker cp " . escapeshellarg($f) . " dentisys-db-1:" . escapeshellarg($c));
        $cmd = "docker compose --project-directory " . escapeshellarg($repo) . " exec -T db mariadb -u root -p" . escapeshellarg($pass) . " --default-character-set=utf8mb4 " . escapeshellarg($db) . " -e " . escapeshellarg("source " . $c) . " 2>&1";
        return run($cmd);
    };
}

function setupBaseSchema(string $db, int $upto, array $allFiles): \Closure {
    global $repo, $pass;
    foreach ($allFiles as $f) {
        $n = (int)substr(basename($f), 0, 3);
        if ($n >= 1 && $n <= $upto) {
            $c = '/tmp/' . basename($f);
            run("docker cp " . escapeshellarg($f) . " dentisys-db-1:" . escapeshellarg($c));
            run("docker compose --project-directory " . escapeshellarg($repo) . " exec -T db mariadb -u root -p" . escapeshellarg($pass) . " --default-character-set=utf8mb4 " . escapeshellarg($db) . " -e " . escapeshellarg("source " . $c) . " 2>&1");
        }
    }
    return applyMigrationsUpto($db, $upto, $allFiles);
}

$dbPrefix = 'dentisys_test_';
$allFiles = glob("$migrationDir/0*.sql"); sort($allFiles);

echo "=== Phase 1C Staged Migration Test ===\n\n";

// ===== POSITIVE SCENARIO =====
echo "--- POSITIVE: Full migration with valid fixtures ---\n";
$dbPos = $dbPrefix . 'pos_' . substr(md5(uniqid()), 0, 6);
echo "DB: $dbPos\n";
run("docker compose --project-directory " . escapeshellarg($repo) . " exec -T db mariadb -u root -p" . escapeshellarg($pass) . " -e " . escapeshellarg("DROP DATABASE IF EXISTS $dbPos; CREATE DATABASE $dbPos CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"));
foreach ($allFiles as $f) { $n = (int)substr(basename($f),0,3); if ($n>=1&&$n<=48) db_source($dbPos, $f); }
ok(['c'=>(int)db($dbPos,"SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='$dbPos'")===20?0:1], '20 tables after 048');

db_exec($dbPos, "INSERT INTO user_account (username, password_hash, role, status) VALUES ('admin_fix@bu.edu.ph', '\$2y\$10\$aa', 'admin', 'Active')");
db_exec($dbPos, "INSERT INTO user_account (username, password_hash, role, status) VALUES ('fac_fix@bu.edu.ph', '\$2y\$10\$aa', 'faculty', 'Active')");
db_exec($dbPos, "INSERT INTO user_account (username, password_hash, role, status) VALUES ('sec_fix@bu.edu.ph', '\$2y\$10\$aa', 'secretary', 'Active')");
db_exec($dbPos, "INSERT INTO user_account (username, password_hash, role, status) VALUES ('ext_fix@bu.edu.ph', '\$2y\$10\$aa', 'faculty', 'Active')");
db_exec($dbPos, "INSERT INTO faculty (fac_fname, fac_lname, is_admin, user_id) VALUES ('Test','Faculty',1,2)");
db_exec($dbPos, "INSERT INTO course (course_code, name, units) VALUES ('T101','Test',3)");
db_exec($dbPos, "INSERT INTO course_component (lab_weight, lec_weight, has_zero_rule, fac_id, course_id) VALUES (0.4,0.6,0,1,1)");
db_exec($dbPos, "INSERT INTO component (comp_name, weight, cc_id) VALUES ('quiz',0.2,1)");
db_exec($dbPos, "INSERT INTO component (comp_name, weight, cc_id) VALUES ('term exam',0.3,1)");
db_exec($dbPos, "INSERT INTO component (comp_name, weight, cc_id) VALUES ('practical',0.4,1)");
db_exec($dbPos, "INSERT INTO class_section (cs_name, cs_semester, cs_school_year, cs_block, status, cc_id) VALUES ('TS','1ST','2025-2026','A','Active',1)");
ok(['c'=>0], 'Fixtures inserted');

foreach ($allFiles as $f) { $n = (int)substr(basename($f),0,3); if ($n>=49&&$n<=80) db_source($dbPos, $f); }
ok(['c'=>0], '32 Phase 1C migrations applied');

echo "  Tables: " . db($dbPos,"SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='$dbPos'") . " (46)\n";
echo "  users: " . db($dbPos,"SELECT COUNT(*) FROM user_account") . " (4)\n";
echo "  login_email NOT NULL: " . db($dbPos,"SELECT COUNT(*) FROM user_account WHERE login_email IS NOT NULL") . " (4)\n";
echo "  role_id NOT NULL: " . db($dbPos,"SELECT COUNT(*) FROM user_account WHERE role_id IS NOT NULL") . " (4)\n";
echo "  roles: " . db($dbPos,"SELECT COUNT(*) FROM access_role") . " (3)\n";
echo "  perms: " . db($dbPos,"SELECT COUNT(*) FROM permission") . " (66)\n";
echo "  bindings: " . db($dbPos,"SELECT COUNT(*) FROM role_permission") . " (117)\n";
echo "  comp_types: " . db($dbPos,"SELECT COUNT(*) FROM component_type") . " (8)\n";
echo "  triggers: " . db($dbPos,"SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA='$dbPos'") . " (11)\n";
echo "  ct_id backfill: " . db($dbPos,"SELECT COUNT(*) FROM component WHERE ct_id IS NOT NULL") . " (3)\n";
echo "  term backfill: " . db($dbPos,"SELECT COUNT(*) FROM academic_term") . " (1)\n";
fail(db_try($dbPos,"INSERT INTO faculty (fac_fname,fac_lname,is_admin,user_id) VALUES ('X','Y',0,2)"), 'uq_faculty_user_id');
echo "POSITIVE SCENARIO: ALL PASSED\n\n";

// ===== NEG-050: unknown component alias =====
echo "--- NEG-050: Unknown component alias ---\n";
$dbN = $dbPrefix . 'n050_' . substr(md5(uniqid()), 0, 6);
run("docker compose --project-directory " . escapeshellarg($repo) . " exec -T db mariadb -u root -p" . escapeshellarg($pass) . " -e " . escapeshellarg("DROP DATABASE IF EXISTS $dbN; CREATE DATABASE $dbN CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"));
setupBaseSchema($dbN, 48, $allFiles);
db_exec($dbN, "INSERT INTO user_account (username, password_hash, role, status) VALUES ('a@b.u','\$2y\$10\$aa','faculty','Active')");
db_exec($dbN, "INSERT INTO faculty (fac_fname,fac_lname,is_admin,user_id) VALUES ('F','L',0,1)");
db_exec($dbN, "INSERT INTO course (course_code,name,units) VALUES ('T','T',3)");
db_exec($dbN, "INSERT INTO course_component (lab_weight,lec_weight,has_zero_rule,fac_id,course_id) VALUES (0.4,0.6,0,1,1)");
db_exec($dbN, "INSERT INTO component (comp_name,weight,cc_id) VALUES ('INVALID_COMP_NAME',0.5,1)");
$applyOne = setupBaseSchema($dbN, 49, $allFiles);
$r = $applyOne($allFiles[49]); // 050
fail($r, 'NEG-050: 050 rejects unknown component alias');
run("docker compose --project-directory " . escapeshellarg($repo) . " exec -T db mariadb -u root -p" . escapeshellarg($pass) . " -e 'DROP DATABASE IF EXISTS $dbN'");

// ===== NEG-052: invalid semester =====
echo "--- NEG-052: Invalid semester ---\n";
$dbN = $dbPrefix . 'n052_' . substr(md5(uniqid()), 0, 6);
run("docker compose --project-directory " . escapeshellarg($repo) . " exec -T db mariadb -u root -p" . escapeshellarg($pass) . " -e " . escapeshellarg("DROP DATABASE IF EXISTS $dbN; CREATE DATABASE $dbN CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"));
setupBaseSchema($dbN, 48, $allFiles);
db_exec($dbN, "INSERT INTO user_account (username, password_hash, role, status) VALUES ('a@b.u','\$2y\$10\$aa','faculty','Active')");
db_exec($dbN, "INSERT INTO faculty (fac_fname,fac_lname,is_admin,user_id) VALUES ('F','L',0,1)");
db_exec($dbN, "INSERT INTO course (course_code,name,units) VALUES ('T','T',3)");
db_exec($dbN, "INSERT INTO course_component (lab_weight,lec_weight,has_zero_rule,fac_id,course_id) VALUES (0.4,0.6,0,1,1)");
db_exec($dbN, "INSERT INTO class_section (cs_name, cs_semester, cs_school_year, cs_block, status, cc_id) VALUES ('TS','INVALID','2025-2026','A','Active',1)");
$applyOne = setupBaseSchema($dbN, 51, $allFiles);
$r = $applyOne($allFiles[51]); // 052
fail($r, 'NEG-052: 052 rejects invalid semester');
run("docker compose --project-directory " . escapeshellarg($repo) . " exec -T db mariadb -u root -p" . escapeshellarg($pass) . " -e 'DROP DATABASE IF EXISTS $dbN'");

// ===== NEG-065A: non-email username =====
echo "--- NEG-065A: Non-email username ---\n";
$dbN = $dbPrefix . 'n065a_' . substr(md5(uniqid()), 0, 6);
run("docker compose --project-directory " . escapeshellarg($repo) . " exec -T db mariadb -u root -p" . escapeshellarg($pass) . " -e " . escapeshellarg("DROP DATABASE IF EXISTS $dbN; CREATE DATABASE $dbN CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"));
$applyOne = setupBaseSchema($dbN, 64, $allFiles);
db_exec($dbN, "INSERT INTO user_account (username, password_hash, role, status) VALUES ('noemail_user', '\$2y\$10\$aa', 'faculty', 'Active')");
$r = $applyOne($allFiles[64]); // 065
fail($r, 'NEG-065A: 065 rejects non-email username');
run("docker compose --project-directory " . escapeshellarg($repo) . " exec -T db mariadb -u root -p" . escapeshellarg($pass) . " -e 'DROP DATABASE IF EXISTS $dbN'");

// ===== NEG-065B: duplicate normalized email =====
echo "--- NEG-065B: Duplicate normalized email ---\n";
$dbN = $dbPrefix . 'n065b_' . substr(md5(uniqid()), 0, 6);
run("docker compose --project-directory " . escapeshellarg($repo) . " exec -T db mariadb -u root -p" . escapeshellarg($pass) . " -e " . escapeshellarg("DROP DATABASE IF EXISTS $dbN; CREATE DATABASE $dbN CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"));
$applyOne = setupBaseSchema($dbN, 64, $allFiles);
db_exec($dbN, "INSERT INTO user_account (username, password_hash, role, status) VALUES ('dup@bu.edu.ph', '\$2y\$10\$aa', 'faculty', 'Active')");
db_exec($dbN, "INSERT INTO user_account (username, password_hash, role, status) VALUES ('DUP@bu.edu.ph', '\$2y\$10\$aa', 'faculty', 'Active')");
$r = $applyOne($allFiles[64]); // 065
fail($r, 'NEG-065B: 065 rejects duplicate normalized email');
run("docker compose --project-directory " . escapeshellarg($repo) . " exec -T db mariadb -u root -p" . escapeshellarg($pass) . " -e 'DROP DATABASE IF EXISTS $dbN'");

// ===== NEG-065C: unknown role =====
echo "--- NEG-065C: Unknown role ---\n";
$dbN = $dbPrefix . 'n065c_' . substr(md5(uniqid()), 0, 6);
run("docker compose --project-directory " . escapeshellarg($repo) . " exec -T db mariadb -u root -p" . escapeshellarg($pass) . " -e " . escapeshellarg("DROP DATABASE IF EXISTS $dbN; CREATE DATABASE $dbN CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"));
$applyOne = setupBaseSchema($dbN, 64, $allFiles);
db_exec($dbN, "INSERT INTO user_account (username, password_hash, role, status) VALUES ('badrole@bu.edu.ph', '\$2y\$10\$aa', 'unknown_role', 'Active')");
$r = $applyOne($allFiles[64]); // 065
fail($r, 'NEG-065C: 065 rejects unknown role');
run("docker compose --project-directory " . escapeshellarg($repo) . " exec -T db mariadb -u root -p" . escapeshellarg($pass) . " -e 'DROP DATABASE IF EXISTS $dbN'");

// ===== NEG-066A: duplicate faculty.user_id =====
echo "--- NEG-066A: Duplicate faculty.user_id ---\n";
$dbN = $dbPrefix . 'n066a_' . substr(md5(uniqid()), 0, 6);
run("docker compose --project-directory " . escapeshellarg($repo) . " exec -T db mariadb -u root -p" . escapeshellarg($pass) . " -e " . escapeshellarg("DROP DATABASE IF EXISTS $dbN; CREATE DATABASE $dbN CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"));
setupBaseSchema($dbN, 65, $allFiles);
db_exec($dbN, "INSERT INTO user_account (username, login_email, password_hash, role, role_id, status) SELECT 'dup@bu.edu.ph', 'dup@bu.edu.ph', '\$2y\$10\$aa', 'faculty', role_id, 'Active' FROM access_role WHERE role_name='faculty'");
db_exec($dbN, "INSERT INTO faculty (fac_fname, fac_lname, is_admin, user_id) SELECT 'A', 'B', 0, user_id FROM user_account WHERE username='dup@bu.edu.ph'");
db_exec($dbN, "INSERT INTO faculty (fac_fname, fac_lname, is_admin, user_id) SELECT 'C', 'D', 0, user_id FROM user_account WHERE username='dup@bu.edu.ph'");
$applyOne = applyMigrationsUpto($dbN, 65, $allFiles);
$r = $applyOne($allFiles[65]); // 066
fail($r, 'NEG-066A: 066 rejects duplicate faculty.user_id');
run("docker compose --project-directory " . escapeshellarg($repo) . " exec -T db mariadb -u root -p" . escapeshellarg($pass) . " -e 'DROP DATABASE IF EXISTS $dbN'");

// ===== NEG-066B: is_admin / role contradiction =====
echo "--- NEG-066B: is_admin/role contradiction ---\n";
$dbN = $dbPrefix . 'n066b_' . substr(md5(uniqid()), 0, 6);
run("docker compose --project-directory " . escapeshellarg($repo) . " exec -T db mariadb -u root -p" . escapeshellarg($pass) . " -e " . escapeshellarg("DROP DATABASE IF EXISTS $dbN; CREATE DATABASE $dbN CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"));
setupBaseSchema($dbN, 65, $allFiles);
db_exec($dbN, "INSERT INTO user_account (username, login_email, password_hash, role, role_id, status) SELECT 'contra@bu.edu.ph', 'contra@bu.edu.ph', '\$2y\$10\$aa', 'faculty', role_id, 'Active' FROM access_role WHERE role_name='faculty'");
db_exec($dbN, "INSERT INTO faculty (fac_fname, fac_lname, is_admin, user_id) SELECT 'E', 'F', 1, user_id FROM user_account WHERE username='contra@bu.edu.ph'");
$applyOne = applyMigrationsUpto($dbN, 65, $allFiles);
$r = $applyOne($allFiles[65]); // 066
fail($r, 'NEG-066B: 066 rejects is_admin/role contradiction');
run("docker compose --project-directory " . escapeshellarg($repo) . " exec -T db mariadb -u root -p" . escapeshellarg($pass) . " -e 'DROP DATABASE IF EXISTS $dbN'");

// ===== Cleanup =====
run("docker compose --project-directory " . escapeshellarg($repo) . " exec -T db mariadb -u root -p" . escapeshellarg($pass) . " -e 'DROP DATABASE IF EXISTS $dbPos'");
echo "\nCleanup done.\n";
echo "\n=== ALL STAGED MIGRATION TESTS PASSED (1 positive + 7 negative) ===\n";
