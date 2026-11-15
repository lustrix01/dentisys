<?php

declare(strict_types=1);

// Backlog 12.2 / BIO-009: face enrolment flags (docs/contracts/face-reenrolment.md). A flag only informs the Dean; nothing here blocks anyone.
// detail holds dates only. The sidecar's cosine score never reaches PHP, only matched yes/no.

const FACE_FLAG_PAGE_SIZE = 50;
const FACE_FLAG_WITHDRAWAL_DAYS = 30;
const FACE_FLAG_SYSTEM_ACTOR = ['user_id' => null, 'login_email' => null, 'role' => 'system', 'display_name' => 'System', 'session_id' => null];

/** Raises F1 or F2, or refreshes the Student's open flag of that kind. Needs the caller's transaction. */
function face_flag_raise(PDO $pdo, array $config, array $context, int $studentId, string $kind, array $detail): void
{
    $stmt = $pdo->prepare("SELECT flag_id FROM face_enrolment_flags WHERE student_id = ? AND kind = ? AND status = 'open' ORDER BY flag_id DESC LIMIT 1 FOR UPDATE");
    $stmt->execute([$studentId, $kind]);
    $flagId = $stmt->fetchColumn();
    $json = json_encode($detail, JSON_UNESCAPED_SLASHES);
    if ($flagId === false) {
        $pdo->prepare('INSERT INTO face_enrolment_flags (student_id, kind, detail) VALUES (?, ?, CAST(? AS JSONB))')->execute([$studentId, $kind, $json]);
    } else {
        $pdo->prepare('UPDATE face_enrolment_flags SET detail = CAST(? AS JSONB), updated_at = CURRENT_TIMESTAMP WHERE flag_id = ?')->execute([$json, (int) $flagId]);
    }
    student_biometric_record_audit(
        $pdo, $config, FACE_FLAG_SYSTEM_ACTOR, $context, 'face_flag_raised', $studentId,
        $kind === 'F1' ? 'Face enrolled again within 30 days after the Student withdrew consent.' : 'Re-enrolled face does not match the face it replaced.',
        null, null, ['kind' => $kind] + $detail
    );
}

/**
 * After a successful enrolment, inside its transaction. $before is the profile row from before the enrolment started,
 * $matchesPrevious the sidecar's yes/no (null when no previous face was compared). Never throws: a failure here must not block the enrolment.
 */
function face_flags_after_enrolment(PDO $pdo, array $config, array $context, int $studentId, array $before, ?bool $matchesPrevious, DateTimeImmutable $now): void
{
    $pdo->exec('SAVEPOINT face_flags');
    try {
        $enrolledAt = audit_manila_iso($now->format('Y-m-d H:i:s.u'));
        if ($before['protected_object_reference'] !== null) {
            if ($matchesPrevious === false) face_flag_raise($pdo, $config, $context, $studentId, 'F2', ['enrolledAt' => $enrolledAt]);
        } elseif ($before['enrolled_at'] !== null) {
            // F1: the Student's own withdrawal is the latest face deletion, and it was within 30 days. A Dean revoke (or the inactive sweep) raises nothing.
            // Read from the audit trail because re-granting consent clears biometric_profiles.revoked_at.
            $stmt = $pdo->prepare("SELECT action_code, occurred_at FROM audit_events WHERE target_type = 'student_biometric_profile' AND target_id = ?
                AND action_code IN ('biometric_consent_revoked', 'biometric_enrollment_revoked', 'biometric_enrollment_revoked_by_dean', 'biometric_enrollment_revoked_inactive')
                ORDER BY event_id DESC LIMIT 1");
            $stmt->execute([(string) $studentId]);
            $last = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($last !== false && in_array($last['action_code'], ['biometric_consent_revoked', 'biometric_enrollment_revoked'], true)) {
                $withdrawn = new DateTimeImmutable((string) $last['occurred_at'], new DateTimeZone('UTC'));
                if ($withdrawn >= $now->modify('-' . FACE_FLAG_WITHDRAWAL_DAYS . ' days')) {
                    face_flag_raise($pdo, $config, $context, $studentId, 'F1', ['withdrawnAt' => audit_manila_iso((string) $last['occurred_at']), 'enrolledAt' => $enrolledAt]);
                }
            }
        }
        $pdo->exec('RELEASE SAVEPOINT face_flags');
    } catch (Throwable $e) {
        $pdo->exec('ROLLBACK TO SAVEPOINT face_flags');
        error_log('Face enrolment flag skipped: ' . sanitize_for_log($e));
    }
}

/** The Dean's revoke closes the Student's open flags as revoked. Needs the caller's transaction. */
function face_flags_close_for_revoke(PDO $pdo, int $studentId, ?int $userId): void
{
    $pdo->prepare("UPDATE face_enrolment_flags SET status = 'revoked', closed_at = CURRENT_TIMESTAMP, closed_by_user_id = ?, updated_at = CURRENT_TIMESTAMP
        WHERE student_id = ? AND status = 'open'")->execute([$userId, $studentId]);
}

function face_flags_open_count(PDO $pdo): int
{
    return (int) $pdo->query("SELECT COUNT(*) FROM face_enrolment_flags WHERE status = 'open'")->fetchColumn();
}

/** Page of flags, newest update first. $f: status, kind, q, courseId, classId. $onlyFlagId is for an action's answer. */
function face_flags_list(PDO $pdo, array $f, int $page, ?int $onlyFlagId = null): array
{
    $cur = academic_current_school_year($pdo);
    $where = [];
    $params = [];
    if (($f['status'] ?? 'open') !== 'all') {
        $where[] = 'f.status = ?';
        $params[] = $f['status'] ?? 'open';
    }
    if (isset($f['kind'])) {
        $where[] = 'f.kind = ?';
        $params[] = $f['kind'];
    }
    if (($f['q'] ?? '') !== '') {
        $like = '%' . addcslashes($f['q'], '\\%_') . '%';
        $where[] = "(COALESCE(ua.display_name, s.first_name || ' ' || s.last_name) ILIKE ? OR s.student_number ILIKE ? OR ua.login_email ILIKE ?)";
        array_push($params, $like, $like, $like);
    }
    if ($onlyFlagId !== null) {
        $where[] = 'f.flag_id = ?';
        $params[] = $onlyFlagId;
    }
    foreach (['courseId' => 'c.course_id', 'classId' => 'c.cs_id'] as $key => $col) {
        if (!isset($f[$key])) continue;
        $where[] = "EXISTS (SELECT 1 FROM enrollments e JOIN class_sections c ON c.cs_id = e.cs_id WHERE e.student_id = s.student_id AND e.status = 'Active' AND {$col} = ? AND c.school_year = ? AND c.archived_at IS NULL)";
        array_push($params, $f[$key], $cur);
    }
    $from = 'FROM face_enrolment_flags f JOIN students s ON s.student_id = f.student_id
        LEFT JOIN user_accounts ua ON ua.user_id = s.student_account_user_id LEFT JOIN user_accounts cu ON cu.user_id = f.closed_by_user_id'
        . ($where === [] ? '' : ' WHERE ' . implode(' AND ', $where));
    $total = $pdo->prepare("SELECT COUNT(*) {$from}");
    $total->execute($params);
    $stmt = $pdo->prepare("SELECT f.flag_id, f.kind, f.status, f.detail, f.created_at, f.updated_at, f.closed_at, f.closed_note, cu.display_name AS closed_by_name,
        s.student_id, s.student_number, ua.user_id AS account_user_id, COALESCE(ua.display_name, s.first_name || ' ' || s.last_name) AS student_name
        {$from} ORDER BY f.updated_at DESC, f.flag_id DESC LIMIT " . FACE_FLAG_PAGE_SIZE . ' OFFSET ' . (($page - 1) * FACE_FLAG_PAGE_SIZE));
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    $classes = [];
    if ($rows !== []) {
        $ids = '{' . implode(',', array_map(static fn(array $r): int => (int) $r['student_id'], $rows)) . '}';
        $cstmt = $pdo->prepare("SELECT e.student_id, cs.cs_id, cs.cs_name FROM enrollments e JOIN class_sections cs ON cs.cs_id = e.cs_id
            WHERE e.student_id = ANY (CAST(? AS INTEGER[])) AND e.status = 'Active' AND cs.school_year = ? AND cs.archived_at IS NULL ORDER BY cs.cs_name, cs.cs_id");
        $cstmt->execute([$ids, $cur]);
        foreach ($cstmt->fetchAll(PDO::FETCH_ASSOC) as $c) $classes[(int) $c['student_id']][] = ['csId' => (int) $c['cs_id'], 'label' => $c['cs_name'], 'current' => true];
    }
    $iso = static fn(?string $v): ?string => $v === null ? null : audit_manila_iso($v);
    return ['flags' => array_map(static fn(array $r): array => [
        'flagId' => (int) $r['flag_id'], 'kind' => $r['kind'], 'status' => $r['status'],
        'student' => ['studentId' => (int) $r['student_id'], 'userId' => $r['account_user_id'] === null ? null : (int) $r['account_user_id'],
            'name' => $r['student_name'], 'studentNo' => $r['student_number']],
        'classes' => $classes[(int) $r['student_id']] ?? [],
        'detail' => json_decode((string) $r['detail'], true) ?: new stdClass(),
        'createdAt' => $iso($r['created_at']), 'updatedAt' => $iso($r['updated_at']), 'closedAt' => $iso($r['closed_at']),
        'closedBy' => $r['closed_by_name'] === null ? null : ['name' => $r['closed_by_name']], 'closedNote' => $r['closed_note'],
    ], $rows), 'total' => (int) $total->fetchColumn(), 'page' => $page, 'pageSize' => FACE_FLAG_PAGE_SIZE];
}

/** The Dean dismisses an open flag with a note. Needs the caller's transaction. */
function face_flag_dismiss(PDO $pdo, array $config, array $actor, array $data): array
{
    $note = validate_required_string($data, 'note', 8, 240);
    $flagId = filter_var($data['flagId'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
    if ($flagId === false) throw new ValidationException([['field' => 'flagId', 'message' => 'A valid flag is required.']]);
    $stmt = $pdo->prepare('SELECT student_id, kind, status FROM face_enrolment_flags WHERE flag_id = ? FOR UPDATE');
    $stmt->execute([$flagId]);
    $flag = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($flag === false) throw new SuperadminConflict('flag_not_found', 'Flag not found.', [], 404);
    if ($flag['status'] !== 'open') throw new SuperadminConflict('flag_closed', 'This flag is already closed.');
    $pdo->prepare("UPDATE face_enrolment_flags SET status = 'dismissed', closed_at = CURRENT_TIMESTAMP, closed_by_user_id = ?, closed_note = ?, updated_at = CURRENT_TIMESTAMP WHERE flag_id = ?")
        ->execute([$actor['user_id'] ?? null, $note, $flagId]);
    audit_record_action($pdo, $config, $actor, 'student_biometric', 'face_flag_dismissed', 'student_biometric_profile', (string) $flag['student_id'],
        'The Dean dismissed a face enrolment flag (' . $flag['kind'] . ').', ['reason' => $note]);
    return ['flag' => face_flags_list($pdo, ['status' => 'all'], 1, $flagId)['flags'][0]];
}
