<?php

declare(strict_types=1);

/**
 * Insert a recipient-scoped notification once per optional deduplication key.
 * Callers may use this inside their existing transaction so an academic
 * mutation and its notification commit or roll back together.
 */
function notification_create_idempotent(
    PDO $pdo,
    int $recipientUserId,
    string $type,
    string $title,
    string $body,
    ?string $entityType = null,
    ?string $entityId = null,
    ?string $deduplicationKey = null
): array {
    if ($recipientUserId <= 0) {
        throw new InvalidArgumentException('Notification recipient is required.');
    }
    if (trim($type) === '' || trim($title) === '' || trim($body) === '') {
        throw new InvalidArgumentException('Notification type, title, and body are required.');
    }
    if ($deduplicationKey !== null && trim($deduplicationKey) === '') {
        $deduplicationKey = null;
    }

    $insert = $pdo->prepare(
        'INSERT INTO notifications
            (recipient_user_id, notification_type, title, body, entity_type, entity_id, deduplication_key)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT DO NOTHING
         RETURNING notification_id, recipient_user_id, notification_type, title, body,
                   entity_type, entity_id, deduplication_key, read_at, created_at'
    );
    $insert->execute([
        $recipientUserId,
        trim($type),
        trim($title),
        trim($body),
        $entityType !== null ? trim($entityType) : null,
        $entityId !== null ? trim($entityId) : null,
        $deduplicationKey !== null ? trim($deduplicationKey) : null,
    ]);
    $row = $insert->fetch(PDO::FETCH_ASSOC);
    $created = is_array($row);

    if (!$created && $deduplicationKey !== null) {
        $existing = $pdo->prepare(
            'SELECT notification_id, recipient_user_id, notification_type, title, body,
                    entity_type, entity_id, deduplication_key, read_at, created_at
               FROM notifications
              WHERE recipient_user_id = ? AND deduplication_key = ?
              LIMIT 1'
        );
        $existing->execute([$recipientUserId, $deduplicationKey]);
        $row = $existing->fetch(PDO::FETCH_ASSOC);
    }

    if (!is_array($row)) {
        throw new RuntimeException('Notification could not be reloaded after insert.');
    }

    return ['created' => $created, 'row' => $row];
}

function notification_payload(array $row): array
{
    return [
        'id' => (string) $row['notification_id'],
        'type' => (string) $row['notification_type'],
        'title' => (string) $row['title'],
        'body' => (string) $row['body'],
        'entityType' => $row['entity_type'] !== null ? (string) $row['entity_type'] : null,
        'entityId' => $row['entity_id'] !== null ? (string) $row['entity_id'] : null,
        'readAt' => $row['read_at'],
        'createdAt' => $row['created_at'],
        'isRead' => $row['read_at'] !== null,
    ];
}
