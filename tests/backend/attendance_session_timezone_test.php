<?php

declare(strict_types=1);

require_once __DIR__ . '/../../backend/app/config.php';
require_once __DIR__ . '/../../backend/app/validation.php';
require_once __DIR__ . '/../../backend/controllers/SecretaryController.php';

function assert_same(mixed $expected, mixed $actual, string $label): void
{
    if ($expected !== $actual) {
        fwrite(STDERR, "FAIL: {$label}\nExpected: " . var_export($expected, true) . "\nActual: " . var_export($actual, true) . "\n");
        exit(1);
    }
    echo "PASS: {$label}\n";
}

function assert_validation_failure(callable $fn, string $label): void
{
    try {
        $fn();
    } catch (ValidationException $e) {
        echo "PASS: {$label}\n";
        return;
    }

    fwrite(STDERR, "FAIL: {$label}\nExpected a validation exception.\n");
    exit(1);
}

$config = app_config(['APP_TIMEZONE' => 'Asia/Manila']);
$boundaryUtc = new DateTimeImmutable('2026-09-21 17:00:00.000000', new DateTimeZone('UTC'));

assert_same('2026-09-22', app_local_date($config, $boundaryUtc), 'UTC previous date projects to the Asia/Manila calendar date');
assert_same(
    '2026-09-22',
    secretary_attendance_session_date([], $boundaryUtc, $config),
    'Omitted sessionDate defaults to the Asia/Manila date after local midnight'
);
assert_same(
    '2026-09-22',
    secretary_attendance_session_date(['sessionDate' => '2026-09-22'], $boundaryUtc, $config),
    'The current Asia/Manila date is accepted'
);
assert_validation_failure(
    static fn() => secretary_attendance_session_date(['sessionDate' => '2026-09-23'], $boundaryUtc, $config),
    'The following Asia/Manila date is rejected as future'
);
assert_same(
    '2026-09-21T17:00:00.000000Z',
    secretary_attendance_session_timestamp($boundaryUtc->format('Y-m-d H:i:s.u')),
    'UTC timestamp serialization remains unchanged across the local-date boundary'
);

echo "ALL ATTENDANCE SESSION TIMEZONE TESTS PASSED\n";
