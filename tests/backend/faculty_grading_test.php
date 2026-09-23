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

$periodDefaults = faculty_grading_default_period_template();
assert_faculty_grading($periodDefaults['schemaMode'] === 'periods', 'Unconfigured grading defaults use period mode');
assert_faculty_grading($periodDefaults['termRatio']['midterm'] === 40 && $periodDefaults['termRatio']['final'] === 60, 'Faculty default term ratio is 40/60');
assert_faculty_grading(count($periodDefaults['midtermCategories']) === 4 && count($periodDefaults['finalCategories']) === 5, 'Faculty default period category templates are populated');
assert_faculty_grading(faculty_grading_normalize_term_ratio(['midterm' => 40, 'final' => 60])['final'] === '60.0000', 'Term ratio normalizes to fixed precision');
assert_faculty_grading(faculty_grading_normalize_period_categories([
    ['name' => 'Quiz', 'weight' => 100, 'sortOrder' => 1],
], 'Midterm')[0]['gradingPeriod'] === 'Midterm', 'Period category normalization retains its period');

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
