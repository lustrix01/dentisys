<?php

declare(strict_types=1);

require_once __DIR__ . '/../../backend/app/auth.php';

function auth_idle_timeout_assert(bool $condition, string $label): void
{
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$label}\n");
        exit(1);
    }
    echo "PASS: {$label}\n";
}

function auth_idle_timeout_timestamp(string $value): int
{
    return (new DateTimeImmutable($value, new DateTimeZone('UTC')))->getTimestamp();
}

$createdAt = auth_idle_timeout_timestamp('2026-11-11 10:00:00.000000');
$lastSeenAt = auth_idle_timeout_timestamp('2026-11-11 10:00:00.000000');

// A session that has never been touched falls back to its created_at.
auth_idle_timeout_assert(
    !auth_session_idle_expired(null, '2026-11-11 10:00:00.000000', $createdAt + 1799),
    'Null last_seen uses created_at: 1799s is not idle'
);
auth_idle_timeout_assert(
    auth_session_idle_expired(null, '2026-11-11 10:00:00.000000', $createdAt + 1800),
    'Null last_seen uses created_at: 1800s is idle'
);

// Exact idle-limit boundary.
auth_idle_timeout_assert(
    !auth_session_idle_expired('2026-11-11 10:00:00.000000', '2026-11-11 10:00:00.000000', $lastSeenAt + 1799),
    '1799s since last activity is not idle'
);
auth_idle_timeout_assert(
    auth_session_idle_expired('2026-11-11 10:00:00.000000', '2026-11-11 10:00:00.000000', $lastSeenAt + 1800),
    '1800s since last activity is idle'
);
auth_idle_timeout_assert(
    auth_session_idle_expired('2026-11-11 10:00:00.000000', '2026-11-11 10:00:00.000000', $lastSeenAt + 1801),
    '1801s since last activity is idle'
);

// Activity keeps an older session alive: only last_seen decides idleness.
auth_idle_timeout_assert(
    !auth_session_idle_expired('2026-11-11 10:29:00.000000', '2026-11-11 06:00:00.000000', $lastSeenAt + 1860),
    'Older created_at with recent last_seen is not idle'
);

echo "PASS: auth_session_idle_expired idle-timeout checks\n";
