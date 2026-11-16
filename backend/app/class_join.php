<?php

declare(strict_types=1);

/**
 * CLS-004 join a class by code (docs/contracts/class-join-code.md). Pure code helpers first,
 * then the database steps shared by the Faculty, Secretary and Student handlers.
 */

const CLASS_JOIN_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0, O, 1, I, L
const CLASS_JOIN_NO_MATCH = 'That code does not match an open class.';
const CLASS_JOIN_TOO_MANY = 'Too many tries. Wait 15 minutes.';
const CLASS_JOIN_SYSTEM_ACTOR = ['user_id' => null, 'login_email' => null, 'role' => 'system', 'display_name' => 'System', 'session_id' => null];

function class_join_generate_code(): string
{
    $code = '';
    for ($i = 0; $i < 6; $i++) {
        $code .= CLASS_JOIN_ALPHABET[random_int(0, strlen(CLASS_JOIN_ALPHABET) - 1)];
    }
    return $code;
}

/** Accepts lowercase, spaces and dashes. Returns the 6 characters, or null when it cannot be a code. */
function class_join_normalize(mixed $raw): ?string
{
    $value = strtoupper(preg_replace('/[\s-]+/', '', is_string($raw) ? $raw : '') ?? '');
    return preg_match('/^[' . CLASS_JOIN_ALPHABET . ']{6}$/', $value) === 1 ? $value : null;
}

function class_join_format(string $code): string
{
    return substr($code, 0, 3) . '-' . substr($code, 3);
}

function class_join_link(array $config, string $code): string
{
    return app_url($config, 'student/classes', ['join' => $code]);
}

/** A class takes joins while it is not archived, in the current school year, and its term has not ended. */
function class_join_class_is_open(PDO $pdo, array $config, array $class): bool
{
    if (($class['archive_reason'] ?? null) !== null || !academic_school_year_is_current($pdo, (string) $class['school_year'])) {
        return false;
    }
    $endDate = academic_resolve_class_term_dates($class, academic_terms_read($pdo))['endDate'];
    return $endDate === null || (string) $endDate >= app_local_date($config, attendance_session_now_utc());
}

function class_join_class_row(PDO $pdo, int $csId, bool $lock = false): ?array
{
    $stmt = $pdo->prepare(
        'SELECT cs.cs_id, cs.cs_name, cs.semester, cs.school_year, cs.term_start_date, cs.term_end_date, cs.archive_reason,
                cs.instructor_user_id, cs.join_code, cs.join_code_enabled, cs.join_auto_approve,
                COALESCE(cs.course_title, c.name) AS course_name, c.course_code, u.display_name AS faculty_name
           FROM class_sections cs JOIN courses c ON c.course_id = cs.course_id
           LEFT JOIN user_accounts u ON u.user_id = cs.instructor_user_id
          WHERE cs.cs_id = ?' . ($lock ? ' FOR UPDATE OF cs' : '')
    );
    $stmt->execute([$csId]);
    return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
}

function class_join_label(array $class): string
{
    return trim((string) $class['course_name']) . ' (' . $class['cs_name'] . ')';
}

/** Store a fresh unique code (retrying on a clash) and return it. $onlyIfEmpty keeps an existing code. */
function class_join_store_code(PDO $pdo, int $csId, bool $onlyIfEmpty): string
{
    $sql = 'UPDATE class_sections SET join_code = ? WHERE cs_id = ?' . ($onlyIfEmpty ? ' AND join_code IS NULL' : '') . ' RETURNING join_code';
    for ($attempt = 0; $attempt < 20; $attempt++) {
        $pdo->exec('SAVEPOINT class_join_code');
        try {
            $stmt = $pdo->prepare($sql);
            $stmt->execute([class_join_generate_code(), $csId]);
            $stored = $stmt->fetchColumn();
            $pdo->exec('RELEASE SAVEPOINT class_join_code');
            if ($stored !== false) {
                return (string) $stored;
            }
            return (string) $pdo->query('SELECT join_code FROM class_sections WHERE cs_id = ' . $csId)->fetchColumn();
        } catch (\PDOException $e) {
            $pdo->exec('ROLLBACK TO SAVEPOINT class_join_code');
            if ((string) $e->getCode() !== '23505') {
                throw $e;
            }
        }
    }
    throw new RuntimeException('Could not generate a unique join code.');
}

/** Settings shown on the roster. Creates the code the first time an open class is loaded. $faculty adds Auto-approve. */
function class_join_settings(PDO $pdo, array $config, array $class, bool $faculty): array
{
    $open = class_join_class_is_open($pdo, $config, $class);
    $code = $class['join_code'] !== null ? (string) $class['join_code'] : null;
    if ($code === null && $open) {
        $code = class_join_store_code($pdo, (int) $class['cs_id'], true);
    }
    $out = [
        'csId' => (int) $class['cs_id'],
        'code' => $code !== null ? class_join_format($code) : null,
        'link' => $code !== null ? class_join_link($config, $code) : null,
        'enabled' => (bool) $class['join_code_enabled'],
        'open' => $open,
    ];
    return $faculty ? $out + ['autoApprove' => (bool) $class['join_auto_approve']] : $out;
}

function class_join_audit(PDO $pdo, array $config, array $actor, string $action, int $csId, string $description, ?int $studentId = null, ?array $before = null, ?array $after = null): void
{
    audit_record_action($pdo, $config, $actor, 'class_management', $action, $studentId !== null ? 'student' : 'class_section',
        (string) ($studentId ?? $csId), $description, ['scope_cs_id' => $csId, 'before' => $before, 'after' => $after]);
}

/** Active user accounts of a Student (the same recipients the roster enrol notice uses). */
function class_join_student_user_ids(PDO $pdo, int $studentId): array
{
    $stmt = $pdo->prepare(
        "SELECT DISTINCT u.user_id FROM user_accounts u
          WHERE EXISTS (SELECT 1 FROM students s WHERE s.student_id = ?
                  AND ((s.student_account_user_id = u.user_id AND u.role IN ('student', 'secretary'))
                    OR (s.user_id = u.user_id AND u.role = 'secretary')))
            AND LOWER(u.status) = 'active'"
    );
    $stmt->execute([$studentId]);
    return array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
}

/**
 * Enrol like Faculty adding a Student to the roster (handle_faculty_class_enroll_students):
 * insert or reactivate the enrollment, NTF-001 notice, student_enroll audit row, grade recompute on reactivation.
 * Runs inside the caller's transaction.
 */
function class_join_enroll(PDO $pdo, array $config, array $actor, array $class, int $studentId): void
{
    $csId = (int) $class['cs_id'];
    $email = $pdo->prepare("SELECT bu_email FROM students WHERE student_id = ? AND LOWER(status) = 'active'");
    $email->execute([$studentId]);
    $buEmail = $email->fetchColumn();
    if ($buEmail === false) {
        throw new DomainException('One or more selected Students are not active.');
    }
    $existing = $pdo->prepare('SELECT enrollment_id, status FROM enrollments WHERE student_id = ? AND cs_id = ? FOR UPDATE');
    $existing->execute([$studentId, $csId]);
    $row = $existing->fetch(PDO::FETCH_ASSOC);
    if (is_array($row) && strtolower((string) $row['status']) === 'active') {
        return;
    }
    if (strtolower((string) substr(strrchr(trim((string) $buEmail), '@') ?: '', 1)) !== 'bicol-u.edu.ph') {
        throw new DomainException('This Student cannot be added to the class because their email is not an official @bicol-u.edu.ph address. Correct the Student email in the roster, then try again.');
    }
    if (is_array($row)) {
        $pdo->prepare("UPDATE enrollments SET status = 'Active', date_enrolled = COALESCE(date_enrolled, CURRENT_DATE), updated_at = CURRENT_TIMESTAMP(6) WHERE enrollment_id = ?")
            ->execute([(int) $row['enrollment_id']]);
    } else {
        $pdo->prepare("INSERT INTO enrollments (student_id, cs_id, status, date_enrolled, retention_state, created_at)
                       VALUES (?, ?, 'Active', CURRENT_DATE, 'active', CURRENT_TIMESTAMP(6))")->execute([$studentId, $csId]);
    }
    $instructor = $pdo->prepare('SELECT display_name FROM user_accounts WHERE user_id = ?');
    $instructor->execute([(int) $class['instructor_user_id']]);
    $facultyName = (string) ($instructor->fetchColumn() ?: 'Faculty');
    foreach (class_join_student_user_ids($pdo, $studentId) as $uid) {
        notification_create_idempotent($pdo, $uid, 'class_enrollment', 'Enrolled in ' . $class['course_name'],
            "{$facultyName} has added you to {$class['course_name']} ({$class['cs_name']}).", 'class_section', (string) $csId, "class_enrollment:{$csId}:{$uid}");
    }
    if (is_array($row)) { // a revived enrollment keeps its scores; its stored grade is recomputed from them
        faculty_recompute_after_change($pdo, $config, ['user_id' => (int) $class['instructor_user_id'], 'role' => 'faculty', 'display_name' => $facultyName, 'login_email' => null, 'session_id' => null], [$csId]);
    }
    audit_record_action($pdo, $config, $actor, 'class_management', 'student_enroll', 'class_section', (string) $csId,
        'Enrolled 1 student(s) into ' . audit_class_label($pdo, $csId) . '.', ['scope_cs_id' => $csId]);
}

/** Approve or reject a pending request inside the caller's transaction. Throws DomainException when it is no longer pending. */
function class_join_decide(PDO $pdo, array $config, array $actor, int $requestId, int $csId, bool $approve): void
{
    $stmt = $pdo->prepare("SELECT student_id, status FROM class_join_requests WHERE request_id = ? AND cs_id = ? FOR UPDATE");
    $stmt->execute([$requestId, $csId]);
    $request = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($request === false || $request['status'] !== 'pending') {
        throw new DomainException('This request was already handled.');
    }
    $class = class_join_class_row($pdo, $csId, true);
    $studentId = (int) $request['student_id'];
    if ($approve) {
        if ($class === null || !class_join_class_is_open($pdo, $config, $class)) {
            throw new DomainException('Archived classes are view-only.');
        }
        class_join_enroll($pdo, $config, $actor, $class, $studentId);
    }
    $pdo->prepare('UPDATE class_join_requests SET status = ?, decided_at = now(), decided_by_user_id = ? WHERE request_id = ?')
        ->execute([$approve ? 'approved' : 'rejected', $actor['user_id'], $requestId]);
    $label = class_join_label($class);
    if (!$approve) {
        foreach (class_join_student_user_ids($pdo, $studentId) as $uid) {
            notification_create_idempotent($pdo, $uid, 'class_join_rejected', 'Join request not approved',
                "Your request to join {$label} was not approved.", 'class_section', (string) $csId, "class_join_rejected:{$requestId}:{$uid}");
        }
    }
    class_join_audit($pdo, $config, $actor, $approve ? 'class_join_approved' : 'class_join_rejected', $csId,
        ($approve ? 'Approved' : 'Rejected') . ' the request of ' . audit_student_label($pdo, $studentId) . ' to join ' . audit_class_label($pdo, $csId) . '.', $studentId);
}
