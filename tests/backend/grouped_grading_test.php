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
$overall = faculty_round_percent(
    faculty_round_percent($midterm['percentage'] * 30 / 100) + faculty_round_percent($final['percentage'] * 70 / 100)
);
assert_grouped_grading(
    $final['percentage'] === 86.0 && $overall === 85.0,
    'The 60/40 component and 30/70 period example produces 84, 86 and a whole-percent course grade of 85'
);

// Official sheet (spec 2026-10-26): each component rounds to a whole percent
// before the Lecture/Laboratory combination; the raw value stays in the breakdown.
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
    $precision['breakdown']['components']['lecture']['percentage'] === 0.0
        && abs($precision['breakdown']['components']['lecture']['rawPercentage'] - round(0.01 / 101 * 100, 4)) < 1e-9
        && $precision['percentage'] === 0.0,
    'Grouped period weighting rounds each component to a whole percent and keeps the raw value'
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

// Combined periods round to a whole percent (.5 up) and keep the raw value for the hover steps.
$combinedPeriod = static fn(string $period, float $score): array => faculty_compute_period_result($pdo, [
    'componentMode' => 'combined',
    'assessments' => [$assessment(7100, 1701, $period, $score)],
    'attendanceDateRanges' => ['midterm' => ['startDate' => null, 'endDate' => null], 'final' => ['startDate' => null, 'endDate' => null]],
], $period, [[
    'category_id' => 1701,
    'name' => 'Quiz',
    'weight' => 100,
    'sort_order' => 1,
    'source_kind' => 'assessment',
]]);
$half = $combinedPeriod('Midterm', 74.5);
assert_grouped_grading(
    $half['percentage'] === 75.0 && faculty_percentage_to_gwa($half['percentage'], 'Midterm') === 3.0,
    '74.5 rounds up to 75 and converts to 3.0'
);
$noisy = $combinedPeriod('Midterm', 74.4999999999);
assert_grouped_grading($noisy['percentage'] === 75.0, 'Float noise cannot drop a half percent (74.4999999999 -> 75)');
$low = $combinedPeriod('Midterm', 70.0);
assert_grouped_grading(
    $low['percentage'] === 70.0 && faculty_percentage_to_gwa($low['percentage'], 'Midterm') === 5.0,
    'A Midterm of 70% is 5.0 (the old 3.1-4.0 band is removed)'
);
$unscored = faculty_compute_period_result($pdo, [
    'componentMode' => 'combined',
    'assessments' => [$assessment(7101, 1701, 'Midterm', 0, 100, false)],
    'attendanceDateRanges' => ['midterm' => ['startDate' => null, 'endDate' => null]],
], 'Midterm', [[
    'category_id' => 1701, 'name' => 'Quiz', 'weight' => 100, 'sort_order' => 1, 'source_kind' => 'assessment',
]]);
assert_grouped_grading($unscored['status'] === 'incomplete' && $unscored['percentage'] === null, 'A blank score keeps the grade incomplete');

// Golden example from the Dean's sample workbook. Items are transmuted 50-100%
// (score/max x 50 + 50); Recitation and Lab Performance are single items, max 100, transmutation off.
$goldenGroup = $periodGroup;
$goldenMemberships = static function (int $base): array {
    $m = static fn(int $c, string $n, float $w, string $comp): array => [
        'category_id' => $c, 'name' => $n, 'weight' => $w, 'sort_order' => $c, 'source_kind' => 'assessment', 'component' => $comp,
    ];
    return [
        $m($base + 1, 'Recitation', 10, 'Lecture'), $m($base + 2, 'Outputs', 20, 'Lecture'),
        $m($base + 3, 'Quizzes', 20, 'Lecture'), $m($base + 4, 'Major Exam', 50, 'Lecture'),
        $m($base + 5, 'Lab Performance', 10, 'Laboratory'), $m($base + 6, 'Lab Exercises', 30, 'Laboratory'),
        $m($base + 7, 'Quizzes', 10, 'Laboratory'), $m($base + 8, 'Practical Exam', 50, 'Laboratory'),
    ];
};
$goldenItems = static function (string $period, int $base, array $lec, array $lab): array {
    $id = $base * 100;
    $rows = [];
    foreach (array_merge($lec, $lab) as [$cat, $score, $max, $trans]) {
        $rows[] = [
            'assessment_id' => ++$id, 'grading_category_id' => $base + $cat, 'grading_period' => $period,
            'score' => (float) $score, 'max_score' => (float) $max, '_has_score' => true,
            'transmutation_enabled' => $trans, 'transmutation_minimum_percentage' => 50.0,
            'transmutation_maximum_percentage' => 100.0, 'linked_attendance_status' => null,
        ];
    }
    return $rows;
};
$midLec = [[1, 88, 100, false], [2, 34, 50, true], [3, 14, 20, true], [3, 20, 30, true], [4, 49, 75, true]];
$midLab = [[5, 0, 100, false], [6, 55, 56, true], [6, 45, 45, true], [6, 44, 50, true], [6, 41, 50, true], [6, 40, 50, true],
    [6, 22, 35, true], [7, 9, 15, true], [7, 2, 25, true], [8, 40, 50, true]];
$finLec = [[1, 90, 100, false], [2, 20, 20, true], [3, 8, 10, true], [3, 10, 25, true], [3, 12, 15, true], [4, 51, 60, true]];
$finLab = [[5, 92, 100, false], [6, 21, 25, true], [6, 20, 25, true], [6, 21, 25, true], [6, 23, 28, true], [6, 36, 44, true],
    [6, 20, 24, true], [6, 30, 36, true], [6, 17, 20, true], [6, 51, 55, true], [7, 15, 40, true], [8, 68, 115, true]];
$gMid = faculty_compute_period_result($pdo, $goldenGroup + ['assessments' => $goldenItems('Midterm', 10, $midLec, $midLab)], 'Midterm', $goldenMemberships(10));
$gFin = faculty_compute_period_result($pdo, $goldenGroup + ['assessments' => $goldenItems('Final', 20, $finLec, $finLab)], 'Final', $goldenMemberships(20));
$gc = static fn(array $r, string $k): array => $r['breakdown']['components'][$k];
assert_grouped_grading(
    $gc($gMid, 'lecture')['percentage'] === 84.0 && abs($gc($gMid, 'lecture')['rawPercentage'] - 83.7667) < 0.0001
        && $gc($gMid, 'laboratory')['percentage'] === 79.0 && abs($gc($gMid, 'laboratory')['rawPercentage'] - 79.4768) < 0.0001
        && $gMid['percentage'] === 82.0,
    'Golden Midterm: Lecture 83.7667 -> 84, Laboratory 79.4768 -> 79, period 82'
);
assert_grouped_grading(
    $gc($gFin, 'lecture')['percentage'] === 92.0 && abs($gc($gFin, 'lecture')['rawPercentage'] - 91.9167) < 0.0001
        && $gc($gFin, 'laboratory')['percentage'] === 83.0 && abs($gc($gFin, 'laboratory')['rawPercentage'] - 83.4635) < 0.0001
        && $gFin['percentage'] === 88.0,
    'Golden Final: Lecture 91.9167 -> 92, Laboratory 83.4635 -> 83, period 88'
);
$goldenCourse = faculty_round_percent(faculty_round_percent($gMid['percentage'] * 30 / 100) + faculty_round_percent($gFin['percentage'] * 70 / 100));
assert_grouped_grading(
    $goldenCourse === 87.0 && faculty_percentage_to_gwa($goldenCourse) === 2.2
        && faculty_percentage_to_gwa($gc($gMid, 'lecture')['percentage'], 'Midterm') === 2.5,
    'Golden course: round(24.6) + round(61.6) = 25 + 62 = 87 -> 2.2; Midterm Lecture 84 -> 2.5'
);

echo "ALL GROUPED GRADING TESTS PASSED.\n";
