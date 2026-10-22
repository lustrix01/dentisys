<?php

declare(strict_types=1);

// Static contract checks for CLS-003 class archiving.
$root = dirname(__DIR__, 2);
$read = static fn(string $f): string => (string) file_get_contents("{$root}/{$f}");
$check = static function (bool $ok, string $label): void {
    if (!$ok) {
        fwrite(STDERR, "FAIL: {$label}\n");
        exit(1);
    }
    echo "PASS: {$label}\n";
};
$fn = static function (string $src, string $name): string {
    $start = (int) strpos($src, "function {$name}(");
    $next = strpos($src, "\nfunction ", $start + 1);
    return substr($src, $start, ($next === false ? strlen($src) : $next) - $start);
};

$faculty = $read('backend/controllers/FacultyController.php');
$routes = $read('backend/routes/api.php');
$migration = $read('database/migrations/050_class_archiving.sql');
$visible = "(cs.archive_reason IS NULL OR cs.archive_reason = 'finished')";

$check(str_contains($migration, 'archive_reason TEXT NULL') && str_contains($migration, "'finished', 'cancelled', 'mistake'")
    && str_contains($migration, '(archive_reason IS NULL) = (archived_at IS NULL)'), 'migration 050 adds paired archive columns with CHECKs');
$check(str_contains($routes, "'/api/faculty/classes/archive'") && str_contains($routes, "'handle_faculty_class_restore'"), 'archive and restore routes are registered');

$change = $fn($faculty, 'faculty_class_archive_change');
foreach ([
    'csId and reason are required.', 'Choose Finished, Cancelled, or Created by mistake.', 'Class is not assigned to this faculty member.',
    'Past school-year classes are archived automatically.', 'This class is already archived.', 'End the open attendance session before archiving.',
    'A class with a pending remedial can only be archived as Finished.', 'This class is not archived.',
] as $message) {
    $check(str_contains($change, $message), "archive handler keeps the message: {$message}");
}
$check(str_contains($change, 'faculty_owned_class_id(') && str_contains($change, 'academic_school_year_is_current('), 'archive checks ownership and the current school year');
$check(str_contains($change, "'class_archive'") && str_contains($change, "'class_restore'"), 'archive and restore are audited');
$check(str_contains($change, 'secretary_end_appointment_role(') && str_contains($change, "status = 'scheduled'"), 'archive ends the Secretary appointment and revokes scheduled sessions');
$check(str_contains($change, 'notification_create_idempotent('), 'cancelling notifies Students');
$check(str_contains($read('backend/app/audit_catalogue.php'), "'class_archive' =>") && str_contains($read('backend/app/audit_catalogue.php'), "'class_restore' =>"), 'audit catalogue labels both actions');

$year = $read('backend/app/academic_year.php');
$check(str_contains($year, 'function academic_class_section_is_archived(') && str_contains($fn($year, 'academic_class_section_is_past'), 'academic_class_section_is_archived('),
    'archived classes are view-only wherever past classes are');

$list = $fn($faculty, 'handle_faculty_classes_get');
$check(str_contains($list, "'archiveReason'") && str_contains($list, "'archivedAt'") && str_contains($list, "'isArchived'"), 'class list returns archive fields');
foreach (['handle_faculty_class_update', 'handle_faculty_class_enroll_students', 'handle_faculty_class_unenroll_student', 'handle_faculty_student_create', 'handle_faculty_watchlist_unlock'] as $handler) {
    $check(str_contains($fn($faculty, $handler), 'academic_class_section_is_archived('), "{$handler} refuses archived classes");
}
$check(str_contains($read('backend/controllers/StudentAuthController.php'), 'academic_class_section_is_archived('), 'Student invitations refuse archived classes');

$remedial = $fn($faculty, 'handle_faculty_retention_remedial_save') . $fn($faculty, 'handle_faculty_retention_cost_recovery_save');
$check(substr_count($remedial, "['cancelled', 'mistake']") === 2, 'remedial and cost recovery are blocked only for cancelled or mistake classes');

$studentRows = $fn($read('backend/controllers/StudentAcademicController.php'), 'student_academic_class_rows');
$check(str_contains(str_replace("\'", "'", $studentRows), $visible) && str_contains($studentRows, "'archiveReason'"), 'Student classes hide cancelled/mistake and expose Finished');
foreach (['backend/app/student_auth.php', 'backend/app/attendance_sessions.php', 'backend/controllers/StudentBiometricController.php', 'backend/app/academic_year.php', 'backend/controllers/AdminController.php'] as $file) {
    $check(str_contains(str_replace("\'", "'", $read($file)), $visible) || str_contains($read($file), 'hx.archive_reason IN'), "{$file} hides cancelled/mistake classes");
}
$check(substr_count($faculty, $visible) >= 10, 'Faculty dashboard, students, attendance, grading, retention and reports hide cancelled/mistake classes');
$check(str_contains($year, 'Archived classes are view-only.') && str_contains($year, 'function academic_view_only_message('), 'one helper picks the archived or past-year refusal text');
$check(substr_count($faculty . $read('backend/controllers/SecretaryController.php') . $read('backend/app/attendance_sessions.php'), 'academic_view_only_message(') >= 20, 'view-only refusals use the helper');
$check(str_contains($list, "'scheduledSessionCount'") && str_contains($list, "'secretaryName'"), 'class list returns scheduledSessionCount and secretaryName');
