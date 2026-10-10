<?php

// Included by postgres_integration_test.php after both role tokens exist.
require_once $root . '/backend/app/request.php';
require_once $root . '/backend/app/account_identity.php';
$scheduleSuffix = strtoupper(bin2hex(random_bytes(3)));
$meetingPayload = [
    ['component' => 'Lecture', 'day' => 'Mon', 'room' => 'Schedule Room ' . $scheduleSuffix, 'startTime' => '08:00', 'endTime' => '10:00'],
    ['component' => 'Lecture', 'day' => 'Tue', 'room' => 'Schedule Room ' . $scheduleSuffix, 'startTime' => '15:00', 'endTime' => '17:00'],
];
[$meetingCreateStatus, $meetingCreateBody] = integration_http_json('/api/faculty/classes', $seedFacultyAccessToken, [
    'csName' => 'Meeting Fixture ' . $scheduleSuffix, 'courseCode' => 'MEET' . $scheduleSuffix,
    'courseName' => 'Meeting Schedule Fixture', 'semester' => '1ST', 'schoolYear' => '2026-2027',
    'yearLevel' => 4, 'block' => 'MEET', 'lectureUnits' => 3, 'labUnits' => null,
    'lecRoom' => $meetingPayload[0]['room'], 'meetings' => $meetingPayload,
]);
expect_same(201, $meetingCreateStatus, 'Faculty creates atomic meetings with different weekday times: ' . json_encode($meetingCreateBody));
$meetingClassId = (int) ($meetingCreateBody['csId'] ?? 0);
expect_true($meetingClassId > 0, 'Meeting fixture receives a persisted class ID');
$createMeetingAudit = $pdo->prepare("SELECT after_state_json FROM audit_events WHERE scope_cs_id = ? AND action_code = 'class_create'");
$createMeetingAudit->execute([$meetingClassId]);
expect_same($meetingPayload, json_decode($createMeetingAudit->fetchColumn(), true)['meetings'] ?? null, 'Class creation audit includes its meeting list');
$meetingRows = $pdo->prepare('SELECT weekday, start_time, end_time, room FROM class_meetings WHERE cs_id = ? ORDER BY meeting_id');
$meetingRows->execute([$meetingClassId]);
$persistedMeetings = $meetingRows->fetchAll(PDO::FETCH_ASSOC);
expect_same(['Mon', 'Tue'], array_column($persistedMeetings, 'weekday'), 'Meeting weekdays are separate persisted attributes');
expect_same(['08:00:00', '15:00:00'], array_column($persistedMeetings, 'start_time'), 'Meeting times are not bundled or truncated');
[$meetingGetStatus, $meetingGetBody] = integration_http_get_json('/api/faculty/classes', $seedFacultyAccessToken);
$meetingClass = array_values(array_filter($meetingGetBody['classes'] ?? [], static fn(array $class): bool => (int) $class['csId'] === $meetingClassId))[0] ?? [];
expect_same(200, $meetingGetStatus, 'Atomic meeting class read succeeds');
expect_same($meetingPayload, $meetingClass['meetings'] ?? null, 'Class API round trips every meeting');
$updatedMeetings = $meetingPayload;
$updatedMeetings[1]['startTime'] = '16:00';
$updatedMeetings[1]['endTime'] = '18:00';
[$meetingUpdateStatus] = integration_http_json('/api/faculty/classes/update', $seedFacultyAccessToken, ['csId' => $meetingClassId, 'meetings' => $updatedMeetings]);
expect_same(200, $meetingUpdateStatus, 'Faculty edits the Tuesday time without changing Monday');
$meetingAudit = $pdo->prepare("SELECT before_state_json, after_state_json FROM audit_events WHERE scope_cs_id = ? AND action_code = 'class_update' ORDER BY sequence_number DESC LIMIT 1");
$meetingAudit->execute([$meetingClassId]);
$meetingAuditRow = $meetingAudit->fetch(PDO::FETCH_ASSOC);
expect_same($meetingPayload, json_decode($meetingAuditRow['before_state_json'], true)['meetings'] ?? null, 'Meeting edit audit preserves the previous meeting list');
expect_same($updatedMeetings, json_decode($meetingAuditRow['after_state_json'], true)['meetings'] ?? null, 'Meeting edit audit records every new day/time');
[$roomOnlyStatus] = integration_http_json('/api/faculty/classes/update', $seedFacultyAccessToken, ['csId' => $meetingClassId, 'lecRoom' => 'Updated Schedule Room ' . $scheduleSuffix]);
expect_same(200, $roomOnlyStatus, 'Older room-only updates remain supported');
$meetingRows->execute([$meetingClassId]);
$roomOnlyRows = $meetingRows->fetchAll(PDO::FETCH_ASSOC);
expect_same(['08:00:00', '16:00:00'], array_column($roomOnlyRows, 'start_time'), 'Room-only update preserves each weekday time');
expect_same(['Updated Schedule Room ' . $scheduleSuffix, 'Updated Schedule Room ' . $scheduleSuffix], array_column($roomOnlyRows, 'room'), 'Room-only update keeps atomic rooms consistent');
$mixedLegacyText = 'Legacy Room (Mon 08:00 AM - 10:00 AM); Unfinished Room (Tue 03:00 PM -';
$pdo->prepare('UPDATE class_sections SET meetings_recorded = false, lec_room = ? WHERE cs_id = ?')->execute([$mixedLegacyText, $meetingClassId]);
[$legacyReadStatus, $legacyReadBody] = integration_http_get_json('/api/faculty/classes', $seedFacultyAccessToken);
$legacyClass = array_values(array_filter($legacyReadBody['classes'] ?? [], static fn(array $class): bool => (int) $class['csId'] === $meetingClassId))[0];
expect_same($mixedLegacyText, $legacyClass['lecRoom'], 'Class reads preserve recognized and unrecognized legacy schedule text together');
[$legacyMetadataStatus] = integration_http_json('/api/faculty/classes/update', $seedFacultyAccessToken, ['csId' => $meetingClassId, 'block' => 'Metadata edit']);
expect_same(200, $legacyMetadataStatus, 'An unrelated metadata edit preserves a partially recognized legacy schedule');
$legacyRaw = $pdo->prepare('SELECT lec_room FROM class_sections WHERE cs_id = ?');
$legacyRaw->execute([$meetingClassId]);
expect_same($mixedLegacyText, $legacyRaw->fetchColumn(), 'Unrelated class editing leaves the original legacy text intact');
$completeLegacyText = 'Legacy Room (Mon 08:00 AM - 10:00 AM)';
$pdo->prepare('UPDATE class_sections SET lec_room = ? WHERE cs_id = ?')->execute([$completeLegacyText, $meetingClassId]);
[$clearMeetingsStatus] = integration_http_json('/api/faculty/classes/update', $seedFacultyAccessToken, ['csId' => $meetingClassId, 'meetings' => []]);
expect_same(200, $clearMeetingsStatus, 'Faculty can remove all legacy meetings explicitly');
[$clearedReadStatus, $clearedReadBody] = integration_http_get_json('/api/faculty/classes', $seedFacultyAccessToken);
$clearedClass = array_values(array_filter($clearedReadBody['classes'] ?? [], static fn(array $class): bool => (int) $class['csId'] === $meetingClassId))[0];
expect_same([], $clearedClass['meetings'], 'Removed meetings remain empty on reload');
expect_same('Legacy Room', $clearedClass['lecRoom'], 'Removed meeting times do not return through the legacy display fallback');
$legacyRaw->execute([$meetingClassId]);
expect_same($completeLegacyText, $legacyRaw->fetchColumn(), 'Removing meetings preserves the original legacy text in storage');
$pdo->prepare('UPDATE class_sections SET meetings_recorded = true WHERE cs_id = ?')->execute([$meetingClassId]);
[$meetingConflictStatus] = integration_http_json('/api/faculty/classes/update', $seedFacultyAccessToken, ['csId' => $meetingClassId, 'meetings' => [$meetingPayload[0], array_merge($meetingPayload[0], ['startTime' => '09:00'])]]);
expect_same(422, $meetingConflictStatus, 'Backend rejects overlapping meeting rows independently of the UI');
$pdo->prepare('UPDATE class_sections SET secretary_user_id = ? WHERE cs_id = ?')->execute([$secretaryFixtureUserId, $meetingClassId]);
$pdo->prepare("INSERT INTO enrollments (student_id, cs_id, status) VALUES (26, ?, 'Active')")->execute([$meetingClassId]);
$queueDate = (new DateTimeImmutable('now', $sessionLocalTimezone))->modify('+3 days')->format('Y-m-d');
$queuePayload = ['csId' => $meetingClassId, 'sessionDate' => $queueDate, 'openingTime' => '08:00', 'presentCutoff' => '09:00', 'lateCutoff' => '10:00', 'classEndTime' => '11:00', 'biometricRequired' => false, 'geofenceEnabled' => false];
[$queuedStatus, $queuedBody] = integration_http_json('/api/faculty/attendance/session', $seedFacultyAccessToken, $queuePayload);
expect_same(201, $queuedStatus, 'Faculty queues a future session');
expect_same('scheduled', $queuedBody['session']['status'] ?? null, 'Future session is explicitly scheduled');
$queuedId = (int) ($queuedBody['session']['sessionId'] ?? 0);
[$futureFacultyMarkStatus] = integration_http_json('/api/faculty/attendance/override', $seedFacultyAccessToken, ['csId' => $meetingClassId, 'studentId' => 26, 'sessionId' => $queuedId, 'sessionDate' => $queueDate, 'status' => 'present']);
expect_same(422, $futureFacultyMarkStatus, 'Faculty cannot enter attendance on a future date');
[$futureFacultyWithoutSessionStatus, $futureFacultyWithoutSessionBody] = integration_http_json('/api/faculty/attendance/override', $seedFacultyAccessToken, ['csId' => $meetingClassId, 'studentId' => 26, 'sessionDate' => $queueDate, 'status' => 'present']);
expect_same(422, $futureFacultyWithoutSessionStatus, 'Faculty cannot create attendance on a future date without a session ID');
expect_same('VALIDATION_ERROR', $futureFacultyWithoutSessionBody['code'] ?? null, 'Future Faculty attendance without a session ID returns a validation error');
expect_same(
    [['field' => 'sessionDate', 'message' => 'Worksheet date cannot be in the future.']],
    $futureFacultyWithoutSessionBody['errors'] ?? null,
    'Future Faculty attendance returns the exact sessionDate validation message'
);
$futureEnrollment = $pdo->prepare('SELECT enrollment_id FROM enrollments WHERE cs_id = ? AND student_id = 26');
$futureEnrollment->execute([$meetingClassId]);
$futureEnrollmentId = $futureEnrollment->fetchColumn();
expect_true($futureEnrollmentId !== false, 'Future attendance fixture enrollment exists');
$futureAttendanceCount = $pdo->prepare('SELECT COUNT(*) FROM attendance_records WHERE enrollment_id = ? AND session_date = ?');
$futureAttendanceCount->execute([$futureEnrollmentId, $queueDate]);
expect_same(0, (int) $futureAttendanceCount->fetchColumn(), 'Neither future Faculty attempt creates an attendance record');
[$futureSecretaryMarkStatus] = integration_http_json('/api/secretary/attendance/override', $secretaryAccessToken, ['studentId' => '26', 'sessionId' => $queuedId, 'status' => 'present', 'reason' => 'Scheduled fixture attempt']);
expect_same(422, $futureSecretaryMarkStatus, 'Secretary cannot enter attendance before the queued session opens');
[$futureExcuseStatus] = integration_http_json('/api/secretary/excused-requests', $secretaryAccessToken, ['studentId' => '26', 'sessionId' => $queuedId, 'reason' => 'Scheduled fixture attempt']);
expect_same(409, $futureExcuseStatus, 'A queued session cannot be used to finalize future Excused attendance');
[$secretaryOverlapStatus, $secretaryOverlapBody] = integration_http_json('/api/secretary/attendance/session', $secretaryAccessToken, array_merge($queuePayload, ['openingTime' => '09:30', 'presentCutoff' => '10:00', 'lateCutoff' => '11:00', 'classEndTime' => '12:00']));
expect_same(409, $secretaryOverlapStatus, 'Secretary cannot overlap a Faculty booking of the same class');
expect_true(str_contains($secretaryOverlapBody['message'] ?? '', 'Faculty') && str_contains($secretaryOverlapBody['message'] ?? '', $queueDate) && str_contains($secretaryOverlapBody['message'] ?? '', '08:00'), 'Conflict identifies Faculty creator, date and original time range');
$laterPayload = array_merge($queuePayload, ['openingTime' => '11:00', 'presentCutoff' => '12:00', 'lateCutoff' => '13:00', 'classEndTime' => '14:00']);
[$laterStatus, $laterBody] = integration_http_json('/api/secretary/attendance/session', $secretaryAccessToken, $laterPayload);
expect_same(201, $laterStatus, 'Back-to-back Secretary session can coexist in the future queue');
$laterId = (int) ($laterBody['session']['sessionId'] ?? 0);
[$facultyOverlapStatus, $facultyOverlapBody] = integration_http_json('/api/faculty/attendance/session', $seedFacultyAccessToken, $laterPayload);
expect_same(409, $facultyOverlapStatus, 'Faculty cannot overlap a Secretary booking');
expect_true(str_contains($facultyOverlapBody['message'] ?? '', 'Secretary'), 'Conflict identifies the Secretary creator');
[$queueReadStatus, $queueReadBody] = integration_http_get_json('/api/faculty/attendance?csId=' . $meetingClassId . '&date=' . $queueDate, $seedFacultyAccessToken);
expect_same(200, $queueReadStatus, 'Faculty can view a future queue without recording attendance');
expect_same(2, count($queueReadBody['worksheet']['pendingSessions'] ?? []), 'Queue read includes both role bookings');
[$pastQueueStatus] = integration_http_json('/api/faculty/attendance/session', $seedFacultyAccessToken, array_merge($queuePayload, ['sessionDate' => (new DateTimeImmutable('now', $sessionLocalTimezone))->modify('-1 day')->format('Y-m-d')]));
expect_same(422, $pastQueueStatus, 'Faculty cannot create a past-dated session');
[$pastSecretaryStatus] = integration_http_json('/api/secretary/attendance/session', $secretaryAccessToken, array_merge($queuePayload, ['sessionDate' => (new DateTimeImmutable('now', $sessionLocalTimezone))->modify('-1 day')->format('Y-m-d')]));
expect_same(422, $pastSecretaryStatus, 'Secretary cannot create a past-dated session');

// ATT-001 scheduled edits use the same creation contract, preserving history.
$sessionEditPayload = array_merge($queuePayload, [
    'sessionId' => $queuedId, 'csId' => 2147483647,
    'sessionDate' => (new DateTimeImmutable($queueDate))->modify('+1 day')->format('Y-m-d'),
    'openingTime' => '08:10', 'presentCutoff' => '09:10', 'lateCutoff' => '10:10', 'classEndTime' => '10:50',
    'room' => 'Edited Room ' . $scheduleSuffix, 'biometricRequired' => true, 'geofenceEnabled' => true,
    'geofenceLatitude' => 13.1391, 'geofenceLongitude' => 123.7438, 'geofenceRadiusMeters' => 125,
]);
$sessionEditCount = $pdo->prepare('SELECT COUNT(*) FROM attendance_sessions WHERE cs_id = ?');
$sessionEditCount->execute([$meetingClassId]);
$sessionsBeforeEdit = (int) $sessionEditCount->fetchColumn();
$sessionEditRecords = $pdo->prepare('SELECT record_id, attendance_session_id, session_date, session_code, status FROM attendance_records WHERE enrollment_id = ? ORDER BY record_id');
$sessionEditRecords->execute([$futureEnrollmentId]);
$recordsBeforeEdit = $sessionEditRecords->fetchAll(PDO::FETCH_ASSOC);
[$sessionEditStatus, $sessionEditBody] = integration_http_json('/api/faculty/attendance/session/update', $seedFacultyAccessToken, $sessionEditPayload);
expect_same(200, $sessionEditStatus, 'Faculty edits a scheduled session: ' . json_encode($sessionEditBody));
expect_same('ok', $sessionEditBody['status'] ?? null, 'Scheduled edit returns the success envelope');
expect_same($meetingClassId, $sessionEditBody['session']['csId'] ?? null, 'Session edit ignores a different requested class section');
expect_same((string) $queuedId, $sessionEditBody['session']['sessionId'] ?? null, 'Session edit keeps its existing ID');
expect_same($queuedBody['session']['sessionCode'], $sessionEditBody['session']['sessionCode'] ?? null, 'Session edit preserves its original session code');
expect_same('scheduled', $sessionEditBody['session']['status'] ?? null, 'A future edited opening remains scheduled');
foreach (['sessionDate', 'openingTime', 'presentCutoff', 'lateCutoff', 'classEndTime', 'room', 'biometricRequired', 'geofenceEnabled', 'geofenceLatitude', 'geofenceLongitude'] as $editField) {
    expect_same($sessionEditPayload[$editField], $sessionEditBody['session'][$editField] ?? null, 'Session edit returns the new ' . $editField);
}
expect_same(125.0, (float) ($sessionEditBody['session']['geofenceRadiusMeters'] ?? 0), 'Session edit returns the new radius');
$sessionEditAudit = $pdo->prepare("SELECT actor_user_id, actor_role, before_state_json, after_state_json FROM audit_events WHERE action_code = 'attendance_session_updated' AND target_id = ? ORDER BY sequence_number DESC LIMIT 1");
$sessionEditAudit->execute([(string) $queuedId]);
$sessionEditAuditRow = $sessionEditAudit->fetch(PDO::FETCH_ASSOC);
expect_same('faculty', $sessionEditAuditRow['actor_role'] ?? null, 'Scheduled edit audit records the Faculty actor');
expect_same((int) $pdo->query("SELECT user_id FROM user_accounts WHERE login_email = 'faculty@bicol-u.edu.ph'")->fetchColumn(), (int) ($sessionEditAuditRow['actor_user_id'] ?? 0), 'Scheduled edit audit records the acting user ID');
$sessionEditBefore = json_decode($sessionEditAuditRow['before_state_json'], true);
$sessionEditAfter = json_decode($sessionEditAuditRow['after_state_json'], true);
foreach (['session_date' => $queueDate, 'opening_time' => '08:00:00', 'present_cutoff_time' => '09:00:00', 'late_cutoff_time' => '10:00:00', 'class_end_time' => '11:00:00', 'room' => null, 'biometric_required' => false, 'geofence_enabled' => false, 'geofence_latitude' => null, 'geofence_longitude' => null, 'geofence_radius_meters' => null, 'status' => 'scheduled'] as $field => $value) {
    expect_true(array_key_exists($field, $sessionEditBefore) && $sessionEditBefore[$field] === $value, 'Edit audit preserves previous ' . $field);
}
foreach (['session_date' => $sessionEditPayload['sessionDate'], 'opening_time' => '08:10:00', 'present_cutoff_time' => '09:10:00', 'late_cutoff_time' => '10:10:00', 'class_end_time' => '10:50:00', 'room' => $sessionEditPayload['room'], 'biometric_required' => true, 'geofence_enabled' => true, 'geofence_latitude' => '13.139100', 'geofence_longitude' => '123.743800', 'geofence_radius_meters' => '125.00', 'status' => 'scheduled'] as $field => $value) {
    expect_same($value, $sessionEditAfter[$field] ?? null, 'Edit audit records new ' . $field);
}
[$unchangedEditStatus] = integration_http_json('/api/faculty/attendance/session/update', $seedFacultyAccessToken, $sessionEditPayload);
expect_same(200, $unchangedEditStatus, 'An unchanged scheduled edit does not conflict with itself');
[$restoreQueueStatus] = integration_http_json('/api/faculty/attendance/session/update', $seedFacultyAccessToken, $queuePayload + ['sessionId' => $queuedId]);
expect_same(200, $restoreQueueStatus, 'Scheduled edit can restore the original date and times');
[$secretaryForbiddenEditStatus, $secretaryForbiddenEditBody] = integration_http_json('/api/secretary/attendance/session/update', $secretaryAccessToken, $queuePayload + ['sessionId' => $queuedId]);
expect_same(403, $secretaryForbiddenEditStatus, 'Secretary cannot edit a Faculty-created scheduled session');
expect_same('ATTENDANCE_SESSION_EDIT_FORBIDDEN', $secretaryForbiddenEditBody['code'] ?? null, 'Secretary edit denial returns its contract code');
expect_same('You can edit only sessions you created.', $secretaryForbiddenEditBody['message'] ?? null, 'Secretary edit denial returns its exact message');
[$facultySecretaryEditStatus, $facultySecretaryEditBody] = integration_http_json('/api/faculty/attendance/session/update', $seedFacultyAccessToken, array_merge($laterPayload, ['sessionId' => $laterId, 'openingTime' => '11:15', 'room' => 'Faculty edits Secretary booking']));
expect_same(200, $facultySecretaryEditStatus, 'Faculty edits the class Secretary-created scheduled session');
expect_same('11:15', $facultySecretaryEditBody['session']['openingTime'] ?? null, 'Faculty changes the Secretary-created opening time');
[$secretaryOwnEditStatus] = integration_http_json('/api/secretary/attendance/session/update', $secretaryAccessToken, $laterPayload + ['sessionId' => $laterId]);
expect_same(200, $secretaryOwnEditStatus, 'Secretary edits their own session after a Faculty edit');
[$overlapEditStatus, $overlapEditBody] = integration_http_json('/api/faculty/attendance/session/update', $seedFacultyAccessToken, $laterPayload + ['sessionId' => $queuedId]);
expect_same(409, $overlapEditStatus, 'Editing cannot overlap another scheduled session');
expect_same('CONFLICT', $overlapEditBody['code'] ?? null, 'Edit overlap keeps the existing conflict code');
expect_same($facultyOverlapBody['message'] ?? null, $overlapEditBody['message'] ?? null, 'Edit overlap reuses the exact creation conflict message');
[$pastEditStatus, $pastEditBody] = integration_http_json('/api/faculty/attendance/session/update', $seedFacultyAccessToken, array_merge($queuePayload, ['sessionId' => $queuedId, 'sessionDate' => (new DateTimeImmutable('now', $sessionLocalTimezone))->modify('-1 day')->format('Y-m-d')]));
expect_same(422, $pastEditStatus, 'A scheduled session cannot be edited to a past date');
expect_same('VALIDATION_ERROR', $pastEditBody['code'] ?? null, 'Past-date edit reuses creation validation');
expect_same(['sessionDate' => 'Past attendance session dates are not allowed.'], $pastEditBody['errors'] ?? null, 'Past-date edit preserves the exact validation message');
foreach (['faculty' => $seedFacultyAccessToken, 'secretary' => $secretaryAccessToken] as $editRole => $editToken) {
    foreach ([null, 'invalid', true, 0, 2147483648] as $invalidEditId) {
        [$invalidEditStatus, $invalidEditBody] = integration_http_json('/api/' . $editRole . '/attendance/session/update', $editToken, $queuePayload + ['sessionId' => $invalidEditId]);
        expect_same(400, $invalidEditStatus, $editRole . ' edit requires a valid session ID');
        expect_same('BAD_REQUEST', $invalidEditBody['code'] ?? null, 'Invalid edit ID returns BAD_REQUEST');
    }
    [$missingEditStatus, $missingEditBody] = integration_http_json('/api/' . $editRole . '/attendance/session/update', $editToken, $queuePayload + ['sessionId' => 2147483647]);
    expect_same(404, $missingEditStatus, $editRole . ' edit hides missing sessions');
    expect_same('NOT_FOUND', $missingEditBody['code'] ?? null, 'Missing session edit returns NOT_FOUND');
}
$sessionEditCount->execute([$meetingClassId]);
expect_same($sessionsBeforeEdit, (int) $sessionEditCount->fetchColumn(), 'Scheduled edits never create or delete sessions');
$sessionEditRecords->execute([$futureEnrollmentId]);
expect_same($recordsBeforeEdit, $sessionEditRecords->fetchAll(PDO::FETCH_ASSOC), 'Scheduled edits never create or change attendance records');

[$queuedEndStatus] = integration_http_json('/api/faculty/attendance/session/end', $seedFacultyAccessToken, ['sessionId' => $queuedId]);
expect_same(409, $queuedEndStatus, 'Queued sessions cannot resolve future attendance early');
[$queuedRevokeStatus] = integration_http_json('/api/secretary/attendance/session/revoke', $secretaryAccessToken, ['sessionId' => $laterId, 'reason' => 'Fixture cancellation']);
expect_same(200, $queuedRevokeStatus, 'An authorized Secretary can revoke a queued session');
[$revokedEditStatus, $revokedEditBody] = integration_http_json('/api/secretary/attendance/session/update', $secretaryAccessToken, $laterPayload + ['sessionId' => $laterId]);
expect_same(409, $revokedEditStatus, 'Revoked sessions cannot be edited');
expect_same('ATTENDANCE_SESSION_NOT_EDITABLE', $revokedEditBody['code'] ?? null, 'Revoked edit returns NOT_EDITABLE');
[$releasedStatus, $releasedBody] = integration_http_json('/api/faculty/attendance/session', $seedFacultyAccessToken, $laterPayload);
expect_same(201, $releasedStatus, 'Revocation releases the booking period');
$releasedId = (int) ($releasedBody['session']['sessionId'] ?? 0);
// Migration 039 preserves old active rows without an end time. They must not
// make a different calendar day's scheduled opening fail its unique index.
$legacySession = $pdo->prepare("INSERT INTO attendance_sessions (cs_id, secretary_user_id, owner_user_id, session_date, session_code, started_at, status)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 'active') RETURNING session_id");
$legacySession->execute([$meetingClassId, $secretaryFixtureUserId, (int) $pdo->query("SELECT user_id FROM user_accounts WHERE login_email = 'faculty@bicol-u.edu.ph'")->fetchColumn(), app_local_date($sessionConfig, new DateTimeImmutable('-1 day', new DateTimeZone('UTC'))), 'LEGACY-' . $scheduleSuffix]);
$legacySessionId = (int) $legacySession->fetchColumn();
// A deterministic lifecycle clock exercises opening without waiting for a future day.
attendance_sessions_open_due($pdo, $sessionConfig, attendance_session_request_context(), new DateTimeImmutable($queueDate . ' 08:05:00', $sessionLocalTimezone));
$queueState = $pdo->prepare('SELECT status FROM attendance_sessions WHERE session_id = ?');
$queueState->execute([$queuedId]);
expect_same('active', $queueState->fetchColumn(), 'Due queued session opens automatically');
[$activeEditStatus, $activeEditBody] = integration_http_json('/api/faculty/attendance/session/update', $seedFacultyAccessToken, $queuePayload + ['sessionId' => $queuedId]);
expect_same(409, $activeEditStatus, 'Active sessions cannot be edited');
expect_same('ATTENDANCE_SESSION_NOT_EDITABLE', $activeEditBody['code'] ?? null, 'Active edit returns NOT_EDITABLE');
expect_same('Only scheduled sessions can be edited.', $activeEditBody['message'] ?? null, 'Active edit returns the exact status message');
$queueState->execute([$legacySessionId]);
expect_same('active', $queueState->fetchColumn(), 'Legacy session history is preserved without blocking the scheduled opening');
$queueState->execute([$releasedId]);
expect_same('scheduled', $queueState->fetchColumn(), 'A later booking remains scheduled');
$autoOpenAudit = $pdo->prepare("SELECT COUNT(*) FROM audit_events WHERE action_code = 'attendance_session_auto_opened' AND target_id = ?");
$autoOpenAudit->execute([(string) $queuedId]);
expect_same(1, (int) $autoOpenAudit->fetchColumn(), 'Automatic opening appends its system audit event once');
attendance_sessions_open_due($pdo, $sessionConfig, attendance_session_request_context(), new DateTimeImmutable($queueDate . ' 08:05:00', $sessionLocalTimezone));
$autoOpenAudit->execute([(string) $queuedId]);
expect_same(1, (int) $autoOpenAudit->fetchColumn(), 'Repeated lifecycle reads do not duplicate opening audits');
$openingLockPdo = create_pdo($sessionConfig);
$openingLockPdo->beginTransaction();
$openingLockPdo->prepare('SELECT session_id FROM attendance_sessions WHERE session_id = ? FOR UPDATE')->execute([$queuedId]);
try {
    attendance_sessions_open_due($pdo, $sessionConfig, attendance_session_request_context(), new DateTimeImmutable($queueDate . ' 11:05:00', $sessionLocalTimezone));
    $queueState->execute([$releasedId]);
    expect_same('scheduled', $queueState->fetchColumn(), 'A locked active predecessor defers the next opening without a unique-index error');
} finally {
    $openingLockPdo->rollBack();
}
$pdo->prepare("UPDATE attendance_sessions SET status = 'ended', ended_at = ? WHERE session_id = ?")->execute([$queueDate . ' 03:00:00', $queuedId]);
[$endedEditStatus, $endedEditBody] = integration_http_json('/api/faculty/attendance/session/update', $seedFacultyAccessToken, $queuePayload + ['sessionId' => $queuedId]);
expect_same(409, $endedEditStatus, 'Ended sessions cannot be edited');
expect_same('ATTENDANCE_SESSION_NOT_EDITABLE', $endedEditBody['code'] ?? null, 'Ended edit returns NOT_EDITABLE');
attendance_sessions_open_due($pdo, $sessionConfig, attendance_session_request_context(), new DateTimeImmutable($queueDate . ' 11:05:00', $sessionLocalTimezone));
$queueState->execute([$releasedId]);
expect_same('active', $queueState->fetchColumn(), 'The deferred session opens after its predecessor ends');
// A rollback probe verifies that a result in one session does not cover the next.
$pdo->beginTransaction();
try {
    $pdo->prepare("UPDATE attendance_sessions SET status = 'ended', ended_at = ? WHERE session_id = ?")->execute([$queueDate . ' 06:00:00', $releasedId]);
    $pdo->prepare("INSERT INTO attendance_records (enrollment_id, attendance_session_id, session_date, session_code, status, verification_method)
        SELECT e.enrollment_id, s.session_id, s.session_date, s.session_code, 'present', 'manual_faculty'
        FROM enrollments e JOIN attendance_sessions s ON s.cs_id = e.cs_id WHERE s.session_id = ?")->execute([$queuedId]);
    expect_same(1, attendance_session_resolve_absences($pdo, $releasedId, new DateTimeImmutable($queueDate . ' 06:00:00', new DateTimeZone('UTC'))), 'Present in the first session does not suppress absence in the next session');
} finally {
    $pdo->rollBack();
}
$excuseDate = (new DateTimeImmutable('now', $sessionLocalTimezone))->modify('-2 days')->format('Y-m-d');
$excuseSessions = [];
foreach (['A', 'B'] as $label) {
    $fixtureInsert = $pdo->prepare("INSERT INTO attendance_sessions (cs_id, secretary_user_id, owner_user_id, session_date, session_code, started_at, ended_at, status)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'ended') RETURNING session_id");
    $fixtureInsert->execute([$meetingClassId, $secretaryFixtureUserId, $secretaryFixtureUserId, $excuseDate, 'EXCUSE-' . $scheduleSuffix . '-' . $label]);
    $excuseSessions[$label] = (int) $fixtureInsert->fetchColumn();
}
$legacyReadDate = (new DateTimeImmutable($excuseDate))->modify('-1 day')->format('Y-m-d');
$fixtureInsert->execute([$meetingClassId, $secretaryFixtureUserId, $secretaryFixtureUserId, $legacyReadDate, 'LEGACY-READ-' . $scheduleSuffix]);
$legacyReadSessionId = (int) $fixtureInsert->fetchColumn();
$pdo->prepare("INSERT INTO attendance_records (enrollment_id, session_date, session_code, status, verification_method)
    SELECT enrollment_id, ?, ?, 'late', 'manual_faculty' FROM enrollments WHERE cs_id = ? AND student_id = 26")
    ->execute([$legacyReadDate, 'LEGACY-MARK-' . $scheduleSuffix, $meetingClassId]);
[$legacyWorksheetStatus, $legacyWorksheetBody] = integration_http_get_json('/api/faculty/attendance?csId=' . $meetingClassId . '&date=' . $legacyReadDate . '&sessionId=' . $legacyReadSessionId, $seedFacultyAccessToken);
expect_same('late', $legacyWorksheetBody['worksheet']['roster'][0]['status'] ?? null, 'Explicit Faculty session reads retain the unlinked day mark');
[$legacySecretaryStatus, $legacySecretaryBody] = integration_http_get_json('/api/secretary/attendance?sessionId=' . $legacyReadSessionId, $secretaryAccessToken);
expect_same(1, count($legacySecretaryBody['records'] ?? []), 'Legacy day mark remains in the scoped Secretary roster');
expect_same('late', $legacySecretaryBody['records'][0]['status'] ?? null, 'Secretary session reads retain the legacy day status');
$pdo->prepare("INSERT INTO attendance_records (enrollment_id, attendance_session_id, session_date, session_code, status, verification_method)
    SELECT e.enrollment_id, s.session_id, s.session_date, s.session_code, 'present', 'manual_faculty'
    FROM enrollments e JOIN attendance_sessions s ON s.cs_id = e.cs_id WHERE s.session_id = ?")->execute([$legacyReadSessionId]);
[$legacySpecificStatus, $legacySpecificBody] = integration_http_get_json('/api/secretary/attendance?sessionId=' . $legacyReadSessionId, $secretaryAccessToken);
expect_same(1, count($legacySpecificBody['records'] ?? []), 'A session-specific result replaces its legacy fallback without a duplicate student');
expect_same('present', $legacySpecificBody['records'][0]['status'] ?? null, 'Secretary prefers the session result to its legacy day fallback');
$correctionLockPdo = create_pdo($sessionConfig);
$correctionLockPdo->beginTransaction();
$correctionLockPdo->prepare('SELECT record_id FROM attendance_records WHERE record_id = ? FOR UPDATE')->execute([(int) $legacySpecificBody['records'][0]['id']]);
$correctionSocket = integration_http_async_json('/api/secretary/attendance/override', $secretaryAccessToken, ['studentId' => '26', 'recordId' => (int) $legacySpecificBody['records'][0]['id'], 'status' => 'late', 'reason' => 'Lock order correction regression']);
try {
    $waitingForRecord = false;
    for ($attempt = 0; $attempt < 100; $attempt++) {
        $waitingForRecord = (int) $pdo->query("SELECT COUNT(*) FROM pg_stat_activity WHERE pid <> pg_backend_pid() AND wait_event_type = 'Lock' AND query LIKE '%r.record_id, r.attendance_session_id, r.status, cs.cs_id%'")->fetchColumn() > 0;
        if ($waitingForRecord) break;
        usleep(10000);
    }
    expect_true($waitingForRecord, 'Secretary correction reaches the locked attendance record');
    $pdo->beginTransaction();
    try {
        $pdo->query("SELECT setting_key FROM system_settings WHERE setting_key = 'audit_chain_head' FOR UPDATE NOWAIT");
        expect_true(true, 'A waiting Secretary correction does not hold the audit head before its attendance locks');
    } finally {
        $pdo->rollBack();
    }
} finally {
    $correctionLockPdo->rollBack();
}
[$correctionLockStatus] = integration_http_async_read($correctionSocket);
expect_same(200, $correctionLockStatus, 'Secretary correction completes and audits after the record lock is released');
[$scopedRequestStatus, $scopedRequestBody] = integration_http_json('/api/secretary/excused-requests', $secretaryAccessToken, ['studentId' => '26', 'sessionId' => $excuseSessions['A'], 'reason' => 'Excused fixture session A']);
expect_same(201, $scopedRequestStatus, 'Secretary requests Excused for one session before its attendance row exists');
$scopedRequestId = (int) $scopedRequestBody['request']['id'];
foreach (['A' => 'absent', 'B' => 'present'] as $label => $mark) {
    $pdo->prepare("INSERT INTO attendance_records (enrollment_id, attendance_session_id, session_date, session_code, status, verification_method)
        SELECT e.enrollment_id, s.session_id, s.session_date, s.session_code, ?, 'system_resolution'
        FROM enrollments e JOIN attendance_sessions s ON s.cs_id = e.cs_id WHERE s.session_id = ?")->execute([$mark, $excuseSessions[$label]]);
}
[$specificSecretaryStatus, $specificSecretaryBody] = integration_http_get_json('/api/secretary/attendance?sessionId=' . $excuseSessions['A'], $secretaryAccessToken);
expect_same(1, count($specificSecretaryBody['records'] ?? []), 'Session-specific result replaces the legacy fallback without duplicating a student');
expect_same('absent', $specificSecretaryBody['records'][0]['status'] ?? null, 'Secretary prefers the selected session result over the legacy day mark');
$scopedRequestRows = attendance_excused_requests_rows($pdo, 'xr.request_id = ?', [$scopedRequestId]);
expect_same('absent', $scopedRequestRows[0]['currentStatus'], 'Excused request displays its own session status rather than a newer session result');
[$scopedApprovalStatus] = integration_http_json('/api/faculty/excused-requests/decide', $seedFacultyAccessToken, ['requestId' => $scopedRequestId, 'decision' => 'approve']);
expect_same(200, $scopedApprovalStatus, 'Faculty approves the selected session Excused request');
$scopedMarks = $pdo->prepare('SELECT status FROM attendance_records WHERE attendance_session_id = ?');
$scopedMarks->execute([$excuseSessions['A']]);
expect_same('excused', $scopedMarks->fetchColumn(), 'Approval changes the requested session to Excused');
$scopedMarks->execute([$excuseSessions['B']]);
expect_same('present', $scopedMarks->fetchColumn(), 'Approval preserves the other same-day session result');
foreach ([$queuedId, $releasedId, $legacySessionId] as $fixtureSessionId) {
    integration_http_json('/api/faculty/attendance/session/revoke', $seedFacultyAccessToken, ['sessionId' => $fixtureSessionId, 'reason' => 'Fixture cleanup preserves history']);
}
// Concurrent requests share the class lock: one booking succeeds, one reports its creator.
$concurrentPayload = array_merge($queuePayload, ['sessionDate' => (new DateTimeImmutable($queueDate))->modify('+1 day')->format('Y-m-d')]);
$facultySocket = integration_http_async_json('/api/faculty/attendance/session', $seedFacultyAccessToken, $concurrentPayload);
$secretarySocket = integration_http_async_json('/api/secretary/attendance/session', $secretaryAccessToken, $concurrentPayload);
[$concurrentFacultyStatus] = integration_http_async_read($facultySocket);
[$concurrentSecretaryStatus] = integration_http_async_read($secretarySocket);
$bookingStatuses = [$concurrentFacultyStatus, $concurrentSecretaryStatus];
sort($bookingStatuses);
expect_same([201, 409], $bookingStatuses, 'Concurrent Faculty/Secretary booking produces one success and one conflict');
$pdo->prepare("UPDATE class_sections SET status = 'Archived' WHERE cs_id = ?")->execute([$meetingClassId]);
