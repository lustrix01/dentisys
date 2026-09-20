<?php

declare(strict_types=1);

require_once __DIR__ . '/../../backend/app/auth.php';
require_once __DIR__ . '/../../backend/app/config.php';
require_once __DIR__ . '/../../backend/app/jwt.php';
require_once __DIR__ . '/../../backend/app/response.php';
require_once __DIR__ . '/../../backend/app/security.php';
require_once __DIR__ . '/../../backend/app/auth_runtime.php';
require_once __DIR__ . '/../../backend/app/student_auth.php';
require_once __DIR__ . '/../../backend/controllers/StudentAuthController.php';

function student_contract_assert(bool $condition, string $label): void
{
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$label}\n");
        exit(1);
    }
    echo "PASS: {$label}\n";
}

$disabled = ['features' => ['student_auth_enabled' => false], 'app' => ['env' => 'development'], 'mocks' => ['identity' => true]];
$enabledDev = ['features' => ['student_auth_enabled' => true], 'app' => ['env' => 'development'], 'mocks' => ['identity' => true]];
$enabledProd = ['features' => ['student_auth_enabled' => true], 'app' => ['env' => 'production'], 'mocks' => ['identity' => true]];

student_contract_assert(student_auth_is_enabled($disabled) === false, 'Student auth feature gate defaults closed');
student_contract_assert(student_auth_mock_is_available($disabled) === false, 'Disabled Student auth cannot expose development mock');
student_contract_assert(student_auth_mock_is_available($enabledDev) === true, 'Development mock requires enabled Student auth and identity mock');
student_contract_assert(student_auth_mock_is_available($enabledProd) === false, 'Production never exposes development Student mock');

$noStoreHeaders = static fn(array $response): bool => (bool) array_filter(
    $response['headers'],
    static fn(string $header): bool => str_starts_with(strtolower($header), 'cache-control: no-store')
)
    && in_array('Pragma: no-cache', $response['headers'], true);
student_contract_assert($noStoreHeaders(auth_build_no_store_json_response(['status' => 'ok'], 202)), 'Student success response carries no-store headers');
student_contract_assert($noStoreHeaders(auth_build_no_store_message_response('Invalid request.', 400)), 'Student failure response carries no-store headers');

$token = student_auth_activation_raw_token();
student_contract_assert(strlen($token) === STUDENT_ACTIVATION_TOKEN_LENGTH, 'Activation token has the approved 32-byte Base64URL shape');
student_contract_assert((bool) preg_match(STUDENT_ACTIVATION_TOKEN_PATTERN, $token), 'Activation token uses the approved alphabet and length');

$identitySource = file_get_contents(__DIR__ . '/../../backend/app/student_auth.php');
$identityStart = strpos($identitySource, 'function auth_assert_student_eligible');
$identityEnd = strpos($identitySource, 'function require_student_identity');
student_contract_assert(is_string($identitySource) && $identityStart !== false && $identityEnd !== false, 'Central Student identity helper is present');
$identityBody = substr((string) $identitySource, (int) $identityStart, (int) $identityEnd - (int) $identityStart);
student_contract_assert(!str_contains($identityBody, 'enrollments'), 'Post-activation Student identity helper does not require enrollment');
student_contract_assert(!str_contains($identityBody, 'student_auth_is_enabled'), 'Established Student eligibility is independent of the onboarding feature gate');
student_contract_assert(str_contains($identitySource, "status = 'Active'"), 'Central Student identity helper checks active account status');
student_contract_assert(str_contains($identitySource, 'student_account_user_id'), 'Central Student identity helper uses canonical account linkage');
student_contract_assert(str_contains((string) $identitySource, "student_auth_eligibility_denied"), 'Central Student eligibility denials use the approved audit action');
$controllerSource = file_get_contents(__DIR__ . '/../../backend/controllers/StudentAuthController.php');
$routesSource = file_get_contents(__DIR__ . '/../../backend/routes/api.php');
student_contract_assert(!str_contains((string) $routesSource, "'path' => '/api/auth/student/signup'"), 'Public Student self-signup has no API route');
student_contract_assert(!str_contains((string) $routesSource, "'path' => '/api/auth/register'"), 'Public account registration has no API route');
student_contract_assert(str_contains((string) $routesSource, "'path' => '/api/faculty/student-invitations'"), 'Faculty Student-invitation route is registered');
student_contract_assert(!str_contains((string) $controllerSource, 'function student_auth_start_activation'), 'Legacy email-only Student provisioning helper is removed');
student_contract_assert(!str_contains((string) $controllerSource, 'function handle_student_signup'), 'Retired Student signup handler is removed');
student_contract_assert(str_contains((string) $identitySource, 'require_owned_enrollment'), 'Owned-enrollment helper remains available for object scoping');
$invitationStart = substr((string) $controllerSource, (int) strpos((string) $controllerSource, 'function handle_student_invitation_create'), (int) strpos((string) $controllerSource, 'function handle_student_invitation_get') - (int) strpos((string) $controllerSource, 'function handle_student_invitation_create'));
student_contract_assert(str_contains($invitationStart, 'cs.instructor_user_id = ?'), 'Student invitation requires Faculty ownership of the specified class');
student_contract_assert(str_contains($invitationStart, "e.status = 'Active'"), 'Student invitation requires the exact active class enrollment');
student_contract_assert(str_contains($invitationStart, 'related_cs_id'), 'Student invitation token is bound to the authorized class');
student_contract_assert(str_contains($invitationStart, "student['user_id'] !== null"), 'Student invitation rejects legacy Secretary-linked identities');
$activationStart = (int) strpos((string) $controllerSource, 'function handle_student_activate');
$mockStart = (int) strpos((string) $controllerSource, 'function handle_development_mock_student_session');
$activationSource = substr((string) $controllerSource, $activationStart, $mockStart - $activationStart);
student_contract_assert(str_contains($activationSource, "['related_cs_id'] === null"), 'Legacy Student tokens without class authorization are rejected');
student_contract_assert(str_contains($activationSource, 'student_auth_active_class_enrollment'), 'Student activation rechecks the exact active class enrollment');
student_contract_assert(str_contains($activationSource, 'student_account_user_id'), 'Student activation rechecks the canonical Student-account link');
student_contract_assert(!preg_match('/\b(?:json_response|safe_error_response|validation_error_response)\s*\(/', $activationSource), 'Student activation uses no-store response wrappers on every branch');

$authSource = file_get_contents(__DIR__ . '/../../backend/app/auth.php');
$runtimeSource = file_get_contents(__DIR__ . '/../../backend/app/auth_runtime.php');
student_contract_assert(str_contains((string) $authSource, 'student_auth_mock_is_available'), 'Access-token acceptance revalidates development-mock provenance');
student_contract_assert(str_contains((string) $runtimeSource, 'student_auth_mock_is_available'), 'Refresh revalidates development-mock provenance');
student_contract_assert(str_contains((string) $runtimeSource, 'function auth_runtime_logout'), 'Logout path remains available for stale development sessions');

$migrationSource = file_get_contents(__DIR__ . '/../../database/migrations/005_student_identity_authentication.sql');
if ($migrationSource !== false) {
    student_contract_assert(!preg_match('/UPDATE\s+students\s+SET\s+student_account_user_id\s*=\s*.*user_id/i', $migrationSource), 'Migration 005 performs no legacy Secretary canonical backfill');
    student_contract_assert(str_contains($migrationSource, "CHECK (role IN ('admin', 'faculty', 'secretary', 'student'))"), 'Migration 005 extends the account and RBAC role checks for Student');
    student_contract_assert(str_contains($migrationSource, "'student_activation'"), 'Migration 005 extends the security-token purpose check for Student activation');
}

echo "ALL STUDENT AUTH CONTRACT TESTS PASSED.\n";
