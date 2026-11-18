<?php

declare(strict_types=1);

// Backlog 12.2 face enrolment flags (docs/contracts/face-reenrolment.md). Included by the full disposable PostgreSQL suite after
// superadmin_integration.php. The biometric sidecar is off here, so the enrolment's flag step is driven directly with the sidecar's
// matched yes/no; the routes are exercised over HTTP. Every row carries $ffTag.
$ffTag = 'ff' . strtolower(bin2hex(random_bytes(3)));
$ffConfig = app_config();
$ffContext = ['request_id' => 'ff-' . $ffTag, 'ip_address' => null, 'user_agent' => 'face_flags_integration', 'http_method' => 'POST', 'endpoint' => '/test'];
$ffStudentActor = ['user_id' => null, 'login_email' => null, 'role' => 'student', 'display_name' => 'Ff Student', 'session_id' => null];
$ffNew = static function (string $label) use ($pdo, $ffTag): int {
    $stmt = $pdo->prepare("INSERT INTO students (student_number, first_name, last_name, bu_email, status) VALUES (?, 'Ff', ?, ?, 'active') RETURNING student_id");
    $stmt->execute(["FF-{$ffTag}-{$label}", "{$label}{$ffTag}", "ff-{$ffTag}-" . strtolower($label) . '@bicol-u.edu.ph']);
    $id = (int) $stmt->fetchColumn();
    $pdo->prepare("INSERT INTO biometric_profiles (student_id, consent_status, face_enrolled, enrollment_status) VALUES (?, 'approved', 0, 'not_enrolled')")->execute([$id]);
    return $id;
};
$ffAudit = static function (int $studentId, string $code) use ($pdo, $ffConfig, $ffContext, $ffStudentActor): void {
    $pdo->beginTransaction();
    student_biometric_record_audit($pdo, $ffConfig, $ffStudentActor, $ffContext, $code, $studentId, 'Fixture.', null, null, null);
    $pdo->commit();
};
// Runs the enrolment's flag step the way the controller does. $hadFace: a working face was replaced; $everEnrolled: a face existed once.
$ffEnrol = static function (int $studentId, bool $hadFace, bool $everEnrolled, ?bool $matches, ?DateTimeImmutable $now = null) use ($pdo, $ffConfig, $ffContext): void {
    $before = ['protected_object_reference' => $hadFace ? 'sface/' . str_repeat('a', 32) : null, 'enrolled_at' => $everEnrolled ? '2026-01-01 00:00:00' : null];
    $pdo->beginTransaction();
    face_flags_after_enrolment($pdo, $ffConfig, $ffContext, $studentId, $before, $matches, $now ?? new DateTimeImmutable('now', new DateTimeZone('UTC')));
    $pdo->commit();
};
$ffFlags = static function (int $studentId) use ($pdo): array {
    $stmt = $pdo->prepare('SELECT flag_id, kind, status, detail::text AS detail FROM face_enrolment_flags WHERE student_id = ? ORDER BY flag_id');
    $stmt->execute([$studentId]);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
};
$ffRaised = static function (int $studentId) use ($pdo): int {
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM audit_events WHERE action_code = 'face_flag_raised' AND target_id = ?");
    $stmt->execute([(string) $studentId]);
    return (int) $stmt->fetchColumn();
};

// F2: a re-enrolment over a working face that does not match.
$ffMatch = $ffNew('Match');
$ffMismatch = $ffNew('Mismatch');
$ffEnrol($ffMatch, true, true, true);
expect_same([], $ffFlags($ffMatch), 'A matching update raises no flag');
$ffEnrol($ffMatch, true, true, null);
expect_same([], $ffFlags($ffMatch), 'An unreadable previous face (matchesPrevious null) raises no flag');
$ffEnrol($ffMismatch, true, true, false);
$ffRows = $ffFlags($ffMismatch);
expect_true(count($ffRows) === 1 && $ffRows[0]['kind'] === 'F2' && $ffRows[0]['status'] === 'open', 'A non-matching update raises one open F2');
expect_same(['enrolledAt'], array_keys(json_decode($ffRows[0]['detail'], true)), 'F2 detail holds the date only, no score');
$ffEnrol($ffMismatch, true, true, false);
expect_same(1, count($ffFlags($ffMismatch)), 'A second non-matching update refreshes the open flag instead of adding one');
expect_same(2, $ffRaised($ffMismatch), 'Each raise or refresh is audited as face_flag_raised');

// F1: re-enrolled within 30 days after the Student's own withdrawal.
$ffWithdrew = $ffNew('Withdrew');
$ffAudit($ffWithdrew, 'biometric_consent_revoked');
$ffEnrol($ffWithdrew, false, true, null);
$ffRows = $ffFlags($ffWithdrew);
expect_true(count($ffRows) === 1 && $ffRows[0]['kind'] === 'F1', 'Enrolling again after the Student withdrew raises F1');
expect_same(['enrolledAt', 'withdrawnAt'], array_keys(json_decode($ffRows[0]['detail'], true)), 'F1 detail holds the two dates');
$ffEnrol($ffWithdrew, false, true, null);
expect_same(1, count($ffFlags($ffWithdrew)), 'A second F1 event refreshes the open F1');
$ffLate = $ffNew('Late');
$ffAudit($ffLate, 'biometric_enrollment_revoked');
$ffEnrol($ffLate, false, true, null, new DateTimeImmutable('+29 days', new DateTimeZone('UTC')));
expect_same(1, count($ffFlags($ffLate)), 'Enrolling 29 days after the withdrawal still raises F1');
$ffLate2 = $ffNew('Late2');
$ffAudit($ffLate2, 'biometric_enrollment_revoked');
$ffEnrol($ffLate2, false, true, null, new DateTimeImmutable('+31 days', new DateTimeZone('UTC')));
expect_same([], $ffFlags($ffLate2), 'Enrolling 31 days after the withdrawal raises no flag');
$ffDean = $ffNew('Dean');
$ffAudit($ffDean, 'biometric_enrollment_revoked_by_dean');
$ffEnrol($ffDean, false, true, null);
expect_same([], $ffFlags($ffDean), 'Enrolling after a Dean revoke raises no flag');
$ffBoth = $ffNew('Both');
$ffAudit($ffBoth, 'biometric_enrollment_revoked');
$ffAudit($ffBoth, 'biometric_enrollment_revoked_by_dean');
$ffEnrol($ffBoth, false, true, null);
expect_same([], $ffFlags($ffBoth), 'When the Dean revoked last, the earlier own withdrawal raises no flag');
$ffFirst = $ffNew('First');
$ffEnrol($ffFirst, false, false, null);
expect_same([], $ffFlags($ffFirst), 'A first-ever enrolment raises no flag');

// Flags never block: a failing flag step is swallowed and the transaction stays usable.
$pdo->beginTransaction();
face_flags_after_enrolment($pdo, $ffConfig, $ffContext, 2147483000, ['protected_object_reference' => 'sface/' . str_repeat('a', 32), 'enrolled_at' => null], false, new DateTimeImmutable('now', new DateTimeZone('UTC')));
expect_same(1, (int) $pdo->query('SELECT 1')->fetchColumn(), 'A failing flag step (unknown Student) leaves the enrolment transaction usable');
$pdo->commit();

// Routes.
foreach ([['GET', '/api/admin/face-flags'], ['POST', '/api/admin/face-flags/dismiss']] as [$ffMethod, $ffPath]) {
    foreach ([['Faculty', $seedFacultyAccessToken, 403], ['Dean', $adminAccessToken, 403], ['anonymous', '', 401]] as [$ffWho, $ffToken, $ffWant]) {
        [$ffStatus] = $ffMethod === 'GET' ? integration_http_get_json($ffPath, $ffToken) : integration_http_json($ffPath, $ffToken, ['flagId' => 1, 'note' => 'Long enough note']);
        expect_same($ffWant, $ffStatus, "{$ffWho} gets {$ffWant} on {$ffMethod} {$ffPath}");
    }
}
[$ffListStatus, $ffList] = integration_http_get_json('/api/admin/face-flags?q=' . rawurlencode($ffTag), $superAccessToken);
expect_true($ffListStatus === 200 && ($ffList['status'] ?? '') === 'ok' && $ffList['total'] === 3 && $ffList['pageSize'] === 50 && $ffList['page'] === 1, 'The Superadmin lists the open flags of this run');
$ffF2 = null;
foreach ($ffList['flags'] as $ffRow) if ($ffRow['student']['studentId'] === $ffMismatch) $ffF2 = $ffRow;
expect_true($ffF2 !== null && $ffF2['kind'] === 'F2' && $ffF2['status'] === 'open' && is_array($ffF2['classes']) && $ffF2['closedBy'] === null && $ffF2['closedNote'] === null
    && $ffF2['student']['studentNo'] === "FF-{$ffTag}-Mismatch" && preg_match('/^\d{4}-\d\d-\d\dT[\d:]+\+08:00$/', (string) $ffF2['updatedAt']) === 1 && isset($ffF2['detail']['enrolledAt']), 'A flag row has the contracted shape with Manila dates');
expect_true(!str_contains(json_encode($ffList), 'score'), 'The list never carries a score');
[, $ffOnlyF1] = integration_http_get_json('/api/admin/face-flags?kind=F1&q=' . rawurlencode($ffTag), $superAccessToken);
expect_same([2, true], [$ffOnlyF1['total'], array_unique(array_column($ffOnlyF1['flags'], 'kind')) === ['F1']], 'The kind filter narrows the list');
foreach (['status=sometimes', 'kind=F3', 'page=0', 'classId=2147480000'] as $ffBad) {
    [$ffBadStatus] = integration_http_get_json('/api/admin/face-flags?' . $ffBad, $superAccessToken);
    expect_same(422, $ffBadStatus, "An unknown filter value is a validation error ({$ffBad})");
}
[, $ffOverview] = integration_http_get_json('/api/admin/overview', $superAccessToken);
expect_same((int) $pdo->query("SELECT COUNT(*) FROM face_enrolment_flags WHERE status = 'open'")->fetchColumn(), $ffOverview['faceFlagsOpen'] ?? null, 'The overview counts the open flags');

$ffMismatchFlag = (int) $ffF2['flagId'];
[$ffShortStatus] = integration_http_json('/api/admin/face-flags/dismiss', $superAccessToken, ['flagId' => $ffMismatchFlag, 'note' => 'short']);
expect_same(422, $ffShortStatus, 'A dismissal note under 8 characters is refused');
[$ffMissingStatus, $ffMissing] = integration_http_json('/api/admin/face-flags/dismiss', $superAccessToken, ['flagId' => 2147480000, 'note' => 'Saw the Student in person']);
expect_true($ffMissingStatus === 404 && ($ffMissing['code'] ?? '') === 'flag_not_found', 'Dismissing an unknown flag is 404 flag_not_found');
[$ffDismissStatus, $ffDismissed] = integration_http_json('/api/admin/face-flags/dismiss', $superAccessToken, ['flagId' => $ffMismatchFlag, 'note' => 'New phone, saw them in person']);
expect_true($ffDismissStatus === 200 && ($ffDismissed['flag']['status'] ?? '') === 'dismissed' && ($ffDismissed['flag']['closedNote'] ?? '') === 'New phone, saw them in person'
    && is_string($ffDismissed['flag']['closedAt'] ?? null) && is_string($ffDismissed['flag']['closedBy']['name'] ?? null), 'The Superadmin dismisses an open flag with a note');
[$ffAgainStatus, $ffAgain] = integration_http_json('/api/admin/face-flags/dismiss', $superAccessToken, ['flagId' => $ffMismatchFlag, 'note' => 'New phone, saw them in person']);
expect_true($ffAgainStatus === 409 && ($ffAgain['code'] ?? '') === 'flag_closed' && ($ffAgain['message'] ?? '') === 'This flag is already closed.', 'A closed flag cannot be dismissed again (409 flag_closed)');
$ffDismissAudit = $pdo->prepare("SELECT reason FROM audit_events WHERE action_code = 'face_flag_dismissed' AND target_id = ?");
$ffDismissAudit->execute([(string) $ffMismatch]);
expect_same('New phone, saw them in person', $ffDismissAudit->fetchColumn(), 'The dismissal is audited with the note');
[, $ffDismissedList] = integration_http_get_json('/api/admin/face-flags?status=dismissed&q=' . rawurlencode($ffTag), $superAccessToken);
[, $ffAllList] = integration_http_get_json('/api/admin/face-flags?status=all&q=' . rawurlencode($ffTag), $superAccessToken);
expect_same([1, 3], [$ffDismissedList['total'], $ffAllList['total']], 'The status filter separates dismissed from all');
$ffEnrol($ffMismatch, true, true, false);
expect_same(2, count($ffFlags($ffMismatch)), 'After a dismissal, the next non-matching update opens a new flag');

// A Superadmin revoke closes the Student's open flags as revoked. The fixture holds no stored reference (the sidecar is off here).
$pdo->prepare("UPDATE biometric_profiles SET enrollment_status = 'enrolling' WHERE student_id = ?")->execute([$ffWithdrew]);
[$ffRevokeStatus] = integration_http_json('/api/admin/biometrics/revoke', $superAccessToken, ['studentId' => $ffWithdrew, 'reason' => 'Face does not belong to the Student']);
expect_same(200, $ffRevokeStatus, 'The Superadmin revokes the flagged Student\'s enrollment');
$ffRows = $ffFlags($ffWithdrew);
expect_same(['revoked'], array_column($ffRows, 'status'), 'The revoke closes the open flag as revoked');
$ffClosed = $pdo->prepare('SELECT closed_at IS NOT NULL AND closed_by_user_id IS NOT NULL FROM face_enrolment_flags WHERE flag_id = ?');
$ffClosed->execute([(int) $ffRows[0]['flag_id']]);
expect_true((bool) $ffClosed->fetchColumn(), 'A revoked flag records when and by whom');

// The sweep expires an enrollment whose stored term end has passed.
$ffSweep = $ffNew('Sweep');
$pdo->prepare("UPDATE biometric_profiles SET enrollment_status = 'enrolling', reference_expires_on = '2020-12-31' WHERE student_id = ?")->execute([$ffSweep]);
exec(escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg(__DIR__ . '/../../backend/bin/expire-biometrics.php') . ' 2>&1', $ffSweepOutput);
$ffStatusStmt = $pdo->prepare('SELECT enrollment_status FROM biometric_profiles WHERE student_id = ?');
$ffStatusStmt->execute([$ffSweep]);
expect_same('expired', $ffStatusStmt->fetchColumn(), 'The sweep expires an enrollment with an old expiry date: ' . implode(' | ', array_slice($ffSweepOutput, -2)));
