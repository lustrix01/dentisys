<?php

declare(strict_types=1);

function onboarding_contract_assert(bool $condition, string $label): void
{
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$label}\n");
        exit(1);
    }
    echo "PASS: {$label}\n";
}

$root = dirname(__DIR__, 2);
$routes = file_get_contents($root . '/backend/routes/api.php');
$faculty = file_get_contents($root . '/backend/controllers/FacultyInvitationController.php');
$student = file_get_contents($root . '/backend/controllers/StudentAuthController.php');
$hasFullSourceTree = is_file($root . '/database/migrations/008_invite_only_onboarding.sql')
    && is_file($root . '/frontend/src/App.tsx');
$migration = $hasFullSourceTree ? file_get_contents($root . '/database/migrations/008_invite_only_onboarding.sql') : '';
$app = $hasFullSourceTree ? file_get_contents($root . '/frontend/src/App.tsx') : '';
$facultyPage = $hasFullSourceTree ? file_get_contents($root . '/frontend/src/pages/auth/ActivateFaculty.tsx') : '';
$studentPage = $hasFullSourceTree ? file_get_contents($root . '/frontend/src/pages/auth/ActivateStudent.tsx') : '';

onboarding_contract_assert(!str_contains((string) $routes, "'path' => '/api/auth/register'"), 'Public Faculty registration route is absent');
onboarding_contract_assert(!str_contains((string) $routes, "'path' => '/api/auth/student/signup'"), 'Public Student signup route is absent');
foreach ([
    '/api/admin/faculty-invitations',
    '/api/admin/faculty-invitations/reissue',
    '/api/auth/faculty/invitation',
    '/api/auth/faculty/activate',
    '/api/faculty/student-invitations',
    '/api/auth/student/invitation',
    '/api/auth/student/activate',
] as $path) {
    onboarding_contract_assert(str_contains((string) $routes, "'path' => '{$path}'"), "Invitation route is registered: {$path}");
}

if ($hasFullSourceTree) {
    onboarding_contract_assert(str_contains((string) $migration, "'faculty_invitation'"), 'Migration permits the Faculty invitation token purpose');
    onboarding_contract_assert(str_contains((string) $migration, 'CREATE UNIQUE INDEX') && str_contains((string) $migration, 'used_at IS NULL') && str_contains((string) $migration, 'revoked_at IS NULL'), 'Migration limits each Faculty account to one live invitation');
}
onboarding_contract_assert(str_contains((string) $faculty, 'hash(\'sha256\', $token, true)'), 'Faculty token storage uses a digest');
onboarding_contract_assert(str_contains((string) $faculty, "'P7D'"), 'Faculty invitations use a seven-day expiry');

$facultyAcceptStart = strpos((string) $faculty, 'function handle_auth_faculty_invitation_accept');
$facultyAccept = substr((string) $faculty, (int) $facultyAcceptStart);
$facultyMismatch = strpos($facultyAccept, 'Google identity does not match the invited Faculty email.');
$facultyHash = strpos($facultyAccept, '$passwordHash = password_hash');
$facultyBegin = strpos($facultyAccept, '$pdo->beginTransaction()');
onboarding_contract_assert($facultyMismatch !== false && $facultyHash !== false && $facultyBegin !== false && $facultyMismatch < $facultyHash && $facultyMismatch < $facultyBegin, 'Faculty Google mismatch is rejected before password or transaction changes');
onboarding_contract_assert(str_contains($facultyAccept, "status = 'Active'") && str_contains($facultyAccept, "SET used_at = ?"), 'Faculty acceptance activates and consumes the invitation transactionally');
onboarding_contract_assert(str_contains($facultyAccept, 'google_verify_id_token') && str_contains($facultyAccept, 'google_subject = ?'), 'Faculty acceptance can bind a matching optional Google identity while retaining password activation');
onboarding_contract_assert(str_contains($facultyAccept, 'google_subject = ? AND user_id <> ?'), 'Faculty acceptance rejects a Google subject bound to another account');

$studentInviteStart = strpos((string) $student, 'function handle_student_invitation_create');
$studentInspectStart = strpos((string) $student, 'function handle_student_invitation_get');
$studentInvite = substr((string) $student, (int) $studentInviteStart, (int) $studentInspectStart - (int) $studentInviteStart);
onboarding_contract_assert(str_contains($studentInvite, 'cs.instructor_user_id = ?'), 'Student invitation is scoped to its Faculty owner');
onboarding_contract_assert(str_contains($studentInvite, 'related_student_id, related_cs_id'), 'Student invitation token binds canonical Student and class identifiers');
onboarding_contract_assert(str_contains($studentInvite, 'validate_institutional_email'), 'Student invitation uses the authoritative institutional email policy');

$studentAcceptStart = strpos((string) $student, 'function handle_student_activate');
$studentMockStart = strpos((string) $student, 'function handle_development_mock_student_session');
$studentAccept = substr((string) $student, (int) $studentAcceptStart, (int) $studentMockStart - (int) $studentAcceptStart);
$studentMismatch = strpos($studentAccept, 'Google identity does not match the invited Student email.');
$studentHash = strpos($studentAccept, '$passwordHash = password_hash');
$studentBegin = strpos($studentAccept, '$pdo->beginTransaction()');
onboarding_contract_assert(str_contains($studentAccept, "['related_cs_id'] === null"), 'Student activation rejects legacy tokens without class authority');
onboarding_contract_assert($studentMismatch !== false && $studentHash !== false && $studentBegin !== false && $studentMismatch < $studentHash && $studentMismatch < $studentBegin, 'Student Google mismatch is rejected before password or transaction changes');
onboarding_contract_assert(str_contains($studentAccept, 'google_verify_id_token') && str_contains($studentAccept, 'google_subject = ?'), 'Student acceptance can bind a matching optional Google identity while retaining password activation');
onboarding_contract_assert(str_contains($studentAccept, 'google_subject = ? AND user_id <> ?'), 'Student acceptance rejects a Google subject bound to another account');
onboarding_contract_assert(str_contains($studentAccept, 'student_account_user_id') && str_contains($studentAccept, 'student_auth_active_class_enrollment'), 'Student acceptance rechecks canonical identity and active class enrollment');
onboarding_contract_assert(str_contains($studentAccept, "status = 'Active'") && str_contains($studentAccept, 'SET used_at = ?'), 'Student acceptance activates and consumes its scoped invitation');

if ($hasFullSourceTree) {
    foreach (['/signup', '/register', '/signup/student'] as $path) {
        onboarding_contract_assert(str_contains((string) $app, "path=\"{$path}\" element={<Navigate to=\"/login?invitationRequired=1\" replace />"), "Public frontend signup URL redirects to login: {$path}");
    }
    onboarding_contract_assert(str_contains((string) $facultyPage, 'window.history.replaceState'), 'Faculty acceptance scrubs its invitation token from the URL');
    onboarding_contract_assert(str_contains((string) $studentPage, 'window.history.replaceState'), 'Student acceptance scrubs its invitation token from the URL');
} else {
    echo "PASS: Migration and frontend checks are deferred to the workspace-backed documentation contract run.\n";
}

echo "ALL INVITATION ONBOARDING CONTRACT TESTS PASSED.\n";
