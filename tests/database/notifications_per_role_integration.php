<?php

declare(strict_types=1);

// Backlog 14.9 / NTF-002: in-app notifications per role against real PostgreSQL + HTTP + mock sidecar.
// Included at the end of tests/database/postgres_integration_test.php, reusing its $pdo, $saAccount, $saPass,
// $gsYear, $gsRows, $gsOne, $gsLogin, $gsEmail, $gsSubmit, $gsWithdraw, $groupedPayload, $groupedMembershipRows,
// $groupedCategoryIds, $groupedInsertAssessment, $groupedInsertScore, $adminAccessToken, $superAccessToken,
// $superUserId, $ffSidecarHttpJson, $ffSidecarMultipart, $ffConfig, and $ffContext.

$nprTag = 'npr' . strtolower(bin2hex(random_bytes(3)));
$nprLetters = strtr($nprTag, '0123456789', 'abcdefghij');
$nprDeanId = (int) $gsOne("SELECT user_id FROM user_accounts WHERE login_email = 'admin@bicol-u.edu.ph'");
expect_true($nprDeanId > 0 && $superUserId > 0, 'NTF-002 setup: Dean and Superadmin accounts exist');

$nprNotifCount = static function (int $userId, string $type, ?string $title = null) use ($gsOne): int {
    if ($title === null) {
        return (int) $gsOne('SELECT count(*) FROM notifications WHERE recipient_user_id = ? AND notification_type = ?', [$userId, $type]);
    }
    return (int) $gsOne('SELECT count(*) FROM notifications WHERE recipient_user_id = ? AND notification_type = ? AND title = ?', [$userId, $type, $title]);
};
$nprNotifs = static function (int $userId, string $type, ?string $title = null) use ($gsRows): array {
    if ($title === null) {
        return $gsRows(
            'SELECT notification_id, title, body, entity_type, entity_id, deduplication_key
               FROM notifications
              WHERE recipient_user_id = ? AND notification_type = ?
              ORDER BY notification_id',
            [$userId, $type]
        );
    }
    return $gsRows(
        'SELECT notification_id, title, body, entity_type, entity_id, deduplication_key
           FROM notifications
          WHERE recipient_user_id = ? AND notification_type = ? AND title = ?
          ORDER BY notification_id',
        [$userId, $type, $title]
    );
};
$nprStudentInsert = $pdo->prepare(
    "INSERT INTO students (student_number, first_name, last_name, bu_email, status, admission_date)
     VALUES (?, 'Npr', ?, ?, 'active', CURRENT_DATE)
     RETURNING student_id"
);
$nprEnrollInsert = $pdo->prepare(
    "INSERT INTO enrollments (student_id, cs_id, status, date_enrolled)
     VALUES (?, ?, ?, CURRENT_DATE)
     RETURNING enrollment_id"
);
$nprCourseInsert = $pdo->prepare(
    "INSERT INTO courses (course_code, name, units, semester, grading_config)
     VALUES (?, ?, 3.0, '1ST', '{}'::jsonb)
     RETURNING course_id"
);
$nprClassInsert = $pdo->prepare(
    "INSERT INTO class_sections (cs_name, course_id, instructor_user_id, semester, school_year, status)
     VALUES (?, ?, ?, '1ST', ?, 'Active')
     RETURNING cs_id"
);
$nprCreateStudent = static function (string $label, string $accountMode = 'active') use ($pdo, $saAccount, $nprStudentInsert, $nprTag, $nprLetters): array {
    $number = "NPR-{$nprTag}-{$label}";
    $email = 'npr.' . strtolower($label) . ".{$nprTag}@bicol-u.edu.ph";
    if ($accountMode === 'none') {
        $nprStudentInsert->execute([$number, $label, $email]);
        return ['studentId' => (int) $nprStudentInsert->fetchColumn(), 'userId' => null, 'number' => $number, 'email' => $email];
    }
    $role = $accountMode === 'secretary' ? 'secretary' : 'student';
    $userId = $saAccount($email, $role, "Npr {$label} {$nprLetters}", $number);
    if ($accountMode === 'disabled') {
        $pdo->prepare("UPDATE user_accounts SET status = 'Disabled', disabled_at = CURRENT_TIMESTAMP(6) WHERE user_id = ?")->execute([$userId]);
    } elseif ($accountMode === 'pending') {
        $pdo->prepare("UPDATE user_accounts SET status = 'Pending Activation' WHERE user_id = ?")->execute([$userId]);
    }
    $studentId = (int) $pdo->query("SELECT student_id FROM students WHERE student_number = " . $pdo->quote($number))->fetchColumn();
    return ['studentId' => $studentId, 'userId' => $userId, 'number' => $number, 'email' => $email];
};
$nprEnroll = static function (int $studentId, int $csId, string $status = 'Active') use ($nprEnrollInsert): int {
    $nprEnrollInsert->execute([$studentId, $csId, $status]);
    return (int) $nprEnrollInsert->fetchColumn();
};

$nprFa = $saAccount("npr-fa-{$nprTag}@bicol-u.edu.ph", 'faculty', "Npr Alpha {$nprLetters}");
$nprFb = $saAccount("npr-fb-{$nprTag}@bicol-u.edu.ph", 'faculty', "Npr Bravo {$nprLetters}");
$nprFaDisabled = $saAccount("npr-fadis-{$nprTag}@bicol-u.edu.ph", 'faculty', "Npr Disabled {$nprLetters}");
$pdo->prepare("UPDATE user_accounts SET status = 'Disabled', disabled_at = CURRENT_TIMESTAMP(6) WHERE user_id = ?")->execute([$nprFaDisabled]);
$nprTokenFa = $gsLogin($gsEmail($nprFa));
$nprTokenFb = $gsLogin($gsEmail($nprFb));
expect_true($nprTokenFa !== '' && $nprTokenFb !== '', 'NTF-002 setup: Faculty fixtures sign in');

// ============================================================================
// 1. Final grades released (GradeSubmissionController.php submit action)
// ============================================================================
$nprCourseInsert->execute(["NPA{$nprTag}", "Npr Final Grades Course {$nprTag}"]);
$nprCourse1 = (int) $nprCourseInsert->fetchColumn();
$nprClassInsert->execute(["NPR-FG-{$nprTag}", $nprCourse1, $nprFa, $gsYear]);
$nprCs1 = (int) $nprClassInsert->fetchColumn();

[$nprCfg1Status, $nprCfg1Body] = integration_http_put_json('/api/faculty/grading-config', $nprTokenFa, $groupedPayload(['courseId' => $nprCourse1, 'schoolYear' => $gsYear]));
expect_same(201, $nprCfg1Status, 'NTF-002 (1) setup: grading config saved');
$nprCat1 = $groupedCategoryIds($groupedMembershipRows((int) ($nprCfg1Body['configuration']['id'] ?? 0)));

$nprFgStu = $nprCreateStudent('FgOne', 'active');
$nprFgSec = $nprCreateStudent('FgSec', 'secretary');
$nprFgNoAcct = $nprCreateStudent('FgNoAcct', 'none');
$nprFgDisabled = $nprCreateStudent('FgDis', 'disabled');
$nprFgArchived = $nprCreateStudent('FgArch', 'active');

$nprEnroll($nprFgStu['studentId'], $nprCs1, 'Active');
$nprEnroll($nprFgSec['studentId'], $nprCs1, 'Active');
$nprEnroll($nprFgNoAcct['studentId'], $nprCs1, 'Active');
$nprEnroll($nprFgDisabled['studentId'], $nprCs1, 'Active');
$nprEnroll($nprFgArchived['studentId'], $nprCs1, 'Archived');
$pdo->prepare('UPDATE class_sections SET secretary_user_id = ? WHERE cs_id = ?')->execute([$nprFgSec['userId'], $nprCs1]);

foreach (['Midterm', 'Final'] as $period) {
    foreach ([['Lecture', 'Quiz'], ['Lecture', 'Exam'], ['Laboratory', 'Quiz']] as [$comp, $cat]) {
        $aid = $groupedInsertAssessment($nprCs1, $nprCat1[$period][$comp][$cat], "Npr FG {$period} {$comp} {$cat}", $period);
        foreach ([$nprFgStu, $nprFgSec, $nprFgNoAcct, $nprFgDisabled] as $who) {
            $groupedInsertScore($aid, $who['studentId'], 90.0);
        }
    }
}

$nprFgStuToken = $gsLogin($nprFgStu['email']);
$nprFgSecToken = $gsLogin($nprFgSec['email']);
expect_true($nprFgStuToken !== '' && $nprFgSecToken !== '', 'NTF-002 (1) setup: Student and Secretary sign in');

[$nprSub1Status] = $gsSubmit($nprCs1, $nprTokenFa);
expect_same(200, $nprSub1Status, 'NTF-002 (1): Faculty submits final grades');

$nprFgStuNotes = $nprNotifs($nprFgStu['userId'], 'grades_released');
$nprFgSecNotes = $nprNotifs($nprFgSec['userId'], 'grades_released');
expect_same(1, count($nprFgStuNotes), 'NTF-002 (1): active enrolled Student receives 1 grades_released notice');
expect_same(1, count($nprFgSecNotes), 'NTF-002 (1): active enrolled Student-linked Secretary receives 1 grades_released notice');
expect_same(0, $nprNotifCount($nprFa, 'grades_released'), 'NTF-002 (1): Faculty actor receives 0 grades_released notices');
expect_same(0, $nprNotifCount($nprFgDisabled['userId'], 'grades_released'), 'NTF-002 (1): disabled Student account receives 0 grades_released notices');
expect_same(0, $nprNotifCount($nprFgArchived['userId'], 'grades_released'), 'NTF-002 (1): Archived-enrollment Student receives 0 grades_released notices');

[, $nprBellBody] = integration_http_get_json('/api/notifications?limit=20', $nprFgStuToken);
$nprBellMatch = array_values(array_filter(
    $nprBellBody['notifications'] ?? [],
    static fn(array $n): bool => ($n['type'] ?? '') === 'grades_released' && (string) ($n['entityId'] ?? '') === (string) $nprCs1
));
expect_same(1, count($nprBellMatch), 'NTF-002 (1): GET /api/notifications surfaces the grades_released notice to the Student');

// Withdraw -> re-submit must NOT create a duplicate grades_released notice.
expect_same(200, $gsWithdraw($nprCs1, $nprTokenFa)[0], 'NTF-002 (1): Faculty withdraws grade submission within grace');
expect_same(200, $gsSubmit($nprCs1, $nprTokenFa)[0], 'NTF-002 (1): Faculty re-submits grade submission');
expect_same(1, $nprNotifCount($nprFgStu['userId'], 'grades_released'), 'NTF-002 (1): withdraw -> re-submit keeps Student at 1 grades_released notice');
expect_same(1, $nprNotifCount($nprFgSec['userId'], 'grades_released'), 'NTF-002 (1): withdraw -> re-submit keeps Secretary at 1 grades_released notice');

// ============================================================================
// 2. Grade changed (GradeSubmissionController.php Dean approve action)
// ============================================================================
$nprCourseInsert->execute(["NPB{$nprTag}", "Npr Grade Changed Course {$nprTag}"]);
$nprCourse2 = (int) $nprCourseInsert->fetchColumn();
$nprClassInsert->execute(["NPR-GC-{$nprTag}", $nprCourse2, $nprFa, $gsYear]);
$nprCs2 = (int) $nprClassInsert->fetchColumn();

[$nprCfg2Status, $nprCfg2Body] = integration_http_put_json('/api/faculty/grading-config', $nprTokenFa, $groupedPayload(['courseId' => $nprCourse2, 'schoolYear' => $gsYear]));
expect_same(201, $nprCfg2Status, 'NTF-002 (2) setup: grading config saved');
$nprCat2 = $groupedCategoryIds($groupedMembershipRows((int) ($nprCfg2Body['configuration']['id'] ?? 0)));

$nprGcChanged = $nprCreateStudent('GcChg', 'active');
$nprGcAttOnly = $nprCreateStudent('GcAtt', 'active');
$nprGcUntouched = $nprCreateStudent('GcUnt', 'active');
$nprGcNoAcct = $nprCreateStudent('GcNoAcct', 'none');
$nprGcDisabled = $nprCreateStudent('GcDis', 'disabled');

$nprGcChangedEnr = $nprEnroll($nprGcChanged['studentId'], $nprCs2, 'Active');
$nprGcAttOnlyEnr = $nprEnroll($nprGcAttOnly['studentId'], $nprCs2, 'Active');
$nprEnroll($nprGcUntouched['studentId'], $nprCs2, 'Active');
$nprEnroll($nprGcNoAcct['studentId'], $nprCs2, 'Active');
$nprEnroll($nprGcDisabled['studentId'], $nprCs2, 'Active');

$nprGcAssessments = [];
foreach (['Midterm', 'Final'] as $period) {
    foreach ([['Lecture', 'Quiz'], ['Lecture', 'Exam'], ['Laboratory', 'Quiz']] as [$comp, $cat]) {
        $aid = $groupedInsertAssessment($nprCs2, $nprCat2[$period][$comp][$cat], "Npr GC {$period} {$comp} {$cat}", $period);
        $nprGcAssessments["{$period}.{$comp}.{$cat}"] = $aid;
        foreach ([$nprGcChanged, $nprGcAttOnly, $nprGcUntouched, $nprGcNoAcct, $nprGcDisabled] as $who) {
            $groupedInsertScore($aid, $who['studentId'], 90.0);
        }
    }
}
$nprGcFinalExam = $nprGcAssessments['Final.Lecture.Exam'];

$nprGcSessStmt = $pdo->prepare(
    "INSERT INTO attendance_sessions (cs_id, secretary_user_id, owner_user_id, session_date, session_code, status, ended_at)
     VALUES (?, ?, ?, CURRENT_DATE - 3, ?, 'ended', CURRENT_TIMESTAMP(6)) RETURNING session_id"
);
$nprGcSessStmt->execute([$nprCs2, $nprFa, $nprFa, "NPR-GC-SESS-{$nprTag}"]);
$nprGcSessId = (int) $nprGcSessStmt->fetchColumn();
$nprGcRecStmt = $pdo->prepare(
    "INSERT INTO attendance_records (enrollment_id, attendance_session_id, session_date, session_code, status, verification_method)
     VALUES (?, ?, CURRENT_DATE - 3, ?, 'present', 'integration_fixture') RETURNING record_id"
);
$nprGcRecStmt->execute([$nprGcAttOnlyEnr, $nprGcSessId, "NPR-GC-SESS-{$nprTag}"]);
$nprGcAttRecId = (int) $nprGcRecStmt->fetchColumn();

expect_same(200, integration_http_json('/api/faculty/grades/compute', $nprTokenFa, ['classId' => (string) $nprCs2])[0], 'NTF-002 (2) setup: grades computed');
expect_same(200, $gsSubmit($nprCs2, $nprTokenFa)[0], 'NTF-002 (2) setup: grades submitted');
$pdo->prepare("UPDATE class_sections SET grades_grace_until = CURRENT_TIMESTAMP - INTERVAL '1 hour' WHERE cs_id = ?")->execute([$nprCs2]);

// (2a) Rejected grade change -> NO grade_changed notices.
expect_same(200, integration_http_json('/api/faculty/classes/grade-change', $nprTokenFa, ['csId' => $nprCs2])[0], 'NTF-002 (2a): open grade change draft');
expect_same(200, integration_http_json('/api/faculty/scores', $nprTokenFa, [
    'assessmentId' => (string) $nprGcFinalExam,
    'scores' => [['studentId' => (string) $nprGcChanged['studentId'], 'score' => 45.0]],
])[0], 'NTF-002 (2a): edit score in draft');
[$nprRejSendStatus, $nprRejSendBody] = integration_http_json('/api/faculty/classes/grade-change/send', $nprTokenFa, ['csId' => $nprCs2, 'reason' => 'Testing rejected grade change notifications.']);
expect_same(200, $nprRejSendStatus, 'NTF-002 (2a): send grade change');
$nprRejBatchId = (int) ($nprRejSendBody['batch']['batchId'] ?? 0);
expect_same(200, integration_http_json('/api/admin/grade-change-requests/reject', $adminAccessToken, ['batchId' => $nprRejBatchId, 'reason' => 'Missing lab verification sheet.'])[0], 'NTF-002 (2a): Dean rejects grade change');
expect_same(0, $nprNotifCount($nprGcChanged['userId'], 'grade_changed'), 'NTF-002 (2a): rejected grade change sends 0 grade_changed notices to Student');
expect_same(0, $nprNotifCount($nprFa, 'grade_changed'), 'NTF-002 (2a): rejected grade change sends 0 grade_changed notices to Faculty');
expect_same(0, $nprNotifCount($nprDeanId, 'grade_changed'), 'NTF-002 (2a): rejected grade change sends 0 grade_changed notices to Dean');

// (2b) Approved grade change -> ONLY Student whose grade actually changed receives 1 grade_changed notice.
expect_same(200, integration_http_json('/api/faculty/classes/grade-change', $nprTokenFa, ['csId' => $nprCs2])[0], 'NTF-002 (2b): open second grade change draft');
expect_same(200, integration_http_json('/api/faculty/scores', $nprTokenFa, [
    'assessmentId' => (string) $nprGcFinalExam,
    'scores' => [
        ['studentId' => (string) $nprGcChanged['studentId'], 'score' => 45.0],
        ['studentId' => (string) $nprGcNoAcct['studentId'], 'score' => 45.0],
        ['studentId' => (string) $nprGcDisabled['studentId'], 'score' => 45.0],
    ],
])[0], 'NTF-002 (2b): edit scores for changed, no-account, and disabled Students');
expect_same(200, integration_http_json('/api/faculty/attendance/override', $nprTokenFa, [
    'recordId' => (string) $nprGcAttRecId,
    'status' => 'late',
    'reason' => 'Attendance-only correction without grade impact',
])[0], 'NTF-002 (2b): edit attendance-only Student without altering grade');
[$nprAppSendStatus, $nprAppSendBody] = integration_http_json('/api/faculty/classes/grade-change/send', $nprTokenFa, ['csId' => $nprCs2, 'reason' => 'Approved grade change notification verification.']);
expect_same(200, $nprAppSendStatus, 'NTF-002 (2b): send grade change for approval');
$nprAppBatchId = (int) ($nprAppSendBody['batch']['batchId'] ?? 0);

[, $nprDetailBody] = integration_http_get_json('/api/admin/grade-change-requests/detail?batchId=' . $nprAppBatchId, $adminAccessToken);
$nprDetailByNum = array_column($nprDetailBody['students'] ?? [], null, 'studentNumber');
expect_true(
    isset($nprDetailByNum[$nprGcAttOnly['number']])
        && (float) ($nprDetailByNum[$nprGcAttOnly['number']]['oldGrade'] ?? -1) === (float) ($nprDetailByNum[$nprGcAttOnly['number']]['newGrade'] ?? -2),
    'NTF-002 (2b) setup: attendance-only Student is in diff with unchanged grade'
);

expect_same(200, integration_http_json('/api/admin/grade-change-requests/approve', $adminAccessToken, ['batchId' => $nprAppBatchId])[0], 'NTF-002 (2b): Dean approves grade change');
expect_same(1, $nprNotifCount($nprGcChanged['userId'], 'grade_changed'), 'NTF-002 (2b): Student whose grade changed receives 1 grade_changed notice');
expect_same(0, $nprNotifCount($nprGcAttOnly['userId'], 'grade_changed'), 'NTF-002 (2b): attendance-only Student whose grade did not change receives 0 grade_changed notices');
expect_same(0, $nprNotifCount($nprGcUntouched['userId'], 'grade_changed'), 'NTF-002 (2b): untouched Student receives 0 grade_changed notices');
expect_same(0, $nprNotifCount($nprGcDisabled['userId'], 'grade_changed'), 'NTF-002 (2b): disabled Student account receives 0 grade_changed notices');
expect_same(0, $nprNotifCount($nprFa, 'grade_changed'), 'NTF-002 (2b): Faculty actor receives 0 grade_changed notices');
expect_same(0, $nprNotifCount($nprDeanId, 'grade_changed'), 'NTF-002 (2b): Dean actor receives 0 grade_changed notices');

// ============================================================================
// 3. Class Faculty changed (SuperadminClassesController.php)
// ============================================================================
$nprCourseInsert->execute(["NPC{$nprTag}", "Npr Change Faculty Course {$nprTag}"]);
$nprCourse3 = (int) $nprCourseInsert->fetchColumn();
$nprClassInsert->execute(["NPR-CF-{$nprTag}", $nprCourse3, $nprFa, $gsYear]);
$nprCs3 = (int) $nprClassInsert->fetchColumn();

$nprCfSecEnrolled = $nprCreateStudent('CfSecEnr', 'secretary');
$nprCfStu = $nprCreateStudent('CfStu', 'active');
$nprCfDisabled = $nprCreateStudent('CfDis', 'disabled');
$nprCfNoAcct = $nprCreateStudent('CfNoAcct', 'none');
$nprCfArchived = $nprCreateStudent('CfArch', 'active');

$nprEnroll($nprCfSecEnrolled['studentId'], $nprCs3, 'Active');
$nprEnroll($nprCfStu['studentId'], $nprCs3, 'Active');
$nprEnroll($nprCfDisabled['studentId'], $nprCs3, 'Active');
$nprEnroll($nprCfNoAcct['studentId'], $nprCs3, 'Active');
$nprEnroll($nprCfArchived['studentId'], $nprCs3, 'Archived');
$pdo->prepare('UPDATE class_sections SET secretary_user_id = ? WHERE cs_id = ?')->execute([$nprCfSecEnrolled['userId'], $nprCs3]);

[$nprCfStatus] = integration_http_json('/api/admin/classes/change-faculty', $superAccessToken, [
    'csId' => $nprCs3,
    'toUserId' => $nprFb,
    'reason' => 'Testing enrolled Secretary deduplication and active filtering.',
]);
expect_same(200, $nprCfStatus, 'NTF-002 (3): Superadmin changes class Faculty');
expect_same(1, $nprNotifCount($nprCfSecEnrolled['userId'], 'class_assignment', 'Class Faculty changed'), 'NTF-002 (3): enrolled Class Secretary receives ONLY 1 Class Faculty changed notice (deduplicated)');
expect_same(1, $nprNotifCount($nprCfStu['userId'], 'class_assignment', 'Class Faculty changed'), 'NTF-002 (3): active enrolled Student receives 1 Class Faculty changed notice');
expect_same(0, $nprNotifCount($nprCfDisabled['userId'], 'class_assignment', 'Class Faculty changed'), 'NTF-002 (3): disabled Student receives 0 Class Faculty changed notices');
expect_same(0, $nprNotifCount($nprCfArchived['userId'], 'class_assignment', 'Class Faculty changed'), 'NTF-002 (3): Archived-enrollment Student receives 0 Class Faculty changed notices');
expect_same(0, $nprNotifCount($superUserId, 'class_assignment', 'Class Faculty changed'), 'NTF-002 (3): Superadmin actor receives 0 Class Faculty changed notices');

// ============================================================================
// 4. Join request waiting (ClassJoinController.php student join)
// ============================================================================
$nprCourseInsert->execute(["NPD{$nprTag}", "Npr Join Request Course {$nprTag}"]);
$nprCourse4 = (int) $nprCourseInsert->fetchColumn();
$nprClassInsert->execute(["NPR-JR-{$nprTag}", $nprCourse4, $nprFa, $gsYear]);
$nprCs4 = (int) $nprClassInsert->fetchColumn();

[$nprJoinCfgStatus, $nprJoinCfg] = integration_http_get_json('/api/faculty/classes/join?csId=' . $nprCs4, $nprTokenFa);
expect_true($nprJoinCfgStatus === 200 && ($nprJoinCfg['open'] ?? false) === true && is_string($nprJoinCfg['code'] ?? null), 'NTF-002 (4) setup: class join code is active and open');
$nprJoinCode = (string) $nprJoinCfg['code'];

$nprJrStu1 = $nprCreateStudent('JrOne', 'active');
$nprJrStu2 = $nprCreateStudent('JrTwo', 'active');
$nprJrStu3 = $nprCreateStudent('JrThree', 'active');
$nprJrStu1Token = $gsLogin($nprJrStu1['email']);
$nprJrStu2Token = $gsLogin($nprJrStu2['email']);
$nprJrStu3Token = $gsLogin($nprJrStu3['email']);

// (4a) join_auto_approve = false -> Faculty receives 1 'Join request waiting' notice; Student receives 0.
$nprFaJoinWaitBefore = $nprNotifCount($nprFa, 'class_enrollment', 'Join request waiting');
[$nprJr1Status, $nprJr1Body] = integration_http_json('/api/student/classes/join', $nprJrStu1Token, ['code' => $nprJoinCode]);
expect_same(200, $nprJr1Status, 'NTF-002 (4a): Student join request succeeds');
expect_same('pending', $nprJr1Body['result'] ?? null, 'NTF-002 (4a): join_auto_approve false produces pending request');
expect_same($nprFaJoinWaitBefore + 1, $nprNotifCount($nprFa, 'class_enrollment', 'Join request waiting'), 'NTF-002 (4a): active Faculty receives 1 Join request waiting notice');
expect_same(0, $nprNotifCount($nprJrStu1['userId'], 'class_enrollment'), 'NTF-002 (4a): Student actor receives 0 class_enrollment notices');

// (4b) join_auto_approve = true -> Faculty does NOT receive 'Join request waiting'.
expect_same(200, integration_http_json('/api/faculty/classes/join/settings', $nprTokenFa, ['csId' => $nprCs4, 'autoApprove' => true])[0], 'NTF-002 (4b) setup: Faculty turns on autoApprove');
[$nprJr2Status, $nprJr2Body] = integration_http_json('/api/student/classes/join', $nprJrStu2Token, ['code' => $nprJoinCode]);
expect_same(200, $nprJr2Status, 'NTF-002 (4b): Student auto-approve join succeeds');
expect_same('joined', $nprJr2Body['result'] ?? null, 'NTF-002 (4b): join_auto_approve true produces joined');
expect_same($nprFaJoinWaitBefore + 1, $nprNotifCount($nprFa, 'class_enrollment', 'Join request waiting'), 'NTF-002 (4b): auto-approve does NOT send Join request waiting to Faculty');
expect_same(1, $nprNotifCount($nprJrStu2['userId'], 'class_enrollment'), 'NTF-002 (4b): auto-approved Student receives NTF-001 enrollment notice');

// (4c) Disabled Faculty does NOT receive 'Join request waiting'.
$nprClassInsert->execute(["NPR-JRDIS-{$nprTag}", $nprCourse4, $nprFaDisabled, $gsYear]);
$nprCs4Dis = (int) $nprClassInsert->fetchColumn();
$nprDisCode = 'NP' . strtoupper(substr(bin2hex(random_bytes(3)), 0, 4));
$nprDisCode = strtr($nprDisCode, '01IO', '23PQ');
$pdo->prepare('UPDATE class_sections SET join_code = ?, join_code_enabled = TRUE, join_auto_approve = FALSE WHERE cs_id = ?')->execute([$nprDisCode, $nprCs4Dis]);
[$nprJr3Status, $nprJr3Body] = integration_http_json('/api/student/classes/join', $nprJrStu3Token, ['code' => $nprDisCode]);
expect_same(200, $nprJr3Status, 'NTF-002 (4c): Student join against disabled Faculty class creates pending request');
expect_same('pending', $nprJr3Body['result'] ?? null, 'NTF-002 (4c): pending request created');
expect_same(0, $nprNotifCount($nprFaDisabled, 'class_enrollment', 'Join request waiting'), 'NTF-002 (4c): disabled Faculty account receives 0 Join request waiting notices');

// ============================================================================
// 5. Face revocation request waiting (StudentBiometricController.php)
// ============================================================================
$nprBioStu1 = $nprCreateStudent('BioOne', 'active');
$nprBioStu2 = $nprCreateStudent('BioTwo', 'active');
$nprEnroll($nprBioStu1['studentId'], $nprCs1, 'Active');
$nprEnroll($nprBioStu2['studentId'], $nprCs1, 'Active');

$nprInsertBio = $pdo->prepare(
    "INSERT INTO biometric_profiles
        (student_id, consent_status, face_enrolled, consent_disclosure_version, enrollment_status, protected_object_reference, reference_expires_on, usable_sample_count, enrolled_at)
     VALUES (?, 'approved', 1, 'v1.1-2026-09', 'active', ?, '2099-12-31', 25, CURRENT_TIMESTAMP(6))"
);
$nprBioRef1 = 'sface/npr1_' . bin2hex(random_bytes(8));
$nprBioRef2 = 'sface/npr2_' . bin2hex(random_bytes(8));
$nprInsertBio->execute([$nprBioStu1['studentId'], $nprBioRef1]);
$nprInsertBio->execute([$nprBioStu2['studentId'], $nprBioRef2]);

$nprBioToken1 = $gsLogin($nprBioStu1['email']);
$nprBioToken2 = $gsLogin($nprBioStu2['email']);
expect_true($nprBioToken1 !== '' && $nprBioToken2 !== '', 'NTF-002 (5) setup: biometric Students sign in');

$nprRevWaitBefore = $nprNotifCount($superUserId, 'biometric_enrollment', 'Face revocation request waiting');
$nprDeanRevWaitBefore = $nprNotifCount($nprDeanId, 'biometric_enrollment', 'Face revocation request waiting');
[$nprRevReq1Status] = integration_http_json('/api/student/biometrics/revoke-request', $nprBioToken1, ['reason' => 'Testing revocation request notice to Superadmin.']);
expect_same(201, $nprRevReq1Status, 'NTF-002 (5a): Student creates face revocation request');
expect_same($nprRevWaitBefore + 1, $nprNotifCount($superUserId, 'biometric_enrollment', 'Face revocation request waiting'), 'NTF-002 (5a): active Superadmin receives 1 Face revocation request waiting notice');
expect_same($nprDeanRevWaitBefore, $nprNotifCount($nprDeanId, 'biometric_enrollment', 'Face revocation request waiting'), 'NTF-002 (5a): Dean receives 0 Face revocation request waiting notices');
expect_same(0, $nprNotifCount($nprBioStu1['userId'], 'biometric_enrollment', 'Face revocation request waiting'), 'NTF-002 (5a): Student actor receives 0 Face revocation request waiting notices');

// Inactive Superadmin (temporarily toggle the sole Superadmin row per uq_user_accounts_one_superadmin, then restore).
$pdo->prepare("UPDATE user_accounts SET status = 'Disabled' WHERE user_id = ?")->execute([$superUserId]);
try {
    [$nprRevReq2Status] = integration_http_json('/api/student/biometrics/revoke-request', $nprBioToken2, ['reason' => 'Testing disabled Superadmin receives no revoke notice.']);
    expect_same(201, $nprRevReq2Status, 'NTF-002 (5b): second Student creates face revocation request while Superadmin is disabled');
    expect_same($nprRevWaitBefore + 1, $nprNotifCount($superUserId, 'biometric_enrollment', 'Face revocation request waiting'), 'NTF-002 (5b): disabled Superadmin receives 0 new Face revocation request waiting notices');
} finally {
    $pdo->prepare("UPDATE user_accounts SET status = 'Active' WHERE user_id = ?")->execute([$superUserId]);
}

// ============================================================================
// 6. Face enrolment flagged (backend/app/face_flags.php, face_flag_raise)
// ============================================================================
// (6a) F2 mismatch triggered by Student via real HTTP + sidecar: Superadmin receives 1 notice; repeated mismatch on same open flag_id does NOT duplicate.
$nprFlaggedBefore = $nprNotifCount($superUserId, 'biometric_enrollment', 'Face enrolment flagged');
$nprDeanFlaggedBefore = $nprNotifCount($nprDeanId, 'biometric_enrollment', 'Face enrolment flagged');

[$nprChal1Status, $nprChal1] = $ffSidecarHttpJson('POST', '/api/student/biometric/liveness/challenge', $nprBioToken1, ['purpose' => 'enrollment']);
expect_same(201, $nprChal1Status, 'NTF-002 (6a) setup: liveness challenge #1 issued');
[$nprMis1Status] = $ffSidecarMultipart('/api/student/biometrics/enrollment', $nprBioToken1, [
    'challengeId' => (string) ($nprChal1['challengeId'] ?? ''),
    'challengeToken' => (string) ($nprChal1['challengeToken'] ?? ''),
    'idempotencyKey' => 'npr-mis1-' . $nprTag,
], 20);
expect_same(409, $nprMis1Status, 'NTF-002 (6a): mismatched update returns 409 and raises open F2 flag');
expect_same($nprFlaggedBefore + 1, $nprNotifCount($superUserId, 'biometric_enrollment', 'Face enrolment flagged'), 'NTF-002 (6a): active Superadmin receives 1 Face enrolment flagged notice for F2');
expect_same($nprDeanFlaggedBefore, $nprNotifCount($nprDeanId, 'biometric_enrollment', 'Face enrolment flagged'), 'NTF-002 (6a): Dean receives 0 Face enrolment flagged notices');
expect_same(0, $nprNotifCount($nprBioStu1['userId'], 'biometric_enrollment', 'Face enrolment flagged'), 'NTF-002 (6a): Student actor receives 0 Face enrolment flagged notices');

// Second mismatch refreshes the same open F2 flag_id -> deduplicated, still +1 total.
[$nprChal2Status, $nprChal2] = $ffSidecarHttpJson('POST', '/api/student/biometric/liveness/challenge', $nprBioToken1, ['purpose' => 'enrollment']);
expect_same(201, $nprChal2Status, 'NTF-002 (6a) setup: liveness challenge #2 issued');
[$nprMis2Status] = $ffSidecarMultipart('/api/student/biometrics/enrollment', $nprBioToken1, [
    'challengeId' => (string) ($nprChal2['challengeId'] ?? ''),
    'challengeToken' => (string) ($nprChal2['challengeToken'] ?? ''),
    'idempotencyKey' => 'npr-mis2-' . $nprTag,
], 20);
expect_same(409, $nprMis2Status, 'NTF-002 (6a): second mismatched update refreshes existing open F2 flag');
expect_same(1, (int) $gsOne("SELECT count(*) FROM face_enrolment_flags WHERE student_id = ? AND kind = 'F2' AND status = 'open'", [$nprBioStu1['studentId']]), 'NTF-002 (6a): still 1 open F2 flag row');
expect_same($nprFlaggedBefore + 1, $nprNotifCount($superUserId, 'biometric_enrollment', 'Face enrolment flagged'), 'NTF-002 (6a): refreshing same open flag_id sends NO duplicate Face enrolment flagged notice');

// (6b) F3 raised when Superadmin approves 3rd revocation request -> approving Superadmin actor is EXCLUDED (0 new notices to actor).
$nprBioStu3 = $nprCreateStudent('BioThree', 'active');
$nprEnroll($nprBioStu3['studentId'], $nprCs1, 'Active');
$nprBioToken3 = $gsLogin($nprBioStu3['email']);
$nprReactivateStu3 = static function (string $suffix) use ($pdo, $nprBioStu3): void {
    $ref = 'sface/npr3_' . $suffix . '_' . bin2hex(random_bytes(4));
    $exists = (int) $pdo->query('SELECT count(*) FROM biometric_profiles WHERE student_id = ' . (int) $nprBioStu3['studentId'])->fetchColumn();
    if ($exists === 0) {
        $pdo->prepare(
            "INSERT INTO biometric_profiles
                (student_id, consent_status, face_enrolled, consent_disclosure_version, enrollment_status, protected_object_reference, reference_expires_on, usable_sample_count, enrolled_at)
             VALUES (?, 'approved', 1, 'v1.1-2026-09', 'active', ?, '2099-12-31', 25, CURRENT_TIMESTAMP(6))"
        )->execute([$nprBioStu3['studentId'], $ref]);
    } else {
        $pdo->prepare(
            "UPDATE biometric_profiles
                SET consent_status = 'approved', enrollment_status = 'active', face_enrolled = 1,
                    protected_object_reference = ?, reference_expires_on = '2099-12-31', usable_sample_count = 25,
                    enrolled_at = CURRENT_TIMESTAMP(6), revoked_at = NULL, revoked_by_user_id = NULL
              WHERE student_id = ?"
        )->execute([$ref, $nprBioStu3['studentId']]);
    }
};

$nprFlaggedBeforeF3 = $nprNotifCount($superUserId, 'biometric_enrollment', 'Face enrolment flagged');
for ($nprAttempt = 1; $nprAttempt <= 3; $nprAttempt++) {
    $nprReactivateStu3('r' . $nprAttempt);
    [$nprRStatus, $nprRBody] = integration_http_json('/api/student/biometrics/revoke-request', $nprBioToken3, ['reason' => "Device change attempt #{$nprAttempt} for F3 check."]);
    expect_same(201, $nprRStatus, "NTF-002 (6b): Student submits revocation request #{$nprAttempt}");
    $nprReqId = (int) ($nprRBody['request']['requestId'] ?? 0);
    [$nprAStatus, $nprABody] = $ffSidecarHttpJson('POST', '/api/admin/face-revoke-requests/approve', $superAccessToken, ['requestId' => $nprReqId]);
    expect_same(200, $nprAStatus, "NTF-002 (6b): Superadmin approves revocation request #{$nprAttempt}");
    if ($nprAttempt === 3) {
        expect_same(true, $nprABody['flagged'] ?? null, 'NTF-002 (6b): 3rd approved revocation raises F3');
    }
}
$nprF3FlagId = (int) $gsOne("SELECT flag_id FROM face_enrolment_flags WHERE student_id = ? AND kind = 'F3' AND status = 'open' ORDER BY flag_id DESC LIMIT 1", [$nprBioStu3['studentId']]);
expect_true($nprF3FlagId > 0, 'NTF-002 (6b): open F3 flag exists');
expect_same($nprFlaggedBeforeF3, $nprNotifCount($superUserId, 'biometric_enrollment', 'Face enrolment flagged'), 'NTF-002 (6b): approving Superadmin actor receives 0 Face enrolment flagged notices for their own F3 approval');
expect_same(0, $nprNotifCount($nprBioStu3['userId'], 'biometric_enrollment', 'Face enrolment flagged'), 'NTF-002 (6b): Student receives 0 Face enrolment flagged notices');

// (6c) Non-actor raise (e.g. system/student-triggered) notifies active Superadmin, and disabled Superadmin receives 0.
$pdo->prepare("UPDATE face_enrolment_flags SET status = 'dismissed', closed_at = CURRENT_TIMESTAMP, closed_by_user_id = ?, closed_note = 'Dismissed for non-actor check' WHERE flag_id = ?")
    ->execute([$superUserId, $nprF3FlagId]);
$pdo->beginTransaction();
face_flag_raise($pdo, $ffConfig, $ffContext, $nprBioStu3['studentId'], 'F3', ['approvedCount' => 3, 'source' => 'non_actor_check']);
$pdo->commit();
expect_same($nprFlaggedBeforeF3 + 1, $nprNotifCount($superUserId, 'biometric_enrollment', 'Face enrolment flagged'), 'NTF-002 (6c): active Superadmin receives 1 Face enrolment flagged notice when another actor/system raises F3');

// Disabled Superadmin receives 0 notices when a new open flag is raised.
$nprFlaggedBeforeDis = $nprNotifCount($superUserId, 'biometric_enrollment', 'Face enrolment flagged');
$pdo->prepare("UPDATE user_accounts SET status = 'Disabled' WHERE user_id = ?")->execute([$superUserId]);
try {
    $pdo->beginTransaction();
    face_flag_raise($pdo, $ffConfig, $ffContext, $nprBioStu2['studentId'], 'F2', ['attemptedAt' => '2026-11-23T12:00:00+08:00']);
    $pdo->commit();
    expect_same($nprFlaggedBeforeDis, $nprNotifCount($superUserId, 'biometric_enrollment', 'Face enrolment flagged'), 'NTF-002 (6d): disabled Superadmin receives 0 Face enrolment flagged notices');
} finally {
    $pdo->prepare("UPDATE user_accounts SET status = 'Active' WHERE user_id = ?")->execute([$superUserId]);
}

echo "PASS: Notifications per role integration checks completed.\n";
