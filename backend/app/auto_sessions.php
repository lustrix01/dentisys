<?php

declare(strict_types=1);

require_once __DIR__ . '/attendance_sessions.php';

/**
 * ATT-008: sessions created from a class's weekly schedule. A session is keyed by its meeting slot
 * ("Lecture|Mon|08:00") and the meeting date, because class_meetings_save deletes and re-inserts the meetings.
 */
const AUTO_SESSIONS_DAYS = 7;
const AUTO_SESSIONS_OPEN_EARLY_MINUTES = 15; // an auto-session opens this long before the meeting starts (never before 00:00)
const AUTO_SESSIONS_ACTOR_NAME = 'DentiSYS (weekly schedule)';
const AUTO_SESSIONS_ROOM_MESSAGE = 'Geofence needs a saved location for every meeting room. Ask the Dean to set it in Rooms.';

/** Class row columns every function below needs. */
const AUTO_SESSIONS_CLASS_COLUMNS = 'cs.cs_id, cs.cs_name, cs.instructor_user_id, cs.secretary_user_id, cs.semester, cs.school_year, cs.term_start_date,
    cs.term_end_date, cs.lec_room, cs.lab_room, cs.meetings_recorded, cs.present_grace_minutes, cs.late_grace_minutes,
    cs.session_biometric_required, cs.session_geofence_enabled, cs.session_geofence_radius, cs.auto_sessions_enabled';

function auto_sessions_slot(array $meeting): string
{
    return $meeting['component'] . '|' . $meeting['day'] . '|' . $meeting['startTime'];
}

/** [opening, present, late, end] as HH:MM:SS: opening is 15 min before the meeting, cut-offs count from it, Late is capped at the meeting end, Present stays before Late. Null when the meeting is too short. */
function auto_sessions_times(array $meeting, int $presentGrace, int $lateGrace): ?array
{
    $minutes = static fn(string $t): int => (int) substr($t, 0, 2) * 60 + (int) substr($t, 3, 2);
    $clock = static fn(int $m): string => sprintf('%02d:%02d:00', intdiv($m, 60), $m % 60);
    $end = $minutes($meeting['endTime']);
    $open = max(0, $minutes($meeting['startTime']) - AUTO_SESSIONS_OPEN_EARLY_MINUTES);
    $late = min($open + $lateGrace, $end);
    $present = min($open + $presentGrace, $late - 1);
    return $present > $open ? [$clock($open), $clock($present), $clock($late), $clock($end)] : null;
}

/** Meeting occurrences in today + the next 6 days (Manila) that start after now and fall inside the term. Sorted by date and opening. */
function auto_sessions_occurrences(array $meetings, DateTimeImmutable $nowLocal, ?string $termStart, ?string $termEnd, int $presentGrace, int $lateGrace): array
{
    $out = [];
    $now = $nowLocal->format('Y-m-d H:i:s');
    for ($i = 0; $i < AUTO_SESSIONS_DAYS; $i++) {
        $day = $nowLocal->setTime(0, 0)->modify("+{$i} day");
        $date = $day->format('Y-m-d');
        if (($termStart !== null && $date < $termStart) || ($termEnd !== null && $date > $termEnd)) {
            continue;
        }
        foreach ($meetings as $meeting) {
            $times = $meeting['day'] === $day->format('D') ? auto_sessions_times($meeting, $presentGrace, $lateGrace) : null;
            if ($times === null || $date . ' ' . $times[0] <= $now) {
                continue;
            }
            $out[] = ['date' => $date, 'slot' => auto_sessions_slot($meeting), 'room' => $meeting['room'],
                'opening' => $times[0], 'present' => $times[1], 'late' => $times[2], 'end' => $times[3]];
        }
    }
    usort($out, static fn(array $a, array $b): int => [$a['date'], $a['opening']] <=> [$b['date'], $b['opening']]);
    return $out;
}

/**
 * Which unedited upcoming auto-sessions a new weekly schedule changes. $upcoming rows: session_id, session_date, auto_slot,
 * auto_edited, room, present_cutoff_time, late_cutoff_time, class_end_time. Returns update: [[row, new values]], revoke: [row], count.
 */
function auto_sessions_schedule_diff(array $upcoming, array $meetings, int $presentGrace, int $lateGrace): array
{
    $bySlot = [];
    foreach ($meetings as $meeting) {
        $bySlot[auto_sessions_slot($meeting)] = $meeting;
    }
    $update = [];
    $revoke = [];
    foreach ($upcoming as $row) {
        if (attendance_session_bool($row['auto_edited'])) {
            continue;
        }
        $meeting = $bySlot[$row['auto_slot']] ?? null;
        $times = $meeting === null ? null : auto_sessions_times($meeting, $presentGrace, $lateGrace);
        if ($times === null) {
            $revoke[] = $row;
            continue;
        }
        $new = ['room' => $meeting['room'], 'present_cutoff_time' => $times[1], 'late_cutoff_time' => $times[2], 'class_end_time' => $times[3]];
        $same = $row['room'] === $new['room'];
        foreach (['present_cutoff_time', 'late_cutoff_time', 'class_end_time'] as $field) {
            $same = $same && substr((string) $row[$field], 0, 5) === substr($new[$field], 0, 5);
        }
        if (!$same) {
            $update[] = [$row, $new];
        }
    }
    return ['update' => $update, 'revoke' => $revoke, 'count' => count($update) + count($revoke)];
}

/** [latitude, longitude] saved for a room (ROOM-001), or null. */
function auto_sessions_room_location(PDO $pdo, string $room): ?array
{
    $stmt = $pdo->prepare('SELECT latitude, longitude FROM rooms WHERE ' . room_key_sql('name') . ' = ? AND latitude IS NOT NULL LIMIT 1');
    $stmt->execute([room_match_key($room)]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row === false ? null : [(float) $row['latitude'], (float) $row['longitude']];
}

/** Meeting rooms (display names, once each) that have no saved location. */
function auto_sessions_missing_rooms(PDO $pdo, array $meetings): array
{
    $missing = [];
    foreach ($meetings as $meeting) {
        $key = room_match_key($meeting['room']);
        if (!isset($missing[$key]) && auto_sessions_room_location($pdo, $meeting['room']) === null) {
            $missing[$key] = $meeting['room'];
        }
    }
    return array_values($missing);
}

function auto_sessions_class_row(PDO $pdo, int $csId, bool $lock = false, bool $skipLocked = false): ?array
{
    $stmt = $pdo->prepare('SELECT ' . AUTO_SESSIONS_CLASS_COLUMNS . ', cs.archive_reason, cs.status FROM class_sections cs WHERE cs.cs_id = ?'
        . ($lock ? ' FOR UPDATE OF cs' . ($skipLocked ? ' SKIP LOCKED' : '') : ''));
    $stmt->execute([$csId]);
    return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
}

/** Notice to the class's Faculty and to each overlapped class's Faculty that an auto-session overlaps other bookings. */
function auto_sessions_notify_overlaps(PDO $pdo, array $class, int $sessionId, array $occurrence, array $overlaps): void
{
    if ($overlaps === []) {
        return;
    }
    $clock = static fn(string $t): string => (new DateTimeImmutable($t))->format('g:i A');
    $when = (new DateTimeImmutable($occurrence['date']))->format('D, M j') . ', ' . $clock($occurrence['opening']) . '–' . $clock($occurrence['end']);
    $names = implode(', ', array_unique(array_column($overlaps, 'className')));
    notification_create_idempotent($pdo, (int) $class['instructor_user_id'], 'room_overlap', 'Booking overlap',
        "DentiSYS created a session for {$class['cs_name']} on {$when} from the weekly schedule. It overlaps: {$names}.",
        'attendance_session', (string) $sessionId, 'auto_overlap:' . $sessionId);
    booking_overlap_notify($pdo, $overlaps, static fn(array $o): string => "DentiSYS created a session for {$class['cs_name']} in {$occurrence['room']} on {$when} from its weekly schedule. "
        . "This overlaps your {$o['className']} " . ($o['kind'] === 'schedule' ? 'regular schedule' : 'session') . '.', 'attendance_session', $sessionId);
}

/** Creates one scheduled session for an occurrence. Returns its id, or null when it is skipped (already exists, overlaps the class's own session, no room location). Inside a transaction. */
function auto_sessions_create_one(PDO $pdo, array $config, array $context, array $class, array $occurrence): ?int
{
    $csId = (int) $class['cs_id'];
    $geofence = attendance_session_bool($class['session_geofence_enabled']);
    $location = $geofence ? auto_sessions_room_location($pdo, $occurrence['room']) : null;
    if (($geofence && $location === null) || room_retired_by_name($pdo, $occurrence['room']) !== null
        || attendance_session_booking_conflict($pdo, $csId, $occurrence['date'], $occurrence['opening'], $occurrence['end']) !== null) {
        return null;
    }
    $nowSql = attendance_session_now_utc()->format('Y-m-d H:i:s.u');
    $insert = $pdo->prepare(
        "INSERT INTO attendance_sessions (
            cs_id, secretary_user_id, owner_user_id, session_date, session_code, room, started_at, status,
            geofence_enabled, geofence_latitude, geofence_longitude, geofence_radius_meters, biometric_required,
            opening_time, present_cutoff_time, late_cutoff_time, class_end_time, created_at, updated_at, created_by_role,
            auto_slot, auto_meeting_date
         ) VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'faculty', ?, ?)
         ON CONFLICT DO NOTHING RETURNING session_id"
    );
    $insert->execute([
        $csId, $class['secretary_user_id'] ?? $class['instructor_user_id'], $class['instructor_user_id'], $occurrence['date'],
        attendance_session_code($csId, $occurrence['date']), $occurrence['room'], $nowSql,
        $geofence ? 1 : 0, $location[0] ?? null, $location[1] ?? null, $geofence ? (float) $class['session_geofence_radius'] : null,
        attendance_session_bool($class['session_biometric_required']) ? 1 : 0,
        $occurrence['opening'], $occurrence['present'], $occurrence['late'], $occurrence['end'], $nowSql, $nowSql,
        $occurrence['slot'], $occurrence['date'],
    ]);
    $sessionId = $insert->fetchColumn();
    if ($sessionId === false) {
        return null;
    }
    $sessionId = (int) $sessionId;
    $actor = ['user_id' => null, 'login_email' => null, 'role' => 'system', 'display_name' => AUTO_SESSIONS_ACTOR_NAME, 'session_id' => null];
    attendance_session_record_audit($pdo, $config, $actor, $context, 'attendance_session_started', $sessionId, $csId,
        'Created attendance session for ' . audit_class_label($pdo, $csId) . " on {$occurrence['date']} from the weekly schedule.", null, null,
        ['session_id' => $sessionId, 'cs_id' => $csId, 'session_date' => $occurrence['date'], 'status' => 'scheduled', 'room' => $occurrence['room'],
            'opening_time' => $occurrence['opening'], 'present_cutoff_time' => $occurrence['present'], 'late_cutoff_time' => $occurrence['late'], 'class_end_time' => $occurrence['end']]);
    auto_sessions_notify_overlaps($pdo, $class, $sessionId, $occurrence,
        attendance_session_overlaps($pdo, $csId, $occurrence['date'], $occurrence['opening'], $occurrence['end'], $occurrence['room']));
    return $sessionId;
}

/** Creates the class's missing occurrences for the next 7 days and stamps the top-up date. Returns how many it created. */
function auto_sessions_top_up_class(PDO $pdo, array $config, array $context, int $csId, DateTimeImmutable $nowLocal, bool $force): int
{
    $today = $nowLocal->format('Y-m-d');
    $class = auto_sessions_class_row($pdo, $csId, true, !$force);
    if ($class === null || !attendance_session_bool($class['auto_sessions_enabled']) || $class['archive_reason'] !== null || strtolower((string) $class['status']) !== 'active') {
        return 0;
    }
    $created = 0;
    if (!academic_school_year_is_past($pdo, (string) $class['school_year'])) {
        $term = academic_resolve_class_term_dates($class, academic_terms_read($pdo));
        foreach (auto_sessions_occurrences(class_meetings_read($pdo, $class), $nowLocal, $term['startDate'], $term['endDate'],
            (int) $class['present_grace_minutes'], (int) $class['late_grace_minutes']) as $occurrence) {
            $created += auto_sessions_create_one($pdo, $config, $context, $class, $occurrence) !== null ? 1 : 0;
        }
    }
    $pdo->prepare('UPDATE class_sections SET auto_sessions_topped_up_on = ? WHERE cs_id = ?')->execute([$today, $csId]);
    return $created;
}

/**
 * ATT-008 daily top-up. Without $csId: every enabled class not yet topped up today (the lazy path, one cheap query when
 * nothing is due). With $csId: that class now (turn-on or schedule change). Runs in the caller's transaction when there is one.
 * All sessions of one run share one audit batch id.
 */
function auto_sessions_top_up(PDO $pdo, array $config, ?int $csId = null, array $context = []): int
{
    $nowLocal = attendance_session_now_utc()->setTimezone(new DateTimeZone((string) $config['app']['operational_timezone']));
    if ($csId === null) {
        $due = $pdo->prepare("SELECT cs_id FROM class_sections WHERE auto_sessions_enabled AND archive_reason IS NULL AND LOWER(status) = 'active'
            AND (auto_sessions_topped_up_on IS NULL OR auto_sessions_topped_up_on < CAST(? AS date)) ORDER BY cs_id");
        $due->execute([$nowLocal->format('Y-m-d')]);
        $ids = array_map('intval', $due->fetchAll(PDO::FETCH_COLUMN));
    } else {
        $ids = [$csId];
    }
    $context['operation_uuid'] = uuid_v4_string();
    $own = !$pdo->inTransaction();
    $created = 0;
    foreach ($ids as $id) {
        $own && $pdo->beginTransaction();
        try {
            $created += auto_sessions_top_up_class($pdo, $config, $context, $id, $nowLocal, $csId !== null);
            $own && $pdo->commit();
        } catch (Throwable $e) {
            if ($own && $pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }
    return $created;
}

/** Revokes scheduled auto-sessions (rows with session_id, cs_id, session_date, status) as the acting Faculty. Inside a transaction. */
function auto_sessions_revoke(PDO $pdo, array $config, array $authCtx, array $context, array $rows, string $reason): void
{
    $nowSql = attendance_session_now_utc()->format('Y-m-d H:i:s.u');
    // Revoked here by turning off or removing a meeting, not by the Faculty for one day: release the slot so
    // turning back on (or re-adding the meeting) creates the session again. A Faculty revoke keeps its slot (ATT-008).
    $update = $pdo->prepare("UPDATE attendance_sessions SET status = 'revoked', revoked_at = ?, revoked_by_user_id = ?, revocation_reason = ?, updated_at = ?,
            auto_slot = NULL, auto_meeting_date = NULL
        WHERE session_id = ? AND status = 'scheduled'");
    foreach ($rows as $row) {
        $update->execute([$nowSql, $authCtx['user_id'], $reason, $nowSql, (int) $row['session_id']]);
        if ($update->rowCount() === 1) {
            attendance_session_record_audit($pdo, $config, $authCtx, $context, 'attendance_session_revoked', (int) $row['session_id'], (int) $row['cs_id'],
                'Revoked attendance session for ' . audit_class_label($pdo, (int) $row['cs_id']) . " on {$row['session_date']}.", $reason,
                ['session_id' => (int) $row['session_id'], 'status' => 'scheduled'], ['session_id' => (int) $row['session_id'], 'status' => 'revoked', 'revoked_at' => $nowSql]);
        }
    }
}

/** Scheduled auto-sessions of the class from today on (the ones a settings or schedule change can still touch). */
function auto_sessions_upcoming(PDO $pdo, array $config, int $csId): array
{
    $stmt = $pdo->prepare("SELECT session_id, cs_id, session_date, auto_slot, auto_edited, room, present_cutoff_time, late_cutoff_time, class_end_time
        FROM attendance_sessions WHERE cs_id = ? AND auto_slot IS NOT NULL AND status = 'scheduled' AND session_date >= CAST(? AS date)
        ORDER BY session_date, opening_time FOR UPDATE");
    $stmt->execute([$csId, app_local_date($config, attendance_session_now_utc())]);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

/** Applies a schedule diff: unedited upcoming sessions follow the new meetings, those of removed meetings are revoked. Inside a transaction. */
function auto_sessions_apply_diff(PDO $pdo, array $config, array $authCtx, array $context, array $diff): void
{
    $update = $pdo->prepare("UPDATE attendance_sessions SET room = ?, present_cutoff_time = ?, late_cutoff_time = ?, class_end_time = ?, updated_at = ?
        WHERE session_id = ? AND status = 'scheduled' AND NOT auto_edited");
    $nowSql = attendance_session_now_utc()->format('Y-m-d H:i:s.u');
    foreach ($diff['update'] as [$row, $new]) {
        $update->execute([$new['room'], $new['present_cutoff_time'], $new['late_cutoff_time'], $new['class_end_time'], $nowSql, (int) $row['session_id']]);
        attendance_session_record_audit($pdo, $config, $authCtx, $context, 'attendance_session_updated', (int) $row['session_id'], (int) $row['cs_id'],
            'Updated attendance session for ' . audit_class_label($pdo, (int) $row['cs_id']) . " on {$row['session_date']} to follow the weekly schedule.", null,
            ['room' => $row['room'], 'present_cutoff_time' => $row['present_cutoff_time'], 'late_cutoff_time' => $row['late_cutoff_time'], 'class_end_time' => $row['class_end_time']], $new);
    }
    auto_sessions_revoke($pdo, $config, $authCtx, $context, $diff['revoke'], 'Meeting removed from the weekly schedule');
}

/** The 409 gate of a schedule save: throws AUTO_SESSIONS_CHANGE with the count unless confirmed; returns the diff to apply after saving (null when the class has the setting off). */
function auto_sessions_schedule_gate(PDO $pdo, array $config, array $data, array $class, array $meetings): ?array
{
    if (!attendance_session_bool($class['auto_sessions_enabled'])) {
        return null;
    }
    if (attendance_session_bool($class['session_geofence_enabled']) && ($missing = auto_sessions_missing_rooms($pdo, $meetings)) !== []) {
        throw new ValidationException(['meetings' => AUTO_SESSIONS_ROOM_MESSAGE . ' Missing: ' . implode(', ', $missing) . '.']);
    }
    $diff = auto_sessions_schedule_diff(auto_sessions_upcoming($pdo, $config, (int) $class['cs_id']), $meetings, (int) $class['present_grace_minutes'], (int) $class['late_grace_minutes']);
    if ($diff['count'] > 0 && ($data['confirmAutoSessions'] ?? null) !== true) {
        throw new AutoSessionsChangeException($diff['count']);
    }
    return $diff;
}

/** Overlaps of the class's meetings in the next 7 days with other classes (ATT-001 a-c), each entry tagged with the meeting it comes from. */
function auto_sessions_turn_on_overlaps(PDO $pdo, array $class, array $meetings, DateTimeImmutable $nowLocal): array
{
    $term = academic_resolve_class_term_dates($class, academic_terms_read($pdo));
    $out = [];
    foreach (auto_sessions_occurrences($meetings, $nowLocal, $term['startDate'], $term['endDate'], (int) $class['present_grace_minutes'], (int) $class['late_grace_minutes']) as $o) {
        foreach (attendance_session_overlaps($pdo, (int) $class['cs_id'], $o['date'], $o['opening'], $o['end'], $o['room']) as $entry) {
            $key = implode('|', [$entry['classId'], $entry['kind'], $entry['date'], $entry['weekday'], $entry['start'], $o['date'], $o['opening']]);
            $out[$key] = $entry + ['meeting' => ['date' => $o['date'], 'start' => substr($o['opening'], 0, 5), 'end' => substr($o['end'], 0, 5), 'room' => $o['room']]];
        }
    }
    return array_values($out);
}

/** New face / geofence / radius for the class's unedited upcoming scheduled auto-sessions. $class holds the new settings. Inside a transaction. */
function auto_sessions_apply_settings(PDO $pdo, array $class, array $upcoming): void
{
    $geofence = attendance_session_bool($class['session_geofence_enabled']);
    $update = $pdo->prepare("UPDATE attendance_sessions SET biometric_required = ?, geofence_enabled = ?, geofence_latitude = ?, geofence_longitude = ?,
        geofence_radius_meters = ?, updated_at = ? WHERE session_id = ? AND status = 'scheduled' AND NOT auto_edited");
    $nowSql = attendance_session_now_utc()->format('Y-m-d H:i:s.u');
    foreach ($upcoming as $row) {
        $location = $geofence ? auto_sessions_room_location($pdo, (string) $row['room']) : null;
        $on = $geofence && $location !== null;
        $update->execute([attendance_session_bool($class['session_biometric_required']) ? 1 : 0, $on ? 1 : 0, $location[0] ?? null, $location[1] ?? null,
            $on ? (float) $class['session_geofence_radius'] : null, $nowSql, (int) $row['session_id']]);
    }
}
