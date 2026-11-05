<?php

declare(strict_types=1);

/** ROOM-001: Dean-managed rooms. Classes, meetings and sessions keep the room name as text. */

/** Same rule as rooms.name_key / room_categories.name_key (migration 057): ignores case, spaces, dashes, dots. */
const ROOM_KEY_SQL = "lower(regexp_replace(%s, '[\\s.\\-]+', '', 'g'))";

function room_key_sql(string $column): string
{
    return sprintf(ROOM_KEY_SQL, $column);
}

/** Legacy class rooms may carry a schedule suffix, e.g. "Room 301 (Wed 02:30 PM - 03:30 PM)". */
/** $param is an already quoted SQL literal (PDO::quote), so it can repeat. */
function room_class_match_sql(string $column, string $param): string
{
    $key = room_key_sql($column);
    return "({$key} = {$param} OR left({$key}, length({$param}) + 1) = {$param} || '(')";
}

class RoomConflict extends \RuntimeException
{
    public function __construct(public string $errorCode, string $msg, public array $extra = [], public int $status = 409)
    {
        parent::__construct($msg);
    }
}

/**
 * Rows (kind, faculty, cs_id, cs_name) that use a room name. $mode 'use' = in use (class whose term has not
 * ended and is not archived, its meetings, any scheduled session); 'rename' = what a rename changes (classes
 * and meetings of the current and future school years, scheduled sessions of those classes).
 */
function room_affected(PDO $pdo, string $nameKey, string $mode): array
{
    $k = $pdo->quote($nameKey);
    if ($mode === 'rename') {
        $scope = 'cs.school_year >= ' . $pdo->quote(academic_current_school_year($pdo));
        $sessionScope = $scope;
    } else {
        $end = "COALESCE((SELECT t.end_date FROM academic_terms t WHERE t.school_year = cs.school_year AND t.semester = CASE
            WHEN upper(cs.semester) LIKE '%1ST%' OR upper(cs.semester) LIKE '%FIRST%' THEN '1ST'
            WHEN upper(cs.semester) LIKE '%2ND%' OR upper(cs.semester) LIKE '%SECOND%' THEN '2ND'
            WHEN upper(cs.semester) LIKE '%SUMMER%' THEN 'Summer' END), cs.term_end_date)";
        $scope = "cs.archive_reason IS NULL AND ({$end} IS NULL OR {$end} >= CURRENT_DATE)";
        $sessionScope = 'TRUE';
    }
    return $pdo->query(
        "SELECT 'class' AS kind, cs.instructor_user_id AS faculty, cs.cs_id, cs.cs_name FROM class_sections cs
          WHERE {$scope} AND (" . room_class_match_sql('cs.lec_room', $k) . ' OR ' . room_class_match_sql('cs.lab_room', $k) . ")
         UNION ALL
         SELECT 'meeting', cs.instructor_user_id, cs.cs_id, cs.cs_name FROM class_meetings m JOIN class_sections cs ON cs.cs_id = m.cs_id
          WHERE {$scope} AND " . room_key_sql('m.room') . " = {$k}
         UNION ALL
         SELECT 'session', cs.instructor_user_id, cs.cs_id, cs.cs_name FROM attendance_sessions s JOIN class_sections cs ON cs.cs_id = s.cs_id
          WHERE s.status = 'scheduled' AND {$sessionScope} AND " . room_key_sql('s.room') . " = {$k}"
    )->fetchAll(PDO::FETCH_ASSOC);
}

function room_usage(PDO $pdo, string $nameKey, string $mode = 'use', ?array $rows = null): array
{
    $rows ??= room_affected($pdo, $nameKey, $mode);
    $n = static fn(string $kind): int => count(array_filter($rows, static fn(array $r): bool => $r['kind'] === $kind));
    return ['classes' => $n('class'), 'meetings' => $n('meeting'), 'scheduledSessions' => $n('session')];
}

/** One in-app notice per Faculty; $body receives e.g. "DENT-1A class and 2 upcoming sessions". */
function room_notify(PDO $pdo, array $rows, array $room, string $type, string $title, callable $body): void
{
    $byFaculty = [];
    foreach ($rows as $r) {
        if ($r['faculty'] === null) continue;
        $byFaculty[(int) $r['faculty']]['names'][$r['cs_name']] = true;
        $byFaculty[(int) $r['faculty']]['sessions'] = ($byFaculty[(int) $r['faculty']]['sessions'] ?? 0) + ($r['kind'] === 'session' ? 1 : 0);
    }
    foreach ($byFaculty as $faculty => $f) {
        $names = array_keys($f['names']);
        $parts = [implode(', ', $names) . (count($names) === 1 ? ' class' : ' classes')];
        if ($f['sessions'] > 0) $parts[] = $f['sessions'] . ' upcoming session' . ($f['sessions'] === 1 ? '' : 's');
        notification_create_idempotent($pdo, $faculty, $type, $title, $body(implode(' and ', $parts)), 'room',
            (string) $room['room_id'], $type . ':' . $room['room_id'] . ':' . $room['updated_at']);
    }
}

function room_json(array $row, ?array $usage = null): array
{
    $json = [
        'roomId' => (int) $row['room_id'], 'name' => $row['name'], 'categoryId' => (int) $row['category_id'],
        'group' => $row['category_name'],
        'latitude' => $row['latitude'] !== null ? (float) $row['latitude'] : null,
        'longitude' => $row['longitude'] !== null ? (float) $row['longitude'] : null,
        'radiusMeters' => $row['radius_meters'] !== null ? (float) $row['radius_meters'] : null,
        'status' => $row['status'], 'retiredAt' => $row['retired_at'],
    ];
    if ($usage !== null) {
        $json['usage'] = $usage;
        $json['inUse'] = array_sum($usage) > 0;
        $json['deletable'] = $row['status'] === 'retired' && !$json['inUse'];
    }
    return $json;
}

const ROOM_SELECT = 'SELECT r.*, c.name AS category_name FROM rooms r JOIN room_categories c ON c.category_id = r.category_id';

function room_fetch(PDO $pdo, int $id, bool $lock = false): array
{
    $stmt = $pdo->prepare(ROOM_SELECT . ' WHERE r.room_id = ?' . ($lock ? ' FOR UPDATE OF r' : ''));
    $stmt->execute([$id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) throw new RoomConflict('NOT_FOUND', 'Room not found.', [], 404);
    return $row;
}

function room_full_json(PDO $pdo, array $row): array
{
    return room_json($row, room_usage($pdo, $row['name_key']));
}

function room_list(PDO $pdo): array
{
    $rows = $pdo->query(ROOM_SELECT . ' ORDER BY c.name, r.name')->fetchAll(PDO::FETCH_ASSOC);
    return array_map(static fn(array $r): array => room_full_json($pdo, $r), $rows);
}

function category_json(array $row): array
{
    return ['categoryId' => (int) $row['category_id'], 'name' => $row['name'], 'status' => $row['status'],
        'retiredAt' => $row['retired_at'], 'roomCount' => (int) $row['room_count'], 'activeRoomCount' => (int) $row['active_room_count']];
}

const CATEGORY_SELECT = "SELECT c.*, (SELECT COUNT(*) FROM rooms r WHERE r.category_id = c.category_id) AS room_count,
    (SELECT COUNT(*) FROM rooms r WHERE r.category_id = c.category_id AND r.status = 'active') AS active_room_count FROM room_categories c";

function category_fetch(PDO $pdo, int $id, bool $lock = false): array
{
    $stmt = $pdo->prepare(CATEGORY_SELECT . ' WHERE c.category_id = ?' . ($lock ? ' FOR UPDATE OF c' : ''));
    $stmt->execute([$id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) throw new RoomConflict('NOT_FOUND', 'Category not found.', [], 404);
    return $row;
}

function room_number(array $data, string $field, float $min, float $max, array &$errors): ?float
{
    $v = $data[$field] ?? null;
    if ($v === null || $v === '') return null;
    if (!is_numeric($v) || !is_finite((float) $v) || (float) $v < $min || (float) $v > $max) {
        $errors[] = ['field' => $field, 'message' => $field === 'radiusMeters'
            ? "Radius must be between {$min} and {$max} meters."
            : ucfirst($field) . " must be between {$min} and {$max}."];
        return null;
    }
    return (float) $v;
}

function room_clean_name(array $data, string $field, ?string $current, string $label, array &$errors): string
{
    $raw = array_key_exists($field, $data) ? $data[$field] : ($current ?? '');
    $v = is_string($raw) ? trim(preg_replace('/\s+/u', ' ', $raw)) : '';
    if ($v === '' || mb_strlen($v) > 100) {
        $errors[] = ['field' => $field, 'message' => $v === '' ? "{$label} is required." : "{$label} must be 100 characters or fewer."];
    }
    return $v;
}

/** Validates the merged room values; $data keys that are present override $current. */
function room_validated(array $data, ?array $current): array
{
    $errors = [];
    $name = room_clean_name($data, 'name', $current['name'] ?? null, 'Room name', $errors);
    $merged = $data + ['latitude' => $current['latitude'] ?? null, 'longitude' => $current['longitude'] ?? null,
        'radiusMeters' => $current['radius_meters'] ?? null];
    $lat = room_number($merged, 'latitude', -90, 90, $errors);
    $lng = room_number($merged, 'longitude', -180, 180, $errors);
    $radius = room_number($merged, 'radiusMeters', 50, 2000, $errors);
    if (($lat === null) !== ($lng === null) && !array_filter($errors, static fn($e) => in_array($e['field'], ['latitude', 'longitude'], true))) {
        $errors[] = ['field' => 'latitude', 'message' => 'Enter both latitude and longitude, or neither.'];
    }
    if ($lat === null && $lng === null && $radius !== null) {
        // Clearing the location clears its radius too, unless the caller sent a new radius.
        if (array_key_exists('radiusMeters', $data) && $data['radiusMeters'] !== null && $data['radiusMeters'] !== '') {
            $errors[] = ['field' => 'radiusMeters', 'message' => 'A radius needs a location.'];
        }
        $radius = null;
    }
    if ($errors !== []) throw new ValidationException($errors);
    return ['name' => $name, 'latitude' => $lat, 'longitude' => $lng, 'radius_meters' => $radius];
}

/** Category for a room write: categoryId, or the legacy `group` name (finds one or creates it). Retired only if unchanged. */
function room_resolve_category(PDO $pdo, array $config, array $actor, array $data, ?array $current): int
{
    $retired = static fn() => new RoomConflict('ROOM_CATEGORY_RETIRED', 'This category is retired. Restore it or pick another category.');
    $sameAsCurrent = static fn(array $cat): bool => (int) $cat['category_id'] === (int) ($current['category_id'] ?? 0);
    if (isset($data['categoryId']) && $data['categoryId'] !== '') {
        $cat = category_fetch($pdo, (int) $data['categoryId']);
        if ($cat['status'] !== 'active' && !$sameAsCurrent($cat)) throw $retired();
        return (int) $cat['category_id'];
    }
    if (array_key_exists('group', $data)) {
        $errors = [];
        $name = room_clean_name($data, 'group', null, 'Category', $errors);
        if ($errors !== []) throw new ValidationException($errors);
        $stmt = $pdo->prepare('SELECT * FROM room_categories WHERE name_key = ' . room_key_sql('?'));
        $stmt->execute([$name]);
        if ($cat = $stmt->fetch(PDO::FETCH_ASSOC)) {
            if ($cat['status'] !== 'active' && !$sameAsCurrent($cat)) throw $retired();
            return (int) $cat['category_id'];
        }
        return category_create($pdo, $config, $actor, ['name' => $name])['category']['categoryId'];
    }
    if ($current !== null) return (int) $current['category_id'];
    throw new ValidationException([['field' => 'categoryId', 'message' => 'Category is required.']]);
}

function room_audit_view(array $row): array
{
    return ['name' => $row['name'], 'group' => $row['category_name'], 'latitude' => $row['latitude'] === null ? null : (string) $row['latitude'],
        'longitude' => $row['longitude'] === null ? null : (string) $row['longitude'],
        'radiusMeters' => $row['radius_meters'] === null ? null : (string) $row['radius_meters'], 'status' => $row['status']];
}

function room_write_name_taken(PDOException $e): never
{
    if ($e->getCode() === '23505') throw new RoomConflict('ROOM_NAME_TAKEN', 'A room with this name already exists.');
    throw $e;
}

function room_create(PDO $pdo, array $config, array $actor, array $data): array
{
    $v = room_validated($data, null);
    $v['category_id'] = room_resolve_category($pdo, $config, $actor, $data, null);
    try {
        $stmt = $pdo->prepare('INSERT INTO rooms (name, category_id, latitude, longitude, radius_meters)
            VALUES (:name, :category_id, :latitude, :longitude, :radius_meters) RETURNING room_id');
        $stmt->execute($v);
    } catch (PDOException $e) { room_write_name_taken($e); }
    $row = room_fetch($pdo, (int) $stmt->fetchColumn());
    audit_record_action($pdo, $config, $actor, 'settings', 'room_created', 'room', (string) $row['room_id'],
        'Added room ' . $row['name'] . '.', ['after' => room_audit_view($row)]);
    return ['room' => room_full_json($pdo, $row)];
}

function room_update(PDO $pdo, array $config, array $actor, array $data): array
{
    $before = room_fetch($pdo, (int) ($data['roomId'] ?? 0), true);
    $v = room_validated($data, $before);
    $renamed = $v['name'] !== $before['name'];
    if ($renamed && $before['status'] !== 'active') throw new RoomConflict('ROOM_RETIRED', 'Restore the room before renaming it.');
    $v['category_id'] = room_resolve_category($pdo, $config, $actor, $data, $before);
    $affected = $renamed ? room_affected($pdo, $before['name_key'], 'rename') : [];
    $usage = room_usage($pdo, $before['name_key'], 'rename', $affected);
    if ($renamed && array_sum($usage) > 0 && ($data['confirmRename'] ?? false) !== true) {
        throw new RoomConflict('ROOM_RENAME_CONFIRM', 'Renaming this room changes the classes and sessions that use it.', ['usage' => $usage]);
    }
    try {
        $stmt = $pdo->prepare('UPDATE rooms SET name = :name, category_id = :category_id, latitude = :latitude, longitude = :longitude,
            radius_meters = :radius_meters, updated_at = CURRENT_TIMESTAMP(6) WHERE room_id = :id RETURNING room_id');
        $stmt->execute($v + ['id' => $before['room_id']]);
    } catch (PDOException $e) { room_write_name_taken($e); }
    $row = room_fetch($pdo, (int) $stmt->fetchColumn());
    if ($renamed) {
        $k = $pdo->quote($before['name_key']);
        $n = $pdo->quote($v['name']);
        $cur = $pdo->quote(academic_current_school_year($pdo));
        foreach (['lec_room', 'lab_room'] as $col) {
            // Keep a legacy schedule suffix; only the room-name part is replaced.
            $pdo->exec("UPDATE class_sections SET {$col} = CASE WHEN " . room_key_sql($col) . " = {$k} THEN {$n}
                ELSE {$n} || ' ' || substring({$col} from '\([^()]*\)\s*\$') END
                WHERE school_year >= {$cur} AND " . room_class_match_sql($col, $k));
        }
        $pdo->exec("UPDATE class_meetings m SET room = {$n} FROM class_sections cs WHERE cs.cs_id = m.cs_id AND cs.school_year >= {$cur}
            AND " . room_key_sql('m.room') . " = {$k}");
        $pdo->exec("UPDATE attendance_sessions s SET room = {$n} FROM class_sections cs WHERE cs.cs_id = s.cs_id AND cs.school_year >= {$cur}
            AND s.status = 'scheduled' AND " . room_key_sql('s.room') . " = {$k}");
        room_notify($pdo, $affected, $row, 'room_renamed', 'Room renamed', static fn(string $what): string =>
            $before['name'] . ' is now ' . $row['name'] . '. Your ' . $what . ' were updated.');
    }
    audit_record_action($pdo, $config, $actor, 'settings', 'room_updated', 'room', (string) $row['room_id'],
        $renamed ? 'Renamed room ' . $before['name'] . ' to ' . $row['name'] . '.' : 'Changed room ' . $row['name'] . '.',
        ['before' => room_audit_view($before), 'after' => room_audit_view($row) + ($renamed ? ['renamed' => $usage] : [])]);
    return ['room' => room_full_json($pdo, $row), 'renamed' => $usage];
}

function room_set_status(PDO $pdo, array $config, array $actor, int $id, string $to): array
{
    $before = room_fetch($pdo, $id, true);
    if ($before['status'] === $to) {
        throw new RoomConflict('ROOM_STATUS_UNCHANGED', $to === 'retired' ? 'This room is already retired.' : 'This room is not retired.');
    }
    if ($to === 'active' && category_fetch($pdo, (int) $before['category_id'])['status'] !== 'active') {
        throw new RoomConflict('ROOM_CATEGORY_RETIRED', 'Restore the category first.');
    }
    $pdo->prepare('UPDATE rooms SET status = ?, retired_at = ' . ($to === 'retired' ? 'CURRENT_TIMESTAMP(6)' : 'NULL')
        . ', updated_at = CURRENT_TIMESTAMP(6) WHERE room_id = ?')->execute([$to, $id]);
    $row = room_fetch($pdo, $id);
    if ($to === 'retired') {
        room_notify($pdo, room_affected($pdo, $row['name_key'], 'use'), $row, 'room_retired', 'Room retired', static fn(string $what): string =>
            $row['name'] . ' was retired by the Dean. Change the room for ' . $what . '.');
    }
    $code = $to === 'retired' ? 'room_retired' : 'room_restored';
    audit_record_action($pdo, $config, $actor, 'settings', $code, 'room', (string) $id,
        ($to === 'retired' ? 'Retired room ' : 'Restored room ') . $row['name'] . '.',
        ['before' => room_audit_view($before), 'after' => room_audit_view($row)]);
    return ['room' => room_full_json($pdo, $row)];
}

function room_delete(PDO $pdo, array $config, array $actor, int $id): array
{
    $row = room_fetch($pdo, $id, true);
    if ($row['status'] !== 'retired') throw new RoomConflict('ROOM_NOT_RETIRED', 'Retire the room first.');
    $usage = room_usage($pdo, $row['name_key']);
    if (array_sum($usage) > 0) {
        $plural = static fn(int $n, string $word): string => $n . ' ' . $word . ($n === 1 ? '' : 's');
        $parts = array_filter([
            $usage['classes'] > 0 ? $plural($usage['classes'], 'class') . ' whose term has not ended' : null,
            $usage['meetings'] > 0 ? $plural($usage['meetings'], 'class meeting') : null,
            $usage['scheduledSessions'] > 0 ? $plural($usage['scheduledSessions'], 'scheduled session') : null,
        ]);
        throw new RoomConflict('ROOM_IN_USE', $row['name'] . ' is used by ' . implode(', ', $parts) . '. Move '
            . (array_sum($usage) === 1 ? 'it' : 'them') . ' to another room first.', ['usage' => $usage]);
    }
    $pdo->prepare('DELETE FROM rooms WHERE room_id = ?')->execute([$id]);
    audit_record_action($pdo, $config, $actor, 'settings', 'room_deleted', 'room', (string) $id,
        'Deleted room ' . $row['name'] . '.', ['before' => room_audit_view($row)]);
    return [];
}

function category_audit_view(array $row): array
{
    return ['name' => $row['name'], 'status' => $row['status']];
}

function category_name_taken(PDOException $e): never
{
    if ($e->getCode() === '23505') throw new RoomConflict('CATEGORY_NAME_TAKEN', 'A category with this name already exists.');
    throw $e;
}

function category_create(PDO $pdo, array $config, array $actor, array $data): array
{
    $errors = [];
    $name = room_clean_name($data, 'name', null, 'Category name', $errors);
    if ($errors !== []) throw new ValidationException($errors);
    try {
        $stmt = $pdo->prepare('INSERT INTO room_categories (name) VALUES (?) RETURNING category_id');
        $stmt->execute([$name]);
    } catch (PDOException $e) { category_name_taken($e); }
    $row = category_fetch($pdo, (int) $stmt->fetchColumn());
    audit_record_action($pdo, $config, $actor, 'settings', 'room_category_created', 'room_category', (string) $row['category_id'],
        'Added room category ' . $row['name'] . '.', ['after' => category_audit_view($row)]);
    return ['category' => category_json($row)];
}

function category_update(PDO $pdo, array $config, array $actor, array $data): array
{
    $before = category_fetch($pdo, (int) ($data['categoryId'] ?? 0), true);
    $errors = [];
    $name = room_clean_name($data, 'name', $before['name'], 'Category name', $errors);
    if ($errors !== []) throw new ValidationException($errors);
    try {
        $pdo->prepare('UPDATE room_categories SET name = ?, updated_at = CURRENT_TIMESTAMP(6) WHERE category_id = ?')->execute([$name, $before['category_id']]);
    } catch (PDOException $e) { category_name_taken($e); }
    $row = category_fetch($pdo, (int) $before['category_id']);
    audit_record_action($pdo, $config, $actor, 'settings', 'room_category_updated', 'room_category', (string) $row['category_id'],
        'Renamed room category ' . $before['name'] . ' to ' . $row['name'] . '.', ['before' => category_audit_view($before), 'after' => category_audit_view($row)]);
    return ['category' => category_json($row)];
}

function category_set_status(PDO $pdo, array $config, array $actor, int $id, string $to): array
{
    $before = category_fetch($pdo, $id, true);
    if ($before['status'] === $to) {
        throw new RoomConflict('CATEGORY_STATUS_UNCHANGED', $to === 'retired' ? 'This category is already retired.' : 'This category is not retired.');
    }
    if ($to === 'retired' && (int) $before['active_room_count'] > 0) {
        $names = $pdo->prepare("SELECT name FROM rooms WHERE category_id = ? AND status = 'active' ORDER BY name");
        $names->execute([$id]);
        throw new RoomConflict('CATEGORY_HAS_ACTIVE_ROOMS', 'Retire these rooms first: ' . implode(', ', $names->fetchAll(PDO::FETCH_COLUMN)) . '.');
    }
    $pdo->prepare('UPDATE room_categories SET status = ?, retired_at = ' . ($to === 'retired' ? 'CURRENT_TIMESTAMP(6)' : 'NULL')
        . ', updated_at = CURRENT_TIMESTAMP(6) WHERE category_id = ?')->execute([$to, $id]);
    $row = category_fetch($pdo, $id);
    audit_record_action($pdo, $config, $actor, 'settings', $to === 'retired' ? 'room_category_retired' : 'room_category_restored', 'room_category', (string) $id,
        ($to === 'retired' ? 'Retired room category ' : 'Restored room category ') . $row['name'] . '.',
        ['before' => category_audit_view($before), 'after' => category_audit_view($row)]);
    return ['category' => category_json($row)];
}

function category_delete(PDO $pdo, array $config, array $actor, int $id): array
{
    $row = category_fetch($pdo, $id, true);
    if ((int) $row['room_count'] > 0) throw new RoomConflict('CATEGORY_NOT_EMPTY', 'Delete or move its rooms first.');
    $pdo->prepare('DELETE FROM room_categories WHERE category_id = ?')->execute([$id]);
    audit_record_action($pdo, $config, $actor, 'settings', 'room_category_deleted', 'room_category', (string) $id,
        'Deleted room category ' . $row['name'] . '.', ['before' => category_audit_view($row)]);
    return [];
}

function handle_admin_rooms(): void
{
    $pdo = null;
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $actor = admin_verify_auth($pdo, $config);
        if (request_method() === 'GET') {
            $categories = array_map('category_json', $pdo->query(CATEGORY_SELECT . ' ORDER BY c.name')->fetchAll(PDO::FETCH_ASSOC));
            json_response(['status' => 'ok', 'rooms' => room_list($pdo), 'categories' => $categories,
                'groups' => array_column(array_filter($categories, static fn(array $c): bool => $c['status'] === 'active'), 'name')]);
            return;
        }
        $body = request_body();
        if (!$body['has_body']) { safe_error_response('Request body required.', 400); return; }
        $data = $body['data'];
        $action = basename(request_path());
        $pdo->beginTransaction();
        $id = (int) ($data['roomId'] ?? 0);
        $status = 200;
        if (str_contains(request_path(), '/room-categories')) {
            $cid = (int) ($data['categoryId'] ?? 0);
            switch ($action) {
                case 'room-categories': $result = category_create($pdo, $config, $actor, $data); $status = 201; break;
                case 'update': $result = category_update($pdo, $config, $actor, $data); break;
                case 'retire': $result = category_set_status($pdo, $config, $actor, $cid, 'retired'); break;
                case 'restore': $result = category_set_status($pdo, $config, $actor, $cid, 'active'); break;
                case 'delete': $result = category_delete($pdo, $config, $actor, $cid); break;
                default: $pdo->rollBack(); safe_error_response('Not found.', 404); return;
            }
            $pdo->commit();
            json_response(['status' => 'ok'] + $result, $status);
            return;
        }
        switch ($action) {
            case 'rooms': $result = room_create($pdo, $config, $actor, $data); $status = 201; break;
            case 'update': $result = room_update($pdo, $config, $actor, $data); break;
            case 'retire': $result = room_set_status($pdo, $config, $actor, $id, 'retired'); break;
            case 'restore': $result = room_set_status($pdo, $config, $actor, $id, 'active'); break;
            case 'delete': $result = room_delete($pdo, $config, $actor, $id); break;
            default: $pdo->rollBack(); safe_error_response('Not found.', 404); return;
        }
        $pdo->commit();
        json_response(['status' => 'ok'] + $result, $status);
    } catch (ValidationException $e) {
        if ($pdo instanceof PDO && $pdo->inTransaction()) $pdo->rollBack();
        validation_error_response($e->getErrors());
    } catch (RoomConflict $e) {
        if ($pdo instanceof PDO && $pdo->inTransaction()) $pdo->rollBack();
        json_response(['status' => 'error', 'code' => $e->errorCode, 'message' => $e->getMessage(),
            'requestId' => request_id()] + $e->extra, $e->status);
    } catch (Throwable $e) {
        if ($pdo instanceof PDO && $pdo->inTransaction()) $pdo->rollBack();
        error_log('Rooms error: ' . sanitize_for_log($e));
        safe_error_response('Unable to save rooms.', 500);
    }
}

/** Faculty, Secretary and Dean read the list to fill their room dropdowns. */
function handle_rooms_list(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $header = request_header('Authorization') ?? '';
        if ($header === '') { auth_error_response('Authorization header required.', 401); return; }
        try {
            $ctx = auth_verify_access_token($pdo, $config, auth_extract_bearer_token($header),
                config_key_bytes_at_least($config['jwt']['signing_key_b64'], 32, 'JWT_SIGNING_KEY'));
        } catch (AuthException | \RuntimeException $e) { auth_error_response($e->getMessage(), 401); return; }
        if (!in_array($ctx['role'], ['admin', 'faculty', 'secretary'], true)) {
            safe_error_response('Access denied.', 403);
            return;
        }
        $rows = $pdo->query(ROOM_SELECT . ' ORDER BY c.name, r.name')->fetchAll(PDO::FETCH_ASSOC);
        json_response(['status' => 'ok', 'rooms' => array_map(static function (array $r): array {
            $j = room_json($r);
            return ['name' => $j['name'], 'group' => $j['group'], 'status' => $j['status'], 'latitude' => $j['latitude'],
                'longitude' => $j['longitude'], 'radiusMeters' => $j['radiusMeters']];
        }, $rows)]);
    } catch (Throwable $e) {
        error_log('Rooms list error: ' . sanitize_for_log($e));
        safe_error_response('Unable to load rooms.', 500);
    }
}
