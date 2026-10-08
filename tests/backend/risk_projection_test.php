<?php

declare(strict_types=1);

require_once __DIR__ . '/../../backend/controllers/FacultyController.php';

function assert_risk(bool $condition, string $label): void
{
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$label}\n");
        exit(1);
    }
    echo "PASS: {$label}\n";
}

// Quiz 30% (50/50) and Midterm Exam 70% (80/100): 30 + 56 = 86%.
$categories = [
    ['kind' => 'assessment', 'weight' => 30.0, 'earned' => 50.0, 'possible' => 50.0],
    ['kind' => 'assessment', 'weight' => 70.0, 'earned' => 80.0, 'possible' => 100.0],
];
assert_risk(abs(faculty_risk_period_percentage($categories, 75.0, 0) - 86.0) < 1e-9, 'No assumed work gives the current weighted grade');
$afterOne = faculty_risk_period_percentage($categories, 75.0, 1);
// Quiz: (50 + 0.75*22.5)/(50+22.5); Exam: (80 + 0.75*52.5)/(100+52.5).
$expected = 30 * ((50 + 16.875) / 72.5) + 70 * ((80 + 39.375) / 152.5);
assert_risk(abs($afterOne - $expected) < 1e-9, 'An assumed 75% assessment is spread across categories by weight');
$risk = faculty_risk_level(static fn(int $n): ?float => faculty_risk_period_percentage($categories, 75.0, $n));
assert_risk(($risk['level'] ?? null) === 'At Risk' && ($risk['assumedAssessments'] ?? null) === 3, 'The worked example reaches 2.50 after 3 assumed assessments: At Risk');

assert_risk(
    faculty_risk_level(static fn(int $n): ?float => 80.01) === ['level' => 'Low', 'assumedAssessments' => null],
    'Risk does not treat a displayed 2.50 at 80.01% as reaching the exact trigger'
);

$single = [['kind' => 'assessment', 'weight' => 100.0, 'earned' => 100.0, 'possible' => 100.0]];
assert_risk(faculty_risk_level(static fn(int $n): ?float => faculty_risk_period_percentage($single, 100.0, $n)) === ['level' => 'At Risk', 'assumedAssessments' => 4], 'One perfect assessment reaches 2.50 after 4 assumed assessments: At Risk');

$failing = [['kind' => 'assessment', 'weight' => 100.0, 'earned' => 40.0, 'possible' => 50.0]];
assert_risk(faculty_risk_level(static fn(int $n): ?float => faculty_risk_period_percentage($failing, 50.0, $n)) === ['level' => 'High', 'assumedAssessments' => 0], 'A grade already 2.50 or worse is High');

$excellent = [['kind' => 'assessment', 'weight' => 100.0, 'earned' => 500.0, 'possible' => 500.0]];
assert_risk((faculty_risk_level(static fn(int $n): ?float => faculty_risk_period_percentage($excellent, 50.0, $n))['level'] ?? null) === 'Low', 'Many strong completed assessments are Low');

$withAttendance = [
    ['kind' => 'assessment', 'weight' => 90.0, 'earned' => 45.0, 'possible' => 50.0],
    ['kind' => 'attendance', 'weight' => 10.0, 'percentage' => null],
];
assert_risk(abs(faculty_risk_period_percentage($withAttendance, 50.0, 0) - 90.0) < 1e-9, 'Unknown attendance is left out and the other weights renormalize');
assert_risk(faculty_risk_level(static fn(int $n): ?float => null) === null, 'No computable grade gives no risk');

// Reusing completeness inputs must distinguish an entered zero from a missing
// score. Missing assessments are not assumed completed in the risk projection.
class RiskCachedInputsPDO extends PDO
{
    public function __construct() {}
    public function prepare(string $query, array $options = []): PDOStatement|false
    {
        throw new RuntimeException('Fully loaded risk inputs should not query again.');
    }
}
$cachedGrading = ['periodMemberships' => ['Midterm' => [
    ['category_id' => 1, 'source_kind' => 'assessment', 'weight' => 100],
]]];
$cachedAssessment = [
    'grading_category_id' => 1, 'max_score' => 100, 'transmutation_enabled' => false,
    'transmutation_minimum_percentage' => 50, 'transmutation_maximum_percentage' => 100,
    'linked_attendance_status' => null,
];
$cachedInputs = ['assessments' => [
    20 => ['Midterm' => [
        $cachedAssessment + ['score' => 0, '_has_score' => true],
        $cachedAssessment + ['score' => null, '_has_score' => false],
    ]],
    21 => ['Midterm' => [$cachedAssessment + ['score' => 95, '_has_score' => true]]],
]];
$cachedZero = faculty_risk_period_inputs(new RiskCachedInputsPDO(), ['enrollment_id' => 20], $cachedGrading, 'Midterm', $cachedInputs);
assert_risk($cachedZero[0][0]['earned'] === 0.0 && $cachedZero[0][0]['possible'] === 100.0, 'Cached risk retains an entered zero and excludes the missing score');
assert_risk($cachedZero[1] === [100.0], 'Missing scores do not increase the completed assessment sizes');
$cachedOther = faculty_risk_period_inputs(new RiskCachedInputsPDO(), ['enrollment_id' => 21], $cachedGrading, 'Midterm', $cachedInputs);
assert_risk($cachedOther[0][0]['earned'] === 95.0, 'Cached assessment inputs remain isolated by enrollment');

// Grouped components flatten into the saved offering contribution before the
// existing informational-risk calculation. A recorded zero remains present;
// a missing Laboratory assessment follows the existing risk renormalization.
$groupedRiskGrading = [
    'component_mode' => 'lecture_laboratory',
    'component_lecture_weight' => 60,
    'component_laboratory_weight' => 40,
    'periodMemberships' => ['Midterm' => [
        ['category_id' => 11, 'source_kind' => 'assessment', 'weight' => 100, 'component' => 'Lecture'],
        ['category_id' => 12, 'source_kind' => 'assessment', 'weight' => 100, 'component' => 'Laboratory'],
    ]],
];
$groupedRiskCachedInputs = ['assessments' => [
    30 => ['Midterm' => [
        array_replace($cachedAssessment, [
            'assessment_id' => 301,
            'grading_category_id' => 11,
            'score' => 80,
            '_has_score' => true,
        ]),
        array_replace($cachedAssessment, [
            'assessment_id' => 302,
            'grading_category_id' => 12,
            'score' => 0,
            '_has_score' => true,
        ]),
    ]],
    31 => ['Midterm' => [
        array_replace($cachedAssessment, [
            'assessment_id' => 311,
            'grading_category_id' => 11,
            'score' => 100,
            '_has_score' => true,
        ]),
        array_replace($cachedAssessment, [
            'assessment_id' => 312,
            'grading_category_id' => 12,
            'score' => null,
            '_has_score' => false,
        ]),
    ]],
]];
$groupedRiskZero = faculty_risk_period_inputs(
    new RiskCachedInputsPDO(),
    ['enrollment_id' => 30],
    $groupedRiskGrading,
    'Midterm',
    $groupedRiskCachedInputs
);
assert_risk(
    $groupedRiskZero[0][0]['weight'] === 60.0
        && $groupedRiskZero[0][1]['weight'] === 40.0
        && $groupedRiskZero[0][1]['possible'] === 100.0,
    'Grouped risk applies the saved component ratio and keeps an entered Laboratory zero'
);
assert_risk(
    abs(faculty_risk_period_percentage($groupedRiskZero[0], 100.0, 0) - 48.0) < 1e-9,
    'Grouped risk combines Lecture and Laboratory at their saved 60/40 contributions'
);
$groupedRiskMissing = faculty_risk_period_inputs(
    new RiskCachedInputsPDO(),
    ['enrollment_id' => 31],
    $groupedRiskGrading,
    'Midterm',
    $groupedRiskCachedInputs
);
assert_risk(
    $groupedRiskMissing[0][0]['earned'] === 100.0
        && $groupedRiskMissing[0][1]['possible'] === 0.0
        && abs(faculty_risk_period_percentage($groupedRiskMissing[0], 100.0, 0) - 100.0) < 1e-9,
    'Grouped risk excludes a missing category under the existing risk projection rules'
);

echo "ALL RISK PROJECTION TESTS PASSED.\n";
