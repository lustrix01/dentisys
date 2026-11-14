<?php

declare(strict_types=1);

// ADM-001 Superadmin mode (docs/contracts/superadmin.md): Course Catalog, People & Accounts, class-work audit.
// Included by the full disposable PostgreSQL suite right after audit_read_integration.php, so it reuses that
// scenario's $readWrite writer, $readTag, $readFaculty and $readOwnClass. Every row it makes carries $saTag.
$saTag = 'sa' . strtolower(bin2hex(random_bytes(3)));
$saPass = 'SuperAdm1n!Pass';
$saGet = static fn(string $path, ?string $token = null): array => integration_http_get_json($path, $token ?? $adminAccessToken);
$saPost = static fn(string $path, array $body, ?string $token = null): array => integration_http_json($path, $token ?? $adminAccessToken, $body);
$saAuditRows = static function (string $code, string $targetId) use ($pdo): array {
    $stmt = $pdo->prepare('SELECT reason, before_state_json, after_state_json FROM audit_events WHERE action_code = ? AND target_id = ? ORDER BY event_id');
    $stmt->execute([$code, $targetId]);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
};
$saAccount = static function (string $email, string $role, string $name, ?string $studentNumber = null) use ($pdo, $saPass): int {
    $pdo->beginTransaction(); // a Student account needs its canonical Student row in the same transaction
    $stmt = $pdo->prepare("INSERT INTO user_accounts (login_email, password_hash, role, display_name, status, created_at)
        VALUES (?, ?, ?, ?, 'Active', CURRENT_TIMESTAMP(6)) RETURNING user_id");
    $stmt->execute([$email, password_hash_user_password($saPass), $role, $name]);
    $id = (int) $stmt->fetchColumn();
    if ($studentNumber !== null) {
        $pdo->prepare("INSERT INTO students (student_number, first_name, last_name, bu_email, status, student_account_user_id, user_id)
            VALUES (?, 'Sa', ?, ?, 'active', ?, ?)")->execute([$studentNumber, $name, $email, $id, $role === 'secretary' ? $id : null]);
    }
    $pdo->commit();
    return $id;
};

// Every new route is Dean-only (SA5): Faculty and Secretary 403, anonymous 401.
foreach ([['GET', '/api/admin/courses'], ['GET', '/api/admin/people'], ['POST', '/api/admin/courses/retire'], ['POST', '/api/admin/people/deactivate']] as [$saMethod, $saPath]) {
    foreach ([['Faculty', $seedFacultyAccessToken, 403], ['Secretary', $secretaryAccessToken, 403], ['anonymous', '', 401]] as [$saWho, $saToken, $saWant]) {
        [$saStatus] = $saMethod === 'GET' ? integration_http_get_json($saPath, $saToken) : integration_http_json($saPath, $saToken, ['id' => 1, 'userId' => 1]);
        expect_same($saWant, $saStatus, "{$saWho} gets {$saWant} on {$saMethod} {$saPath}");
    }
}

// ---- Part B: Course Catalog ----
$saCourseStmt = $pdo->prepare("INSERT INTO courses (course_code, name, units, lecture_units, lab_units, grading_config) VALUES (?, ?, 3, 2, 1, '[]'::jsonb) RETURNING course_id");
$saCourseStmt->execute(["SA-{$saTag}", "Sa Course {$saTag}"]);
$saCourseId = (int) $saCourseStmt->fetchColumn();
$saCourseStmt->execute(["SB-{$saTag}", "Sb Course {$saTag}"]);
$saOtherCourseId = (int) $saCourseStmt->fetchColumn();
expect_same(['active', null], array_values($pdo->query("SELECT status, retired_at FROM courses WHERE course_id = {$saCourseId}")->fetch(PDO::FETCH_NUM)), 'Migration 060: a course defaults to active with no retired_at');
try {
    $pdo->exec("UPDATE courses SET status = 'retired' WHERE course_id = {$saCourseId}");
    expect_true(false, 'A retired course without retired_at is refused');
} catch (PDOException $saPairError) {
    expect_same('23514', $saPairError->getCode(), 'The retired_at pairing check refuses a retired course without a date');
}
[$saListStatus, $saList] = $saGet('/api/admin/courses?status=active&q=' . rawurlencode($saTag));
expect_true($saListStatus === 200 && count($saList['courses'] ?? []) === 2 && ($saList['courses'][0]['classCount'] ?? null) === 0, 'The Dean lists active courses with usage counts');
$saClass = $pdo->prepare("INSERT INTO class_sections (cs_name, course_id, instructor_user_id, semester, school_year, status) VALUES (?, ?, ?, '1ST', ?, 'Active') RETURNING cs_id");
$saClass->execute(["SA-CLASS-{$saTag}", $saCourseId, (int) $readFaculty['user_id'], academic_current_school_year($pdo)]);
$saClassId = (int) $saClass->fetchColumn();

[$saNoChangeStatus, $saNoChange] = $saPost('/api/admin/courses/update', ['id' => $saCourseId, 'courseCode' => "SA-{$saTag}", 'name' => "Sa Course {$saTag}", 'lectureUnits' => 2, 'labUnits' => 1]);
expect_true($saNoChangeStatus === 200 && ($saNoChange['course']['classCount'] ?? 0) === 1, 'An unchanged edit succeeds and reports the class count');
expect_same(0, count($saAuditRows('course_updated', (string) $saCourseId)), 'An unchanged edit writes no audit row (R3)');
[$saUpdateStatus, $saUpdate] = $saPost('/api/admin/courses/update', ['id' => $saCourseId, 'courseCode' => "  SA-{$saTag}  ", 'name' => "Sa  Renamed {$saTag}", 'lectureUnits' => 3, 'labUnits' => 0.5]);
expect_true($saUpdateStatus === 200 && ($saUpdate['course']['units'] ?? 0) === 3.5 && ($saUpdate['course']['name'] ?? '') === "Sa Renamed {$saTag}", 'Edit trims and single-spaces text and computes units = lecture + lab');
$saUpdated = $saAuditRows('course_updated', (string) $saCourseId);
expect_true(count($saUpdated) === 1 && str_contains((string) $saUpdated[0]['before_state_json'], "Sa Course {$saTag}") && str_contains((string) $saUpdated[0]['after_state_json'], "Sa Renamed {$saTag}"), 'An edit writes one course_updated row with before and after');
[$saDupStatus, $saDup] = $saPost('/api/admin/courses/update', ['id' => $saCourseId, 'courseCode' => strtolower("sb-{$saTag}"), 'name' => 'X', 'lectureUnits' => 1, 'labUnits' => 0]);
expect_true($saDupStatus === 409 && ($saDup['code'] ?? '') === 'course_code_taken', 'A code already used (any case) is refused with course_code_taken');
[$saBadStatus] = $saPost('/api/admin/courses/update', ['id' => $saCourseId, 'courseCode' => ' ', 'name' => 'X', 'lectureUnits' => 1, 'labUnits' => 0]);
[$saNoUnitsStatus] = $saPost('/api/admin/courses/update', ['id' => $saCourseId, 'courseCode' => "SA-{$saTag}", 'name' => 'X', 'lectureUnits' => 0, 'labUnits' => 0]);
expect_same([422, 422], [$saBadStatus, $saNoUnitsStatus], 'A blank code or no units is a validation error');
[$saMissingStatus, $saMissing] = $saPost('/api/admin/courses/retire', ['id' => 999999]);
expect_true($saMissingStatus === 404 && ($saMissing['code'] ?? '') === 'course_not_found', 'An unknown course is course_not_found');

[$saPickerStatus, $saPicker] = integration_http_get_json('/api/faculty/courses', $seedFacultyAccessToken);
expect_true($saPickerStatus === 200 && in_array("SA-{$saTag}", array_column($saPicker['courses'] ?? [], 'courseCode'), true), 'An active course is in the Faculty picker');
[$saRetireStatus, $saRetire] = $saPost('/api/admin/courses/retire', ['id' => $saCourseId, 'reason' => 'Test course']);
expect_true($saRetireStatus === 200 && ($saRetire['course']['status'] ?? '') === 'retired' && ($saRetire['course']['retiredAt'] ?? null) !== null, 'Retire marks the course retired with a date');
$saRetired = $saAuditRows('course_retired', (string) $saCourseId);
expect_true(count($saRetired) === 1 && $saRetired[0]['reason'] === 'Test course', 'Retire writes one audit row with the reason');
$saPost('/api/admin/courses/retire', ['id' => $saCourseId]);
expect_same(1, count($saAuditRows('course_retired', (string) $saCourseId)), 'Retiring a retired course is a no-op without an audit row (SA18)');
[, $saPickerAfter] = integration_http_get_json('/api/faculty/courses', $seedFacultyAccessToken);
expect_true(!in_array("SA-{$saTag}", array_column($saPickerAfter['courses'] ?? [], 'courseCode'), true), 'A retired course leaves the Faculty picker (SA15)');
expect_same("SA-{$saTag}", $pdo->query("SELECT c.course_code FROM class_sections cs JOIN courses c ON c.course_id = cs.course_id WHERE cs.cs_id = {$saClassId}")->fetchColumn(), 'An existing class keeps its retired course');
$saTermId = (int) ($pdo->query("SELECT id FROM academic_terms WHERE school_year = " . $pdo->quote(academic_current_school_year($pdo)) . ' ORDER BY end_date DESC LIMIT 1')->fetchColumn() ?: $pdo->query('SELECT MIN(id) FROM academic_terms')->fetchColumn());
[$saTypedStatus, $saTyped] = integration_http_json('/api/faculty/classes', $seedFacultyAccessToken, ['csName' => "SA-TYPED-{$saTag}", 'courseCode' => strtolower("sa-{$saTag}"), 'lectureUnits' => 1, 'academicTermId' => $saTermId]);
expect_true($saTypedStatus === 409 && ($saTyped['code'] ?? '') === 'course_retired' && ($saTyped['message'] ?? '') === 'This course was retired by the Dean. Ask the Dean to restore it.', 'A retired code typed by Faculty is refused with the Dean message (SA16)');
expect_same(0, (int) $pdo->query("SELECT COUNT(*) FROM class_sections WHERE cs_name = 'SA-TYPED-{$saTag}'")->fetchColumn(), 'The refused class was not created');
[$saRestoreStatus, $saRestore] = $saPost('/api/admin/courses/restore', ['id' => $saCourseId]);
expect_true($saRestoreStatus === 200 && ($saRestore['course']['status'] ?? '') === 'active' && array_key_exists('retiredAt', $saRestore['course'] ?? []) && $saRestore['course']['retiredAt'] === null, 'Restore puts the course back');
$saPost('/api/admin/courses/restore', ['id' => $saCourseId]);
expect_same(1, count($saAuditRows('course_restored', (string) $saCourseId)), 'Restoring an active course is a no-op without an audit row');
[, $saPickerBack] = integration_http_get_json('/api/faculty/courses', $seedFacultyAccessToken);
expect_true(in_array("SA-{$saTag}", array_column($saPickerBack['courses'] ?? [], 'courseCode'), true), 'A restored course is back in the Faculty picker');

// ---- Part C: People & Accounts ----
$saFaculty = $saAccount("sa-free-{$saTag}@bicol-u.edu.ph", 'faculty', "Sa Free {$saTag}");
$saBusy = $saAccount("sa-busy-{$saTag}@bicol-u.edu.ph", 'faculty', "Sa Busy {$saTag}");
$saPast = $saAccount("sa-past-{$saTag}@bicol-u.edu.ph", 'faculty', "Sa Past {$saTag}");
$saYear = academic_current_school_year($pdo);
$saClass->execute(["SA-BUSY-{$saTag}", $saCourseId, $saBusy, $saYear]);
$saBusyClass = (int) $saClass->fetchColumn();
$saClass->execute(["SA-ARCH-{$saTag}", $saCourseId, $saPast, $saYear]);
$pdo->exec("UPDATE class_sections SET archive_reason = 'finished', archived_at = CURRENT_TIMESTAMP(6) WHERE cs_id = " . (int) $saClass->fetchColumn());
$saClass->execute(["SA-OLD-{$saTag}", $saCourseId, $saPast, '2001-2002']);

[$saPeopleStatus, $saPeople] = $saGet('/api/admin/people?kind=faculty&q=' . rawurlencode($saTag));
$saFacultyRows = array_column($saPeople['people'] ?? [], null, 'userId');
expect_true($saPeopleStatus === 200 && count($saFacultyRows) === 3 && ($saFacultyRows[$saBusy]['classes'][0]['current'] ?? false) === true && ($saFacultyRows[$saFaculty]['classes'] ?? null) === [], 'The Dean lists Faculty with each member\'s classes');
[, $saPeopleDeans] = $saGet('/api/admin/people?kind=faculty&q=admin%40bicol');
expect_same([], $saPeopleDeans['people'] ?? null, 'Deans are not listed');
[$saLoginStatus, $saLogin] = integration_http_json('/api/auth/login', '', ['email' => "sa-free-{$saTag}@bicol-u.edu.ph", 'password' => $saPass]);
expect_same(200, $saLoginStatus, 'The Faculty fixture signs in before deactivation');
$saVersion = (int) $pdo->query("SELECT token_version FROM user_accounts WHERE user_id = {$saFaculty}")->fetchColumn();
[$saBlockedStatus, $saBlocked] = $saPost('/api/admin/people/deactivate', ['userId' => $saBusy]);
expect_true($saBlockedStatus === 409 && ($saBlocked['code'] ?? '') === 'faculty_has_current_classes' && ($saBlocked['classes'][0]['csId'] ?? 0) === $saBusyClass, 'A Faculty member with a current class is refused and the class is listed (SA21)');
expect_same('Active', $pdo->query("SELECT status FROM user_accounts WHERE user_id = {$saBusy}")->fetchColumn(), 'A refused deactivation changes nothing');
[$saPastStatus] = $saPost('/api/admin/people/deactivate', ['userId' => $saPast]);
expect_same(200, $saPastStatus, 'Archived and past-year classes do not block deactivation');
[$saLongStatus] = $saPost('/api/admin/people/deactivate', ['userId' => $saFaculty, 'reason' => str_repeat('x', 501)]);
expect_same(422, $saLongStatus, 'A reason over 500 characters is a validation error');
[$saOffStatus, $saOff] = $saPost('/api/admin/people/deactivate', ['userId' => $saFaculty, 'reason' => 'Left the school']);
expect_true($saOffStatus === 200 && ($saOff['person']['status'] ?? '') === 'deactivated' && ($saOff['person']['disabledAt'] ?? null) !== null, 'Deactivation returns the deactivated person');
$saState = $pdo->query("SELECT status, disabled_at, token_version FROM user_accounts WHERE user_id = {$saFaculty}")->fetch(PDO::FETCH_ASSOC);
expect_true($saState['status'] === 'Disabled' && $saState['disabled_at'] !== null && (int) $saState['token_version'] === $saVersion + 1, 'Status Disabled, disabled_at set and token_version bumped (SA19)');
expect_same(0, (int) $pdo->query("SELECT COUNT(*) FROM auth_sessions WHERE user_id = {$saFaculty} AND revoked_at IS NULL")->fetchColumn(), 'Every session is revoked');
expect_same(0, (int) $pdo->query("SELECT COUNT(*) FROM security_tokens WHERE user_id = {$saFaculty} AND purpose = 'refresh' AND revoked_at IS NULL")->fetchColumn(), 'Every refresh token is revoked');
expect_same('Account deactivated', $pdo->query("SELECT revocation_reason FROM auth_sessions WHERE user_id = {$saFaculty} ORDER BY session_id DESC LIMIT 1")->fetchColumn(), 'The sessions carry the revocation reason');
[$saOldTokenStatus] = integration_http_get_json('/api/faculty/classes', (string) ($saLogin['access_token'] ?? ''));
expect_same(401, $saOldTokenStatus, 'The old access token stops working at once');
[$saDeniedStatus, $saDenied] = integration_http_json('/api/auth/login', '', ['email' => "sa-free-{$saTag}@bicol-u.edu.ph", 'password' => $saPass]);
expect_true($saDeniedStatus === 403 && str_ends_with((string) ($saDenied['message'] ?? ''), 'Contact the Dean.'), 'Sign-in with the right password is refused with "Contact the Dean."');
$saOffRows = $saAuditRows('account_deactivated', (string) $saFaculty);
expect_true(count($saOffRows) === 1 && $saOffRows[0]['reason'] === 'Left the school' && str_contains((string) $saOffRows[0]['after_state_json'], 'Disabled'), 'Deactivation writes one audit row with the reason');
$saPost('/api/admin/people/deactivate', ['userId' => $saFaculty]);
expect_same(1, count($saAuditRows('account_deactivated', (string) $saFaculty)), 'Deactivating a deactivated account is a no-op without an audit row');
[, $saOnlyOff] = $saGet('/api/admin/people?kind=faculty&status=deactivated&q=' . rawurlencode($saTag));
expect_same([$saFaculty, $saPast], array_map('intval', array_column($saOnlyOff['people'] ?? [], 'userId')), 'The status filter lists deactivated Faculty');
[$saOnReStatus, $saOnRe] = $saPost('/api/admin/people/reactivate', ['userId' => $saFaculty]);
expect_true($saOnReStatus === 200 && ($saOnRe['person']['status'] ?? '') === 'active' && array_key_exists('disabledAt', $saOnRe['person'] ?? []) && $saOnRe['person']['disabledAt'] === null, 'Reactivation clears the deactivation');
[$saBackStatus] = integration_http_json('/api/auth/login', '', ['email' => "sa-free-{$saTag}@bicol-u.edu.ph", 'password' => $saPass]);
expect_same(200, $saBackStatus, 'After reactivation the person signs in with the same password');
expect_same(1, count($saAuditRows('account_reactivated', (string) $saFaculty)), 'Reactivation writes one audit row');
[$saDeanStatus, $saDean] = $saPost('/api/admin/people/deactivate', ['userId' => (int) $readDean['user_id']]);
expect_true($saDeanStatus === 404 && ($saDean['code'] ?? '') === 'person_not_found', 'A Dean can never be deactivated, not even their own account (SA23)');
[$saGhostStatus] = $saPost('/api/admin/people/deactivate', ['userId' => 999999]);
[$saKindStatus] = $saGet('/api/admin/people?kind=dean');
expect_same([404, 422], [$saGhostStatus, $saKindStatus], 'An unknown account is 404 and an unknown kind is 422');

// A Student and a Student who is a Class Secretary share one account, so one deactivation blocks both sign-ins.
$saStudent = $saAccount("sa-stu-{$saTag}@bicol-u.edu.ph", 'student', "Sa Stu {$saTag}", "SA-{$saTag}-1");
$saSecretary = $saAccount("sa-sec-{$saTag}@bicol-u.edu.ph", 'secretary', "Sa Sec {$saTag}", "SA-{$saTag}-2");
[, $saStudents] = $saGet('/api/admin/people?kind=student&q=' . rawurlencode($saTag));
expect_same([$saSecretary, $saStudent], array_map('intval', array_column($saStudents['people'] ?? [], 'userId')), 'Students and Class Secretaries are listed under Students');
foreach ([$saStudent, $saSecretary] as $saStudentUser) {
    [$saStuOffStatus] = $saPost('/api/admin/people/deactivate', ['userId' => $saStudentUser, 'reason' => 'Misused']);
    expect_same(200, $saStuOffStatus, 'A Student account has no class block (SA22)');
    $saEmail = (string) $pdo->query("SELECT login_email FROM user_accounts WHERE user_id = {$saStudentUser}")->fetchColumn();
    [$saStuDeniedStatus, $saStuDenied] = integration_http_json('/api/auth/login', '', ['email' => $saEmail, 'password' => $saPass]);
    expect_true($saStuDeniedStatus === 403 && str_ends_with((string) ($saStuDenied['message'] ?? ''), 'Contact the Dean.'), "Sign-in is refused for {$saEmail}");
    [$saStuOnStatus] = $saPost('/api/admin/people/reactivate', ['userId' => $saStudentUser]);
    expect_same(['active', 200], [$pdo->query("SELECT status FROM user_accounts WHERE user_id = {$saStudentUser}")->fetchColumn() === 'Active' ? 'active' : 'off', $saStuOnStatus], "Reactivation restores {$saEmail}");
}

// ---- Part A: class-work audit scope ----
$saStudentRow = $pdo->prepare("INSERT INTO students (student_number, first_name, last_name, bu_email, status) VALUES (?, 'Sa', ?, ?, 'active') RETURNING student_id");
$saStudentRow->execute(["SW-{$saTag}-1", "Fixture{$saTag}", "sw1-{$saTag}@bicol-u.edu.ph"]);
$saWorkStudent = (int) $saStudentRow->fetchColumn();
$saStudentRow->execute(["SW-{$saTag}-2", "Other{$saTag}", "sw2-{$saTag}@bicol-u.edu.ph"]);
$saOtherStudent = (int) $saStudentRow->fetchColumn();
$saEnrollStmt = $pdo->prepare("INSERT INTO enrollments (student_id, cs_id, status) VALUES (?, ?, 'Active') RETURNING enrollment_id");
$saEnrollStmt->execute([$saWorkStudent, $readOwnClass]);
$saEnrollment = (int) $saEnrollStmt->fetchColumn();
$readWrite($readFaculty, 'grading', 'assessment_scores_saved', 'Success', "Changed scores {$saTag}", [
    'target_type' => 'assessment', 'target_id' => '987655', 'scope_cs_id' => $readOwnClass,
    'after' => ['changes' => [['studentId' => (string) $saWorkStudent, 'studentNumber' => "SW-{$saTag}-1", 'studentName' => "Sa Fixture{$saTag}", 'assessmentId' => '987655', 'assessment' => 'Quiz 9', 'field' => 'score', 'before' => '7', 'after' => '9']], 'gradeChanges' => []],
]);
$readWrite($readFaculty, 'retention', 'retention_remedial_save', 'Success', "Remedial {$saTag}", ['target_type' => 'enrollment', 'target_id' => (string) $saEnrollment, 'scope_cs_id' => $readOwnClass]);
$readWrite($readFaculty, 'class_management', 'class_update', 'Success', "Class edit {$saTag}", ['target_type' => 'class_section', 'target_id' => (string) $readOwnClass, 'scope_cs_id' => $readOwnClass]);

[, $saOverview] = $saGet('/api/admin/audit-logs?q=' . rawurlencode($saTag));
expect_true(!in_array('Scores changed', array_column($saOverview['entries'] ?? [], 'what'), true) && ($saOverview['scope'] ?? '') === 'overview', 'The default Dean overview still hides class work');
[$saWorkStatus, $saWork] = $saGet('/api/admin/audit-logs?scope=class_work&q=' . rawurlencode($saTag));
$saWhat = array_column($saWork['entries'] ?? [], 'what');
expect_true($saWorkStatus === 200 && ($saWork['scope'] ?? '') === 'class_work' && in_array('Scores changed', $saWhat, true) && in_array('Remedial attempt recorded', $saWhat, true) && !in_array('Class changed', $saWhat, true), 'Class-work scope lists class-work rows only');
expect_same(['Grading', 'Attendance', 'Retention'], $saWork['areas'] ?? null, 'Class work offers the Grading, Attendance and Retention areas');
expect_true(($saWork['entries'][0]['classLabel'] ?? null) !== null && in_array((int) $readOwnClass, array_column($saWork['classOptions'] ?? [], 'id'), true) && in_array((int) $readFaculty['user_id'], array_column($saWork['facultyOptions'] ?? [], 'id'), true), 'Entries carry the class label and the filter options list the class and Faculty');
$saCount = static function (string $query) use ($saGet, $saTag): int {
    return (int) ($saGet('/api/admin/audit-logs?scope=class_work&q=' . rawurlencode($saTag) . $query)[1]['total'] ?? -1);
};
expect_same([2, 0], [$saCount('&studentId=' . $saWorkStudent), $saCount('&studentId=' . $saOtherStudent)], 'The Student filter finds rows by stored student and by enrolment, and no one else\'s');
expect_same([2, 0], [$saCount('&classId=' . $readOwnClass), $saCount('&classId=' . $readOtherClass)], 'The class filter matches the row\'s class');
expect_same([2, 0], [$saCount('&facultyId=' . $readFaculty['user_id']), $saCount('&facultyId=' . $saPast)], 'The Faculty filter matches work in that Faculty member\'s classes');
expect_same([1, 1], [$saCount('&area=Grading'), $saCount('&area=Retention')], 'The area chips narrow the list');
expect_same([2, 0], [$saCount('&from=2000-01-01'), $saCount('&to=2000-01-01')], 'The date range narrows the list');
[$saStudentLookupStatus, $saLookup] = $saGet('/api/admin/audit-logs?lookup=students&q=' . rawurlencode("Fixture{$saTag}"));
expect_true($saStudentLookupStatus === 200 && ($saLookup['students'][0]['id'] ?? 0) === $saWorkStudent, 'The Student filter can look a student up by name');
[$saScopeStatus] = $saGet('/api/admin/audit-logs?scope=everything');
expect_same(422, $saScopeStatus, 'An unknown scope is a validation error');
[, $saFacultyScope] = integration_http_get_json('/api/faculty/activity?scope=class_work&q=' . rawurlencode($saTag), $seedFacultyAccessToken);
expect_true(!array_key_exists('classOptions', $saFacultyScope), 'Faculty cannot ask for the Dean class-work scope');
