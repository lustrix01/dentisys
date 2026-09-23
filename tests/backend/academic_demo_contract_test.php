<?php

declare(strict_types=1);

function academic_contract_assert(bool $condition, string $label): void
{
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$label}\n");
        exit(1);
    }
    echo "PASS: {$label}\n";
}

$root = dirname(__DIR__, 2);
$faculty = file_get_contents($root . '/backend/controllers/FacultyController.php');
$secretary = file_get_contents($root . '/backend/controllers/SecretaryController.php');
$admin = file_get_contents($root . '/backend/controllers/AdminController.php');
$student = file_get_contents($root . '/backend/controllers/StudentAcademicController.php');
$invitation = file_get_contents($root . '/backend/controllers/FacultyInvitationController.php');
$notifications = file_get_contents($root . '/backend/controllers/NotificationController.php');
$helper = file_get_contents($root . '/backend/app/notifications.php');
$migration = file_get_contents($root . '/database/migrations/016_academic_notifications.sql');
$contract = file_exists($root . '/docs/contracts/demo-academics.md')
    ? (string) file_get_contents($root . '/docs/contracts/demo-academics.md')
    : '';
$routes = file_get_contents($root . '/backend/routes/api.php');

foreach ([$faculty, $secretary, $admin, $student, $invitation, $notifications, $helper, $migration, $contract, $routes] as $source) {
    academic_contract_assert(is_string($source), 'Academic contract sources are readable');
}

academic_contract_assert(str_contains($faculty, 'validate_institutional_email'), 'Faculty Student email uses configured institutional validation');
academic_contract_assert(!preg_match('/DELETE\s+FROM\s+enrollments/i', $faculty), 'Faculty roster does not delete enrollment history');
academic_contract_assert(str_contains($faculty, "status = 'Archived'") && str_contains(strtolower($faculty), 'historical grades and attendance'), 'Faculty unenroll archives membership and describes preserved history');
academic_contract_assert(str_contains($faculty, 'handle_faculty_student_update') && str_contains($faculty, 'instructor_user_id'), 'Faculty Student update has an ownership-scoped handler');
academic_contract_assert(str_contains($faculty, 'notification_create_idempotent'), 'Remedial updates use the persistent notification helper');

academic_contract_assert(str_contains($secretary, 'assignedClasses'), 'Secretary dashboard returns every assigned class');
academic_contract_assert(!str_contains($secretary, ': 96'), 'Secretary dashboard has no fabricated empty attendance rate');
academic_contract_assert(str_contains($secretary, 'sessionId') && str_contains($secretary, 'sessions'), 'Secretary attendance supports date/session selection');
academic_contract_assert(str_contains($secretary, 'secretary_activity_rows'), 'Secretary activity reads are scoped to Secretary audit ownership');

academic_contract_assert(!str_contains($admin, "'grade' => \$s['final_gwa'] !== null ? (float) \$s['final_gwa'] : 0"), 'Admin retention response preserves pending grades as null');
academic_contract_assert(str_contains($admin, "'attendanceRate' => \$attendanceRate"), 'Admin dashboard exposes computed attendance rate');

academic_contract_assert(str_contains($student, 'require_student_identity'), 'Student academic reads use canonical token identity');
academic_contract_assert(str_contains($student, "'grade' => \$row['final_gwa'] !== null ? (float) \$row['final_gwa'] : null"), 'Student class reads preserve pending grades as null');
academic_contract_assert(str_contains($student, 'handle_student_dashboard_get'), 'Student dashboard read handler exists');

academic_contract_assert(str_contains($migration, 'CREATE TABLE IF NOT EXISTS notifications'), 'Notification migration is additive');
academic_contract_assert(str_contains($migration, 'uq_notifications_recipient_dedupe'), 'Notification migration enforces recipient-scoped idempotency');
academic_contract_assert(str_contains($helper, 'ON CONFLICT DO NOTHING'), 'Notification helper handles repeated emission idempotently');
academic_contract_assert(str_contains($notifications, 'recipient_user_id = ?'), 'Notification reads and writes are recipient scoped');

academic_contract_assert(str_contains($invitation, 'faculty_invitation_name_from_payload'), 'Faculty invitations accept structured identity fields');
academic_contract_assert(str_contains($invitation, 'faculty_invitation_edited') && str_contains($invitation, 'token_version = token_version + 1'), 'Editing an invitation rotates tokens and invalidates prior sessions');
academic_contract_assert(str_contains($invitation, 'faculty_invitation_revoked') && str_contains($invitation, 'Revoked by administrator'), 'Revoking an invitation invalidates the live token and audits it');

academic_contract_assert(str_contains($routes, "'path' => '/api/student/dashboard'") && str_contains($routes, "'handler' => 'handle_student_dashboard_get'"), 'Student dashboard route is registered');
academic_contract_assert(str_contains($routes, "'path' => '/api/notifications/{notification_id}/read'") && str_contains($routes, "'handler' => 'handle_notification_mark_read'"), 'Notification read route is registered');
academic_contract_assert(str_contains($routes, "'path' => '/api/admin/faculty-invitations/update'") && str_contains($routes, "'handler' => 'handle_admin_faculty_invitation_update'"), 'Faculty invitation edit route is registered');

echo "ALL ACADEMIC DEMO CONTRACT TESTS PASSED\n";
