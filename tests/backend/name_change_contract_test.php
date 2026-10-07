<?php

declare(strict_types=1);

require_once __DIR__ . '/../../backend/app/validation.php';
require_once __DIR__ . '/../../backend/app/ratelimit.php';
if (!class_exists('MfaException')) {
    class MfaException extends RuntimeException {}
}
require_once __DIR__ . '/../../backend/app/account_identity.php';

function assert_name_change(bool $condition, string $label): void
{
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$label}\n");
        exit(1);
    }
    echo "PASS: {$label}\n";
}

function expect_name_change_exception(callable $callback, string $class, string $label): Throwable
{
    try {
        $callback();
    } catch (Throwable $error) {
        if (!$error instanceof $class) {
            throw new RuntimeException("{$label}: expected {$class}, got " . get_class($error), 0, $error);
        }
        echo "PASS: {$label}\n";
        return $error;
    }
    throw new RuntimeException("{$label}: expected {$class}");
}

$base = ['prefix' => 'Dr.', 'firstName' => 'Ana', 'middleName' => 'M.', 'lastName' => 'Reyes', 'suffix' => 'Jr.'];
$payload = account_identity_name_change_payload($base, 'ana.reyes@bicol-u.edu.ph');
assert_name_change($payload['name'] === 'Dr. Ana M. Reyes Jr.', 'Five-part name composes with existing validators');
assert_name_change(
    account_identity_name_change_payload($base + ['email' => 'ANA.REYES@bicol-u.edu.ph'], 'ana.reyes@bicol-u.edu.ph')['name'] === $payload['name'],
    'Legacy clients may echo the unchanged login email'
);
assert_name_change(
    account_identity_name_change_payload(['name' => 'Ana Reyes'], 'ana.reyes@bicol-u.edu.ph', true)['parts'] === null,
    'Dean and Faculty may submit the harmless legacy name fallback'
);

$unknown = expect_name_change_exception(
    fn() => account_identity_name_change_payload([
        ...$base,
        'studentNumber' => '12345',
        'userId' => 4,
        'role' => 'admin',
        'classId' => 7,
        'facultyId' => 9,
        'assignments' => [],
        'institutionalId' => 'X',
    ], 'ana.reyes@bicol-u.edu.ph'),
    ValidationException::class,
    'Identity-critical and other non-allowlisted keys are rejected'
);
assert_name_change(count($unknown->getErrors()) === 7, 'Every rejected key gets a field error');
$emailError = expect_name_change_exception(
    fn() => account_identity_name_change_payload($base + ['email' => 'other@bicol-u.edu.ph'], 'ana.reyes@bicol-u.edu.ph'),
    ValidationException::class,
    'Changed login email is rejected'
);
assert_name_change(($emailError->getErrors()[0]['field'] ?? null) === 'email', 'Changed email error identifies email');
assert_name_change(account_identity_name_change_is_unchanged('Ana Reyes', 'Ana Reyes'), 'Composed unchanged name is a no-op');

$required = expect_name_change_exception(
    fn() => account_identity_name_change_totp_code(''),
    AccountIdentityStepUpException::class,
    'Missing authenticator code is rejected for an MFA-protected change'
);
assert_name_change($required->apiCode === 'TWO_FACTOR_REQUIRED', 'Missing code returns TWO_FACTOR_REQUIRED');
$malformedCode = account_identity_name_change_totp_code(123456);
assert_name_change($malformedCode !== '', 'A malformed provided code is handled as invalid rather than missing');
$invalid = account_identity_name_change_invalid_code(new MfaException('Code was already used.'));
assert_name_change($invalid->apiCode === 'INVALID_TWO_FACTOR_CODE', 'Wrong and reused TOTP failures map to INVALID_TWO_FACTOR_CODE');

$routeSource = file_get_contents(__DIR__ . '/../../backend/routes/api.php');
assert_name_change(
    is_string($routeSource)
        && preg_match("/'method' => 'POST',\s*'path' => '\/api\/student\/profile',\s*'handler' => 'handle_student_profile_update'/s", $routeSource) === 1,
    'POST /api/student/profile is registered to its handler'
);

$directory = sys_get_temp_dir() . '/dentisys_name_change_' . bin2hex(random_bytes(6));
if (!mkdir($directory, 0700)) {
    throw new RuntimeException('Unable to create the temporary rate-limit test directory.');
}
$rateConfig = ['rate_limit' => ['storage_dir' => $directory]];
for ($attempt = 0; $attempt < 10; $attempt++) {
    account_identity_name_change_rate_limit($rateConfig, 51);
}
expect_name_change_exception(
    fn() => account_identity_name_change_rate_limit($rateConfig, 51),
    RateLimitException::class,
    'Name-change MFA verifier allows 10 attempts and rejects attempt 11'
);
foreach (glob($directory . '/*') ?: [] as $file) {
    unlink($file);
}
rmdir($directory);

echo "ALL NAME CHANGE CONTRACT TESTS PASSED\n";
