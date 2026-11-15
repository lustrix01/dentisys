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
foreach ([['GET', '/api/admin/courses'], ['GET', '/api/admin/people'], ['POST', '/api/admin/courses/retire'], ['POST', '/api/admin/people/deactivate'], ['GET', '/api/admin/people/filters'],
    ['POST', '/api/admin/people/sign-out'], ['POST', '/api/admin/people/reset-2fa'], ['POST', '/api/admin/people/invitation/resend'], ['POST', '/api/admin/people/invitation/revoke']] as [$saMethod, $saPath]) {
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

// People filters are applied on the server (count and page), and a bad or kind-mismatched value is 422.
$saIds = static fn(array $r): array => array_map('intval', array_column($r['people'] ?? [], 'userId'));
$saFilter = fn(string $kind, string $extra): array => $saGet("/api/admin/people?kind={$kind}&q=" . rawurlencode($saTag) . $extra);
[, $saHas] = $saFilter('faculty', '&classes=current');
[, $saNone] = $saFilter('faculty', '&classes=none');
expect_true($saIds($saHas) === [$saBusy] && $saHas['total'] === 1 && in_array($saFaculty, $saIds($saNone), true) && !in_array($saBusy, $saIds($saNone), true), 'The classes filter counts only current, unarchived classes');
$saBad = [];
foreach ([['faculty', '&face=enrolled'], ['faculty', '&secretary=1'], ['student', '&classes=current'], ['student', '&secretary=0'], ['faculty', '&twoFactor=maybe'], ['faculty', '&activity=never,x']] as [$saK, $saX]) $saBad[] = $saFilter($saK, $saX)[0];
expect_same([422, 422, 422, 422, 422, 422], $saBad, 'Unknown or kind-mismatched people filters are 422');

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

// ---- Part D: account actions, invitations and filters (9.16, 9.17) ----
$saStudentId = (int) $pdo->query("SELECT student_id FROM students WHERE student_account_user_id = {$saStudent}")->fetchColumn();
$saStudentEmail = (string) $pdo->query("SELECT login_email FROM user_accounts WHERE user_id = {$saStudent}")->fetchColumn();
[, $saStudentLogin] = integration_http_json('/api/auth/login', '', ['email' => $saStudentEmail, 'password' => $saPass]);
$saStuVersion = (int) $pdo->query("SELECT token_version FROM user_accounts WHERE user_id = {$saStudent}")->fetchColumn();
[$saOutStatus, $saOut] = $saPost('/api/admin/people/sign-out', ['userId' => $saStudent, 'reason' => 'Shared laptop']);
expect_true($saOutStatus === 200 && ($saOut['person']['status'] ?? '') === 'active' && ($saOut['person']['studentId'] ?? 0) === $saStudentId && ($saOut['person']['faceEnrolled'] ?? null) === false, 'Sign out everywhere returns the active person with studentId and faceEnrolled');
expect_same($saStuVersion + 1, (int) $pdo->query("SELECT token_version FROM user_accounts WHERE user_id = {$saStudent}")->fetchColumn(), 'Sign out bumps token_version');
expect_same(0, (int) $pdo->query("SELECT COUNT(*) FROM auth_sessions WHERE user_id = {$saStudent} AND revoked_at IS NULL")->fetchColumn(), 'Sign out revokes every session');
[$saStuOldStatus] = integration_http_get_json('/api/student/dashboard', (string) ($saStudentLogin['access_token'] ?? ''));
expect_same(401, $saStuOldStatus, 'The old access token stops working after Sign out everywhere');
$saOutRows = $saAuditRows('sessions_ended_by_dean', (string) $saStudent);
expect_true(count($saOutRows) === 1 && $saOutRows[0]['reason'] === 'Shared laptop', 'Sign out writes one audit row with the reason');
[$saOutLong] = $saPost('/api/admin/people/sign-out', ['userId' => $saStudent, 'reason' => str_repeat('x', 501)]);
[$saOutDean, $saOutDeanBody] = $saPost('/api/admin/people/sign-out', ['userId' => (int) $readDean['user_id']]);
expect_true($saOutLong === 422 && $saOutDean === 404 && ($saOutDeanBody['code'] ?? '') === 'person_not_found', 'Sign out validates the reason and refuses a Dean');

// Reset 2FA: authenticator and recovery codes go, sessions end, the Dean row counts as 2FA turned off.
[$saNoMfaStatus, $saNoMfa] = $saPost('/api/admin/people/reset-2fa', ['userId' => $saStudent]);
expect_true($saNoMfaStatus === 409 && ($saNoMfa['code'] ?? '') === 'two_factor_off' && ($saNoMfa['message'] ?? '') === 'This person does not use 2FA.', 'Reset 2FA without 2FA is two_factor_off');
expect_same(0, count($saAuditRows('mfa_reset_by_dean', (string) $saStudent)), 'A refused reset writes no audit row');
$pdo->prepare("INSERT INTO security_tokens (purpose, user_id, mfa_status, mfa_verified_at) VALUES ('mfa_credential', ?, 'enabled', CURRENT_TIMESTAMP(6))")->execute([$saStudent]);
$saRecovery = $pdo->prepare("INSERT INTO security_tokens (purpose, user_id, token_digest) VALUES ('mfa_recovery', ?, ?)");
$saRecovery->bindValue(1, $saStudent, PDO::PARAM_INT);
pdo_bind_binary($saRecovery, 2, random_bytes(32));
$saRecovery->execute();
[, $saStuTwoFa] = $saGet('/api/admin/people?kind=student&twoFactor=on&q=' . rawurlencode($saTag));
expect_same([$saStudent], $saIds($saStuTwoFa), 'The 2FA filter finds the Student before the reset');
$saStuVersion = (int) $pdo->query("SELECT token_version FROM user_accounts WHERE user_id = {$saStudent}")->fetchColumn();
[$saResetStatus, $saReset] = $saPost('/api/admin/people/reset-2fa', ['userId' => $saStudent, 'reason' => 'Lost phone']);
expect_true($saResetStatus === 200 && ($saReset['person']['twoFactor'] ?? null) === false, 'Reset 2FA returns the person with 2FA off');
expect_same(0, (int) $pdo->query("SELECT COUNT(*) FROM security_tokens WHERE user_id = {$saStudent} AND purpose IN ('mfa_credential', 'mfa_recovery') AND revoked_at IS NULL")->fetchColumn(), 'Reset 2FA revokes the authenticator and the recovery codes');
expect_same('Reset by the Dean', $pdo->query("SELECT revocation_reason FROM security_tokens WHERE user_id = {$saStudent} AND purpose = 'mfa_credential' ORDER BY token_id DESC LIMIT 1")->fetchColumn(), 'The revoked authenticator carries the Dean reason');
expect_same($saStuVersion + 1, (int) $pdo->query("SELECT token_version FROM user_accounts WHERE user_id = {$saStudent}")->fetchColumn(), 'Reset 2FA bumps token_version');
expect_same(0, (int) $pdo->query("SELECT COUNT(*) FROM auth_sessions WHERE user_id = {$saStudent} AND revoked_at IS NULL")->fetchColumn(), 'Reset 2FA ends every session');
$saResetRows = $saAuditRows('mfa_reset_by_dean', (string) $saStudent);
expect_true(count($saResetRows) === 1 && $saResetRows[0]['reason'] === 'Lost phone', 'Reset 2FA writes one audit row with the reason and no secrets');
[$saAgainStatus, $saAgain] = $saPost('/api/admin/people/reset-2fa', ['userId' => $saStudent]);
expect_true($saAgainStatus === 409 && ($saAgain['code'] ?? '') === 'two_factor_off', 'A second reset is two_factor_off');
$saPost('/api/admin/people/deactivate', ['userId' => $saStudent]);
[$saOffOutStatus, $saOffOut] = $saPost('/api/admin/people/sign-out', ['userId' => $saStudent]);
[$saOffResetStatus, $saOffReset] = $saPost('/api/admin/people/reset-2fa', ['userId' => $saStudent]);
expect_true($saOffOutStatus === 409 && ($saOffOut['code'] ?? '') === 'account_deactivated' && $saOffResetStatus === 409 && ($saOffReset['code'] ?? '') === 'account_deactivated' && ($saOffOut['message'] ?? '') === 'This account is deactivated.', 'A deactivated account cannot be signed out or reset (account_deactivated)');
$saPost('/api/admin/people/reactivate', ['userId' => $saStudent]);

// Face: a Student with an active stored reference reads faceEnrolled true.
$pdo->prepare("INSERT INTO biometric_profiles (student_id, consent_status, face_enrolled, enrollment_status, protected_object_reference, reference_expires_on, enrolled_at)
    VALUES (?, 'approved', 1, 'active', 'sa-fixture-reference', '2099-12-31', CURRENT_TIMESTAMP(6))")->execute([$saStudentId]);
[, $saFaceList] = $saGet('/api/admin/people?kind=student&face=enrolled&q=' . rawurlencode($saTag));
expect_true($saIds($saFaceList) === [$saStudent] && ($saFaceList['people'][0]['faceEnrolled'] ?? null) === true && ($saFaceList['people'][0]['studentId'] ?? 0) === $saStudentId, 'faceEnrolled and studentId come with a Student person');

// 9.17 course and class filters: this school year's non-archived classes only.
$saClass->execute(["SA-ARCH2-{$saTag}", $saCourseId, $readFaculty['user_id'], $saYear]);
$saArchivedClass = (int) $saClass->fetchColumn();
$pdo->exec("UPDATE class_sections SET archive_reason = 'finished', archived_at = CURRENT_TIMESTAMP(6) WHERE cs_id = {$saArchivedClass}");
$pdo->prepare("INSERT INTO enrollments (student_id, cs_id, status) VALUES (?, ?, 'Active')")->execute([$saStudentId, $saBusyClass]);
[$saCourseStatus, $saByCourse] = $saGet("/api/admin/people?kind=faculty&courseId={$saCourseId}");
$saCourseIds = $saIds($saByCourse);
expect_true($saCourseStatus === 200 && in_array($saBusy, $saCourseIds, true) && in_array((int) $readFaculty['user_id'], $saCourseIds, true) && !in_array($saPast, $saCourseIds, true) && !in_array($saFaculty, $saCourseIds, true), 'The course filter lists Faculty teaching a current, unarchived class of the course');
[, $saByOther] = $saGet("/api/admin/people?kind=faculty&courseId={$saOtherCourseId}");
[, $saByGhost] = $saGet('/api/admin/people?kind=faculty&courseId=99999999');
expect_same([[], []], [$saIds($saByOther), $saIds($saByGhost)], 'A course without classes, or an unknown course, gives an empty list');
[, $saStuByCourse] = $saGet("/api/admin/people?kind=student&courseId={$saCourseId}&q=" . rawurlencode($saTag));
[, $saStuByClass] = $saGet("/api/admin/people?kind=student&classId={$saBusyClass}&q=" . rawurlencode($saTag));
[, $saStuByOtherClass] = $saGet("/api/admin/people?kind=student&classId={$saClassId}&q=" . rawurlencode($saTag));
expect_same([[$saStudent], [$saStudent], []], [$saIds($saStuByCourse), $saIds($saStuByClass), $saIds($saStuByOtherClass)], 'Student course and class filters use the Active enrollment');
$saPast2 = $saGet("/api/admin/people?kind=student&classId={$saArchivedClass}")[0];
$saBadFilters = [$saGet("/api/admin/people?kind=faculty&classId={$saBusyClass}")[0], $saGet('/api/admin/people?kind=student&classId=abc')[0], $saGet('/api/admin/people?kind=faculty&courseId=0')[0], $saGet('/api/admin/people?kind=faculty&courseId=1.5')[0], $saPast2];
expect_same([422, 422, 422, 422, 422], $saBadFilters, 'classId for Faculty, a non-integer id and a class outside this school year are 422');
[, $saFacultyClassBody] = $saGet("/api/admin/people?kind=faculty&classId={$saBusyClass}");
expect_same('classId', $saFacultyClassBody['errors'][0]['field'] ?? null, 'The classId error names its field');
[$saOptionsStatus, $saOptions] = $saGet('/api/admin/people/filters');
$saOptionClasses = array_column($saOptions['classes'] ?? [], null, 'csId');
expect_true($saOptionsStatus === 200 && in_array($saCourseId, array_column($saOptions['courses'] ?? [], 'id'), true) && !in_array($saOtherCourseId, array_column($saOptions['courses'] ?? [], 'id'), true)
    && ($saOptionClasses[$saBusyClass]['courseId'] ?? 0) === $saCourseId && !isset($saOptionClasses[$saArchivedClass]), 'The filter options list this year\'s unarchived classes and only courses that have one');

// Invited Faculty: created through the Faculty Invitations route, then handled from People through the same code.
$saInvEmail = "sa-inv-{$saTag}@bicol-u.edu.ph";
[$saInvStatus, $saInv] = $saPost('/api/admin/faculty-invitations', ['firstName' => 'Invited', 'lastName' => 'Fac' . strtr($saTag, '0123456789', 'abcdefghij'), 'email' => $saInvEmail]);
$saInvId = (int) ($saInv['invitation']['id'] ?? 0);
expect_true($saInvStatus === 201 && $saInvId > 0, 'The Faculty invitation fixture is issued');
[, $saInvList] = $saGet('/api/admin/people?kind=faculty&status=invited&q=' . rawurlencode($saTag));
$saInvPerson = $saInvList['people'][0] ?? [];
expect_true($saIds($saInvList) === [$saInvId] && ($saInvPerson['status'] ?? '') === 'invited' && ($saInvPerson['invitation']['expired'] ?? null) === false && isset($saInvPerson['invitation']['sentAt'], $saInvPerson['invitation']['expiresAt'])
    && ($saInvPerson['twoFactor'] ?? null) === false && array_key_exists('lastActivityAt', $saInvPerson) && $saInvPerson['lastActivityAt'] === null, 'An invited Faculty member is listed as invited with the invitation dates');
[, $saAllList] = $saGet('/api/admin/people?kind=faculty&q=' . rawurlencode($saTag));
[, $saActiveList] = $saGet('/api/admin/people?kind=faculty&status=active&q=' . rawurlencode($saTag));
expect_true(in_array($saInvId, $saIds($saAllList), true) && !in_array($saInvId, $saIds($saActiveList), true), 'All includes invited people, Active does not');
[$saSignOutInvStatus, $saSignOutInv] = $saPost('/api/admin/people/sign-out', ['userId' => $saInvId]);
expect_true($saSignOutInvStatus === 404 && ($saSignOutInv['code'] ?? '') === 'person_not_found', 'An invited account cannot be signed out');
$saFacultyInvites = static fn(): int => (int) $pdo->query("SELECT COUNT(*) FROM audit_events WHERE action_code = 'faculty_invited' AND description LIKE '%{$saInvEmail}%'")->fetchColumn();
$saBeforeResend = $saFacultyInvites();
[$saResendStatus, $saResend] = $saPost('/api/admin/people/invitation/resend', ['userId' => $saInvId]);
expect_true($saResendStatus === 200 && ($saResend['person']['status'] ?? '') === 'invited' && $saFacultyInvites() === $saBeforeResend + 1, 'Resending a Faculty invitation from People reuses the Faculty reissue and its audit code');
expect_same(1, (int) $pdo->query("SELECT COUNT(*) FROM security_tokens WHERE purpose = 'faculty_invitation' AND user_id = {$saInvId} AND revoked_at IS NULL AND used_at IS NULL")->fetchColumn(), 'Resend leaves exactly one live token');
[$saReissueStatus] = $saPost('/api/admin/faculty-invitations/reissue', ['id' => (string) $saInvId]);
expect_same(201, $saReissueStatus, 'The Faculty Invitations reissue route still works');
[$saRevokeStatus, $saRevoke] = $saPost('/api/admin/people/invitation/revoke', ['userId' => $saInvId]);
expect_true($saRevokeStatus === 200 && array_key_exists('person', $saRevoke) && $saRevoke['person'] === null, 'Revoking a Faculty invitation from People succeeds');
expect_same(1, count($saAuditRows('faculty_invitation_revoked', (string) $saInvId)), 'Revoke from People writes the Faculty invitation_revoked audit row');
expect_same('Revoked by the Dean', $pdo->query("SELECT revocation_reason FROM security_tokens WHERE purpose = 'faculty_invitation' AND user_id = {$saInvId} ORDER BY token_id DESC LIMIT 1")->fetchColumn(), 'The revoked token carries the Dean reason');
[, $saInvGone] = $saGet('/api/admin/people?kind=faculty&status=invited&q=' . rawurlencode($saTag));
[$saAgainRevokeStatus, $saAgainRevoke] = $saPost('/api/admin/people/invitation/revoke', ['userId' => $saInvId]);
[$saAgainResendStatus, $saAgainResend] = $saPost('/api/admin/people/invitation/resend', ['userId' => $saInvId]);
expect_true($saIds($saInvGone) === [] && $saAgainRevokeStatus === 409 && ($saAgainRevoke['code'] ?? '') === 'no_pending_invitation' && $saAgainResendStatus === 409 && ($saAgainResend['code'] ?? '') === 'no_pending_invitation', 'A revoked invitation leaves the list and cannot be resent or revoked again');
[$saReissue2] = $saPost('/api/admin/faculty-invitations/reissue', ['id' => (string) $saInvId]);
[$saOldRevoke] = $saPost('/api/admin/faculty-invitations/revoke', ['id' => (string) $saInvId]);
expect_same([201, 200], [$saReissue2, $saOldRevoke], 'The Faculty Invitations reissue and revoke routes still work after People used them');
[$saActiveResendStatus, $saActiveResend] = $saPost('/api/admin/people/invitation/resend', ['userId' => $saFaculty]);
expect_true($saActiveResendStatus === 409 && ($saActiveResend['code'] ?? '') === 'no_pending_invitation', 'An active account has no pending invitation');

// Invited Students: the Dean resend keeps the Student and class of the latest invitation.
$saPendingStudent = static function (string $label, int $csId, bool $expired) use ($pdo, $saPass, $saTag): array {
    $email = "sa-pst-{$label}-{$saTag}@bicol-u.edu.ph";
    $pdo->beginTransaction();
    $stmt = $pdo->prepare("INSERT INTO user_accounts (login_email, password_hash, role, display_name, status, created_at) VALUES (?, ?, 'student', ?, 'Pending Activation', CURRENT_TIMESTAMP(6)) RETURNING user_id");
    $stmt->execute([$email, password_hash_user_password($saPass), "Sa Pending {$label} {$saTag}"]);
    $userId = (int) $stmt->fetchColumn();
    $stmt = $pdo->prepare("INSERT INTO students (student_number, first_name, last_name, bu_email, status, student_account_user_id) VALUES (?, 'Sa', ?, ?, 'active', ?) RETURNING student_id");
    $stmt->execute(["SP-{$saTag}-{$label}", "Pending{$label}", $email, $userId]);
    $studentId = (int) $stmt->fetchColumn();
    $pdo->prepare("INSERT INTO enrollments (student_id, cs_id, status) VALUES (?, ?, 'Active')")->execute([$studentId, $csId]);
    $token = $pdo->prepare("INSERT INTO security_tokens (purpose, user_id, related_student_id, related_cs_id, token_digest, issued_at, expires_at)
        VALUES ('student_activation', ?, ?, ?, ?, ?, ?)");
    $token->bindValue(1, $userId, PDO::PARAM_INT);
    $token->bindValue(2, $studentId, PDO::PARAM_INT);
    $token->bindValue(3, $csId, PDO::PARAM_INT);
    pdo_bind_binary($token, 4, random_bytes(32));
    $token->bindValue(5, $expired ? '2026-01-01 00:00:00' : gmdate('Y-m-d H:i:s'), PDO::PARAM_STR);
    $token->bindValue(6, $expired ? '2026-01-08 00:00:00' : gmdate('Y-m-d H:i:s', time() + 7 * 86400), PDO::PARAM_STR);
    $token->execute();
    $pdo->commit();
    return ['userId' => $userId, 'studentId' => $studentId];
};
$saPendA = $saPendingStudent('a', $saBusyClass, true);
$saPendB = $saPendingStudent('b', $saBusyClass, false);
$saPendC = $saPendingStudent('c', $saArchivedClass, false);
[, $saPendList] = $saGet('/api/admin/people?kind=student&status=invited&q=' . rawurlencode($saTag));
$saPendRows = array_column($saPendList['people'] ?? [], null, 'userId');
expect_true(count($saPendRows) === 3 && ($saPendRows[$saPendA['userId']]['invitation']['expired'] ?? null) === true && ($saPendRows[$saPendB['userId']]['invitation']['expired'] ?? null) === false
    && ($saPendRows[$saPendA['userId']]['studentId'] ?? 0) === $saPendA['studentId'], 'Invited Students are listed with their expiry state and studentId');
[$saPendClassStatus, $saPendClass] = $saPost('/api/admin/people/invitation/resend', ['userId' => $saPendC['userId']]);
expect_true($saPendClassStatus === 409 && ($saPendClass['code'] ?? '') === 'invitation_class_unavailable' && str_contains((string) ($saPendClass['message'] ?? ''), 'Ask the Faculty member to invite the Student again.'), 'A resend for an archived class is invitation_class_unavailable');
expect_same(1, (int) $pdo->query("SELECT COUNT(*) FROM security_tokens WHERE purpose = 'student_activation' AND user_id = {$saPendC['userId']}")->fetchColumn(), 'The refused resend issues no token');
[$saPendResendStatus, $saPendResend] = $saPost('/api/admin/people/invitation/resend', ['userId' => $saPendA['userId']]);
expect_true($saPendResendStatus === 200 && ($saPendResend['person']['status'] ?? '') === 'invited' && ($saPendResend['person']['invitation']['expired'] ?? null) === false, 'Resending an expired Student invitation makes it live again');
$saTokens = $pdo->query("SELECT related_student_id, related_cs_id, revoked_at, revocation_reason, (expires_at - issued_at) = INTERVAL '7 days' AS seven FROM security_tokens WHERE purpose = 'student_activation' AND user_id = {$saPendA['userId']} ORDER BY token_id")->fetchAll(PDO::FETCH_ASSOC);
expect_true(count($saTokens) === 2 && $saTokens[0]['revocation_reason'] === 'Replaced by a Dean resend' && $saTokens[1]['revoked_at'] === null && (int) $saTokens[1]['related_cs_id'] === $saBusyClass
    && (int) $saTokens[1]['related_student_id'] === $saPendA['studentId'] && in_array($saTokens[1]['seven'], [true, 't', '1', 1], true), 'The resend replaces the old token and keeps the Student, class and 7 days');
$saTokenRow = $pdo->query("SELECT token_id FROM security_tokens WHERE purpose = 'student_activation' AND user_id = {$saPendA['userId']} ORDER BY token_id DESC LIMIT 1")->fetchColumn();
expect_same(1, count($saAuditRows('student_invitation_resent_by_dean', (string) $saTokenRow)), 'The resend writes one audit row');
[$saPendRevokeStatus, $saPendRevoke] = $saPost('/api/admin/people/invitation/revoke', ['userId' => $saPendB['userId']]);
expect_true($saPendRevokeStatus === 200 && array_key_exists('person', $saPendRevoke) && $saPendRevoke['person'] === null, 'Revoking a Student invitation succeeds');
expect_same('Revoked by the Dean', $pdo->query("SELECT revocation_reason FROM security_tokens WHERE purpose = 'student_activation' AND user_id = {$saPendB['userId']}")->fetchColumn(), 'The Student token carries the Dean reason');
expect_same(1, count($saAuditRows('student_invitation_revoked_by_dean', (string) $saPendB['userId'])), 'The revoke writes one audit row');
[$saPendAgainStatus, $saPendAgain] = $saPost('/api/admin/people/invitation/revoke', ['userId' => $saPendB['userId']]);
expect_true($saPendAgainStatus === 409 && ($saPendAgain['code'] ?? '') === 'no_pending_invitation' && ($saPendAgain['message'] ?? '') === 'This person has no pending invitation.', 'Revoking twice is no_pending_invitation');
[, $saPendLeft] = $saGet('/api/admin/people?kind=student&status=invited&q=' . rawurlencode($saTag));
expect_same([$saPendA['userId'], $saPendC['userId']], $saIds($saPendLeft), 'Only live invitations stay in the Invited list');

// ---- Round 2 (docs/contracts/superadmin.md section 12): year level, expired invitations, sorting, Overview ----
$pdo->prepare('UPDATE students SET year_level = 3 WHERE student_id = ?')->execute([$saStudentId]);
$saQ = '&q=' . rawurlencode($saTag);
[$saYlStatus, $saYl] = $saGet('/api/admin/people?kind=student&yearLevel=3' . $saQ);
[, $saYlOther] = $saGet('/api/admin/people?kind=student&yearLevel=4' . $saQ);
expect_true($saYlStatus === 200 && $saIds($saYl) === [$saStudent] && $saIds($saYlOther) === [], 'The yearLevel filter lists the Students of that year only');
$saYlBad = [$saGet('/api/admin/people?kind=faculty&yearLevel=3'), $saGet('/api/admin/people?kind=student&yearLevel=0'), $saGet('/api/admin/people?kind=student&yearLevel=abc')];
expect_same([422, 422, 422], array_column($saYlBad, 0), 'yearLevel for Faculty, zero and a non-number are 422');
expect_same('yearLevel', $saYlBad[0][1]['errors'][0]['field'] ?? null, 'The yearLevel error names its field');
[, $saOpts2] = $saGet('/api/admin/people/filters');
expect_true(in_array(3, $saOpts2['yearLevels'] ?? [], true) && ($saOpts2['yearLevels'] ?? []) === array_values(array_unique($saOpts2['yearLevels'] ?? [])) && ($saOpts2['yearLevels'] ?? []) === (static function (array $l): array { sort($l); return $l; })($saOpts2['yearLevels'] ?? []), 'The filter options list the year levels ascending without repeats');

$saPendD = $saPendingStudent('d', $saBusyClass, true);
[$saExpStatus, $saExp] = $saGet('/api/admin/people?kind=student&status=invited&invitation=expired' . $saQ);
[, $saExpAll] = $saGet('/api/admin/people?kind=student&status=all&invitation=expired' . $saQ);
[, $saExpFac] = $saGet('/api/admin/people?kind=faculty&status=invited&invitation=expired' . $saQ);
expect_true($saExpStatus === 200 && $saIds($saExp) === [$saPendD['userId']] && $saIds($saExpAll) === [$saPendD['userId']] && $saIds($saExpFac) === [], 'invitation=expired lists only invited people whose latest invitation expired');
expect_same([422, 422], [$saGet('/api/admin/people?kind=student&status=active&invitation=expired')[0], $saGet('/api/admin/people?kind=student&invitation=soon')[0]], 'invitation=expired needs status invited or all; other values are 422');

$saSorted = static fn(string $kind, string $sort, string $dir): array => $saGet("/api/admin/people?kind={$kind}&status=all&sort={$sort}&dir={$dir}" . $saQ)[1]['people'] ?? [];
foreach ([['student', 'name'], ['student', 'studentNo'], ['faculty', 'name']] as [$saKind, $saSort]) {
    $saAsc = array_column($saSorted($saKind, $saSort, 'asc'), 'userId');
    $saDesc = array_column($saSorted($saKind, $saSort, 'desc'), 'userId');
    expect_true(count($saAsc) > 1 && $saAsc === array_reverse($saDesc), "Sorting {$saKind}s by {$saSort} reverses with the direction");
}
$saClassCount = static fn(array $p): int => count(array_filter($p['classes'] ?? $p['enrolledClasses'] ?? [], static fn(array $c): bool => $c['current']));
foreach (['faculty', 'student'] as $saKind) {
    foreach (['asc', 'desc'] as $saDir) {
        $saCounts = array_map($saClassCount, $saSorted($saKind, 'classes', $saDir));
        $saWant = $saCounts;
        $saDir === 'asc' ? sort($saWant) : rsort($saWant);
        expect_true(count(array_unique($saCounts)) > 1 && $saCounts === $saWant, "Sorting {$saKind}s by classes {$saDir} orders by the current class count");
        $saActs = array_column($saSorted($saKind, 'lastActivity', $saDir), 'lastActivityAt');
        $saNulls = array_keys(array_filter($saActs, static fn($v): bool => $v === null));
        $saNonNull = array_values(array_filter($saActs, static fn($v): bool => $v !== null));
        $saNonNullSorted = $saNonNull;
        $saDir === 'asc' ? sort($saNonNullSorted) : rsort($saNonNullSorted);
        expect_true($saNulls !== [] && $saNulls === range(count($saNonNull), count($saActs) - 1) && $saNonNull === $saNonNullSorted, "Sorting {$saKind}s by lastActivity {$saDir} puts people who never signed in last");
    }
}
$saBadSort = [$saGet('/api/admin/people?kind=student&sort=email')[1], $saGet('/api/admin/people?kind=student&dir=up')[1], $saGet('/api/admin/people?kind=faculty&sort=studentNo')[1]];
expect_same([['sort'], ['dir'], ['sort']], array_map(static fn(array $b): array => array_column($b['errors'] ?? [], 'field'), $saBadSort), 'An unknown sort, direction or studentNo for Faculty is a 422 on that field');
expect_same(422, $saGet('/api/admin/people?kind=faculty&sort=studentNo')[0], 'studentNo sorting is for Students only');

// Overview: Dean only, one flat answer; its counts equal the People lists' totals.
foreach ([['Faculty', $seedFacultyAccessToken, 403], ['Secretary', $secretaryAccessToken, 403], ['anonymous', '', 401]] as [$saWho, $saToken, $saWant]) {
    expect_same($saWant, integration_http_get_json('/api/admin/overview', $saToken)[0], "{$saWho} gets {$saWant} on GET /api/admin/overview");
}
[$saOvStatus, $saOv] = $saGet('/api/admin/overview');
expect_true($saOvStatus === 200 && ($saOv['status'] ?? '') === 'ok' && array_keys($saOv) === ['status', 'attention', 'accounts', 'signIns', 'security', 'yearLevels', 'sectionsByCourse', 'setup'], 'The overview answers one flat object with every section');
$saTotal = static fn(string $query): int => (int) ($saGet('/api/admin/people?' . $query)[1]['total'] ?? -1);
foreach (['faculty' => 'faculty', 'student' => 'students'] as $saKind => $saKey) {
    expect_same([$saTotal("kind={$saKind}&status=active"), $saTotal("kind={$saKind}&status=invited"), $saTotal("kind={$saKind}&status=deactivated")],
        array_values($saOv['accounts'][$saKey] ?? []), "Overview {$saKey} accounts equal the People totals by status");
    expect_same(['on' => $saTotal("kind={$saKind}&status=active&twoFactor=on"), 'total' => $saTotal("kind={$saKind}&status=active")], $saOv['security']['twoFactor'][$saKey] ?? null, "Overview {$saKey} 2FA uses the People twoFactor rule over active accounts");
    expect_same($saTotal("kind={$saKind}&status=active&activity=inactive30"), $saOv['attention']['inactive30'][$saKey] ?? null, "Overview inactive30 for {$saKey} uses the People activity rule");
}
expect_same(['faculty' => $saTotal('kind=faculty&status=invited&invitation=expired'), 'students' => $saTotal('kind=student&status=invited&invitation=expired')], $saOv['attention']['expiredInvitations'] ?? null, 'Overview expiredInvitations counts each kind');
expect_same($saTotal('kind=faculty&status=active&classes=none'), $saOv['attention']['facultyWithoutClasses'] ?? null, 'Overview facultyWithoutClasses equals the People classes=none total');
expect_true(is_bool($saOv['attention']['nextTermMissing'] ?? null) && array_key_exists('currentTerm', $saOv['setup'] ?? []) && isset($saOv['setup']['courses']['active'], $saOv['setup']['rooms']['retired']), 'The overview reports nextTermMissing and the setup strip');
$saWeeks = array_column($saOv['signIns'] ?? [], 'weekStart');
expect_true(count($saWeeks) === 12 && $saWeeks === (static function (array $w): array { sort($w); return $w; })($saWeeks)
    && array_reduce($saWeeks, static fn(bool $ok, string $w): bool => $ok && date('N', strtotime($w)) === '1', true) && $saWeeks[11] === (new DateTimeImmutable('now', new DateTimeZone('Asia/Manila')))->modify('monday this week')->format('Y-m-d'), 'The overview has 12 Monday weeks ending with the current Manila week');
expect_same(14, count($saOv['security']['failedSignIns'] ?? []), 'The overview has 14 days of failed sign-ins');
$saTodayManila = (new DateTimeImmutable('now', new DateTimeZone('Asia/Manila')))->format('Y-m-d');
expect_same($saTodayManila, ($saOv['security']['failedSignIns'][13]['day'] ?? null), 'The last failed-sign-in day is today in Manila');
$saNewFac = $saAccount("sa-sif-{$saTag}@bicol-u.edu.ph", 'faculty', "Sa Signin Fac {$saTag}");
$saNewStu = $saAccount("sa-sis-{$saTag}@bicol-u.edu.ph", 'student', "Sa Signin Stu {$saTag}", "SI-{$saTag}");
$readWrite(['user_id' => $saNewFac, 'login_email' => "sa-sif-{$saTag}@bicol-u.edu.ph", 'role' => 'faculty', 'display_name' => 'Sa Signin Fac'], 'auth', 'login_success', 'Success', "Sa sign-in {$saTag}");
$readWrite(['user_id' => $saNewStu, 'login_email' => "sa-sis-{$saTag}@bicol-u.edu.ph", 'role' => 'student', 'display_name' => 'Sa Signin Stu'], 'auth', 'google_login_success', 'Success', "Sa Google sign-in {$saTag}");
$readWrite(null, 'auth', 'login_failed', 'Failed', "Sa failed {$saTag}");
$readWrite(null, 'auth', 'google_login_denied', 'Failed', "Sa denied {$saTag}");
[, $saOv2] = $saGet('/api/admin/overview');
expect_same([1, 1, 2], [($saOv2['signIns'][11]['faculty'] ?? 0) - ($saOv['signIns'][11]['faculty'] ?? 0), ($saOv2['signIns'][11]['students'] ?? 0) - ($saOv['signIns'][11]['students'] ?? 0),
    ($saOv2['security']['failedSignIns'][13]['count'] ?? 0) - ($saOv['security']['failedSignIns'][13]['count'] ?? 0)], 'New sign-ins count as distinct users per role in this week, and failures in today');

// UI-001 rule 7: the stored display name carries the comma before degrees (identity trigger from migration 061).
$saDegree = $saAccount("sa-deg-{$saTag}@bicol-u.edu.ph", 'faculty', "Sa Deg {$saTag}");
$saSetDegree = static function (string $suffix) use ($pdo, $saDegree, $saTag): void {
    $pdo->prepare("UPDATE person_identities SET first_name = 'Roberto', middle_name = 'Lim', last_name = ?, name_suffix = ? WHERE person_id = (SELECT person_id FROM user_accounts WHERE user_id = ?)")->execute(["Santos{$saTag}", $suffix, $saDegree]);
    $pdo->prepare('UPDATE user_accounts SET display_name = display_name WHERE user_id = ?')->execute([$saDegree]); // fires the identity trigger
};
$saSetDegree('DMD');
expect_same("Roberto Lim Santos{$saTag}, DMD", $pdo->query("SELECT display_name FROM user_accounts WHERE user_id = {$saDegree}")->fetchColumn(), 'The identity trigger puts a comma before a degree');
$saSetDegree('Jr.');
expect_same("Roberto Lim Santos{$saTag} Jr.", $pdo->query("SELECT display_name FROM user_accounts WHERE user_id = {$saDegree}")->fetchColumn(), 'The identity trigger adds no comma before Jr.');
// The data migration recomposes only names equal to the old composition: simulate old rows, then run its UPDATE (the last statement of the file).
$saMigration = (string) file_get_contents(__DIR__ . '/../../database/migrations/061_name_degree_comma.sql');
$saUpdateSql = substr($saMigration, (int) strrpos($saMigration, "\nUPDATE user_accounts"));
$saOld = $saAccount("sa-old-{$saTag}@bicol-u.edu.ph", 'faculty', "Ana Cruz{$saTag} DMD"); // old composition: no comma
$saHand = $saAccount("sa-hand-{$saTag}@bicol-u.edu.ph", 'faculty', 'Dr. Ben (hand edited)');
$saIdentity = $pdo->prepare('UPDATE person_identities SET first_name = ?, last_name = ?, name_suffix = ? WHERE person_id = (SELECT person_id FROM user_accounts WHERE user_id = ?)'); // does not fire the user_accounts trigger
$saIdentity->execute(['Ana', "Cruz{$saTag}", 'DMD', $saOld]);
$saIdentity->execute(['Ben', "Reyes{$saTag}", 'PhD', $saHand]);
$pdo->exec($saUpdateSql);
expect_same(["Ana Cruz{$saTag}, DMD", 'Dr. Ben (hand edited)'], [$pdo->query("SELECT display_name FROM user_accounts WHERE user_id = {$saOld}")->fetchColumn(), $pdo->query("SELECT display_name FROM user_accounts WHERE user_id = {$saHand}")->fetchColumn()], 'Migration 061 recomposes an old-style name and leaves a hand-edited one untouched');
$pdo->exec($saUpdateSql);
expect_same("Ana Cruz{$saTag}, DMD", $pdo->query("SELECT display_name FROM user_accounts WHERE user_id = {$saOld}")->fetchColumn(), 'Migration 061 is idempotent');

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
expect_same([2, 0], [$saCount('&studentId=' . $saWorkStudent), $saCount('&studentId=' . $saOtherStudent)], 'The Student filter finds rows by stored student and by enrollment, and no one else\'s');
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
