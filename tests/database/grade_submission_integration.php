<?php

declare(strict_types=1);

// Grade submission, slice 1 (docs/contracts/grade-submission.md, spec GRD-004): migration 071, the Faculty submit / withdraw
// endpoints, the submitted lock (rules 3-5, 8, 13), the term deadline (ACA-002) and the Dean's Grade Submissions list.
// Included by the full disposable PostgreSQL suite after superadmin_classes_integration.php, so it reuses $saAccount/$saPass,
// $groupedPayload, $groupedMembershipRows, $groupedCategoryIds, $groupedInsertAssessment, $groupedInsertScore,
// $adminAccessToken (the Dean), $superAccessToken, $sessionConfig and $sessionLocalTimezone. Every row it makes carries $gsTag.
// Written from the contract, not from the code. Slice 2 (drafts, batches, approve/reject) is not tested here.

$gsTag = 'gs' . strtolower(bin2hex(random_bytes(3)));
$gsLetters = strtr($gsTag, '0123456789', 'abcdefghij');
$gsYear = academic_current_school_year($pdo);
$gsPastYear = '2019-2020';
$gsRows = static function (string $sql, array $args = []) use ($pdo): array {
    $stmt = $pdo->prepare($sql);
    $stmt->execute($args);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
};
$gsOne = static function (string $sql, array $args = []) use ($gsRows): mixed {
    $rows = $gsRows($sql, $args);
    return $rows === [] ? null : array_values($rows[0])[0];
};
$gsLogin = static fn(string $email): string => (string) (integration_http_json('/api/auth/login', '', ['email' => $email, 'password' => $saPass])[1]['access_token'] ?? '');
$gsEmail = static fn(int $id): string => (string) $gsOne('SELECT login_email FROM user_accounts WHERE user_id = ?', [$id]);
$gsPath = '/api/faculty/classes/grade-submission';
$gsFacultyGet = static fn(int $csId, string $token): array => integration_http_get_json($gsPath . '?csId=' . $csId, $token);
$gsSubmit = static fn(int $csId, string $token): array => integration_http_json($gsPath, $token, ['csId' => $csId]);
$gsWithdraw = static fn(int $csId, string $token): array => integration_http_json($gsPath . '/withdraw', $token, ['csId' => $csId]);
$gsAuditCount = static fn(string $action, ?int $csId = null): int => (int) $gsOne(
    'SELECT count(*) FROM audit_events WHERE action_code = ?' . ($csId === null ? '' : ' AND scope_cs_id = ?'),
    $csId === null ? [$action] : [$action, $csId]
);
$gsColumns = static fn(int $csId): array => $gsRows('SELECT grades_submitted_at, grades_submitted_by, grades_grace_until FROM class_sections WHERE cs_id = ?', [$csId])[0] ?? [];
$gsMessage = static fn(array $body): string => (string) ($body['message'] ?? '');

// ---- Fixture: people, course, classes ----
$gsFa = $saAccount("gs-fa-{$gsTag}@bicol-u.edu.ph", 'faculty', "Gs Alpha {$gsLetters}");
$gsFb = $saAccount("gs-fb-{$gsTag}@bicol-u.edu.ph", 'faculty', "Gs Bravo {$gsLetters}");
$gsSecretary = $saAccount("gs-sec-{$gsTag}@bicol-u.edu.ph", 'secretary', "Gs Secretary {$gsLetters}", "GS-{$gsTag}-S");
$gsTokenFa = $gsLogin($gsEmail($gsFa));
$gsTokenFb = $gsLogin($gsEmail($gsFb));
$gsTokenSecretary = $gsLogin($gsEmail($gsSecretary));
expect_true($gsTokenFa !== '' && $gsTokenFb !== '' && $gsTokenSecretary !== '', 'Grade submission setup: every fixture account signs in');
$gsCourseInsert = $pdo->prepare("INSERT INTO courses (course_code, name, units, semester, grading_config) VALUES (?, ?, 3.0, '1ST', '{}'::jsonb) RETURNING course_id");
$gsCourseInsert->execute(["GSA{$gsTag}", "Gs Course {$gsTag}"]);
$gsCourse = (int) $gsCourseInsert->fetchColumn();
$gsClassInsert = $pdo->prepare('INSERT INTO class_sections (cs_name, course_id, instructor_user_id, semester, school_year, status) VALUES (?, ?, ?, ?, ?, ?) RETURNING cs_id');
$gsMakeClass = static function (string $section, ?int $facultyId = null, ?string $year = null) use ($gsClassInsert, $gsCourse, $gsFa, $gsYear, $gsTag): int {
    $gsClassInsert->execute(["GS-{$section}-{$gsTag}", $gsCourse, $facultyId ?? $gsFa, '1ST', $year ?? $gsYear, 'Active']);
    return (int) $gsClassInsert->fetchColumn();
};
$gsStudent = static function (string $label, int $csId) use ($pdo, $gsTag): array {
    $number = "GS-{$gsTag}-{$label}";
    $stmt = $pdo->prepare("INSERT INTO students (student_number, first_name, last_name, bu_email, status, admission_date) VALUES (?, 'Gs', ?, ?, 'active', CURRENT_DATE) RETURNING student_id");
    $stmt->execute([$number, $label, 'gs.' . strtolower($label) . ".{$gsTag}@bicol-u.edu.ph"]);
    $studentId = (int) $stmt->fetchColumn();
    $enroll = $pdo->prepare("INSERT INTO enrollments (student_id, cs_id, status, date_enrolled) VALUES (?, ?, 'Active', CURRENT_DATE) RETURNING enrollment_id");
    $enroll->execute([$studentId, $csId]);
    return ['studentId' => $studentId, 'enrollmentId' => (int) $enroll->fetchColumn(), 'number' => $number];
};
$gsG1 = $gsMakeClass('G1');   // main flow: submit, locks, weights, scheduled session, withdraw
$gsG2 = $gsMakeClass('G2');   // second section of the same course and term (shared weights); stays unsubmitted until the weights test
$gsG4 = $gsMakeClass('G4');   // grace ended, archive
$gsG5 = $gsMakeClass('G5');   // the unique-index check
$gsS1 = $gsStudent('One', $gsG1);
$gsS2 = $gsStudent('Two', $gsG1);   // has a missing score
$gsS3 = $gsStudent('Three', $gsG2);
$pdo->prepare('UPDATE class_sections SET secretary_user_id = ? WHERE cs_id IN (?, ?)')->execute([$gsSecretary, $gsG1, $gsG2]);

// Grade weights for FA's offering (course + current year), shared by G1 and G2.
$gsOffering = ['courseId' => $gsCourse, 'schoolYear' => $gsYear];
[$gsCfgStatus, $gsCfgBody] = integration_http_put_json('/api/faculty/grading-config', $gsTokenFa, $groupedPayload($gsOffering));
expect_same(201, $gsCfgStatus, 'Grade submission setup: FA saves grade weights (' . json_encode($gsCfgBody) . ')');
$gsConfigId = (int) ($gsCfgBody['configuration']['id'] ?? 0);
$gsConfigVersion = (int) ($gsCfgBody['configuration']['version'] ?? 1);
$gsCatIds = $groupedCategoryIds($groupedMembershipRows($gsConfigId));
$gsAssessment = $groupedInsertAssessment($gsG1, $gsCatIds['Midterm']['Lecture']['Quiz'], "Gs Quiz {$gsTag}", 'Midterm');
$gsAssessment2 = $groupedInsertAssessment($gsG1, $gsCatIds['Midterm']['Lecture']['Exam'], "Gs Exam {$gsTag}", 'Midterm');
$groupedInsertScore($gsAssessment, $gsS1['studentId'], 80.0);
$groupedInsertScore($gsAssessment2, $gsS1['studentId'], 70.0);
$groupedInsertScore($gsAssessment, $gsS2['studentId'], 50.0); // S2 has no score for the Exam: a missing score
$gsLockedWeights = static fn(): array => integration_http_put_json('/api/faculty/grading-config', $gsTokenFa, $groupedPayload($gsOffering, $gsCatIds) + ['id' => $gsConfigId, 'version' => $gsConfigVersion]);
// Secretary fixtures: an ended session in each section for the attendance-request checks.
$gsEndedSession = $pdo->prepare("INSERT INTO attendance_sessions (cs_id, secretary_user_id, owner_user_id, session_date, session_code, status, ended_at) VALUES (?, ?, ?, CURRENT_DATE - 3, ?, 'ended', CURRENT_TIMESTAMP(6)) RETURNING session_id");
$gsEndedSession->execute([$gsG1, $gsSecretary, $gsSecretary, "GS-E1-{$gsTag}"]);
$gsEndedG1 = (int) $gsEndedSession->fetchColumn();
$gsEndedSession->execute([$gsG2, $gsSecretary, $gsSecretary, "GS-E2-{$gsTag}"]);
$gsEndedG2 = (int) $gsEndedSession->fetchColumn();

// ---- 1. Migration 071 ----
foreach ([['academic_terms', 'grade_deadline'], ['class_sections', 'grades_submitted_at'], ['class_sections', 'grades_submitted_by'], ['class_sections', 'grades_grace_until']] as [$gsTable, $gsColumn]) {
    expect_same(1, (int) $gsOne('SELECT count(*) FROM information_schema.columns WHERE table_name = ? AND column_name = ?', [$gsTable, $gsColumn]), "Migration 071: {$gsTable}.{$gsColumn} exists");
}
foreach (['batch_id', 'cs_id', 'faculty_user_id', 'status', 'reason', 'created_at', 'sent_at', 'decided_at', 'decided_by_user_id', 'decision_reason', 'snapshot', 'draft_results', 'changes'] as $gsColumn) {
    expect_same(1, (int) $gsOne("SELECT count(*) FROM information_schema.columns WHERE table_name = 'grade_change_batches' AND column_name = ?", [$gsColumn]), "Migration 071: grade_change_batches.{$gsColumn} exists");
}
expect_true((bool) $pdo->query("SELECT has_table_privilege(current_user, 'grade_change_batches', 'SELECT,INSERT,UPDATE,DELETE')")->fetchColumn(), 'Migration 071 grants grade_change_batches to the application role');
expect_true((bool) $pdo->query("SELECT has_sequence_privilege(current_user, pg_get_serial_sequence('grade_change_batches', 'batch_id'), 'USAGE')")->fetchColumn(), 'Migration 071 grants the batch identity sequence');
// At most one draft or pending batch per class (insert directly; slice 2 owns the endpoints).
$gsBatchInsert = $pdo->prepare("INSERT INTO grade_change_batches (cs_id, faculty_user_id, status) VALUES (?, ?, 'draft')");
$gsBatchInsert->execute([$gsG5, $gsFa]);
$gsSecondDraft = null;
try {
    $gsBatchInsert->execute([$gsG5, $gsFa]);
    $gsSecondDraft = 'inserted';
} catch (PDOException $e) {
    $gsSecondDraft = $e->getCode();
}
expect_same('23505', $gsSecondDraft, 'Migration 071: a second draft batch for the same class violates the partial unique index');
$pdo->prepare("UPDATE grade_change_batches SET status = 'pending' WHERE cs_id = ?")->execute([$gsG5]);
try {
    $gsBatchInsert->execute([$gsG5, $gsFa]);
    $gsSecondDraft = 'inserted';
} catch (PDOException $e) {
    $gsSecondDraft = $e->getCode();
}
expect_same('23505', $gsSecondDraft, 'Migration 071: a draft next to a pending batch is refused too');
$pdo->prepare('DELETE FROM grade_change_batches WHERE cs_id = ?')->execute([$gsG5]);

// ---- 2. Faculty endpoints: access ----
expect_same(401, integration_http_get_json($gsPath . '?csId=' . $gsG1, '')[0], 'Grade submission: GET needs a token');
expect_same(401, integration_http_json($gsPath, '', ['csId' => $gsG1])[0], 'Grade submission: POST needs a token');
expect_same(401, integration_http_json($gsPath . '/withdraw', '', ['csId' => $gsG1])[0], 'Grade submission: withdraw needs a token');
expect_same(403, $gsFacultyGet($gsG1, $gsTokenFb)[0], "Grade submission: another Faculty member's class is 403 on GET");
expect_same(403, $gsSubmit($gsG1, $gsTokenFb)[0], "Grade submission: another Faculty member's class is 403 on submit");
expect_same(403, $gsWithdraw($gsG1, $gsTokenFb)[0], "Grade submission: another Faculty member's class is 403 on withdraw");
expect_same(null, $gsColumns($gsG1)['grades_submitted_at'], 'Grade submission: a refused submit by another Faculty member changed nothing');
[$gsReadStatus, $gsRead] = $gsFacultyGet($gsG1, $gsTokenFa);
expect_same(200, $gsReadStatus, 'Grade submission: Faculty read their own class');
expect_true(($gsRead['status'] ?? 'submitted') !== 'submitted' && array_key_exists('submittedAt', $gsRead) && $gsRead['submittedAt'] === null && array_key_exists('graceUntil', $gsRead) && $gsRead['graceUntil'] === null, 'Grade submission: a new class is not submitted');
expect_true(array_key_exists('deadlineStatus', $gsRead) && array_key_exists('deadline', $gsRead) && array_key_exists('batch', $gsRead) && $gsRead['batch'] === null, 'Grade submission: the object carries deadlineStatus, deadline and batch null');
$gsMissingNumbers = array_column($gsRead['missing'] ?? [], 'studentNumber');
expect_true(in_array($gsS2['number'], $gsMissingNumbers, true) && !in_array($gsS1['number'], $gsMissingNumbers, true), 'Grade submission: missing lists the Student with a missing score and not the complete one');
$gsMissingS2 = array_values(array_filter($gsRead['missing'] ?? [], static fn(array $m): bool => ($m['studentNumber'] ?? '') === $gsS2['number']))[0] ?? [];
expect_true((int) ($gsMissingS2['missingCount'] ?? 0) >= 1 && ($gsMissingS2['name'] ?? '') !== '', 'Grade submission: a missing entry has a name and a missingCount');

// Controls before the lock: a score save and a Secretary request in an unsubmitted class work.
$gsSavePayload = static fn(float $score): array => ['assessmentId' => (string) $gsAssessment, 'scores' => [['studentId' => (string) $gsS1['studentId'], 'score' => $score, 'remarks' => 'Grouped grading integration fixture']]];
expect_same(200, integration_http_json('/api/faculty/scores', $gsTokenFa, $gsSavePayload(81.0))[0], 'Lock control: a score save works before submitting');
$gsSecretaryAsk = static fn(int $studentId, int $sessionId, string $token): array => integration_http_json('/api/secretary/attendance/override', $token, ['studentId' => (string) $studentId, 'sessionId' => (string) $sessionId, 'status' => 'present']);
$gsStudentG2 = $gsS3['studentId'];
expect_true(in_array($gsSecretaryAsk($gsStudentG2, $gsEndedG2, $gsTokenSecretary)[0], [200, 201], true), 'Lock control: a Secretary attendance request works in an unsubmitted class');

// ---- 3. Submit is refused while an attendance session is open ----
$pdo->prepare("INSERT INTO attendance_sessions (cs_id, secretary_user_id, owner_user_id, session_date, session_code, status) VALUES (?, ?, ?, CURRENT_DATE, ?, 'active')")->execute([$gsG1, $gsSecretary, $gsSecretary, "GS-OPEN-{$gsTag}"]);
[$gsOpenStatus, $gsOpenBody] = $gsSubmit($gsG1, $gsTokenFa);
expect_same(409, $gsOpenStatus, 'Submit: refused while a session of the class is open');
expect_true(str_starts_with($gsMessage($gsOpenBody), 'End the open attendance session first.'), 'Submit: the open-session message (' . $gsMessage($gsOpenBody) . ')');
expect_same(null, $gsColumns($gsG1)['grades_submitted_at'], 'Submit: the refused submit changed nothing');
$pdo->prepare("UPDATE attendance_sessions SET status = 'ended', ended_at = CURRENT_TIMESTAMP(6) WHERE session_code = ?")->execute(["GS-OPEN-{$gsTag}"]);

// A scheduled session of G1 for the rule-5 check; booked on the day other suites open sessions.
$gsSessionDate = (new DateTimeImmutable('now', $sessionLocalTimezone))->modify('+3 days')->format('Y-m-d');
$pdo->prepare("INSERT INTO attendance_sessions (cs_id, secretary_user_id, owner_user_id, session_date, session_code, status, opening_time, present_cutoff_time, late_cutoff_time, class_end_time, created_by_role) VALUES (?, ?, ?, ?, ?, 'scheduled', '08:00', '08:15', '08:30', '09:30', 'faculty')")
    ->execute([$gsG1, $gsSecretary, $gsFa, $gsSessionDate, "GS-SCHED-{$gsTag}"]);
$gsSessionStatus = static fn(): string => (string) $gsOne('SELECT status FROM attendance_sessions WHERE session_code = ?', ["GS-SCHED-{$gsTag}"]);

// ---- 4. Submit ----
$gsAuditBefore = $gsAuditCount('grades_submitted', $gsG1);
[$gsSubStatus, $gsSub] = $gsSubmit($gsG1, $gsTokenFa);
expect_same(200, $gsSubStatus, 'Submit: 200 (' . json_encode($gsSub) . ')');
expect_same('submitted', $gsSub['status'] ?? null, 'Submit: status is submitted');
$gsAt = strtotime((string) ($gsSub['submittedAt'] ?? ''));
$gsUntil = strtotime((string) ($gsSub['graceUntil'] ?? ''));
expect_true($gsAt !== false && $gsUntil !== false && abs(($gsUntil - $gsAt) - 86400) <= 5, 'Submit: graceUntil is submittedAt + 24 hours');
expect_true($gsAt !== false && abs($gsAt - time()) <= 120, 'Submit: submittedAt is now');
$gsDb = $gsColumns($gsG1);
expect_true($gsDb['grades_submitted_at'] !== null && (int) $gsDb['grades_submitted_by'] === $gsFa && $gsDb['grades_grace_until'] !== null, 'Submit: the class columns are set and name the Faculty member');
expect_true((float) $gsOne('SELECT EXTRACT(EPOCH FROM grades_grace_until - grades_submitted_at) FROM class_sections WHERE cs_id = ?', [$gsG1]) === 86400.0, 'Submit: the stored grace is 24 hours');
expect_same($gsAuditBefore + 1, $gsAuditCount('grades_submitted', $gsG1), 'Submit: one grades_submitted audit row');
[$gsAgainStatus, $gsAgain] = $gsSubmit($gsG1, $gsTokenFa);
expect_same(409, $gsAgainStatus, 'Submit again: 409');
expect_same('Grades are already submitted.', $gsMessage($gsAgain), 'Submit again: the message');
expect_same($gsAuditBefore + 1, $gsAuditCount('grades_submitted', $gsG1), 'Submit again: no second audit row');
[, $gsReadAfter] = $gsFacultyGet($gsG1, $gsTokenFa);
expect_same('submitted', $gsReadAfter['status'] ?? null, 'Read after submit: status is submitted');

// ---- 5. The submitted lock (rule 3, Q23, rule 13) ----
$gsScoreBefore = $gsOne('SELECT score FROM assessment_scores WHERE assessment_id = ? AND student_id = ?', [$gsAssessment, $gsS1['studentId']]);
[$gsLockScoreStatus, $gsLockScore] = integration_http_json('/api/faculty/scores', $gsTokenFa, $gsSavePayload(33.0));
expect_same(409, $gsLockScoreStatus, 'Lock: a score save is refused');
expect_true(str_contains($gsMessage($gsLockScore), 'Grades for this class are submitted'), 'Lock: the score refusal says the grades are submitted (' . $gsMessage($gsLockScore) . ')');
expect_same($gsScoreBefore, $gsOne('SELECT score FROM assessment_scores WHERE assessment_id = ? AND student_id = ?', [$gsAssessment, $gsS1['studentId']]), 'Lock: the refused score save changed nothing');
[$gsLockEditStatus, $gsLockEdit] = integration_http_json('/api/faculty/classes/update', $gsTokenFa, ['csId' => $gsG1, 'block' => 'Locked']);
expect_same(409, $gsLockEditStatus, 'Lock: a class edit is refused');
expect_true(str_contains($gsMessage($gsLockEdit), 'Grades for this class are submitted'), 'Lock: the class edit refusal says the grades are submitted (' . $gsMessage($gsLockEdit) . ')');
[$gsLockRosterStatus] = integration_http_json('/api/faculty/classes/unenroll', $gsTokenFa, ['csId' => (string) $gsG1, 'studentId' => (string) $gsS2['studentId']]);
expect_same(409, $gsLockRosterStatus, 'Lock: removing a Student is refused');
expect_same('Active', $gsOne('SELECT status FROM enrollments WHERE enrollment_id = ?', [$gsS2['enrollmentId']]), 'Lock: the refused roster change changed nothing');
[$gsLockSecStatus, $gsLockSec] = $gsSecretaryAsk($gsS1['studentId'], $gsEndedG1, $gsTokenSecretary);
expect_same(409, $gsLockSecStatus, 'Lock: a Secretary attendance request is refused');
expect_same('Grades for this class are submitted. Ask your Faculty.', $gsMessage($gsLockSec), 'Lock: the Secretary refusal message');
expect_same(0, (int) $gsOne('SELECT count(*) FROM attendance_records WHERE enrollment_id = ? AND attendance_session_id = ?', [$gsS1['enrollmentId'], $gsEndedG1]), 'Lock: the refused Secretary request wrote no record');

// ---- 6. Grade weights (rule 4, Q25) ----
[$gsWeightsStatus, $gsWeights] = $gsLockedWeights();
expect_same(409, $gsWeightsStatus, 'Weights: saving is refused while a section of the offering is submitted');
expect_true(str_contains(json_encode($gsWeights), 'weights are locked'), 'Weights: the message says the weights are locked (' . json_encode($gsWeights) . ')');
expect_same(null, $gsColumns($gsG2)['grades_submitted_at'], 'Weights: the other section is itself not submitted (the lock follows the offering)');

// ---- 7. Sessions (rule 5, Q26) ----
attendance_sessions_open_due($pdo, $sessionConfig, attendance_session_request_context(), new DateTimeImmutable($gsSessionDate . ' 08:05:00', $sessionLocalTimezone));
expect_same('scheduled', $gsSessionStatus(), 'Session: a scheduled session of a submitted class does not open at its time and is not revoked');

// ---- 8. Withdraw within the grace ----
$gsWithdrawAudit = $gsAuditCount('grades_withdrawn', $gsG1);
[$gsWdStatus, $gsWd] = $gsWithdraw($gsG1, $gsTokenFa);
expect_same(200, $gsWdStatus, 'Withdraw: 200 within the grace (' . json_encode($gsWd) . ')');
expect_true(($gsWd['status'] ?? 'submitted') !== 'submitted' && array_key_exists('submittedAt', $gsWd) && $gsWd['submittedAt'] === null && array_key_exists('graceUntil', $gsWd) && $gsWd['graceUntil'] === null, 'Withdraw: the answer is not submitted and carries no dates');
$gsDb = $gsColumns($gsG1);
expect_true($gsDb['grades_submitted_at'] === null && $gsDb['grades_submitted_by'] === null && $gsDb['grades_grace_until'] === null, 'Withdraw: the class columns are cleared');
expect_same($gsWithdrawAudit + 1, $gsAuditCount('grades_withdrawn', $gsG1), 'Withdraw: one grades_withdrawn audit row');
[$gsWdAgainStatus, $gsWdAgain] = $gsWithdraw($gsG1, $gsTokenFa);
expect_same(409, $gsWdAgainStatus, 'Withdraw again: 409');
expect_same('Grades for this class are not submitted.', $gsMessage($gsWdAgain), 'Withdraw again: the message');
expect_same(200, integration_http_json('/api/faculty/scores', $gsTokenFa, $gsSavePayload(82.0))[0], 'Withdraw: the class is editable again');
[$gsWeightsOkStatus] = $gsLockedWeights();
expect_true(in_array($gsWeightsOkStatus, [200, 201], true), 'Weights: saving works again after the withdraw (got ' . $gsWeightsOkStatus . ')');
// A withdrawn class opens its waiting session normally.
attendance_sessions_open_due($pdo, $sessionConfig, attendance_session_request_context(), new DateTimeImmutable($gsSessionDate . ' 08:05:00', $sessionLocalTimezone));
expect_same('active', $gsSessionStatus(), 'Session: after the withdraw the scheduled session opens normally');
$pdo->prepare("UPDATE attendance_sessions SET status = 'ended', ended_at = CURRENT_TIMESTAMP(6) WHERE session_code = ?")->execute(["GS-SCHED-{$gsTag}"]);
// Resubmit gets a fresh grace.
[$gsReSubStatus, $gsReSub] = $gsSubmit($gsG1, $gsTokenFa);
expect_same(200, $gsReSubStatus, 'Resubmit after a withdraw is allowed');
expect_same(2, $gsAuditCount('grades_submitted', $gsG1), 'Resubmit: a second grades_submitted audit row');

// ---- 9. Withdraw after the grace, archive (rule 8) ----
[$gsArchiveEarlyStatus] = integration_http_json('/api/faculty/classes/archive', $gsTokenFa, ['csId' => $gsG4, 'reason' => 'finished']);
expect_same(409, $gsArchiveEarlyStatus, 'Archive: Finished is refused while the grades are not submitted');
expect_same(null, $gsOne('SELECT archive_reason FROM class_sections WHERE cs_id = ?', [$gsG4]), 'Archive: the refused archive changed nothing');
expect_same(200, $gsSubmit($gsG4, $gsTokenFa)[0], 'Archive setup: G4 submits');
$pdo->prepare("UPDATE class_sections SET grades_grace_until = CURRENT_TIMESTAMP - INTERVAL '1 hour' WHERE cs_id = ?")->execute([$gsG4]);
$gsG4Columns = $gsColumns($gsG4);
[$gsLateWdStatus, $gsLateWd] = $gsWithdraw($gsG4, $gsTokenFa);
expect_same(409, $gsLateWdStatus, 'Withdraw after the grace: 409');
expect_true(str_starts_with($gsMessage($gsLateWd), 'The withdraw period ended at'), 'Withdraw after the grace: the message (' . $gsMessage($gsLateWd) . ')');
expect_same($gsG4Columns, $gsColumns($gsG4), 'Withdraw after the grace: nothing changed');
expect_same(0, $gsAuditCount('grades_withdrawn', $gsG4), 'Withdraw after the grace: no audit row');
[$gsArchiveStatus] = integration_http_json('/api/faculty/classes/archive', $gsTokenFa, ['csId' => $gsG4, 'reason' => 'finished']);
expect_same(200, $gsArchiveStatus, 'Archive: Finished works once the grades are submitted');
[$gsRestoreStatus] = integration_http_json('/api/faculty/classes/restore', $gsTokenFa, ['csId' => $gsG4]);
expect_same(200, $gsRestoreStatus, 'Archive: a Finished class can be restored');
$gsRestored = $gsColumns($gsG4);
expect_true($gsRestored['grades_submitted_at'] !== null && $gsRestored['grades_submitted_at'] === $gsG4Columns['grades_submitted_at'], 'Restore: the class keeps its submission');
// Cancelled and Created by mistake may be archived any time.
$gsG6 = $gsMakeClass('G6');
[$gsCancelStatus] = integration_http_json('/api/faculty/classes/archive', $gsTokenFa, ['csId' => $gsG6, 'reason' => 'cancelled']);
expect_same(200, $gsCancelStatus, 'Archive: Cancelled needs no submission');

// ---- 10. Past school year (Q23) and the term deadline (ACA-002) ----
$gsTermPayload = ['schoolYear' => $gsPastYear, 'semester' => '1ST', 'startDate' => '2019-08-01', 'endDate' => '2019-12-31'];
[$gsTermStatus, $gsTerm] = integration_http_json('/api/admin/academic-terms', $superAccessToken, $gsTermPayload);
expect_same(200, $gsTermStatus, 'Deadline setup: the past-year term is created');
$gsTermId = (int) ($gsTerm['id'] ?? 0);
$gsL1 = $gsMakeClass('L1', null, $gsPastYear);  // not submitted
$gsL2 = $gsMakeClass('L2', null, $gsPastYear);  // submitted after the deadline
$gsL3 = $gsMakeClass('L3', null, $gsPastYear);  // cancelled
$gsL4 = $gsMakeClass('L4', null, $gsPastYear);  // created by mistake
$pdo->prepare("UPDATE class_sections SET archive_reason = 'cancelled', archived_at = CURRENT_TIMESTAMP(6) WHERE cs_id = ?")->execute([$gsL3]);
$pdo->prepare("UPDATE class_sections SET archive_reason = 'mistake', archived_at = CURRENT_TIMESTAMP(6) WHERE cs_id = ?")->execute([$gsL4]);
// An unsubmitted past-year class stays editable; a submitted one is view-only.
[$gsPastEditStatus] = integration_http_json('/api/faculty/classes/update', $gsTokenFa, ['csId' => $gsL1, 'block' => 'PastEdit']);
expect_same(200, $gsPastEditStatus, 'Past year: an unsubmitted class is still editable');
expect_same(200, $gsSubmit($gsL2, $gsTokenFa)[0], 'Past year: an unsubmitted class can be submitted');
[$gsPastLockStatus, $gsPastLock] = integration_http_json('/api/faculty/classes/update', $gsTokenFa, ['csId' => $gsL2, 'block' => 'PastLocked']);
expect_same(409, $gsPastLockStatus, 'Past year: a submitted class is view-only');
expect_true(str_contains($gsMessage($gsPastLock), 'Grades for this class are submitted'), 'Past year: the view-only message (' . $gsMessage($gsPastLock) . ')');

// Dean list: access.
$gsList = static fn(string $query, string $token): array => integration_http_get_json('/api/admin/grade-submissions' . $query, $token);
$gsListPath = "?termId={$gsTermId}&courseId={$gsCourse}";
expect_same(401, $gsList($gsListPath, '')[0], 'Dean list: needs a token');
expect_same(403, $gsList($gsListPath, $gsTokenFa)[0], 'Dean list: Faculty get 403');
expect_same(403, $gsList($gsListPath, $gsTokenSecretary)[0], 'Dean list: a Secretary gets 403');
expect_same(200, $gsList($gsListPath, $adminAccessToken)[0], 'Dean list: the Dean reads it');
expect_same(200, $gsList($gsListPath, $superAccessToken)[0], 'Dean list: the Superadmin reads it');
// Default deadline is the term end + 14 days, so the 2019 term is long past.
[, $gsDeanList] = $gsList($gsListPath, $adminAccessToken);
$gsListed = array_column($gsDeanList['classes'] ?? [], null, 'csId');
expect_true(isset($gsListed[$gsL1], $gsListed[$gsL2]) && !isset($gsListed[$gsL3]) && !isset($gsListed[$gsL4]), 'Dean list: Cancelled and Created-by-mistake classes are excluded');
expect_same('late', $gsListed[$gsL1]['deadlineStatus'] ?? null, 'Dean list: a class not submitted past the deadline is late');
expect_same('submitted_late', $gsListed[$gsL2]['deadlineStatus'] ?? null, 'Dean list: a class submitted after the deadline is submitted late');
expect_true(str_starts_with((string) ($gsListed[$gsL1]['deadline'] ?? ''), '2020-01-14'), 'Dean list: the default deadline is the term end plus 14 days (' . ($gsListed[$gsL1]['deadline'] ?? '') . ')');
expect_true(($gsListed[$gsL2]['submittedAt'] ?? null) !== null && array_key_exists('submittedAt', $gsListed[$gsL1] ?? []) && $gsListed[$gsL1]['submittedAt'] === null, 'Dean list: submittedAt is set only on the submitted class');

// Deadline validation and save.
$gsDeadlineAudit = $gsAuditCount('grade_deadline_changed');
[$gsBadDeadlineStatus, $gsBadDeadline] = integration_http_json('/api/admin/academic-terms', $superAccessToken, array_merge($gsTermPayload, ['id' => $gsTermId, 'gradeDeadline' => '2019-12-30']));
expect_same(422, $gsBadDeadlineStatus, 'Deadline: a date before the term end is 422');
expect_true(str_contains(json_encode($gsBadDeadline), 'The deadline must be on or after the term end'), 'Deadline: the message (' . json_encode($gsBadDeadline) . ')');
expect_same(null, $gsOne('SELECT grade_deadline FROM academic_terms WHERE id = ?', [$gsTermId]), 'Deadline: the refused save changed nothing');
expect_same($gsDeadlineAudit, $gsAuditCount('grade_deadline_changed'), 'Deadline: the refused save wrote no audit row');
[$gsDeadlineStatus] = integration_http_json('/api/admin/academic-terms', $superAccessToken, array_merge($gsTermPayload, ['id' => $gsTermId, 'gradeDeadline' => '2099-12-31']));
expect_same(200, $gsDeadlineStatus, 'Deadline: a date on or after the term end saves');
expect_same('2099-12-31', $gsOne('SELECT grade_deadline::text FROM academic_terms WHERE id = ?', [$gsTermId]), 'Deadline: the date is stored');
[, $gsTermList] = integration_http_get_json('/api/admin/academic-terms', $superAccessToken);
$gsTermRow = array_values(array_filter($gsTermList['terms'] ?? [], static fn(array $t): bool => (int) ($t['id'] ?? 0) === $gsTermId))[0] ?? [];
expect_true(str_starts_with((string) ($gsTermRow['gradeDeadline'] ?? ''), '2099-12-31'), 'Deadline: the term list returns gradeDeadline (' . json_encode($gsTermRow) . ')');
expect_same($gsDeadlineAudit + 1, $gsAuditCount('grade_deadline_changed'), 'Deadline: one grade_deadline_changed audit row');
// The status follows the current deadline on every read.
[, $gsDeanList2] = $gsList($gsListPath, $adminAccessToken);
$gsListed2 = array_column($gsDeanList2['classes'] ?? [], null, 'csId');
expect_true(($gsListed2[$gsL1]['deadlineStatus'] ?? 'late') !== 'late', 'Dean list: moving the deadline into the future clears Late');
expect_same('submitted', $gsListed2[$gsL2]['deadlineStatus'] ?? null, 'Dean list: a submission before the new deadline is plain submitted');
expect_same(200, integration_http_json('/api/admin/academic-terms', $superAccessToken, array_merge($gsTermPayload, ['id' => $gsTermId, 'gradeDeadline' => '2099-12-31']))[0], 'Deadline: saving the same date again is accepted');
expect_same($gsDeadlineAudit + 1, $gsAuditCount('grade_deadline_changed'), 'Deadline: an unchanged deadline writes no new audit row');
