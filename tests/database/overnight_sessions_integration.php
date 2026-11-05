<?php

declare(strict_types=1);
// Included by schedule_session_integration.php before its class is archived (ATT-001, 2026-11-05).
// Needs: $meetingClassId (Faculty class, Secretary assigned, Student 26 enrolled), $seedFacultyAccessToken,
// $secretaryAccessToken, $upcomingToken, $sessionConfig, $sessionLocalTimezone, $secretaryFixtureUserId, $upcomingOwnerId.
$nightDay = static fn(int $days): string => (new DateTimeImmutable('now', $sessionLocalTimezone))->modify('+' . $days . ' days')->format('Y-m-d');
$nightDate = $nightDay(1);
$nightNext = $nightDay(2);
$nightPayload = ['csId' => $meetingClassId, 'sessionDate' => $nightDate, 'openingTime' => '23:00', 'presentCutoff' => '00:15', 'lateCutoff' => '01:00', 'classEndTime' => '02:00', 'room' => 'Night Room ' . $scheduleSuffix, 'biometricRequired' => false, 'geofenceEnabled' => false];

// Create: accepted and labelled next day.
[$nightStatus, $nightBody] = integration_http_json('/api/faculty/attendance/session', $seedFacultyAccessToken, $nightPayload);
expect_same(201, $nightStatus, 'Faculty creates an overnight session: ' . json_encode($nightBody));
$nightId = (int) ($nightBody['session']['sessionId'] ?? 0);
expect_same([true, true, true], [$nightBody['session']['presentCutoffNextDay'] ?? null, $nightBody['session']['lateCutoffNextDay'] ?? null, $nightBody['session']['classEndNextDay'] ?? null], 'Overnight create flags the next-day times');
expect_same('02:00', $nightBody['session']['classEndTime'] ?? null, 'Overnight class end stays plain HH:MM');
$nightSameDay = $nightBody['session'];

// Rejections: 24 h, order across midnight, end before Late across midnight.
foreach ([
    'end at the opening time (24 hours)' => ['classEndTime' => '23:00'],
    'Present after Late across midnight' => ['presentCutoff' => '01:30'],
    'Present equal to opening' => ['presentCutoff' => '23:00'],
    'end before Late across midnight' => ['lateCutoff' => '01:00', 'classEndTime' => '00:30'],
] as $label => $override) {
    [$badStatus] = integration_http_json('/api/faculty/attendance/session', $seedFacultyAccessToken, array_merge($nightPayload, ['sessionDate' => $nightDay(10)], $override));
    expect_same(422, $badStatus, 'Overnight rule rejects ' . $label);
}
[$longStatus, $longBody] = integration_http_json('/api/faculty/attendance/session', $seedFacultyAccessToken, array_merge($nightPayload, ['sessionDate' => $nightDay(10), 'classEndTime' => '22:30', 'lateCutoff' => '22:00', 'presentCutoff' => '23:30']));
expect_same(422, $longStatus, 'A session just under 24 hours is now refused by the 12 hour limit');
expect_same('A session can last at most 12 hours.', $longBody['errors'][0]['message'] ?? null, 'The 12 hour refusal names the limit');
[$twelveStatus, $twelveBody] = integration_http_json('/api/faculty/attendance/session', $seedFacultyAccessToken, array_merge($nightPayload, ['sessionDate' => $nightDay(10), 'classEndTime' => '11:00']));
expect_same(201, $twelveStatus, 'A session of exactly 12 hours is accepted');
$pdo->prepare("UPDATE attendance_sessions SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP WHERE session_id = ?")->execute([(int) ($twelveBody['session']['sessionId'] ?? 0)]);

// The database CHECK allows the wrap and still rejects a bad order.
try {
    $pdo->prepare("UPDATE attendance_sessions SET present_cutoff_time = '01:30' WHERE session_id = ?")->execute([$nightId]);
    expect_true(false, 'Database CHECK rejects Present after Late across midnight');
} catch (PDOException) {
    expect_true(true, 'Database CHECK rejects Present after Late across midnight');
}

// Overlap across midnight, both roles; back-to-back is allowed.
$nightOverlap = ['csId' => $meetingClassId, 'sessionDate' => $nightNext, 'openingTime' => '01:00', 'presentCutoff' => '01:30', 'lateCutoff' => '02:30', 'classEndTime' => '03:00', 'room' => 'Night Room ' . $scheduleSuffix, 'biometricRequired' => false, 'geofenceEnabled' => false];
[$overlapFacultyStatus] = integration_http_json('/api/faculty/attendance/session', $seedFacultyAccessToken, $nightOverlap);
expect_same(409, $overlapFacultyStatus, 'Faculty booking at 01:00 the next day overlaps the overnight session');
[$overlapSecretaryStatus, $overlapSecretaryBody] = integration_http_json('/api/secretary/attendance/session', $secretaryAccessToken, $nightOverlap);
expect_same(409, $overlapSecretaryStatus, 'Secretary booking at 01:00 the next day overlaps the overnight session');
expect_true(str_contains($overlapSecretaryBody['message'] ?? '', 'Faculty') && str_contains($overlapSecretaryBody['message'] ?? '', $nightDate), 'Overlap message names the creator and the original date');
[$backToBackStatus, $backToBackBody] = integration_http_json('/api/secretary/attendance/session', $secretaryAccessToken, array_merge($nightOverlap, ['openingTime' => '02:00', 'presentCutoff' => '02:30', 'lateCutoff' => '03:00', 'classEndTime' => '04:00']));
expect_same(201, $backToBackStatus, 'A booking starting at the overnight real end is allowed');
$pdo->prepare("UPDATE attendance_sessions SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP WHERE session_id = ?")->execute([(int) ($backToBackBody['session']['sessionId'] ?? 0)]);
// An overnight edit/create that runs into a booking on the next morning is also rejected.
[$overnightIntoMorningStatus] = integration_http_json('/api/faculty/attendance/session', $seedFacultyAccessToken, array_merge($nightPayload, ['sessionDate' => $nightDay(5)]));
expect_same(201, $overnightIntoMorningStatus, 'Second overnight session on another day is created');
$nightFiveId = $pdo->query("SELECT MAX(session_id) FROM attendance_sessions WHERE cs_id = " . $meetingClassId . " AND session_date = DATE '" . $nightDay(5) . "'")->fetchColumn();
$pdo->prepare("INSERT INTO attendance_sessions(cs_id, secretary_user_id, owner_user_id, session_date, session_code, status, opening_time, present_cutoff_time, late_cutoff_time, class_end_time, created_by_role) VALUES (?, ?, ?, ?, 'NIGHT-MORN', 'scheduled', '03:00', '03:30', '04:00', '05:00', 'faculty')")->execute([$meetingClassId, $secretaryFixtureUserId, $upcomingOwnerId, $nightDay(6)]);
[$morningEditStatus] = integration_http_json('/api/faculty/attendance/session/update', $seedFacultyAccessToken, ['sessionId' => (int) $nightFiveId, 'classEndTime' => '04:00']);
expect_same(409, $morningEditStatus, 'Editing an overnight end into the next morning booking is rejected');
[$sameEditStatus, $sameEditBody] = integration_http_json('/api/faculty/attendance/session/update', $seedFacultyAccessToken, ['sessionId' => (int) $nightFiveId, 'classEndTime' => '02:30']);
expect_same(200, $sameEditStatus, 'Editing only the end time keeps the overnight session valid: ' . json_encode($sameEditBody));
expect_same(['23:00', '02:30'], [$sameEditBody['session']['openingTime'] ?? null, $sameEditBody['session']['classEndTime'] ?? null], 'Edit keeps the saved opening and updates the end');
$pdo->prepare("UPDATE attendance_sessions SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP WHERE session_id = ? OR session_code = 'NIGHT-MORN'")->execute([(int) $nightFiveId]);

// Present/Late windows across midnight, stored date stays the session day.
$nightSession = $pdo->prepare('SELECT * FROM attendance_sessions WHERE session_id = ?');
$nightSession->execute([$nightId]);
$nightRow = $nightSession->fetch(PDO::FETCH_ASSOC);
$nightAt = static fn(string $date, string $time): DateTimeImmutable => (new DateTimeImmutable($date . ' ' . $time, $sessionLocalTimezone))->setTimezone(new DateTimeZone('UTC'));
$nightDecision = static fn(string $status, DateTimeImmutable $at): array => attendance_session_timing_decision(array_merge($nightRow, ['status' => $status]), $at, $sessionConfig);
expect_same('attendance_not_open', $nightDecision('active', $nightAt($nightDate, '22:30'))['code'], 'Overnight session is closed before opening');
expect_same('present', $nightDecision('active', $nightAt($nightDate, '23:10'))['status'], 'Check-in before midnight is Present');
expect_same('present', $nightDecision('active', $nightAt($nightNext, '00:10'))['status'], 'Check-in at 00:10 is still Present (cutoff 00:15 next day)');
expect_same('late', $nightDecision('active', $nightAt($nightNext, '00:30'))['status'], 'Check-in at 00:30 is Late');
expect_same('attendance_capture_closed', $nightDecision('active', $nightAt($nightNext, '01:00'))['code'], 'Capture closes at the Late cutoff on the next day');
expect_same($nightDate, $nightRow['session_date'], 'Overnight session records keep the session day');

// Lifecycle with an injected clock: opens at opening, stays open past midnight, ends only at the real end.
$nightContext = attendance_session_request_context();
$nightState = $pdo->prepare('SELECT status FROM attendance_sessions WHERE session_id = ?');
attendance_sessions_open_due($pdo, $sessionConfig, $nightContext, new DateTimeImmutable($nightDate . ' 22:59:00', $sessionLocalTimezone));
$nightState->execute([$nightId]);
expect_same('scheduled', $nightState->fetchColumn(), 'Overnight session does not open before its opening time');
attendance_sessions_open_due($pdo, $sessionConfig, $nightContext, new DateTimeImmutable($nightDate . ' 23:00:00', $sessionLocalTimezone));
$nightState->execute([$nightId]);
expect_same('active', $nightState->fetchColumn(), 'Overnight session opens at its opening time');
attendance_sessions_end_overdue($pdo, $sessionConfig, $nightContext, new DateTimeImmutable($nightNext . ' 01:59:59', $sessionLocalTimezone));
$nightState->execute([$nightId]);
expect_same('active', $nightState->fetchColumn(), 'Overnight session is still open after midnight until 02:00');
attendance_sessions_end_overdue($pdo, $sessionConfig, $nightContext, new DateTimeImmutable($nightNext . ' 02:00:00', $sessionLocalTimezone));
$nightState->execute([$nightId]);
expect_same('ended', $nightState->fetchColumn(), 'Overnight session ends at 02:00 the next day');
$nightEnd = $pdo->prepare("SELECT ended_at, (SELECT COUNT(*) FROM attendance_records WHERE attendance_session_id = ? AND status = 'absent' AND session_date = ?) FROM attendance_sessions WHERE session_id = ?");
$nightEnd->execute([$nightId, $nightDate, $nightId]);
[$nightEndedAt, $nightAbsent] = $nightEnd->fetch(PDO::FETCH_NUM);
expect_same($nightAt($nightNext, '02:00')->format('Y-m-d H:i:s'), substr((string) $nightEndedAt, 0, 19), 'Overnight ended_at is the real end moment');
expect_true((int) $nightAbsent >= 1, 'Unrecorded students are resolved to Absent on the session day');

// Student list: an overnight session that began yesterday stays listed until its real end (end 23:58 today).
$nightYesterday = $nightDay(-1);
$pdo->prepare("INSERT INTO attendance_sessions(cs_id, secretary_user_id, owner_user_id, session_date, session_code, started_at, status, opening_time, present_cutoff_time, late_cutoff_time, class_end_time, created_by_role)
    VALUES (?, ?, ?, ?, 'NIGHT-LIVE', CURRENT_TIMESTAMP, 'active', '23:59', '00:00', '00:01', '23:58', 'faculty') RETURNING session_id")->execute([$meetingClassId, $secretaryFixtureUserId, $upcomingOwnerId, $nightYesterday]);
$nightLiveId = (int) $pdo->query("SELECT session_id FROM attendance_sessions WHERE session_code = 'NIGHT-LIVE'")->fetchColumn();
[$nightListStatus, $nightListBody] = integration_http_get_json('/api/student/attendance/sessions/upcoming', $upcomingToken);
expect_same(200, $nightListStatus, 'Student upcoming list loads with an overnight session');
$nightListed = array_values(array_filter($nightListBody['sessions'] ?? [], static fn(array $row): bool => (int) $row['sessionId'] === $nightLiveId))[0] ?? null;
expect_true($nightListed !== null, 'Overnight session from yesterday stays listed after midnight');
expect_same([true, true], [$nightListed['classEndNextDay'] ?? null, $nightListed['presentCutoffNextDay'] ?? null], 'Student payload flags next-day times');
$nightState->execute([$nightLiveId]);
expect_same('active', $nightState->fetchColumn(), 'Real-time auto-end keeps yesterday-dated overnight session open before its end');
$pdo->prepare("UPDATE attendance_sessions SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP WHERE session_id = ?")->execute([$nightLiveId]);

// Regression: same-day sessions behave as before.
expect_same([false, false, false], [$queuedBody['session']['presentCutoffNextDay'] ?? false, $queuedBody['session']['lateCutoffNextDay'] ?? false, $queuedBody['session']['classEndNextDay'] ?? false], 'Same-day sessions have no next-day flags');
[$sameDayBadStatus] = integration_http_json('/api/faculty/attendance/session', $seedFacultyAccessToken, array_merge($queuePayload, ['sessionDate' => $nightDay(12), 'classEndTime' => '09:30']));
expect_same(422, $sameDayBadStatus, 'Same-day End before Late is still rejected (09:30 is not next day: opening 08:00)');
