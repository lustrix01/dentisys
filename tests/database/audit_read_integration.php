<?php

declare(strict_types=1);

// Audit read side (docs/contracts/audit-logging.md sections 3-4, R12/R13).
// Included by the full disposable PostgreSQL suite after the Faculty and Dean
// logins exist. Rows are written through the real audit writer, so the chain
// stays valid; they are tagged so every check is scoped to this scenario.
$readKey = base64_decode(getenv('AUDIT_MAC_KEY_B64') ?: 'ZGVudGlzeXMtZGV2LWF1ZGl0LW1hYy1rZXktMzJiaXQ=', true);
$readTag = 'ardtag' . strtolower(bin2hex(random_bytes(3)));
$readUser = static function (string $email) use ($pdo): array {
    $stmt = $pdo->prepare('SELECT user_id, login_email, role, display_name FROM user_accounts WHERE login_email = ?');
    $stmt->execute([$email]);
    return $stmt->fetch(PDO::FETCH_ASSOC);
};
$readFaculty = $readUser('faculty@bicol-u.edu.ph');
$readDean = $readUser('admin@bicol-u.edu.ph');
$readWrite = static function (?array $actor, string $module, string $code, string $status, string $description, array $extra = []) use ($pdo, $readKey): void {
    $pdo->beginTransaction();
    audit_finish_operation($pdo, audit_begin_operation($pdo), [
        'module_code' => $module, 'action_code' => $code, 'event_status' => $status,
        'actor_user_id' => $actor['user_id'] ?? null, 'actor_username' => $actor['login_email'] ?? null,
        'actor_role' => $actor['role'] ?? null, 'actor_display_name' => $actor['display_name'] ?? null,
        'target_type' => $extra['target_type'] ?? null, 'target_id' => $extra['target_id'] ?? null,
        'scope_cs_id' => $extra['scope_cs_id'] ?? null, 'operation_uuid' => $extra['operation_uuid'] ?? null,
        'description' => $description,
    ], $readKey, $extra['before'] ?? null, $extra['after'] ?? null);
    $pdo->commit();
};
$readClassStmt = $pdo->prepare('SELECT cs_id FROM class_sections WHERE instructor_user_id = ? ORDER BY cs_id LIMIT 1');
$readClassStmt->execute([(int) $readFaculty['user_id']]);
$readOwnClass = (int) $readClassStmt->fetchColumn();
$readOtherStmt = $pdo->prepare('SELECT cs_id FROM class_sections WHERE instructor_user_id <> ? ORDER BY cs_id LIMIT 1');
$readOtherStmt->execute([(int) $readFaculty['user_id']]);
$readOtherClass = (int) $readOtherStmt->fetchColumn();
expect_true($readOwnClass > 0, 'The audit read scenario has a Faculty class');

// The oldest row, then 105 newer ones, so the oldest is beyond "the newest 100".
$readWrite($readFaculty, 'class_management', 'class_update', 'Success', "Old {$readTag} marker", ['scope_cs_id' => $readOwnClass, 'target_type' => 'class_section', 'target_id' => (string) $readOwnClass]);
for ($i = 1; $i <= 105; $i++) {
    $readWrite($readFaculty, 'class_management', 'class_update', 'Success', "Filler {$i} {$readTag}", ['target_type' => 'class_section', 'target_id' => (string) $readOwnClass]);
}
$readWrite($readFaculty, 'grading', 'assessment_scores_saved', 'Success', "Changed scores {$readTag}", [
    'target_type' => 'assessment', 'target_id' => '987654', 'scope_cs_id' => $readOwnClass,
    'after' => ['changes' => [['studentId' => '1', 'studentNumber' => '2020-1', 'studentName' => 'Ann Cruz', 'assessmentId' => '987654', 'assessment' => 'Quiz 2', 'field' => 'score', 'before' => '7', 'after' => '9']], 'gradeChanges' => []],
]);
$readBatch = uuid_v4_string();
for ($i = 1; $i <= 3; $i++) {
    $readWrite($readFaculty, 'class_management', 'student_enroll', 'Success', "Enrolled {$readTag} student {$i}", ['operation_uuid' => $readBatch, 'scope_cs_id' => $readOwnClass, 'target_type' => 'class_section', 'target_id' => (string) $readOwnClass]);
}
$readWrite($readFaculty, 'auth', 'login_success', 'Success', "Faculty sign-in {$readTag}", ['target_type' => 'user_account', 'target_id' => (string) $readFaculty['user_id']]);
$readWrite($readDean, 'auth', 'login_success', 'Success', "Dean sign-in {$readTag}", ['target_type' => 'user_account', 'target_id' => (string) $readDean['user_id']]);
$readWrite(null, 'auth', 'login_failed', 'Failed', "Password sign-in failed for {$readTag}@example.test: wrong password.");
$readWrite($readFaculty, 'auth', 'refresh_rotation', 'Success', "Rotation {$readTag}");

$readGet = static function (string $path, string $token) use ($readTag): array {
    return integration_http_get_json($path, $token);
};
$readWhat = static fn(array $body): array => array_column($body['entries'] ?? [], 'what');

// Dean: overview only. Never class work or other people's successful sign-ins; failures and his own (behind the chip) yes.
[$deanReadStatus, $deanRead] = $readGet('/api/admin/audit-logs?q=' . rawurlencode($readTag), $adminAccessToken);
expect_same(200, $deanReadStatus, 'Dean audit read loads');
expect_true(!in_array('Scores changed', $readWhat($deanRead), true), 'Dean never sees class-work rows');
expect_true(!in_array('Signed in', $readWhat($deanRead), true), 'Dean sees no successful sign-ins without the Sign-ins filter');
expect_true(in_array('Sign-in failed', $readWhat($deanRead), true), 'Dean sees failed sign-ins');
$readFailed = array_values(array_filter($deanRead['entries'], static fn(array $e): bool => $e['what'] === 'Sign-in failed'))[0];
expect_same("Unknown account (typed: {$readTag}@example.test)", $readFailed['whoText'] ?? null, 'A failed sign-in with no account shows the typed email');
expect_true(($deanRead['attention']['failedSignIns'] ?? 0) >= 1, 'Dean attention counts failed sign-ins');
[, $deanSignins] = $readGet('/api/admin/audit-logs?signins=1&q=' . rawurlencode($readTag), $adminAccessToken);
$readSignedIn = array_values(array_filter($deanSignins['entries'] ?? [], static fn(array $e): bool => $e['what'] === 'Signed in'));
expect_same(1, count($readSignedIn), 'The Sign-ins filter adds only the Dean\'s own successful sign-in, not Faculty\'s');
expect_same($readDean['login_email'], $readSignedIn[0]['who']['email'] ?? null, 'The Dean\'s own sign-in row belongs to the Dean');
expect_same(1, count(array_filter($deanRead['entries'], static fn(array $e): bool => $e['what'] === 'Enrolled 3 students')), 'A batch of 3 rows is one entry in the Dean overview');
$readBatchEntry = array_values(array_filter($deanRead['entries'], static fn(array $e): bool => $e['batch'] !== null))[0];
expect_same(3, $readBatchEntry['batch']['count'] ?? null, 'The batch entry counts its rows');
expect_same(3, count($readBatchEntry['batch']['members'] ?? []), 'The batch entry lists its members');
expect_same('b:' . $readBatch, $readBatchEntry['id'] ?? null, 'The batch entry id is the batch id');
expect_true(isset($readBatchEntry['details']['technical']), 'The Dean gets technical details');

// Faculty: only own rows, class work included, sign-ins behind the chip, hidden codes never.
[$facReadStatus, $facRead] = $readGet('/api/faculty/activity?q=' . rawurlencode($readTag), $facultyActivityAccessToken);
expect_same(200, $facReadStatus, 'Faculty activity read loads');
expect_true(in_array('Scores changed', $readWhat($facRead), true), 'Faculty sees their own class-work rows');
expect_true(!in_array('Signed in', $readWhat($facRead), true), 'Faculty sign-ins are behind the Sign-ins filter');
expect_same([], array_values(array_filter($facRead['entries'], static fn(array $e): bool => ($e['who']['email'] ?? '') !== $readFaculty['login_email'])), 'Faculty sees only their own rows');
expect_true(!in_array('Refresh rotation', $readWhat($facRead), true) && !in_array('Token refreshed', $readWhat($facRead), true), 'Token refreshes are never shown');
$readScores = array_values(array_filter($facRead['entries'], static fn(array $e): bool => $e['what'] === 'Scores changed'))[0];
expect_true(str_starts_with((string) $readScores['record'], 'Quiz 2'), 'Score rows fall back to the stored assessment title when the assessment is gone');
expect_same('Ann Cruz (2020-1) · Quiz 2 · Score', $readScores['details']['changes'][0]['field'] ?? null, 'Score rows list each changed cell');
expect_same(['7', '9'], [$readScores['details']['changes'][0]['before'] ?? null, $readScores['details']['changes'][0]['after'] ?? null], 'Score rows show before and after');
expect_true(!isset($readScores['details']['technical']), 'Technical details are Dean-only');
[, $facSignins] = $readGet('/api/faculty/activity?signins=1&q=' . rawurlencode($readTag), $facultyActivityAccessToken);
expect_true(in_array('Signed in', $readWhat($facSignins), true), 'The Sign-ins filter shows Faculty\'s own sign-ins');
expect_same(1, count(array_filter($facRead['entries'], static fn(array $e): bool => $e['batch'] !== null)), 'The Faculty batch is one expandable entry');

// A row older than the newest 100 is found by search; paging covers every row.
[, $facOld] = $readGet('/api/faculty/activity?q=' . rawurlencode("Old {$readTag} marker"), $facultyActivityAccessToken);
expect_same(1, count($facOld['entries'] ?? []), 'A row older than the newest 100 is found by Faculty search');
[, $facAll] = $readGet('/api/faculty/activity', $facultyActivityAccessToken);
expect_true(($facAll['total'] ?? 0) > 100 && count($facAll['entries']) === 50 && ($facAll['pageSize'] ?? 0) === 50, 'My Activity pages 50 at a time over all rows');
[, $facPage3] = $readGet('/api/faculty/activity?page=3', $facultyActivityAccessToken);
expect_true(count($facPage3['entries'] ?? []) >= 1, 'My Activity page 3 holds older rows');

// Filters.
[, $byStatus] = $readGet('/api/admin/audit-logs?status=Failed&q=' . rawurlencode($readTag), $adminAccessToken);
expect_same(['Sign-in failed'], $readWhat($byStatus), 'The status filter works on the server');
[, $byArea] = $readGet('/api/admin/audit-logs?area=' . rawurlencode('Settings & terms') . '&q=' . rawurlencode($readTag), $adminAccessToken);
expect_same([], $byArea['entries'] ?? ['x'], 'The area filter narrows the Dean overview');
[, $byRole] = $readGet('/api/admin/audit-logs?role=faculty&q=' . rawurlencode($readTag), $adminAccessToken);
expect_true(count($byRole['entries'] ?? []) >= 1 && !in_array('Sign-in failed', $readWhat($byRole), true), 'The role filter works on the server');
[, $byDate] = $readGet('/api/admin/audit-logs?from=2999-01-01&q=' . rawurlencode($readTag), $adminAccessToken);
expect_same([], $byDate['entries'] ?? ['x'], 'The date filter works on the server');
$readToday = (new DateTimeImmutable('now', new DateTimeZone('Asia/Manila')))->format('Y-m-d');
[, $byToday] = $readGet("/api/faculty/activity?from={$readToday}&to={$readToday}&q=" . rawurlencode($readTag), $facultyActivityAccessToken);
expect_true(count($byToday['entries'] ?? []) >= 1, 'The date range uses Asia/Manila calendar days');
[, $byClass] = $readGet('/api/faculty/activity?cls=' . $readOwnClass . '&q=' . rawurlencode($readTag), $facultyActivityAccessToken);
expect_true(in_array('Scores changed', $readWhat($byClass), true) && !in_array('Signed in', $readWhat($byClass), true), 'The class filter keeps rows of that class');
[, $byArea2] = $readGet('/api/faculty/activity?area=Grading&q=' . rawurlencode($readTag), $facultyActivityAccessToken);
expect_same(['Scores changed'], $readWhat($byArea2), 'Faculty area filter works');
[, $oldest] = $readGet('/api/faculty/activity?sort=oldest', $facultyActivityAccessToken);
[, $newest] = $readGet('/api/faculty/activity?sort=newest', $facultyActivityAccessToken);
expect_true(($oldest['entries'][0]['occurredAt'] ?? '') <= ($newest['entries'][0]['occurredAt'] ?? ''), 'Sort switches between oldest and newest first');
if ($readOtherClass > 0) {
    [$otherClassStatus] = $readGet('/api/faculty/activity?cls=' . $readOtherClass, $facultyActivityAccessToken);
    expect_same(422, $otherClassStatus, 'Faculty cannot filter by a class that is not theirs');
}
[$badStatus] = $readGet('/api/faculty/activity?status=Maybe', $facultyActivityAccessToken);
[$badSort] = $readGet('/api/admin/audit-logs?sort=sideways', $adminAccessToken);
expect_same([422, 422], [$badStatus, $badSort], 'Invalid filter values are rejected');
echo "PASS: Audit read side integration coverage completed.\n";
