<?php

declare(strict_types=1);

// Static contract checks (Owner rulings 2026-10-22): stored grades follow assessment
// delete / grade-weight save / revived enrollments; unenrolling a Class Secretary ends
// that appointment; Late counts as Present in the attendance part of a grade.
$source = (string) file_get_contents(dirname(__DIR__, 2) . '/backend/controllers/FacultyController.php');
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

$helper = $fn($source, 'faculty_recompute_after_change');
$check(str_contains($helper, 'faculty_recompute_class_grades(') && str_contains($helper, 'SAVEPOINT grade_recompute_after_change')
    && str_contains($helper, "'grades_recomputed'") && str_contains($helper, 'ROLLBACK TO SAVEPOINT'), 'recompute helper runs the shared recompute behind a savepoint and audits grades_recomputed');

$delete = $fn($source, 'handle_faculty_assessment_delete');
$check(strpos($delete, 'faculty_recompute_after_change(') > strpos($delete, 'DELETE FROM assessments')
    && strpos($delete, 'faculty_recompute_after_change(') < strpos($delete, '$pdo->commit()'), 'assessment delete recomputes its class before commit');

$save = $fn($source, 'faculty_grading_save_configuration');
$check(str_contains($save, 'bool $recomputeGrades = false')
    && strpos($save, 'faculty_recompute_after_change(') < strpos($save, '$pdo->commit()')
    && str_contains($fn($source, 'handle_faculty_grading_config_save'), '$context, true)'), 'grade-weight save recomputes the offering classes before commit (handler only)');

$enroll = $fn($source, 'handle_faculty_class_enroll_students');
$check(str_contains($enroll, '$revived = true;') && str_contains($enroll, 'if ($revived) {')
    && strpos($enroll, 'faculty_recompute_after_change(') < strpos($enroll, '$pdo->commit()'), 'revived enrollment recomputes the class before commit');

$unenroll = $fn($source, 'handle_faculty_class_unenroll_student');
$check(str_contains($unenroll, 'UPDATE class_sections SET secretary_user_id = NULL WHERE cs_id = ?')
    && str_contains($unenroll, 'secretary_has_current_appointment(') && str_contains($unenroll, 'secretary_end_appointment_role(')
    && str_contains($unenroll, "'secretary_appointment'")
    && strpos($unenroll, 'secretary_end_appointment_role(') < strpos($unenroll, '$pdo->commit()'), 'unenrolling the Class Secretary clears this section only, ends the role if last, notifies, same transaction');

$check(str_contains($source, "'late' => 100.0,") && !str_contains($source, "'late' => 80.0")
    && str_contains($source, "WHEN status IN ('present', 'late', 'excused') THEN 100") && !str_contains($source, "WHEN status = 'late' THEN 80"), 'Late counts as 100 in both attendance grade computations');

echo "ALL GRADE FRESHNESS CONTRACT TESTS PASSED.\n";
