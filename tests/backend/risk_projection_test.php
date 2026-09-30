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
assert_risk(($risk['level'] ?? null) === 'High' && ($risk['assumedAssessments'] ?? null) === 2, 'The worked example reaches 2.50 after 2 assumed assessments: High');

$single = [['kind' => 'assessment', 'weight' => 100.0, 'earned' => 100.0, 'possible' => 100.0]];
assert_risk(faculty_risk_level(static fn(int $n): ?float => faculty_risk_period_percentage($single, 100.0, $n)) === ['level' => 'At Risk', 'assumedAssessments' => 3], 'One perfect assessment reaches 2.50 after 3 assumed assessments: At Risk');

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

echo "ALL RISK PROJECTION TESTS PASSED.\n";
