<?php

declare(strict_types=1);

function assert_onboarding_contract(bool $condition, string $label): void
{
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$label}\n");
        exit(1);
    }
    echo "PASS: {$label}\n";
}

$root = dirname(__DIR__, 2);
$faculty = file_get_contents($root . '/backend/controllers/FacultyController.php');
$facultyInvitation = file_get_contents($root . '/backend/controllers/FacultyInvitationController.php');
$migration = file_get_contents($root . '/database/migrations/017_faculty_structured_name.sql');
$studentManagement = file_get_contents($root . '/frontend/src/pages/faculty/StudentManagement.tsx');
$apiClient = file_get_contents($root . '/frontend/src/services/apiClient.ts');
$facultyActivation = file_get_contents($root . '/frontend/src/pages/auth/ActivateFaculty.tsx');
$studentActivation = file_get_contents($root . '/frontend/src/pages/auth/ActivateStudent.tsx');

assert_onboarding_contract(is_string($faculty) && is_string($studentManagement), 'Student onboarding sources are readable');
assert_onboarding_contract(str_contains($faculty, 'Whole-name input is not supported'), 'Student create rejects a whole-name compatibility payload');
assert_onboarding_contract(!str_contains($faculty, 'if (empty($firstName) && !empty($name))'), 'Student create does not guess components by splitting a whole name');
assert_onboarding_contract(str_contains($faculty, 'empty($firstName) || empty($lastName)'), 'Student create requires first and last names');
assert_onboarding_contract(str_contains($studentManagement, 'firstName: normalizedFirstName') && !str_contains($studentManagement, 'name: fullName'), 'Student UI sends structured name fields without a whole-name field');

assert_onboarding_contract(str_contains($migration, 'name_prefix') && str_contains($migration, 'first_name') && str_contains($migration, 'last_name') && str_contains($migration, 'ADD COLUMN IF NOT EXISTS'), 'Faculty structured name columns are additive and nullable');
assert_onboarding_contract(str_contains($facultyInvitation, 'faculty_invitation_name_parts_from_payload') && str_contains($facultyInvitation, 'ua.name_prefix'), 'Faculty invitation persists and returns structured components');
assert_onboarding_contract(str_contains($facultyInvitation, "'prefix' => \$row['name_prefix']"), 'Faculty response keeps prefix mapped to the prefix column');
assert_onboarding_contract(str_contains($facultyInvitation, 'name_parts_from_payload($body[\'data\'])'), 'Faculty invitation validates structured payloads without legacy splitting');

foreach ([$facultyActivation, $studentActivation] as $activation) {
    assert_onboarding_contract(is_string($activation) && str_contains($activation, 'minLength={8}'), 'Activation password fields expose the server minimum');
    assert_onboarding_contract(str_contains($activation, 'validatePasswordRequirements') && str_contains($activation, 'PasswordRequirement'), 'Activation password requirements are visible and live');
    assert_onboarding_contract(str_contains($activation, "type={showPassword ? 'text' : 'password'}"), 'Activation password has an accessible reveal control');
}
assert_onboarding_contract(str_contains($apiClient, "request('POST', '/auth/faculty/activate', { token, password })"), 'Faculty activation API sends password only');
assert_onboarding_contract(!str_contains($facultyActivation, 'google.accounts'), 'Faculty activation does not load Google verification');
assert_onboarding_contract(str_contains($studentActivation, 'google.accounts'), 'Student activation retains optional Google verification');
assert_onboarding_contract(str_contains($apiClient, "request('POST', '/auth/student/activate', { token, password, ...(credential ? { credential } : {}) })"), 'Student activation retains optional Google credential');

echo "ALL ONBOARDING NAME AND PASSWORD CONTRACT TESTS PASSED.\n";
