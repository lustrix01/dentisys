<?php

declare(strict_types=1);

require_once __DIR__ . '/../../backend/controllers/FacultyController.php';

function assert_midterm(bool $condition, string $label): void
{
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$label}\n");
        exit(1);
    }
    echo "PASS: {$label}\n";
}

$none = ['stage' => 'none'];
$complete = static fn(float $percentage): array => ['complete' => true, 'percentage' => $percentage];

assert_midterm(faculty_midterm_at_risk($complete(84.0), null, $none), '84% on a complete Midterm is At Risk');
assert_midterm(faculty_midterm_at_risk($complete(84.9), null, $none), '84.9% truncates to 84% and is At Risk');
assert_midterm(!faculty_midterm_at_risk($complete(85.0), null, $none), '85% is not flagged');
assert_midterm(!faculty_midterm_at_risk(['complete' => false, 'percentage' => 60.0], null, $none), 'An incomplete Midterm is never flagged');
assert_midterm(!faculty_midterm_at_risk(['complete' => true, 'percentage' => null], null, $none), 'No percentage is not flagged');
assert_midterm(!faculty_midterm_at_risk($complete(70.0), 2.0, $none), 'A final course grade ends the Midterm Watchlist');
assert_midterm(!faculty_midterm_at_risk($complete(70.0), null, ['stage' => 'attempt_1_pending']), 'A remedial record ends the Midterm Watchlist');
assert_midterm(!faculty_midterm_at_risk($complete(70.0), null, ['stage' => 'legacy_unclassified']), 'A legacy remedial record ends the Midterm Watchlist');
assert_midterm(faculty_midterm_at_risk($complete(70.0), null, []), 'No progression data means no remedial record');

echo "ALL MIDTERM AT RISK TESTS PASSED.\n";
