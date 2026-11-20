<?php

declare(strict_types=1);

// Grade submission, slice 2 (docs/contracts/grade-submission.md, spec GRD-004): Dean-approved grade changes. Open a draft, edit
// the live rows, send, pull back, discard, and the Dean's approve / reject, with the draft mechanism (Students keep the published
// grades, rule 5 locks, rule 6 restore, rule 7 listing) and the notifications and audit rows.
// Included by the full disposable PostgreSQL suite after grade_submission_integration.php, so it reuses that file's $gsOne, $gsRows,
// $gsLogin, $gsEmail, $gsMessage, $gsAuditCount, $gsFacultyGet, $gsSubmit, $gsYear and $gsLetters, plus $saAccount, $saPass,
// $groupedPayload, $groupedMembershipRows, $groupedCategoryIds, $groupedInsertAssessment, $groupedInsertScore,
// $adminAccessToken (the Dean) and $superAccessToken. Every row it makes carries $gdTag. Written from the contract, not from the code.

$gdTag = 'gd' . strtolower(bin2hex(random_bytes(3)));
$gdLetters = strtr($gdTag, '0123456789', 'abcdefghij');
$gdFa = $saAccount("gd-fa-{$gdTag}@bicol-u.edu.ph", 'faculty', "Gd Alpha {$gdLetters}");
$gdFb = $saAccount("gd-fb-{$gdTag}@bicol-u.edu.ph", 'faculty', "Gd Bravo {$gdLetters}");
$gdTokenFa = $gsLogin($gsEmail($gdFa));
$gdTokenFb = $gsLogin($gsEmail($gdFb));
expect_true($gdTokenFa !== '' && $gdTokenFb !== '', 'Grade change setup: both Faculty fixtures sign in');
$gdDeanId = (int) $gsOne("SELECT user_id FROM user_accounts WHERE login_email = 'admin@bicol-u.edu.ph'");
expect_true($gdDeanId > 0, 'Grade change setup: the Dean account exists');

// ---- Fixture: course, shared grade weights, classes ----
$gdCourseInsert = $pdo->prepare("INSERT INTO courses (course_code, name, units, semester, grading_config) VALUES (?, ?, 3.0, '1ST', '{}'::jsonb) RETURNING course_id");
$gdCourseInsert->execute(["GDA{$gdTag}", "Gd Course {$gdTag}"]);
$gdCourse = (int) $gdCourseInsert->fetchColumn();
$pdo->prepare("INSERT INTO class_sections (cs_name, course_id, instructor_user_id, semester, school_year, status) VALUES (?, ?, ?, '1ST', ?, 'Active')")->execute(["GD-BASE-{$gdTag}", $gdCourse, $gdFa, $gsYear]); // the weights need a class of this Faculty member in the offering
$gdOffering = ['courseId' => $gdCourse, 'schoolYear' => $gsYear];
[$gdCfgStatus, $gdCfgBody] = integration_http_put_json('/api/faculty/grading-config', $gdTokenFa, $groupedPayload($gdOffering));
expect_same(201, $gdCfgStatus, 'Grade change setup: Faculty save grade weights (' . json_encode($gdCfgBody) . ')');
$gdConfigId = (int) ($gdCfgBody['configuration']['id'] ?? 0);
$gdConfigVersion = (int) ($gdCfgBody['configuration']['version'] ?? 1);
$gdCatIds = $groupedCategoryIds($groupedMembershipRows($gdConfigId));
$gdWeights = static fn(): array => integration_http_put_json('/api/faculty/grading-config', $gdTokenFa, $groupedPayload($gdOffering, $gdCatIds) + ['id' => $gdConfigId, 'version' => $gdConfigVersion]);

$gdStudentInsert = $pdo->prepare("INSERT INTO students (student_number, first_name, last_name, bu_email, status, admission_date) VALUES (?, 'Gd', ?, ?, 'active', CURRENT_DATE) RETURNING student_id");
$gdEnrollInsert = $pdo->prepare("INSERT INTO enrollments (student_id, cs_id, status, date_enrolled) VALUES (?, ?, 'Active', CURRENT_DATE) RETURNING enrollment_id");
$gdSessionInsert = $pdo->prepare("INSERT INTO attendance_sessions (cs_id, secretary_user_id, owner_user_id, session_date, session_code, status, ended_at) VALUES (?, ?, ?, CURRENT_DATE - 3, ?, 'ended', CURRENT_TIMESTAMP(6)) RETURNING session_id");
$gdRecordInsert = $pdo->prepare("INSERT INTO attendance_records (enrollment_id, attendance_session_id, session_date, session_code, status, verification_method) VALUES (?, ?, CURRENT_DATE - 3, ?, 'present', 'integration_fixture') RETURNING record_id");
$gdClassInsert = $pdo->prepare("INSERT INTO class_sections (cs_name, course_id, instructor_user_id, semester, school_year, status) VALUES (?, ?, ?, '1ST', ?, 'Active') RETURNING cs_id");
$gdStudentSeq = 0;
// A class with three Students (S1 has a Student account, S2 and S3 do not), six scored assessments, an ended attendance session with a
// "present" record each and a published grade. S1 and S2 score 90 and 85 everywhere; S3 scores 80.
$gdFixture = static function (string $label) use ($pdo, $saAccount, $gdTag, $gdLetters, $gdCourse, $gdFa, $gsYear, $gdCatIds, $gdClassInsert, $gdStudentInsert, $gdEnrollInsert, $gdSessionInsert, $gdRecordInsert, $groupedInsertAssessment, $groupedInsertScore, $gdTokenFa, &$gdStudentSeq): array {
    $gdClassInsert->execute(["GD-{$label}-{$gdTag}", $gdCourse, $gdFa, $gsYear]);
    $csId = (int) $gdClassInsert->fetchColumn();
    $people = [];
    foreach ([['One', 90.0], ['Two', 85.0], ['Three', 80.0]] as $index => [$name, $base]) {
        $number = "GD-{$gdTag}-{$label}{$name}";
        if ($index === 0) {
            $accountId = $saAccount("gd-stu-{$label}-{$gdTag}@bicol-u.edu.ph", 'student', "Gd Stu {$label} {$gdLetters}", $number);
            $studentId = (int) $pdo->query("SELECT student_id FROM students WHERE student_number = " . $pdo->quote($number))->fetchColumn();
        } else {
            $gdStudentInsert->execute([$number, $name, 'gd.' . strtolower($label . $name) . ".{$gdTag}@bicol-u.edu.ph"]);
            $studentId = (int) $gdStudentInsert->fetchColumn();
            $accountId = null;
        }
        $gdEnrollInsert->execute([$studentId, $csId]);
        $people[$name] = ['studentId' => $studentId, 'enrollmentId' => (int) $gdEnrollInsert->fetchColumn(), 'number' => $number, 'accountId' => $accountId, 'base' => $base];
    }
    $assessments = [];
    foreach (['Midterm', 'Final'] as $period) {
        foreach ([['Lecture', 'Quiz'], ['Lecture', 'Exam'], ['Laboratory', 'Quiz']] as [$component, $category]) {
            $assessments["{$period}.{$component}.{$category}"] = $groupedInsertAssessment($csId, $gdCatIds[$period][$component][$category], "Gd {$label} {$period} {$component} {$category}", $period);
        }
    }
    foreach ($assessments as $assessmentId) {
        foreach ($people as $person) {
            $groupedInsertScore($assessmentId, $person['studentId'], $person['base']);
        }
    }
    $gdSessionInsert->execute([$csId, $gdFa, $gdFa, "GD-{$label}-{$gdTag}"]);
    $sessionId = (int) $gdSessionInsert->fetchColumn();
    $records = [];
    foreach ($people as $name => $person) {
        $gdRecordInsert->execute([$person['enrollmentId'], $sessionId, "GD-{$label}-{$gdTag}"]);
        $records[$name] = (int) $gdRecordInsert->fetchColumn();
    }
    [$computeStatus] = integration_http_json('/api/faculty/grades/compute', $gdTokenFa, ['classId' => (string) $csId]);
    expect_same(200, $computeStatus, "Grade change fixture {$label}: the grades compute");
    foreach ($people as $name => $person) {
        $gwa = $pdo->query('SELECT final_gwa FROM enrollments WHERE enrollment_id = ' . $person['enrollmentId'])->fetchColumn();
        expect_true($gwa !== null, "Grade change fixture {$label}: {$name} has a published grade");
    }
    return ['csId' => $csId, 'people' => $people, 'assessments' => $assessments, 'records' => $records, 'sessionId' => $sessionId];
};

// ---- Helpers ----
$gdBase = '/api/faculty/classes/grade-change';
$gdPost = static fn(string $suffix, int $csId, string $token, array $extra = []): array => integration_http_json($gdBase . $suffix, $token, ['csId' => $csId] + $extra);
$gdOpen = static fn(int $csId, string $token): array => $gdPost('', $csId, $token);
$gdSend = static fn(int $csId, string $token, string $reason = 'Late lab practical scores corrected.'): array => $gdPost('/send', $csId, $token, ['reason' => $reason]);
$gdPullBack = static fn(int $csId, string $token): array => $gdPost('/pull-back', $csId, $token);
$gdDiscard = static fn(int $csId, string $token): array => $gdPost('/discard', $csId, $token);
$gdExpire = static function (int $csId) use ($pdo, $gsSubmit, $gdTokenFa): void {
    expect_same(200, $gsSubmit($csId, $gdTokenFa)[0], 'Grade change setup: the class submits');
    $pdo->prepare("UPDATE class_sections SET grades_grace_until = CURRENT_TIMESTAMP - INTERVAL '1 hour' WHERE cs_id = ?")->execute([$csId]);
};
$gdSave = static fn(int $assessmentId, int $studentId, float $score, string $token): array => integration_http_json('/api/faculty/scores', $token, ['assessmentId' => (string) $assessmentId, 'scores' => [['studentId' => (string) $studentId, 'score' => $score]]]);
$gdScoreDb = static fn(int $assessmentId, int $studentId): ?float => ($v = $gsOne('SELECT score FROM assessment_scores WHERE assessment_id = ? AND student_id = ?', [$assessmentId, $studentId])) === null ? null : (float) $v;
$gdGradeDb = static fn(int $enrollmentId): array => $gsRows('SELECT final_percentage, final_gwa, grade_components_json::text AS components FROM enrollments WHERE enrollment_id = ?', [$enrollmentId])[0] ?? [];
$gdRecordStatus = static fn(int $recordId): ?string => $gsOne('SELECT status FROM attendance_records WHERE record_id = ?', [$recordId]);
$gdOverride = static fn(int $recordId, string $status, string $token): array => integration_http_json('/api/faculty/attendance/override', $token, ['recordId' => (string) $recordId, 'status' => $status, 'reason' => 'Grade change attendance correction']);
$gdNotes = static fn(?int $userId): int => $userId === null ? 0 : (int) $gsOne('SELECT count(*) FROM notifications WHERE recipient_user_id = ?', [$userId]);
$gdMail = static fn(int $userId): int => (int) $gsOne('SELECT count(*) FROM email_outbox WHERE recipient_email = ?', [$gsEmail($userId)]);
$gdBatchRow = static fn(int $batchId): array => $gsRows('SELECT status, reason, decision_reason, decided_by_user_id, snapshot IS NOT NULL AS has_snapshot, draft_results IS NOT NULL AS has_draft, changes IS NOT NULL AS has_changes FROM grade_change_batches WHERE batch_id = ?', [$batchId])[0] ?? [];
$gdBatchCount = static fn(int $csId): int => (int) $gsOne('SELECT count(*) FROM grade_change_batches WHERE cs_id = ?', [$csId]);
$gdFacultyGrade = static function (array $fixture, string $name, string $token) : ?float {
    [, $body] = integration_http_get_json('/api/faculty/students', $token);
    $list = array_is_list($body) ? $body : ($body['students'] ?? []);
    foreach ($list as $student) {
        if (($student['studentId'] ?? null) !== $fixture['people'][$name]['number']) {
            continue;
        }
        foreach ($student['enrolledSubjects'] ?? [] as $subject) {
            if ((string) ($subject['classId'] ?? '') === (string) $fixture['csId']) {
                return $subject['grade'] === null ? null : (float) $subject['grade'];
            }
        }
    }
    return null;
};
$gdStudentView = static function (array $fixture, string $token): array {
    [, $body] = integration_http_get_json('/api/student/classes', $token);
    foreach ($body['classes'] ?? [] as $class) {
        if ((string) ($class['classId'] ?? '') === (string) $fixture['csId']) {
            return ['grade' => $class['grade'] ?? null, 'percentage' => $class['percentage'] ?? null, 'midterm' => $class['midtermEvaluation']['percentage'] ?? null];
        }
    }
    return [];
};
$gdStudentLogStatus = static function (int $recordId, string $token): ?string {
    [, $body] = integration_http_get_json('/api/student/attendance/logs', $token);
    foreach ($body['logs'] ?? [] as $log) {
        if ((string) ($log['recordId'] ?? '') === (string) $recordId) {
            return (string) $log['status'];
        }
    }
    return null;
};
$gdRequests = static fn(string $state, string $token): array => integration_http_get_json('/api/admin/grade-change-requests?state=' . $state, $token);
$gdDetail = static fn(int $batchId, string $token): array => integration_http_get_json('/api/admin/grade-change-requests/detail?batchId=' . $batchId, $token);
$gdDecide = static fn(string $action, int $batchId, string $token, array $extra = []): array => integration_http_json('/api/admin/grade-change-requests/' . $action, $token, ['batchId' => $batchId] + $extra);

// ======== Flow A: open, draft, send, pull back, Dean views, reject ========
$gdA = $gdFixture('A');
$gdCs = $gdA['csId'];
$gdS1 = $gdA['people']['One'];
$gdS2 = $gdA['people']['Two'];
$gdS3 = $gdA['people']['Three'];
$gdFinalExam = $gdA['assessments']['Final.Lecture.Exam'];
$gdMidtermExam = $gdA['assessments']['Midterm.Lecture.Exam'];
$gdTokenStudent = $gsLogin($gsEmail($gdS1['accountId']));
expect_true($gdTokenStudent !== '', 'Grade change setup: the Student fixture signs in');

// Open: refused before submit and during the grace.
[$gdEarlyStatus, $gdEarly] = $gdOpen($gdCs, $gdTokenFa);
expect_same(409, $gdEarlyStatus, 'Open: refused before the grades are submitted');
expect_same('Grades for this class are not submitted.', $gsMessage($gdEarly), 'Open before submit: the message');
expect_same(200, $gsSubmit($gdCs, $gdTokenFa)[0], 'Open setup: the class submits');
expect_same(409, $gdOpen($gdCs, $gdTokenFa)[0], 'Open: refused during the grace');
expect_same(0, $gdBatchCount($gdCs), 'Open: the refused opens created no batch');
$pdo->prepare("UPDATE class_sections SET grades_grace_until = CURRENT_TIMESTAMP - INTERVAL '1 hour' WHERE cs_id = ?")->execute([$gdCs]);
expect_same(403, $gdOpen($gdCs, $gdTokenFb)[0], "Open: another Faculty member's class is 403");
expect_same(0, $gdBatchCount($gdCs), 'Open: the refused 403 created no batch');
$gdGwaBefore = [];
$gdPctBefore = [];
foreach ([$gdS1, $gdS2, $gdS3] as $gdPerson) {
    $gdRow = $gdGradeDb($gdPerson['enrollmentId']);
    $gdGwaBefore[$gdPerson['number']] = (string) $gdRow['final_gwa'];
    $gdPctBefore[$gdPerson['number']] = (string) $gdRow['final_percentage'];
}
$gdPublishedBefore = [$gdGradeDb($gdS1['enrollmentId']), $gdGradeDb($gdS2['enrollmentId'])];
$gdStudentBefore = $gdStudentView($gdA, $gdTokenStudent);
expect_true(($gdStudentBefore['grade'] ?? null) !== null && ($gdStudentBefore['midterm'] ?? null) !== null, 'Open setup: the Student sees a grade and a midterm evaluation');
$gdLogBefore = $gdStudentLogStatus($gdA['records']['One'], $gdTokenStudent);
expect_same('present', $gdLogBefore, 'Open setup: the Student sees the present attendance record');
$gdFacultyGradeBefore = $gdFacultyGrade($gdA, 'One', $gdTokenFa);
$gdStudentNotesBefore = $gdNotes($gdS1['accountId']);

[$gdOpenStatus, $gdOpened] = $gdOpen($gdCs, $gdTokenFa);
expect_same(200, $gdOpenStatus, 'Open: 200 after the grace (' . json_encode($gdOpened) . ')');
expect_same('draft', $gdOpened['batch']['status'] ?? null, 'Open: the batch is a draft');
$gdBatchId = (int) ($gdOpened['batch']['batchId'] ?? 0);
expect_true($gdBatchId > 0 && ($gdBatchRow($gdBatchId)['has_snapshot'] ?? false), 'Open: the batch row exists and holds a snapshot');
[$gdTwiceStatus, $gdTwice] = $gdOpen($gdCs, $gdTokenFa);
expect_same(409, $gdTwiceStatus, 'Open again: 409');
expect_same('This class already has an open grade change.', $gsMessage($gdTwice), 'Open again: the message');
expect_same(1, $gdBatchCount($gdCs), 'Open again: still one batch');
expect_same('draft', $gsFacultyGet($gdCs, $gdTokenFa)[1]['batch']['status'] ?? null, 'Open: the Faculty read shows the draft');

// During the draft: edits go through, others keep the published values.
$gdAuditSentBefore = $gsAuditCount('grade_change_sent', $gdCs);
expect_same(200, $gdSave($gdFinalExam, $gdS1['studentId'], 40.0, $gdTokenFa)[0], 'Draft: a Final score change succeeds');
expect_same(200, $gdSave($gdMidtermExam, $gdS1['studentId'], 60.0, $gdTokenFa)[0], 'Draft: a Midterm score change succeeds');
expect_same(40.0, $gdScoreDb($gdFinalExam, $gdS1['studentId']), 'Draft: the live score row has the new Final score');
$gdFacultyGradeDraft = $gdFacultyGrade($gdA, 'One', $gdTokenFa);
expect_true($gdFacultyGradeDraft !== null && $gdFacultyGradeDraft !== $gdFacultyGradeBefore, 'Draft: the Faculty read shows the new grade (' . json_encode([$gdFacultyGradeBefore, $gdFacultyGradeDraft]) . ')');
expect_same($gdStudentBefore, $gdStudentView($gdA, $gdTokenStudent), "Draft: the Student's class view keeps the old grade, percentage and midterm evaluation");
expect_same($gdPublishedBefore[0], $gdGradeDb($gdS1['enrollmentId']), 'Draft: enrollments keeps the published grade');
expect_same($gdStudentNotesBefore, $gdNotes($gdS1['accountId']), 'Draft: no Student notification is created');
expect_true((bool) ($gdBatchRow($gdBatchId)['has_draft'] ?? false), 'Draft: the new result is held in the batch');
expect_same(200, $gdOverride($gdA['records']['One'], 'absent', $gdTokenFa)[0], 'Draft: an attendance correction succeeds');
expect_same(200, $gdOverride($gdA['records']['Two'], 'absent', $gdTokenFa)[0], 'Draft: an attendance correction for the second Student succeeds');
expect_same('absent', $gdRecordStatus($gdA['records']['One']), 'Draft: the live record has the new status');
expect_same('present', $gdStudentLogStatus($gdA['records']['One'], $gdTokenStudent), "Draft: the Student's attendance view still shows the old status");
[$gdSessionStatus] = integration_http_json('/api/faculty/attendance/session', $gdTokenFa, ['classEndTime' => '23:59', 'csId' => $gdCs, 'room' => 'Integration Room']);
expect_same(409, $gdSessionStatus, 'Draft: starting an attendance session is refused');
[$gdWeightsStatus, $gdWeightsBody] = $gdWeights();
expect_same(409, $gdWeightsStatus, 'Draft: saving grade weights is refused');
expect_true(str_contains(json_encode($gdWeightsBody), 'weights are locked'), 'Draft: the weights message (' . json_encode($gdWeightsBody) . ')');
$gdExtraNumber = "GD-{$gdTag}-X";
$gdStudentInsert->execute([$gdExtraNumber, 'Extra', "gd.extra.{$gdTag}@bicol-u.edu.ph"]);
$gdExtraId = (int) $gdStudentInsert->fetchColumn();
expect_same(409, integration_http_json('/api/faculty/classes/enroll', $gdTokenFa, ['csId' => (string) $gdCs, 'studentIds' => [(string) $gdExtraId]])[0], 'Draft: adding a Student is refused');
expect_same(0, (int) $gsOne('SELECT count(*) FROM enrollments WHERE cs_id = ? AND student_id = ?', [$gdCs, $gdExtraId]), 'Draft: the refused roster change changed nothing');
[$gdArchiveDraftStatus, $gdArchiveDraft] = integration_http_json('/api/faculty/classes/archive', $gdTokenFa, ['csId' => $gdCs, 'reason' => 'finished']);
expect_same(409, $gdArchiveDraftStatus, 'Archive: refused while a draft exists');
expect_same('Send or discard the grade change first.', $gsMessage($gdArchiveDraft), 'Archive: the draft message');

// Send: reason, state, notification, audit, lock.
[$gdShortStatus, $gdShort] = $gdSend($gdCs, $gdTokenFa, 'too few');
expect_same(422, $gdShortStatus, 'Send: a reason under 8 characters is 422');
expect_same('Give a reason of at least 8 characters.', $gsMessage($gdShort), 'Send: the short-reason message');
expect_same('draft', (string) ($gdBatchRow($gdBatchId)['status'] ?? ''), 'Send: the refused send left the batch a draft');
$gdDeanNotesBefore = $gdNotes($gdDeanId);
[$gdSendStatus, $gdSent] = $gdSend($gdCs, $gdTokenFa);
expect_same(200, $gdSendStatus, 'Send: 200 (' . json_encode($gdSent) . ')');
expect_same('pending', $gdSent['batch']['status'] ?? null, 'Send: the batch is pending');
expect_same('pending', (string) ($gdBatchRow($gdBatchId)['status'] ?? ''), 'Send: the batch row is pending');
expect_true($gdNotes($gdDeanId) >= $gdDeanNotesBefore + 1, 'Send: the Dean gets an in-app notification');
expect_same($gdAuditSentBefore + 1, $gsAuditCount('grade_change_sent', $gdCs), 'Send: one grade_change_sent audit row');
[$gdPendingScoreStatus] = $gdSave($gdFinalExam, $gdS1['studentId'], 55.0, $gdTokenFa);
expect_same(409, $gdPendingScoreStatus, 'Pending: the score endpoint refuses (the class is locked again)');
expect_same(40.0, $gdScoreDb($gdFinalExam, $gdS1['studentId']), 'Pending: the refused score save changed nothing');
[$gdArchivePendingStatus, $gdArchivePending] = integration_http_json('/api/faculty/classes/archive', $gdTokenFa, ['csId' => $gdCs, 'reason' => 'finished']);
expect_same(409, $gdArchivePendingStatus, 'Archive: refused while a batch is pending');
expect_same('Send or discard the grade change first.', $gsMessage($gdArchivePending), 'Archive: the pending message');

// Pull back and send again.
$gdPulledBefore = $gsAuditCount('grade_change_pulled_back', $gdCs);
[$gdPullStatus, $gdPulled] = $gdPullBack($gdCs, $gdTokenFa);
expect_same(200, $gdPullStatus, 'Pull back: 200');
expect_same('draft', $gdPulled['batch']['status'] ?? null, 'Pull back: the batch is a draft again');
expect_same($gdPulledBefore + 1, $gsAuditCount('grade_change_pulled_back', $gdCs), 'Pull back: one grade_change_pulled_back audit row');
expect_same(200, $gdSave($gdFinalExam, $gdS1['studentId'], 40.0, $gdTokenFa)[0], 'Pull back: the draft is editable again');
expect_same(200, $gdSend($gdCs, $gdTokenFa)[0], 'Send again after a pull back: 200');
expect_same($gdAuditSentBefore + 2, $gsAuditCount('grade_change_sent', $gdCs), 'Send again: a second grade_change_sent audit row');

// Dean and Superadmin views.
expect_same(403, $gdRequests('pending', $gdTokenFa)[0], 'Dean list: Faculty get 403');
expect_same(403, $gdDetail($gdBatchId, $gdTokenFa)[0], 'Dean detail: Faculty get 403');
expect_same(403, $gdDecide('approve', $gdBatchId, $gdTokenFa)[0], 'Dean approve: Faculty get 403');
expect_same(403, $gdDecide('reject', $gdBatchId, $gdTokenFa, ['reason' => 'Faculty may not decide'])[0], 'Dean reject: Faculty get 403');
expect_same(200, $gdRequests('pending', $superAccessToken)[0], 'Dean list: the Superadmin reads it');
expect_same(200, $gdDetail($gdBatchId, $superAccessToken)[0], 'Dean detail: the Superadmin reads it');
expect_same(403, $gdDecide('approve', $gdBatchId, $superAccessToken)[0], 'Dean approve: the Superadmin gets 403');
expect_same(403, $gdDecide('reject', $gdBatchId, $superAccessToken, ['reason' => 'Superadmin may not decide'])[0], 'Dean reject: the Superadmin gets 403');
expect_same('pending', (string) ($gdBatchRow($gdBatchId)['status'] ?? ''), 'Dean: the refused decisions left the batch pending');
[$gdListStatus, $gdList] = $gdRequests('pending', $adminAccessToken);
expect_same(200, $gdListStatus, 'Dean list: the Dean reads the pending requests');
expect_true((int) ($gdList['pendingCount'] ?? 0) >= 1, 'Dean list: pendingCount is at least 1');
$gdListed = array_values(array_filter($gdList['requests'] ?? [], static fn(array $r): bool => (int) ($r['batchId'] ?? 0) === $gdBatchId))[0] ?? [];
expect_true($gdListed !== [] && ($gdListed['status'] ?? null) === 'pending' && (int) ($gdListed['csId'] ?? 0) === $gdCs, 'Dean list: the request is listed as pending');
expect_same(2, (int) ($gdListed['studentCount'] ?? 0), 'Dean list: studentCount counts the two changed Students');
[$gdDetailStatus, $gdDetailBody] = $gdDetail($gdBatchId, $adminAccessToken);
expect_same(200, $gdDetailStatus, 'Dean detail: 200');
$gdDetailStudents = array_column($gdDetailBody['students'] ?? [], null, 'studentNumber');
expect_true(isset($gdDetailStudents[$gdS1['number']], $gdDetailStudents[$gdS2['number']]) && !isset($gdDetailStudents[$gdS3['number']]), 'Dean detail: lists the two changed Students and not the untouched one');
$gdDetailOne = $gdDetailStudents[$gdS1['number']] ?? [];
expect_true(isset($gdDetailOne['oldGrade'], $gdDetailOne['newGrade']) && (float) $gdDetailOne['oldGrade'] === (float) $gdGwaBefore[$gdS1['number']] && (float) $gdDetailOne['newGrade'] !== (float) $gdDetailOne['oldGrade'], 'Dean detail: the score-change Student has oldGrade (the published one) and a different newGrade (' . json_encode($gdDetailOne) . ')');
$gdScoreChanges = array_values(array_filter($gdDetailOne['changes'] ?? [], static fn(array $c): bool => ($c['kind'] ?? '') === 'score' && is_numeric($c['old'] ?? null) && is_numeric($c['new'] ?? null) && (float) $c['old'] === 90.0 && (float) $c['new'] === 40.0));
expect_true(count($gdScoreChanges) === 1, 'Dean detail: a score change lists old 90 and new 40 (' . json_encode($gdDetailOne['changes'] ?? []) . ')');
$gdDetailTwo = $gdDetailStudents[$gdS2['number']] ?? [];
expect_true(isset($gdDetailTwo['oldGrade'], $gdDetailTwo['newGrade']) && (float) $gdDetailTwo['oldGrade'] === (float) $gdDetailTwo['newGrade'], 'Dean detail (rule 7): an attendance-only Student is listed with the same grade (' . json_encode($gdDetailTwo) . ')');
expect_true(count(array_filter($gdDetailTwo['changes'] ?? [], static fn(array $c): bool => ($c['kind'] ?? '') === 'attendance')) >= 1, 'Dean detail (rule 7): the attendance-only Student has an attendance change');

// Reject.
$gdRejectAuditBefore = $gsAuditCount('grade_change_rejected', $gdCs);
$gdFacultyNotesBefore = $gdNotes($gdFa);
$gdFacultyMailBefore = $gdMail($gdFa);
[$gdRejectShortStatus, $gdRejectShort] = $gdDecide('reject', $gdBatchId, $adminAccessToken, ['reason' => 'no']);
expect_same(422, $gdRejectShortStatus, 'Reject: a short reason is 422');
expect_same('Give a reason of at least 8 characters.', $gsMessage($gdRejectShort), 'Reject: the short-reason message');
expect_same('pending', (string) ($gdBatchRow($gdBatchId)['status'] ?? ''), 'Reject: the refused reject left the batch pending');
[$gdRejectStatus, $gdRejectBody] = $gdDecide('reject', $gdBatchId, $adminAccessToken, ['reason' => 'Scores need the lab sheet attached.']);
expect_same(200, $gdRejectStatus, 'Reject: 200 (' . json_encode($gdRejectBody) . ')');
expect_same('ok', $gdRejectBody['status'] ?? null, 'Reject: status ok');
$gdRejected = $gdBatchRow($gdBatchId);
expect_same('rejected', $gdRejected['status'] ?? null, 'Reject: the batch is rejected');
expect_same('Scores need the lab sheet attached.', $gdRejected['decision_reason'] ?? null, 'Reject: the decision reason is stored');
expect_same($gdDeanId, (int) ($gdRejected['decided_by_user_id'] ?? 0), 'Reject: the Dean is recorded as the decider');
expect_same(90.0, $gdScoreDb($gdFinalExam, $gdS1['studentId']), 'Reject: the live Final score is restored');
expect_same(90.0, $gdScoreDb($gdMidtermExam, $gdS1['studentId']), 'Reject: the live Midterm score is restored');
expect_same('present', $gdRecordStatus($gdA['records']['One']), 'Reject: the first attendance record is restored');
expect_same('present', $gdRecordStatus($gdA['records']['Two']), 'Reject: the second attendance record is restored');
expect_same($gdPublishedBefore, [$gdGradeDb($gdS1['enrollmentId']), $gdGradeDb($gdS2['enrollmentId'])], 'Reject: the published grades are unchanged');
expect_same($gdFacultyGradeBefore, $gdFacultyGrade($gdA, 'One', $gdTokenFa), 'Reject: the Faculty read shows the published grade again');
expect_same($gdStudentBefore, $gdStudentView($gdA, $gdTokenStudent), 'Reject: the Student view is unchanged');
expect_same($gdStudentNotesBefore, $gdNotes($gdS1['accountId']), 'Reject: no Student notification');
expect_true($gdNotes($gdFa) >= $gdFacultyNotesBefore + 1, 'Reject: the Faculty member gets an in-app notification');
expect_true($gdMail($gdFa) >= $gdFacultyMailBefore + 1, 'Reject: the Faculty member gets an email in the outbox');
expect_same($gdRejectAuditBefore + 1, $gsAuditCount('grade_change_rejected', $gdCs), 'Reject: one grade_change_rejected audit row');
[, $gdAfterReject] = $gsFacultyGet($gdCs, $gdTokenFa);
expect_same('rejected', $gdAfterReject['batch']['status'] ?? null, 'Reject: the Faculty read shows the rejected batch');
expect_same('Scores need the lab sheet attached.', $gdAfterReject['batch']['decisionReason'] ?? null, 'Reject: the Faculty read carries the decision reason');
expect_same(409, $gdSave($gdFinalExam, $gdS1['studentId'], 55.0, $gdTokenFa)[0], 'Reject: the class is locked again');
expect_same(409, $gdDecide('reject', $gdBatchId, $adminAccessToken, ['reason' => 'Rejecting twice again'])[0], 'Reject again: 409');
$gdDecidedList = $gdRequests('decided', $adminAccessToken)[1]['requests'] ?? [];
expect_true(count(array_filter($gdDecidedList, static fn(array $r): bool => (int) ($r['batchId'] ?? 0) === $gdBatchId && ($r['status'] ?? '') === 'rejected')) === 1, 'Dean list: the decided tab lists the rejected request');

// ======== Flow B: approve, then the pulled-back race ========
$gdB = $gdFixture('B');
$gdBCs = $gdB['csId'];
$gdBS1 = $gdB['people']['One'];
$gdBExam = $gdB['assessments']['Final.Lecture.Exam'];
$gdBStudentToken = $gsLogin($gsEmail($gdBS1['accountId']));
$gdExpire($gdBCs);
$gdBBefore = $gdGradeDb($gdBS1['enrollmentId']);
$gdBStudentBefore = $gdStudentView($gdB, $gdBStudentToken);
expect_same(200, $gdOpen($gdBCs, $gdTokenFa)[0], 'Approve setup: the draft opens');
expect_same(200, $gdSave($gdBExam, $gdBS1['studentId'], 40.0, $gdTokenFa)[0], 'Approve setup: a score change succeeds');
[, $gdBSent] = $gdSend($gdBCs, $gdTokenFa);
$gdBBatchId = (int) ($gdBSent['batch']['batchId'] ?? 0);
expect_same('pending', $gdBSent['batch']['status'] ?? null, 'Approve setup: the batch is sent');
expect_same($gdBBefore, $gdGradeDb($gdBS1['enrollmentId']), 'Approve setup: the published grade is still the old one');
$gdBApproveAudit = $gsAuditCount('grade_change_approved', $gdBCs);
$gdBFacultyNotes = $gdNotes($gdFa);
$gdBFacultyMail = $gdMail($gdFa);
[$gdApproveStatus, $gdApprove] = $gdDecide('approve', $gdBBatchId, $adminAccessToken);
expect_same(200, $gdApproveStatus, 'Approve: 200 (' . json_encode($gdApprove) . ')');
expect_same('ok', $gdApprove['status'] ?? null, 'Approve: status ok');
$gdBAfter = $gdGradeDb($gdBS1['enrollmentId']);
expect_true($gdBAfter['final_gwa'] !== null && $gdBAfter['final_percentage'] !== null && $gdBAfter['final_percentage'] !== $gdBBefore['final_percentage'] && (float) $gdBAfter['final_percentage'] < (float) $gdBBefore['final_percentage'], 'Approve: enrollments holds the new, lower percentage (' . json_encode([$gdBBefore, $gdBAfter]) . ')');
expect_true($gdBAfter['final_gwa'] !== $gdBBefore['final_gwa'], 'Approve: enrollments holds the new grade');
$gdBStudentAfter = $gdStudentView($gdB, $gdBStudentToken);
expect_same((float) $gdBAfter['final_gwa'], (float) ($gdBStudentAfter['grade'] ?? -1), 'Approve: the Student view shows the new grade');
expect_true(($gdBStudentAfter['grade'] ?? null) !== ($gdBStudentBefore['grade'] ?? null), 'Approve: the Student grade differs from before');
expect_same('approved', (string) ($gdBatchRow($gdBBatchId)['status'] ?? ''), 'Approve: the batch is approved');
expect_true((bool) ($gdBatchRow($gdBBatchId)['has_changes'] ?? false), 'Approve: old and new values are kept in the batch');
$gdBColumns = $gsRows('SELECT grades_submitted_at, grades_grace_until FROM class_sections WHERE cs_id = ?', [$gdBCs])[0];
expect_true($gdBColumns['grades_submitted_at'] !== null && $gdBColumns['grades_grace_until'] === null, 'Approve: the class is submitted again with no new grace');
[, $gdBRead] = $gsFacultyGet($gdBCs, $gdTokenFa);
expect_true(($gdBRead['status'] ?? null) === 'submitted' && array_key_exists('graceUntil', $gdBRead) && $gdBRead['graceUntil'] === null, 'Approve: the Faculty read shows submitted with no grace');
expect_same(409, $gdSave($gdBExam, $gdBS1['studentId'], 55.0, $gdTokenFa)[0], 'Approve: the class is locked again');
expect_same($gdBApproveAudit + 1, $gsAuditCount('grade_change_approved', $gdBCs), 'Approve: one grade_change_approved audit row');
expect_true($gdNotes($gdFa) >= $gdBFacultyNotes + 1, 'Approve: the Faculty member gets an in-app notification');
expect_true($gdMail($gdFa) >= $gdBFacultyMail + 1, 'Approve: the Faculty member gets an email in the outbox');
[$gdAgainStatus, $gdAgain] = $gdDecide('approve', $gdBBatchId, $adminAccessToken);
expect_same(409, $gdAgainStatus, 'Approve again: 409');
expect_same('Only a pending request can be decided.', $gsMessage($gdAgain), 'Approve again: the message');
expect_same(409, $gdDecide('reject', $gdBBatchId, $adminAccessToken, ['reason' => 'Too late to reject'])[0], 'Reject after approve: 409');

// Race: sent, then pulled back, then the Dean approves.
expect_same(200, $gdOpen($gdBCs, $gdTokenFa)[0], 'Race setup: a new draft opens right after an approval (no grace)');
[, $gdRaceSent] = $gdSend($gdBCs, $gdTokenFa);
$gdRaceBatch = (int) ($gdRaceSent['batch']['batchId'] ?? 0);
expect_true($gdRaceBatch > 0 && $gdRaceBatch !== $gdBBatchId, 'Race setup: the new batch has its own id');
expect_same(200, $gdPullBack($gdBCs, $gdTokenFa)[0], 'Race setup: the Faculty pull it back');
[$gdRaceStatus, $gdRace] = $gdDecide('approve', $gdRaceBatch, $adminAccessToken);
expect_same(409, $gdRaceStatus, 'Race: the Dean approve of a pulled-back request is 409');
expect_same('This request was pulled back by the Faculty.', $gsMessage($gdRace), 'Race: the message');
expect_same('draft', (string) ($gdBatchRow($gdRaceBatch)['status'] ?? ''), 'Race: the batch is still a draft');
expect_same(200, $gdDiscard($gdBCs, $gdTokenFa)[0], 'Race cleanup: discard');

// ======== Flow C: discard restores scores and removes added assessments ========
$gdC = $gdFixture('C');
$gdCCs = $gdC['csId'];
$gdCS1 = $gdC['people']['One'];
$gdCExam = $gdC['assessments']['Final.Lecture.Exam'];
$gdExpire($gdCCs);
$gdCBefore = $gdGradeDb($gdCS1['enrollmentId']);
$gdCAssessmentCount = (int) $gsOne('SELECT count(*) FROM assessments WHERE cs_id = ?', [$gdCCs]);
$gdCDiscardAudit = $gsAuditCount('grade_change_discarded', $gdCCs);
expect_same(200, $gdOpen($gdCCs, $gdTokenFa)[0], 'Discard setup: the draft opens');
expect_same(200, $gdSave($gdCExam, $gdCS1['studentId'], 40.0, $gdTokenFa)[0], 'Discard setup: a score change succeeds');
[$gdAddStatus, $gdAdd] = integration_http_json('/api/faculty/assessments', $gdTokenFa, [[
    'classId' => (string) $gdCCs, 'title' => "Gd Added {$gdTag}", 'type' => 'Quiz', 'gradingPeriod' => 'Final', 'maxScore' => 20,
    'gradingCategoryId' => $gdCatIds['Final']['Lecture']['Quiz'],
]]);
expect_same(200, $gdAddStatus, 'Discard setup: an assessment can be added in the draft (' . json_encode($gdAdd) . ')');
expect_same($gdCAssessmentCount + 1, (int) $gsOne('SELECT count(*) FROM assessments WHERE cs_id = ?', [$gdCCs]), 'Discard setup: the added assessment exists');
$gdCBatchId = (int) ($gsFacultyGet($gdCCs, $gdTokenFa)[1]['batch']['batchId'] ?? 0);
[$gdDiscardStatus, $gdDiscarded] = $gdDiscard($gdCCs, $gdTokenFa);
expect_same(200, $gdDiscardStatus, 'Discard: 200 (' . json_encode($gdDiscarded) . ')');
expect_true(array_key_exists('batch', $gdDiscarded) && $gdDiscarded['batch'] === null,'Discard: the answer has no batch');
expect_same(90.0, $gdScoreDb($gdCExam, $gdCS1['studentId']), 'Discard: the score is restored');
expect_same($gdCAssessmentCount, (int) $gsOne('SELECT count(*) FROM assessments WHERE cs_id = ?', [$gdCCs]), 'Discard: the added assessment is gone');
expect_same(0, (int) $gsOne('SELECT count(*) FROM assessments WHERE cs_id = ? AND title = ?', [$gdCCs, "Gd Added {$gdTag}"]), 'Discard: no assessment with the added title remains');
expect_same($gdCBefore, $gdGradeDb($gdCS1['enrollmentId']), 'Discard: the published grade is unchanged');
expect_same('discarded', (string) ($gdBatchRow($gdCBatchId)['status'] ?? ''), 'Discard: the batch is discarded');
expect_same($gdCDiscardAudit + 1, $gsAuditCount('grade_change_discarded', $gdCCs), 'Discard: one grade_change_discarded audit row');
expect_same(409, $gdSave($gdCExam, $gdCS1['studentId'], 55.0, $gdTokenFa)[0], 'Discard: the class is locked again');
expect_true(array_key_exists('batch', $gsFacultyGet($gdCCs, $gdTokenFa)[1]) && $gsFacultyGet($gdCCs, $gdTokenFa)[1]['batch'] === null,'Discard: the Faculty read shows no batch');
