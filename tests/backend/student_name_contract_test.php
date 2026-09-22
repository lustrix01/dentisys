<?php

declare(strict_types=1);

require_once __DIR__ . '/../../backend/app/validation.php';
require_once __DIR__ . '/../../backend/controllers/SecretaryController.php';

function assert_student_name_contract(bool $condition, string $label): void
{
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$label}\n");
        exit(1);
    }
    echo "PASS: {$label}\n";
}

$components = secretary_student_name_components('Maria Clara Dela Cruz');
assert_student_name_contract($components['firstName'] === 'Maria', 'Legacy display name maps to first name');
assert_student_name_contract($components['middleName'] === 'Clara Dela', 'Legacy display name preserves middle components separately');
assert_student_name_contract($components['lastName'] === 'Cruz', 'Legacy display name maps to last name');

$schema = file_get_contents(__DIR__ . '/../../database/migrations/001_baseline_schema.sql');
$secretaryController = file_get_contents(__DIR__ . '/../../backend/controllers/SecretaryController.php');
assert_student_name_contract(is_string($schema) && is_string($secretaryController), 'Student name contract sources are readable');
assert_student_name_contract(
    preg_match('/CREATE TABLE students \((.*?)\);/s', $schema, $studentTable) === 1
        && str_contains($studentTable[1], 'first_name')
        && str_contains($studentTable[1], 'middle_name')
        && str_contains($studentTable[1], 'last_name')
        && !preg_match('/^\s*name\s+/mi', $studentTable[1]),
    'Canonical Student schema stores separate name components without a whole-name column'
);
assert_student_name_contract(str_contains($secretaryController, 'middle_name = ?'), 'Secretary profile persistence writes the middle name separately');
assert_student_name_contract(str_contains($secretaryController, 'update_account_identity'), 'Legacy display-name compatibility remains on the account identity');

echo "ALL STUDENT NAME CONTRACT TESTS PASSED\n";
