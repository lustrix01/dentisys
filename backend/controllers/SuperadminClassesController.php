<?php

declare(strict_types=1);

/**
 * Superadmin Classes (docs/contracts/superadmin-classes.md): every Faculty member's class sections and rosters, read-only,
 * and Change Faculty for an active class of the current school year. Superadmin only. Same shape as SuperadminController (People).
 * The owner of a class is class_sections.instructor_user_id; Change Faculty updates that one column and nothing else.
 */

const SUPERADMIN_CLASSES_PAGE_SIZE = 50;

/** Selects one ClassRow's columns; the caller adds WHERE / ORDER BY. */
function superadmin_class_select(): string
{
    return "SELECT cs.cs_id, cs.cs_name, cs.school_year, cs.semester, cs.year_level, cs.lec_room, cs.lab_room, cs.meetings_recorded,
            cs.archive_reason, cs.archived_at, cs.grades_submitted_at, cs.instructor_user_id, c.course_code, COALESCE(cs.course_title, c.name) AS course_title,
            u.display_name AS faculty_name, sec.display_name AS secretary_name,
            (SELECT COUNT(*) FROM enrollments e WHERE e.cs_id = cs.cs_id) AS student_count
        FROM class_sections cs
        LEFT JOIN courses c ON c.course_id = cs.course_id
        LEFT JOIN user_accounts u ON u.user_id = cs.instructor_user_id
        LEFT JOIN user_accounts sec ON sec.user_id = cs.secretary_user_id";
}

/** ClassRow. Archived and the Completed label follow the Faculty Classes & Rosters rules: a past school year is Completed, otherwise the stored reason. */
function superadmin_class_json(PDO $pdo, array $r, string $currentYear): array
{
    $current = strcasecmp((string) $r['school_year'], $currentYear) === 0;
    $meetings = class_meetings_read($pdo, $r);
    // Room names only: the card shows the meeting times from `schedule` already (class_meetings_display adds them per room).
    $room = static function (string $component, string $legacy) use ($meetings): string {
        $named = array_unique(array_column(array_filter($meetings, static fn(array $m): bool => $m['component'] === $component), 'room'));
        if ($named !== []) return implode(' / ', $named);
        $legacyRooms = array_unique(array_column(class_meetings_legacy($legacy, $component), 'room'));
        return $legacyRooms !== [] ? implode(' / ', $legacyRooms) : $legacy;
    };
    return [
        'csId' => (int) $r['cs_id'], 'courseCode' => $r['course_code'] ?? 'DENT', 'courseTitle' => $r['course_title'] ?? $r['cs_name'],
        'section' => $r['cs_name'], 'schoolYear' => $r['school_year'], 'semester' => $r['semester'], 'yearLevel' => (int) ($r['year_level'] ?? 1),
        'faculty' => ['userId' => (int) $r['instructor_user_id'], 'name' => $r['faculty_name'] ?? 'Faculty'],
        'schedule' => array_map(static fn(array $m): array => ['day' => $m['day'], 'start' => $m['startTime'], 'end' => $m['endTime']], $meetings),
        'rooms' => ['lecture' => $room('Lecture', (string) ($r['lec_room'] ?? '')), 'laboratory' => $room('Laboratory', (string) ($r['lab_room'] ?? ''))],
        'studentCount' => (int) $r['student_count'],
        'secretary' => $r['secretary_name'] === null ? null : ['name' => $r['secretary_name']],
        'archiveReason' => !$current && ($r['archive_reason'] !== null || $r['grades_submitted_at'] !== null) ? 'completed' : $r['archive_reason'],
        'archivedAt' => $r['archive_reason'] !== null && $r['archived_at'] !== null ? audit_manila_iso((string) $r['archived_at']) : null,
        'current' => $current,
        'canChangeFaculty' => $current && $r['archive_reason'] === null,
    ];
}

function superadmin_class_fetch(PDO $pdo, int $csId): array
{
    $stmt = $pdo->prepare(superadmin_class_select() . ' WHERE cs.cs_id = ?');
    $stmt->execute([$csId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) throw new SuperadminConflict('class_not_found', 'Class not found.', [], 404);
    return $row;
}

function superadmin_classes_filters(PDO $pdo): array
{
    $current = academic_current_school_year($pdo);
    $years = $pdo->query('SELECT DISTINCT school_year FROM class_sections ORDER BY school_year DESC')->fetchAll(PDO::FETCH_COLUMN);
    if (!in_array($current, $years, true)) {
        $years[] = $current;
        rsort($years);
    }
    $courses = $pdo->query('SELECT c.course_id, c.course_code, c.name FROM courses c
        WHERE EXISTS (SELECT 1 FROM class_sections cs WHERE cs.course_id = c.course_id) ORDER BY c.course_code')->fetchAll(PDO::FETCH_ASSOC);
    $faculty = $pdo->query("SELECT user_id, display_name, status FROM user_accounts WHERE role = 'faculty' AND status IN ('Active', 'Disabled') ORDER BY display_name, user_id")->fetchAll(PDO::FETCH_ASSOC);
    return ['schoolYears' => array_values($years), 'currentSchoolYear' => $current,
        'courses' => array_map(static fn(array $c): array => ['courseId' => (int) $c['course_id'], 'courseCode' => $c['course_code'], 'title' => $c['name']], $courses),
        'faculty' => array_map(static fn(array $f): array => ['userId' => (int) $f['user_id'], 'name' => $f['display_name'], 'status' => $f['status'] === 'Active' ? 'active' : 'deactivated'], $faculty)];
}

function superadmin_classes_list(PDO $pdo): array
{
    $view = (string) ($_GET['view'] ?? 'active');
    $page = (string) ($_GET['page'] ?? '1');
    $q = trim((string) ($_GET['q'] ?? ''));
    $errors = [];
    if (!in_array($view, ['active', 'archived'], true)) $errors['view'] = 'View must be active or archived.';
    if (preg_match('/^[1-9]\d{0,5}$/', $page) !== 1) $errors['page'] = 'Page must be a positive whole number.';
    if (mb_strlen($q) > 100) $errors['q'] = 'Search must be 100 characters or fewer.';
    $current = academic_current_school_year($pdo);
    $where = [];
    $params = [];
    if (isset($_GET['schoolYear'])) {
        $known = $pdo->prepare('SELECT 1 FROM class_sections WHERE school_year = ? LIMIT 1');
        $known->execute([(string) $_GET['schoolYear']]);
        if ($known->fetchColumn() === false) $errors['schoolYear'] = 'Choose a school year that has classes.';
        else { $where[] = 'cs.school_year = ?'; $params[] = (string) $_GET['schoolYear']; }
    }
    if (isset($_GET['semester'])) {
        if (!in_array((string) $_GET['semester'], ['1ST', '2ND', 'Summer'], true)) $errors['semester'] = 'Semester must be 1ST, 2ND or Summer.';
        else { $where[] = 'cs.semester = ?'; $params[] = (string) $_GET['semester']; }
    }
    foreach (['courseId' => 'cs.course_id', 'facultyId' => 'cs.instructor_user_id'] as $key => $column) {
        if (!isset($_GET[$key])) continue;
        if (preg_match('/^[1-9]\d{0,8}$/', (string) $_GET[$key]) !== 1) $errors[$key] = "Invalid {$key} filter.";
        else { $where[] = "{$column} = ?"; $params[] = (int) $_GET[$key]; }
    }
    if ($errors !== []) throw new ValidationException($errors);
    if ($q !== '') {
        $where[] = '(c.course_code ILIKE ? OR COALESCE(cs.course_title, c.name) ILIKE ? OR cs.cs_name ILIKE ? OR u.display_name ILIKE ?)';
        $like = '%' . addcslashes($q, '\\%_') . '%';
        array_push($params, $like, $like, $like, $like);
    }
    $archivedSql = '(cs.archive_reason IS NOT NULL OR (cs.grades_submitted_at IS NOT NULL AND LOWER(cs.school_year) <> LOWER(' . $pdo->quote($current) . ')))';
    $from = ' FROM class_sections cs LEFT JOIN courses c ON c.course_id = cs.course_id LEFT JOIN user_accounts u ON u.user_id = cs.instructor_user_id'
        . ($where ? ' WHERE ' . implode(' AND ', $where) : '');
    $counts = $pdo->prepare("SELECT COUNT(*) FILTER (WHERE NOT {$archivedSql}) AS active, COUNT(*) FILTER (WHERE {$archivedSql}) AS archived" . $from);
    $counts->execute($params);
    $counts = $counts->fetch(PDO::FETCH_ASSOC);
    $total = (int) $counts[$view];
    $stmt = $pdo->prepare(superadmin_class_select() . ($where ? ' WHERE ' . implode(' AND ', $where) : '')
        . ($where ? ' AND ' : ' WHERE ') . ($view === 'archived' ? '' : 'NOT ') . $archivedSql
        . ' ORDER BY (LOWER(cs.school_year) = LOWER(' . $pdo->quote($current) . ')) DESC, cs.school_year DESC, c.course_code, cs.cs_name, cs.cs_id LIMIT ' . SUPERADMIN_CLASSES_PAGE_SIZE . ' OFFSET ' . (((int) $page - 1) * SUPERADMIN_CLASSES_PAGE_SIZE));
    $stmt->execute($params);
    return ['classes' => array_map(static fn(array $r): array => superadmin_class_json($pdo, $r, $current), $stmt->fetchAll(PDO::FETCH_ASSOC)),
        'total' => $total, 'page' => (int) $page, 'pageSize' => SUPERADMIN_CLASSES_PAGE_SIZE,
        'counts' => ['active' => (int) $counts['active'], 'archived' => (int) $counts['archived']]];
}

function superadmin_class_detail(PDO $pdo): array
{
    $id = (string) ($_GET['csId'] ?? '');
    if (preg_match('/^[1-9]\d{0,9}$/', $id) !== 1) throw new ValidationException(['csId' => 'Choose a class.']);
    $row = superadmin_class_fetch($pdo, (int) $id);
    $stmt = $pdo->prepare('SELECT s.student_number, s.first_name, s.middle_name, s.last_name, s.bu_email, s.year_level, e.status
        FROM enrollments e JOIN students s ON s.student_id = e.student_id WHERE e.cs_id = ? ORDER BY s.last_name, s.first_name, s.student_number');
    $stmt->execute([(int) $id]);
    $roster = array_map(static fn(array $s): array => ['studentNo' => $s['student_number'],
        'name' => trim($s['first_name'] . ' ' . ($s['middle_name'] ? $s['middle_name'] . ' ' : '') . $s['last_name']),
        'email' => $s['bu_email'] ?? '', 'yearLevel' => $s['year_level'] !== null ? (int) $s['year_level'] : null, 'status' => $s['status']], $stmt->fetchAll(PDO::FETCH_ASSOC));
    return ['class' => superadmin_class_json($pdo, $row, academic_current_school_year($pdo)), 'roster' => $roster];
}

/** Columns of $table except the skipped ones, quoted, for a generic row copy that cannot miss a later migration's column. */
function superadmin_copy_columns(PDO $pdo, string $table, array $skip): array
{
    $stmt = $pdo->prepare('SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = ? ORDER BY ordinal_position');
    $stmt->execute([$table]);
    return array_map(static fn(string $c): string => '"' . $c . '"', array_values(array_diff($stmt->fetchAll(PDO::FETCH_COLUMN), $skip)));
}

/**
 * D20: grade weights belong to (Faculty, course, semester, school year). Copies the previous Faculty member's configuration
 * (categories, period memberships) to the new one and points this class's assessments at the copy; the previous one stays
 * for their other sections. Refuses when the new Faculty member already has weights for the same offering. Returns whether it copied.
 */
function superadmin_class_copy_grade_config(PDO $pdo, array $actor, array $class, int $csId, int $fromId, int $toId, string $toName): bool
{
    $offering = ['courseId' => (int) $class['course_id'], 'semester' => faculty_grading_normalize_semester($class['semester']),
        'schoolYear' => faculty_grading_normalize_school_year($class['school_year'])];
    $source = faculty_grading_find_config($pdo, ['facultyUserId' => $fromId] + $offering, true);
    if ($source === null) return false; // nothing to carry over
    if (faculty_grading_find_config($pdo, ['facultyUserId' => $toId] + $offering, true) !== null) {
        $semester = ['1ST' => '1st Semester', '2ND' => '2nd Semester', 'SUMMER' => 'Summer'][$offering['semester']] ?? $offering['semester'];
        throw new SuperadminConflict('grading_weights_clash', "{$toName} already has grade weights for " . ($class['course_code'] ?? 'this course')
            . ", {$semester} {$class['school_year']}. Choose another Faculty member.");
    }
    $cols = superadmin_copy_columns($pdo, 'grading_configs', ['config_id', 'faculty_user_id', 'created_at', 'updated_at', 'updated_by_user_id']);
    $list = implode(', ', $cols);
    $stmt = $pdo->prepare("INSERT INTO grading_configs (faculty_user_id, updated_by_user_id, {$list}) SELECT ?, ?, {$list} FROM grading_configs WHERE config_id = ? RETURNING config_id");
    $stmt->execute([$toId, (int) $actor['user_id'], (int) $source['config_id']]);
    $newConfig = (int) $stmt->fetchColumn();

    $catCols = implode(', ', superadmin_copy_columns($pdo, 'grading_categories', ['category_id', 'config_id', 'created_at', 'updated_at']));
    $memCols = implode(', ', superadmin_copy_columns($pdo, 'grading_category_period_memberships', ['category_period_id', 'category_id', 'created_at', 'updated_at']));
    $categories = $pdo->prepare('SELECT category_id FROM grading_categories WHERE config_id = ? ORDER BY category_id');
    $categories->execute([(int) $source['config_id']]);
    $copyCategory = $pdo->prepare("INSERT INTO grading_categories (config_id, {$catCols}) SELECT ?, {$catCols} FROM grading_categories WHERE category_id = ? RETURNING category_id");
    $copyMemberships = $pdo->prepare("INSERT INTO grading_category_period_memberships (category_id, {$memCols}) SELECT ?, {$memCols} FROM grading_category_period_memberships WHERE category_id = ?");
    $repoint = $pdo->prepare('UPDATE assessments SET grading_category_id = ? WHERE cs_id = ? AND grading_category_id = ?');
    foreach ($categories->fetchAll(PDO::FETCH_COLUMN) as $oldCategory) {
        $copyCategory->execute([$newConfig, (int) $oldCategory]);
        $newCategory = (int) $copyCategory->fetchColumn();
        $copyMemberships->execute([$newCategory, (int) $oldCategory]); // the read-only grading_category_periods copy follows by trigger
        $repoint->execute([$newCategory, $csId, (int) $oldCategory]);
    }
    return true;
}

/**
 * Change Faculty: one transaction (the handler's), FOR UPDATE on the class row like faculty_class_archive_change.
 * Returns the class and the after-commit mail sender; a failed email never undoes the change.
 */
function superadmin_class_change_faculty(PDO $pdo, array $config, array $actor, array $data): array
{
    $csId = (int) ($data['csId'] ?? 0);
    $toUserId = (int) ($data['toUserId'] ?? 0);
    $reason = is_string($data['reason'] ?? null) ? trim($data['reason']) : '';
    if ($csId <= 0 || $toUserId <= 0) throw new SuperadminConflict('validation', 'Choose a class and a Faculty member.', [], 422);
    if (mb_strlen($reason) < 8 || mb_strlen($reason) > 240) throw new SuperadminConflict('validation', 'Enter a reason of 8 to 240 characters.', [], 422);

    $stmt = $pdo->prepare('SELECT cs.cs_name, cs.course_id, cs.semester, cs.school_year, cs.archive_reason, cs.instructor_user_id, cs.secretary_user_id, c.course_code
        FROM class_sections cs LEFT JOIN courses c ON c.course_id = cs.course_id WHERE cs.cs_id = ? FOR UPDATE OF cs');
    $stmt->execute([$csId]);
    $class = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$class) throw new SuperadminConflict('class_not_found', 'Class not found.', [], 404);
    if ($class['archive_reason'] !== null || !academic_school_year_is_current($pdo, (string) $class['school_year'])) {
        throw new SuperadminConflict('class_not_current', 'Past and archived classes are view-only.');
    }
    if ((int) $class['instructor_user_id'] === $toUserId) {
        throw new SuperadminConflict('same_faculty', 'This class already belongs to that Faculty member.');
    }
    // D6: an active Faculty account only (the Dean's role is 'admin', so it never matches).
    $stmt = $pdo->prepare("SELECT user_id, login_email, display_name FROM user_accounts WHERE user_id = ? AND role = 'faculty' AND status = 'Active' FOR UPDATE");
    $stmt->execute([$toUserId]);
    $to = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$to) throw new SuperadminConflict('faculty_not_eligible', 'Choose an active Faculty member.');
    $stmt = $pdo->prepare('SELECT user_id, login_email, display_name FROM user_accounts WHERE user_id = ?');
    $stmt->execute([(int) $class['instructor_user_id']]);
    $from = $stmt->fetch(PDO::FETCH_ASSOC) ?: ['user_id' => (int) $class['instructor_user_id'], 'login_email' => '', 'display_name' => 'Faculty'];

    $stmt = $pdo->prepare("SELECT class_end_time FROM attendance_sessions WHERE cs_id = ? AND status = 'active' ORDER BY session_date DESC, session_id DESC LIMIT 1");
    $stmt->execute([$csId]);
    $open = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($open !== false) {
        $end = $open['class_end_time'] === null ? null : DateTimeImmutable::createFromFormat('!H:i', substr((string) $open['class_end_time'], 0, 5));
        throw new SuperadminConflict('session_open', 'End the open attendance session first' . ($end ? ', or wait until it ends at ' . $end->format('g:i A') : '') . '.');
    }

    $label = ($class['course_code'] ?? 'Class') . ' (' . $class['cs_name'] . ')';
    $toName = (string) $to['display_name'];
    $copied = superadmin_class_copy_grade_config($pdo, $actor, $class, $csId, (int) $from['user_id'], $toUserId, $toName);
    $pdo->prepare('UPDATE class_sections SET instructor_user_id = ? WHERE cs_id = ?')->execute([$toUserId, $csId]);
    $pdo->prepare("UPDATE grade_change_batches SET faculty_user_id = ? WHERE cs_id = ? AND status IN ('draft', 'pending')")->execute([$toUserId, $csId]); // GRD-004 rule 10

    $movedBody = "{$label} was moved to {$toName} by the Superadmin. Reason: {$reason}. It no longer appears in your classes.";
    $assignedBody = "{$label} is now yours. Its students, grades, attendance and sessions came with it. Reason: {$reason}.";
    $key = $csId . ':' . (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('YmdHisu');
    notification_create_idempotent($pdo, (int) $from['user_id'], 'class_assignment', 'Class moved', $movedBody, 'class_section', (string) $csId, 'class-moved:' . $key . ':' . $from['user_id']);
    notification_create_idempotent($pdo, $toUserId, 'class_assignment', 'Class assigned to you', $assignedBody, 'class_section', (string) $csId, 'class-assigned:' . $key . ':' . $toUserId);
    $recipientStmt = $pdo->prepare(
        "SELECT DISTINCT u.user_id
           FROM enrollments e
           JOIN students s ON s.student_id = e.student_id
           JOIN user_accounts u ON ((s.student_account_user_id = u.user_id AND u.role IN ('student', 'secretary'))
                                 OR (s.user_id = u.user_id AND u.role = 'secretary'))
          WHERE e.cs_id = ? AND LOWER(e.status) = 'active' AND LOWER(u.status) = 'active'"
    );
    $recipientStmt->execute([$csId]);
    $recipientIds = array_map('intval', $recipientStmt->fetchAll(PDO::FETCH_COLUMN));
    if ($class['secretary_user_id'] !== null) {
        $secStmt = $pdo->prepare("SELECT user_id FROM user_accounts WHERE user_id = ? AND LOWER(status) = 'active' LIMIT 1");
        $secStmt->execute([(int) $class['secretary_user_id']]);
        $secId = $secStmt->fetchColumn();
        if ($secId !== false) {
            $recipientIds[] = (int) $secId;
        }
    }
    $recipientIds = array_values(array_unique($recipientIds));
    $actorUserId = (int) ($actor['user_id'] ?? 0);
    foreach ($recipientIds as $recipientId) {
        if ($recipientId <= 0 || $recipientId === (int) $from['user_id'] || $recipientId === $toUserId || ($actorUserId > 0 && $recipientId === $actorUserId)) {
            continue;
        }
        notification_create_idempotent($pdo, $recipientId, 'class_assignment', 'Class Faculty changed',
            "Your class {$label} now has {$toName} as its Faculty member.", 'class_section', (string) $csId, 'class-faculty-changed:' . $key . ':' . $recipientId);
    }

    audit_record_action($pdo, $config, $actor, 'class_management', 'class_faculty_changed', 'class_section', (string) $csId,
        "Moved {$label} from {$from['display_name']} to {$toName}.",
        ['scope_cs_id' => $csId, 'reason' => $reason,
            'before' => ['instructor_user_id' => (int) $from['user_id'], 'name' => $from['display_name']],
            'after' => ['instructor_user_id' => $toUserId, 'name' => $toName, 'gradeConfigCopied' => $copied]]);

    // Both Faculty emails go through the outbox with the Superadmin as sender (Email History); sent after commit.
    $outbox = $pdo->prepare("INSERT INTO email_outbox (sender_user_id, recipient_email, recipient_name, subject, email_type, message_body, status, operation_uuid, action_uuid)
        VALUES (?, ?, ?, ?, 'Class', ?, 'Pending', ?, ?) RETURNING email_id");
    $actionUuid = uuid_v4_string();
    $mails = [];
    foreach ([[$from, 'Class moved', $movedBody], [$to, 'Class assigned to you', $assignedBody]] as [$person, $subject, $text]) {
        $body = email_class_faculty_changed_html((string) $person['display_name'], $subject, [email_escape($text)]);
        $outbox->execute([$actor['user_id'] ?? null, (string) $person['login_email'], (string) $person['display_name'], $subject, $body, uuid_v4_string(), $actionUuid]);
        $mails[] = [(int) $outbox->fetchColumn(), (string) $person['login_email'], $subject, $body];
    }
    return ['message' => "{$label} now belongs to {$toName}.", 'class' => superadmin_class_json($pdo, superadmin_class_fetch($pdo, $csId), academic_current_school_year($pdo)),
        'afterCommit' => static function () use ($pdo, $config, $mails): void {
            foreach ($mails as [$emailId, $email, $subject, $body]) {
                try {
                    if (!student_invitation_outbox_send($pdo, $config, $emailId, $email, $subject, $body)) error_log('Change Faculty: a notice email was not delivered.');
                } catch (Throwable $e) {
                    error_log('Change Faculty mail error: ' . sanitize_for_log($e));
                }
            }
        }];
}

function handle_admin_classes(): void
{
    $pdo = null;
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $actor = superadmin_verify_auth($pdo, $config);
        $name = basename(request_path());
        if (request_method() === 'GET') {
            $result = match ($name) {
                'classes' => superadmin_classes_list($pdo),
                'filters' => superadmin_classes_filters($pdo),
                'detail' => superadmin_class_detail($pdo),
                default => null,
            };
            if ($result === null) { safe_error_response('Not found.', 404); return; }
            json_response(['status' => 'ok'] + $result);
            return;
        }
        $body = request_body();
        if (!$body['has_body']) { safe_error_response('Request body required.', 400); return; }
        if ($name !== 'change-faculty') { safe_error_response('Not found.', 404); return; }
        $pdo->beginTransaction();
        $result = superadmin_class_change_faculty($pdo, $config, $actor, $body['data']);
        $pdo->commit();
        $afterCommit = $result['afterCommit'];
        unset($result['afterCommit']);
        $afterCommit();
        json_response(['status' => 'ok'] + $result);
    } catch (ValidationException $e) {
        if ($pdo instanceof PDO && $pdo->inTransaction()) $pdo->rollBack();
        validation_error_response($e->getErrors());
    } catch (SuperadminConflict $e) {
        superadmin_conflict_response($pdo, $e);
    } catch (Throwable $e) {
        if ($pdo instanceof PDO && $pdo->inTransaction()) $pdo->rollBack();
        error_log('Admin classes error: ' . sanitize_for_log($e));
        safe_error_response('Unable to load or change classes.', 500);
    }
}
