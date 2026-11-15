<?php

declare(strict_types=1);

/**
 * ADM-001 Superadmin mode (docs/contracts/superadmin.md): Course Catalog (Part B) and People & Accounts (Part C).
 * The mode is a view only (SA5): every route here needs the Dean role and nothing else. Same shape as RoomController.
 */

class SuperadminConflict extends \RuntimeException
{
    public function __construct(public string $errorCode, string $msg, public array $extra = [], public int $status = 409)
    {
        parent::__construct($msg);
    }
}

// ---- Part B: Course Catalog -------------------------------------------------

function course_select(PDO $pdo): string
{
    $cur = $pdo->quote(academic_current_school_year($pdo));
    return "SELECT c.course_id, c.course_code, c.name, c.units, c.lecture_units, c.lab_units, c.status, c.retired_at,
        (SELECT COUNT(*) FROM class_sections cs WHERE cs.course_id = c.course_id) AS class_count,
        (SELECT COUNT(*) FROM class_sections cs WHERE cs.course_id = c.course_id AND cs.school_year = {$cur}) AS current_class_count
        FROM courses c";
}

function course_fetch(PDO $pdo, int $id, bool $lock = false): array
{
    if ($lock) { // FOR UPDATE cannot sit next to the count subqueries' aggregate, so lock the bare row first.
        $pdo->prepare('SELECT 1 FROM courses WHERE course_id = ? FOR UPDATE')->execute([$id]);
    }
    $stmt = $pdo->prepare(course_select($pdo) . ' WHERE c.course_id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) throw new SuperadminConflict('course_not_found', 'Course not found.', [], 404);
    return $row;
}

function course_json(array $r): array
{
    $f = static fn(mixed $v): ?float => $v === null ? null : (float) $v;
    return ['id' => (int) $r['course_id'], 'courseCode' => $r['course_code'], 'name' => $r['name'], 'units' => (float) $r['units'],
        'lectureUnits' => $f($r['lecture_units']), 'labUnits' => $f($r['lab_units']), 'status' => $r['status'],
        'retiredAt' => $r['retired_at'] === null ? null : audit_manila_iso((string) $r['retired_at']), 'classCount' => (int) $r['class_count'], 'currentClassCount' => (int) $r['current_class_count']];
}

function course_audit_view(array $r): array
{
    $units = static fn(mixed $v): ?string => $v === null ? null : rtrim(rtrim(number_format((float) $v, 1, '.', ''), '0'), '.'); // audit states hold strings, never floats
    return ['courseCode' => $r['course_code'], 'name' => $r['name'], 'lectureUnits' => $units($r['lecture_units']),
        'labUnits' => $units($r['lab_units']), 'units' => $units($r['units']), 'status' => $r['status']];
}

function course_label(array $r): string
{
    return $r['course_code'] . ' · ' . $r['name'];
}

function course_reason(array $data): ?string
{
    $reason = trim((string) ($data['reason'] ?? ''));
    if (mb_strlen($reason) > 500) throw new ValidationException(['reason' => 'Reason is too long.']);
    return $reason === '' ? null : $reason;
}

function course_update(PDO $pdo, array $config, array $actor, array $data): array
{
    $before = course_fetch($pdo, (int) ($data['id'] ?? 0), true);
    $code = preg_replace('/\s+/', ' ', trim((string) ($data['courseCode'] ?? '')));
    $name = preg_replace('/\s+/', ' ', trim((string) ($data['name'] ?? '')));
    $errors = [];
    if ($code === '') $errors['courseCode'] = 'Course code is required.';
    elseif (mb_strlen($code) > 50) $errors['courseCode'] = 'Course code must be at most 50 characters.';
    if ($name === '') $errors['name'] = 'Course title is required.';
    elseif (mb_strlen($name) > 255) $errors['name'] = 'Course title must be at most 255 characters.';
    if ($errors !== []) throw new ValidationException($errors);
    [$lecture, $lab] = faculty_parse_component_units($data);
    if ($lecture === null && $lab === null) {
        throw new ValidationException(['lectureUnits' => 'A course needs lecture units, laboratory units, or both.']);
    }
    $total = ($lecture ?? 0) + ($lab ?? 0);
    if ($total > 99.9) throw new ValidationException(['lectureUnits' => 'Total units are too large.']);
    // GRD-003: same guard as the Faculty course edit — no removing Laboratory units while a current class has Laboratory assessments.
    if ((float) ($before['lab_units'] ?? 0) > 0 && (float) ($lab ?? 0) == 0) {
        $labOffering = $pdo->prepare(
            "SELECT cs.cs_name, ua.display_name
               FROM assessments a
               JOIN class_sections cs ON cs.cs_id = a.cs_id
               JOIN user_accounts ua ON ua.user_id = cs.instructor_user_id
               JOIN grading_category_period_memberships gcp
                 ON gcp.category_id = a.grading_category_id AND gcp.grading_period = a.grading_period
              WHERE gcp.component = 'Laboratory' AND cs.course_id = ? AND UPPER(cs.school_year) = UPPER(?)
              ORDER BY cs.cs_id, a.assessment_id
              LIMIT 1"
        );
        $labOffering->execute([(int) $before['course_id'], academic_current_school_year($pdo)]);
        $labRow = $labOffering->fetch(PDO::FETCH_ASSOC);
        if ($labRow) {
            throw new SuperadminConflict('course_laboratory_assessments_exist', sprintf(
                '%s (%s) has Laboratory assessments. Delete them in Grade Computation before removing Laboratory units.',
                $labRow['cs_name'], $labRow['display_name']));
        }
    }
    $taken = $pdo->prepare('SELECT 1 FROM courses WHERE LOWER(course_code) = LOWER(?) AND course_id <> ?');
    $taken->execute([$code, $before['course_id']]);
    if ($taken->fetchColumn()) throw new SuperadminConflict('course_code_taken', 'Another course already uses this code.');
    $pdo->prepare('UPDATE courses SET course_code = ?, name = ?, units = ?, lecture_units = ?, lab_units = ? WHERE course_id = ?')
        ->execute([$code, $name, $total, $lecture ?? 0, $lab ?? 0, $before['course_id']]);
    $row = course_fetch($pdo, (int) $before['course_id']);
    $changed = audit_changed_fields(course_audit_view($before), course_audit_view($row));
    if ($changed !== null) { // R3: no row when nothing changed
        audit_record_action($pdo, $config, $actor, 'settings', 'course_updated', 'course', (string) $row['course_id'],
            'Changed course ' . course_label($row) . '.',
            ['before' => course_audit_view($before), 'after' => course_audit_view($row), 'reason' => course_reason($data)]);
    }
    return ['course' => course_json($row)];
}

function course_set_status(PDO $pdo, array $config, array $actor, array $data, string $to): array
{
    $before = course_fetch($pdo, (int) ($data['id'] ?? 0), true);
    if ($before['status'] === $to) return ['course' => course_json($before)]; // SA18: no-op, no audit row
    $pdo->prepare('UPDATE courses SET status = ?, retired_at = ' . ($to === 'retired' ? 'CURRENT_TIMESTAMP(6)' : 'NULL') . ' WHERE course_id = ?')
        ->execute([$to, $before['course_id']]);
    $row = course_fetch($pdo, (int) $before['course_id']);
    audit_record_action($pdo, $config, $actor, 'settings', $to === 'retired' ? 'course_retired' : 'course_restored', 'course', (string) $row['course_id'],
        ($to === 'retired' ? 'Retired course ' : 'Restored course ') . course_label($row) . '.',
        ['before' => course_audit_view($before), 'after' => course_audit_view($row), 'reason' => $to === 'retired' ? course_reason($data) : null]);
    return ['course' => course_json($row)];
}

function handle_admin_courses(): void
{
    $pdo = null;
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $actor = admin_verify_auth($pdo, $config);
        if (request_method() === 'GET') {
            $status = (string) ($_GET['status'] ?? 'all');
            if (!in_array($status, ['active', 'retired', 'all'], true)) {
                throw new ValidationException(['status' => 'Status must be active, retired or all.']);
            }
            $q = trim((string) ($_GET['q'] ?? ''));
            $where = [];
            $params = [];
            if ($status !== 'all') { $where[] = 'c.status = ?'; $params[] = $status; }
            if ($q !== '') { $where[] = '(c.course_code ILIKE ? OR c.name ILIKE ?)'; $like = '%' . addcslashes($q, '\\%_') . '%'; array_push($params, $like, $like); }
            $stmt = $pdo->prepare(course_select($pdo) . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . ' ORDER BY c.course_code');
            $stmt->execute($params);
            json_response(['status' => 'ok', 'courses' => array_map('course_json', $stmt->fetchAll(PDO::FETCH_ASSOC))]);
            return;
        }
        $body = request_body();
        if (!$body['has_body']) { safe_error_response('Request body required.', 400); return; }
        $pdo->beginTransaction();
        try {
            $result = match (basename(request_path())) {
                'update' => course_update($pdo, $config, $actor, $body['data']),
                'retire' => course_set_status($pdo, $config, $actor, $body['data'], 'retired'),
                'restore' => course_set_status($pdo, $config, $actor, $body['data'], 'active'),
                default => null,
            };
        } catch (PDOException $e) {
            if ($e->getCode() === '23505') throw new SuperadminConflict('course_code_taken', 'Another course already uses this code.');
            throw $e;
        }
        if ($result === null) { $pdo->rollBack(); safe_error_response('Not found.', 404); return; }
        $pdo->commit();
        json_response(['status' => 'ok'] + $result);
    } catch (ValidationException $e) {
        if ($pdo instanceof PDO && $pdo->inTransaction()) $pdo->rollBack();
        validation_error_response($e->getErrors());
    } catch (SuperadminConflict $e) {
        superadmin_conflict_response($pdo, $e);
    } catch (Throwable $e) {
        if ($pdo instanceof PDO && $pdo->inTransaction()) $pdo->rollBack();
        error_log('Admin courses error: ' . sanitize_for_log($e));
        safe_error_response('Unable to save courses.', 500);
    }
}

function superadmin_conflict_response(?PDO $pdo, SuperadminConflict $e): void
{
    if ($pdo instanceof PDO && $pdo->inTransaction()) $pdo->rollBack();
    json_response(['status' => 'error', 'code' => $e->errorCode, 'message' => $e->getMessage(), 'requestId' => request_id()] + $e->extra, $e->status);
}

// ---- Part C: People & Accounts ---------------------------------------------

const PEOPLE_PAGE_SIZE = 50;

/**
 * The Faculty or Student account behind a user id, or 404. Secretary-only accounts, Deans and unknown ids are not people (SA23).
 * A Student's canonical account is students.student_account_user_id (its role may be 'secretary' for a Class Secretary).
 */
function people_fetch(PDO $pdo, int $userId, bool $lock = false): array
{
    $stmt = $pdo->prepare("SELECT ua.user_id, ua.display_name, ua.login_email, ua.role, ua.status, ua.disabled_at,
            s.student_id, s.student_number,
            CASE WHEN ua.role = 'faculty' THEN 'faculty' ELSE 'student' END AS kind
        FROM user_accounts ua LEFT JOIN students s ON s.student_account_user_id = ua.user_id
        WHERE ua.user_id = ? AND (ua.role = 'faculty' OR (ua.role IN ('student', 'secretary') AND s.student_id IS NOT NULL))"
        . ($lock ? ' FOR UPDATE OF ua' : ''));
    $stmt->execute([$userId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row || !in_array($row['status'], ['Active', 'Disabled'], true)) {
        throw new SuperadminConflict('person_not_found', 'Account not found.', [], 404);
    }
    return $row;
}

function people_json(array $r, array $classes): array
{
    $json = ['userId' => (int) $r['user_id'], 'name' => $r['display_name'], 'email' => $r['login_email'], 'kind' => $r['kind'],
        'status' => $r['status'] === 'Active' ? 'active' : ($r['status'] === 'Disabled' ? 'deactivated' : 'invited'), 'disabledAt' => $r['disabled_at'] === null ? null : audit_manila_iso((string) $r['disabled_at']),
        'twoFactor' => (bool) $r['two_factor'], 'lastActivityAt' => $r['last_activity_at'] === null ? null : audit_manila_iso((string) $r['last_activity_at'])];
    if (!in_array($r['status'], ['Active', 'Disabled'], true)) {
        $expires = (string) ($r['invitation_expires_at'] ?? '');
        $json['invitation'] = ['sentAt' => empty($r['invited_at']) ? null : audit_manila_iso((string) $r['invited_at']),
            'expiresAt' => $expires === '' ? null : audit_manila_iso($expires),
            'expired' => $expires !== '' && new DateTimeImmutable($expires, new DateTimeZone('UTC')) <= new DateTimeImmutable('now', new DateTimeZone('UTC'))];
    }
    if ($r['kind'] === 'faculty') {
        $json['classes'] = $classes;
    } else {
        $json['studentId'] = (int) ($r['student_id'] ?? 0);
        $json['studentNo'] = $r['student_number'];
        $json['faceEnrolled'] = (bool) ($r['face_enrolled'] ?? false);
        $json['enrolledClasses'] = $classes;
    }
    return $json;
}

/** Page of people. Classes: Faculty teach them, Students are enrolled in them (current school year first). */
function people_list(PDO $pdo, string $kind, string $status, string $q, int $page, ?int $onlyUserId = null, array $f = []): array
{
    $cur = academic_current_school_year($pdo);
    // The newest invitation token of the account (Faculty: faculty_invitation, Student: student_activation, issued to the Student's own account).
    $latest = " LEFT JOIN LATERAL (SELECT issued_at, expires_at, used_at, revoked_at FROM security_tokens WHERE purpose = '"
        . ($kind === 'faculty' ? 'faculty_invitation' : 'student_activation') . "' AND user_id = ua.user_id ORDER BY issued_at DESC, token_id DESC LIMIT 1) inv ON TRUE";
    $from = $kind === 'faculty'
        ? "FROM user_accounts ua{$latest} WHERE ua.role = 'faculty'"
        : "FROM user_accounts ua JOIN students s ON s.student_account_user_id = ua.user_id{$latest} WHERE ua.role IN ('student', 'secretary')";
    $invited = "(ua.status = 'Pending Activation' AND inv.issued_at IS NOT NULL AND inv.used_at IS NULL AND inv.revoked_at IS NULL)";
    $where = [match ($status) {
        'active' => "ua.status = 'Active'", 'deactivated' => "ua.status = 'Disabled'", 'invited' => $invited,
        default => "(ua.status IN ('Active', 'Disabled') OR {$invited})",
    }];
    $faceSql = "EXISTS (SELECT 1 FROM biometric_profiles b WHERE b.student_id = s.student_id AND b.enrollment_status = 'active' AND b.protected_object_reference IS NOT NULL)";
    $params = [];
    if ($q !== '') {
        $like = '%' . addcslashes($q, '\\%_') . '%';
        $where[] = '(ua.display_name ILIKE ? OR ua.login_email ILIKE ?' . ($kind === 'student' ? ' OR s.student_number ILIKE ?' : '') . ')';
        array_push($params, $like, $like);
        if ($kind === 'student') $params[] = $like;
    }
    if ($onlyUserId !== null) {
        $where[] = 'ua.user_id = ?';
        $params[] = $onlyUserId;
    }
    $mfa = "EXISTS (SELECT 1 FROM security_tokens t WHERE t.user_id = ua.user_id AND t.purpose = 'mfa_credential' AND t.mfa_status = 'enabled')";
    if (($f['twoFactor'] ?? '') === 'on') $where[] = $mfa;
    if (($f['twoFactor'] ?? '') === 'off') $where[] = "NOT {$mfa}";
    if (($f['activity'] ?? '') === 'never') $where[] = 'NOT EXISTS (SELECT 1 FROM auth_sessions a WHERE a.user_id = ua.user_id)';
    if (($f['activity'] ?? '') === 'inactive30') $where[] = "(SELECT MAX(a.last_seen_at) FROM auth_sessions a WHERE a.user_id = ua.user_id) < NOW() - INTERVAL '30 days'";
    if (isset($f['classes'])) {
        $where[] = ($f['classes'] === 'none' ? 'NOT ' : '') . 'EXISTS (SELECT 1 FROM class_sections c WHERE c.instructor_user_id = ua.user_id AND c.school_year = ? AND c.archived_at IS NULL)';
        $params[] = $cur;
    }
    // Same rule as secretary_has_current_appointment(): an active section of the current school year names the Student's account.
    if (!empty($f['secretary'])) {
        $where[] = "EXISTS (SELECT 1 FROM class_sections c WHERE c.secretary_user_id = ua.user_id AND LOWER(c.status) = 'active' AND UPPER(c.school_year) = UPPER(?))";
        $params[] = $cur;
    }
    // Same rule as the attendance capture check: an active profile that still holds its protected reference.
    if (isset($f['face'])) {
        $where[] = ($f['face'] === 'not_enrolled' ? 'NOT ' : '') . $faceSql;
    }
    // 9.17: a course or class counts only this school year's non-archived classes (Faculty teach them, Students have an Active enrolment).
    foreach (['courseId' => 'c.course_id', 'classId' => 'c.cs_id'] as $key => $col) {
        if (!isset($f[$key])) continue;
        $where[] = ($kind === 'faculty'
            ? 'EXISTS (SELECT 1 FROM class_sections c WHERE c.instructor_user_id = ua.user_id'
            : "EXISTS (SELECT 1 FROM enrollments e JOIN class_sections c ON c.cs_id = e.cs_id WHERE e.student_id = s.student_id AND e.status = 'Active'")
            . " AND {$col} = ? AND c.school_year = ? AND c.archived_at IS NULL)";
        array_push($params, $f[$key], $cur);
    }
    $whereSql = ' AND ' . implode(' AND ', $where);
    $total = $pdo->prepare("SELECT COUNT(*) {$from}{$whereSql}");
    $total->execute($params);
    $stmt = $pdo->prepare("SELECT ua.user_id, ua.display_name, ua.login_email, ua.status, ua.disabled_at, '{$kind}' AS kind, inv.issued_at AS invited_at, inv.expires_at AS invitation_expires_at"
        . ($kind === 'student' ? ", s.student_id, s.student_number, {$faceSql} AS face_enrolled" : ', NULL AS student_id, NULL AS student_number') . ",
        EXISTS (SELECT 1 FROM security_tokens t WHERE t.user_id = ua.user_id AND t.purpose = 'mfa_credential' AND t.mfa_status = 'enabled') AS two_factor,
        (SELECT MAX(a.last_seen_at) FROM auth_sessions a WHERE a.user_id = ua.user_id) AS last_activity_at
        {$from}{$whereSql} ORDER BY ua.display_name, ua.user_id LIMIT " . PEOPLE_PAGE_SIZE . ' OFFSET ' . (($page - 1) * PEOPLE_PAGE_SIZE));
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $classes = [];
    if ($rows !== []) {
        $ids = '{' . implode(',', array_map(static fn(array $r): int => (int) ($kind === 'faculty' ? $r['user_id'] : $r['student_id']), $rows)) . '}';
        $sql = $kind === 'faculty'
            ? 'SELECT cs.instructor_user_id AS owner, cs.cs_id, cs.cs_name, cs.school_year, cs.archived_at FROM class_sections cs WHERE cs.instructor_user_id = ANY (CAST(? AS INTEGER[]))'
            : 'SELECT e.student_id AS owner, cs.cs_id, cs.cs_name, cs.school_year, cs.archived_at FROM enrollments e JOIN class_sections cs ON cs.cs_id = e.cs_id WHERE e.student_id = ANY (CAST(? AS INTEGER[]))';
        $cstmt = $pdo->prepare($sql . ' ORDER BY (cs.school_year = ?) DESC, cs.school_year DESC, cs.cs_name');
        $cstmt->execute([$ids, $cur]);
        foreach ($cstmt->fetchAll(PDO::FETCH_ASSOC) as $c) {
            $classes[(int) $c['owner']][] = ['csId' => (int) $c['cs_id'], 'label' => $c['cs_name'], 'schoolYear' => $c['school_year'],
                'current' => $c['school_year'] === $cur && $c['archived_at'] === null];
        }
    }
    return ['people' => array_map(static fn(array $r): array => people_json($r, $classes[(int) ($kind === 'faculty' ? $r['user_id'] : $r['student_id'])] ?? []), $rows),
        'total' => (int) $total->fetchColumn(), 'page' => $page, 'pageSize' => PEOPLE_PAGE_SIZE];
}

/** One person JSON (the same shape as the list) for an action's answer. */
function people_one(PDO $pdo, int $userId, string $kind): array
{
    $people = people_list($pdo, $kind, 'all', '', 1, $userId)['people'];
    if ($people === []) throw new SuperadminConflict('person_not_found', 'Account not found.', [], 404);
    return $people[0];
}

function people_audit_view(array $person, string $status): array
{
    return ['status' => $status, 'kind' => ucfirst($person['kind'])];
}

/** Ends every access token (token_version + 1) and revokes every live session and its refresh tokens. */
function people_end_sessions(PDO $pdo, int $userId, string $reason): void
{
    auth_invalidate_account($pdo, $userId);
    $sessions = $pdo->prepare('SELECT session_id FROM auth_sessions WHERE user_id = ? AND revoked_at IS NULL');
    $sessions->execute([$userId]);
    $now = new DateTimeImmutable('now', new DateTimeZone('UTC'));
    foreach ($sessions->fetchAll(PDO::FETCH_COLUMN) as $sessionId) {
        auth_revoke_session($pdo, (int) $sessionId, $reason, $now);
    }
}

function people_deactivate(PDO $pdo, array $config, array $actor, array $data): array
{
    $userId = (int) ($data['userId'] ?? 0);
    $reason = course_reason($data);
    $person = people_fetch($pdo, $userId, true);
    if ($person['status'] === 'Disabled') return ['person' => people_one($pdo, $userId, $person['kind'])]; // no-op, no audit row (R3)
    if ($person['kind'] === 'faculty') {
        $stmt = $pdo->prepare('SELECT cs_id, cs_name FROM class_sections WHERE instructor_user_id = ? AND school_year = ? AND archived_at IS NULL ORDER BY cs_name');
        $stmt->execute([$userId, academic_current_school_year($pdo)]);
        $blocking = $stmt->fetchAll(PDO::FETCH_ASSOC);
        if ($blocking !== []) {
            $n = count($blocking);
            throw new SuperadminConflict('faculty_has_current_classes',
                $person['display_name'] . ' teaches ' . $n . ($n === 1 ? ' class' : ' classes') . ' this school year. Reassign or archive them first.',
                ['classes' => array_map(static fn(array $c): array => ['csId' => (int) $c['cs_id'], 'label' => $c['cs_name']], $blocking)]);
        }
    }
    // A Class Secretary signs in with the Student's own account (REG-006), so this one change blocks both.
    $pdo->prepare("UPDATE user_accounts SET status = 'Disabled', disabled_at = CURRENT_TIMESTAMP(6), updated_at = CURRENT_TIMESTAMP(6) WHERE user_id = ?")->execute([$userId]);
    people_end_sessions($pdo, $userId, 'Account deactivated');
    audit_record_action($pdo, $config, $actor, 'people', 'account_deactivated', 'user_account', (string) $userId,
        'Deactivated ' . $person['display_name'] . ' (' . ucfirst($person['kind']) . ').',
        ['before' => people_audit_view($person, 'Active'), 'after' => people_audit_view($person, 'Disabled'), 'reason' => $reason]);
    return ['person' => people_one($pdo, $userId, $person['kind'])];
}

function people_reactivate(PDO $pdo, array $config, array $actor, array $data): array
{
    $userId = (int) ($data['userId'] ?? 0);
    $person = people_fetch($pdo, $userId, true);
    if ($person['status'] === 'Active') return ['person' => people_one($pdo, $userId, $person['kind'])];
    $pdo->prepare("UPDATE user_accounts SET status = 'Active', disabled_at = NULL, updated_at = CURRENT_TIMESTAMP(6) WHERE user_id = ?")->execute([$userId]);
    audit_record_action($pdo, $config, $actor, 'people', 'account_reactivated', 'user_account', (string) $userId,
        'Reactivated ' . $person['display_name'] . ' (' . ucfirst($person['kind']) . ').',
        ['before' => people_audit_view($person, 'Disabled'), 'after' => people_audit_view($person, 'Active')]);
    return ['person' => people_one($pdo, $userId, $person['kind'])];
}

/** An active (not deactivated) Faculty or Student account for a Dean account action, or 409 account_deactivated. */
function people_fetch_active(PDO $pdo, int $userId): array
{
    $person = people_fetch($pdo, $userId, true);
    if ($person['status'] === 'Disabled') throw new SuperadminConflict('account_deactivated', 'This account is deactivated.');
    return $person;
}

function people_sign_out(PDO $pdo, array $config, array $actor, array $data): array
{
    $userId = (int) ($data['userId'] ?? 0);
    $reason = course_reason($data);
    $person = people_fetch_active($pdo, $userId);
    people_end_sessions($pdo, $userId, 'Signed out by the Dean');
    audit_record_action($pdo, $config, $actor, 'people', 'sessions_ended_by_dean', 'user_account', (string) $userId,
        'Signed ' . $person['display_name'] . ' (' . ucfirst($person['kind']) . ') out everywhere.', ['reason' => $reason]);
    return ['person' => people_one($pdo, $userId, $person['kind'])];
}

/** AUTH-006: removes the authenticator and recovery codes, ends every session, then emails the person after commit. */
function people_reset_2fa(PDO $pdo, array $config, array $actor, array $data): array
{
    $userId = (int) ($data['userId'] ?? 0);
    $reason = course_reason($data);
    $person = people_fetch_active($pdo, $userId);
    $revoke = $pdo->prepare(
        "UPDATE security_tokens
         SET mfa_status = CASE WHEN purpose = 'mfa_credential' THEN 'revoked' ELSE mfa_status END,
             revoked_at = ?, revocation_reason = 'Reset by the Dean'
         WHERE user_id = ? AND purpose IN ('mfa_credential', 'mfa_recovery') AND revoked_at IS NULL"
    );
    $revoke->execute([(new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d H:i:s.u'), $userId]);
    if ($revoke->rowCount() === 0) throw new SuperadminConflict('two_factor_off', 'This person does not use 2FA.');
    people_end_sessions($pdo, $userId, '2FA reset by the Dean');
    audit_record_action($pdo, $config, $actor, 'people', 'mfa_reset_by_dean', 'user_account', (string) $userId,
        'Reset 2FA for ' . $person['display_name'] . ' (' . ucfirst($person['kind']) . ').', ['reason' => $reason]);
    return ['person' => people_one($pdo, $userId, $person['kind']), 'afterCommit' => static function () use ($config, $person): void {
        try {
            if (!send_email((string) $person['login_email'], 'Your DentiSYS 2FA was reset', email_two_factor_reset_html((string) $person['display_name'], (string) $person['login_email']), $config, true)) {
                error_log('People 2FA reset: the notice email was not delivered.');
            }
        } catch (Throwable $e) {
            error_log('People 2FA reset email error: ' . sanitize_for_log($e));
        }
    }];
}

/** The Pending Activation Faculty or Student account whose latest invitation is still live (unused, not revoked, maybe expired). */
function people_pending_fetch(PDO $pdo, int $userId, bool $lock): array
{
    $stmt = $pdo->prepare("SELECT ua.user_id, ua.display_name, ua.login_email, ua.status, s.student_id,
            CASE WHEN ua.role = 'faculty' THEN 'faculty' ELSE 'student' END AS kind
        FROM user_accounts ua LEFT JOIN students s ON s.student_account_user_id = ua.user_id
        WHERE ua.user_id = ? AND (ua.role = 'faculty' OR (ua.role = 'student' AND s.student_id IS NOT NULL))" . ($lock ? ' FOR UPDATE OF ua' : ''));
    $stmt->execute([$userId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) throw new SuperadminConflict('person_not_found', 'Account not found.', [], 404);
    $latest = $pdo->prepare("SELECT related_cs_id, used_at, revoked_at FROM security_tokens WHERE purpose = ? AND user_id = ? ORDER BY issued_at DESC, token_id DESC LIMIT 1");
    $latest->execute([$row['kind'] === 'faculty' ? 'faculty_invitation' : 'student_activation', $userId]);
    $token = $latest->fetch(PDO::FETCH_ASSOC);
    if ($row['status'] !== 'Pending Activation' || !$token || $token['used_at'] !== null || $token['revoked_at'] !== null) {
        throw new SuperadminConflict('no_pending_invitation', 'This person has no pending invitation.');
    }
    return $row + ['related_cs_id' => $token['related_cs_id']];
}

/** Student resend: same Student and class as the latest invitation (keeps the original Faculty authorization), new 7 days. */
function people_student_resend(PDO $pdo, array $config, array $actor, int $userId): array
{
    $pdo->beginTransaction();
    $person = people_pending_fetch($pdo, $userId, true);
    $stmt = $pdo->prepare("SELECT s.name_prefix, s.first_name, s.middle_name, s.last_name, s.name_suffix, s.status AS student_status,
            cs.cs_id, cs.cs_name, cs.course_title, cs.school_year, cs.status AS class_status, cs.archived_at, cs.archive_reason,
            fa.display_name AS faculty_name, e.status AS enrollment_status
        FROM students s JOIN class_sections cs ON cs.cs_id = ? LEFT JOIN user_accounts fa ON fa.user_id = cs.instructor_user_id
        LEFT JOIN enrollments e ON e.student_id = s.student_id AND e.cs_id = cs.cs_id
        WHERE s.student_id = ?");
    $stmt->execute([(int) $person['related_cs_id'], (int) $person['student_id']]);
    $c = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$c || strtolower((string) $c['student_status']) !== 'active' || $c['enrollment_status'] !== 'Active' || strtolower((string) $c['class_status']) !== 'active'
        || $c['archived_at'] !== null || $c['archive_reason'] !== null || !academic_school_year_is_current($pdo, (string) $c['school_year'])) {
        throw new SuperadminConflict('invitation_class_unavailable', 'The class for this invitation is no longer active. Ask the Faculty member to invite the Student again.');
    }
    $issued = student_invitation_issue_token($pdo, $userId, (int) $person['student_id'], (int) $c['cs_id'], 'Replaced by a Dean resend');
    $subject = 'DentiSYS Student Invitation';
    $body = student_auth_activation_email($c, app_url($config, '/activate-student', ['token' => $issued['rawToken']]), (string) $c['faculty_name']);
    $emailId = student_invitation_outbox_insert($pdo, (int) $actor['user_id'], (string) $person['login_email'], (string) $person['display_name'], $subject, $body, uuid_v4_string());
    audit_record_action($pdo, $config, $actor, 'people', 'student_invitation_resent_by_dean', 'security_token', (string) $issued['tokenId'],
        'Resent the Student invitation for ' . $person['display_name'] . ' to ' . $c['cs_name'] . '.', []);
    $pdo->commit();
    $sent = student_invitation_outbox_send($pdo, $config, $emailId, (string) $person['login_email'], $subject, $body);
    return ['person' => people_one($pdo, $userId, 'student'), 'delivery' => $sent ? 'Sent' : 'Failed'];
}

function people_student_revoke(PDO $pdo, array $config, array $actor, int $userId): array
{
    $pdo->beginTransaction();
    $person = people_pending_fetch($pdo, $userId, true);
    $pdo->prepare("UPDATE security_tokens SET revoked_at = CURRENT_TIMESTAMP(6), revocation_reason = 'Revoked by the Dean'
        WHERE purpose = 'student_activation' AND user_id = ? AND used_at IS NULL AND revoked_at IS NULL")->execute([$userId]);
    audit_record_action($pdo, $config, $actor, 'people', 'student_invitation_revoked_by_dean', 'user_account', (string) $userId,
        'Revoked the pending Student invitation for ' . $person['display_name'] . '.', ['reason' => 'Revoked by the Dean']);
    $pdo->commit();
    return ['person' => null];
}

/** 9.16: Resend or Revoke for a pending invitation of either kind. Faculty reuse the Faculty Invitations code; each runs its own transaction. */
function people_invitation(PDO $pdo, array $config, array $actor, array $data, string $action): array
{
    $userId = (int) ($data['userId'] ?? 0);
    $person = people_pending_fetch($pdo, $userId, false);
    if ($person['kind'] === 'student') return $action === 'resend' ? people_student_resend($pdo, $config, $actor, $userId) : people_student_revoke($pdo, $config, $actor, $userId);
    $context = ['request_id' => request_id(), 'ip_address' => request_ip(), 'user_agent' => request_user_agent(), 'http_method' => request_method(), 'endpoint' => request_path()];
    try {
        if ($action === 'revoke') {
            if (!faculty_invitation_revoke_core($pdo, $config, $actor, $context, $userId, 'Revoked by the Dean')) {
                throw new SuperadminConflict('no_pending_invitation', 'This person has no pending invitation.');
            }
            return ['person' => null];
        }
        $issued = faculty_invitation_reissue_core($pdo, $config, $actor, $context, $userId);
    } catch (DomainException $e) {
        throw new SuperadminConflict('no_pending_invitation', 'This person has no pending invitation.');
    }
    $sent = faculty_invitation_send_reissued($pdo, $config, $actor, $issued);
    return ['person' => people_one($pdo, $userId, 'faculty'), 'delivery' => $sent ? 'Sent' : 'Failed'];
}

/** 9.17: course and class options for the People filters: this school year's non-archived classes, and the courses that have one. */
function people_filter_options(PDO $pdo): array
{
    $stmt = $pdo->prepare('SELECT cs.cs_id, cs.cs_name, cs.course_id, c.course_code, c.name FROM class_sections cs JOIN courses c ON c.course_id = cs.course_id
        WHERE cs.school_year = ? AND cs.archived_at IS NULL ORDER BY c.course_code, cs.cs_name, cs.cs_id');
    $stmt->execute([academic_current_school_year($pdo)]);
    $courses = [];
    $classes = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $courses[(int) $r['course_id']] ??= ['id' => (int) $r['course_id'], 'courseCode' => $r['course_code'], 'name' => $r['name']];
        $classes[] = ['csId' => (int) $r['cs_id'], 'label' => $r['cs_name'], 'courseId' => (int) $r['course_id']];
    }
    return ['courses' => array_values($courses), 'classes' => $classes];
}

function handle_admin_people(): void
{
    $pdo = null;
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $actor = admin_verify_auth($pdo, $config);
        if (request_method() === 'GET' && basename(request_path()) === 'filters') {
            json_response(['status' => 'ok'] + people_filter_options($pdo));
            return;
        }
        if (request_method() === 'GET') {
            $kind = (string) ($_GET['kind'] ?? 'faculty');
            $status = (string) ($_GET['status'] ?? 'all');
            $page = (string) ($_GET['page'] ?? '1');
            $q = trim((string) ($_GET['q'] ?? ''));
            $errors = [];
            if (!in_array($kind, ['faculty', 'student'], true)) $errors['kind'] = 'Kind must be faculty or student.';
            if (!in_array($status, ['active', 'deactivated', 'invited', 'all'], true)) $errors['status'] = 'Status must be active, deactivated, invited or all.';
            if (preg_match('/^[1-9]\d{0,5}$/', $page) !== 1) $errors['page'] = 'Page must be a positive whole number.';
            if (mb_strlen($q) > 100) $errors['q'] = 'Search must be 100 characters or fewer.';
            $filters = [];
            $allowed = ['twoFactor' => ['on', 'off'], 'activity' => ['never', 'inactive30'],
                'classes' => $kind === 'faculty' ? ['current', 'none'] : [], 'face' => $kind === 'student' ? ['enrolled', 'not_enrolled'] : []];
            foreach ($allowed as $key => $values) {
                if (!isset($_GET[$key])) continue;
                if (!in_array((string) $_GET[$key], $values, true)) $errors[$key] = "Invalid {$key} filter.";
                else $filters[$key] = (string) $_GET[$key];
            }
            if (isset($_GET['secretary'])) {
                if ($kind !== 'student' || (string) $_GET['secretary'] !== '1') $errors['secretary'] = 'Invalid secretary filter.';
                else $filters['secretary'] = true;
            }
            foreach (['courseId', 'classId'] as $key) {
                if (!isset($_GET[$key])) continue;
                $value = (string) $_GET[$key];
                if ($key === 'classId' && $kind !== 'student') $errors[$key] = 'The class filter is for Students only.';
                elseif (preg_match('/^[1-9]\d{0,8}$/', $value) !== 1) $errors[$key] = "Invalid {$key} filter.";
                else $filters[$key] = (int) $value;
            }
            if (isset($filters['classId'])) { // 9.17: only a class of this school year, not archived
                $known = $pdo->prepare('SELECT 1 FROM class_sections WHERE cs_id = ? AND school_year = ? AND archived_at IS NULL');
                $known->execute([$filters['classId'], academic_current_school_year($pdo)]);
                if ($known->fetchColumn() === false) $errors['classId'] = 'Choose a class of this school year.';
            }
            if ($errors !== []) throw new ValidationException($errors);
            json_response(['status' => 'ok'] + people_list($pdo, $kind, $status, $q, (int) $page, null, $filters));
            return;
        }
        $body = request_body();
        if (!$body['has_body']) { safe_error_response('Request body required.', 400); return; }
        $name = basename(request_path());
        if (in_array($name, ['resend', 'revoke'], true)) { // run their own transactions (the Faculty code commits by itself)
            json_response(['status' => 'ok'] + people_invitation($pdo, $config, $actor, $body['data'], $name));
            return;
        }
        $pdo->beginTransaction();
        $result = match ($name) {
            'deactivate' => people_deactivate($pdo, $config, $actor, $body['data']),
            'reactivate' => people_reactivate($pdo, $config, $actor, $body['data']),
            'sign-out' => people_sign_out($pdo, $config, $actor, $body['data']),
            'reset-2fa' => people_reset_2fa($pdo, $config, $actor, $body['data']),
            default => null,
        };
        if ($result === null) { $pdo->rollBack(); safe_error_response('Not found.', 404); return; }
        $pdo->commit();
        $afterCommit = $result['afterCommit'] ?? null;
        unset($result['afterCommit']);
        if ($afterCommit !== null) $afterCommit();
        json_response(['status' => 'ok'] + $result);
    } catch (ValidationException $e) {
        if ($pdo instanceof PDO && $pdo->inTransaction()) $pdo->rollBack();
        validation_error_response($e->getErrors());
    } catch (SuperadminConflict $e) {
        superadmin_conflict_response($pdo, $e);
    } catch (Throwable $e) {
        if ($pdo instanceof PDO && $pdo->inTransaction()) $pdo->rollBack();
        error_log('Admin people error: ' . sanitize_for_log($e));
        safe_error_response('Unable to update the account.', 500);
    }
}
