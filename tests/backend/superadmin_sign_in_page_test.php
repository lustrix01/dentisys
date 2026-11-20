<?php

declare(strict_types=1);

// Backlog 12.8 Superadmin sign-in page, DB-free checks. The HTTP behaviour is in tests/database/superadmin_split_integration.php.
require_once __DIR__ . '/../../backend/app/config.php';
require_once __DIR__ . '/../../backend/app/jwt.php';
require_once __DIR__ . '/../../backend/app/validation.php';
require_once __DIR__ . '/../../backend/app/account_identity.php';
require_once __DIR__ . '/../../backend/app/audit_catalogue.php';
require_once __DIR__ . '/../../backend/app/auth_runtime.php';

function assert_page(bool $condition, string $label): void
{
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$label}\n");
        exit(1);
    }
    echo "PASS: {$label}\n";
}

$root = __DIR__ . '/../../';
$read = static fn(string $rel): string => (string) file_get_contents($root . $rel);

// ---- auth_sign_in_path ----
assert_page(auth_sign_in_path('superadmin') === '/superadmin/sign-in', 'the Superadmin signs in at /superadmin/sign-in');
foreach (['admin', 'faculty', 'secretary', 'student'] as $role) {
    assert_page(auth_sign_in_path($role) === '/login', "{$role} signs in at /login");
}

// ---- auth_sign_in_page_is_superadmin ----
assert_page(auth_sign_in_page_is_superadmin([]) === false, 'a missing sign_in_page means the shared /login');
assert_page(auth_sign_in_page_is_superadmin(['email' => 'a@bicol-u.edu.ph']) === false, 'other fields do not change the page');
assert_page(auth_sign_in_page_is_superadmin(['sign_in_page' => 'superadmin']) === true, 'sign_in_page "superadmin" means the Superadmin page');
foreach ([null, '', 'login', 'Superadmin', ' superadmin', 'admin', true, 1, ['superadmin']] as $bad) {
    $rejected = false;
    $field = null;
    try {
        auth_sign_in_page_is_superadmin(['sign_in_page' => $bad]);
    } catch (ValidationException $e) {
        $rejected = true;
        $field = $e->getErrors()[0]['field'] ?? null;
    }
    assert_page($rejected && $field === 'sign_in_page', 'sign_in_page ' . json_encode($bad) . ' is a validation error on sign_in_page (400)');
}

// ---- auth_wrong_sign_in_page ----
assert_page(auth_wrong_sign_in_page('superadmin', false) === true, 'the Superadmin on /login is the wrong page');
assert_page(auth_wrong_sign_in_page('superadmin', true) === false, 'the Superadmin on its own page is fine');
foreach (['admin', 'faculty', 'secretary', 'student'] as $role) {
    assert_page(auth_wrong_sign_in_page($role, true) === true, "{$role} on the Superadmin page is the wrong page");
    assert_page(auth_wrong_sign_in_page($role, false) === false, "{$role} on /login is fine");
}

// ---- Source contracts ----
$runtime = $read('backend/app/auth_runtime.php');
$loginStart = (int) strpos($runtime, 'function auth_runtime_login(');
$login = substr($runtime, $loginStart, (int) strpos($runtime, "\nfunction ", $loginStart + 10) - $loginStart);
$pageCheck = (int) strpos($login, 'auth_wrong_sign_in_page(');
assert_page($pageCheck > 0, 'password login checks the sign-in page');
assert_page(strpos($login, 'auth_sign_in_page_is_superadmin($body)') < strpos($login, 'rate_limit_'), 'the sign_in_page value is validated before any rate-limit work (bad value is a plain 400)');
assert_page(str_contains(substr($login, $pageCheck), 'wrong sign-in page.'), 'the wrong-page audit row ends "wrong sign-in page."');
assert_page(preg_match('/auth_wrong_sign_in_page\(.*?\{(.*?InvalidCredentialsException.*?)\n    \}/s', $login, $m) === 1
    && str_contains($m[1], "'login_failed'")
    && str_contains($m[1], "rate_limit_record_login_failure(\$rateStorage, \$emailScope, 'post_auth_failed_login', 900, 5, 900)")
    && str_contains($m[1], "InvalidCredentialsException('Invalid credentials.')"), 'the wrong page audits login_failed, counts toward the email lock and answers 401 "Invalid credentials."');
assert_page($pageCheck < strpos($login, "\$user['status'] !== 'Active'"), 'the page check runs before the account-status check (inactive on the wrong page is 401, not 403)');
assert_page($pageCheck > strpos($login, 'password_verify') || $pageCheck > strpos($login, 'verify_password'), 'the page check runs after the password check');

$google = $read('backend/controllers/GoogleAuthController.php');
assert_page(str_contains($google, "'sign_in_page' => 'superadmin'") === false && str_contains($google, "array_key_exists('sign_in_page', \$body['data'])") && str_contains($google, "\$body['data']['sign_in_page'] !== 'superadmin'"), 'Google login accepts only sign_in_page "superadmin"');
assert_page(str_contains($google, "google_auth_error('INVALID_REQUEST', 'sign_in_page must be \"superadmin\" or left out.', 400)"), 'Google login answers 400 for a bad sign_in_page');
assert_page(str_contains($google, "'google_login_denied', 'Failed', (int) \$account['user_id'], 'Google Sign-In refused: wrong sign-in page.'"), 'Google wrong page writes a google_login_denied audit row');
assert_page(str_contains($google, "google_auth_error('NO_EXISTING_ACCOUNT', 'No existing DentiSYS account was found.', 404)"), 'Google wrong page answers 404 NO_EXISTING_ACCOUNT');
assert_page(substr_count($google, '$wrongPage(') >= 2, 'Google checks the page for an account linked by subject and for one matched by email on the link path');
assert_page(!str_contains($google, 'rate_limit_record_login_failure'), 'Google wrong page is counted by IP only (no per-email lock)');

$reset = $read('backend/controllers/PasswordResetController.php');
assert_page(str_contains($reset, "'sign_in_path' => auth_sign_in_path((string) \$user['role'])"), 'reset-confirm returns sign_in_path for the account role');
$faculty = $read('backend/controllers/FacultyInvitationController.php');
assert_page(str_contains($faculty, "'sign_in_path' => auth_sign_in_path((string) \$account['role'])"), 'faculty activate returns sign_in_path for the account role');

echo "All Superadmin sign-in page checks passed.\n";
