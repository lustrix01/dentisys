<?php

declare(strict_types=1);

// DB-free: string limits count characters (not bytes), and the assessment-title / Student Number limits exist server-side.
require_once __DIR__ . '/../../backend/app/validation.php';

function check_limit(bool $condition, string $label): void
{
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$label}\n");
        exit(1);
    }
    echo "PASS: {$label}\n";
}

function throws_validation(callable $fn, string $needle): bool
{
    try {
        $fn();
    } catch (ValidationException $e) {
        return str_contains($e->getErrors()[0]['message'], $needle);
    }
    return false;
}

$reason = str_repeat('ñ', 500); // 1000 bytes, 500 characters
check_limit(validate_required_string(['reason' => $reason], 'reason', 8, 500) === $reason, '500-character reason with ñ passes (required)');
check_limit(validate_optional_string(['reason' => $reason], 'reason', 1, 500) === $reason, '500-character reason with ñ passes (optional)');
check_limit(throws_validation(fn() => validate_required_string(['reason' => $reason . 'ñ'], 'reason', 8, 500), 'no more than 500 characters'), '501-character reason with ñ fails (required)');
check_limit(throws_validation(fn() => validate_optional_string(['reason' => $reason . 'ñ'], 'reason', 1, 500), 'no more than 500 characters'), '501-character reason with ñ fails (optional)');
check_limit(validate_required_string(['reason' => 'ñañ'], 'reason', 3, 10) === 'ñañ', 'Minimum counts characters (3 characters, 5 bytes)');

$faculty = (string) file_get_contents(__DIR__ . '/../../backend/controllers/FacultyController.php');
check_limit(substr_count($faculty, "mb_strlen(\$title, 'UTF-8') > 255") === 2, 'Assessment title is limited to 255 characters at both save sites');
check_limit(substr_count($faculty, "'title' => \$message") === 1 && substr_count($faculty, "validation_error_response(['title' =>") === 1, 'Both title limits answer with a "title" field error');
check_limit(str_contains($faculty, "mb_strlen(\$studentNumber, 'UTF-8') < 3") && str_contains($faculty, "mb_strlen(\$studentNumber, 'UTF-8') > 50"), 'Student Number is limited to 3-50 characters');

echo "\n=== ALL VALIDATION LIMIT TESTS PASSED ===\n";
