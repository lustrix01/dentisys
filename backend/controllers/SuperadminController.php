<?php

declare(strict_types=1);

/**
 * ADM-001 Superadmin (docs/contracts/superadmin.md, dean-superadmin-split.md): Course Catalog (Part B) and People & Accounts (Part C).
 * Every route here needs the Superadmin role (superadmin_verify_auth) and nothing else. Same shape as RoomController.
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
        $actor = superadmin_verify_auth($pdo, $config);
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
 * The Faculty, Dean or Student account behind a user id, or 404. The Dean counts as Faculty (DS9). Secretary-only accounts, the Superadmin and unknown ids are not people (SA23).
 * A Student's canonical account is students.student_account_user_id (its role may be 'secretary' for a Class Secretary).
 */
function people_fetch(PDO $pdo, int $userId, bool $lock = false): array
{
    $stmt = $pdo->prepare("SELECT ua.user_id, ua.display_name, ua.login_email, ua.role, ua.status, ua.disabled_at,
            s.student_id, s.student_number,
            CASE WHEN ua.role IN ('faculty', 'admin') THEN 'faculty' ELSE 'student' END AS kind
        FROM user_accounts ua LEFT JOIN students s ON s.student_account_user_id = ua.user_id
        WHERE ua.user_id = ? AND (ua.role IN ('faculty', 'admin') OR (ua.role IN ('student', 'secretary') AND s.student_id IS NOT NULL))"
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
    $parts = isset($r['name_parts']) ? (json_decode((string) $r['name_parts'], true) ?: []) : []; // the Edit Name dialog's current values
    $json['nameParts'] = ['prefix' => $parts['prefix'] ?? null, 'firstName' => $parts['firstName'] ?? null, 'middleName' => $parts['middleName'] ?? null,
        'lastName' => $parts['lastName'] ?? null, 'suffix' => $parts['suffix'] ?? null];
    if ($r['kind'] === 'faculty') {
        $json['classes'] = $classes;
        $json['isDean'] = (bool) ($r['is_dean'] ?? false);
    } else {
        $json['studentId'] = (int) ($r['student_id'] ?? 0);
        $json['studentNo'] = $r['student_number'];
        $json['faceEnrolled'] = (bool) ($r['face_enrolled'] ?? false);
        $json['enrolledClasses'] = $classes;
    }
    return $json;
}

/** FROM/WHERE of the People list and the Overview counts, and the SQL test for "invited" (a pending account whose latest invitation is live). */
function people_base_sql(string $kind): array
{
    // The newest invitation token of the account (Faculty: faculty_invitation, Student: student_activation, issued to the Student's own account).
    $latest = " LEFT JOIN LATERAL (SELECT issued_at, expires_at, used_at, revoked_at FROM security_tokens WHERE purpose = '"
        . ($kind === 'faculty' ? 'faculty_invitation' : 'student_activation') . "' AND user_id = ua.user_id ORDER BY issued_at DESC, token_id DESC LIMIT 1) inv ON TRUE";
    $from = $kind === 'faculty'
        ? "FROM user_accounts ua{$latest} WHERE ua.role IN ('faculty', 'admin')" // the Dean is listed as Faculty (DS9)
        : "FROM user_accounts ua JOIN students s ON s.student_account_user_id = ua.user_id{$latest} WHERE ua.role IN ('student', 'secretary')";
    return [$from, "(ua.status = 'Pending Activation' AND inv.issued_at IS NOT NULL AND inv.used_at IS NULL AND inv.revoked_at IS NULL)"];
}

/** Page of people. Classes: Faculty teach them, Students are enrolled in them (current school year first). */
function people_list(PDO $pdo, string $kind, string $status, string $q, int $page, ?int $onlyUserId = null, array $f = []): array
{
    $cur = academic_current_school_year($pdo);
    [$from, $invited] = people_base_sql($kind);
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
    if (isset($f['yearLevel'])) {
        $where[] = 's.year_level = ?';
        $params[] = $f['yearLevel'];
    }
    if (($f['invitation'] ?? '') === 'expired') $where[] = "{$invited} AND inv.expires_at <= (NOW() AT TIME ZONE 'UTC')";
    if (isset($f['classes'])) {
        // classes=none matches the Overview's "Faculty without classes": the Dean never counts there.
        $where[] = ($f['classes'] === 'none' ? "ua.role <> 'admin' AND NOT " : '') . 'EXISTS (SELECT 1 FROM class_sections c WHERE c.instructor_user_id = ua.user_id AND c.school_year = ? AND c.archived_at IS NULL)';
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
    // Sort keys are whitelisted by the handler; NULLS LAST keeps people who never signed in at the bottom in both directions.
    $dir = ($f['dir'] ?? 'asc') === 'desc' ? 'DESC' : 'ASC';
    $classCount = $kind === 'faculty'
        ? '(SELECT COUNT(*) FROM class_sections c WHERE c.instructor_user_id = ua.user_id AND c.school_year = ' . $pdo->quote($cur) . ' AND c.archived_at IS NULL)'
        : "(SELECT COUNT(*) FROM enrollments e JOIN class_sections c ON c.cs_id = e.cs_id WHERE e.student_id = s.student_id AND e.status = 'Active' AND c.school_year = " . $pdo->quote($cur) . ' AND c.archived_at IS NULL)';
    $orderBy = match ($f['sort'] ?? 'name') {
        'studentNo' => "s.student_number {$dir}, ua.display_name, ua.user_id",
        'lastActivity' => "(SELECT MAX(a.last_seen_at) FROM auth_sessions a WHERE a.user_id = ua.user_id) {$dir} NULLS LAST, ua.display_name, ua.user_id",
        'classes' => "{$classCount} {$dir}, ua.display_name, ua.user_id",
        default => "ua.display_name {$dir}, ua.user_id",
    };
    $total = $pdo->prepare("SELECT COUNT(*) {$from}{$whereSql}");
    $total->execute($params);
    $stmt = $pdo->prepare("SELECT ua.user_id, ua.display_name, ua.login_email, ua.status, ua.disabled_at, '{$kind}' AS kind, (ua.role = 'admin') AS is_dean, inv.issued_at AS invited_at, inv.expires_at AS invitation_expires_at"
        . ($kind === 'student' ? ", s.student_id, s.student_number, {$faceSql} AS face_enrolled" : ', NULL AS student_id, NULL AS student_number') . ",
        EXISTS (SELECT 1 FROM security_tokens t WHERE t.user_id = ua.user_id AND t.purpose = 'mfa_credential' AND t.mfa_status = 'enabled') AS two_factor,
        (SELECT MAX(a.last_seen_at) FROM auth_sessions a WHERE a.user_id = ua.user_id) AS last_activity_at,
        (SELECT json_build_object('prefix', pi.name_prefix, 'firstName', pi.first_name, 'middleName', pi.middle_name, 'lastName', pi.last_name, 'suffix', pi.name_suffix)
           FROM person_identities pi WHERE pi.person_id = ua.person_id) AS name_parts
        {$from}{$whereSql} ORDER BY {$orderBy} LIMIT " . PEOPLE_PAGE_SIZE . ' OFFSET ' . (($page - 1) * PEOPLE_PAGE_SIZE));
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
    if ($person['role'] === 'admin') throw new SuperadminConflict('dean_not_deactivatable', 'The Dean cannot be deactivated. Hand the Dean role to a Faculty member instead.', [], 422);
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
    people_end_sessions($pdo, $userId, 'Signed out by the Superadmin');
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
             revoked_at = ?, revocation_reason = 'Reset by the Superadmin'
         WHERE user_id = ? AND purpose IN ('mfa_credential', 'mfa_recovery') AND revoked_at IS NULL"
    );
    $revoke->execute([(new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d H:i:s.u'), $userId]);
    if ($revoke->rowCount() === 0) throw new SuperadminConflict('two_factor_off', 'This person does not use 2FA.');
    people_end_sessions($pdo, $userId, '2FA reset by the Superadmin');
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

/**
 * 12.1 Move to new email (docs/contracts/roles.md section 4), shared by the Dean's People action and bin/account-admin.php.
 * Runs inside the caller's transaction; returns the after-commit mail sender. $account needs user_id, login_email, display_name.
 * $idChecked only changes the audit wording (the script has no ID check).
 */
function account_move_email_check(PDO $pdo, array $account, string $newEmail): void
{
    if (strcasecmp((string) $account['login_email'], $newEmail) === 0) throw new SuperadminConflict('email_unchanged', "This is already the person's email.", [], 422);
    if (email_is_retired($pdo, $newEmail)) throw new SuperadminConflict('email_retired', 'That email address was retired and cannot be used again.');
    $taken = $pdo->prepare('SELECT 1 FROM user_accounts WHERE login_email = ? UNION ALL SELECT 1 FROM students WHERE bu_email = ? LIMIT 1');
    $taken->execute([$newEmail, $newEmail]);
    if ($taken->fetchColumn() !== false) throw new SuperadminConflict('email_taken', 'That email address is already used by another account.');
}

function account_move_email(PDO $pdo, array $config, array $actor, array $account, string $newEmail, string $reason, bool $idChecked): Closure
{
    $userId = (int) $account['user_id'];
    $old = (string) $account['login_email'];
    $name = (string) $account['display_name'];
    account_move_email_check($pdo, $account, $newEmail);

    $pdo->prepare('INSERT INTO retired_emails (email, user_id, reason) VALUES (?, ?, ?)')->execute([$old, $userId, $reason]);
    // The random password hash makes every old password useless; the person sets a new one with the emailed link.
    $pdo->prepare('UPDATE user_accounts SET login_email = ?, password_hash = ?, google_subject = NULL, updated_at = CURRENT_TIMESTAMP(6) WHERE user_id = ?')
        ->execute([$newEmail, password_hash_user_password(bin2hex(random_bytes(32))), $userId]);
    // A Student's record email and a Class Secretary's sign-in are the same account; migration 005 checks they match at commit.
    $pdo->prepare('UPDATE students SET bu_email = ? WHERE student_account_user_id = ? OR user_id = ?')->execute([$newEmail, $userId, $userId]);
    people_end_sessions($pdo, $userId, 'Moved to a new email');
    $nowSql = (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d H:i:s.u');
    $pdo->prepare(
        "UPDATE security_tokens
         SET mfa_status = CASE WHEN purpose = 'mfa_credential' THEN 'revoked' ELSE mfa_status END, revoked_at = ?, revocation_reason = 'Moved to a new email'
         WHERE user_id = ? AND purpose IN ('mfa_credential', 'mfa_recovery') AND revoked_at IS NULL"
    )->execute([$nowSql, $userId]);
    $pdo->prepare("UPDATE security_tokens SET revoked_at = ?, revocation_reason = 'Moved to a new email'
        WHERE purpose = 'password_reset' AND user_id = ? AND used_at IS NULL AND revoked_at IS NULL")->execute([$nowSql, $userId]);
    $token = bin2hex(random_bytes(16)); // same token and 24-hour expiry as PasswordResetController
    $pdo->prepare("INSERT INTO security_tokens (purpose, user_id, secret_hash, issued_at, expires_at) VALUES ('password_reset', ?, ?, ?, ?)")
        ->execute([$userId, hash('sha256', $token), $nowSql, (new DateTimeImmutable($nowSql, new DateTimeZone('UTC')))->add(new DateInterval('P1D'))->format('Y-m-d H:i:s.u')]);
    $subject = 'Set your DentiSYS password';
    $body = email_account_moved_html($name, $newEmail, app_url($config, '/reset-password', ['token' => $token]));
    $outbox = $pdo->prepare("INSERT INTO email_outbox (sender_user_id, recipient_email, recipient_name, subject, email_type, message_body, status, operation_uuid, action_uuid)
        VALUES (?, ?, ?, ?, 'Password Setup', ?, 'Pending', ?, ?) RETURNING email_id");
    $outbox->execute([$actor['user_id'] ?? $userId, $newEmail, $name, $subject, $body, uuid_v4_string(), uuid_v4_string()]);
    $emailId = (int) $outbox->fetchColumn();
    audit_record_action($pdo, $config, $actor, 'people', 'account_email_moved', 'user_account', (string) $userId,
        "Moved {$name} to a new email: {$old} → {$newEmail}." . ($idChecked ? ' University ID checked in person.' : ''),
        ['before' => ['email' => $old], 'after' => ['email' => $newEmail], 'reason' => $reason]);
    return static function () use ($pdo, $config, $emailId, $newEmail, $subject, $body): void {
        try {
            if (!student_invitation_outbox_send($pdo, $config, $emailId, $newEmail, $subject, $body)) error_log('Email move: the password-setup email was not delivered.');
        } catch (Throwable $e) {
            error_log('Email move mail error: ' . sanitize_for_log($e));
        }
    };
}

/** A Faculty or Student account that has signed up (active or deactivated), else 404 person_not_found or 422 move_not_allowed (invited people, the Superadmin). */
function people_fetch_for_move(PDO $pdo, int $userId): array
{
    try {
        return people_fetch($pdo, $userId, true);
    } catch (SuperadminConflict $e) {
        $exists = $pdo->prepare('SELECT 1 FROM user_accounts WHERE user_id = ?');
        $exists->execute([$userId]);
        if ($exists->fetchColumn() === false) throw $e;
        throw new SuperadminConflict('move_not_allowed', 'Email moves are for accounts that have signed up.', [], 422);
    }
}

function people_move_email(PDO $pdo, array $config, array $actor, array $data): array
{
    $errors = [];
    if (($data['idChecked'] ?? null) !== true) $errors[] = ['field' => 'idChecked', 'message' => "Confirm that you checked this person's university ID in person."];
    $reason = '';
    try {
        $reason = validate_required_string($data, 'reason', 8, 240);
    } catch (ValidationException $e) {
        $errors[] = $e->getErrors()[0];
    }
    $newEmail = '';
    try {
        $newEmail = validate_institutional_email((string) ($data['newEmail'] ?? ''));
    } catch (ValidationException $e) {
        $errors[] = ['field' => 'newEmail', 'message' => $e->getErrors()[0]['message']];
    }
    if ($errors !== []) throw new ValidationException($errors);
    $userId = (int) ($data['userId'] ?? 0);
    $person = people_fetch_for_move($pdo, $userId);
    $afterCommit = account_move_email($pdo, $config, $actor, $person, $newEmail, $reason, true);
    return ['person' => people_one($pdo, $userId, $person['kind']), 'afterCommit' => $afterCommit];
}

/** 12.1 Edit name (roles.md section 5): same fields, rules and display name as Change Name, but the Dean edits another account and needs no 2FA code. */
function people_edit_name(PDO $pdo, array $config, array $actor, array $data): array
{
    $errors = [];
    $parts = null;
    try {
        $name = $data['name'] ?? null; // the body parser casts only the top level, so a nested object arrives as stdClass
        $parts = account_identity_name_parts($name instanceof stdClass ? (array) $name : (is_array($name) ? $name : []));
        if ($parts === null) $errors[] = ['field' => 'firstName', 'message' => 'Provide the separate name fields; combined names are not split automatically.'];
    } catch (ValidationException $e) {
        $errors = array_merge($errors, $e->getErrors());
    }
    $reason = '';
    try {
        $reason = validate_required_string($data, 'reason', 8, 240);
    } catch (ValidationException $e) {
        $errors[] = $e->getErrors()[0];
    }
    if ($errors !== []) throw new ValidationException($errors);
    $userId = (int) ($data['userId'] ?? 0);
    $person = people_fetch($pdo, $userId, true);
    $current = account_identity_fetch($pdo, $userId, true);
    if ($current === null) throw new SuperadminConflict('person_not_found', 'Account not found.', [], 404);
    $old = account_identity_profile_parts($current);
    if (array_filter(array_keys($parts), static fn(string $k): bool => !account_identity_parts_match($old[$k], $parts[$k])) === []) {
        throw new SuperadminConflict('name_unchanged', "That is already the person's name.", [], 422);
    }
    account_identity_sync_canonical_person($pdo, (int) $current['person_id'], $parts);
    $labels = ['prefix' => 'Prefix', 'firstName' => 'First name', 'middleName' => 'Middle name', 'lastName' => 'Last name', 'suffix' => 'Suffix'];
    $before = ['Name' => (string) $person['display_name']];
    $after = ['Name' => account_identity_composed_name($parts)];
    foreach ($labels as $key => $label) {
        $before[$label] = trim((string) $old[$key]) === '' ? null : (string) $old[$key];
        $after[$label] = trim((string) $parts[$key]) === '' ? null : (string) $parts[$key];
    }
    $changed = audit_changed_fields($before, $after) ?? [$before, $after];
    audit_record_action($pdo, $config, $actor, 'people', 'account_name_changed_by_dean', 'user_account', (string) $userId,
        'Corrected the name of ' . $person['display_name'] . ' (' . ucfirst($person['kind']) . ') to ' . $after['Name'] . '.',
        ['before' => $changed[0], 'after' => $changed[1], 'reason' => $reason]);
    return ['person' => people_one($pdo, $userId, $person['kind'])];
}

/**
 * D14/D15: why the Dean role cannot move to this Faculty member now, as a conflict to throw; null when it can.
 * A term is in progress (term_in_progress), or the new Dean has a class whose term has not ended (new_dean_has_classes).
 */
function people_transfer_blocker(PDO $pdo, array $target): ?SuperadminConflict
{
    $today = (new DateTimeImmutable('now', new DateTimeZone('Asia/Manila')))->format('Y-m-d');
    $terms = academic_terms_read($pdo);
    foreach ($terms as $t) {
        if ($t['start_date'] <= $today && $t['end_date'] >= $today) {
            return new SuperadminConflict('term_in_progress', "A term is in progress ({$t['school_year']} {$t['semester']}, {$t['start_date']} to {$t['end_date']}). Hand over the Dean role between terms.");
        }
    }
    $stmt = $pdo->prepare('SELECT cs_id, cs_name, school_year, semester, term_start_date, term_end_date FROM class_sections WHERE instructor_user_id = ? AND archived_at IS NULL ORDER BY cs_name');
    $stmt->execute([(int) $target['user_id']]);
    $current = academic_current_school_year($pdo);
    $blocking = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $class) {
        $end = academic_resolve_class_term_dates($class, $terms)['endDate'];
        // shortcut: a class with no term dates counts as not ended while its school year is the current or a later one.
        if ($end === null ? strcmp((string) $class['school_year'], $current) >= 0 : (string) $end >= $today) {
            $blocking[] = ['csId' => (int) $class['cs_id'], 'label' => $class['cs_name']];
        }
    }
    if ($blocking === []) return null;
    $n = count($blocking);
    return new SuperadminConflict('new_dean_has_classes',
        $target['display_name'] . ' teaches ' . $n . ($n === 1 ? ' class' : ' classes') . ' whose term has not ended. Reassign or archive them first.', ['classes' => $blocking]);
}

/**
 * D14/D15, contract 4.3: hands the Dean role to an active Faculty member. Runs inside the caller's transaction (the people handler's);
 * returns the new Dean, the former Dean and the after-commit mail sender. Rules are the former transfer-dean script command's.
 * $data: toUserId, oldDean ("faculty" | "deactivate", no default), reason (8 to 240 characters).
 */
function people_transfer_dean(PDO $pdo, array $config, array $actor, array $data): array
{
    $errors = [];
    $choice = (string) ($data['oldDean'] ?? '');
    if (!in_array($choice, ['faculty', 'deactivate'], true)) $errors[] = ['field' => 'oldDean', 'message' => 'Choose what happens to the current Dean.'];
    $reason = '';
    try {
        $reason = validate_required_string($data, 'reason', 8, 240);
    } catch (ValidationException $e) {
        $errors[] = $e->getErrors()[0];
    }
    if ($errors !== []) throw new ValidationException($errors);

    $stmt = $pdo->prepare("SELECT user_id, login_email, display_name FROM user_accounts WHERE user_id = ? AND role = 'faculty' AND status = 'Active' FOR UPDATE");
    $stmt->execute([(int) ($data['toUserId'] ?? 0)]);
    $target = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($target === false) throw new SuperadminConflict('not_active_faculty', 'Only an active Faculty member can become Dean.', [], 422);
    $deans = $pdo->query("SELECT user_id, login_email, display_name FROM user_accounts WHERE role = 'admin' AND status = 'Active' FOR UPDATE")->fetchAll(PDO::FETCH_ASSOC);
    if (count($deans) !== 1) throw new SuperadminConflict('dean_unavailable', 'Expected exactly one active Dean account.');
    $dean = $deans[0];
    $blocker = people_transfer_blocker($pdo, $target);
    if ($blocker !== null) throw $blocker;

    $pdo->prepare("UPDATE user_accounts SET role = 'admin', updated_at = CURRENT_TIMESTAMP(6) WHERE user_id = ?")->execute([$target['user_id']]);
    $pdo->prepare("UPDATE user_accounts SET role = 'faculty', status = ?, disabled_at = " . ($choice === 'deactivate' ? 'CURRENT_TIMESTAMP(6)' : 'NULL') . ', updated_at = CURRENT_TIMESTAMP(6) WHERE user_id = ?')
        ->execute([$choice === 'deactivate' ? 'Disabled' : 'Active', $dean['user_id']]);
    foreach ([(int) $target['user_id'], (int) $dean['user_id']] as $id) people_end_sessions($pdo, $id, 'Dean role handed over');
    audit_record_action($pdo, $config, $actor, 'people', 'dean_transferred', 'user_account', (string) $target['user_id'],
        "Dean role handed over from {$dean['display_name']} to {$target['display_name']}; the outgoing Dean " . ($choice === 'faculty' ? 'is Faculty again.' : 'was deactivated.'),
        ['before' => ['Dean' => $dean['display_name']], 'after' => ['Dean' => $target['display_name'], 'Outgoing Dean' => $choice === 'faculty' ? 'Faculty' : 'Deactivated'], 'reason' => $reason]);
    // Both notices go through the email outbox with the Superadmin as sender (Email History), like the other People actions.
    $subject = 'The DentiSYS Dean role changed';
    $outbox = $pdo->prepare("INSERT INTO email_outbox (sender_user_id, recipient_email, recipient_name, subject, email_type, message_body, status, operation_uuid, action_uuid)
        VALUES (?, ?, ?, ?, 'Account', ?, 'Pending', ?, ?) RETURNING email_id");
    $mails = [];
    foreach ([[$target, ["You are now the Dean of DentiSYS ({$reason})."]],
        [$dean, ['You are no longer the Dean of DentiSYS' . ($choice === 'faculty' ? '; your account is a Faculty account again.' : ' and your account was deactivated.')]]] as [$person, $lines]) {
        $body = email_dean_transferred_html((string) $person['display_name'], $lines);
        $outbox->execute([$actor['user_id'] ?? null, (string) $person['login_email'], (string) $person['display_name'], $subject, $body, uuid_v4_string(), uuid_v4_string()]);
        $mails[] = [(int) $outbox->fetchColumn(), (string) $person['login_email'], $body];
    }
    return ['dean' => people_one($pdo, (int) $target['user_id'], 'faculty'), 'formerDean' => people_one($pdo, (int) $dean['user_id'], 'faculty'),
        'afterCommit' => static function () use ($pdo, $config, $mails, $subject): void {
            foreach ($mails as [$emailId, $email, $body]) {
                try {
                    if (!student_invitation_outbox_send($pdo, $config, $emailId, $email, $subject, $body)) error_log('Dean handover: a notice email was not delivered.');
                } catch (Throwable $e) {
                    error_log('Dean handover mail error: ' . sanitize_for_log($e));
                }
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
    $issued = student_invitation_issue_token($pdo, $userId, (int) $person['student_id'], (int) $c['cs_id'], 'Replaced by a Superadmin resend');
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
    $pdo->prepare("UPDATE security_tokens SET revoked_at = CURRENT_TIMESTAMP(6), revocation_reason = 'Revoked by the Superadmin'
        WHERE purpose = 'student_activation' AND user_id = ? AND used_at IS NULL AND revoked_at IS NULL")->execute([$userId]);
    audit_record_action($pdo, $config, $actor, 'people', 'student_invitation_revoked_by_dean', 'user_account', (string) $userId,
        'Revoked the pending Student invitation for ' . $person['display_name'] . '.', ['reason' => 'Revoked by the Superadmin']);
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
            if (!faculty_invitation_revoke_core($pdo, $config, $actor, $context, $userId, 'Revoked by the Superadmin')) {
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
    $levels = $pdo->query("SELECT DISTINCT s.year_level FROM students s JOIN user_accounts ua ON ua.user_id = s.student_account_user_id
        WHERE ua.role IN ('student', 'secretary') AND s.year_level IS NOT NULL ORDER BY s.year_level")->fetchAll(PDO::FETCH_COLUMN);
    return ['courses' => array_values($courses), 'classes' => $classes, 'yearLevels' => array_map('intval', $levels)];
}

/** Part D: one request for the Superadmin Overview (Superadmin only, not audited). Flat shape documented in docs/contracts/superadmin.md section 12. */
function overview_data(PDO $pdo, array $config, int $superadminId): array
{
    $cur = academic_current_school_year($pdo);
    $manila = new DateTimeZone('Asia/Manila');
    $now = new DateTimeImmutable('now', $manila);
    $today = $now->format('Y-m-d');
    $mfa = "EXISTS (SELECT 1 FROM security_tokens t WHERE t.user_id = ua.user_id AND t.purpose = 'mfa_credential' AND t.mfa_status = 'enabled')";
    $accounts = [];
    $attention = ['expiredInvitations' => ['faculty' => 0, 'students' => 0], 'facultyWithoutClasses' => 0, 'inactive30' => ['faculty' => 0, 'students' => 0], 'nextTermMissing' => false];
    $twoFactor = [];
    foreach (['faculty' => 'faculty', 'student' => 'students'] as $kind => $key) {
        [$from, $invited] = people_base_sql($kind);
        $teaches = $kind === 'faculty' ? "ua.role = 'admin' OR EXISTS (SELECT 1 FROM class_sections c WHERE c.instructor_user_id = ua.user_id AND c.school_year = " . $pdo->quote($cur) . ' AND c.archived_at IS NULL)' : 'TRUE'; // the Dean never counts as "Faculty without classes"
        $row = $pdo->query("SELECT COUNT(*) FILTER (WHERE st = 'active') AS active, COUNT(*) FILTER (WHERE st = 'invited') AS invited,
                COUNT(*) FILTER (WHERE st = 'deactivated') AS deactivated, COUNT(*) FILTER (WHERE expired) AS expired,
                COUNT(*) FILTER (WHERE st = 'active' AND two_factor) AS mfa_on,
                COUNT(*) FILTER (WHERE st = 'active' AND last_seen < NOW() - INTERVAL '30 days') AS inactive30,
                COUNT(*) FILTER (WHERE st = 'active' AND NOT has_class) AS no_class
            FROM (SELECT CASE WHEN ua.status = 'Active' THEN 'active' WHEN ua.status = 'Disabled' THEN 'deactivated' WHEN {$invited} THEN 'invited' END AS st,
                    ({$invited} AND inv.expires_at <= (NOW() AT TIME ZONE 'UTC')) AS expired, {$mfa} AS two_factor,
                    (SELECT MAX(a.last_seen_at) FROM auth_sessions a WHERE a.user_id = ua.user_id) AS last_seen, {$teaches} AS has_class
                {$from}) x")->fetch(PDO::FETCH_ASSOC);
        $accounts[$key] = ['active' => (int) $row['active'], 'invited' => (int) $row['invited'], 'deactivated' => (int) $row['deactivated']];
        $twoFactor[$key] = ['on' => (int) $row['mfa_on'], 'total' => (int) $row['active']];
        $attention['expiredInvitations'][$key] = (int) $row['expired'];
        $attention['inactive30'][$key] = (int) $row['inactive30'];
        if ($kind === 'faculty') $attention['facultyWithoutClasses'] = (int) $row['no_class'];
    }

    // Asia/Manila weeks start on Monday: 12 weeks ending with the current one, zero-filled.
    $monday = $now->setTime(0, 0)->modify('monday this week');
    $weeks = [];
    for ($i = 11; $i >= 0; $i--) $weeks[$monday->modify("-{$i} weeks")->format('Y-m-d')] = ['weekStart' => $monday->modify("-{$i} weeks")->format('Y-m-d'), 'faculty' => 0, 'students' => 0];
    $stmt = $pdo->prepare("SELECT to_char(date_trunc('week', (e.occurred_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Manila'), 'YYYY-MM-DD') AS week_start,
            CASE WHEN ua.role = 'faculty' THEN 'faculty' ELSE 'students' END AS kind, COUNT(DISTINCT e.actor_user_id) AS users
        FROM audit_events e JOIN user_accounts ua ON ua.user_id = e.actor_user_id
        WHERE e.action_code IN ('login_success', 'google_login_success') AND ua.role IN ('faculty', 'student', 'secretary')
          AND e.occurred_at >= ? GROUP BY 1, 2");
    $stmt->execute([$monday->modify('-11 weeks')->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s')]);
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
        if (isset($weeks[$r['week_start']])) $weeks[$r['week_start']][$r['kind']] = (int) $r['users'];
    }

    $days = [];
    for ($i = 13; $i >= 0; $i--) $days[$now->modify("-{$i} days")->format('Y-m-d')] = ['day' => $now->modify("-{$i} days")->format('Y-m-d'), 'count' => 0];
    $stmt = $pdo->prepare("SELECT to_char((e.occurred_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD') AS day, COUNT(*) AS n
        FROM audit_events e WHERE e.action_code IN ('login_failed', 'google_login_denied') AND e.occurred_at >= ? GROUP BY 1");
    $stmt->execute([$now->setTime(0, 0)->modify('-13 days')->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s')]);
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
        if (isset($days[$r['day']])) $days[$r['day']]['count'] = (int) $r['n'];
    }

    // The current term is the one whose dates contain today; the next is missing when no term starts after the current one ends.
    $terms = academic_terms_read($pdo);
    $current = null;
    foreach ($terms as $t) if ($t['start_date'] <= $today && $t['end_date'] >= $today) { $current = $t; break; }
    if ($current !== null) {
        $attention['nextTermMissing'] = array_filter($terms, static fn(array $t): bool => $t['start_date'] > $current['end_date']) === [];
    }

    $yearLevels = $pdo->query("SELECT s.year_level AS year_level, COUNT(*) AS n FROM students s JOIN user_accounts ua ON ua.user_id = s.student_account_user_id
        WHERE ua.role IN ('student', 'secretary') AND ua.status = 'Active' AND s.year_level IS NOT NULL GROUP BY 1 ORDER BY 1")->fetchAll(PDO::FETCH_ASSOC);
    $sections = $pdo->prepare('SELECT c.course_code, COUNT(*) AS n FROM class_sections cs JOIN courses c ON c.course_id = cs.course_id
        WHERE cs.school_year = ? AND cs.archived_at IS NULL GROUP BY c.course_id, c.course_code ORDER BY n DESC, c.course_code LIMIT 10');
    $sections->execute([$cur]);
    $counts = $pdo->query("SELECT (SELECT COUNT(*) FROM courses WHERE status = 'active') AS ca, (SELECT COUNT(*) FROM courses WHERE status = 'retired') AS cr,
        (SELECT COUNT(*) FROM rooms WHERE status = 'active') AS ra, (SELECT COUNT(*) FROM rooms WHERE status = 'retired') AS rr")->fetch(PDO::FETCH_ASSOC);

    // DS6 (look check 2026-11-18): the latest 10 rows of the Superadmin's audit view, the entry shape the Dean Dashboard had.
    $recent = audit_read_params([], 'superadmin');
    $recent['pageSize'] = 10;

    return ['faceFlagsOpen' => face_flags_open_count($pdo), 'recentAuditEvents' => audit_read_entries($pdo, ['user_id' => $superadminId, 'role' => 'superadmin'], $recent)['entries'],
        'attention' => $attention, 'accounts' => $accounts, 'signIns' => array_values($weeks),
        'security' => ['twoFactor' => $twoFactor, 'failedSignIns' => array_values($days)],
        'yearLevels' => array_map(static fn(array $r): array => ['yearLevel' => (int) $r['year_level'], 'students' => (int) $r['n']], $yearLevels),
        'sectionsByCourse' => array_map(static fn(array $r): array => ['courseCode' => $r['course_code'], 'sections' => (int) $r['n']], $sections->fetchAll(PDO::FETCH_ASSOC)),
        'setup' => ['currentTerm' => $current === null ? null : ['semester' => $current['semester'], 'schoolYear' => $current['school_year'], 'endDate' => $current['end_date']],
            'courses' => ['active' => (int) $counts['ca'], 'retired' => (int) $counts['cr']], 'rooms' => ['active' => (int) $counts['ra'], 'retired' => (int) $counts['rr']]]];
}

function handle_admin_overview(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $superadminId = (int) superadmin_verify_auth($pdo, $config)['user_id'];
        json_response(['status' => 'ok'] + overview_data($pdo, $config, $superadminId));
    } catch (Throwable $e) {
        error_log('Admin overview error: ' . sanitize_for_log($e));
        safe_error_response('Unable to load the overview.', 500);
    }
}

function handle_admin_people(): void
{
    $pdo = null;
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $actor = superadmin_verify_auth($pdo, $config);
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
            if (isset($_GET['yearLevel'])) {
                $value = (string) $_GET['yearLevel'];
                if ($kind !== 'student') $errors['yearLevel'] = 'The year level filter is for Students only.';
                elseif (preg_match('/^[1-9]\d?$/', $value) !== 1) $errors['yearLevel'] = 'Invalid yearLevel filter.';
                else $filters['yearLevel'] = (int) $value;
            }
            if (isset($_GET['invitation'])) {
                if ((string) $_GET['invitation'] !== 'expired' || !in_array($status, ['invited', 'all'], true)) $errors['invitation'] = 'The invitation filter is expired, with status invited or all.';
                else $filters['invitation'] = 'expired';
            }
            $sort = (string) ($_GET['sort'] ?? 'name');
            if (!in_array($sort, $kind === 'student' ? ['name', 'studentNo', 'lastActivity', 'classes'] : ['name', 'lastActivity', 'classes'], true)) $errors['sort'] = 'Sort must be name, studentNo (Students), lastActivity or classes.';
            else $filters['sort'] = $sort;
            $dir = (string) ($_GET['dir'] ?? 'asc');
            if (!in_array($dir, ['asc', 'desc'], true)) $errors['dir'] = 'Direction must be asc or desc.';
            else $filters['dir'] = $dir;
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
            'move-email' => people_move_email($pdo, $config, $actor, $body['data']),
            'name' => people_edit_name($pdo, $config, $actor, $body['data']),
            'transfer-dean' => people_transfer_dean($pdo, $config, $actor, $body['data']),
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

// ---- 12.2: Face Enrolment Flags (docs/contracts/face-reenrolment.md section 4) ----

function handle_admin_face_flags(): void
{
    $pdo = null;
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $actor = superadmin_verify_auth($pdo, $config);
        if (request_method() === 'GET') {
            $status = (string) ($_GET['status'] ?? 'open');
            $page = (string) ($_GET['page'] ?? '1');
            $q = trim((string) ($_GET['q'] ?? ''));
            $errors = [];
            $filters = ['status' => $status, 'q' => $q];
            if (!in_array($status, ['open', 'dismissed', 'all'], true)) $errors['status'] = 'Status must be open, dismissed or all.';
            if (preg_match('/^[1-9]\d{0,5}$/', $page) !== 1) $errors['page'] = 'Page must be a positive whole number.';
            if (mb_strlen($q) > 100) $errors['q'] = 'Search must be 100 characters or fewer.';
            if (isset($_GET['kind'])) {
                if (!in_array((string) $_GET['kind'], ['F1', 'F2'], true)) $errors['kind'] = 'Kind must be F1 or F2.';
                else $filters['kind'] = (string) $_GET['kind'];
            }
            foreach (['courseId', 'classId'] as $key) {
                if (!isset($_GET[$key])) continue;
                if (preg_match('/^[1-9]\d{0,8}$/', (string) $_GET[$key]) !== 1) $errors[$key] = "Invalid {$key} filter.";
                else $filters[$key] = (int) $_GET[$key];
            }
            if (isset($filters['classId'])) { // like People: only a class of this school year, not archived
                $known = $pdo->prepare('SELECT 1 FROM class_sections WHERE cs_id = ? AND school_year = ? AND archived_at IS NULL');
                $known->execute([$filters['classId'], academic_current_school_year($pdo)]);
                if ($known->fetchColumn() === false) $errors['classId'] = 'Choose a class of this school year.';
            }
            if ($errors !== []) throw new ValidationException($errors);
            json_response(['status' => 'ok'] + face_flags_list($pdo, $filters, (int) $page));
            return;
        }
        $body = request_body();
        if (!$body['has_body']) { safe_error_response('Request body required.', 400); return; }
        $pdo->beginTransaction();
        $result = face_flag_dismiss($pdo, $config, $actor, $body['data']);
        $pdo->commit();
        json_response(['status' => 'ok'] + $result);
    } catch (ValidationException $e) {
        if ($pdo instanceof PDO && $pdo->inTransaction()) $pdo->rollBack();
        validation_error_response($e->getErrors());
    } catch (SuperadminConflict $e) {
        superadmin_conflict_response($pdo, $e);
    } catch (Throwable $e) {
        if ($pdo instanceof PDO && $pdo->inTransaction()) $pdo->rollBack();
        error_log('Admin face flags error: ' . sanitize_for_log($e));
        safe_error_response('Unable to update the face enrolment flags.', 500);
    }
}
