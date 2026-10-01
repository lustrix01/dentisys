<?php

declare(strict_types=1);
require_once dirname(__DIR__, 2) . '/backend/app/config.php';
require_once dirname(__DIR__, 2) . '/backend/app/validation.php';
require_once dirname(__DIR__, 2) . '/backend/app/request.php';
require_once dirname(__DIR__, 2) . '/backend/app/class_meetings.php';
require_once dirname(__DIR__, 2) . '/backend/app/attendance_sessions.php';

function schedule_assert(bool $condition, string $message): void {
    if (!$condition) { fwrite(STDERR, "FAIL: {$message}\n"); exit(1); }
    fwrite(STDOUT, "PASS: {$message}\n");
}
function schedule_invalid(callable $action, string $message): void {
    try { $action(); } catch (ValidationException) { schedule_assert(true, $message); return; }
    schedule_assert(false, $message);
}
$config = app_config(['APP_ENV' => 'test', 'APP_TIMEZONE' => 'Asia/Manila']);
$now = new DateTimeImmutable('2026-10-01 16:05:00', new DateTimeZone('UTC'));
schedule_assert(attendance_session_creation_date('2026-10-02', $config, $now) === '2026-10-02', 'Session date uses the Manila day across UTC midnight');
schedule_assert(attendance_session_creation_date('2026-10-03', $config, $now) === '2026-10-03', 'Future session dates are accepted');
schedule_invalid(fn() => attendance_session_creation_date('2026-10-01', $config, $now), 'A past Manila date is rejected');
schedule_invalid(fn() => attendance_session_creation_date('2026-02-30', $config, $now), 'Impossible calendar dates are rejected');
$meetings = [
    ['component' => 'Lecture', 'day' => 'Mon', 'room' => 'Room 101', 'startTime' => '08:00', 'endTime' => '10:00'],
    ['component' => 'Lecture', 'day' => 'Tue', 'room' => 'Room 101', 'startTime' => '15:00', 'endTime' => '17:00'],
];
schedule_assert(class_meetings_validate($meetings) === $meetings, 'Different weekdays retain different time ranges');
$parsed = parse_json_object_body(json_encode(['meetings' => $meetings]), 'application/json', 65536);
schedule_assert(class_meetings_validate($parsed['data']['meetings']) === $meetings, 'Real nested JSON objects are accepted by the meeting validator');
schedule_invalid(fn() => class_meetings_validate([$meetings[0], array_merge($meetings[0], ['startTime' => '09:00'])]), 'Same-day overlapping meetings are rejected');
schedule_invalid(fn() => class_meetings_validate([array_merge($meetings[0], ['endTime' => '07:00'])]), 'Reversed meeting times are rejected');
schedule_invalid(fn() => class_meetings_validate([array_merge($meetings[0], ['startTime' => '28:00'])]), 'Invalid clock times are rejected');
$legacy = class_meetings_legacy('Room 101 (Mon/Wed 08:00 AM - 10:00 AM); Room 102 (Tue 03:00 PM - 05:00 PM)', 'Lecture');
schedule_assert(count($legacy) === 3 && $legacy[2]['startTime'] === '15:00', 'Complete legacy schedule groups preserve each day and time');
schedule_assert(class_meetings_legacy('Room 101 (Mon 08:00 AM -', 'Lecture') === [], 'Truncated legacy text is never guessed');
schedule_assert(class_meetings_display([], 'Lecture', 'Room 101 (Mon 08:00 AM - 10:00 AM)') === 'Room 101', 'Removed recorded meetings retain room labels without resurrecting legacy times');
$session = ['status' => 'scheduled', 'session_date' => '2026-10-03', 'opening_time' => '08:00', 'present_cutoff_time' => '09:00', 'late_cutoff_time' => '10:00'];
schedule_assert(attendance_session_timing_decision($session, $now, $config)['code'] === 'attendance_not_open', 'Queued sessions never accept attendance before opening');
