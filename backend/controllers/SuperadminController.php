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
        'status' => $r['status'] === 'Active' ? 'active' : 'deactivated', 'disabledAt' => $r['disabled_at'] === null ? null : audit_manila_iso((string) $r['disabled_at']),
        'twoFactor' => (bool) $r['two_factor'], 'lastActivityAt' => $r['last_activity_at'] === null ? null : audit_manila_iso((string) $r['last_activity_at'])];
    if ($r['kind'] === 'faculty') {
        $json['classes'] = $classes;
    } else {
        $json['studentNo'] = $r['student_number'];
        $json['enrolledClasses'] = $classes;
    }
    return $json;
}

/** Page of people. Classes: Faculty teach them, Students are enrolled in them (current school year first). */
function people_list(PDO $pdo, string $kind, string $status, string $q, int $page, ?int $onlyUserId = null): array
{
    $cur = academic_current_school_year($pdo);
    $from = $kind === 'faculty'
        ? "FROM user_accounts ua WHERE ua.role = 'faculty'"
        : "FROM user_accounts ua JOIN students s ON s.student_account_user_id = ua.user_id WHERE ua.role IN ('student', 'secretary')";
    $where = ['ua.status IN (' . ($status === 'active' ? "'Active'" : ($status === 'deactivated' ? "'Disabled'" : "'Active','Disabled'")) . ')'];
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
    $whereSql = ' AND ' . implode(' AND ', $where);
    $total = $pdo->prepare("SELECT COUNT(*) {$from}{$whereSql}");
    $total->execute($params);
    $stmt = $pdo->prepare("SELECT ua.user_id, ua.display_name, ua.login_email, ua.status, ua.disabled_at, '{$kind}' AS kind"
        . ($kind === 'student' ? ', s.student_id, s.student_number' : ', NULL AS student_id, NULL AS student_number') . ",
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
    auth_invalidate_account($pdo, $userId); // token_version + 1 ends every access token
    $sessions = $pdo->prepare('SELECT session_id FROM auth_sessions WHERE user_id = ? AND revoked_at IS NULL');
    $sessions->execute([$userId]);
    $now = new DateTimeImmutable('now', new DateTimeZone('UTC'));
    foreach ($sessions->fetchAll(PDO::FETCH_COLUMN) as $sessionId) {
        auth_revoke_session($pdo, (int) $sessionId, 'Account deactivated', $now);
    }
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

function handle_admin_people(): void
{
    $pdo = null;
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $actor = admin_verify_auth($pdo, $config);
        if (request_method() === 'GET') {
            $kind = (string) ($_GET['kind'] ?? 'faculty');
            $status = (string) ($_GET['status'] ?? 'all');
            $page = (string) ($_GET['page'] ?? '1');
            $q = trim((string) ($_GET['q'] ?? ''));
            $errors = [];
            if (!in_array($kind, ['faculty', 'student'], true)) $errors['kind'] = 'Kind must be faculty or student.';
            if (!in_array($status, ['active', 'deactivated', 'all'], true)) $errors['status'] = 'Status must be active, deactivated or all.';
            if (preg_match('/^[1-9]\d{0,5}$/', $page) !== 1) $errors['page'] = 'Page must be a positive whole number.';
            if (mb_strlen($q) > 100) $errors['q'] = 'Search must be 100 characters or fewer.';
            if ($errors !== []) throw new ValidationException($errors);
            json_response(['status' => 'ok'] + people_list($pdo, $kind, $status, $q, (int) $page));
            return;
        }
        $body = request_body();
        if (!$body['has_body']) { safe_error_response('Request body required.', 400); return; }
        $pdo->beginTransaction();
        $result = match (basename(request_path())) {
            'deactivate' => people_deactivate($pdo, $config, $actor, $body['data']),
            'reactivate' => people_reactivate($pdo, $config, $actor, $body['data']),
            default => null,
        };
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
        error_log('Admin people error: ' . sanitize_for_log($e));
        safe_error_response('Unable to update the account.', 500);
    }
}
