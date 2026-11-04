<?php

declare(strict_types=1);
// Included by the full disposable PostgreSQL suite after Faculty/Admin login (ROOM-001).
$roomPost = static fn(string $path, array $body): array => integration_http_json('/api/admin/rooms' . $path, $adminAccessToken, $body);

[$roomForbidden] = integration_http_get_json('/api/admin/rooms', $seedFacultyAccessToken);
expect_same(403, $roomForbidden, 'Faculty cannot manage Dean rooms');
[$roomForbiddenPost] = integration_http_json('/api/admin/rooms', $seedFacultyAccessToken, ['name' => 'X', 'group' => 'Y']);
expect_same(403, $roomForbiddenPost, 'Faculty cannot create rooms');
[$roomAnon] = integration_http_get_json('/api/rooms', '');
expect_same(401, $roomAnon, 'Room list requires authentication');
[$roomFacultyStatus, $roomFaculty] = integration_http_get_json('/api/rooms', $seedFacultyAccessToken);
expect_same(200, $roomFacultyStatus, 'Faculty can read the room list');
expect_true(count($roomFaculty['rooms'] ?? []) >= 15 && !isset($roomFaculty['rooms'][0]['usage']), 'Faculty room list has the seeded rooms and no usage');
[, $roomAdminList] = integration_http_get_json('/api/admin/rooms', $adminAccessToken);
expect_true(in_array('Standard Classrooms', $roomAdminList['groups'] ?? [], true), 'Dean list returns groups');

// Create, validation, unique key including retired rooms.
[$roomCreateStatus, $roomCreate] = $roomPost('', ['name' => '  Zz   Test Room ', 'group' => 'Test Group', 'latitude' => 13.1, 'longitude' => 123.7, 'radiusMeters' => 100]);
expect_same(201, $roomCreateStatus, 'Dean creates a room');
$roomId = (int) $roomCreate['room']['roomId'];
expect_same('Zz Test Room', $roomCreate['room']['name'], 'Room name is trimmed and single-spaced');
[$roomDupStatus, $roomDup] = $roomPost('', ['name' => 'zz test  ROOM', 'group' => 'Other']);
expect_same(409, $roomDupStatus, 'Name key ignores case and spaces');
expect_same('ROOM_NAME_TAKEN', $roomDup['code'] ?? '', 'Duplicate name has its own code');
foreach ([['latitude' => 13.1], ['latitude' => 91, 'longitude' => 1], ['latitude' => 1, 'longitude' => 181], ['radiusMeters' => 100], ['latitude' => 1, 'longitude' => 1, 'radiusMeters' => 10]] as $badIndex => $bad) {
    [$badStatus] = $roomPost('', ['name' => 'Bad ' . $badIndex, 'group' => 'G'] + $bad);
    expect_same(422, $badStatus, 'Invalid room location/radius case ' . $badIndex . ' is rejected');
}
[$roomNoNameStatus] = $roomPost('', ['name' => ' ', 'group' => '']);
expect_same(422, $roomNoNameStatus, 'Name and group are required');
[$roomMissing] = $roomPost('/retire', ['roomId' => 999999]);
expect_same(404, $roomMissing, 'Unknown room is 404');

// Usage counts match case/space-insensitively and cover every table.
$roomFacultyId = (int) $pdo->query("SELECT user_id FROM user_accounts WHERE login_email = 'faculty@bicol-u.edu.ph'")->fetchColumn();
$roomClass = $pdo->prepare("INSERT INTO class_sections(cs_name, course_id, instructor_user_id, semester, school_year, status, lec_room) VALUES ('ROOM-TEST', 1, ?, '1ST', '2086-2087', 'Active', ?) RETURNING cs_id");
$roomClass->execute([$roomFacultyId, ' zz TEST   room']);
$roomClassId = (int) $roomClass->fetchColumn();
$roomClass->execute([$roomFacultyId, 'zz test  room (Wed 02:30 PM - 03:30 PM)']);
$roomSuffixClassId = (int) $roomClass->fetchColumn();
$roomClass->execute([$roomFacultyId, 'Zz Test Room Annex (Wed 02:30 PM - 03:30 PM)']);
$roomOtherClassId = (int) $roomClass->fetchColumn();
$pdo->prepare("INSERT INTO class_meetings(cs_id, component, weekday, room, start_time, end_time) VALUES (?, 'Lecture', 'Mon', 'ZZ test room', '08:00', '09:00')")->execute([$roomClassId]);
$roomSession = $pdo->prepare("INSERT INTO attendance_sessions(cs_id, secretary_user_id, owner_user_id, session_date, session_code, status, room, revoked_at)
    VALUES (?, ?, ?, DATE '2099-01-01', ?, ?, 'Zz Test Room', ?) RETURNING session_id");
$roomSession->execute([$roomClassId, $roomFacultyId, $roomFacultyId, 'ROOM-SCHED', 'scheduled', null]);
$roomScheduledId = (int) $roomSession->fetchColumn();
$roomSession->execute([$roomClassId, $roomFacultyId, $roomFacultyId, 'ROOM-REV', 'revoked', '2099-01-02 00:00:00']);
$roomRevokedId = (int) $roomSession->fetchColumn();
[, $roomListed] = integration_http_get_json('/api/admin/rooms', $adminAccessToken);
$roomListedRow = array_values(array_filter($roomListed['rooms'], static fn(array $r): bool => $r['roomId'] === $roomId))[0];
expect_same(['classes' => 2, 'meetings' => 1, 'scheduledSessions' => 1, 'otherSessions' => 1], $roomListedRow['usage'], 'Usage counts ignore case and extra spaces and a legacy schedule suffix, not longer names');
expect_same(false, $roomListedRow['deletable'], 'A used active room is not deletable');

// Delete rules.
[$roomDelActive, $roomDelActiveBody] = $roomPost('/delete', ['roomId' => $roomId]);
expect_same(409, $roomDelActive, 'Active room cannot be deleted');
expect_same('ROOM_NOT_RETIRED', $roomDelActiveBody['code'] ?? '', 'Delete an active room says to retire first');
[$roomRetireStatus, $roomRetire] = $roomPost('/retire', ['roomId' => $roomId]);
expect_same(200, $roomRetireStatus, 'Dean retires a room');
expect_same('retired', $roomRetire['room']['status'], 'Retired room carries status');
[$roomRetireAgain] = $roomPost('/retire', ['roomId' => $roomId]);
expect_same(409, $roomRetireAgain, 'Only active rooms can be retired');
[, $roomDelUsedBody] = $roomPost('/delete', ['roomId' => $roomId]);
expect_same('ROOM_IN_USE', $roomDelUsedBody['code'] ?? '', 'A used retired room cannot be deleted');
[$roomDupRetired] = $roomPost('', ['name' => 'Zz Test Room', 'group' => 'G']);
expect_same(409, $roomDupRetired, 'A retired room still reserves its name');
[$roomRestoreStatus] = $roomPost('/restore', ['roomId' => $roomId]);
expect_same(200, $roomRestoreStatus, 'Dean restores a retired room');
[$roomRestoreAgain] = $roomPost('/restore', ['roomId' => $roomId]);
expect_same(409, $roomRestoreAgain, 'Only retired rooms can be restored');

// Rename needs confirmation, then updates classes, meetings and scheduled sessions only.
[$roomRenameStatus, $roomRename] = $roomPost('/update', ['roomId' => $roomId, 'name' => 'Zz Renamed']);
expect_same(409, $roomRenameStatus, 'Rename of a used room asks first');
expect_same('ROOM_RENAME_CONFIRM', $roomRename['code'] ?? '', 'Rename confirm code');
expect_same(2, $roomRename['usage']['classes'] ?? null, 'Rename confirm reports usage');
expect_same('Zz Test Room', (string) $pdo->query("SELECT name FROM rooms WHERE room_id = {$roomId}")->fetchColumn(), 'Unconfirmed rename saves nothing');
[$roomRenameOkStatus, $roomRenameOk] = $roomPost('/update', ['roomId' => $roomId, 'name' => 'Zz Renamed', 'confirmRename' => true, 'latitude' => null, 'longitude' => null]);
expect_same(200, $roomRenameOkStatus, 'Confirmed rename succeeds');
expect_same(['classes' => 2, 'meetings' => 1, 'scheduledSessions' => 1], $roomRenameOk['renamed'], 'Rename reports what changed');
expect_same(null, $roomRenameOk['room']['latitude'], 'Null location clears it');
expect_same(null, $roomRenameOk['room']['radiusMeters'], 'Clearing the location clears its radius');
expect_same('Zz Renamed', (string) $pdo->query("SELECT lec_room FROM class_sections WHERE cs_id = {$roomClassId}")->fetchColumn(), 'Class room follows the rename');
expect_same('Zz Renamed (Wed 02:30 PM - 03:30 PM)', (string) $pdo->query("SELECT lec_room FROM class_sections WHERE cs_id = {$roomSuffixClassId}")->fetchColumn(), 'Rename keeps a legacy schedule suffix');
expect_same('Zz Test Room Annex (Wed 02:30 PM - 03:30 PM)', (string) $pdo->query("SELECT lec_room FROM class_sections WHERE cs_id = {$roomOtherClassId}")->fetchColumn(), 'Rename leaves a different room name alone');
expect_same('Zz Renamed', (string) $pdo->query("SELECT room FROM class_meetings WHERE cs_id = {$roomClassId}")->fetchColumn(), 'Meeting room follows the rename');
expect_same('Zz Renamed', (string) $pdo->query("SELECT room FROM attendance_sessions WHERE session_id = {$roomScheduledId}")->fetchColumn(), 'Scheduled session follows the rename');
expect_same('Zz Test Room', (string) $pdo->query("SELECT room FROM attendance_sessions WHERE session_id = {$roomRevokedId}")->fetchColumn(), 'Ended/revoked sessions keep the old name');
[$roomRenameClash] = $roomPost('/update', ['roomId' => $roomId, 'name' => 'room 101', 'confirmRename' => true]);
expect_same(409, $roomRenameClash, 'Rename onto another room name is rejected');

// An unused retired room can be deleted; every change is audited.
[, $roomTmp] = $roomPost('', ['name' => 'Zz Temp', 'group' => 'Test Group']);
$roomTmpId = (int) $roomTmp['room']['roomId'];
expect_same(false, $roomTmp['room']['deletable'], 'Active unused room is not yet deletable');
$roomPost('/retire', ['roomId' => $roomTmpId]);
[$roomDelStatus] = $roomPost('/delete', ['roomId' => $roomTmpId]);
expect_same(200, $roomDelStatus, 'An unused retired room is deleted');
expect_same(0, (int) $pdo->query("SELECT COUNT(*) FROM rooms WHERE room_id = {$roomTmpId}")->fetchColumn(), 'Deleted room is gone');
expect_true((int) $pdo->query("SELECT COUNT(*) FROM audit_events WHERE action_code IN ('room_created','room_updated','room_retired','room_restored','room_deleted')")->fetchColumn() >= 6, 'Room changes are audited');

// Remove the fixtures so later suites see the original data.
$pdo->prepare('DELETE FROM attendance_sessions WHERE cs_id = ?')->execute([$roomClassId]);
$pdo->prepare('DELETE FROM class_meetings WHERE cs_id = ?')->execute([$roomClassId]);
foreach ([$roomClassId, $roomSuffixClassId, $roomOtherClassId] as $roomFixtureClass) {
    $pdo->prepare('DELETE FROM class_sections WHERE cs_id = ?')->execute([$roomFixtureClass]);
}
$pdo->prepare('DELETE FROM rooms WHERE room_id = ?')->execute([$roomId]);
