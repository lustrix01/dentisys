<?php

declare(strict_types=1);

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

function class_meetings_conflict(PDO $pdo, string $schoolYear, int $instructorId, array $proposed, int $excludeCsId): ?string
{
    if ($proposed === []) return null;
    // Serialize schedule writes for the year, including other Faculty using the same room.
    $pdo->prepare('SELECT pg_advisory_xact_lock(hashtext(?))')->execute(['class-meetings:' . $schoolYear]);
    $stmt = $pdo->prepare("SELECT cs_id, cs_name, instructor_user_id, lec_room, lab_room, meetings_recorded FROM class_sections WHERE school_year = ? AND status = 'Active' AND cs_id <> ?");
    $stmt->execute([$schoolYear, $excludeCsId]);
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $class) {
        foreach (class_meetings_read($pdo, $class) as $existing) {
            foreach ($proposed as $meeting) {
                if ($meeting['day'] !== $existing['day'] || $meeting['startTime'] >= $existing['endTime'] || $existing['startTime'] >= $meeting['endTime']) continue;
                if ((int) $class['instructor_user_id'] === $instructorId || strcasecmp($meeting['room'], $existing['room']) === 0) {
                    return "Schedule conflict: {$class['cs_name']} already uses {$existing['room']} on {$existing['day']} from {$existing['startTime']} to {$existing['endTime']}.";
                }
            }
        }
    }
    return null;
}
