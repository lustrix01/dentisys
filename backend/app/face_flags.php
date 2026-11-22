<?php

declare(strict_types=1);

// Backlog 12.2 / BIO-009: face enrolment flags (docs/contracts/face-reenrolment.md). A flag only informs the Dean; nothing here blocks anyone.
// detail holds dates only. The sidecar's cosine score never reaches PHP, only matched yes/no.

const FACE_FLAG_PAGE_SIZE = 50;
const FACE_FLAG_WITHDRAWAL_DAYS = 30;
const FACE_FLAG_SYSTEM_ACTOR = ['user_id' => null, 'login_email' => null, 'role' => 'system', 'display_name' => 'System', 'session_id' => null];

/** Raises F1, F2, or F3, or refreshes the Student's open flag of that kind. Needs the caller's transaction. */
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
    $description = match ($kind) {
        'F1' => 'Face enrolled again within 30 days after the Student withdrew consent.',
        'F2' => 'Update my face attempt did not match the current registered face.',
        'F3' => 'Student reached 3 or more approved face revocation requests in the same term.',
        default => 'Face enrollment flagged.',
    };
    student_biometric_record_audit(
        $pdo, $config, FACE_FLAG_SYSTEM_ACTOR, $context, 'face_flag_raised', $studentId,
        $description,
        null, null, ['kind' => $kind] + $detail
    );
}

/**
 * After a face update attempt or enrolment, inside its transaction. $before is the profile row from before the attempt started,
 * $matchesPrevious the sidecar's yes/no (null when no previous face was compared). Never throws: a failure here must not block the caller.
 */
function face_flags_after_enrolment(PDO $pdo, array $config, array $context, int $studentId, array $before, ?bool $matchesPrevious, DateTimeImmutable $now): void
{
    $pdo->exec('SAVEPOINT face_flags');
    try {
        $attemptedAt = audit_manila_iso($now->format('Y-m-d H:i:s.u'));
        if ($before['protected_object_reference'] !== null && $matchesPrevious === false) {
            face_flag_raise($pdo, $config, $context, $studentId, 'F2', ['attemptedAt' => $attemptedAt]);
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
    ], $rows), 'total' => (int) $total->fetchColumn(), 'page' => $page, 'pageSize' => FACE_FLAG_PAGE_SIZE, 'openCount' => face_flags_open_count($pdo)];
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

function face_revoke_requests_pending_count(PDO $pdo): int
{
    return (int) $pdo->query("SELECT COUNT(*) FROM face_revoke_requests WHERE status = 'pending'")->fetchColumn();
}

/** Page of Student face revocation requests, newest first. $f: status, q, courseId, classId. */
function face_revoke_requests_list(PDO $pdo, array $f, int $page, ?int $onlyRequestId = null): array
{
    $cur = academic_current_school_year($pdo);
    $where = [];
    $params = [];
    if (($f['status'] ?? 'pending') !== 'all') {
        $where[] = 'r.status = ?';
        $params[] = $f['status'] ?? 'pending';
    }
    if (($f['q'] ?? '') !== '') {
        $like = '%' . addcslashes($f['q'], '\\%_') . '%';
        $where[] = "(COALESCE(ua.display_name, s.first_name || ' ' || s.last_name) ILIKE ? OR s.student_number ILIKE ? OR ua.login_email ILIKE ?)";
        array_push($params, $like, $like, $like);
    }
    if ($onlyRequestId !== null) {
        $where[] = 'r.request_id = ?';
        $params[] = $onlyRequestId;
    }
    foreach (['courseId' => 'c.course_id', 'classId' => 'c.cs_id'] as $key => $col) {
        if (!isset($f[$key])) continue;
        $where[] = "EXISTS (SELECT 1 FROM enrollments e JOIN class_sections c ON c.cs_id = e.cs_id WHERE e.student_id = s.student_id AND e.status = 'Active' AND {$col} = ? AND c.school_year = ? AND c.archived_at IS NULL)";
        array_push($params, $f[$key], $cur);
    }
    $from = 'FROM face_revoke_requests r JOIN students s ON s.student_id = r.student_id
        LEFT JOIN user_accounts ua ON ua.user_id = COALESCE(s.student_account_user_id, s.user_id)
        LEFT JOIN user_accounts ru ON ru.user_id = r.reviewed_by_user_id'
        . ($where === [] ? '' : ' WHERE ' . implode(' AND ', $where));
    $total = $pdo->prepare("SELECT COUNT(*) {$from}");
    $total->execute($params);
    $stmt = $pdo->prepare(
        "SELECT r.request_id, r.status, r.reason, r.review_note, r.school_year, r.semester,
                r.created_at, r.reviewed_at, r.cancelled_at, ru.display_name AS reviewed_by_name,
                s.student_id, s.student_number, ua.user_id AS account_user_id,
                COALESCE(ua.display_name, s.first_name || ' ' || s.last_name) AS student_name,
                (SELECT COUNT(*) FROM face_revoke_requests ar
                  WHERE ar.student_id = r.student_id
                    AND ar.school_year = r.school_year
                    AND ar.semester = r.semester
                    AND ar.status = 'approved') AS approved_this_term_count
           {$from}
          ORDER BY r.created_at DESC, r.request_id DESC
          LIMIT " . FACE_FLAG_PAGE_SIZE . ' OFFSET ' . (($page - 1) * FACE_FLAG_PAGE_SIZE)
    );
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    $classes = [];
    if ($rows !== []) {
        $ids = '{' . implode(',', array_unique(array_map(static fn(array $r): int => (int) $r['student_id'], $rows))) . '}';
        $cstmt = $pdo->prepare(
            "SELECT e.student_id, cs.cs_id, cs.cs_name
               FROM enrollments e
               JOIN class_sections cs ON cs.cs_id = e.cs_id
              WHERE e.student_id = ANY (CAST(? AS INTEGER[]))
                AND e.status = 'Active'
                AND cs.school_year = ?
                AND cs.archived_at IS NULL
              ORDER BY cs.cs_name, cs.cs_id"
        );
        $cstmt->execute([$ids, $cur]);
        foreach ($cstmt->fetchAll(PDO::FETCH_ASSOC) as $c) {
            $classes[(int) $c['student_id']][] = ['csId' => (int) $c['cs_id'], 'label' => $c['cs_name'], 'current' => true];
        }
    }
    $iso = static fn(?string $v): ?string => $v === null ? null : audit_manila_iso($v);
    return [
        'requests' => array_map(static fn(array $r): array => [
            'requestId' => (int) $r['request_id'],
            'status' => (string) $r['status'],
            'reason' => (string) $r['reason'],
            'reviewNote' => $r['review_note'] !== null ? (string) $r['review_note'] : null,
            'schoolYear' => (string) $r['school_year'],
            'semester' => (string) $r['semester'],
            'createdAt' => $iso($r['created_at']),
            'reviewedAt' => $iso($r['reviewed_at']),
            'cancelledAt' => $iso($r['cancelled_at']),
            'reviewedBy' => $r['reviewed_by_name'] === null ? null : ['name' => (string) $r['reviewed_by_name']],
            'student' => [
                'studentId' => (int) $r['student_id'],
                'userId' => $r['account_user_id'] === null ? null : (int) $r['account_user_id'],
                'name' => (string) $r['student_name'],
                'studentNo' => (string) $r['student_number'],
            ],
            'classes' => $classes[(int) $r['student_id']] ?? [],
            'approvedThisTermCount' => (int) $r['approved_this_term_count'],
        ], $rows),
        'total' => (int) $total->fetchColumn(),
        'page' => $page,
        'pageSize' => FACE_FLAG_PAGE_SIZE,
        'pendingCount' => face_revoke_requests_pending_count($pdo),
    ];
}

/** Superadmin approves a pending Student face revocation request, deleting the .sface template and checking F3. Needs caller's transaction. */
function face_revoke_request_approve(PDO $pdo, array $config, array $actor, array $context, array $data): array
{
    $errors = [];
    $requestId = filter_var($data['requestId'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
    if ($requestId === false) {
        $errors[] = ['field' => 'requestId', 'message' => 'A valid revocation request is required.'];
    }
    $note = null;
    if (array_key_exists('note', $data) && $data['note'] !== null) {
        if (!is_string($data['note'])) {
            $errors[] = ['field' => 'note', 'message' => 'Note has an invalid value. Re-enter it and try again.'];
        } elseif (trim($data['note']) !== '') {
            try {
                $note = validate_required_string($data, 'note', 8, 240);
            } catch (ValidationException $e) {
                $errors = array_merge($errors, $e->getErrors());
            }
        }
    }
    if ($errors !== []) {
        throw new ValidationException($errors);
    }

    $stmt = $pdo->prepare('SELECT request_id, student_id, term_id, school_year, semester, reason, status FROM face_revoke_requests WHERE request_id = ? FOR UPDATE');
    $stmt->execute([(int) $requestId]);
    $req = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($req === false) {
        throw new SuperadminConflict('request_not_found', 'Revocation request not found.', [], 404);
    }
    if ($req['status'] !== 'pending') {
        throw new SuperadminConflict('request_not_pending', 'This revocation request is no longer pending.');
    }

    $studentId = (int) $req['student_id'];
    $profile = student_biometric_profile($pdo, $studentId, true);
    $beforeProfile = student_biometric_snapshot($profile);
    if ($profile !== null && $profile['protected_object_reference'] !== null) {
        student_biometric_sidecar_revoke($config, (string) $profile['protected_object_reference']);
    }

    $now = attendance_session_now_utc()->format('Y-m-d H:i:s.u');
    if ($profile !== null) {
        $pdo->prepare(
            "UPDATE biometric_profiles
                SET enrollment_status = 'revoked',
                    consent_status = 'declined',
                    face_enrolled = 0,
                    template_reference = NULL,
                    image_references = NULL,
                    protected_object_reference = NULL,
                    reference_expires_on = NULL,
                    usable_sample_count = NULL,
                    revoked_at = ?,
                    revoked_by_user_id = ?,
                    consent_responded_at = ?,
                    updated_at = ?
              WHERE profile_id = ?"
        )->execute([$now, $actor['user_id'] ?? null, $now, $now, (int) $profile['profile_id']]);
    }

    $upd = $pdo->prepare(
        "UPDATE face_revoke_requests
            SET status = 'approved',
                reviewed_by_user_id = ?,
                review_note = ?,
                reviewed_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
          WHERE request_id = ?
          RETURNING reviewed_at"
    );
    $upd->execute([$actor['user_id'] ?? null, $note, (int) $requestId]);
    $reviewedAt = (string) $upd->fetchColumn();

    $afterProfile = student_biometric_snapshot(student_biometric_profile($pdo, $studentId, true));
    $auditReason = $note !== null
        ? 'Student reason: ' . $req['reason'] . ' | Superadmin note: ' . $note
        : 'Student reason: ' . $req['reason'];
    student_biometric_record_audit(
        $pdo, $config, $actor, $context,
        'biometric_revoke_request_approved',
        $studentId,
        'Superadmin approved face revocation request and deleted the biometric template.',
        $auditReason,
        $beforeProfile,
        $afterProfile
    );

    face_flags_close_for_revoke($pdo, $studentId, $actor['user_id'] ?? null);

    $countStmt = $pdo->prepare(
        "SELECT COUNT(*)
           FROM face_revoke_requests
          WHERE student_id = ? AND school_year = ? AND semester = ? AND status = 'approved'"
    );
    $countStmt->execute([$studentId, (string) $req['school_year'], (string) $req['semester']]);
    $approvedCount = (int) $countStmt->fetchColumn();
    $flagged = false;
    if ($approvedCount >= 3) {
        face_flag_raise($pdo, $config, $context, $studentId, 'F3', [
            'approvedCount' => $approvedCount,
            'schoolYear' => (string) $req['school_year'],
            'semester' => (string) $req['semester'],
            'latestApprovedAt' => audit_manila_iso($reviewedAt),
        ]);
        $flagged = true;
    }

    $recipientStmt = $pdo->prepare('SELECT COALESCE(student_account_user_id, user_id) FROM students WHERE student_id = ?');
    $recipientStmt->execute([$studentId]);
    $recipientUserId = (int) $recipientStmt->fetchColumn();
    if ($recipientUserId > 0) {
        $body = 'Your face revocation request was approved and your facial reference has been deleted. You may still use manual attendance, or re-enroll from Face Registration.'
            . ($note !== null ? " Note: {$note}" : '');
        notification_create_idempotent(
            $pdo,
            $recipientUserId,
            'biometric_enrollment',
            'Face revocation request approved',
            $body,
            'student',
            (string) $studentId,
            'face-revoke-approved:' . (int) $requestId
        );
    }

    return [
        'request' => face_revoke_requests_list($pdo, ['status' => 'all'], 1, (int) $requestId)['requests'][0],
        'flagged' => $flagged,
    ];
}

/** Superadmin rejects a pending Student face revocation request with a mandatory reason. Needs caller's transaction. */
function face_revoke_request_reject(PDO $pdo, array $config, array $actor, array $context, array $data): array
{
    $errors = [];
    $requestId = filter_var($data['requestId'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
    if ($requestId === false) {
        $errors[] = ['field' => 'requestId', 'message' => 'A valid revocation request is required.'];
    }
    $note = '';
    try {
        $note = validate_required_string($data, 'note', 8, 240);
    } catch (ValidationException $e) {
        $errors = array_merge($errors, $e->getErrors());
    }
    if ($errors !== []) {
        throw new ValidationException($errors);
    }

    $stmt = $pdo->prepare('SELECT request_id, student_id, school_year, semester, reason, status FROM face_revoke_requests WHERE request_id = ? FOR UPDATE');
    $stmt->execute([(int) $requestId]);
    $req = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($req === false) {
        throw new SuperadminConflict('request_not_found', 'Revocation request not found.', [], 404);
    }
    if ($req['status'] !== 'pending') {
        throw new SuperadminConflict('request_not_pending', 'This revocation request is no longer pending.');
    }

    $studentId = (int) $req['student_id'];
    $pdo->prepare(
        "UPDATE face_revoke_requests
            SET status = 'rejected',
                review_note = ?,
                reviewed_by_user_id = ?,
                reviewed_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
          WHERE request_id = ?"
    )->execute([$note, $actor['user_id'] ?? null, (int) $requestId]);

    student_biometric_record_audit(
        $pdo, $config, $actor, $context,
        'biometric_revoke_request_rejected',
        $studentId,
        'Superadmin rejected face revocation request.',
        $note,
        ['status' => 'pending', 'requestId' => (int) $requestId],
        ['status' => 'rejected', 'requestId' => (int) $requestId, 'reviewNote' => $note]
    );

    $recipientStmt = $pdo->prepare('SELECT COALESCE(student_account_user_id, user_id) FROM students WHERE student_id = ?');
    $recipientStmt->execute([$studentId]);
    $recipientUserId = (int) $recipientStmt->fetchColumn();
    if ($recipientUserId > 0) {
        notification_create_idempotent(
            $pdo,
            $recipientUserId,
            'biometric_enrollment',
            'Face revocation request rejected',
            "Your face revocation request was rejected. Your existing face registration remains active. Reason: {$note}",
            'student',
            (string) $studentId,
            'face-revoke-rejected:' . (int) $requestId
        );
    }

    return [
        'request' => face_revoke_requests_list($pdo, ['status' => 'all'], 1, (int) $requestId)['requests'][0],
    ];
}
