<?php

declare(strict_types=1);

function academic_migration_assert(bool $condition, string $label): void
{
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$label}\n");
        exit(1);
    }
    echo "PASS: {$label}\n";
}

$root = dirname(__DIR__, 2);
$migration = file_get_contents($root . '/database/migrations/016_academic_notifications.sql');
academic_migration_assert(is_string($migration), 'Academic notification migration is readable');
academic_migration_assert(str_contains($migration, 'recipient_user_id'), 'Notifications store a recipient account');
academic_migration_assert(str_contains($migration, 'read_at'), 'Notifications store read state');
academic_migration_assert(str_contains($migration, 'deduplication_key'), 'Notifications store an idempotency key');
academic_migration_assert(str_contains($migration, 'FOREIGN KEY (recipient_user_id)'), 'Notification recipient is constrained to an account');
academic_migration_assert(str_contains($migration, 'WHERE deduplication_key IS NOT NULL'), 'Null notification keys remain allowed while non-null keys are unique');

echo "ALL ACADEMIC NOTIFICATION MIGRATION TESTS PASSED\n";
