<?php

declare(strict_types=1);

require_once __DIR__ . '/../../backend/controllers/FacultyController.php';

function assert_faculty_grading(bool $condition, string $label): void
{
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$label}\n");
        exit(1);
    }
    echo "PASS: {$label}\n";
}

$assessment = static fn(float $raw, string $status): ?float => faculty_effective_assessment_percentage(
    $raw,
    100,
    true,
    50,
    100,
    $status,
);

assert_faculty_grading($assessment(0, 'present') === 50.0, 'Default present zero score transmuted to minimum');
assert_faculty_grading($assessment(50, 'present') === 75.0, 'Default present partial score transmuted linearly');
assert_faculty_grading($assessment(100, 'present') === 100.0, 'Default present maximum score remains maximum');
assert_faculty_grading($assessment(50, 'late') === 75.0, 'Late uses the same approved transformation as present');
assert_faculty_grading($assessment(50, 'excused') === 75.0, 'Excused uses the same approved transformation as present');
assert_faculty_grading($assessment(100, 'absent') === 0.0, 'Absent always produces zero effective percentage');
assert_faculty_grading(faculty_effective_assessment_percentage(50, 100, true, 50, 100, 'unresolved') === null, 'Unresolved linked attendance produces no effective result');
assert_faculty_grading(faculty_effective_assessment_percentage(50, 100, true, 50, 100, null) === 75.0, 'Without a session link the raw percentage is transmuted and attendance is ignored (GRD-001)');
$linkedSql = faculty_linked_attendance_sql('e.enrollment_id');
assert_faculty_grading(!str_contains($linkedSql, 'due_date'), 'Linked attendance never matches by exam date (GRD-001)');
assert_faculty_grading(str_contains($linkedSql, "ls.status = 'revoked') THEN NULL"), 'A revoked linked session counts as unlinked (GRD-001)');
assert_faculty_grading(str_contains($linkedSql, "ls.status = 'ended') THEN 'absent'"), 'An ended linked session without a record resolves to Absent (GRD-001)');
assert_faculty_grading(
    faculty_effective_assessment_percentage(25, 50, true, 40, 90, 'present') === 65.0,
    'Custom transmutation bounds are applied correctly'
);
assert_faculty_grading(
    faculty_effective_assessment_percentage(25, 50, false, 40, 90, null) === 50.0,
    'Disabled transmutation preserves the raw percentage'
);

foreach ([
    [1.00, 'active'],
    [2.39, 'active'],
    [2.40, 'active'],
    [2.49, 'active'],
    [2.50, 'remedial'],
    [2.60, 'remedial'],
    [5.00, 'remedial'],
] as [$gwa, $expectedState]) {
    assert_faculty_grading(
        faculty_course_grade_retention_state($gwa, 2.50) === $expectedState,
        "Course-grade threshold classifies {$gwa} at established precision"
    );
}
assert_faculty_grading(
    faculty_course_grade_retention_state(null, 2.50) === null,
    'Missing or incomplete course grades remain unresolved'
);

foreach ([
    [100.0, 1.0], [99.0, 1.0], [98.0, 1.1], [97.0, 1.2], [96.0, 1.3], [95.0, 1.4], [94.0, 1.5], [93.0, 1.6],
    [92.0, 1.7], [91.0, 1.8], [90.0, 1.9], [89.0, 2.0], [88.0, 2.1], [87.0, 2.2], [86.0, 2.3], [85.0, 2.4],
    [84.0, 2.5], [83.0, 2.6], [82.0, 2.6], [81.0, 2.7], [80.0, 2.7], [79.0, 2.8], [78.0, 2.8], [77.0, 2.9],
    [76.0, 2.9], [75.0, 3.0], [74.0, 5.0], [70.0, 5.0], [65.0, 5.0], [0.0, 5.0], [NAN, 5.0],
] as [$percentage, $grade]) {
    assert_faculty_grading(
        faculty_percentage_to_gwa($percentage, 'Midterm') === $grade && faculty_percentage_to_gwa($percentage) === $grade,
        "BUCDM: whole {$percentage}% -> {$grade} for Midterm, Final and course"
    );
}
foreach ([[74.5, 75.0], [74.49999999, 74.0], [74.4999999999, 75.0], [84.5, 85.0], [83.7667, 84.0], [0.4, 0.0], [99.5, 100.0]] as [$raw, $whole]) {
    assert_faculty_grading(faculty_round_percent($raw) === $whole, "Whole-percent rounding: {$raw} -> {$whole}");
}
assert_faculty_grading(
    faculty_course_grade_retention_state(faculty_percentage_to_gwa_exact(84.0), 2.50) === 'remedial',
    '84% (2.5) reaches the remediation trigger'
);
assert_faculty_grading(
    faculty_course_grade_retention_state(faculty_percentage_to_gwa_exact(85.0), 2.50) === 'active',
    'Exactly 85.00% (2.4) is active'
);

$periodDefaults = faculty_grading_default_period_template();
assert_faculty_grading($periodDefaults['schemaMode'] === 'periods', 'Unconfigured grading defaults use period mode');
assert_faculty_grading(
    $periodDefaults['componentMode'] === 'lecture_laboratory'
        && $periodDefaults['componentWeights'] === ['lecture' => 60, 'laboratory' => 40],
    'Unconfigured grading defaults use the mandatory 60/40 component split'
);
assert_faculty_grading(
    $periodDefaults['termRatio'] === ['midterm' => 50, 'final' => 50],
    'Faculty default term ratio is 50/50'
);
$expectedDefaultCategories = [
    ['Term Exam', 50, 1, 'Lecture'],
    ['Quiz', 20, 2, 'Lecture'],
    ['Outputs', 20, 3, 'Lecture'],
    ['Participation', 10, 4, 'Lecture'],
    ['Practical Exam', 50, 1, 'Laboratory'],
    ['Laboratory Exercises', 30, 2, 'Laboratory'],
    ['Quiz', 10, 3, 'Laboratory'],
    ['Recitation', 10, 4, 'Laboratory'],
];
$defaultCategoryRows = static fn(array $categories): array => array_map(
    static fn(array $category): array => [
        $category['name'], $category['weight'], $category['sortOrder'], $category['component'],
    ],
    $categories
);
assert_faculty_grading(
    $defaultCategoryRows($periodDefaults['midtermCategories']) === $expectedDefaultCategories
        && $defaultCategoryRows($periodDefaults['finalCategories']) === $expectedDefaultCategories
        && array_reduce(
            [...$periodDefaults['midtermCategories'], ...$periodDefaults['finalCategories']],
            static fn(bool $allAssessmentSources, array $category): bool => $allAssessmentSources
                && $category['sourceKind'] === 'assessment',
            true
        ),
    'Both periods receive the approved category lists with assessment-score sources'
);
assert_faculty_grading(faculty_grading_normalize_term_ratio(['midterm' => 40, 'final' => 60])['final'] === '60.0000', 'Term ratio normalizes to fixed precision');
assert_faculty_grading(faculty_grading_normalize_period_categories([
    ['name' => 'Quiz', 'weight' => 100, 'sortOrder' => 1],
], 'Midterm')[0]['gradingPeriod'] === 'Midterm', 'Period category normalization retains its period');
assert_faculty_grading(
    faculty_grading_normalize_period_categories([
        ['name' => 'Attendance', 'weight' => 100, 'sortOrder' => 1, 'sourceKind' => 'attendance'],
    ], 'Final')[0]['sourceKind'] === 'attendance',
    'Period category normalization retains the authoritative attendance source kind'
);

$periodDateRanges = faculty_grading_normalize_date_ranges([
    'midterm' => ['startDate' => '2027-08-15', 'endDate' => '2027-09-30'],
    'final' => ['startDate' => '2027-10-15', 'endDate' => '2027-12-01'],
], [
    'midterm' => ['startDate' => null, 'endDate' => null],
    'final' => ['startDate' => null, 'endDate' => null],
]);
assert_faculty_grading(
    $periodDateRanges['midterm']['startDate'] === '2027-08-15'
        && $periodDateRanges['midterm']['endDate'] === '2027-09-30'
        && $periodDateRanges['final']['startDate'] === '2027-10-15'
        && $periodDateRanges['final']['endDate'] === '2027-12-01',
    'Period date ranges preserve inclusive Faculty-defined endpoints'
);
assert_faculty_grading(
    faculty_grading_normalize_date_ranges([
        'midterm' => ['startDate' => '2027-08-16'],
    ], $periodDateRanges)['midterm']['endDate'] === '2027-09-30'
        && $periodDateRanges['final']['startDate'] === '2027-10-15',
    'Omitted period date edges preserve the saved values'
);
assert_faculty_grading(
    faculty_grading_normalize_date_ranges([
        'midterm' => ['startDate' => null, 'endDate' => null],
        'final' => ['startDate' => null, 'endDate' => null],
    ], $periodDateRanges)['midterm']['startDate'] === null,
    'Explicitly missing period dates remain missing for incomplete computation'
);

try {
    faculty_grading_normalize_date_ranges([
        'midterm' => ['startDate' => '2027-09-30', 'endDate' => '2027-08-15'],
        'final' => ['startDate' => '2027-10-15', 'endDate' => '2027-12-01'],
    ], $periodDateRanges);
    assert_faculty_grading(false, 'Period date ranges reject a reversed period');
} catch (FacultyGradingConfigurationException $e) {
    assert_faculty_grading($e->errorCode === 'GRADING_PERIOD_DATE_RANGE_INVALID', 'Reversed period dates return the explicit date-range error code');
}

try {
    faculty_grading_normalize_date_ranges([
        'midterm' => ['startDate' => '2027-08-15', 'endDate' => '2027-10-15'],
        'final' => ['startDate' => '2027-10-15', 'endDate' => '2027-12-01'],
    ], $periodDateRanges);
    assert_faculty_grading(false, 'Period date ranges reject overlapping or same-day boundaries');
} catch (FacultyGradingConfigurationException $e) {
    assert_faculty_grading($e->errorCode === 'GRADING_PERIOD_DATE_RANGE_INVALID', 'Overlapping period dates return the explicit date-range error code');
}

$gappedPeriodDateRanges = faculty_grading_normalize_date_ranges([
    'midterm' => ['startDate' => '2027-08-15', 'endDate' => '2027-09-30'],
    'final' => ['startDate' => '2027-10-15', 'endDate' => '2027-12-01'],
], $periodDateRanges);
assert_faculty_grading(
    $gappedPeriodDateRanges['midterm']['endDate'] < $gappedPeriodDateRanges['final']['startDate'],
    'Period date ranges allow a gap between Midterm and Finals'
);

try {
    faculty_grading_normalize_term_ratio(['midterm' => 40, 'final' => 50]);
    assert_faculty_grading(false, 'Term ratio rejects totals other than exactly 100%');
} catch (FacultyGradingConfigurationException $e) {
    assert_faculty_grading($e->getMessage() !== '', 'Term ratio rejects totals other than exactly 100%');
}

try {
    faculty_grading_normalize_term_ratio(['midterm' => true, 'final' => 99]);
    assert_faculty_grading(false, 'Term ratio rejects boolean scalar values');
} catch (FacultyGradingConfigurationException $e) {
    assert_faculty_grading($e->getMessage() !== '', 'Term ratio rejects boolean scalar values');
}

echo "ALL FACULTY GRADING TESTS PASSED\n";
