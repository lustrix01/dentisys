<?php

declare(strict_types=1);

require_once __DIR__ . '/room_rules.php';
require_once __DIR__ . '/attendance_sessions.php';

function class_meetings_validate(mixed $value): array
{
    if (!is_array($value) || !array_is_list($value) || count($value) > 28) {
        throw new ValidationException(['meetings' => 'Provide a list of at most 28 meetings.']);
    }
    $result = [];
    foreach ($value as $meeting) {
        // request_body leaves nested JSON objects as stdClass values.
        if ($meeting instanceof stdClass) $meeting = (array) $meeting;
        if (!is_array($meeting)
            || !in_array($meeting['component'] ?? null, ['Lecture', 'Laboratory'], true)
            || !in_array($meeting['day'] ?? null, ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], true)) {
            throw new ValidationException(['meetings' => 'Every meeting needs a lecture/laboratory component and a valid weekday.']);
        }
        $room = validate_required_string($meeting, 'room', 1, 100);
        foreach (['startTime', 'endTime'] as $field) {
            if (!is_string($meeting[$field] ?? null) || !preg_match('/^(?:[01]\d|2[0-3]):[0-5]\d$/D', $meeting[$field])) {
                throw new ValidationException(['meetings' => 'Meeting times must use HH:MM.']);
            }
        }
        if ($meeting['startTime'] >= $meeting['endTime']) {
            throw new ValidationException(['meetings' => 'Every meeting must end after it starts.']);
        }
        $result[] = ['component' => $meeting['component'], 'day' => $meeting['day'], 'room' => $room,
            'startTime' => $meeting['startTime'], 'endTime' => $meeting['endTime']];
    }
    foreach ($result as $i => $a) {
        foreach (array_slice($result, $i + 1) as $b) {
            if ($a['day'] === $b['day'] && $a['startTime'] < $b['endTime'] && $b['startTime'] < $a['endTime']) {
                throw new ValidationException(['meetings' => "Class meetings overlap on {$a['day']}."]);
            }
        }
    }
    return $result;
}

function class_meetings_legacy(?string $text, string $component): array
{
    $meetings = [];
    foreach (explode(';', $text ?? '') as $part) {
        if (!preg_match('/^\s*([^()]+)\s*\(((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)(?:\/(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun))*)\s+((?:0?[1-9]|1[0-2]):[0-5]\d\s*[AP]M)\s*-\s*((?:0?[1-9]|1[0-2]):[0-5]\d\s*[AP]M)\)\s*$/iD', $part, $matches)) {
            continue; // Preserve unknown legacy text; never invent its boundaries.
        }
        $start = DateTimeImmutable::createFromFormat('!g:i A', preg_replace('/\s*([AP]M)$/i', ' $1', strtoupper(trim($matches[3]))));
        $end = DateTimeImmutable::createFromFormat('!g:i A', preg_replace('/\s*([AP]M)$/i', ' $1', strtoupper(trim($matches[4]))));
        if (!$start || !$end || $start >= $end) continue;
        foreach (explode('/', $matches[2]) as $day) {
            $meetings[] = ['component' => $component, 'day' => ucfirst(strtolower($day)), 'room' => trim($matches[1]),
                'startTime' => $start->format('H:i'), 'endTime' => $end->format('H:i')];
        }
    }
    return $meetings;
}

function class_meetings_read(PDO $pdo, array $class): array
{
    if (!filter_var($class['meetings_recorded'] ?? false, FILTER_VALIDATE_BOOLEAN)) {
        return array_merge(class_meetings_legacy($class['lec_room'] ?? null, 'Lecture'), class_meetings_legacy($class['lab_room'] ?? null, 'Laboratory'));
    }
    $stmt = $pdo->prepare('SELECT component, weekday AS day, room, start_time, end_time FROM class_meetings WHERE cs_id = ? ORDER BY meeting_id');
    $stmt->execute([(int) $class['cs_id']]);
    return array_map(static fn(array $row): array => ['component' => $row['component'], 'day' => $row['day'], 'room' => $row['room'],
        'startTime' => substr($row['start_time'], 0, 5), 'endTime' => substr($row['end_time'], 0, 5)], $stmt->fetchAll(PDO::FETCH_ASSOC));
}

function class_meetings_save(PDO $pdo, int $csId, array $meetings): void
{
    $pdo->prepare('DELETE FROM class_meetings WHERE cs_id = ?')->execute([$csId]);
    $insert = $pdo->prepare('INSERT INTO class_meetings (cs_id, component, weekday, room, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?)');
    foreach ($meetings as $meeting) {
        $insert->execute([$csId, $meeting['component'], $meeting['day'], $meeting['room'], $meeting['startTime'], $meeting['endTime']]);
    }
    $pdo->prepare('UPDATE class_sections SET meetings_recorded = true WHERE cs_id = ?')->execute([$csId]);
}

function class_meetings_display(array $meetings, string $component, string $legacy): string
{
    $parts = [];
    foreach ($meetings as $meeting) {
        if ($meeting['component'] !== $component) continue;
        $start = DateTimeImmutable::createFromFormat('!H:i', $meeting['startTime'])->format('h:i A');
        $end = DateTimeImmutable::createFromFormat('!H:i', $meeting['endTime'])->format('h:i A');
        $parts[] = "{$meeting['room']} ({$meeting['day']} {$start} - {$end})";
    }
    if ($parts !== []) return implode('; ', $parts);
    // Recorded empty meetings supersede old times, while keeping room labels
    // and the untouched original text in storage for historical evidence.
    $legacyMeetings = class_meetings_legacy($legacy, $component);
    return $legacyMeetings === [] ? $legacy : implode('; ', array_unique(array_column($legacyMeetings, 'room')));
}

/** CLS-001 (2026-11-06): the hard conflict covers one school year and semester; Summer is its own semester. */
function class_meetings_conflict(PDO $pdo, string $schoolYear, string $semester, int $instructorId, array $proposed, int $excludeCsId): ?string
{
    if ($proposed === []) return null;
    // Serialize schedule writes for the year, including other Faculty using the same room.
    $pdo->prepare('SELECT pg_advisory_xact_lock(hashtext(?))')->execute(['class-meetings:' . $schoolYear]);
    $stmt = $pdo->prepare("SELECT cs_id, cs_name, instructor_user_id, semester, lec_room, lab_room, meetings_recorded FROM class_sections WHERE school_year = ? AND status = 'Active' AND archived_at IS NULL AND cs_id <> ?"); // archived classes no longer meet (CLS-003)
    $stmt->execute([$schoolYear, $excludeCsId]);
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $class) {
        if (academic_term_semester($class['semester']) !== academic_term_semester($semester)) continue;
        foreach (class_meetings_read($pdo, $class) as $existing) {
            foreach ($proposed as $meeting) {
                if ($meeting['day'] !== $existing['day'] || $meeting['startTime'] >= $existing['endTime'] || $existing['startTime'] >= $meeting['endTime']) continue;
                if ((int) $class['instructor_user_id'] === $instructorId || room_match_key($meeting['room']) === room_match_key($existing['room'])) {
                    $clock = static fn (string $time): string => DateTimeImmutable::createFromFormat('!H:i', $time)->format('g:i A');
                    return "Schedule conflict: {$class['cs_name']} already uses {$existing['room']} on {$existing['day']}, {$clock($existing['startTime'])} – {$clock($existing['endTime'])}.";
                }
            }
        }
    }
    return null;
}

/** CLS-001: a room retired by the Dean cannot be saved on a class (lecture room, lab room or any meeting room). */
function class_rooms_require_active(PDO $pdo, ?string $lecRoom, ?string $labRoom, array $meetings): void
{
    $candidates = [['lecRoom', $lecRoom], ['labRoom', $labRoom]];
    foreach ($meetings as $meeting) $candidates[] = ['meetings', $meeting['room']];
    foreach ($candidates as [$field, $room]) {
        $retired = room_retired_by_name($pdo, $room);
        if ($retired !== null) throw new ValidationException([$field => "{$retired} was retired by the Dean. Pick another room."]);
    }
}

/**
 * CLS-001: sessions (active or scheduled, from today on, inside the term) of another class that overlap the proposed
 * weekly meetings in the same room or with the same Faculty. Never blocks by itself; see BookingOverlapException.
 */
function class_meetings_session_overlaps(PDO $pdo, ?string $termStart, ?string $termEnd, int $instructorId, array $proposed, int $excludeCsId): array
{
    if ($proposed === []) return [];
    $tz = new DateTimeZone('UTC'); // wall-clock arithmetic only
    $from = max((new DateTimeImmutable('now', new DateTimeZone('Asia/Manila')))->format('Y-m-d'), $termStart ?? '0000-00-00');
    $to = $termEnd ?? (new DateTimeImmutable($from))->modify('+1 year')->format('Y-m-d');
    $stmt = $pdo->prepare('SELECT ' . BOOKING_OVERLAP_CLASS_COLUMNS . ', s.session_date, s.opening_time, s.class_end_time, s.room
        FROM attendance_sessions s JOIN class_sections cs ON cs.cs_id = s.cs_id ' . BOOKING_OVERLAP_CLASS_JOINS . "
        WHERE cs.cs_id <> ? AND s.status IN ('active', 'scheduled') AND s.session_date BETWEEN CAST(? AS date) AND CAST(? AS date)
        ORDER BY s.session_date, s.opening_time, s.session_id");
    $stmt->execute([$excludeCsId, $from, $to]);
    $overlaps = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $opening = $r['opening_time'] ?? '00:00:00';
        $start = new DateTimeImmutable($r['session_date'] . ' ' . $opening, $tz);
        $end = $r['class_end_time'] !== null ? attendance_session_clock_moment($r['session_date'], $r['class_end_time'], $opening, $tz)
            : new DateTimeImmutable($r['session_date'] . ' 23:59:59', $tz);
        $sameFaculty = (int) $r['instructor_user_id'] === $instructorId;
        foreach ($proposed as $meeting) {
            $sameRoom = room_match_key((string) $r['room']) !== '' && room_match_key((string) $r['room']) === room_match_key($meeting['room']);
            if (!$sameRoom && !$sameFaculty) continue;
            foreach ([-1, 0, 1] as $shift) {
                $day = (new DateTimeImmutable($r['session_date'], $tz))->modify("{$shift} day");
                if ($day->format('D') !== $meeting['day']) continue;
                if (new DateTimeImmutable($day->format('Y-m-d') . ' ' . $meeting['startTime'], $tz) < $end
                    && $start < new DateTimeImmutable($day->format('Y-m-d') . ' ' . $meeting['endTime'], $tz)) {
                    $entry = booking_overlap_entry($r, 'session', $sameRoom && $sameFaculty ? 'room_faculty' : ($sameRoom ? 'room' : 'faculty'),
                        $instructorId, (string) $r['room'], $opening, $r['class_end_time'] ?? '23:59', $r['session_date'], null);
                    $entry['meeting'] = $meeting;
                    $overlaps[] = $entry;
                    break 2;
                }
            }
        }
    }
    return $overlaps;
}

/** Throws CLASS_SESSION_OVERLAP unless the request confirmed it; returns the overlaps to record after saving. */
function class_meetings_overlap_gate(PDO $pdo, array $data, ?string $termStart, ?string $termEnd, int $instructorId, array $proposed, int $excludeCsId): array
{
    $overlaps = class_meetings_session_overlaps($pdo, $termStart, $termEnd, $instructorId, $proposed, $excludeCsId);
    if ($overlaps !== [] && ($data['confirmOverlap'] ?? null) !== true) throw new BookingOverlapException($overlaps, 'CLASS_SESSION_OVERLAP');
    return $overlaps;
}

/** After saving a confirmed class schedule overlap: notify the other Faculty and audit who confirmed. Runs in the save transaction. */
function class_meetings_overlap_confirmed(PDO $pdo, array $config, array $authCtx, array $context, int $csId, string $csName, array $overlaps): void
{
    if ($overlaps === []) return;
    $clock = static fn(string $t): string => DateTimeImmutable::createFromFormat('!H:i', substr($t, 0, 5))->format('g:i A');
    $days = ['Mon' => 'Mondays', 'Tue' => 'Tuesdays', 'Wed' => 'Wednesdays', 'Thu' => 'Thursdays', 'Fri' => 'Fridays', 'Sat' => 'Saturdays', 'Sun' => 'Sundays'];
    $who = trim((string) ($authCtx['display_name'] ?? '')) ?: 'A user';
    booking_overlap_notify($pdo, $overlaps, static function (array $o) use ($who, $csName, $clock, $days): string {
        $m = $o['meeting'];
        return "{$who} saved a class schedule for {$csName} in {$m['room']}, {$days[$m['day']]} {$clock($m['startTime'])}–{$clock($m['endTime'])}. "
            . "This overlaps your {$o['className']} session on " . (new DateTimeImmutable($o['date']))->format('D, M j') . '.';
    }, 'class_section', $csId);
    $macKey = config_key_bytes_at_least($config['audit']['mac_key_b64'], 32, 'AUDIT_MAC_KEY');
    $auditCtx = audit_begin_operation($pdo);
    audit_finish_operation($pdo, $auditCtx, [
        'module_code' => 'class_management', 'action_code' => 'class_schedule_overlap_confirmed', 'event_status' => 'Success',
        'actor_user_id' => $authCtx['user_id'], 'actor_username' => $authCtx['login_email'], 'actor_role' => $authCtx['role'],
        'actor_display_name' => $authCtx['display_name'], 'session_id' => $authCtx['session_id'], 'scope_cs_id' => $csId,
        'target_type' => 'class_section', 'target_id' => (string) $csId,
        'description' => "Saved the schedule of class section '{$csName}' over " . count($overlaps) . ' overlapping session(s).', 'reason' => null,
        'http_method' => $context['http_method'], 'endpoint' => $context['endpoint'], 'request_id' => $context['request_id'],
        'ip_address' => $context['ip_address'], 'user_agent' => $context['user_agent'],
    ], $macKey, null, ['overlaps' => $overlaps]);
}
