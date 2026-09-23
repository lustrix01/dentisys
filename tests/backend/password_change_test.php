<?php

declare(strict_types=1);

$root = getenv('REPO_ROOT') ?: dirname(__DIR__, 2);

require_once $root . '/backend/app/validation.php';
require_once $root . '/backend/app/auth_runtime.php';
require_once $root . '/backend/app/request.php';
require_once $root . '/backend/app/response.php';
require_once $root . '/backend/app/security.php';
require_once $root . '/backend/app/auth.php';
require_once $root . '/backend/controllers/PasswordChangeController.php';

function password_change_test_assert(bool $condition, string $label): void
{
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$label}\n");
        exit(1);
    }
    echo "PASS: {$label}\n";
}

function password_change_test_throws(callable $callback, string $label): ValidationException
{
    try {
        $callback();
    } catch (ValidationException $e) {
        echo "PASS: {$label}\n";
        return $e;
    }

    fwrite(STDERR, "FAIL: {$label} (no ValidationException)\n");
    exit(1);
}

$valid = password_change_validate_payload([
    'current_password' => 'CurrentPass1!',
    'new_password' => 'NewPass2@',
    'confirm_password' => 'NewPass2@',
]);
password_change_test_assert($valid['new_password'] === 'NewPass2@', 'Valid current/new/confirmation payload is accepted');

$mismatch = password_change_test_throws(
    static fn(): array => password_change_validate_payload([
        'current_password' => 'CurrentPass1!',
        'new_password' => 'NewPass2@',
        'confirm_password' => 'Different3#',
    ]),
    'Mismatched confirmation is rejected'
);
password_change_test_assert(($mismatch->getErrors()[0]['field'] ?? null) === 'confirm_password', 'Mismatch is attached to confirm_password');

$weak = password_change_test_throws(
    static fn(): array => password_change_validate_payload([
        'current_password' => 'CurrentPass1!',
        'new_password' => 'weakpass',
        'confirm_password' => 'weakpass',
    ]),
    'Existing password policy remains enforced for a new password'
);
password_change_test_assert(
    count(array_filter($weak->getErrors(), static fn(array $error): bool => ($error['field'] ?? null) === 'new_password')) >= 1,
    'Password policy errors are attached to new_password'
);

$missing = password_change_test_throws(
    static fn(): array => password_change_validate_payload([]),
    'Missing password fields are rejected'
);
password_change_test_assert(count($missing->getErrors()) === 3, 'Missing payload reports all three required fields');

$controllerSource = file_get_contents($root . '/backend/controllers/PasswordChangeController.php');
$runtimeSource = file_get_contents($root . '/backend/app/auth_runtime.php');
$authSource = file_get_contents($root . '/backend/app/auth.php');
$routeSource = file_get_contents($root . '/backend/routes/api.php');

password_change_test_assert(str_contains($routeSource, "'path' => '/api/auth/password/change'")
    && str_contains($routeSource, "'handler' => 'handle_password_change'"), 'Password change route is registered with its handler');
password_change_test_assert(str_contains($authSource, 'function auth_authenticated_context'), 'Authenticated bearer context uses the shared auth verifier');
password_change_test_assert(str_contains($runtimeSource, 'FOR UPDATE')
    && str_contains($runtimeSource, 'password_verify($currentPassword')
    && str_contains($runtimeSource, 'password_hash($newPassword, PASSWORD_DEFAULT)'), 'Password change locks and verifies the account row before hashing');
password_change_test_assert(str_contains($runtimeSource, 'token_version = token_version + 1')
    && str_contains($runtimeSource, "'action_code' => 'password_changed'"), 'Password change invalidates account credentials and records an audit event');
password_change_test_assert(str_contains($controllerSource, "'post_auth_password_change'")
    && str_contains($controllerSource, "'sign_in_again' => true"), 'Password change is rate limited and returns a sign-in-again contract');
password_change_test_assert(str_contains($runtimeSource, 'hash_equals($currentPassword, $newPassword)'), 'Exact current-password reuse is rejected');

echo "ALL PASSWORD CHANGE TESTS PASSED.\n";

