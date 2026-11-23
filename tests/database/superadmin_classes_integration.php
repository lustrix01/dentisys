<?php

declare(strict_types=1);

// Superadmin Classes (docs/contracts/superadmin-classes.md): the four /api/admin/classes routes, the list/filters/detail reads,
// Change Faculty (ownership, what stays with the class, notices, audit, D20 grade weights), every refusal and the rollback.
// Included by the full disposable PostgreSQL suite right after superadmin_split_integration.php, so it reuses that file's
// $saAccount/$saPass, $superSession() and $superUserId, and grouped_grading_integration.php's closures ($groupedPayload,
// $groupedMembershipRows, $groupedCategoryIds, $groupedInsertAssessment, $groupedInsertScore). Every row it makes carries $scTag.
// Written from the contract, not from the code.

$scTag = 'sc' . strtolower(bin2hex(random_bytes(3)));
$scLetters = strtr($scTag, '0123456789', 'abcdefghij');
$scYear = academic_current_school_year($pdo);
$scPastYear = '2020-2021';
$scSuper = $superSession();
$scGet = static fn(string $path, ?string $token = null): array => integration_http_get_json($path, $token ?? $scSuper);
$scPost = static fn(string $path, array $body, ?string $token = null): array => integration_http_json($path, $token ?? $scSuper, $body);
$scRows = static function (string $sql, array $args = []) use ($pdo): array {
    $stmt = $pdo->prepare($sql);
    $stmt->execute($args);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
};
$scOne = static function (string $sql, array $args = []) use ($pdo): mixed {
    $stmt = $pdo->prepare($sql);
    $stmt->execute($args);
    $value = $stmt->fetchColumn();
    return $value === false ? null : $value;
};
$scLogin = static fn(string $email, string $password): string => (string) (integration_http_json('/api/auth/login', '', ['email' => $email, 'password' => $password])[1]['access_token'] ?? '');
$scCodes = static fn(array $list): array => array_map(static fn(array $c): int => (int) $c['csId'], $list['classes'] ?? []);
$scList = static fn(string $query): array => $scGet('/api/admin/classes?' . $query);

// ---- Fixture: people ----
$scFa = $saAccount("sc-fa-{$scTag}@bicol-u.edu.ph", 'faculty', "Sc Alpha {$scLetters}");   // owns the classes
$scFb = $saAccount("sc-fb-{$scTag}@bicol-u.edu.ph", 'faculty', "Sc Bravo {$scLetters}");   // the new Faculty member
$scFc = $saAccount("sc-fc-{$scTag}@bicol-u.edu.ph", 'faculty', "Sc Charlie {$scLetters}"); // has her own weights for course 1
$scFd = $saAccount("sc-fd-{$scTag}@bicol-u.edu.ph", 'faculty', "Sc Delta {$scLetters}");   // deactivated
$scFe = $saAccount("sc-fe-{$scTag}@bicol-u.edu.ph", 'faculty', "Sc Echo {$scLetters}");    // invited, not active yet
$scSecretary = $saAccount("sc-sec-{$scTag}@bicol-u.edu.ph", 'secretary', "Sc Secretary {$scLetters}", "SC-{$scTag}-S");
$scStudentAccount = $saAccount("sc-stu-{$scTag}@bicol-u.edu.ph", 'student', "Sc Student {$scLetters}", "SC-{$scTag}-U");
$pdo->exec("UPDATE user_accounts SET status = 'Disabled', disabled_at = CURRENT_TIMESTAMP(6) WHERE user_id = {$scFd}");
$pdo->exec("UPDATE user_accounts SET status = 'Pending Activation' WHERE user_id = {$scFe}");
$scDeanId = (int) $scOne("SELECT user_id FROM user_accounts WHERE login_email = 'admin@bicol-u.edu.ph'");
$scEmail = static fn(int $id): string => (string) $scOne('SELECT login_email FROM user_accounts WHERE user_id = ?', [$id]);
$scTokenFa = $scLogin($scEmail($scFa), $saPass);
$scTokenFb = $scLogin($scEmail($scFb), $saPass);
$scTokenFc = $scLogin($scEmail($scFc), $saPass);
$scTokenDean = $scLogin('admin@bicol-u.edu.ph', $demoPasswords['admin@bicol-u.edu.ph']);
$scTokenFaculty = $scLogin('faculty@bicol-u.edu.ph', $demoPasswords['faculty@bicol-u.edu.ph']);
$scTokenSecretary = $scLogin($scEmail($scSecretary), $saPass);
$scTokenStudent = $scLogin('student@bicol-u.edu.ph', $demoPasswords['student@bicol-u.edu.ph']);
expect_true($scTokenFa !== '' && $scTokenFb !== '' && $scTokenFc !== '' && $scTokenDean !== '' && $scTokenFaculty !== '' && $scTokenSecretary !== '' && $scTokenStudent !== '', 'Setup: every role fixture signs in');

// ---- Fixture: courses and classes ----
$scCourse = $pdo->prepare("INSERT INTO courses (course_code, name, units, semester, grading_config) VALUES (?, ?, 3.0, '1ST', '{}'::jsonb) RETURNING course_id");
$scCourse->execute(["SCA{$scTag}", "Sc Course One {$scTag}"]);
$scCourse1 = (int) $scCourse->fetchColumn();
$scCourse->execute(["SCB{$scTag}", "Sc Course Two {$scTag}"]);
$scCourse2 = (int) $scCourse->fetchColumn();
$scClass = $pdo->prepare('INSERT INTO class_sections (cs_name, course_id, instructor_user_id, semester, school_year, status) VALUES (?, ?, ?, ?, ?, ?) RETURNING cs_id');
$scMakeClass = static function (string $section, int $courseId, int $facultyId, string $semester = '1ST', ?string $year = null) use ($scClass, $scYear): int {
    $scClass->execute(["SC-{$section}", $courseId, $facultyId, $semester, $year ?? $scYear, 'Active']);
    return (int) $scClass->fetchColumn();
};
$scStudent = static function (string $label, int $classId) use ($pdo, $scTag): array {
    $number = "SC-{$scTag}-{$label}";
    $stmt = $pdo->prepare("INSERT INTO students (student_number, first_name, last_name, bu_email, status, admission_date) VALUES (?, 'Sc', ?, ?, 'active', CURRENT_DATE) RETURNING student_id");
    $stmt->execute([$number, $label, 'sc.' . strtolower($label) . ".{$scTag}@bicol-u.edu.ph"]);
    $studentId = (int) $stmt->fetchColumn();
    $enroll = $pdo->prepare("INSERT INTO enrollments (student_id, cs_id, status, date_enrolled) VALUES (?, ?, 'Active', CURRENT_DATE) RETURNING enrollment_id");
    $enroll->execute([$studentId, $classId]);
    return ['studentId' => $studentId, 'enrollmentId' => (int) $enroll->fetchColumn(), 'number' => $number];
};
$scK1 = $scMakeClass("K1-{$scTag}", $scCourse1, $scFa);           // the class that moves, course 1, with weights
$scK2 = $scMakeClass("K2-{$scTag}", $scCourse1, $scFa);           // FA's other section of course 1 (shares FA's weights)
$scK3 = $scMakeClass("K3-{$scTag}", $scCourse2, $scFa);           // course 2: FA has no grade weights
$scK4 = $scMakeClass("K4-{$scTag}", $scCourse1, $scFc);           // FC teaches course 1 and has her own weights
$scK5 = $scMakeClass("K5-{$scTag}", $scCourse2, $scFb, '2ND');    // second semester, owned by FB
$scPast = $scMakeClass("PAST-{$scTag}", $scCourse1, $scFa, '1ST', $scPastYear);
// A real past-year class counts as submitted (GRD-004 backfill), so it is Completed and view-only.
$pdo->prepare('UPDATE class_sections SET grades_submitted_at = CURRENT_TIMESTAMP, grades_grace_until = NULL WHERE cs_id = ?')->execute([$scPast]);
$scDone = $scMakeClass("DONE-{$scTag}", $scCourse2, $scFa);       // archived: finished
$scCancel = $scMakeClass("CANC-{$scTag}", $scCourse2, $scFa);     // archived: cancelled
$scMistake = $scMakeClass("MIST-{$scTag}", $scCourse2, $scFa);    // archived: mistake
foreach ([[$scDone, 'finished'], [$scCancel, 'cancelled'], [$scMistake, 'mistake']] as [$scId, $scWhy]) {
    $pdo->prepare('UPDATE class_sections SET archive_reason = ?, archived_at = CURRENT_TIMESTAMP(6) WHERE cs_id = ?')->execute([$scWhy, $scId]);
}
$pdo->prepare("UPDATE class_sections SET secretary_user_id = ?, join_code = 'SCJ123', lec_room = 'Room SC-1' WHERE cs_id = ?")->execute([$scSecretary, $scK1]);
$pdo->prepare("UPDATE class_sections SET join_code = 'SCJ456' WHERE cs_id = ?")->execute([$scK2]); // the server makes a missing code lazily when a Faculty member lists classes; fix it so the snapshots compare
$scS1 = $scStudent('One', $scK1);
$scS2 = $scStudent('Two', $scK1);
$scS3 = $scStudent('Three', $scK2);
$scS4 = $scStudent('Four', $scK4);
$scStudent('Five', $scPast);

// Grade weights: FA's configuration for course 1 (shared by K1 and K2), FC's own for the same course and term.
$scOffering = ['courseId' => $scCourse1, 'schoolYear' => $scYear];
[$scCfgStatus, $scCfgBody] = integration_http_put_json('/api/faculty/grading-config', $scTokenFa, $groupedPayload($scOffering));
expect_same(201, $scCfgStatus, 'Setup: FA saves grade weights for course 1 (' . json_encode($scCfgBody) . ')');
$scFaConfig = (int) ($scCfgBody['configuration']['id'] ?? 0);
[$scCfgStatus2, $scCfgBody2] = integration_http_put_json('/api/faculty/grading-config', $scTokenFc, $groupedPayload($scOffering));
expect_same(201, $scCfgStatus2, 'Setup: FC saves her own grade weights for course 1');
$scFcConfig = (int) ($scCfgBody2['configuration']['id'] ?? 0);
$scFaIds = $groupedCategoryIds($groupedMembershipRows($scFaConfig));
$scA = [];
foreach ([$scK1, $scK2] as $scCs) {
    $scA[$scCs] = [
        'mq' => $groupedInsertAssessment($scCs, $scFaIds['Midterm']['Lecture']['Quiz'], "Sc MQ {$scCs}", 'Midterm', 100, true),
        'me' => $groupedInsertAssessment($scCs, $scFaIds['Midterm']['Lecture']['Exam'], "Sc ME {$scCs}", 'Midterm'),
        'ml' => $groupedInsertAssessment($scCs, $scFaIds['Midterm']['Laboratory']['Quiz'], "Sc ML {$scCs}", 'Midterm'),
        'fq' => $groupedInsertAssessment($scCs, $scFaIds['Final']['Lecture']['Quiz'], "Sc FQ {$scCs}", 'Final'),
        'fe' => $groupedInsertAssessment($scCs, $scFaIds['Final']['Lecture']['Exam'], "Sc FE {$scCs}", 'Final'),
        'fl' => $groupedInsertAssessment($scCs, $scFaIds['Final']['Laboratory']['Quiz'], "Sc FL {$scCs}", 'Final'),
    ];
}
foreach ([[$scS1, $scK1, [50, 85, 90, 90, 90, 80]], [$scS2, $scK1, [100, 100, 0, 100, 100, 0]], [$scS3, $scK2, [70, 80, 90, 60, 70, 80]]] as [$scWho, $scCs, $scScores]) {
    foreach (array_values($scA[$scCs]) as $scIndex => $scAssessment) {
        $groupedInsertScore($scAssessment, $scWho['studentId'], (float) $scScores[$scIndex]);
    }
}
// Attendance: an ended session with a record, a scheduled session (must come along), and the auto-session setting stays on the row.
$scSession = $pdo->prepare("INSERT INTO attendance_sessions (cs_id, secretary_user_id, owner_user_id, session_date, session_code, status, ended_at) VALUES (?, ?, ?, CURRENT_DATE - 3, ?, 'ended', CURRENT_TIMESTAMP(6)) RETURNING session_id");
$scSession->execute([$scK1, $scSecretary, $scSecretary, "SC-END-{$scTag}"]);
$scEndedSession = (int) $scSession->fetchColumn();
$pdo->prepare("INSERT INTO attendance_records (enrollment_id, attendance_session_id, session_date, session_code, status, verification_method, time_recorded) VALUES (?, ?, CURRENT_DATE - 3, ?, 'present', 'integration_fixture', CURRENT_TIMESTAMP(6))")->execute([$scS1['enrollmentId'], $scEndedSession, "SC-END-{$scTag}"]);
$pdo->prepare("INSERT INTO attendance_sessions(cs_id, secretary_user_id, owner_user_id, session_date, session_code, status, opening_time, present_cutoff_time, late_cutoff_time, class_end_time, created_by_role) VALUES (?, ?, ?, CURRENT_DATE + 5, ?, 'scheduled', '08:00', '08:15', '08:30', '09:30', 'faculty')")->execute([$scK1, $scSecretary, $scFa, "SC-SCHED-{$scTag}"]);

// What must not move with Change Faculty: everything on the class except its owner.
$scIds = static fn(array $ids): string => implode(',', array_map('intval', $ids));
$scKeep = static function (array $csIds) use ($scRows, $scIds): array {
    $in = $scIds($csIds);
    $one = static fn(string $sql): string => (string) ($scRows($sql)[0]['h'] ?? '');
    return [
        'class' => $one("SELECT md5(COALESCE(string_agg((to_jsonb(cs) - 'instructor_user_id' - 'updated_at')::text, '|' ORDER BY cs_id), '')) AS h FROM class_sections cs WHERE cs_id IN ({$in})"),
        'enrollments' => $one("SELECT md5(COALESCE(string_agg(to_jsonb(e)::text, '|' ORDER BY enrollment_id), '')) AS h FROM enrollments e WHERE cs_id IN ({$in})"),
        'scores' => $one("SELECT md5(COALESCE(string_agg(s.assessment_id || ':' || s.student_id || ':' || s.score, '|' ORDER BY s.assessment_id, s.student_id), '')) AS h FROM assessment_scores s JOIN assessments a ON a.assessment_id = s.assessment_id WHERE a.cs_id IN ({$in})"),
        'assessments' => $one("SELECT md5(COALESCE(string_agg(assessment_id || ':' || title || ':' || max_score, '|' ORDER BY assessment_id), '')) AS h FROM assessments WHERE cs_id IN ({$in})"),
        'sessions' => $one("SELECT md5(COALESCE(string_agg(session_id || ':' || status || ':' || session_code || ':' || secretary_user_id || ':' || owner_user_id, '|' ORDER BY session_id), '')) AS h FROM attendance_sessions WHERE cs_id IN ({$in})"),
        'records' => $one("SELECT md5(COALESCE(string_agg(r.record_id || ':' || r.status, '|' ORDER BY r.record_id), '')) AS h FROM attendance_records r JOIN enrollments e ON e.enrollment_id = r.enrollment_id WHERE e.cs_id IN ({$in})"),
    ];
};
// Everything Change Faculty writes: a refusal must leave all of it as it was.
$scEveryone = [$scFa, $scFb, $scFc, $scFd, $scFe, $scSecretary, $scDeanId, $scStudentAccount];
$scWorld = static function () use ($scRows, $scIds, $scEveryone, $scTag, $scCourse1, $scCourse2, $scK1, $scK2, $scK3, $scK4, $scK5, $scPast, $scDone, $scCancel, $scMistake): array {
    $users = $scIds($scEveryone);
    $classes = $scIds([$scK1, $scK2, $scK3, $scK4, $scK5, $scPast, $scDone, $scCancel, $scMistake]);
    $courses = $scIds([$scCourse1, $scCourse2]);
    $one = static fn(string $sql): string => (string) ($scRows($sql)[0]['h'] ?? '');
    return [
        'classes' => $one("SELECT md5(COALESCE(string_agg(to_jsonb(cs)::text, '|' ORDER BY cs_id), '')) AS h FROM class_sections cs WHERE cs_id IN ({$classes})"),
        'assessments' => $one("SELECT md5(COALESCE(string_agg(assessment_id || ':' || COALESCE(grading_category_id::text, '-'), '|' ORDER BY assessment_id), '')) AS h FROM assessments WHERE cs_id IN ({$classes})"),
        'configs' => $one("SELECT md5(COALESCE(string_agg(config_id || ':' || faculty_user_id || ':' || course_id, '|' ORDER BY config_id), '')) AS h FROM grading_configs WHERE course_id IN ({$courses})"),
        'categories' => $one("SELECT count(*)::text AS h FROM grading_categories gc JOIN grading_configs c ON c.config_id = gc.config_id WHERE c.course_id IN ({$courses})"),
        'memberships' => $one("SELECT count(*)::text AS h FROM grading_category_period_memberships m JOIN grading_categories gc ON gc.category_id = m.category_id JOIN grading_configs c ON c.config_id = gc.config_id WHERE c.course_id IN ({$courses})"),
        'notifications' => $one("SELECT count(*)::text AS h FROM notifications WHERE recipient_user_id IN ({$users}) AND notification_type = 'class_assignment'"),
        'outbox' => $one("SELECT count(*)::text AS h FROM email_outbox WHERE recipient_email LIKE 'sc-%{$scTag}@bicol-u.edu.ph'"),
        'audit' => $one("SELECT count(*)::text AS h FROM audit_events WHERE action_code = 'class_faculty_changed' AND scope_cs_id IN ({$classes})"),
        'sessions' => $one("SELECT md5(COALESCE(string_agg(session_id || ':' || status, '|' ORDER BY session_id), '')) AS h FROM attendance_sessions WHERE cs_id IN ({$classes})"),
    ];
};
$scChange = static fn(array $body, ?string $token = null): array => $scPost('/api/admin/classes/change-faculty', $body, $token);
$scReason = 'Dr. Alpha is on leave for the rest of the semester.';
$scRefused = static function (string $label, array $body, int $status, string $code, ?string $message, ?string $token = null) use ($scChange, $scWorld): array {
    $before = $scWorld();
    [$got, $answer] = $scChange($body, $token);
    expect_true($got === $status && ($answer['code'] ?? '') === $code, "{$label}: HTTP {$status} {$code} (got {$got} " . json_encode($answer) . ')');
    if ($message !== null) {
        expect_same($message, $answer['message'] ?? null, "{$label}: the message");
    }
    expect_same($before, $scWorld(), "{$label}: nothing changed (classes, weights, notices, email, audit)");
    return $answer;
};

// ---- 1. Role guard on all four routes ----
$scRoutes = [['GET', '/api/admin/classes'], ['GET', '/api/admin/classes/filters'], ['GET', '/api/admin/classes/detail?csId=' . $scK1], ['POST', '/api/admin/classes/change-faculty']];
foreach ($scRoutes as [$scMethod, $scPath]) {
    foreach ([['Dean', $scTokenDean, 403], ['Faculty', $scTokenFaculty, 403], ['Secretary', $scTokenSecretary, 403], ['Student', $scTokenStudent, 403], ['anonymous', '', 401]] as [$scWho, $scToken, $scWant]) {
        $scGot = $scMethod === 'GET' ? integration_http_get_json($scPath, $scToken)[0] : integration_http_json($scPath, $scToken, ['csId' => $scK1, 'toUserId' => $scFb, 'reason' => $scReason])[0];
        expect_same($scWant, $scGot, "{$scWho} gets {$scWant} on {$scMethod} {$scPath}");
    }
}
$scGuarded = $scWorld();
expect_same($scGuarded, $scWorld(), 'Setup: the refused Change Faculty calls changed nothing');
expect_same(200, $scGet('/api/admin/classes')[0], 'The Superadmin reads GET /api/admin/classes');
expect_same(200, $scGet('/api/admin/classes/filters')[0], 'The Superadmin reads GET /api/admin/classes/filters');
expect_same(200, $scGet('/api/admin/classes/detail?csId=' . $scK1)[0], 'The Superadmin reads GET /api/admin/classes/detail');

// ---- 2. List: paging first (its rows are removed again), then split, sort, filters, counts ----
$scPgCourse = $pdo->prepare("INSERT INTO courses (course_code, name, units, semester, grading_config) VALUES (?, 'Sc Paging', 3.0, '1ST', '{}'::jsonb) RETURNING course_id");
$scPgCode = 'PG' . strtoupper(bin2hex(random_bytes(3)));
$scPgCourse->execute([$scPgCode]);
$scPgCourseId = (int) $scPgCourse->fetchColumn();
$pdo->exec("INSERT INTO class_sections (cs_name, course_id, instructor_user_id, semester, school_year, status)
    SELECT 'SC-PG-' || lpad(g::text, 3, '0'), {$scPgCourseId}, {$scFb}, '1ST', '{$scYear}', 'Active' FROM generate_series(1, 55) g");
[$scPgStatus, $scPg1] = $scList("courseId={$scPgCourseId}");
[, $scPg2] = $scList("courseId={$scPgCourseId}&page=2");
expect_true($scPgStatus === 200 && count($scPg1['classes'] ?? []) === 50 && ($scPg1['pageSize'] ?? 0) === 50 && ($scPg1['total'] ?? 0) === 55 && ($scPg1['page'] ?? 0) === 1, 'Paging: 50 per page, total 55, page 1');
expect_true(count($scPg2['classes'] ?? []) === 5 && ($scPg2['page'] ?? 0) === 2 && array_intersect($scCodes($scPg1), $scCodes($scPg2)) === [], 'Paging: page 2 holds the other 5 classes');
expect_same(['SC-PG-001', 'SC-PG-050'], [$scPg1['classes'][0]['section'] ?? null, $scPg1['classes'][49]['section'] ?? null], 'Paging: sorted by section within one course');
expect_same([55, 0], [$scPg1['counts']['active'] ?? null, $scPg1['counts']['archived'] ?? null], 'Paging: counts for the filtered course');
$pdo->exec("DELETE FROM class_sections WHERE course_id = {$scPgCourseId}");
$pdo->exec("DELETE FROM courses WHERE course_id = {$scPgCourseId}");

[$scStatus, $scActive] = $scList('q=' . rawurlencode($scTag));
$scActiveIds = $scCodes($scActive);
expect_same(200, $scStatus, 'List: the active view answers');
expect_same([$scK1, $scK2, $scK4, $scK3, $scK5], $scActiveIds, 'List: active view holds only current-year, non-archived classes, sorted by course code then section');
expect_true(!array_intersect([$scPast, $scDone, $scCancel, $scMistake], $scActiveIds), 'List: past-year and archived classes are not in the active view');
[, $scArchived] = $scList('view=archived&q=' . rawurlencode($scTag));
$scArchivedById = [];
foreach ($scArchived['classes'] ?? [] as $scRow) {
    $scArchivedById[(int) $scRow['csId']] = $scRow;
}
expect_same([$scCancel, $scDone, $scMistake, $scPast], array_keys($scArchivedById), 'List: archived view holds the cancelled, finished and mistake classes of this year, then the past-year class (current year first, then course code, then section)');
expect_same(['finished', 'cancelled', 'mistake', 'completed'], [$scArchivedById[$scDone]['archiveReason'] ?? null, $scArchivedById[$scCancel]['archiveReason'] ?? null, $scArchivedById[$scMistake]['archiveReason'] ?? null, $scArchivedById[$scPast]['archiveReason'] ?? null], 'List: Completed (finished and past years) apart from Cancelled and Created by mistake');
expect_same([false, false, false, false], [$scArchivedById[$scDone]['canChangeFaculty'] ?? null, $scArchivedById[$scCancel]['canChangeFaculty'] ?? null, $scArchivedById[$scMistake]['canChangeFaculty'] ?? null, $scArchivedById[$scPast]['canChangeFaculty'] ?? null], 'List: canChangeFaculty is false on every archived class');
expect_same([true, false], [$scArchivedById[$scDone]['current'] ?? null, $scArchivedById[$scPast]['current'] ?? null], 'List: current is true for this school year and false for a past one');
expect_true(($scArchivedById[$scDone]['archivedAt'] ?? null) !== null && array_key_exists('archivedAt', $scActive['classes'][0] ?? []) && $scActive['classes'][0]['archivedAt'] === null, 'List: archivedAt is set on archived classes and null on active ones');
expect_same([5, 4], [$scActive['counts']['active'] ?? null, $scActive['counts']['archived'] ?? null], 'List: counts hold Active and Archived for the filter');
expect_same([5, 4], [$scActive['total'] ?? null, $scArchived['total'] ?? null], 'List: total follows the view');
$scK1Row = $scActive['classes'][0] ?? [];
expect_true($scK1Row['canChangeFaculty'] === true && $scK1Row['current'] === true && $scK1Row['archiveReason'] === null, 'List: a current active class can change Faculty');
expect_same(["SCA{$scTag}", "SC-K1-{$scTag}", $scYear, '1ST', 2, $scFa, "Sc Alpha {$scLetters}"], [$scK1Row['courseCode'] ?? null, $scK1Row['section'] ?? null, $scK1Row['schoolYear'] ?? null, $scK1Row['semester'] ?? null, $scK1Row['studentCount'] ?? null, $scK1Row['faculty']['userId'] ?? null, $scK1Row['faculty']['name'] ?? null], 'List: ClassRow carries course, section, term, student count and Faculty');
expect_same("Sc Secretary {$scLetters}", $scK1Row['secretary']['name'] ?? null, 'List: ClassRow carries the Class Secretary');
expect_true(array_key_exists('secretary', $scActive['classes'][1] ?? []) && $scActive['classes'][1]['secretary'] === null, 'List: a class without a Secretary has secretary null');
foreach (['courseTitle', 'yearLevel', 'schedule', 'rooms', 'archivedAt'] as $scKey) {
    expect_true(array_key_exists($scKey, $scK1Row), "List: ClassRow has {$scKey}");
}
expect_same('Room SC-1', $scK1Row['rooms']['lecture'] ?? null, 'List: ClassRow shows the lecture room');

// Filters narrow correctly.
$scFiltered = static fn(string $extra): array => $scCodes($scList('q=' . rawurlencode($scTag) . $extra)[1]);
expect_same([$scPast], $scCodes($scList('view=archived&q=' . rawurlencode($scTag) . '&schoolYear=' . $scPastYear)[1]), 'Filter schoolYear: the past year holds only its class');
expect_same([$scK5], $scFiltered('&semester=2ND'), 'Filter semester 2ND');
expect_same([$scK1, $scK2, $scK4], $scFiltered("&courseId={$scCourse1}"), 'Filter courseId');
expect_same([$scK1, $scK2, $scK3], $scFiltered("&facultyId={$scFa}"), 'Filter facultyId');
expect_same([$scK5], $scCodes($scList('q=' . rawurlencode("K5-{$scTag}"))[1]), 'Filter q: a section name');
expect_same([$scK1, $scK2, $scK3], $scCodes($scList('q=' . rawurlencode("Alpha {$scLetters}"))[1]), 'Filter q: a Faculty name');
expect_same([$scK3, $scK5], $scCodes($scList('q=' . rawurlencode("SCB{$scTag}"))[1]), 'Filter q: a course code');
expect_same([$scK3, $scK5], $scCodes($scList('q=' . rawurlencode("Course Two {$scTag}"))[1]), 'Filter q: a course title');
expect_same([$scK1], $scFiltered("&courseId={$scCourse1}&facultyId={$scFa}&semester=1ST&q=K1"), 'Filters combine');
expect_same([], $scFiltered("&courseId={$scCourse2}&facultyId={$scFc}"), 'Filters that match nothing give an empty list');
// Unknown filter values are 422.
foreach (['view=nonsense', 'semester=3RD', 'schoolYear=1999-2000', 'courseId=abc', 'facultyId=0', 'page=0', 'page=abc'] as $scBad) {
    expect_same(422, $scList($scBad)[0], "List: ?{$scBad} is 422");
}
// A well-formed id that matches nothing gives an empty list, like People & Accounts (superadmin_integration.php 'an unknown course').
expect_same([[], []], [$scFiltered('&courseId=999999999'), $scFiltered('&facultyId=999999999')], 'List: an unknown course or Faculty id gives an empty list');
// Detail.
[$scDetailStatus, $scDetail] = $scGet('/api/admin/classes/detail?csId=' . $scK1);
expect_same(200, $scDetailStatus, 'Detail: reads a class');
expect_same($scK1, $scDetail['class']['csId'] ?? null, 'Detail: returns the ClassRow');
$scRoster = $scDetail['roster'] ?? [];
expect_same([$scS1['number'], $scS2['number']], array_values(array_intersect(array_column($scRoster, 'studentNo'), [$scS1['number'], $scS2['number']])), 'Detail: the roster lists the real enrolled Students');
expect_same(2, count($scRoster), 'Detail: the roster has exactly the enrolled Students');
foreach (['studentNo', 'name', 'email', 'yearLevel', 'status'] as $scKey) {
    expect_true(array_key_exists($scKey, $scRoster[0] ?? []), "Detail: roster entry has {$scKey}");
}
expect_same("Sc Secretary {$scLetters}", $scDetail['class']['secretary']['name'] ?? null, 'Detail: the class carries its Secretary');
expect_same(404, $scGet('/api/admin/classes/detail?csId=999999999')[0], 'Detail: an unknown class is 404');
expect_same(422, $scGet('/api/admin/classes/detail')[0], 'Detail: no csId is 422');
// Filters route.
[$scFiltersStatus, $scFilters] = $scGet('/api/admin/classes/filters');
expect_same(200, $scFiltersStatus, 'Filters: answers');
expect_same($scYear, $scFilters['currentSchoolYear'] ?? null, 'Filters: currentSchoolYear');
expect_true(in_array($scYear, $scFilters['schoolYears'] ?? [], true) && in_array($scPastYear, $scFilters['schoolYears'] ?? [], true), 'Filters: school years include the current and a past one');
$scFacultyOptions = [];
foreach ($scFilters['faculty'] ?? [] as $scOption) {
    $scFacultyOptions[(int) $scOption['userId']] = $scOption;
}
expect_same('deactivated', $scFacultyOptions[$scFd]['status'] ?? null, 'Filters: a deactivated Faculty member is listed with status deactivated (D15)');
expect_same('active', $scFacultyOptions[$scFa]['status'] ?? null, 'Filters: an active Faculty member has status active');
expect_true(!isset($scFacultyOptions[$scDeanId]) && !isset($scFacultyOptions[$scStudentAccount]) && !isset($scFacultyOptions[$superUserId]), 'Filters: the Faculty list holds no Dean, Student or Superadmin');
$scCourseOptions = array_column($scFilters['courses'] ?? [], null, 'courseId');
expect_same(["SCA{$scTag}", "Sc Course One {$scTag}"], [$scCourseOptions[$scCourse1]['courseCode'] ?? null, $scCourseOptions[$scCourse1]['title'] ?? null], 'Filters: courses carry courseId, courseCode and title');

// ---- 3. Refusals (each leaves the database unchanged) ----
$scRefused('Missing csId', ['toUserId' => $scFb, 'reason' => $scReason], 422, 'validation', null);
$scRefused('Missing toUserId', ['csId' => $scK1, 'reason' => $scReason], 422, 'validation', null);
$scRefused('Missing reason', ['csId' => $scK1, 'toUserId' => $scFb], 422, 'validation', 'Enter a reason of 8 to 240 characters.');
$scRefused('Reason under 8 characters', ['csId' => $scK1, 'toUserId' => $scFb, 'reason' => 'abcdefg'], 422, 'validation', 'Enter a reason of 8 to 240 characters.');
$scRefused('Reason over 240 characters', ['csId' => $scK1, 'toUserId' => $scFb, 'reason' => str_repeat('a', 241)], 422, 'validation', 'Enter a reason of 8 to 240 characters.');
$scRefused('Blank reason', ['csId' => $scK1, 'toUserId' => $scFb, 'reason' => '     '], 422, 'validation', 'Enter a reason of 8 to 240 characters.');
$scRefused('Unknown class', ['csId' => 999999999, 'toUserId' => $scFb, 'reason' => $scReason], 404, 'class_not_found', 'Class not found.');
$scRefused('Past school year', ['csId' => $scPast, 'toUserId' => $scFb, 'reason' => $scReason], 409, 'class_not_current', 'Past and archived classes are view-only.');
$scRefused('Archived (finished)', ['csId' => $scDone, 'toUserId' => $scFb, 'reason' => $scReason], 409, 'class_not_current', 'Past and archived classes are view-only.');
$scRefused('Archived (cancelled)', ['csId' => $scCancel, 'toUserId' => $scFb, 'reason' => $scReason], 409, 'class_not_current', 'Past and archived classes are view-only.');
$scRefused('The same Faculty member', ['csId' => $scK1, 'toUserId' => $scFa, 'reason' => $scReason], 409, 'same_faculty', 'This class already belongs to that Faculty member.');
foreach ([['a deactivated Faculty member', $scFd], ['an invited Faculty member', $scFe], ['the Dean', $scDeanId], ['a Student', $scStudentAccount], ['a Secretary', $scSecretary], ['the Superadmin', $superUserId], ['an unknown account', 999999999]] as [$scWhat, $scTarget]) {
    $scRefused("Target is {$scWhat}", ['csId' => $scK1, 'toUserId' => $scTarget, 'reason' => $scReason], 409, 'faculty_not_eligible', 'Choose an active Faculty member.');
}
// An open attendance session blocks the move and the message gives its end time (D5).
$pdo->prepare("INSERT INTO attendance_sessions (cs_id, secretary_user_id, owner_user_id, session_date, session_code, status, class_end_time) VALUES (?, ?, ?, CURRENT_DATE, ?, 'active', '10:00')")->execute([$scK1, $scSecretary, $scSecretary, "SC-OPEN-{$scTag}"]);
$scOpen = $scRefused('Open attendance session', ['csId' => $scK1, 'toUserId' => $scFb, 'reason' => $scReason], 409, 'session_open', null);
expect_true(str_starts_with((string) ($scOpen['message'] ?? ''), 'End the open attendance session first') && str_contains((string) ($scOpen['message'] ?? ''), '10:00 AM'), 'Open attendance session: the message names the session end time (' . ($scOpen['message'] ?? '') . ')');
$pdo->prepare("UPDATE attendance_sessions SET status = 'ended', ended_at = CURRENT_TIMESTAMP(6) WHERE session_code = ?")->execute(["SC-OPEN-{$scTag}"]);
// D20: FC already has her own weights for course 1, this term: refused, and nothing is copied or moved.
$scRefused('D20 clash', ['csId' => $scK1, 'toUserId' => $scFc, 'reason' => $scReason], 409, 'grading_weights_clash', "Sc Charlie {$scLetters} already has grade weights for SCA{$scTag}, 1st Semester {$scYear}. Choose another Faculty member.");
expect_same($scFa, (int) $scOne('SELECT instructor_user_id FROM class_sections WHERE cs_id = ?', [$scK1]), 'D20 clash: the class stays with its Faculty member');

// ---- 4. Rollback: a failure at the last step (the audit write) undoes the whole change (one transaction) ----
// The application database role cannot create a failing trigger, so the controller function runs in-process with a broken audit key,
// the way the handler runs it (begin, change, commit; any Throwable rolls back).
require_once $root . '/backend/app/mailer.php'; // send_email; loaded by bootstrap.php in the app
require_once $root . '/backend/app/email_template.php'; // loaded by bootstrap.php in the app
require_once $root . '/backend/controllers/StudentAuthController.php'; // the outbox sender; loaded by routes/api.php in the app
require_once $root . '/backend/controllers/SuperadminController.php';
require_once $root . '/backend/controllers/SuperadminClassesController.php';
$scActor = ['user_id' => $superUserId, 'role' => 'superadmin', 'login_email' => $superEmail, 'display_name' => 'Super Admin'];
$scBrokenAudit = app_config();
$scBrokenAudit['audit']['mac_key_b64'] = 'not-a-key';
$scBeforeRollback = $scWorld();
$scThrown = false;
$pdo->beginTransaction();
try {
    superadmin_class_change_faculty($pdo, $scBrokenAudit, $scActor, ['csId' => $scK1, 'toUserId' => $scFb, 'reason' => $scReason]);
    $pdo->commit();
} catch (Throwable $scRollbackError) {
    $scThrown = true;
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
}
expect_true($scThrown, 'Rollback: a failing audit write makes the change fail');
expect_same($scBeforeRollback, $scWorld(), 'Rollback: owner, copied weights, notices, outbox and audit are all as they were');

// ---- 5. Success with D20 (a): class with weights moves to FB ----
$scOtherBefore = $scKeep([$scK2]);
$scFaCategoriesBefore = $scRows('SELECT category_id FROM grading_categories WHERE config_id = ? ORDER BY category_id', [$scFaConfig]);
$scK2CategoriesBefore = $scRows('SELECT assessment_id, grading_category_id FROM assessments WHERE cs_id = ? ORDER BY assessment_id', [$scK2]);
$scMemberCount = static fn(int $config): int => (int) $scOne('SELECT count(*) FROM grading_category_period_memberships m JOIN grading_categories gc ON gc.category_id = m.category_id WHERE gc.config_id = ?', [$config]);
$scFaMemberBefore = $scMemberCount($scFaConfig);
[, $scGradeBefore] = integration_http_json('/api/faculty/grades/compute', $scTokenFa, ['classId' => (string) $scK1]);
$scBeforeResults = [];
foreach ([$scS1, $scS2] as $scWho) {
    $scResult = integration_find_enrollment_result($scGradeBefore, $scWho['enrollmentId']);
    $scBeforeResults[$scWho['enrollmentId']] = [$scResult['status'] ?? null, $scResult['percentage'] ?? null, $scResult['periods']['midterm']['percentage'] ?? null, $scResult['periods']['final']['percentage'] ?? null];
}
expect_true(($scBeforeResults[$scS1['enrollmentId']][0] ?? '') === 'computed' && $scBeforeResults[$scS1['enrollmentId']][1] !== null, 'Setup: FA computes a grade for Student One before the move');
$pdo->prepare("INSERT INTO enrollments (student_id, cs_id, status, date_enrolled) SELECT student_id, ?, 'Active', CURRENT_DATE FROM students WHERE student_account_user_id = ?")->execute([$scK1, $scStudentAccount]);
$scKeepBefore = $scKeep([$scK1]); // after FA's own compute: computing writes the stored grades, and Change Faculty must not
$scStoredBefore = $scRows('SELECT enrollment_id, final_percentage, final_gwa FROM enrollments WHERE cs_id = ? ORDER BY enrollment_id', [$scK1]);
expect_true(str_contains(json_encode(integration_http_get_json('/api/faculty/classes', $scTokenFa)[1]), "SC-K1-{$scTag}"), 'Setup: the class is in FA\'s classes before the move');
$scNotesBefore = $scWorld()['notifications'];
$scOutboxBefore = (int) $scWorld()['outbox'];

$scAuditTotalBefore = (int) $scOne('SELECT count(*) FROM audit_events');
[$scOkStatus, $scOk] = $scChange(['csId' => $scK1, 'toUserId' => $scFb, 'reason' => "  {$scReason}  "]);
expect_true($scOkStatus === 200 && ($scOk['status'] ?? '') === 'ok', 'Change Faculty: 200 ok (' . json_encode($scOk) . ')');
expect_same("SCA{$scTag} (SC-K1-{$scTag}) now belongs to Sc Bravo {$scLetters}.", $scOk['message'] ?? null, 'Change Faculty: the message names the class and the new Faculty member');
expect_same([$scK1, $scFb, "Sc Bravo {$scLetters}", true], [$scOk['class']['csId'] ?? null, $scOk['class']['faculty']['userId'] ?? null, $scOk['class']['faculty']['name'] ?? null, $scOk['class']['canChangeFaculty'] ?? null], 'Change Faculty: the answer carries the updated ClassRow');
$scAuditTotalAfter = (int) $scOne('SELECT count(*) FROM audit_events');
expect_same($scFb, (int) $scOne('SELECT instructor_user_id FROM class_sections WHERE cs_id = ?', [$scK1]), 'Change Faculty: instructor_user_id moved to the new Faculty member');
expect_same($scKeepBefore, $scKeep([$scK1]), 'Change Faculty: students, scores, assessments, sessions (including the scheduled one), records, Secretary and join code all stay');
expect_same(1, (int) $scOne("SELECT count(*) FROM attendance_sessions WHERE cs_id = ? AND status = 'scheduled'", [$scK1]), 'Change Faculty: the scheduled session came along');
expect_same($scSecretary, (int) $scOne('SELECT secretary_user_id FROM class_sections WHERE cs_id = ?', [$scK1]), 'Change Faculty: the Class Secretary stays');
expect_same('SCJ123', $scOne('SELECT join_code FROM class_sections WHERE cs_id = ?', [$scK1]), 'Change Faculty: the join code stays (D2)');
expect_same($scStoredBefore, $scRows('SELECT enrollment_id, final_percentage, final_gwa FROM enrollments WHERE cs_id = ? ORDER BY enrollment_id', [$scK1]), 'Change Faculty: stored grades are untouched');
// Ownership flips at once for the old and new Faculty member.
expect_same(403, integration_http_json('/api/faculty/grades/compute', $scTokenFa, ['classId' => (string) $scK1])[0], 'Ownership: the previous Faculty member now gets 403 on the class');
expect_true(!str_contains(json_encode(integration_http_get_json('/api/faculty/classes', $scTokenFa)[1]), "SC-K1-{$scTag}"), 'Ownership: the class left the previous Faculty member\'s classes (D13)');
expect_same(200, integration_http_json('/api/faculty/grades/compute', $scTokenFb, ['classId' => (string) $scK1])[0], 'Ownership: the new Faculty member computes the class\'s grades');
expect_true(str_contains(json_encode(integration_http_get_json('/api/faculty/classes', $scTokenFb)[1]), "SC-K1-{$scTag}"), 'Ownership: the class appears in the new Faculty member\'s classes');
expect_same(200, integration_http_get_json('/api/faculty/classes', $scTokenFa)[0], 'Ownership: the previous Faculty member still signs in and works');
// D20: a copied configuration for FB, this class's assessments point at it, FA's other section is untouched.
$scFbConfigs = $scRows('SELECT config_id FROM grading_configs WHERE faculty_user_id = ? AND course_id = ?', [$scFb, $scCourse1]);
expect_same(1, count($scFbConfigs), 'D20: the new Faculty member got one grading_configs row for the course');
$scFbConfig = (int) ($scFbConfigs[0]['config_id'] ?? 0);
expect_true($scFbConfig > 0 && $scFbConfig !== $scFaConfig, 'D20: it is a copy, not FA\'s row');
expect_same($scFaConfig, (int) $scOne('SELECT config_id FROM grading_configs WHERE faculty_user_id = ? AND course_id = ?', [$scFa, $scCourse1]), 'D20: FA keeps her own configuration');
expect_same($scFaCategoriesBefore, $scRows('SELECT category_id FROM grading_categories WHERE config_id = ? ORDER BY category_id', [$scFaConfig]), 'D20: FA\'s categories are untouched');
expect_same($scFaMemberBefore, $scMemberCount($scFaConfig), 'D20: FA\'s period memberships are untouched');
expect_same(count($scFaCategoriesBefore), count($scRows('SELECT category_id FROM grading_categories WHERE config_id = ?', [$scFbConfig])), 'D20: the copy has the same number of categories');
expect_same($scFaMemberBefore, $scMemberCount($scFbConfig), 'D20: the copy has the same number of period memberships');
$scShape = static fn(int $config): array => $scRows('SELECT m.grading_period, m.component, m.name, m.weight, m.sort_order FROM grading_category_period_memberships m JOIN grading_categories gc ON gc.category_id = m.category_id WHERE gc.config_id = ? ORDER BY m.grading_period, m.component, m.sort_order, m.name', [$config]);
expect_same($scShape($scFaConfig), $scShape($scFbConfig), 'D20: the copied categories carry the same names, weights, periods and components');
$scConfigJson = static fn(int $config): string => (string) $scOne("SELECT (to_jsonb(g) - 'config_id' - 'faculty_user_id' - 'created_at' - 'updated_at' - 'updated_by_user_id' - 'version')::text FROM grading_configs g WHERE config_id = ?", [$config]);
expect_same($scConfigJson($scFaConfig), $scConfigJson($scFbConfig), 'D20: the copied configuration has the same settings (mode, ratios, date ranges)');
$scK1Categories = array_column($scRows('SELECT DISTINCT grading_category_id FROM assessments WHERE cs_id = ? AND grading_category_id IS NOT NULL', [$scK1]), 'grading_category_id');
expect_true($scK1Categories !== [] && count($scK1Categories) === 6 && count(array_intersect($scK1Categories, array_column($scFaCategoriesBefore, 'category_id'))) === 0, 'D20: this class\'s assessments no longer point at FA\'s categories');
expect_same(0, (int) $scOne('SELECT count(*) FROM assessments a JOIN grading_categories gc ON gc.category_id = a.grading_category_id WHERE a.cs_id = ? AND gc.config_id <> ?', [$scK1, $scFbConfig]), 'D20: every categorised assessment of the class points at the new Faculty member\'s copy');
expect_same($scK2CategoriesBefore, $scRows('SELECT assessment_id, grading_category_id FROM assessments WHERE cs_id = ? ORDER BY assessment_id', [$scK2]), 'D20: FA\'s other section keeps pointing at FA\'s categories');
expect_same($scOtherBefore, $scKeep([$scK2]), 'D20: FA\'s other section is untouched');
expect_same(1, (int) $scOne('SELECT count(*) FROM grading_configs WHERE faculty_user_id = ? AND course_id = ?', [$scFa, $scCourse1]), 'D20: FA still has exactly her one configuration for the course');
expect_same(1, (int) $scOne('SELECT count(*) FROM grading_configs WHERE faculty_user_id = ? AND course_id = ?', [$scFc, $scCourse1]), 'D20: FC\'s own configuration was not touched');
// The grade for every Student is identical, computed by the new Faculty member with the app's own function.
[$scAfterStatus, $scGradeAfter] = integration_http_json('/api/faculty/grades/compute', $scTokenFb, ['classId' => (string) $scK1]);
expect_same(200, $scAfterStatus, 'D20: the new Faculty member recomputes the class');
foreach ([$scS1, $scS2] as $scWho) {
    $scResult = integration_find_enrollment_result($scGradeAfter, $scWho['enrollmentId']);
    expect_same($scBeforeResults[$scWho['enrollmentId']], [$scResult['status'] ?? null, $scResult['percentage'] ?? null, $scResult['periods']['midterm']['percentage'] ?? null, $scResult['periods']['final']['percentage'] ?? null], "D20: the computed grade of {$scWho['number']} is identical before and after");
}
// FA's other section still computes for FA, and the old Faculty member's grades are not disturbed.
[$scOtherStatus] = integration_http_json('/api/faculty/grades/compute', $scTokenFa, ['classId' => (string) $scK2]);
expect_same(200, $scOtherStatus, 'D20: FA still computes her other section');
// Audit.
$scAudit = $scRows("SELECT actor_role, actor_user_id, reason, scope_cs_id, before_state_json, after_state_json FROM audit_events WHERE action_code = 'class_faculty_changed' AND target_id = ?", [(string) $scK1]);
expect_same(1, count($scAudit), 'Audit: one class_faculty_changed row');
$scAuditRow = $scAudit[0] ?? [];
expect_true(($scAuditRow['actor_role'] ?? '') === 'superadmin' && (int) ($scAuditRow['actor_user_id'] ?? 0) === $superUserId && (int) ($scAuditRow['scope_cs_id'] ?? 0) === $scK1, 'Audit: actor is the Superadmin and the scope is the class');
expect_same($scReason, $scAuditRow['reason'] ?? null, 'Audit: the reason is recorded (trimmed)');
$scBefore = json_decode((string) ($scAuditRow['before_state_json'] ?? ''), true) ?: [];
$scAfter = json_decode((string) ($scAuditRow['after_state_json'] ?? ''), true) ?: [];
expect_same([$scFa, "Sc Alpha {$scLetters}"], [$scBefore['instructor_user_id'] ?? null, $scBefore['name'] ?? null], 'Audit: before holds the previous Faculty member id and name');
expect_same([$scFb, "Sc Bravo {$scLetters}"], [$scAfter['instructor_user_id'] ?? null, $scAfter['name'] ?? null], 'Audit: after holds the new Faculty member id and name');
expect_same($scAuditTotalBefore + 1, $scAuditTotalAfter, 'Audit: the whole change is one audit row (the copied weights are not a separate grading event)');
[, $scTrail] = $scGet('/api/admin/audit-logs?q=' . rawurlencode($scTag));
$scTrailRow = array_values(array_filter($scTrail['entries'] ?? [], static fn(array $e): bool => ($e['details']['technical']['actionCode'] ?? '') === 'class_faculty_changed'));
expect_true(count($scTrailRow) >= 1 && str_contains(json_encode($scTrailRow[0]), "Sc Alpha {$scLetters}") && str_contains(json_encode($scTrailRow[0]), "Sc Bravo {$scLetters}"), 'Audit: the Superadmin Audit Trail lists the row with both Faculty names');
// Notices: in-app to old Faculty, new Faculty, the Class Secretary, and active enrolled Students with active accounts (NTF-002).
$scNote = static fn(int $user): array => $scRows("SELECT title, body, entity_id FROM notifications WHERE recipient_user_id = ? AND notification_type = 'class_assignment' AND entity_id = ? ORDER BY notification_id", [$user, (string) $scK1]);
$scLabel = "SCA{$scTag} (SC-K1-{$scTag})";
expect_same([['title' => 'Class moved', 'body' => "{$scLabel} was moved to Sc Bravo {$scLetters} by the Superadmin. Reason: {$scReason}. It no longer appears in your classes.", 'entity_id' => (string) $scK1]], $scNote($scFa), 'Notice: the previous Faculty member is told the class moved');
expect_same([['title' => 'Class assigned to you', 'body' => "{$scLabel} is now yours. Its students, grades, attendance and sessions came with it. Reason: {$scReason}.", 'entity_id' => (string) $scK1]], $scNote($scFb), 'Notice: the new Faculty member is told the class is theirs');
$scSecretaryNote = $scNote($scSecretary);
expect_true(count($scSecretaryNote) === 1 && $scSecretaryNote[0]['body'] === "Your class {$scLabel} now has Sc Bravo {$scLetters} as its Faculty member.", 'Notice: the Class Secretary is told who the Faculty member is now');
$scStudentNote = $scNote($scStudentAccount);
expect_true(count($scStudentNote) === 1 && $scStudentNote[0]['title'] === 'Class Faculty changed' && str_contains($scStudentNote[0]['body'], $scLabel) && str_contains($scStudentNote[0]['body'], "Sc Bravo {$scLetters}"), 'Notice: the enrolled Student with an active account receives Class Faculty changed (NTF-002)');
expect_same((int) $scNotesBefore + 4, (int) $scWorld()['notifications'], 'Notice: exactly four in-app notices were written');
// Email: two outbox rows, both Faculty members, with the contract subjects.
$scMail = $scRows("SELECT recipient_email, subject, email_type, sender_user_id, status FROM email_outbox WHERE recipient_email IN (?, ?) ORDER BY email_id", [$scEmail($scFa), $scEmail($scFb)]);
expect_same($scOutboxBefore + 2, (int) $scWorld()['outbox'], 'Email: exactly two outbox rows (both Faculty members), none for the Secretary or Students');
expect_same([[$scEmail($scFa), 'Class moved'], [$scEmail($scFb), 'Class assigned to you']], array_map(static fn(array $m): array => [$m['recipient_email'], $m['subject']], $scMail), 'Email: previous Faculty member "Class moved", new Faculty member "Class assigned to you"');
expect_true(count($scMail) === 2 && (int) $scMail[0]['sender_user_id'] === $superUserId, 'Email: recorded in Email History under the Superadmin as sender');
$scSent = $scRows("SELECT email_id, subject, message_body FROM email_outbox WHERE recipient_email = ?", [$scEmail($scFb)]);
expect_true($scSent !== [] && str_contains((string) $scSent[0]['message_body'], $scReason) && str_contains((string) $scSent[0]['message_body'], 'is now yours'), 'Email: the new Faculty member email carries the notice text and the reason');
expect_true(count($scMail) === 2 && $scMail[0]['status'] !== 'Pending' && $scMail[1]['status'] !== 'Pending', 'Email: both rows were sent after the commit (not left Pending)');

// ---- 6. D20 (c): a class with no configuration moves and nothing is copied ----
$scConfigsBefore = (int) $scOne('SELECT count(*) FROM grading_configs WHERE course_id = ?', [$scCourse2]);
$scK3KeepBefore = $scKeep([$scK3]);
[$scNoCfgStatus, $scNoCfg] = $scChange(['csId' => $scK3, 'toUserId' => $scFb, 'reason' => 'No weights yet, moving it anyway.']);
expect_true($scNoCfgStatus === 200 && ($scNoCfg['class']['faculty']['userId'] ?? 0) === $scFb, 'D20 (c): a class with no grading configuration moves (' . json_encode($scNoCfg) . ')');
expect_same($scConfigsBefore, (int) $scOne('SELECT count(*) FROM grading_configs WHERE course_id = ?', [$scCourse2]), 'D20 (c): nothing is copied');
expect_same($scK3KeepBefore, $scKeep([$scK3]), 'D20 (c): everything else stays with the class');
// Moved classes may move again (they are still current and active); a move back is allowed and refused only when the target has weights.
// D20 (b) with a section the target also teaches: FB (now holds a copy for course 1) is refused as a target for K2 from FA.
$scRefused('D20 clash after the first move (FB now has weights for course 1)', ['csId' => $scK2, 'toUserId' => $scFb, 'reason' => $scReason], 409, 'grading_weights_clash', null);
$scRefused('The class moved once now belongs to FB: moving it to FB again', ['csId' => $scK1, 'toUserId' => $scFb, 'reason' => $scReason], 409, 'same_faculty', null);

// ---- 7. A failed email does not undo the change (run in-process with a mail server that refuses) ----
$scFailConfig = app_config();
$scFailConfig['providers']['email']['active'] = 'smtp';
$scFailConfig['smtp']['host'] = '127.0.0.1';
$scFailConfig['smtp']['port'] = 1;
$scFailConfig['smtp']['encryption'] = 'none';
$scFailConfig['smtp']['username'] = '';
$scFailConfig['smtp']['password'] = '';
$scK7 = $scMakeClass("K7-{$scTag}", $scCourse2, $scFa);
$pdo->beginTransaction();
$scFail = superadmin_class_change_faculty($pdo, $scFailConfig, $scActor, ['csId' => $scK7, 'toUserId' => $scFb, 'reason' => 'Mail server is down for this move.']);
$pdo->commit();
$scFail['afterCommit']();
expect_same($scFb, (int) $scOne('SELECT instructor_user_id FROM class_sections WHERE cs_id = ?', [$scK7]), 'Failed email: the class still moved');
expect_same(1, (int) $scOne("SELECT count(*) FROM audit_events WHERE action_code = 'class_faculty_changed' AND target_id = ?", [(string) $scK7]), 'Failed email: the audit row is kept');
$scFailedMail = $scRows("SELECT status FROM email_outbox WHERE subject IN ('Class moved', 'Class assigned to you') AND message_body LIKE '%Mail server is down%' ORDER BY email_id");
expect_true(count($scFailedMail) === 2 && $scFailedMail[0]['status'] === 'Failed' && $scFailedMail[1]['status'] === 'Failed', 'Failed email: both emails show as Failed in Email History (' . json_encode($scFailedMail) . ')');

// ---- 8. Deactivation (SA21) is unchanged; once the Faculty member has no current class left the block clears ----
$scFx = $saAccount("sc-fx-{$scTag}@bicol-u.edu.ph", 'faculty', "Sc Xray {$scLetters}");
$scK8 = $scMakeClass("K8-{$scTag}", $scCourse2, $scFx);
[$scBlockStatus, $scBlock] = $scPost('/api/admin/people/deactivate', ['userId' => $scFx, 'reason' => 'Left the college this term.']);
expect_true($scBlockStatus === 409 && ($scBlock['code'] ?? '') === 'faculty_has_current_classes' && ($scBlock['classes'][0]['csId'] ?? 0) === $scK8, 'SA21: a Faculty member with a current class cannot be deactivated');
[$scMoveStatus] = $scChange(['csId' => $scK8, 'toUserId' => $scFb, 'reason' => 'Xray is leaving the college.']);
expect_same(200, $scMoveStatus, 'SA21: the last class moves to another Faculty member');
[$scClearStatus] = $scPost('/api/admin/people/deactivate', ['userId' => $scFx, 'reason' => 'Left the college this term.']);
expect_same(200, $scClearStatus, 'SA21: after Change Faculty the deactivation block clears');
