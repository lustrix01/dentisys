<?php

declare(strict_types=1);

/** ROOM-001: Dean-managed rooms. Classes, meetings and sessions keep the room name as text. */

/** Same rule as rooms.name_key in migration 054. */
const ROOM_KEY_SQL = "lower(btrim(regexp_replace(%s, '\\s+', ' ', 'g')))";

function room_key_sql(string $column): string
{
    return sprintf(ROOM_KEY_SQL, $column);
}

/** Legacy class rooms may carry a schedule suffix, e.g. "Room 301 (Wed 02:30 PM - 03:30 PM)". */
/** $param is an already quoted SQL literal (PDO::quote), so it can repeat. */
function room_class_match_sql(string $column, string $param): string
{
    $key = room_key_sql($column);
    return "({$key} = {$param} OR left({$key}, length({$param}) + 2) = {$param} || ' (')";
}

class RoomConflict extends \RuntimeException
{
    public function __construct(public string $errorCode, string $msg, public array $extra = [], public int $status = 409)
    {
        parent::__construct($msg);
    }
}

function room_usage(PDO $pdo, string $nameKey): array
{
    $q = $pdo->quote($nameKey);
    $stmt = $pdo->prepare(
        'SELECT
            (SELECT COUNT(*) FROM class_sections WHERE ' . room_class_match_sql('lec_room', $q) . ' OR ' . room_class_match_sql('lab_room', $q) . ') AS classes,
            (SELECT COUNT(*) FROM class_meetings WHERE ' . room_key_sql('room') . ' = :k3) AS meetings,
            (SELECT COUNT(*) FROM attendance_sessions WHERE status = \'scheduled\' AND ' . room_key_sql('room') . ' = :k4) AS scheduled,
            (SELECT COUNT(*) FROM attendance_sessions WHERE status <> \'scheduled\' AND ' . room_key_sql('room') . ' = :k5) AS other'
    );
    $stmt->execute(['k3' => $nameKey, 'k4' => $nameKey, 'k5' => $nameKey]);
    $r = $stmt->fetch(PDO::FETCH_ASSOC);
    return ['classes' => (int) $r['classes'], 'meetings' => (int) $r['meetings'],
        'scheduledSessions' => (int) $r['scheduled'], 'otherSessions' => (int) $r['other']];
}

function room_json(array $row, ?array $usage = null): array
{
    $json = [
        'roomId' => (int) $row['room_id'], 'name' => $row['name'], 'group' => $row['group_name'],
        'latitude' => $row['latitude'] !== null ? (float) $row['latitude'] : null,
        'longitude' => $row['longitude'] !== null ? (float) $row['longitude'] : null,
        'radiusMeters' => $row['radius_meters'] !== null ? (float) $row['radius_meters'] : null,
        'status' => $row['status'], 'retiredAt' => $row['retired_at'],
    ];
    if ($usage !== null) {
        $json['usage'] = $usage;
        $json['deletable'] = $row['status'] === 'retired' && array_sum($usage) === 0;
    }
    return $json;
}

function room_fetch(PDO $pdo, int $id, bool $lock = false): array
{
    $stmt = $pdo->prepare('SELECT * FROM rooms WHERE room_id = ?' . ($lock ? ' FOR UPDATE' : ''));
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
    $rows = $pdo->query('SELECT * FROM rooms ORDER BY group_name, name')->fetchAll(PDO::FETCH_ASSOC);
    return array_map(static fn(array $r): array => room_full_json($pdo, $r), $rows);
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

/** Validates the merged room values; $data keys that are present override $current. */
function room_validated(array $data, ?array $current): array
{
    $errors = [];
    $text = static function (string $field, string $col, string $label) use ($data, $current, &$errors): string {
        $raw = array_key_exists($field, $data) ? $data[$field] : ($current[$col] ?? '');
        $v = is_string($raw) ? trim(preg_replace('/\s+/u', ' ', $raw)) : '';
        if ($v === '' || mb_strlen($v) > 100) {
            $errors[] = ['field' => $field, 'message' => $v === '' ? "{$label} is required." : "{$label} must be 100 characters or fewer."];
        }
        return $v;
    };
    $name = $text('name', 'name', 'Room name');
    $group = $text('group', 'group_name', 'Group');
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
    return ['name' => $name, 'group_name' => $group, 'latitude' => $lat, 'longitude' => $lng, 'radius_meters' => $radius];
}

function room_audit_view(array $row): array
{
    return ['name' => $row['name'], 'group' => $row['group_name'], 'latitude' => $row['latitude'] === null ? null : (string) $row['latitude'],
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
    try {
        $stmt = $pdo->prepare('INSERT INTO rooms (name, group_name, latitude, longitude, radius_meters)
            VALUES (:name, :group_name, :latitude, :longitude, :radius_meters) RETURNING *');
        $stmt->execute($v);
    } catch (PDOException $e) { room_write_name_taken($e); }
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    audit_record_action($pdo, $config, $actor, 'settings', 'room_created', 'room', (string) $row['room_id'],
        'Added room ' . $row['name'] . '.', ['after' => room_audit_view($row)]);
    return ['room' => room_full_json($pdo, $row)];
}

function room_update(PDO $pdo, array $config, array $actor, array $data): array
{
    $before = room_fetch($pdo, (int) ($data['roomId'] ?? 0), true);
    $v = room_validated($data, $before);
    $renamed = $v['name'] !== $before['name'];
    $usage = room_usage($pdo, $before['name_key']);
    if ($renamed && array_sum($usage) > 0 && ($data['confirmRename'] ?? false) !== true) {
        throw new RoomConflict('ROOM_RENAME_CONFIRM', 'Renaming this room changes the classes and sessions that use it.', ['usage' => $usage]);
    }
    $counts = ['classes' => 0, 'meetings' => 0, 'scheduledSessions' => 0];
    try {
        $stmt = $pdo->prepare('UPDATE rooms SET name = :name, group_name = :group_name, latitude = :latitude, longitude = :longitude,
            radius_meters = :radius_meters, updated_at = CURRENT_TIMESTAMP(6) WHERE room_id = :id RETURNING *');
        $stmt->execute($v + ['id' => $before['room_id']]);
    } catch (PDOException $e) { room_write_name_taken($e); }
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($renamed) {
        $key = $before['name_key'];
        $counts['classes'] = $usage['classes'];
        foreach (['lec_room', 'lab_room'] as $col) {
            // Keep a legacy schedule suffix; only the room-name prefix is replaced.
            $pdo->prepare("UPDATE class_sections SET {$col} = :name || substr(btrim(regexp_replace({$col}, '\s+', ' ', 'g')), length(" . $pdo->quote($key) . ') + 1) WHERE '
                . room_class_match_sql($col, $pdo->quote($key)))->execute(['name' => $v['name']]);
        }
        $m = $pdo->prepare('UPDATE class_meetings SET room = ? WHERE ' . room_key_sql('room') . ' = ?');
        $m->execute([$v['name'], $key]);
        $counts['meetings'] = $m->rowCount();
        $s = $pdo->prepare("UPDATE attendance_sessions SET room = ? WHERE status = 'scheduled' AND " . room_key_sql('room') . ' = ?');
        $s->execute([$v['name'], $key]);
        $counts['scheduledSessions'] = $s->rowCount();
    }
    audit_record_action($pdo, $config, $actor, 'settings', 'room_updated', 'room', (string) $row['room_id'],
        $renamed ? 'Renamed room ' . $before['name'] . ' to ' . $row['name'] . '.' : 'Changed room ' . $row['name'] . '.',
        ['before' => room_audit_view($before), 'after' => room_audit_view($row) + ($renamed ? ['renamed' => $counts] : [])]);
    return ['room' => room_full_json($pdo, $row), 'renamed' => $counts];
}

function room_set_status(PDO $pdo, array $config, array $actor, int $id, string $to): array
{
    $before = room_fetch($pdo, $id, true);
    if ($before['status'] === $to) {
        throw new RoomConflict('ROOM_STATUS_UNCHANGED', $to === 'retired' ? 'This room is already retired.' : 'This room is not retired.');
    }
    $stmt = $pdo->prepare('UPDATE rooms SET status = ?, retired_at = ' . ($to === 'retired' ? 'CURRENT_TIMESTAMP(6)' : 'NULL')
        . ', updated_at = CURRENT_TIMESTAMP(6) WHERE room_id = ? RETURNING *');
    $stmt->execute([$to, $id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
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
    if (array_sum(room_usage($pdo, $row['name_key'])) > 0) {
        throw new RoomConflict('ROOM_IN_USE', 'This room is used by classes or sessions, so it can only stay retired.');
    }
    $pdo->prepare('DELETE FROM rooms WHERE room_id = ?')->execute([$id]);
    audit_record_action($pdo, $config, $actor, 'settings', 'room_deleted', 'room', (string) $id,
        'Deleted room ' . $row['name'] . '.', ['before' => room_audit_view($row)]);
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
            $rooms = room_list($pdo);
            json_response(['status' => 'ok', 'rooms' => $rooms, 'groups' => array_values(array_unique(array_column($rooms, 'group')))]);
            return;
        }
        $body = request_body();
        if (!$body['has_body']) { safe_error_response('Request body required.', 400); return; }
        $data = $body['data'];
        $action = basename(request_path());
        $pdo->beginTransaction();
        $id = (int) ($data['roomId'] ?? 0);
        $status = 200;
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
        $rows = $pdo->query('SELECT * FROM rooms ORDER BY group_name, name')->fetchAll(PDO::FETCH_ASSOC);
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
