<?php

declare(strict_types=1);

function assert_faculty_class_contract(bool $condition, string $label): void
{
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$label}\n");
        exit(1);
    }
    echo "PASS: {$label}\n";
}

$controller = file_get_contents(__DIR__ . '/../../backend/controllers/FacultyController.php');
$routes = file_get_contents(__DIR__ . '/../../backend/routes/api.php');
assert_faculty_class_contract(is_string($controller) && is_string($routes), 'Faculty contract sources are readable');

$handlerStart = strpos($controller, 'function handle_faculty_class_update(): void');
$handlerEnd = strpos($controller, 'function handle_faculty_class_available_students(): void', $handlerStart);
assert_faculty_class_contract($handlerStart !== false && $handlerEnd !== false, 'Faculty class update handler exists');
$handler = substr($controller, $handlerStart, $handlerEnd - $handlerStart);

assert_faculty_class_contract(
    str_contains($routes, "'path' => '/api/faculty/classes/update'")
        && str_contains($routes, "'handler' => 'handle_faculty_class_update'"),
    'Faculty class update route is registered'
);
assert_faculty_class_contract(str_contains($handler, 'faculty_verify_auth'), 'Class updates require server-side faculty authentication');
assert_faculty_class_contract(str_contains($handler, 'WHERE cs_id = ? AND instructor_user_id = ?'), 'Class updates enforce instructor ownership in SQL');
assert_faculty_class_contract(str_contains($handler, 'FOR UPDATE'), 'Class updates lock the owned row in the transaction');
assert_faculty_class_contract(str_contains($handler, 'beginTransaction') && str_contains($handler, 'audit_finish_operation'), 'Class updates are transactional and audited');
assert_faculty_class_contract(str_contains($handler, 'lec_room = ?') && str_contains($handler, 'lab_room = ?'), 'Lecture and laboratory rooms remain separate fields');
assert_faculty_class_contract(str_contains($handler, 'Schedule is not a persisted class-section field'), 'Non-persisted schedule input is rejected');
assert_faculty_class_contract(!str_contains($handler, 'INSERT INTO courses'), 'Class updates cannot create global course records');
assert_faculty_class_contract(!str_contains($handler, 'SET course_id ='), 'Class updates cannot change course identity');
assert_faculty_class_contract(!str_contains($handler, 'SET semester =') && !str_contains($handler, 'SET school_year ='), 'Class updates cannot change protected term identity');
assert_faculty_class_contract(str_contains($controller, "'schedule' => null"), 'Class reads do not derive schedule from room values');

echo "ALL FACULTY CLASS CONTRACT TESTS PASSED\n";
