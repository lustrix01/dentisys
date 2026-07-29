<?php

declare(strict_types=1);

require_once __DIR__ . '/../../backend/controllers/FacultyController.php';

function assert_faculty_students(bool $condition, string $label): void
{
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$label}\n");
        exit(1);
    }
    echo "PASS: {$label}\n";
}

$base = [
    'student_id' => 7,
    'student_number' => '2026-DENT-0007',
    'first_name' => 'Ana',
    'middle_name' => null,
    'last_name' => 'Reyes',
    'bu_email' => 'ana.reyes@bicol-u.edu.ph',
    'contact' => null,
    'sex' => 'Female',
    'year_level' => 4,
    'admission_date' => '2023-08-01',
    'birthdate' => '2004-01-01',
    'consent_status' => 'Granted',
    'face_enrolled' => 1,
    'grade_components_json' => null,
    'units' => 3,
    'is_clinical' => 1,
];

$rows = [
    array_merge($base, [
        'cs_id' => 11,
        'cs_name' => 'CLINIC-4A',
        'enrollment_id' => 101,
        'final_gwa' => 2.0,
        'retention_state' => 'warning',
        'clinic_hours_completed' => 12,
        'course_code' => 'CLIN401',
        'course_name' => 'Clinical Dentistry I',
    ]),
    array_merge($base, [
        'cs_id' => 12,
        'cs_name' => 'CLINIC-4B',
        'enrollment_id' => 102,
        'final_gwa' => 3.0,
        'retention_state' => 'critical',
        'clinic_hours_completed' => 18,
        'course_code' => 'CLIN402',
        'course_name' => 'Clinical Dentistry II',
    ]),
    array_merge($base, [
        'student_id' => 8,
        'student_number' => '2026-DENT-0008',
        'first_name' => 'Ben',
        'last_name' => 'Cruz',
        'cs_id' => 11,
        'cs_name' => 'CLINIC-4A',
        'enrollment_id' => 103,
        'final_gwa' => null,
        'retention_state' => 'active',
        'clinic_hours_completed' => 4,
        'course_code' => 'CLIN401',
        'course_name' => 'Clinical Dentistry I',
    ]),
];

$students = faculty_map_student_rows($rows);
assert_faculty_students(count($students) === 2, 'Each faculty student is returned once');
$ana = $students[0];
assert_faculty_students(count($ana['classSections']) === 2, 'Multi-class membership is retained');
assert_faculty_students($ana['classSections'][1]['enrollmentId'] === '102', 'Class membership carries enrollment ID');
assert_faculty_students($ana['enrolledSubjects'][1]['classId'] === '12', 'Subject association carries class ID');
assert_faculty_students($ana['enrolledSubjects'][1]['enrollmentId'] === '102', 'Subject association carries enrollment ID');
assert_faculty_students(abs($ana['overallGWA'] - 2.5) < 0.00001, 'Only non-null enrollment grades are averaged');
assert_faculty_students($ana['clinicHoursCompleted'] === 30, 'Clinic hours are summed across enrollments');
assert_faculty_students($ana['status'] === 'critical', 'Aggregate status uses critical-first priority');
assert_faculty_students($students[1]['overallGWA'] === null, 'All-null enrollment grades remain null');

echo "ALL FACULTY STUDENT MAPPING TESTS PASSED\n";
