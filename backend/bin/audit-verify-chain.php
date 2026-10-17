<?php

declare(strict_types=1);

/*
 * Read-only audit chain check (SEC-005, R10). Recomputes every event_mac from
 * the stored columns, checks previous_event_mac links, sequence continuity and
 * the audit_chain_head row. Never writes audit_events.
 *
 * The only write is the one-time baseline row 'audit_chain_verified_baseline':
 * on the first run (row not yet recorded) any break found is reported and
 * recorded as the starting point, and the run passes. Later runs fail only on
 * a break after that sequence. --strict never records and fails on any break
 * (used by the disposable test gate).
 *
 *   docker compose exec web php /var/www/html/backend/bin/audit-verify-chain.php [--strict]
 */

require_once __DIR__ . '/../app/bootstrap.php';

function audit_verify_event_from_row(array $r): array
{
    $ev = $r;
    foreach (['actor_user_id', 'session_id', 'scope_cs_id'] as $k) {
        $ev[$k] = $r[$k] === null ? null : (int) $r[$k];
    }
    return $ev;
}

/** @return array{events:int,last:int,breaks:list<array{0:int,1:string}>} */
function audit_verify_chain(PDO $pdo, string $macKey): array
{
    $own = !$pdo->inTransaction();
    if ($own) {
        $pdo->beginTransaction();
    }
    // Server-side cursor: libpq would otherwise buffer the whole table.
    $pdo->exec('DECLARE audit_verify_cur NO SCROLL CURSOR FOR SELECT * FROM audit_events ORDER BY sequence_number');
    $breaks = [];
    $events = 0;
    $expectSeq = 1;
    $prevMac = str_repeat("\0", 32);
    $last = 0;
    while (true) {
        $rows = $pdo->query('FETCH 500 FROM audit_verify_cur')->fetchAll(PDO::FETCH_ASSOC);
        if ($rows === []) {
            break;
        }
        foreach ($rows as $r) {
            $seq = (int) $r['sequence_number'];
            $events++;
            $last = $seq;
            if ($seq !== $expectSeq) {
                $breaks[] = [$seq, "sequence gap (expected $expectSeq)"];
            }
            $expectSeq = $seq + 1;
            $storedPrev = pdo_binary_value($r['previous_event_mac']);
            $storedMac = pdo_binary_value($r['event_mac']);
            $hashes = [];
            foreach (['before', 'after'] as $side) {
                $hash = pdo_binary_value($r["{$side}_state_hash"]);
                $json = $r["{$side}_state_json"];
                if ($json !== null && !hash_equals((string) $hash, hash('sha256', $json, true))) {
                    $breaks[] = [$seq, "$side state does not match its hash"];
                }
                $hashes[$side] = $hash;
            }
            if ($storedPrev !== $prevMac) {
                $breaks[] = [$seq, 'previous_event_mac does not match the previous event'];
            }
            try {
                $canonical = audit_build_canonical_event(
                    audit_verify_event_from_row($r), trim((string) $r['event_uuid']), $seq,
                    new DateTimeImmutable((string) $r['occurred_at'], new DateTimeZone('UTC')),
                    $hashes['before'], $hashes['after']
                )['canonical_bytes'];
                $expected = hash_hmac('sha256', $canonical . (string) $storedPrev, $macKey, true);
                if ((int) $r['mac_key_version'] !== 1 || (int) $r['canonical_schema_version'] !== 2
                    || !hash_equals($expected, (string) $storedMac)) {
                    $breaks[] = [$seq, 'event_mac does not match the event contents'];
                }
            } catch (Throwable $e) {
                $breaks[] = [$seq, 'event cannot be recomputed: ' . $e->getMessage()];
            }
            $prevMac = (string) $storedMac;
        }
    }
    $pdo->exec('CLOSE audit_verify_cur');
    $head = $pdo->query("SELECT setting_value FROM system_settings WHERE setting_key = 'audit_chain_head'")->fetchColumn();
    if ($own) {
        $pdo->commit();
    }
    $head = is_string($head) ? json_decode($head, true) : null;
    if (!is_array($head) || (int) ($head['latest_sequence'] ?? -1) !== $last
        || ($head['latest_mac'] ?? null) !== bin2hex($prevMac)) {
        $breaks[] = [$last, 'audit_chain_head does not match the last event'];
    }
    usort($breaks, static fn(array $a, array $b): int => $a[0] <=> $b[0]);

    return ['events' => $events, 'last' => $last, 'breaks' => $breaks];
}

if (PHP_SAPI === 'cli' && realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    $strict = in_array('--strict', $argv, true);
    $config = app_config();
    $pdo = create_pdo($config);
    $result = audit_verify_chain($pdo, config_key_bytes_at_least($config['audit']['mac_key_b64'], 32, 'AUDIT_MAC_KEY'));

    $baseline = ['accepted_break_sequence' => null, 'recorded_at' => null];
    if (!$strict) {
        $raw = $pdo->query("SELECT setting_value FROM system_settings WHERE setting_key = 'audit_chain_verified_baseline'")->fetchColumn();
        $baseline = is_string($raw) ? (json_decode($raw, true) ?: $baseline) : $baseline;
        if ($baseline['recorded_at'] === null && $raw !== false) {
            $accepted = $result['breaks'] === [] ? null : max(array_column($result['breaks'], 0));
            $pdo->prepare("UPDATE system_settings SET setting_value = CAST(? AS JSONB)
                           WHERE setting_key = 'audit_chain_verified_baseline'")
                ->execute([json_encode(['accepted_break_sequence' => $accepted, 'recorded_at' => gmdate('Y-m-d\TH:i:s\Z')])]);
            foreach ($result['breaks'] as [$s, $why]) {
                fwrite(STDOUT, "Baseline recorded, existing break at sequence $s: $why\n");
            }
            $baseline['accepted_break_sequence'] = $accepted;
        }
    }
    $limit = (int) ($baseline['accepted_break_sequence'] ?? 0);
    foreach ($result['breaks'] as [$s, $why]) {
        if ($s > $limit) {
            fwrite(STDOUT, "AUDIT CHAIN BROKEN at sequence $s: $why\n");
            exit(1);
        }
    }
    fwrite(STDOUT, "AUDIT CHAIN OK ({$result['events']} events, last sequence {$result['last']})\n");
}
