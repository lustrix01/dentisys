<?php

declare(strict_types=1);

require_once __DIR__ . '/../../backend/app/validation.php';
require_once __DIR__ . '/../../backend/app/account_identity.php';

function canonical_consumer_assert(bool $condition, string $label): void
{
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$label}\n");
        exit(1);
    }
    echo "PASS: {$label}\n";
}

function canonical_consumer_assert_throws(callable $callback, string $label): void
{
    try {
        $callback();
    } catch (DomainException) {
        echo "PASS: {$label}\n";
        return;
    }
    fwrite(STDERR, "FAIL: {$label}\n");
    exit(1);
}

$root = dirname(__DIR__, 2);
$admin = (string) file_get_contents($root . '/backend/controllers/AdminController.php');
$secretary = (string) file_get_contents($root . '/backend/controllers/SecretaryController.php');
$student = (string) file_get_contents($root . '/backend/controllers/StudentAuthController.php');
$biometric = (string) file_get_contents($root . '/backend/app/student_biometrics.php');

canonical_consumer_assert(
    account_identity_display_name([
        'canonical_name_prefix' => 'Dr.',
        'canonical_first_name' => 'Ana',
        'canonical_middle_name' => 'M.',
        'canonical_last_name' => 'Santos',
        'canonical_name_suffix' => null,
        'display_name' => 'Legacy Name',
    ]) === 'Dr. Ana M. Santos',
    'Canonical person fields compose the display name'
);
canonical_consumer_assert(
    account_identity_display_name([
        'canonical_first_name' => null,
        'canonical_last_name' => null,
        'display_name' => 'Legacy Name',
    ]) === 'Legacy Name',
    'Legacy display name remains a read fallback only'
);
canonical_consumer_assert_throws(
    static fn() => account_identity_require_same_person(12, 13),
    'Conflicting account and record person identities fail closed'
);

canonical_consumer_assert(
    str_contains($admin, 'enrollment_grade_breakdowns')
        && str_contains($admin, 'enrollment_remedial_states')
        && str_contains($admin, 'person_identities'),
    'Admin reads canonical identities and normalized academic projections'
);
canonical_consumer_assert(
    str_contains($secretary, 'INSERT INTO user_accounts')
        && str_contains($secretary, '(person_id, login_email, password_hash')
        && str_contains($secretary, 'account_identity_require_same_person'),
    'Secretary activation reuses and verifies the canonical person link'
);
canonical_consumer_assert(
    str_contains($student, 's.person_id = ua.person_id')
        && str_contains($student, '(person_id, login_email, password_hash')
        && str_contains($student, 'account_identity_require_same_person'),
    'Student invitation and activation enforce one canonical person'
);
canonical_consumer_assert(
    str_contains($biometric, 's.person_id = ua.person_id')
        && str_contains($biometric, 'person_identities'),
    'Secretary biometric self-service requires canonical identity consistency'
);

echo "ALL CANONICAL CONSUMER CONTRACT TESTS PASSED.\n";
