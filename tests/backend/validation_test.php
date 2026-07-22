<?php

declare(strict_types=1);

require_once __DIR__ . '/../../backend/app/validation.php';

function assert_same(mixed $expected, mixed $actual, string $label): void
{
    if ($expected !== $actual) {
        fwrite(STDERR, "FAIL: $label\nExpected: " . var_export($expected, true) . "\nActual: " . var_export($actual, true) . "\n");
        exit(1);
    }
    echo "PASS: $label\n";
}

function assert_throws(callable $fn, string $needle, string $label): void
{
    try {
        $fn();
        fwrite(STDERR, "FAIL: $label -- expected exception containing '$needle'\n");
        exit(1);
    } catch (ValidationException $e) {
        $found = false;
        foreach ($e->getErrors() as $err) {
            if (str_contains($err['message'], $needle)) {
                $found = true;
                break;
            }
        }
        if (!$found) {
            fwrite(STDERR, "FAIL: $label -- no error message contains '$needle'\n");
            exit(1);
        }
    } catch (\Throwable $e) {
        if (!str_contains($e->getMessage(), $needle)) {
            fwrite(STDERR, "FAIL: $label -- unexpected exception: " . $e->getMessage() . "\n");
            exit(1);
        }
    }
    echo "PASS: $label\n";
}

echo "=== Validation Unit Tests ===\n\n";

echo "--- Email ---\n";

assert_same('user@example.com', validate_email(' user@example.com '), 'Generic email valid');
assert_throws(fn() => validate_email('not-an-email'), 'not valid', 'Invalid email rejected');
assert_throws(fn() => validate_email(''), 'required', 'Empty email rejected');
assert_throws(fn() => validate_email('   '), 'required', 'Whitespace-only email rejected');

echo "\n--- Institutional Email ---\n";

assert_same('admin@bicol-u.edu.ph', validate_institutional_email('admin@bicol-u.edu.ph'), 'BU domain accepted');
assert_throws(fn() => validate_institutional_email('user@bu.edu.ph'), 'Only official', 'BU short domain (bu.edu.ph) rejected');
assert_throws(fn() => validate_institutional_email('user@gmail.com'), 'Only official', 'Gmail domain rejected');
assert_throws(fn() => validate_institutional_email('user@bicol-u.edu.ph.evil.com'), 'Only official', 'Lookalike domain rejected');

echo "\n--- Person Name ---\n";

assert_same('John Doe', validate_person_name(['name' => 'John Doe'], 'name'), 'Standard name accepted');
assert_same('Mary-Jane', validate_person_name(['name' => 'Mary-Jane'], 'name'), 'Hyphenated name accepted');
assert_same("O'Connor", validate_person_name(['name' => "O'Connor"], 'name'), 'Apostrophe name accepted');
assert_same('Maria José', validate_person_name(['name' => 'Maria José'], 'name'), 'Unicode letters accepted');
assert_same('Dr. Juan A. Dela Cruz', validate_person_name(['name' => 'Dr. Juan A. Dela Cruz'], 'name'), 'Name with periods accepted');
assert_same('St. John', validate_optional_person_name(['name' => 'St. John'], 'name'), 'Optional name with periods accepted');

assert_throws(fn() => validate_person_name(['name' => 'John123'], 'name'), 'letters, spaces, hyphens', 'Name with digits rejected');
assert_throws(fn() => validate_person_name(['name' => 'Jane!'], 'name'), 'letters, spaces, hyphens', 'Name with exclamation mark rejected');
assert_throws(fn() => validate_person_name(['name' => 'User@Name'], 'name'), 'letters, spaces, hyphens', 'Name with @ symbol rejected');
assert_throws(fn() => validate_person_name(['name' => 'Test_User'], 'name'), 'letters, spaces, hyphens', 'Name with underscore rejected');

echo "\n--- Strings ---\n";

assert_same('hello', validate_required_string(['name' => ' hello '], 'name', 1, 100), 'String trimmed');
assert_throws(fn() => validate_required_string(['name' => 'ab'], 'name', 5, 100), 'at least 5', 'Too short rejected');
assert_throws(fn() => validate_required_string(['name' => str_repeat('x', 200)], 'name', 1, 100), 'not exceed 100', 'Too long rejected');
assert_throws(fn() => validate_required_string(['x' => 'v'], 'missing', 1, 100), 'required', 'Missing field rejected');

assert_same(null, validate_optional_string(['name' => ''], 'name', 1, 100), 'Empty optional returns null');
assert_same('val', validate_optional_string(['name' => 'val'], 'name', 1, 100), 'Optional string returned');
assert_same(null, validate_optional_string([], 'nonexist', 1, 100), 'Missing optional returns null');

echo "\n--- Control Characters ---\n";

assert_throws(fn() => validate_required_string(["field" => "hello\x00world"], 'field', 1, 200), 'control characters', 'Null byte rejected');
assert_throws(fn() => validate_required_string(["field" => "hello\x1Fworld"], 'field', 1, 200), 'control characters', 'Control char 0x1F rejected');
assert_throws(fn() => validate_required_string(["field" => "hello\x7Fworld"], 'field', 1, 200), 'control characters', 'DEL 0x7F rejected');

echo "\n--- Enum ---\n";

assert_same('admin', validate_enum(['role' => 'admin'], 'role', ['admin', 'faculty', 'secretary']), 'Valid enum accepted');
assert_throws(fn() => validate_enum(['role' => 'student'], 'role', ['admin', 'faculty']), 'not in the allowed set', 'Invalid enum rejected');

echo "\n--- Integer ---\n";

assert_same(5, validate_int(['val' => 5], 'val', 1, 10), 'Valid int accepted');
assert_throws(fn() => validate_int(['val' => 0], 'val', 1, 10), 'between 1 and 10', 'Int below min rejected');
assert_throws(fn() => validate_int(['val' => 20], 'val', 1, 10), 'between 1 and 10', 'Int above max rejected');
assert_throws(fn() => validate_int(['val' => 'notint'], 'val', 1, 10), 'must be an integer', 'Non-int rejected');

echo "\n--- UUID ---\n";

assert_same('550e8400-e29b-41d4-a716-446655440000', validate_uuid('550e8400-e29b-41d4-a716-446655440000'), 'Valid UUID accepted');
assert_throws(fn() => validate_uuid('not-a-uuid'), 'valid UUID', 'Invalid UUID rejected');
assert_throws(fn() => validate_uuid(''), 'valid UUID', 'Empty UUID rejected');

echo "\n--- Password Policy ---\n";

assert_throws(fn() => validate_password_policy('short1A'), 'at least 8', 'Short password rejected');
assert_throws(fn() => validate_password_policy('nouppercase1!'), 'uppercase', 'No uppercase rejected');
assert_throws(fn() => validate_password_policy('NOLOWERCASE1!'), 'lowercase', 'No lowercase rejected');
assert_throws(fn() => validate_password_policy('NoDigitHere!'), 'digit', 'No digit rejected');
assert_throws(fn() => validate_password_policy('NoSpecialChar1'), 'special character', 'No special char rejected');

// Valid password
try {
    validate_password_policy('ValidPass1!');
    assert_same(true, true, 'Valid password accepted');
} catch (\Throwable $e) {
    fwrite(STDERR, "FAIL: Valid password rejected: " . $e->getMessage() . "\n");
    exit(1);
}

echo "\n=== ALL VALIDATION TESTS PASSED ===\n";
