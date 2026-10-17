<?php

declare(strict_types=1);
require_once __DIR__ . '/../../backend/bin/audit-verify-chain.php';
// Included by the full disposable PostgreSQL suite. Tampering happens only
// on a temporary copy inside a transaction that is rolled back.
$chainKey = base64_decode(getenv('AUDIT_MAC_KEY_B64') ?: 'ZGVudGlzeXMtZGV2LWF1ZGl0LW1hYy1rZXktMzJiaXQ=', true);
$chainFirst = null;
for ($i = 1; $i <= 3; $i++) {
    $pdo->beginTransaction();
    $written = audit_finish_operation($pdo, audit_begin_operation($pdo), [
        'module_code' => 'integration', 'action_code' => 'chain_check', 'event_status' => 'Success',
        'description' => "Chain check event $i.", 'target_type' => 'test', 'target_id' => (string) $i,
    ], $chainKey, ['n' => $i], ['n' => $i + 1]);
    $pdo->commit();
    $chainFirst ??= $written['sequence_number'];
}
$chainClean = audit_verify_chain($pdo, $chainKey);
expect_same([], $chainClean['breaks'], 'Audit chain verifies clean after the suite');
expect_true($chainClean['events'] >= 3 && $chainClean['last'] >= $chainFirst + 2, 'Verifier walks every event');

$pdo->beginTransaction();
// A temp copy shadows the append-only table for this session, so the trigger never fires.
$pdo->exec('CREATE TEMP TABLE audit_events ON COMMIT DROP AS SELECT * FROM public.audit_events');
$pdo->prepare("UPDATE audit_events SET description = 'tampered' WHERE sequence_number = ?")->execute([$chainFirst + 1]);
$chainBroken = audit_verify_chain($pdo, $chainKey);
$pdo->rollBack();
expect_same($chainFirst + 1, $chainBroken['breaks'][0][0] ?? null, 'Verifier reports the first tampered event');
expect_same([], audit_verify_chain($pdo, $chainKey)['breaks'], 'Rolled-back tampering leaves the chain clean');
echo "PASS: Audit chain check coverage completed.\n";
