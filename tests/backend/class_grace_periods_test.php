<?php

declare(strict_types=1);

require_once __DIR__ . '/../../backend/app/config.php';
require_once __DIR__ . '/../../backend/app/validation.php';
require_once __DIR__ . '/../../backend/app/attendance_sessions.php';

function grace_assert(mixed $expected, mixed $actual, string $label): void
{
    if ($expected !== $actual) {
        fwrite(STDERR, "FAIL: {$label}\nExpected: " . var_export($expected, true) . "\nActual: " . var_export($actual, true) . "\n");
        exit(1);
    }
    echo "PASS: {$label}\n";
}

// ATT-001: Faculty sessions save the Present / Late minutes after opening on the class when 1 <= present < late <= 720.
grace_assert([15, 30], attendance_session_grace_minutes('08:00:00', '08:15:00', '08:30:00'), 'default grace periods');
grace_assert([20, 45], attendance_session_grace_minutes('08:00', '08:20', '08:45'), 'HH:MM works too');
grace_assert([30, 90], attendance_session_grace_minutes('23:30:00', '00:00:00', '01:00:00'), 'cutoffs after midnight count from the opening');
grace_assert([60, 720], attendance_session_grace_minutes('08:00:00', '09:00:00', '20:00:00'), 'late may be exactly 720 minutes');
grace_assert(null, attendance_session_grace_minutes('08:00:00', '08:00:00', '08:30:00'), 'present at the opening is not saved');
grace_assert(null, attendance_session_grace_minutes('08:00:00', '08:30:00', '08:30:00'), 'late must be after present');
grace_assert(null, attendance_session_grace_minutes('08:00:00', '08:45:00', '08:30:00'), 'late before present is not saved');
grace_assert(null, attendance_session_grace_minutes('08:00:00', '09:00:00', '20:01:00'), 'late over 720 minutes is not saved');
