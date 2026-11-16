<?php

declare(strict_types=1);

require_once __DIR__ . '/../../backend/app/config.php';
require_once __DIR__ . '/../../backend/app/validation.php';
require_once __DIR__ . '/../../backend/app/audit_catalogue.php';
require_once __DIR__ . '/../../backend/app/attendance_sessions.php';

function auto_assert(mixed $expected, mixed $actual, string $label): void
{
    if ($expected !== $actual) {
        fwrite(STDERR, "FAIL: {$label}\nExpected: " . var_export($expected, true) . "\nActual: " . var_export($actual, true) . "\n");
        exit(1);
    }
    echo "PASS: {$label}\n";
}

$mon = ['component' => 'Lecture', 'day' => 'Mon', 'room' => 'Room 1', 'startTime' => '08:00', 'endTime' => '09:30'];
$wed = ['component' => 'Laboratory', 'day' => 'Wed', 'room' => 'Lab 2', 'startTime' => '13:00', 'endTime' => '13:20'];
$tz = new DateTimeZone('Asia/Manila');

// ATT-008: slot key, grace cut-offs from the opening, Late capped at the meeting end, Present kept before Late.
auto_assert('Lecture|Mon|08:00', auto_sessions_slot($mon), 'slot key');
auto_assert(['07:45:00', '08:15:00', '08:30:00', '09:30:00'], auto_sessions_times($mon, 30, 45), 'opens 15 min early, cut-offs count from the opening');
auto_assert(['00:00:00', '00:30:00', '00:45:00', '08:10:00'], auto_sessions_times(['startTime' => '00:05', 'endTime' => '08:10'] + $mon, 30, 45), 'never opens before 00:00');
auto_assert(['12:45:00', '13:15:00', '13:20:00', '13:20:00'], auto_sessions_times($wed, 30, 45), 'Late is capped at the meeting end');
auto_assert(['12:45:00', '13:19:00', '13:20:00', '13:20:00'], auto_sessions_times($wed, 40, 60), 'Present stays one minute before Late');
auto_assert(null, auto_sessions_times(['startTime' => '00:00', 'endTime' => '00:01'] + $mon, 30, 45), 'a one-minute meeting at midnight cannot hold cut-offs');

// 2026-11-16 is a Monday. At 07:00 today's 08:00 meeting is still ahead; the next Monday (11-23) is outside 7 days.
$now = new DateTimeImmutable('2026-11-16 07:00:00', $tz);
$list = auto_sessions_occurrences([$wed, $mon], $now, null, null, 30, 45);
auto_assert(['2026-11-16', '2026-11-18'], array_column($list, 'date'), 'today and the next 6 days, sorted');
auto_assert('Laboratory|Wed|13:00', $list[1]['slot'], 'occurrence carries its slot');
auto_assert([], auto_sessions_occurrences([$mon], new DateTimeImmutable('2026-11-16 07:45:00', $tz), null, null, 30, 45), 'a session whose opening has passed is not created');
auto_assert(['2026-11-23'], array_column(auto_sessions_occurrences([$mon], new DateTimeImmutable('2026-11-17 07:00:00', $tz), null, null, 30, 45), 'date'), 'next Monday joins on Tuesday');
auto_assert(['2026-11-18'], array_column(auto_sessions_occurrences([$wed, $mon], $now, '2026-11-17', null, 30, 45), 'date'), 'nothing before the term starts');
auto_assert(['2026-11-16'], array_column(auto_sessions_occurrences([$wed, $mon], $now, null, '2026-11-17', 30, 45), 'date'), 'nothing after the term ends');

// Schedule change diff: unedited sessions follow the new meeting, removed meetings are revoked, edited ones are left alone.
$row = static fn(int $id, string $slot, bool $edited, string $room, string $end = '09:30:00'): array => ['session_id' => $id, 'cs_id' => 1, 'session_date' => '2026-11-16',
    'auto_slot' => $slot, 'auto_edited' => $edited ? 't' : 'f', 'room' => $room, 'present_cutoff_time' => '08:15:00', 'late_cutoff_time' => '08:30:00', 'class_end_time' => $end];
$diff = auto_sessions_schedule_diff([
    $row(1, 'Lecture|Mon|08:00', false, 'Room 1'),
    $row(2, 'Lecture|Mon|08:00', false, 'Room 9'),
    $row(3, 'Lecture|Mon|08:00', false, 'Room 1', '10:00:00'),
    $row(4, 'Lecture|Tue|08:00', false, 'Room 1'),
    $row(5, 'Lecture|Mon|08:00', true, 'Room 9'),
], [$mon], 30, 45);
auto_assert([2, 3], array_map(static fn(array $u): int => $u[0]['session_id'], $diff['update']), 'changed room or end time is updated');
auto_assert([4], array_column($diff['revoke'], 'session_id'), 'a removed meeting is revoked');
auto_assert(3, $diff['count'], 'the warning counts changed and removed sessions, not unchanged or edited ones');
auto_assert(0, auto_sessions_schedule_diff([$row(1, 'Lecture|Mon|08:00', false, 'Room 1')], [$mon], 30, 45)['count'], 'no change means no warning');

// The 409 for a schedule change carries the count.
$e = new AutoSessionsChangeException(3);
auto_assert(['This changes 3 upcoming sessions.', 'AUTO_SESSIONS_CHANGE', 409], [$e->getMessage(), $e->errorCode, $e->statusCode], 'schedule change warning');

// Routes and audit codes.
$root = __DIR__ . '/../../';
$routes = (string) file_get_contents($root . 'backend/routes/api.php');
foreach (['GET', 'POST'] as $method) {
    auto_assert(true, str_contains($routes, "['method' => '{$method}', 'path' => '/api/faculty/classes/auto-sessions'"), "{$method} auto-sessions route");
}
foreach (['auto_sessions_enabled', 'auto_sessions_disabled', 'auto_sessions_updated'] as $code) {
    auto_assert(true, (audit_catalogue()[$code] ?? null) !== null && audit_catalogue()[$code][1] === AUDIT_AREA_ATTENDANCE, "audit code {$code}");
}
$migration = (string) file_get_contents($root . 'database/migrations/067_auto_sessions.sql');
auto_assert(true, str_contains($migration, 'uq_attendance_sessions_auto_slot') && str_contains($migration, 'auto_sessions_enabled'), 'migration 067 adds the setting and the unique slot index');
