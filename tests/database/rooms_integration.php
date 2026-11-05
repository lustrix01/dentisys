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
expect_true(count($roomFaculty['rooms'] ?? []) >= 3 && !isset($roomFaculty['rooms'][0]['usage']), 'Faculty room list has the starting rooms and no usage');
[, $roomAdminList] = integration_http_get_json('/api/admin/rooms', $adminAccessToken);
expect_true(in_array('Lecture/Laboratory', $roomAdminList['groups'] ?? [], true), 'Dean list returns active category names');
expect_same(['CDM-1', 'CDM-2', 'CDM-3'], array_column(array_filter($roomAdminList['rooms'], static fn(array $r): bool => $r['group'] === 'Lecture/Laboratory'), 'name'), 'Starting rooms are CDM-1..3 (old seed removed)');
expect_true(isset($roomAdminList['categories'][0]['roomCount'], $roomAdminList['categories'][0]['activeRoomCount']), 'Dean list returns categories with counts');

// Create, validation, unique key including retired rooms.
[$roomCreateStatus, $roomCreate] = $roomPost('', ['name' => '  Zz   Test Room ', 'group' => 'Test Group', 'latitude' => 13.1, 'longitude' => 123.7, 'radiusMeters' => 100]);
expect_same(201, $roomCreateStatus, 'Dean creates a room');
$roomId = (int) $roomCreate['room']['roomId'];
expect_same('Zz Test Room', $roomCreate['room']['name'], 'Room name is trimmed and single-spaced');
[$roomDupStatus, $roomDup] = $roomPost('', ['name' => 'zz test  ROOM', 'group' => 'Other']);
expect_same(409, $roomDupStatus, 'Name key ignores case and spaces');
foreach (['Zz-Test.Room', 'ZZTESTROOM', 'zz.test-room'] as $roomDupVariant) {
    [$roomDupVariantStatus] = $roomPost('', ['name' => $roomDupVariant, 'group' => 'Other']);
    expect_same(409, $roomDupVariantStatus, 'Name key ignores dashes and dots: ' . $roomDupVariant);
}
expect_same(0, (int) $pdo->query("SELECT COUNT(*) FROM room_categories WHERE name = 'Other'")->fetchColumn(), 'A refused room does not leave a new category behind');
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
$roomPastClass = $pdo->prepare("INSERT INTO class_sections(cs_name, course_id, instructor_user_id, semester, school_year, status, lec_room, term_end_date) VALUES ('ROOM-PAST', 1, ?, '1ST', '2000-2001', 'Active', 'Zz Test Room', '2001-03-01') RETURNING cs_id");
$roomPastClass->execute([$roomFacultyId]);
$roomPastClassId = (int) $roomPastClass->fetchColumn();
$pdo->prepare("INSERT INTO attendance_sessions(cs_id, secretary_user_id, owner_user_id, session_date, session_code, status, room, ended_at)
    VALUES (?, ?, ?, DATE '2001-01-03', 'ROOM-PAST-END', 'ended', 'Zz Test Room', '2001-01-03 10:00:00')")->execute([$roomPastClassId, $roomFacultyId, $roomFacultyId]);
$pdo->prepare("INSERT INTO class_meetings(cs_id, component, weekday, room, start_time, end_time) VALUES (?, 'Lecture', 'Mon', 'ZZ test room', '08:00', '09:00')")->execute([$roomClassId]);
$roomSession = $pdo->prepare("INSERT INTO attendance_sessions(cs_id, secretary_user_id, owner_user_id, session_date, session_code, status, room, revoked_at)
    VALUES (?, ?, ?, DATE '2099-01-01', ?, ?, 'Zz Test Room', ?) RETURNING session_id");
$roomSession->execute([$roomClassId, $roomFacultyId, $roomFacultyId, 'ROOM-SCHED', 'scheduled', null]);
$roomScheduledId = (int) $roomSession->fetchColumn();
$roomSession->execute([$roomClassId, $roomFacultyId, $roomFacultyId, 'ROOM-REV', 'revoked', '2099-01-02 00:00:00']);
$roomRevokedId = (int) $roomSession->fetchColumn();
[, $roomListed] = integration_http_get_json('/api/admin/rooms', $adminAccessToken);
$roomListedRow = array_values(array_filter($roomListed['rooms'], static fn(array $r): bool => $r['roomId'] === $roomId))[0];
expect_same(['classes' => 2, 'meetings' => 1, 'scheduledSessions' => 1], $roomListedRow['usage'], 'In-use counts ignore case, spaces and a legacy schedule suffix, not longer names, past-year classes or ended sessions');
expect_same(true, $roomListedRow['inUse'], 'A room used by a current class is in use');
expect_same(false, $roomListedRow['deletable'], 'A used active room is not deletable');

// Delete rules.
[$roomDelActive, $roomDelActiveBody] = $roomPost('/delete', ['roomId' => $roomId]);
expect_same(409, $roomDelActive, 'Active room cannot be deleted');
expect_same('ROOM_NOT_RETIRED', $roomDelActiveBody['code'] ?? '', 'Delete an active room says to retire first');
[$roomRetireStatus, $roomRetire] = $roomPost('/retire', ['roomId' => $roomId]);
expect_same(200, $roomRetireStatus, 'Dean retires a room');
expect_same('retired', $roomRetire['room']['status'], 'Retired room carries status');
expect_same(1, (int) $pdo->query("SELECT COUNT(*) FROM notifications WHERE recipient_user_id = {$roomFacultyId} AND notification_type = 'room_retired' AND entity_id = '{$roomId}'")->fetchColumn(), 'Retiring notifies the instructor of an in-use class once');
[$roomRenameRetired, $roomRenameRetiredBody] = $roomPost('/update', ['roomId' => $roomId, 'name' => 'Zz Nope', 'confirmRename' => true]);
expect_same(409, $roomRenameRetired, 'A retired room cannot be renamed');
expect_same('ROOM_RETIRED', $roomRenameRetiredBody['code'] ?? '', 'Retired rename has its own code');
[$roomRetireAgain] = $roomPost('/retire', ['roomId' => $roomId]);
expect_same(409, $roomRetireAgain, 'Only active rooms can be retired');
[, $roomDelUsedBody] = $roomPost('/delete', ['roomId' => $roomId]);
expect_same('ROOM_IN_USE', $roomDelUsedBody['code'] ?? '', 'A retired room used by a current-term class cannot be deleted');
expect_same(2, $roomDelUsedBody['usage']['classes'] ?? null, 'Delete refusal reports usage');
expect_true(str_contains($roomDelUsedBody['message'] ?? '', 'whose term has not ended'), 'Delete refusal names what uses the room');
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
expect_same(['classes' => 2, 'meetings' => 1, 'scheduledSessions' => 1], $roomRenameOk['renamed'], 'Rename reports what changed (current and future school years)');
expect_same(1, (int) $pdo->query("SELECT COUNT(*) FROM notifications WHERE recipient_user_id = {$roomFacultyId} AND notification_type = 'room_renamed' AND entity_id = '{$roomId}'")->fetchColumn(), 'Rename sends one notice per affected Faculty');
expect_same('Zz Test Room', (string) $pdo->query("SELECT lec_room FROM class_sections WHERE cs_id = {$roomPastClassId}")->fetchColumn(), 'Rename skips a past-school-year class');
expect_same('Zz Test Room', (string) $pdo->query("SELECT room FROM attendance_sessions WHERE session_code = 'ROOM-PAST-END'")->fetchColumn(), 'Rename skips an ended session');
expect_same(null, $roomRenameOk['room']['latitude'], 'Null location clears it');
expect_same(null, $roomRenameOk['room']['radiusMeters'], 'Clearing the location clears its radius');
expect_same('Zz Renamed', (string) $pdo->query("SELECT lec_room FROM class_sections WHERE cs_id = {$roomClassId}")->fetchColumn(), 'Class room follows the rename');
expect_same('Zz Renamed (Wed 02:30 PM - 03:30 PM)', (string) $pdo->query("SELECT lec_room FROM class_sections WHERE cs_id = {$roomSuffixClassId}")->fetchColumn(), 'Rename keeps a legacy schedule suffix');
expect_same('Zz Test Room Annex (Wed 02:30 PM - 03:30 PM)', (string) $pdo->query("SELECT lec_room FROM class_sections WHERE cs_id = {$roomOtherClassId}")->fetchColumn(), 'Rename leaves a different room name alone');
expect_same('Zz Renamed', (string) $pdo->query("SELECT room FROM class_meetings WHERE cs_id = {$roomClassId}")->fetchColumn(), 'Meeting room follows the rename');
expect_same('Zz Renamed', (string) $pdo->query("SELECT room FROM attendance_sessions WHERE session_id = {$roomScheduledId}")->fetchColumn(), 'Scheduled session follows the rename');
expect_same('Zz Test Room', (string) $pdo->query("SELECT room FROM attendance_sessions WHERE session_id = {$roomRevokedId}")->fetchColumn(), 'Ended/revoked sessions keep the old name');
[$roomRenameClash] = $roomPost('/update', ['roomId' => $roomId, 'name' => 'cdm 1', 'confirmRename' => true]);
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

// Past use never blocks a delete: a room used only by a past-year class and an ended session can be deleted.
[, $roomHist] = $roomPost('', ['name' => 'Zz History', 'group' => 'Test Group']);
$roomHistId = (int) $roomHist['room']['roomId'];
$pdo->prepare("INSERT INTO attendance_sessions(cs_id, secretary_user_id, owner_user_id, session_date, session_code, status, room, ended_at)
    VALUES (?, ?, ?, DATE '2001-01-04', 'ROOM-END', 'ended', 'Zz History', '2001-01-04 10:00:00')")->execute([$roomPastClassId, $roomFacultyId, $roomFacultyId]);
$pdo->prepare("UPDATE class_sections SET lab_room = 'ZZ history' WHERE cs_id = ?")->execute([$roomPastClassId]);
$roomPost('/retire', ['roomId' => $roomHistId]);
[$roomHistDelStatus] = $roomPost('/delete', ['roomId' => $roomHistId]);
expect_same(200, $roomHistDelStatus, 'A retired room used only in the past is deleted');

// Categories: retire/delete rules and restoring into a retired category.
[$catStatus, $cat] = integration_http_json('/api/admin/room-categories', $adminAccessToken, ['name' => ' Zz  Cat ']);
expect_same(201, $catStatus, 'Dean creates a category');
$catId = (int) $cat['category']['categoryId'];
[$catDupStatus, $catDup] = integration_http_json('/api/admin/room-categories', $adminAccessToken, ['name' => 'zz-cat']);
expect_same(409, $catDupStatus, 'Category names ignore case, spaces and dashes');
expect_same('CATEGORY_NAME_TAKEN', $catDup['code'] ?? '', 'Duplicate category code');
[$catRenameStatus] = integration_http_json('/api/admin/room-categories/update', $adminAccessToken, ['categoryId' => $catId, 'name' => 'Zz Cat Renamed']);
expect_same(200, $catRenameStatus, 'Dean renames a category');
[, $catRoom] = $roomPost('', ['name' => 'Zz Cat Room', 'categoryId' => $catId]);
$catRoomId = (int) $catRoom['room']['roomId'];
expect_same('Zz Cat Renamed', $catRoom['room']['group'], 'A room reads its category name');
[$catRetireBlocked, $catRetireBlockedBody] = integration_http_json('/api/admin/room-categories/retire', $adminAccessToken, ['categoryId' => $catId]);
expect_same(409, $catRetireBlocked, 'A category with an active room cannot be retired');
expect_same('CATEGORY_HAS_ACTIVE_ROOMS', $catRetireBlockedBody['code'] ?? '', 'Category retire refusal code');
[$catDelBlocked, $catDelBlockedBody] = integration_http_json('/api/admin/room-categories/delete', $adminAccessToken, ['categoryId' => $catId]);
expect_same(409, $catDelBlocked, 'A category with rooms cannot be deleted');
expect_same('CATEGORY_NOT_EMPTY', $catDelBlockedBody['code'] ?? '', 'Category delete refusal code');
$roomPost('/retire', ['roomId' => $catRoomId]);
[$catRetireOk] = integration_http_json('/api/admin/room-categories/retire', $adminAccessToken, ['categoryId' => $catId]);
expect_same(200, $catRetireOk, 'A category whose rooms are all retired can be retired');
[$catRestoreRoom, $catRestoreRoomBody] = $roomPost('/restore', ['roomId' => $catRoomId]);
expect_same(409, $catRestoreRoom, 'A room cannot be restored into a retired category');
expect_same('ROOM_CATEGORY_RETIRED', $catRestoreRoomBody['code'] ?? '', 'Restore into retired category code');
[$catAddRoom, $catAddRoomBody] = $roomPost('', ['name' => 'Zz Cat Room 2', 'categoryId' => $catId]);
expect_same(409, $catAddRoom, 'A room cannot be added to a retired category');
expect_same('ROOM_CATEGORY_RETIRED', $catAddRoomBody['code'] ?? '', 'Add into retired category code');
[$catRestoreOk] = integration_http_json('/api/admin/room-categories/restore', $adminAccessToken, ['categoryId' => $catId]);
expect_same(200, $catRestoreOk, 'Dean restores a category');
[$catRoomRestoreOk] = $roomPost('/restore', ['roomId' => $catRoomId]);
expect_same(200, $catRoomRestoreOk, 'A room is restored once its category is active');
$roomPost('/retire', ['roomId' => $catRoomId]);
$roomPost('/delete', ['roomId' => $catRoomId]);
integration_http_json('/api/admin/room-categories/retire', $adminAccessToken, ['categoryId' => $catId]);
[$catDelOk] = integration_http_json('/api/admin/room-categories/delete', $adminAccessToken, ['categoryId' => $catId]);
expect_same(200, $catDelOk, 'An empty category is deleted');
expect_true((int) $pdo->query("SELECT COUNT(*) FROM audit_events WHERE action_code IN ('room_category_created','room_category_updated','room_category_retired','room_category_restored','room_category_deleted')")->fetchColumn() >= 5, 'Category changes are audited');

// Remove the fixtures so later suites see the original data.
$pdo->prepare('DELETE FROM attendance_sessions WHERE cs_id = ?')->execute([$roomClassId]);
$pdo->prepare('DELETE FROM class_meetings WHERE cs_id = ?')->execute([$roomClassId]);
$pdo->prepare('DELETE FROM attendance_sessions WHERE cs_id = ?')->execute([$roomPastClassId]);
$pdo->prepare("DELETE FROM notifications WHERE notification_type IN ('room_renamed','room_retired') AND recipient_user_id = ?")->execute([$roomFacultyId]);
foreach ([$roomClassId, $roomSuffixClassId, $roomOtherClassId, $roomPastClassId] as $roomFixtureClass) {
    $pdo->prepare('DELETE FROM class_sections WHERE cs_id = ?')->execute([$roomFixtureClass]);
}
$pdo->prepare('DELETE FROM rooms WHERE room_id = ?')->execute([$roomId]);
$pdo->exec("DELETE FROM rooms WHERE name_key IN ('zzhistory', 'zztemp') OR name LIKE 'Zz %'");
$pdo->exec("DELETE FROM room_categories c WHERE name IN ('Test Group', 'Other') AND NOT EXISTS (SELECT 1 FROM rooms r WHERE r.category_id = c.category_id)");
