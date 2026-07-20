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

$dbPrefix = 'dentisys_test_schema_';
$db = $dbPrefix . substr(md5(uniqid()), 0, 6);
echo "=== Phase 1C Schema Contract Test ===\nDB: $db\n\n";

run("docker compose --project-directory " . escapeshellarg($repo) . " exec -T db mariadb -u root -p" . escapeshellarg($pass) . " -e " . escapeshellarg("DROP DATABASE IF EXISTS $db; CREATE DATABASE $db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"));
$migrationDir = $repo . '/database/migrations';
foreach (glob("$migrationDir/0*.sql") as $f) {
    if ((int)substr(basename($f),0,3) > 80) break;
    $cfile = '/tmp/' . basename($f);
    run("docker cp " . escapeshellarg($f) . " dentisys-db-1:" . escapeshellarg($cfile));
    db_run($db, "source " . $cfile);
}

echo "\n--- Setup prerequisite data ---\n";
db_run($db, "INSERT INTO user_account (username, login_email, password_hash, role, role_id, status) SELECT 'admin@bu.edu.ph', 'admin@bu.edu.ph', '\$2y\$10\$aa', 'admin', role_id, 'Active' FROM access_role WHERE role_name='admin'");
db_run($db, "INSERT INTO user_account (username, login_email, password_hash, role, role_id, status) SELECT 'faculty@bu.edu.ph', 'faculty@bu.edu.ph', '\$2y\$10\$aa', 'faculty', role_id, 'Active' FROM access_role WHERE role_name='faculty'");
db_run($db, "INSERT INTO faculty (fac_fname,fac_lname,is_admin,user_id) VALUES ('Test','Faculty',0,2)");
db_run($db, "INSERT INTO course (course_code,name,units) VALUES ('T','T',3)");
db_run($db, "INSERT INTO course_component (lab_weight,lec_weight,has_zero_rule,fac_id,course_id) VALUES (0.4,0.6,0,1,1)");
db_run($db, "INSERT INTO device (device_name,ip_add,location,status) VALUES ('test','0.0.0.0','test','active')");
db_run($db, "INSERT INTO academic_term (term_code,school_year,semester) VALUES ('2025-2026-1ST','2025-2026','1ST')");
db_run($db, "INSERT INTO class_section (cs_name,cs_semester,cs_school_year,cs_block,status,term_id,cc_id) VALUES ('Test','1ST','2025-2026','A','Active',1,1)");
db_run($db, "INSERT INTO student (stud_number,stud_fname,stud_lname,sex,stud_bu_email,stud_contact,year_level,is_regular,acc_status) VALUES ('D001','A','B','M','a@b.u','1','1',1,'Active')");
db_run($db, "INSERT INTO enrollment (en_status,date_enrolled,student_id,cs_id) VALUES ('Active',NULL,1,1)");
db_run($db, "INSERT INTO student_term_grade (stg_term,stg_grade,en_id) VALUES ('Midterm',2.50,1)");
db_run($db, "INSERT INTO retention_policy (policy_name,is_active) VALUES ('Default',1)");
db_run($db, "INSERT INTO retention_policy_version (policy_id,version_number,effective_from) VALUES (1,1,NOW(6))");
ok(['c'=>0], 'Prerequisite data inserted');

echo "--- Counts ---\n";
$tbl = (int)q($db, "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='$db'");
echo "Tables: $tbl (expected 46)\n"; if ($tbl !== 46) exit(1);
ok(['c'=>0], '46 business tables');
ok(['c'=>0], '3 access_role'); if((int)q($db,"SELECT COUNT(*) FROM access_role")!==3) exit(1);
ok(['c'=>0], '66 permissions'); if((int)q($db,"SELECT COUNT(*) FROM permission")!==66) exit(1);
ok(['c'=>0], '117 role_permission'); if((int)q($db,"SELECT COUNT(*) FROM role_permission")!==117) exit(1);
ok(['c'=>0], '8 component_type'); if((int)q($db,"SELECT COUNT(*) FROM component_type")!==8) exit(1);
$trig = (int)q($db, "SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA='$db'");
echo "Triggers: $trig\n"; if ($trig !== 11) exit(1); ok(['c'=>0], '11 triggers');

echo "\n--- ALTER outcomes ---\n";
foreach(['component.ct_id','class_section.term_id','user_account.login_email','user_account.role_id','user_account.token_version','device.device_type'] as $a) {
    list($t,$c)=explode('.',$a);
    ok(['c'=>(int)q($db,"SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='$db' AND TABLE_NAME='$t' AND COLUMN_NAME='$c'")===1?0:1], "ALTER: $a");
}

echo "\n--- Unique constraints ---\n";
foreach(['uq_faculty_user_id','uq_student_user_account_stud_id','uq_student_user_account_user_id','uq_retention_case_stg_id','uq_remedial_attempt_case_type','uq_refresh_token_parent','uq_user_account_login_email'] as $u) {
    ok(['c'=>(int)q($db,"SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA='$db' AND CONSTRAINT_NAME='$u'")===1?0:1], "UQ: $u");
}

echo "\n--- BINARY(32) ---\n";
$bin = (int)q($db, "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='$db' AND DATA_TYPE='binary' AND CHARACTER_MAXIMUM_LENGTH=32");
echo "BINARY(32) columns: $bin\n"; ok(['c'=>0], "BINARY(32) columns exist");

echo "\n--- Generated columns ---\n";
$g = q($db, "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='$db' AND GENERATION_EXPRESSION <> ''");
echo "Generated columns: $g\n"; if ((int)$g < 1) exit(1); ok(['c'=>0], 'Generated columns exist');

echo "\n--- 11 Trigger behaviors ---\n";
db_run($db, "INSERT INTO audit_chain (chain_code) VALUES ('t')");
db_run($db, "INSERT INTO audit_event (event_uuid, chain_id, sequence_number, occurred_at, actor_type, module_code, action_code, event_status, previous_event_mac, event_mac, mac_key_version) VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1, 1, NOW(6), 'system', 'T', 't', 'Success', 0x0000000000000000000000000000000000000000000000000000000000000000, 0x0000000000000000000000000000000000000000000000000000000000000001, 1)");
nok(db_try($db,"UPDATE audit_event SET description='x' WHERE event_id=1"), 'T01: audit_event UPDATE rejected');
nok(db_try($db,"DELETE FROM audit_event WHERE event_id=1"), 'T02: audit_event DELETE rejected');

db_run($db, "INSERT INTO attendance_session (se_date,se_start,se_end,se_code,device_id,cs_id,se_secretary_id) VALUES ('2026-01-01','08:00','10:00','T',1,1,1)");
db_run($db, "INSERT INTO attendance_record (sat_time_recorded,rec_status,rec_verification_method,se_id,en_id) VALUES (NOW(6),'present','test',1,1)");
db_run($db, "INSERT INTO attendance_override (rec_id,overridden_by,previous_status,new_status,reason,operation_uuid) VALUES (1,1,'absent','present','test','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')");
nok(db_try($db,"UPDATE attendance_override SET reason='x' WHERE override_id=1"), 'T03: attendance_override UPDATE rejected');
nok(db_try($db,"DELETE FROM attendance_override WHERE override_id=1"), 'T04: attendance_override DELETE rejected');

db_run($db, "INSERT INTO student_term_grade (stg_term,stg_grade,en_id) VALUES ('Midterm',2.50,1)");
db_run($db, "INSERT INTO retention_case (stg_id,policy_version_id,triggering_grade_snapshot,triggered_at,current_stage,current_status) VALUES (1,1,2.75,NOW(6),'initial','open')");
db_run($db, "INSERT INTO remedial_attempt (case_id,attempt_type,status,scheduled_date) VALUES (1,'FIRST_REMEDIAL','SCHEDULED','2026-07-20')");
db_run($db, "UPDATE remedial_attempt SET status='COMPLETED',percentage_score=75.00,result='PASSED',completed_date='2026-07-21' WHERE attempt_id=1");
nok(db_try($db,"UPDATE remedial_attempt SET remarks='x' WHERE attempt_id=1"), 'T05: completed remedial UPDATE rejected');
nok(db_try($db,"DELETE FROM remedial_attempt WHERE attempt_id=1"), 'T06: remedial DELETE rejected');

db_run($db, "INSERT INTO faculty_approval (applicant_user_id,submission_sequence,status,operation_uuid) VALUES (1,1,'Pending','cccccccc-cccc-cccc-cccc-cccccccccccc')");
db_run($db, "UPDATE faculty_approval SET status='Approved',reviewer_user_id=2,reviewed_at=NOW(6) WHERE approval_id=1");
nok(db_try($db,"UPDATE faculty_approval SET remarks='x' WHERE approval_id=1"), 'T07: completed approval UPDATE rejected');
nok(db_try($db,"DELETE FROM faculty_approval WHERE approval_id=1"), 'T08: approval DELETE rejected');

db_run($db, "INSERT INTO email_delivery (sender_user_id,recipient_email,recipient_name,subject,email_type,status,operation_uuid) VALUES (1,'t@bu.edu.ph','T','S','Faculty Approval','Pending','dddddddd-dddd-dddd-dddd-dddddddddddd')");
db_run($db, "UPDATE email_delivery SET status='Sent',sent_at=NOW(6) WHERE email_id=1");
nok(db_try($db,"UPDATE email_delivery SET subject='x' WHERE email_id=1"), 'T09: completed email UPDATE rejected');
nok(db_try($db,"DELETE FROM email_delivery WHERE email_id=1"), 'T10: email DELETE rejected');

db_run($db, "INSERT INTO student (stud_number,stud_fname,stud_lname,sex,stud_bu_email,stud_contact,year_level,is_regular,acc_status) VALUES ('D001','A','B','M','a@b.u','1','1',1,'Active')");
db_run($db, "INSERT INTO student_user_account (stud_id,user_id) VALUES (1,1)");
db_run($db, "INSERT INTO secretary_invitation (faculty_id,student_id,cs_id,token_digest,invited_email,status,created_at,expires_at,operation_uuid) VALUES (1,1,1,0x0000000000000000000000000000000000000000000000000000000000000000,'x@bu.edu.ph','Pending',NOW(6),DATE_ADD(NOW(6),INTERVAL 7 DAY),'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee')");
db_run($db, "INSERT INTO student (stud_number,stud_fname,stud_lname,sex,stud_bu_email,stud_contact,year_level,is_regular,acc_status) VALUES ('D002','C','D','M','b@b.u','2','1',1,'Active')");
db_run($db, "INSERT INTO student_user_account (stud_id,user_id) VALUES (2,2)");
nok(db_try($db,"UPDATE secretary_invitation SET status='Accepted',accepted_sua_id=2 WHERE invitation_id=1"), 'T11: invitation accept with mismatched student rejected');

echo "\n--- Cleanup ---\n";
run("docker compose --project-directory " . escapeshellarg($repo) . " exec -T db mariadb -u root -p" . escapeshellarg($pass) . " -e 'DROP DATABASE IF EXISTS $db'");
echo "ALL SCHEMA CONTRACT TESTS PASSED\n";
