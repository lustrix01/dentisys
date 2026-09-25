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
assert_faculty_grading(faculty_effective_assessment_percentage(50, 100, true, 50, 100, null) === null, 'Missing or unresolved attendance produces no effective result');
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

$periodDefaults = faculty_grading_default_period_template();
assert_faculty_grading($periodDefaults['schemaMode'] === 'periods', 'Unconfigured grading defaults use period mode');
assert_faculty_grading($periodDefaults['termRatio']['midterm'] === 40 && $periodDefaults['termRatio']['final'] === 60, 'Faculty default term ratio is 40/60');
assert_faculty_grading(count($periodDefaults['midtermCategories']) === 4 && count($periodDefaults['finalCategories']) === 5, 'Faculty default period category templates are populated');
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
