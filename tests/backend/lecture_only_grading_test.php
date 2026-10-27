<?php

declare(strict_types=1);

// Lecture-only courses (docs/contracts/lecture-only-grading.md): structure from units, default template,
// category validation, grade math (one rounding, provisional L9) and the source contract of the guards.

require_once __DIR__ . '/../../backend/controllers/FacultyController.php';

function assert_lecture_only(bool $condition, string $label): void
{
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$label}\n");
        exit(1);
    }
    echo "PASS: {$label}\n";
}

class LectureOnlyNoQueryPDO extends PDO
{
    public function __construct() {}

    public function prepare(string $query, array $options = []): PDOStatement|false
    {
        throw new RuntimeException('Lecture-only unit fixtures must provide memberships.');
    }
}

// L1, L1a, L1b: units are the only source.
assert_lecture_only(faculty_course_structure(3.0, 0.0) === 'lecture', 'Lecture units with zero Laboratory units are lecture-only');
assert_lecture_only(faculty_course_structure('3.0', null) === 'lecture', 'Lecture units with no Laboratory units are lecture-only');
assert_lecture_only(faculty_course_structure(2.0, 1.0) === 'lecture_laboratory', 'Lecture and Laboratory units are Lecture + Laboratory');
assert_lecture_only(faculty_course_structure(null, null) === 'unrecorded', 'No recorded units is unrecorded');
assert_lecture_only(faculty_course_structure(0.0, 2.0) === 'lecture_laboratory', 'A Laboratory-only course keeps Lecture + Laboratory grading');
assert_lecture_only(faculty_course_structure(0.0, 0.0) === 'lecture_laboratory', 'Zero units on both sides is not lecture-only');

// L2: default template.
$defaults = faculty_grading_default_period_template('lecture');
$lectureRows = static fn(array $categories): array => array_map(
    static fn(array $c): array => [$c['name'], $c['weight'], $c['component']],
    $categories
);
$expected = [['Term Exam', 50, 'Lecture'], ['Quiz', 20, 'Lecture'], ['Outputs', 20, 'Lecture'], ['Participation', 10, 'Lecture']];
assert_lecture_only(
    $defaults['componentMode'] === 'lecture' && !array_key_exists('componentWeights', $defaults),
    'The lecture-only default has componentMode lecture and no componentWeights'
);
assert_lecture_only(
    $lectureRows($defaults['midtermCategories']) === $expected && $lectureRows($defaults['finalCategories']) === $expected,
    'The lecture-only default has only the four Lecture categories in each period'
);
assert_lecture_only($defaults['termRatio'] === ['midterm' => 50, 'final' => 50], 'The lecture-only default term split is 50/50');
assert_lecture_only(
    faculty_grading_default_period_template() === faculty_grading_default_period_template('lecture_laboratory')
        && faculty_grading_default_period_template()['componentMode'] === 'lecture_laboratory'
        && count(faculty_grading_default_period_template()['midtermCategories']) === 8,
    'The default for every other course is unchanged'
);

// L2/L3: save validation of the category lists.
assert_lecture_only(faculty_grading_normalize_component_mode('lecture') === 'lecture', 'componentMode lecture is accepted');
$lecturePeriod = faculty_grading_normalize_period_categories($defaults['midtermCategories'], 'Midterm', 'lecture');
assert_lecture_only(count($lecturePeriod) === 4 && $lecturePeriod[0]['component'] === 'Lecture', 'A Lecture-only list totaling 100% is accepted');
$rejects = [
    'a Laboratory category' => [
        ['name' => 'Quiz', 'weight' => 50, 'sortOrder' => 1, 'component' => 'Lecture'],
        ['name' => 'Quiz', 'weight' => 50, 'sortOrder' => 2, 'component' => 'Laboratory'],
    ],
    'a list under 100%' => [
        ['name' => 'Quiz', 'weight' => 60, 'sortOrder' => 1, 'component' => 'Lecture'],
    ],
    'a missing component' => [
        ['name' => 'Quiz', 'weight' => 100, 'sortOrder' => 1],
    ],
];
foreach ($rejects as $label => $categories) {
    try {
        faculty_grading_normalize_period_categories($categories, 'Midterm', 'lecture');
        assert_lecture_only(false, "Lecture-only rejects {$label}");
    } catch (FacultyGradingConfigurationException $e) {
        assert_lecture_only($e->statusCode === 422 && $e->errorCode === 'GRADING_COMPONENT_CATEGORY_INVALID', "Lecture-only rejects {$label}");
    }
}

// L4, worked example: Midterm 84, Final 92 -> 89.6 -> 90 -> 1.9; Lecture + Laboratory rounding gives 25 + 64 = 89.
$pdo = new LectureOnlyNoQueryPDO();
$assessment = static fn(int $id, int $categoryId, string $period, float $score, bool $hasScore = true): array => [
    'assessment_id' => $id, 'grading_category_id' => $categoryId, 'grading_period' => $period, 'score' => $score,
    'max_score' => 100.0, '_has_score' => $hasScore, 'transmutation_enabled' => false,
    'transmutation_minimum_percentage' => 50.0, 'transmutation_maximum_percentage' => 100.0,
    'linked_attendance_status' => null,
];
$membership = static fn(int $categoryId): array => [
    'category_id' => $categoryId, 'name' => 'Quiz', 'weight' => 100, 'sort_order' => 1,
    'source_kind' => 'assessment', 'component' => 'Lecture',
];
$group = [
    'componentMode' => 'lecture',
    'componentWeights' => ['lecture' => 100.0, 'laboratory' => null],
    'attendanceDateRanges' => [],
];
$midterm = faculty_compute_period_result($pdo, $group + ['assessments' => [$assessment(1, 11, 'Midterm', 84)]], 'Midterm', [$membership(11)]);
$final = faculty_compute_period_result($pdo, $group + ['assessments' => [$assessment(2, 12, 'Final', 92)]], 'Final', [$membership(12)]);
assert_lecture_only(
    $midterm['status'] === 'computed' && $midterm['percentage'] === 84.0 && $final['percentage'] === 92.0,
    'The lecture-only period grade is the Lecture period grade'
);
$breakdown = $midterm['breakdown'];
assert_lecture_only(
    array_keys($breakdown['components']) === ['lecture'] && $breakdown['componentWeights'] === ['lecture' => 100.0]
        && !str_contains(json_encode($breakdown), 'Laboratory'),
    'The lecture-only breakdown carries no Laboratory values'
);
$course = faculty_course_grade_percentage('lecture', 84.0, 92.0, 30.0, 70.0);
assert_lecture_only($course === 90.0 && faculty_percentage_to_gwa($course) === 1.9, 'Lecture-only course grade rounds once: 89.6 -> 90 -> 1.9');
assert_lecture_only(
    faculty_course_grade_percentage('lecture_laboratory', 84.0, 92.0, 30.0, 70.0) === 89.0,
    'Lecture + Laboratory keeps round(round() + round()): 25 + 64 = 89'
);
$blank = faculty_compute_period_result($pdo, $group + ['assessments' => [$assessment(3, 11, 'Midterm', 0, false)]], 'Midterm', [$membership(11)]);
assert_lecture_only($blank['status'] === 'incomplete' && $blank['percentage'] === null, 'A blank score keeps a lecture-only period incomplete');
assert_lecture_only(faculty_percentage_to_gwa(74.0) === 5.0, 'Below 75% stays 5.0');

// Source contract of the save, class-edit guard, import refusal and migration.
$root = __DIR__ . '/../../';
$controller = (string) file_get_contents($root . 'backend/controllers/FacultyController.php');
foreach ([
    "'GRADING_STRUCTURE_MISMATCH'",
    'This course is Lecture only. Save it without a Laboratory part.',
    'This course has Laboratory units. Add the Laboratory part before saving.',
    "'GRADING_LABORATORY_ASSESSMENTS_EXIST'",
    "'COURSE_LABORATORY_ASSESSMENTS_EXIST'",
    '%s (%s) has Laboratory assessments. Delete them in Grade Computation before removing Laboratory units.',
    "'courseStructure' => \$structure",
    "'courseUnits' => \$courseUnits",
] as $needle) {
    assert_lecture_only(str_contains($controller, $needle), "Controller carries: {$needle}");
}
$importStart = strpos($controller, 'function handle_faculty_grade_sheet_import');
$import = substr($controller, (int) $importStart, 8000);
assert_lecture_only(
    str_contains($import, "\$component === 'Laboratory' && (\$gradingConfig['component_mode'] ?? '') === 'lecture'"),
    'Grade sheet import refuses Laboratory items for a lecture-only configuration'
);
$guardAt = strpos($controller, "'COURSE_LABORATORY_ASSESSMENTS_EXIST'");
$updateAt = strpos($controller, "UPDATE courses SET lecture_units = ?, lab_units = ?, units", (int) $guardAt);
assert_lecture_only($guardAt !== false && $updateAt !== false, 'The Laboratory unit guard runs before the course units are saved');

$migration = (string) file_get_contents($root . 'database/migrations/051_lecture_only_grading.sql');
assert_lecture_only(
    str_contains($migration, "component_mode = 'lecture'")
        && str_contains($migration, 'component_lecture_weight = 100')
        && str_contains($migration, 'component_laboratory_weight IS NULL')
        && !preg_match('/\b(UPDATE|DELETE|INSERT)\b/i', $migration),
    'Migration 051 adds the lecture branch and changes no data'
);
