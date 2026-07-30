<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/app/config.php';
require_once dirname(__DIR__) . '/app/database.php';
require_once dirname(__DIR__) . '/app/validation.php';

$apply = in_array('--apply', $argv, true);
$dryRun = in_array('--dry-run', $argv, true) || !$apply;

$pdo = create_pdo(app_config());

$queries = [
    'secretary_user' => "SELECT user_id, login_email, role, display_name, title, status
                           FROM user_accounts WHERE user_id = 9 AND role = 'secretary'",
    'linked_students' => "SELECT * FROM students WHERE student_id IN (10, 24) OR user_id = 9",
    'secretary_sections' => "SELECT * FROM class_sections WHERE cs_id IN (7, 8) OR secretary_user_id = 9",
    'secretary_attendance' => "SELECT r.* FROM attendance_records r WHERE r.secretary_user_id = 9",
    'seed_biometrics' => "SELECT * FROM biometric_profiles WHERE template_reference LIKE 'facenet_v2_vector_%' OR image_references LIKE '%/uploads/faces/student_%'",
    'seed_email' => "SELECT * FROM email_outbox WHERE operation_uuid LIKE 'e0000000-0000-4000-8000-%' AND recipient_email LIKE 'student\\_%@bicol-u.edu.ph' AND subject = 'Official Academic Notice - DentiSys'",
    'seed_audit' => "SELECT * FROM audit_events WHERE event_uuid LIKE 'a0000000-0000-4000-8000-%' AND request_id LIKE 'req-%' AND user_agent = 'Mozilla/5.0 DentiSys Client'",
    'active_students' => "SELECT student_id, first_name, middle_name, last_name FROM students WHERE status = 'active'",
    'active_users' => "SELECT user_id, display_name FROM user_accounts WHERE status = 'Active'",
];

$snapshot = [];
foreach ($queries as $key => $sql) {
    $snapshot[$key] = $pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC);
}

$fixtureAuditCount = count($snapshot['seed_audit']);
$totalAuditCount = (int) $pdo->query('SELECT COUNT(*) FROM audit_events')->fetchColumn();
$mixedAuditHistory = $fixtureAuditCount > 0 && $fixtureAuditCount !== $totalAuditCount;
if ($apply && $mixedAuditHistory) {
    fwrite(STDERR, "Repair aborted: fixture audit rows are mixed with runtime audit history.\n");
    exit(2);
}

$nameChanges = [];
foreach ($snapshot['active_students'] as $student) {
    foreach (['first_name', 'middle_name', 'last_name'] as $field) {
        $current = (string) ($student[$field] ?? '');
        if ($current === '') continue;
        $normalized = normalize_person_name($current);
        if ($normalized !== $current) {
            $nameChanges[] = [
                'table' => 'students',
                'id' => (int) $student['student_id'],
                'field' => $field,
                'before' => $current,
                'after' => $normalized,
            ];
        }
    }
}
foreach ($snapshot['active_users'] as $user) {
    $current = (string) $user['display_name'];
    if (!preg_match("/^[\p{L}\p{M} .'\x{2019}-]+$/u", $current)) {
        continue;
    }
    $normalized = normalize_person_name($current);
    if ($normalized !== $current) {
        $nameChanges[] = [
            'table' => 'user_accounts',
            'id' => (int) $user['user_id'],
            'field' => 'display_name',
            'before' => $current,
            'after' => $normalized,
        ];
    }
}

$report = [
    'mode' => $dryRun ? 'dry-run' : 'apply',
    'generated_at' => gmdate(DATE_ATOM),
    'affected_row_counts' => array_map('count', $snapshot),
    'name_changes' => $nameChanges,
    'notes' => [
        'Only deterministic seed fingerprints are eligible for deletion.',
        'Historical audit and sent-email snapshots are not name-normalized.',
        'Mixed fixture/runtime audit history causes an abort before mutation.',
    ],
    'blocked_reason' => $mixedAuditHistory
        ? 'Fixture audit rows are mixed with runtime history; verify and rebuild the chain before applying.'
        : null,
];

if ($dryRun) {
    echo json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
    exit(0);
}

$localDataRoot = getenv('LOCALAPPDATA');
$backupRoot = is_string($localDataRoot) && $localDataRoot !== ''
    ? $localDataRoot
    : sys_get_temp_dir();
$backupDir = rtrim($backupRoot, DIRECTORY_SEPARATOR)
    . DIRECTORY_SEPARATOR . 'DentiSys'
    . DIRECTORY_SEPARATOR . 'maintenance-backups';
if (!is_dir($backupDir) && !mkdir($backupDir, 0700, true) && !is_dir($backupDir)) {
    throw new RuntimeException('Unable to create maintenance backup directory.');
}
$backupPath = $backupDir . '/dentisys-repair-' . gmdate('Ymd-His') . '.json';
if (file_put_contents(
    $backupPath,
    json_encode(['report' => $report, 'rows' => $snapshot], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE),
    LOCK_EX,
) === false) {
    throw new RuntimeException('Unable to write the maintenance backup.');
}
@chmod($backupPath, 0600);

$pdo->beginTransaction();
try {
    $pdo->exec(
        "UPDATE user_accounts
            SET display_name = 'Bea Alonzo',
                login_email = 'secretary@bicol-u.edu.ph',
                title = 'Class Secretary - CLINIC-4B'
          WHERE user_id = 9 AND role = 'secretary'"
    );
    $pdo->exec("UPDATE students SET user_id = NULL WHERE student_id = 10 AND user_id = 9");
    $pdo->exec(
        "UPDATE students
            SET first_name = 'Bea', middle_name = NULL, last_name = 'Alonzo',
                bu_email = 'secretary@bicol-u.edu.ph', user_id = 9
          WHERE student_id = 24 AND student_number = '2024-DENT-0024'"
    );
    $pdo->exec("UPDATE class_sections SET secretary_user_id = NULL WHERE cs_id = 7 AND secretary_user_id = 9");
    $pdo->exec("UPDATE class_sections SET secretary_user_id = 9 WHERE cs_id = 8 AND cs_name = 'CLINIC-4B'");
    $pdo->exec(
        "UPDATE attendance_records r
          JOIN enrollments e ON e.enrollment_id = r.enrollment_id
            SET r.secretary_user_id = NULL
          WHERE r.secretary_user_id = 9 AND e.cs_id <> 8"
    );
    $pdo->exec(
        "UPDATE biometric_profiles
            SET face_enrolled = 0, template_reference = NULL,
                image_references = NULL, enrolled_at = NULL
          WHERE template_reference LIKE 'facenet_v2_vector_%'
             OR image_references LIKE '%/uploads/faces/student_%'"
    );
    $pdo->exec(
        "DELETE FROM email_outbox
          WHERE operation_uuid LIKE 'e0000000-0000-4000-8000-%'
            AND recipient_email LIKE 'student\\_%@bicol-u.edu.ph'
            AND subject = 'Official Academic Notice - DentiSys'"
    );
    $deviceUpdate = $pdo->prepare(
        "UPDATE system_settings
            SET setting_value = ?, description = ?
          WHERE setting_key = 'devices'"
    );
    $deviceUpdate->execute([
        json_encode(['configured' => false, 'registry' => []], JSON_THROW_ON_ERROR),
        'Optional device registry. No CCTV or biometric integration is configured by default.',
    ]);

    foreach ($nameChanges as $change) {
        $table = $change['table'];
        $field = $change['field'];
        $idField = $table === 'students' ? 'student_id' : 'user_id';
        $stmt = $pdo->prepare("UPDATE {$table} SET {$field} = ? WHERE {$idField} = ?");
        $stmt->execute([$change['after'], $change['id']]);
    }
    $pdo->commit();
} catch (Throwable $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    throw $error;
}

if ($fixtureAuditCount > 0) {
    $pdo->exec('DROP TRIGGER IF EXISTS trg_audit_events_no_update');
    $pdo->exec('DROP TRIGGER IF EXISTS trg_audit_events_no_delete');
    try {
        $pdo->exec(
            "DELETE FROM audit_events
              WHERE event_uuid LIKE 'a0000000-0000-4000-8000-%'
                AND request_id LIKE 'req-%'
                AND user_agent = 'Mozilla/5.0 DentiSys Client'"
        );
        $head = $pdo->prepare(
            "UPDATE system_settings SET setting_value = ?
              WHERE setting_key = 'audit_chain_head' AND is_internal = 1"
        );
        $head->execute([
            json_encode([
                'latest_sequence' => 0,
                'latest_mac' => str_repeat('0', 64),
            ], JSON_THROW_ON_ERROR),
        ]);
    } finally {
        $pdo->exec(
            "CREATE TRIGGER trg_audit_events_no_update
             BEFORE UPDATE ON audit_events FOR EACH ROW
             SIGNAL SQLSTATE '45000'
             SET MESSAGE_TEXT = 'audit_events is append-only; UPDATE is not permitted'"
        );
        $pdo->exec(
            "CREATE TRIGGER trg_audit_events_no_delete
             BEFORE DELETE ON audit_events FOR EACH ROW
             SIGNAL SQLSTATE '45000'
             SET MESSAGE_TEXT = 'audit_events is append-only; DELETE is not permitted'"
        );
    }
}

echo json_encode([
    'status' => 'ok',
    'backup' => $backupPath,
    'report' => $report,
], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
