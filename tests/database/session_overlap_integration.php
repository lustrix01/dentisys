<?php

declare(strict_types=1);
// Included by postgres_integration_test.php after the Faculty/Secretary logins (ATT-001, CLS-001, CLS-002, 2026-11-06).
// Needs: $pdo, $seedFacultyAccessToken, $secretaryAccessToken, $secretaryFixtureUserId, $sessionConfig, $sessionLocalTimezone.
$ovSuffix = strtoupper(bin2hex(random_bytes(3)));
$ovYear = academic_current_school_year($pdo);
$ovDay = static fn(int $days): string => (new DateTimeImmutable('now', $sessionLocalTimezone))->modify('+' . $days . ' days')->format('Y-m-d');
$ovFacultyId = (int) $pdo->query("SELECT user_id FROM user_accounts WHERE login_email = 'faculty@bicol-u.edu.ph'")->fetchColumn();
$ovOtherStmt = $pdo->prepare("INSERT INTO user_accounts (login_email, password_hash, role, display_name, status, created_at)
    VALUES (?, ?, 'faculty', 'Prof. Other ' || ?, 'Active', CURRENT_TIMESTAMP(6)) RETURNING user_id");
$ovOtherStmt->execute(['ov-other-' . strtolower($ovSuffix) . '@bicol-u.edu.ph', password_hash('FixturePass1!', PASSWORD_DEFAULT), $ovSuffix]);
$ovOtherId = (int) $ovOtherStmt->fetchColumn();
$ovClassInsert = $pdo->prepare("INSERT INTO class_sections (cs_name, course_id, instructor_user_id, secretary_user_id, semester, school_year, status, term_start_date, term_end_date)
    VALUES (?, 1, ?, ?, ?, ?, 'Active', ?, ?) RETURNING cs_id");
$ovClass = static function (string $name, int $instructor, ?int $secretary, string $semester = '1ST', ?string $year = null, ?string $from = null, ?string $to = null) use ($ovClassInsert, $ovYear, $ovSuffix): int {
    $ovClassInsert->execute([$name . '-' . $ovSuffix, $instructor, $secretary, $semester, $year ?? $ovYear, $from, $to]);
    return (int) $ovClassInsert->fetchColumn();
};
$ovA = $ovClass('OVA', $ovFacultyId, $secretaryFixtureUserId);
$ovB = $ovClass('OVB', $ovOtherId, null);
$ovC = $ovClass('OVC', $ovFacultyId, null);
$ovBook = $pdo->prepare("INSERT INTO attendance_sessions (cs_id, secretary_user_id, owner_user_id, session_date, session_code, room, status, opening_time, present_cutoff_time, late_cutoff_time, class_end_time, created_by_role)
    VALUES (?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, ?, ?, 'faculty') RETURNING session_id");
$ovBooked = static function (int $csId, int $owner, string $date, string $room, string $open, string $end) use ($ovBook, $secretaryFixtureUserId): int {
    $present = DateTimeImmutable::createFromFormat('!H:i', $open)->modify('+1 minute')->format('H:i');
    $ovBook->execute([$csId, $secretaryFixtureUserId, $owner, $date, 'OV-' . bin2hex(random_bytes(4)), $room, $open, $present, $end, $end]);
    return (int) $ovBook->fetchColumn();
};
$ovRevoke = static function (int ...$ids) use ($pdo): void {
    foreach ($ids as $id) $pdo->prepare("UPDATE attendance_sessions SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP WHERE session_id = ?")->execute([$id]);
};
// Present and Late must follow the opening, so every fixture opens a minute apart.
$ovTimes = static function (string $open, string $end, array $extra = []) : array {
    $t = DateTimeImmutable::createFromFormat('!H:i', $open);
    return ['openingTime' => $open, 'presentCutoff' => $t->modify('+1 minute')->format('H:i'), 'lateCutoff' => $t->modify('+2 minutes')->format('H:i'), 'classEndTime' => $end] + $extra;
};
$ovSession = static fn(int $csId, string $date, string $open, string $end, ?string $room, array $extra = []): array
    => array_filter(['csId' => $csId, 'sessionDate' => $date, 'room' => $room, 'biometricRequired' => false, 'geofenceEnabled' => false] + $ovTimes($open, $end, $extra), static fn($v): bool => $v !== null);
$ovNotices = static function (int $userId) use ($pdo): int {
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM notifications WHERE recipient_user_id = ? AND notification_type = 'room_overlap'");
    $stmt->execute([$userId]);
    return (int) $stmt->fetchColumn();
};
$ovAudit = static function (string $action, int $target) use ($pdo): int {
    $stmt = $pdo->prepare('SELECT COUNT(*) FROM audit_events WHERE action_code = ? AND target_id = ?');
    $stmt->execute([$action, (string) $target]);
    return (int) $stmt->fetchColumn();
};
$ovRoom = 'OV Room ' . $ovSuffix;
$ovRoomVariant = 'ov.room-' . strtolower($ovSuffix);

// (a) Another class's session in the same room (name match ignores case, spaces, dashes and dots).
$ovDate = $ovDay(30);
$ovBSession = $ovBooked($ovB, $ovOtherId, $ovDate, $ovRoom, '09:00', '11:00');
$ovAPayload = $ovSession($ovA, $ovDate, '10:00', '12:00', $ovRoomVariant);
[$ovStatus, $ovBody] = integration_http_json('/api/faculty/attendance/session', $seedFacultyAccessToken, $ovAPayload);
expect_same(409, $ovStatus, 'Faculty booking over another class in the same room asks to confirm');
expect_same('SESSION_OVERLAP', $ovBody['code'] ?? null, 'The overlap 409 carries SESSION_OVERLAP');
expect_same('This booking overlaps with other bookings.', $ovBody['message'] ?? null, 'The overlap 409 carries the agreed message');
$ovFirst = $ovBody['overlaps'][0] ?? [];
expect_same([1, 'session', 'room', $ovB, false, $ovDate, '09:00', '11:00'], [count($ovBody['overlaps'] ?? []), $ovFirst['kind'] ?? null, $ovFirst['reason'] ?? null, $ovFirst['classId'] ?? null, $ovFirst['isOwn'] ?? null, $ovFirst['date'] ?? null, $ovFirst['start'] ?? null, $ovFirst['end'] ?? null], 'The overlap entry describes the other session');
expect_true(($ovFirst['facultyName'] ?? '') !== '' && ($ovFirst['room'] ?? '') === $ovRoom, 'The overlap entry names the Faculty and the room');
$ovCount = $pdo->prepare('SELECT COUNT(*) FROM attendance_sessions WHERE cs_id = ?');
$ovCount->execute([$ovA]);
expect_same(0, (int) $ovCount->fetchColumn(), 'An unconfirmed overlap saves nothing');
$ovOtherBefore = $ovNotices($ovOtherId);
$ovSelfBefore = $ovNotices($ovFacultyId);
[$ovStatus, $ovBody] = integration_http_json('/api/faculty/attendance/session', $seedFacultyAccessToken, $ovAPayload + ['confirmOverlap' => true]);
expect_same(201, $ovStatus, 'Book anyway saves the overlapping session: ' . json_encode($ovBody));
$ovASession = (int) ($ovBody['session']['sessionId'] ?? 0);
expect_same($ovOtherBefore + 1, $ovNotices($ovOtherId), 'The other Faculty gets one overlap notice');
expect_same($ovSelfBefore, $ovNotices($ovFacultyId), 'The booking Faculty gets no notice about their own booking');
$ovNote = $pdo->prepare("SELECT body FROM notifications WHERE recipient_user_id = ? AND notification_type = 'room_overlap' ORDER BY notification_id DESC LIMIT 1");
$ovNote->execute([$ovOtherId]);
$ovNoteBody = (string) $ovNote->fetchColumn();
expect_true(str_contains($ovNoteBody, 'OVA-' . $ovSuffix) && str_contains($ovNoteBody, 'OVB-' . $ovSuffix) && str_contains($ovNoteBody, '10:00 AM'), 'The notice names both classes and the time: ' . $ovNoteBody);
expect_same(1, $ovAudit('attendance_session_overlap_confirmed', $ovASession), 'Booking anyway is audited');
// Every save checks again: an edit asks again and notifies again.
[$ovStatus, $ovBody] = integration_http_json('/api/faculty/attendance/session/update', $seedFacultyAccessToken, ['sessionId' => $ovASession, 'classEndTime' => '12:30']);
expect_same([409, 'SESSION_OVERLAP'], [$ovStatus, $ovBody['code'] ?? null], 'Editing a booked-anyway session asks again');
[$ovStatus] = integration_http_json('/api/faculty/attendance/session/update', $seedFacultyAccessToken, ['sessionId' => $ovASession, 'classEndTime' => '12:30', 'confirmOverlap' => true]);
expect_same(200, $ovStatus, 'Confirming the edit saves it');
expect_same($ovOtherBefore + 2, $ovNotices($ovOtherId), 'A confirmed edit notifies again');
// The same-class overlap is still a hard conflict, with or without confirmation.
[$ovStatus, $ovBody] = integration_http_json('/api/faculty/attendance/session', $seedFacultyAccessToken, $ovSession($ovA, $ovDate, '11:00', '13:00', $ovRoomVariant, ['confirmOverlap' => true]));
expect_same([409, 'CONFLICT'], [$ovStatus, $ovBody['code'] ?? null], 'Overlapping the same class stays a hard conflict');
// Touching times do not overlap.
[$ovStatus, $ovBody] = integration_http_json('/api/faculty/attendance/session', $seedFacultyAccessToken, $ovSession($ovA, $ovDay(31), '11:00', '12:00', $ovRoom));
expect_same(201, $ovStatus, 'A session starting when the other ends does not overlap');
$ovRevoke((int) ($ovBody['session']['sessionId'] ?? 0));
// The Secretary gets the same check and is named in the audit.
$ovSecDate = $ovDay(32);
$ovBSecond = $ovBooked($ovB, $ovOtherId, $ovSecDate, $ovRoom, '09:00', '11:00');
$ovSecPayload = $ovSession($ovA, $ovSecDate, '08:00', '09:30', $ovRoom);
[$ovStatus, $ovBody] = integration_http_json('/api/secretary/attendance/session', $secretaryAccessToken, $ovSecPayload);
expect_same([409, 'SESSION_OVERLAP'], [$ovStatus, $ovBody['code'] ?? null], 'Secretary booking over another class asks to confirm');
[$ovStatus, $ovBody] = integration_http_json('/api/secretary/attendance/session', $secretaryAccessToken, $ovSecPayload + ['confirmOverlap' => true]);
expect_same(201, $ovStatus, 'Secretary can book anyway: ' . json_encode($ovBody));
$ovSecSession = (int) ($ovBody['session']['sessionId'] ?? 0);
$ovActor = $pdo->prepare("SELECT actor_role FROM audit_events WHERE action_code = 'attendance_session_overlap_confirmed' AND target_id = ?");
$ovActor->execute([(string) $ovSecSession]);
expect_same('secretary', strtolower((string) $ovActor->fetchColumn()), 'The audit names the Secretary who confirmed');
$ovRevoke($ovASession, $ovBSession, $ovBSecond, $ovSecSession);

// (b) Same Faculty teaching another class at that time (joint block sessions): asks, but nobody is notified.
$ovJointDate = $ovDay(33);
$ovCSession = $ovBooked($ovC, $ovFacultyId, $ovJointDate, 'Other Place ' . $ovSuffix, '14:00', '16:00');
$ovJoint = $ovSession($ovA, $ovJointDate, '15:00', '17:00', 'Joint Place ' . $ovSuffix);
[$ovStatus, $ovBody] = integration_http_json('/api/faculty/attendance/session', $seedFacultyAccessToken, $ovJoint);
expect_same([409, 'faculty', true, $ovC], [$ovStatus, $ovBody['overlaps'][0]['reason'] ?? null, $ovBody['overlaps'][0]['isOwn'] ?? null, $ovBody['overlaps'][0]['classId'] ?? null], 'Same Faculty, different room: reason faculty and isOwn');
$ovSelfBefore = $ovNotices($ovFacultyId);
[$ovStatus, $ovBody] = integration_http_json('/api/faculty/attendance/session', $seedFacultyAccessToken, $ovJoint + ['confirmOverlap' => true]);
expect_same(201, $ovStatus, 'A joint session can be booked anyway');
expect_same($ovSelfBefore, $ovNotices($ovFacultyId), 'A joint session sends no notice to the same Faculty');
$ovRevoke($ovCSession, (int) ($ovBody['session']['sessionId'] ?? 0));

// (c) Another class's weekly meeting in that room, inside its term.
$ovFriday = (new DateTimeImmutable('2093-09-01'))->modify('next friday')->format('Y-m-d');
$ovW = $ovClass('OVW', $ovOtherId, null, '1ST', '2093-2094', '2093-08-01', '2093-12-01');
$pdo->prepare("INSERT INTO class_meetings (cs_id, component, weekday, room, start_time, end_time) VALUES (?, 'Lecture', 'Fri', ?, '09:00', '11:00')")->execute([$ovW, $ovRoom]);
$pdo->prepare('UPDATE class_sections SET meetings_recorded = true WHERE cs_id = ?')->execute([$ovW]);
[$ovStatus, $ovBody] = integration_http_json('/api/faculty/attendance/session', $seedFacultyAccessToken, $ovSession($ovA, $ovFriday, '10:00', '12:00', $ovRoom));
expect_same(['SESSION_OVERLAP', 'schedule', 'Fri', $ovW], [$ovBody['code'] ?? null, $ovBody['overlaps'][0]['kind'] ?? null, $ovBody['overlaps'][0]['weekday'] ?? null, $ovBody['overlaps'][0]['classId'] ?? null], 'A weekly meeting in the same room asks to confirm');
[$ovStatus, $ovBody] = integration_http_json('/api/faculty/attendance/session', $seedFacultyAccessToken, $ovSession($ovA, $ovFriday, '11:00', '12:00', $ovRoom));
expect_same(201, $ovStatus, 'A session starting when the weekly meeting ends does not overlap');
$ovRevoke((int) ($ovBody['session']['sessionId'] ?? 0));
[$ovStatus, $ovBody] = integration_http_json('/api/faculty/attendance/session', $seedFacultyAccessToken, $ovSession($ovA, (new DateTimeImmutable($ovFriday))->modify('+1 day')->format('Y-m-d'), '10:00', '12:00', $ovRoom));
expect_same(201, $ovStatus, 'A weekly meeting on another weekday does not overlap');
$ovRevoke((int) ($ovBody['session']['sessionId'] ?? 0));
[$ovStatus, $ovBody] = integration_http_json('/api/faculty/attendance/session', $seedFacultyAccessToken, $ovSession($ovA, (new DateTimeImmutable($ovFriday))->modify('+14 weeks')->format('Y-m-d'), '10:00', '12:00', $ovRoom));
expect_same(201, $ovStatus, 'A weekly meeting does not overlap a session after its term');
$ovRevoke((int) ($ovBody['session']['sessionId'] ?? 0));

// (d) At most 12 hours; crossing midnight stays allowed.
[$ovStatus, $ovBody] = integration_http_json('/api/faculty/attendance/session', $seedFacultyAccessToken, $ovSession($ovA, $ovDay(40), '08:00', '21:00', 'Long Room ' . $ovSuffix));
expect_same([422, 'classEndTime', 'A session can last at most 12 hours.'], [$ovStatus, $ovBody['errors'][0]['field'] ?? null, $ovBody['errors'][0]['message'] ?? null], 'A 13 hour session is refused');
[$ovStatus, $ovBody] = integration_http_json('/api/faculty/attendance/session', $seedFacultyAccessToken, $ovSession($ovA, $ovDay(40), '23:00', '01:00', 'Long Room ' . $ovSuffix));
expect_same(201, $ovStatus, 'A session from 23:00 to 01:00 is accepted');
$ovRevoke((int) ($ovBody['session']['sessionId'] ?? 0));

// (e) A room is required, for create, Secretary create and edit.
foreach ([null, '', '   '] as $ovBlank) {
    [$ovStatus, $ovBody] = integration_http_json('/api/faculty/attendance/session', $seedFacultyAccessToken, $ovSession($ovA, $ovDay(41), '08:00', '10:00', $ovBlank));
    expect_same([422, 'Choose a room or type the place where the session happens.'], [$ovStatus, $ovBody['errors']['room'] ?? null], 'Faculty session without a room is refused');
}
[$ovStatus] = integration_http_json('/api/secretary/attendance/session', $secretaryAccessToken, $ovSession($ovA, $ovDay(41), '08:00', '10:00', null));
expect_same(422, $ovStatus, 'Secretary session without a room is refused');
$ovOld = $ovBooked($ovA, $ovFacultyId, $ovDay(42), 'Temp', '08:00', '10:00');
$pdo->prepare('UPDATE attendance_sessions SET room = NULL WHERE session_id = ?')->execute([$ovOld]);
[$ovStatus] = integration_http_json('/api/faculty/attendance/session/update', $seedFacultyAccessToken, ['sessionId' => $ovOld, 'classEndTime' => '10:30']);
expect_same(422, $ovStatus, 'Editing an old session without a room asks for one');
[$ovStatus] = integration_http_json('/api/faculty/attendance/session/update', $seedFacultyAccessToken, ['sessionId' => $ovOld, 'classEndTime' => '10:30', 'room' => 'Fresh Room ' . $ovSuffix]);
expect_same(200, $ovStatus, 'Giving the old session a room lets the edit save');

// (f) A retired room is refused for sessions (create and edit) and for the class save.
$ovRetiredName = 'Retired OV ' . $ovSuffix;
$pdo->prepare("INSERT INTO rooms (name, category_id, status, retired_at) VALUES (?, (SELECT MIN(category_id) FROM room_categories), 'retired', CURRENT_TIMESTAMP)")->execute([$ovRetiredName]);
$ovRetiredMessage = $ovRetiredName . ' was retired by the Dean. Pick another room.';
[$ovStatus, $ovBody] = integration_http_json('/api/faculty/attendance/session', $seedFacultyAccessToken, $ovSession($ovA, $ovDay(43), '08:00', '10:00', strtolower(str_replace(' ', '', $ovRetiredName))));
expect_same([422, $ovRetiredMessage], [$ovStatus, $ovBody['errors']['room'] ?? null], 'A retired room typed as a custom room is refused for Faculty');
[$ovStatus] = integration_http_json('/api/secretary/attendance/session', $secretaryAccessToken, $ovSession($ovA, $ovDay(43), '08:00', '10:00', $ovRetiredName));
expect_same(422, $ovStatus, 'A retired room is refused for the Secretary');
[$ovStatus] = integration_http_json('/api/faculty/attendance/session/update', $seedFacultyAccessToken, ['sessionId' => $ovOld, 'room' => $ovRetiredName]);
expect_same(422, $ovStatus, 'A retired room is refused when editing a scheduled session');
$pdo->prepare('UPDATE attendance_sessions SET room = ? WHERE session_id = ?')->execute([$ovRetiredName, $ovOld]);
[$ovStatus] = integration_http_json('/api/faculty/attendance/session/update', $seedFacultyAccessToken, ['sessionId' => $ovOld, 'classEndTime' => '10:45']);
expect_same(422, $ovStatus, 'A scheduled session whose saved room is retired cannot be saved until the room changes');
$ovRevoke($ovOld);
$ovClassPayload = static fn(array $extra): array => $extra + ['csName' => 'OV Class ' . $ovSuffix, 'courseCode' => 'OVC' . $ovSuffix, 'courseName' => 'Overlap Fixture',
    'semester' => '1ST', 'schoolYear' => $ovYear, 'yearLevel' => 4, 'block' => 'OV', 'lectureUnits' => 3, 'labUnits' => null];
[$ovStatus, $ovBody] = integration_http_json('/api/faculty/classes', $seedFacultyAccessToken, $ovClassPayload(['lecRoom' => $ovRetiredName]));
expect_same(422, $ovStatus, 'Creating a class with a retired lecture room is refused: ' . json_encode($ovBody));
expect_true(str_contains(json_encode($ovBody), $ovRetiredMessage), 'The class refusal names the retired room');
[$ovStatus] = integration_http_json('/api/faculty/classes', $seedFacultyAccessToken, $ovClassPayload(['meetings' => [['component' => 'Lecture', 'day' => 'Mon', 'room' => $ovRetiredName, 'startTime' => '20:00', 'endTime' => '21:00']]]));
expect_same(422, $ovStatus, 'Creating a class with a retired meeting room is refused');

// (g) F5: a scheduled session does not open while the same class still has a session running from yesterday.
$ovYesterday = $ovDay(-1);
$ovToday = $ovDay(0);
$pdo->prepare("INSERT INTO attendance_sessions (cs_id, secretary_user_id, owner_user_id, session_date, session_code, room, started_at, status, opening_time, present_cutoff_time, late_cutoff_time, class_end_time, created_by_role)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 'active', '23:00', '23:30', '00:30', '02:00', 'faculty')")->execute([$ovA, $secretaryFixtureUserId, $ovFacultyId, $ovYesterday, 'OV-NIGHT-' . $ovSuffix, $ovRoom]);
$ovNightId = (int) $pdo->query("SELECT session_id FROM attendance_sessions WHERE session_code = 'OV-NIGHT-" . $ovSuffix . "'")->fetchColumn();
$ovMorning = $ovBooked($ovA, $ovFacultyId, $ovToday, $ovRoom, '01:00', '01:45');
$ovState = $pdo->prepare('SELECT status FROM attendance_sessions WHERE session_id = ?');
attendance_sessions_open_due($pdo, $sessionConfig, attendance_session_request_context(), new DateTimeImmutable($ovToday . ' 01:00:00', $sessionLocalTimezone));
$ovState->execute([$ovMorning]);
expect_same('scheduled', $ovState->fetchColumn(), 'A scheduled session waits while the same class has an overnight session running');
$pdo->prepare("UPDATE attendance_sessions SET status = 'ended', ended_at = CURRENT_TIMESTAMP WHERE session_id = ?")->execute([$ovNightId]);
attendance_sessions_open_due($pdo, $sessionConfig, attendance_session_request_context(), new DateTimeImmutable($ovToday . ' 01:00:00', $sessionLocalTimezone));
$ovState->execute([$ovMorning]);
expect_same('active', $ovState->fetchColumn(), 'The waiting session opens once the overnight session has ended');
$pdo->prepare("UPDATE attendance_sessions SET status = 'ended', ended_at = CURRENT_TIMESTAMP WHERE session_id = ?")->execute([$ovMorning]);

// (h) Class schedules: the hard conflict covers one school year and semester; a booked session asks first.
$ovX = $ovClass('OVX', $ovOtherId, null, '1ST');
$pdo->prepare("INSERT INTO class_meetings (cs_id, component, weekday, room, start_time, end_time) VALUES (?, 'Lecture', 'Mon', ?, '08:00', '10:00')")->execute([$ovX, 'Sem Room ' . $ovSuffix]);
$pdo->prepare('UPDATE class_sections SET meetings_recorded = true WHERE cs_id = ?')->execute([$ovX]);
$ovMeeting = [['component' => 'Lecture', 'day' => 'Mon', 'room' => 'sem-room ' . $ovSuffix, 'startTime' => '09:00', 'endTime' => '11:00']];
expect_true(class_meetings_conflict($pdo, $ovYear, '1ST', $ovFacultyId, $ovMeeting, 0) !== null, 'The same semester still blocks the same room and slot');
expect_same(null, class_meetings_conflict($pdo, $ovYear, '2ND', $ovFacultyId, $ovMeeting, 0), 'A 2nd semester class can take a 1st semester class room and slot');
expect_same(null, class_meetings_conflict($pdo, $ovYear, 'SUMMER', $ovFacultyId, $ovMeeting, 0), 'Summer is its own semester');
$ovTerm = academic_resolve_class_term_dates(['semester' => '1ST', 'school_year' => $ovYear, 'term_start_date' => null, 'term_end_date' => null], academic_terms_read($pdo));
$ovSchedDate = $ovDay(34);
if ($ovTerm['startDate'] !== null && $ovSchedDate < $ovTerm['startDate']) $ovSchedDate = $ovTerm['startDate'];
if ($ovTerm['endDate'] !== null && $ovSchedDate > $ovTerm['endDate']) $ovSchedDate = $ovTerm['endDate'];
$ovSchedDay = (new DateTimeImmutable($ovSchedDate))->format('D');
$ovSchedRoom = 'Sched Room ' . $ovSuffix;
$ovSchedBooked = $ovBooked($ovB, $ovOtherId, $ovSchedDate, $ovSchedRoom, '21:30', '22:30');
$ovSchedMeetings = [['component' => 'Lecture', 'day' => $ovSchedDay, 'room' => $ovSchedRoom, 'startTime' => '21:00', 'endTime' => '22:00']];
[$ovStatus, $ovBody] = integration_http_json('/api/faculty/classes/update', $seedFacultyAccessToken, ['csId' => $ovA, 'meetings' => $ovSchedMeetings]);
expect_same([409, 'CLASS_SESSION_OVERLAP', 'session', $ovB], [$ovStatus, $ovBody['code'] ?? null, $ovBody['overlaps'][0]['kind'] ?? null, $ovBody['overlaps'][0]['classId'] ?? null], 'A schedule over a booked session asks to confirm: ' . json_encode($ovBody));
$ovRows = $pdo->prepare('SELECT COUNT(*) FROM class_meetings WHERE cs_id = ?');
$ovRows->execute([$ovA]);
expect_same(0, (int) $ovRows->fetchColumn(), 'An unconfirmed schedule overlap saves nothing');
$ovOtherBefore = $ovNotices($ovOtherId);
[$ovStatus, $ovBody] = integration_http_json('/api/faculty/classes/update', $seedFacultyAccessToken, ['csId' => $ovA, 'meetings' => $ovSchedMeetings, 'confirmOverlap' => true]);
expect_same(200, $ovStatus, 'Confirming saves the class schedule: ' . json_encode($ovBody));
expect_same($ovOtherBefore + 1, $ovNotices($ovOtherId), 'The other Faculty is told about the schedule overlap');
$ovNote->execute([$ovOtherId]);
expect_true(str_contains((string) $ovNote->fetchColumn(), 'saved a class schedule for OVA-' . $ovSuffix), 'The schedule notice says a class schedule was saved');
expect_same(1, $ovAudit('class_schedule_overlap_confirmed', $ovA), 'Booking a schedule over a session is audited');
[$ovStatus] = integration_http_json('/api/faculty/classes/update', $seedFacultyAccessToken, ['csId' => $ovA, 'block' => 'Renamed']);
expect_same(200, $ovStatus, 'An unrelated class edit does not ask about overlaps');
$ovRevoke($ovSchedBooked);
[$ovStatus] = integration_http_json('/api/faculty/classes/update', $seedFacultyAccessToken, ['csId' => $ovA, 'meetings' => [['component' => 'Lecture', 'day' => 'Mon', 'room' => $ovRetiredName, 'startTime' => '20:00', 'endTime' => '21:00']]]);
expect_same(422, $ovStatus, 'Editing a class schedule with a retired room is refused');

// (i) CLS-002: a class cannot be created in a term that has ended; the create form is not offered it.
$ovEndedId = null;
$ovRestore = null;
$ovTermInsert = $pdo->prepare("INSERT INTO academic_terms (school_year, semester, start_date, end_date) VALUES (?, 'Summer', '2020-01-01', '2020-02-01') ON CONFLICT DO NOTHING RETURNING id");
$ovTermInsert->execute([$ovYear]);
$ovEndedId = $ovTermInsert->fetchColumn();
if ($ovEndedId === false) {
    $ovRestore = $pdo->prepare("SELECT id, start_date, end_date FROM academic_terms WHERE school_year = ? AND semester = 'Summer'");
    $ovRestore->execute([$ovYear]);
    $ovRestore = $ovRestore->fetch(PDO::FETCH_ASSOC);
    $ovEndedId = $ovRestore['id'];
    $pdo->prepare("UPDATE academic_terms SET start_date = '2020-01-01', end_date = '2020-02-01' WHERE id = ?")->execute([$ovEndedId]);
}
[$ovStatus, $ovBody] = integration_http_json('/api/faculty/classes', $seedFacultyAccessToken, $ovClassPayload(['academicTermId' => (int) $ovEndedId, 'semester' => 'Summer', 'lecRoom' => 'Ended Room ' . $ovSuffix]));
expect_true($ovStatus === 422 && str_contains(json_encode($ovBody), 'This term has ended. Pick a current or upcoming term.'), 'Creating a class in an ended term is refused: ' . json_encode($ovBody));
[, $ovListBody] = integration_http_get_json('/api/faculty/classes', $seedFacultyAccessToken);
expect_true(!in_array((int) $ovEndedId, array_column($ovListBody['academicTerms'] ?? [], 'id'), true), 'The create form is not offered an ended term');
if ($ovRestore) {
    $pdo->prepare('UPDATE academic_terms SET start_date = ?, end_date = ? WHERE id = ?')->execute([$ovRestore['start_date'], $ovRestore['end_date'], $ovEndedId]);
} else {
    $pdo->prepare('DELETE FROM academic_terms WHERE id = ?')->execute([$ovEndedId]);
}

// Fixtures are removed so later checks see the same classes and accounts as before.
try {
    $ovIds = $pdo->prepare("SELECT cs_id FROM class_sections WHERE cs_name LIKE ?");
    $ovIds->execute(['%-' . $ovSuffix]);
    foreach ($ovIds->fetchAll(PDO::FETCH_COLUMN) as $ovId) {
        foreach (['attendance_sessions', 'class_meetings', 'class_sections'] as $ovTable) {
            $pdo->prepare("DELETE FROM {$ovTable} WHERE cs_id = ?")->execute([$ovId]);
        }
    }
    $pdo->prepare('DELETE FROM notifications WHERE recipient_user_id = ?')->execute([$ovOtherId]);
    $pdo->prepare('DELETE FROM user_accounts WHERE user_id = ?')->execute([$ovOtherId]);
    $pdo->prepare('DELETE FROM rooms WHERE name = ?')->execute([$ovRetiredName]);
} catch (PDOException) {
    // Leftover fixture rows are harmless; the checks above already passed.
}
