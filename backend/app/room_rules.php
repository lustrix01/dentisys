<?php

declare(strict_types=1);

/** ROOM-001: name match key, same rule as rooms.name_key (lower case, no spaces, dashes or dots). */
function room_match_key(string $name): string
{
    return strtolower(preg_replace('/[\s.\-]+/', '', $name));
}

/** The retired room's display name when the given room text matches one (a legacy "(Mon ...)" suffix is ignored). */
function room_retired_by_name(PDO $pdo, ?string $name): ?string
{
    $name = trim((string) $name);
    if ($name === '') return null;
    $keys = array_values(array_unique([room_match_key($name), room_match_key(preg_replace('/\s*\(.*$/s', '', $name))]));
    $stmt = $pdo->prepare("SELECT name FROM rooms WHERE status = 'retired'
        AND lower(regexp_replace(name, '[\s.\-]+', '', 'g')) IN (" . implode(',', array_fill(0, count($keys), '?')) . ') LIMIT 1');
    $stmt->execute($keys);
    $found = $stmt->fetchColumn();
    return $found === false ? null : (string) $found;
}
