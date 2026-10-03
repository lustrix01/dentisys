<?php

declare(strict_types=1);

require_once __DIR__ . '/../../backend/controllers/FacultyController.php';

function assert_grouped_grading(bool $condition, string $label): void
{
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$label}\n");
        exit(1);
    }
    echo "PASS: {$label}\n";
}

class GroupedGradingNoQueryPDO extends PDO
{
    public function __construct() {}

    public function prepare(string $query, array $options = []): PDOStatement|false
    {
        throw new RuntimeException('Grouped unit fixtures must provide memberships and attendance inputs.');
    }
}

$groupedMode = faculty_grading_normalize_component_mode('lecture_laboratory');
assert_grouped_grading($groupedMode === 'lecture_laboratory', 'Grouped component mode normalizes explicitly');
assert_grouped_grading(faculty_grading_normalize_component_mode(null) === 'combined', 'Omitted component mode retains combined grading');

$componentWeights = faculty_grading_normalize_component_weights(['lecture' => 60, 'laboratory' => 40]);
assert_grouped_grading(
    $componentWeights['lecture'] === '60.0000' && $componentWeights['laboratory'] === '40.0000',
    'Unequal Lecture and Laboratory contributions normalize to the supported precision'
);

$sameNamesAcrossComponents = faculty_grading_normalize_period_categories([
    ['name' => 'Quiz', 'weight' => 100, 'sortOrder' => 1, 'component' => 'Lecture'],
    ['name' => 'Quiz', 'weight' => 100, 'sortOrder' => 2, 'component' => 'Laboratory'],
], 'Midterm', 'lecture_laboratory');
assert_grouped_grading(
    count($sameNamesAcrossComponents) === 2
        && $sameNamesAcrossComponents[0]['component'] === 'Lecture'
        && $sameNamesAcrossComponents[1]['component'] === 'Laboratory',
    'The same category name is valid once in each component-period list'
);

try {
    faculty_grading_normalize_period_categories([
        ['name' => 'Quiz', 'weight' => 50, 'sortOrder' => 1, 'component' => 'Lecture'],
        ['name' => 'quiz', 'weight' => 50, 'sortOrder' => 2, 'component' => 'Lecture'],
        ['name' => 'Quiz', 'weight' => 100, 'sortOrder' => 3, 'component' => 'Laboratory'],
    ], 'Midterm', 'lecture_laboratory');
    assert_grouped_grading(false, 'A component-period rejects duplicate category names case-insensitively');
} catch (FacultyGradingConfigurationException $e) {
    assert_grouped_grading(
        $e->errorCode === 'GRADING_COMPONENT_CATEGORY_INVALID',
        'A component-period duplicate returns the grouped category validation error'
    );
}

try {
    faculty_grading_normalize_component_weights(['lecture' => 60, 'laboratory' => 30]);
    assert_grouped_grading(false, 'Component contributions must total exactly 100%');
} catch (FacultyGradingConfigurationException $e) {
    assert_grouped_grading(
        $e->errorCode === 'GRADING_COMPONENT_WEIGHTS_INVALID',
        'Invalid component contributions return the explicit grouped weights error'
    );
}

$pdo = new GroupedGradingNoQueryPDO();
$assessment = static function (
    int $id,
    int $categoryId,
    string $period,
    float $score,
    float $maxScore = 100.0,
    bool $hasScore = true,
    bool $transmutationEnabled = false,
    float $transmutationMinimum = 50.0,
    float $transmutationMaximum = 100.0,
    ?string $attendanceStatus = null
): array {
    return [
        'assessment_id' => $id,
        'grading_category_id' => $categoryId,
        'grading_period' => $period,
        'score' => $score,
        'max_score' => $maxScore,
        '_has_score' => $hasScore,
        'transmutation_enabled' => $transmutationEnabled,
        'transmutation_minimum_percentage' => $transmutationMinimum,
        'transmutation_maximum_percentage' => $transmutationMaximum,
        'linked_attendance_status' => $attendanceStatus,
    ];
};
$membership = static function (
    int $categoryId,
    string $name,
    float $weight,
    string $component,
    string $sourceKind = 'assessment'
): array {
    return [
        'category_id' => $categoryId,
        'name' => $name,
        'weight' => $weight,
        'sort_order' => $categoryId,
        'source_kind' => $sourceKind,
        'component' => $component,
    ];
};
$periodGroup = [
    'componentMode' => 'lecture_laboratory',
    'componentWeights' => ['lecture' => 60.0, 'laboratory' => 40.0],
    'attendanceDateRanges' => [
        'midterm' => ['startDate' => '2026-08-01', 'endDate' => '2026-09-30'],
        'final' => ['startDate' => '2026-10-01', 'endDate' => '2026-12-31'],
    ],
];

// GRD-001 transmutation makes the 50/100 Lecture Quiz 75%. The 75% Quiz and
// 85% Exam average to an 80% Lecture result; 90% Laboratory yields Midterm 84.
$midtermMemberships = [
    $membership(101, 'Quiz', 50, 'Lecture'),
    $membership(102, 'Exam', 50, 'Lecture'),
    $membership(201, 'Quiz', 100, 'Laboratory'),
];
$midterm = faculty_compute_period_result($pdo, $periodGroup + [
    'assessments' => [
        $assessment(1001, 101, 'Midterm', 50, 100, true, true),
        $assessment(1002, 102, 'Midterm', 85),
        $assessment(1003, 201, 'Midterm', 90),
    ],
], 'Midterm', $midtermMemberships);
assert_grouped_grading($midterm['status'] === 'computed' && $midterm['percentage'] === 84.0, 'Grouped Midterm uses component category math, transmutation and a 60/40 ratio');
assert_grouped_grading(
    $midterm['breakdown']['components']['lecture']['percentage'] === 80.0
        && $midterm['breakdown']['components']['laboratory']['percentage'] === 90.0,
    'Grouped Midterm exposes separate component percentages'
);

$finalMemberships = [
    $membership(301, 'Quiz', 50, 'Lecture'),
    $membership(302, 'Exam', 50, 'Lecture'),
    $membership(401, 'Quiz', 100, 'Laboratory'),
];
$final = faculty_compute_period_result($pdo, $periodGroup + [
    'assessments' => [
        $assessment(2001, 301, 'Final', 90),
        $assessment(2002, 302, 'Final', 90),
        $assessment(2003, 401, 'Final', 80),
    ],
], 'Final', $finalMemberships);
$overall = ($midterm['unroundedPercentage'] * 30 / 100) + ($final['unroundedPercentage'] * 70 / 100);
assert_grouped_grading(
    $final['percentage'] === 86.0 && round($overall, 2) === 85.4,
    'The approved 60/40 component and 30/70 period example produces 84, 86 and 85.4'
);

// The Lecture result rounds to 0.01 for display, but the period combination
// must use its raw value. Rounding first would incorrectly produce 0.01.
$precisionGroup = [
    'componentMode' => 'lecture_laboratory',
    'componentWeights' => ['lecture' => 50.0, 'laboratory' => 50.0],
    'attendanceDateRanges' => ['midterm' => ['startDate' => null, 'endDate' => null]],
    'assessments' => [
        $assessment(3001, 501, 'Midterm', 0.01, 101),
        $assessment(3002, 601, 'Midterm', 0),
    ],
];
$precision = faculty_compute_period_result($pdo, $precisionGroup, 'Midterm', [
    $membership(501, 'Quiz', 100, 'Lecture'),
    $membership(601, 'Quiz', 100, 'Laboratory'),
]);
assert_grouped_grading(
    $precision['breakdown']['components']['lecture']['percentage'] === 0.01
        && $precision['percentage'] === 0.0
        && abs($precision['unroundedPercentage'] - (0.01 / 101 * 100 / 2)) < 1e-12,
    'Grouped period weighting uses unrounded component intermediates'
);

$missingScore = faculty_compute_period_result($pdo, $periodGroup + [
    'assessments' => [
        $assessment(4001, 701, 'Midterm', 80),
        $assessment(4002, 801, 'Midterm', 0, 100, false),
    ],
], 'Midterm', [
    $membership(701, 'Quiz', 100, 'Lecture'),
    $membership(801, 'Quiz', 100, 'Laboratory'),
]);
assert_grouped_grading(
    $missingScore['status'] === 'incomplete'
        && $missingScore['breakdown']['components']['laboratory']['status'] === 'incomplete'
        && ($missingScore['breakdown']['components']['laboratory']['incomplete'][0]['reason'] ?? null) === 'missing_assessment_score',
    'A missing score keeps its component and dependent period incomplete'
);

$enteredZero = faculty_compute_period_result($pdo, $periodGroup + [
    'assessments' => [
        $assessment(5001, 901, 'Midterm', 100),
        $assessment(5002, 1001, 'Midterm', 0),
    ],
], 'Midterm', [
    $membership(901, 'Quiz', 100, 'Lecture'),
    $membership(1001, 'Quiz', 100, 'Laboratory'),
]);
assert_grouped_grading(
    $enteredZero['status'] === 'computed'
        && $enteredZero['breakdown']['components']['laboratory']['percentage'] === 0.0,
    'An entered zero is a computed result rather than a missing score'
);

$attendanceIncomplete = faculty_compute_period_result($pdo, $periodGroup + [
    'assessments' => [$assessment(6001, 1101, 'Midterm', 90)],
], 'Midterm', [
    $membership(1101, 'Quiz', 100, 'Lecture'),
    $membership(1201, 'Attendance', 100, 'Laboratory', 'attendance'),
], ['status' => 'incomplete', 'reason' => 'missing_date_range', 'sessions' => []]);
assert_grouped_grading(
    $attendanceIncomplete['status'] === 'incomplete'
        && ($attendanceIncomplete['breakdown']['components']['laboratory']['incomplete'][0]['reason'] ?? null) === 'missing_date_range',
    'Missing authoritative Attendance dates keep the weighted component and period incomplete'
);

$duplicateAttendance = faculty_compute_period_result($pdo, $periodGroup + [
    'assessments' => [],
], 'Midterm', [
    $membership(1301, 'Attendance', 100, 'Lecture', 'attendance'),
    $membership(1401, 'Attendance', 100, 'Laboratory', 'attendance'),
], ['status' => 'computed', 'percentage' => 100.0, 'sessions' => []]);
assert_grouped_grading(
    $duplicateAttendance['status'] === 'incomplete'
        && ($duplicateAttendance['breakdown']['incomplete'][0]['reason'] ?? null) === 'duplicate_attendance_sources',
    'Recomputation keeps a legacy duplicate Attendance source incomplete across components'
);

$combined = faculty_compute_period_result($pdo, [
    'componentMode' => 'combined',
    'assessments' => [$assessment(7001, 1501, 'Midterm', 0)],
    'attendanceDateRanges' => ['midterm' => ['startDate' => null, 'endDate' => null]],
], 'Midterm', [[
    'category_id' => 1501,
    'name' => 'Quiz',
    'weight' => 100,
    'sort_order' => 1,
    'source_kind' => 'assessment',
]]);
assert_grouped_grading(
    $combined['status'] === 'computed' && $combined['percentage'] === 0.0,
    'Existing combined period grading still computes an entered zero unchanged'
);
$combinedAttendance = faculty_compute_period_result($pdo, [
    'componentMode' => 'combined',
    'assessments' => [$assessment(7002, 1502, 'Midterm', 80)],
    'attendanceDateRanges' => ['midterm' => ['startDate' => '2027-08-01', 'endDate' => '2027-09-01']],
], 'Midterm', [
    [
        'category_id' => 1502,
        'name' => 'Quiz',
        'weight' => 60,
        'sort_order' => 1,
        'source_kind' => 'assessment',
    ],
    [
        'category_id' => 1601,
        'name' => 'Attendance',
        'weight' => 40,
        'sort_order' => 2,
        'source_kind' => 'attendance',
    ],
], ['status' => 'computed', 'percentage' => 100.0, 'sessions' => []]);
assert_grouped_grading(
    $combinedAttendance['status'] === 'computed',
    'Legacy combined period Attendance calculation remains complete'
);
assert_grouped_grading(
    $combinedAttendance['percentage'] === 88.0
        && ($combinedAttendance['breakdown']['categories'][1]['sourceKind'] ?? null) === 'attendance',
    'Legacy combined period calculations retain their saved assessment and Attendance math'
);

echo "ALL GROUPED GRADING TESTS PASSED.\n";
