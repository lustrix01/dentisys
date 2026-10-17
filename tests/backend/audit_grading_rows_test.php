<?php

declare(strict_types=1);

require_once __DIR__ . '/../../backend/controllers/FacultyController.php';

function assert_audit_grading(bool $condition, string $label): void
{
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$label}\n");
        exit(1);
    }
    echo "PASS: {$label}\n";
}

$group = [
    'studentId' => '7',
    'persistedPercentage' => 80.0,
    'persistedBreakdown' => ['periods' => ['midterm' => ['percentage' => 82.5], 'final' => ['percentage' => null]]],
];

$moves = faculty_grade_moves($group, 84.0, 76.0, 80.0);
assert_audit_grading(
    $moves === [
        ['studentId' => '7', 'period' => 'Midterm', 'before' => '82.50', 'after' => '84.00'],
        ['studentId' => '7', 'period' => 'Final', 'before' => null, 'after' => '76.00'],
    ],
    'Only period grades that moved are listed, as two-decimal strings'
);
assert_audit_grading(faculty_grade_moves($group, 82.5, null, 80.0) === [], 'An unchanged recompute lists no grade');
assert_audit_grading(
    faculty_grade_moves($group + [], null, null, 81.0) === [['studentId' => '7', 'period' => 'Course grade', 'before' => '80.00', 'after' => '81.00']],
    'A single-schema class lists only the course grade'
);

$cells = [
    ['studentId' => '1', 'assessmentId' => '10', 'assessment' => 'Midterm', 'field' => 'score', 'before' => '5.00', 'after' => '6.00'],
    ['studentId' => '1', 'assessmentId' => '10', 'assessment' => 'Midterm', 'field' => 'remarks', 'before' => null, 'after' => 'late'],
    ['studentId' => '2', 'assessmentId' => '10', 'assessment' => 'Midterm', 'field' => 'score', 'before' => '9.00', 'after' => null],
];
assert_audit_grading(
    faculty_scores_audit_description($cells, 1, 'DENT 101-A') === 'Changed 2 scores and 1 remark in Midterm · DENT 101-A; 1 grade moved.',
    'The score row description is readable and counts grade moves'
);
$cells[2]['assessmentId'] = '11';
assert_audit_grading(
    str_contains(faculty_scores_audit_description($cells, 0, 'DENT 101-A'), 'in 2 assessments · DENT 101-A.'),
    'A matrix save describes several assessments in one sentence'
);
assert_audit_grading(faculty_grade_text(null) === null && faculty_grade_text('5') === '5.00', 'Grade values are strings or null (audit state holds no floats)');
assert_audit_grading(
    faculty_scores_audit_description([], 1, 'DENT 101-A', ['10' => 'Midterm']) === 'No score changed in Midterm · DENT 101-A; 1 grade moved.',
    'A grade-only change is described without score counts'
);
