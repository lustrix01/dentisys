<?php

declare(strict_types=1);

// Static contract checks for the audit backend fixes (H1-H5, L11-L13).
$root = dirname(__DIR__, 2) . '/backend';
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

$faculty = $read('controllers/FacultyController.php');
$secretary = $read('controllers/SecretaryController.php');
$student = $read('controllers/StudentAcademicController.php');

foreach (['app/auth.php', 'app/auth_runtime.php'] as $f) {
    $check(str_contains($read($f), "in_array(\$user['role'], ['student', 'secretary'], true)"), "H1 {$f} checks Student eligibility for Secretary accounts");
}
$check(str_contains($read('app/student_auth.php'), "in_array(\$row['role'], ['student', 'secretary'], true)"), 'H1 eligibility accepts the Secretary role');

$save = $fn($faculty, 'handle_faculty_assessments_save');
$check(str_contains($save, 'SELECT a.cs_id,') && str_contains($save, "academic_class_section_is_past(\$pdo, (int) \$existing['cs_id'])"), 'H2 existing assessment in a past class is view-only');
$check(str_contains($save, 'An assessment cannot be moved to another class.'), 'H2 assessment class cannot change');
$check(str_contains($save, 'SELECT MAX(score) FROM assessment_scores WHERE assessment_id = ?') && str_contains($save, 'highest saved score:'), 'H3 max score cannot drop below a saved score');

foreach ([[$faculty, 'handle_faculty_dashboard_kpis'], [$secretary, 'handle_secretary_dashboard_kpis'], [$student, 'handle_student_dashboard_get']] as [$src, $name]) {
    $check(str_contains($fn($src, $name), 'attendance_sessions_end_overdue('), "H5 {$name} ends overdue sessions first");
}

// ATT-006 (2026-10-28): Secretary changes are requests; the shared request path never writes attendance.
$override = $fn($secretary, 'secretary_attendance_request_create');
$check(str_contains($fn($secretary, 'handle_secretary_attendance_override'), 'secretary_attendance_request_create(false)'), 'Secretary override sends a request');
$check(str_contains($override, 'Choose the attendance record or session to change.'), 'L11 override requires a record or session');
$check(str_contains($override, 'This Excused status was approved by Faculty. Only Faculty can change it.')
    && str_contains($override, "WHERE record_id = ? AND status = 'approved'")
    && !str_contains($override, 'UPDATE attendance_records') && !str_contains($override, 'INSERT INTO attendance_records'), 'Secretary cannot change a Faculty-approved Excused record, and a request never writes attendance');
$check(str_contains($secretary, "xr.record_id = r.record_id AND xr.status = 'approved'") && str_contains($secretary, "'excusedApprovedByFaculty' =>"), 'Secretary attendance list flags Faculty-approved Excused records');

$check(str_contains($fn($faculty, 'handle_faculty_class_enroll_students'), 'ON CONFLICT (student_id, cs_id) DO NOTHING'), 'L12 duplicate enroll is not a 500');

$check(substr_count($secretary, "ORDER BY (LOWER(status) = 'active' AND UPPER(school_year) = UPPER(?)) DESC, cs_id LIMIT 1") === 2, 'L13 Secretary profile and settings prefer the current Active section');

echo "ALL BACKEND FIX CONTRACT TESTS PASSED.\n";
