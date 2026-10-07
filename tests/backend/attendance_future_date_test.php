<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/backend/app/config.php';
require_once dirname(__DIR__, 2) . '/backend/app/validation.php';
require_once dirname(__DIR__, 2) . '/backend/controllers/FacultyController.php';

function attendance_future_date_assert(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$message}\n");
        exit(1);
    }
    fwrite(STDOUT, "PASS: {$message}\n");
}

function attendance_future_date_rejects(
    string $date,
    array $config,
    string $expectedMessage,
    string $field = 'sessionDate'
): void {
    try {
        faculty_attendance_validate_date($date, $config, $field);
    } catch (ValidationException $exception) {
        attendance_future_date_assert(
            $exception->getErrors() === [['field' => $field, 'message' => $expectedMessage]],
            "{$date} is rejected with the exact {$field} validation error"
        );
        return;
    }

    attendance_future_date_assert(false, "{$date} is rejected with the exact {$field} validation error");
}

$config = app_config(['APP_ENV' => 'test', 'APP_TIMEZONE' => 'Asia/Manila']);
$today = app_local_date($config, new DateTimeImmutable('now', new DateTimeZone('UTC')));
$manilaToday = new DateTimeImmutable($today, new DateTimeZone('Asia/Manila'));
$yesterday = $manilaToday->modify('-1 day')->format('Y-m-d');
$tomorrow = $manilaToday->modify('+1 day')->format('Y-m-d');

attendance_future_date_assert(
    faculty_attendance_validate_date($today, $config, 'sessionDate') === $today,
    'Manila today is accepted for attendance recording'
);
attendance_future_date_assert(
    faculty_attendance_validate_date($yesterday, $config, 'sessionDate') === $yesterday,
    'A past worksheet date remains accepted by the validator'
);
attendance_future_date_rejects($tomorrow, $config, 'Worksheet date cannot be in the future.');
attendance_future_date_assert(
    faculty_attendance_validate_date($tomorrow, $config, 'date', true) === $tomorrow,
    'A future Manila date is accepted when validating a worksheet view'
);
attendance_future_date_rejects('2026-02-30', $config, 'Worksheet date must be a valid YYYY-MM-DD date.');
attendance_future_date_rejects('2026-1-5', $config, 'Worksheet date must be a valid YYYY-MM-DD date.');

echo "ALL FUTURE ATTENDANCE DATE TESTS PASSED.\n";
