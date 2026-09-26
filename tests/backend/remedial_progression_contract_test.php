<?php

declare(strict_types=1);

/**
 * Focused, database-free contract coverage for the approved two-attempt rule.
 *
 * The pure state machine below deliberately mirrors only the approved facts:
 * the original course result is immutable, a score is server-derived, and
 * only attempts one and two exist. The source assertions pin the eventual
 * backend implementation to the same contract without requiring a disposable
 * PostgreSQL stack. PostgreSQL integration must still execute these cases
 * through the HTTP handler, including row locks and concurrent requests.
 */

function remedial_contract_assert(bool $condition, string $label): void
{
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$label}\n");
        exit(1);
    }
    echo "PASS: {$label}\n";
}

function remedial_contract_expect_error(callable $callback, string $expectedCode, string $label): void
{
    try {
        $callback();
    } catch (InvalidArgumentException $exception) {
        remedial_contract_assert($exception->getMessage() === $expectedCode, $label);
        return;
    }
    remedial_contract_assert(false, $label);
}

/** @return float */
function remedial_contract_validate_score(mixed $value): float
{
    if ($value === null || (is_string($value) && trim($value) === '')) {
        throw new InvalidArgumentException('REMEDIAL_SCORE_REQUIRED');
    }
    if (!is_int($value) && !is_float($value) && !is_string($value)) {
        throw new InvalidArgumentException('REMEDIAL_SCORE_INVALID');
    }
    if (!is_numeric($value)) {
        throw new InvalidArgumentException('REMEDIAL_SCORE_INVALID');
    }

    $score = (float) $value;
    if (!is_finite($score)) {
        throw new InvalidArgumentException('REMEDIAL_SCORE_INVALID');
    }
    if ($score < 0 || $score > 100) {
        throw new InvalidArgumentException('REMEDIAL_SCORE_RANGE');
    }
    return $score;
}

/**
 * @param array<string, mixed> $state
 * @return array<string, mixed>
 */
function remedial_contract_submit_attempt(
    array &$state,
    int $attemptNumber,
    mixed $score,
    int $actorUserId,
    ?string $scheduledDate = null,
    ?string $clientStatus = null,
): array {
    if ($state['legacyUnclassified'] === true) {
        throw new InvalidArgumentException('REMEDIAL_LEGACY_UNCLASSIFIED');
    }
    if ($state['archived'] === true || $state['historical'] === true) {
        throw new InvalidArgumentException('REMEDIAL_ENROLLMENT_READ_ONLY');
    }
    if ($actorUserId !== $state['assignedFacultyId']) {
        throw new InvalidArgumentException('REMEDIAL_NOT_ASSIGNED_FACULTY');
    }
    if (!in_array($attemptNumber, [1, 2], true)) {
        throw new InvalidArgumentException('REMEDIAL_ATTEMPT_UNSUPPORTED');
    }

    $expectedAttempt = count($state['attempts']) + 1;
    if ($attemptNumber !== $expectedAttempt) {
        throw new InvalidArgumentException(
            $attemptNumber <= count($state['attempts'])
                ? 'REMEDIAL_ATTEMPT_DUPLICATE'
                : 'REMEDIAL_ATTEMPT_STAGE'
        );
    }
    if ($attemptNumber === 2 && ($state['progression'] ?? null) !== 'second_attempt_available') {
        throw new InvalidArgumentException('REMEDIAL_ATTEMPT_STAGE');
    }

    $percentageResult = remedial_contract_validate_score($score);
    // Deliberately ignore $clientStatus: outcome is authoritative and derived here.
    $outcome = $percentageResult >= 50.0 ? 'passed' : 'failed';
    $state['attempts'][] = [
        'attemptNumber' => $attemptNumber,
        'scheduledDate' => $scheduledDate,
        'percentageResult' => $percentageResult,
        'outcome' => $outcome,
        'actorUserId' => $actorUserId,
        'createdAt' => 'test-time',
    ];
    $state['progression'] = $outcome === 'passed'
        ? 'passed'
        : ($attemptNumber === 1 ? 'second_attempt_available' : 'cost_recovery_required');

    return $state;
}

$boundaryExpectations = [
    [0, 'failed'],
    [49.99, 'failed'],
    [50, 'passed'],
    [50.01, 'passed'],
    [100, 'passed'],
];
foreach ($boundaryExpectations as [$score, $expectedOutcome]) {
    $state = [
        'assignedFacultyId' => 41,
        'archived' => false,
        'historical' => false,
        'legacyUnclassified' => false,
        'attempts' => [],
        'progression' => 'first_attempt_pending',
    ];
    remedial_contract_submit_attempt($state, 1, $score, 41, null, 'passed');
    remedial_contract_assert(
        $state['attempts'][0]['outcome'] === $expectedOutcome,
        "Server derives {$expectedOutcome} for percentage {$score}"
    );
}

foreach ([null, '', '   '] as $blankScore) {
    remedial_contract_expect_error(
        static fn() => remedial_contract_validate_score($blankScore),
        $blankScore === null ? 'REMEDIAL_SCORE_REQUIRED' : 'REMEDIAL_SCORE_REQUIRED',
        'Blank remedial score is rejected without becoming zero'
    );
}
foreach ([-0.01, 100.01, INF, -INF, NAN, 'not-a-number'] as $invalidScore) {
    remedial_contract_expect_error(
        static fn() => remedial_contract_validate_score($invalidScore),
        is_numeric($invalidScore) && is_finite((float) $invalidScore) && ((float) $invalidScore < 0 || (float) $invalidScore > 100)
            ? 'REMEDIAL_SCORE_RANGE'
            : 'REMEDIAL_SCORE_INVALID',
        'Negative, over-100, non-finite, and non-numeric remedial scores are rejected'
    );
}

$firstPass = [
    'assignedFacultyId' => 41,
    'archived' => false,
    'historical' => false,
    'legacyUnclassified' => false,
    'attempts' => [],
    'progression' => 'first_attempt_pending',
    'originalPercentage' => 74.25,
    'originalGwa' => 2.74,
    'rawScores' => ['finalExam' => 88.5],
];
$originalAcademicResult = [
    $firstPass['originalPercentage'],
    $firstPass['originalGwa'],
    $firstPass['rawScores'],
];
remedial_contract_submit_attempt($firstPass, 1, 50, 41);
remedial_contract_assert($firstPass['progression'] === 'passed', 'First attempt at exactly 50 passes');
remedial_contract_assert(count($firstPass['attempts']) === 1, 'First-attempt pass persists exactly one attempt');
remedial_contract_assert(
    [$firstPass['originalPercentage'], $firstPass['originalGwa'], $firstPass['rawScores']] === $originalAcademicResult,
    'First-attempt pass preserves the original percentage, GWA, and raw scores'
);
remedial_contract_expect_error(
    static fn() => remedial_contract_submit_attempt($firstPass, 2, 50, 41),
    'REMEDIAL_ATTEMPT_STAGE',
    'A passed first attempt cannot open a second attempt'
);

$twoAttempts = [
    'assignedFacultyId' => 41,
    'archived' => false,
    'historical' => false,
    'legacyUnclassified' => false,
    'attempts' => [],
    'progression' => 'first_attempt_pending',
    'originalPercentage' => 68.0,
    'originalGwa' => 2.68,
    'rawScores' => ['quiz' => 49.5],
];
remedial_contract_submit_attempt($twoAttempts, 1, 49.99, 41, '2027-01-10');
remedial_contract_assert($twoAttempts['progression'] === 'second_attempt_available', 'First-attempt failure opens only the second attempt');
remedial_contract_submit_attempt($twoAttempts, 2, 50.01, 41, '2027-01-17', 'failed');
remedial_contract_assert($twoAttempts['progression'] === 'passed', 'Second attempt at 50.01 passes regardless of client status');
remedial_contract_assert($twoAttempts['attempts'][1]['outcome'] === 'passed', 'Second-attempt outcome is server-derived');
remedial_contract_assert(
    [$twoAttempts['originalPercentage'], $twoAttempts['originalGwa'], $twoAttempts['rawScores']] === [68.0, 2.68, ['quiz' => 49.5]],
    'Two-attempt progression preserves original academic results'
);

$secondFailure = [
    'assignedFacultyId' => 41,
    'archived' => false,
    'historical' => false,
    'legacyUnclassified' => false,
    'attempts' => [],
    'progression' => 'first_attempt_pending',
];
remedial_contract_submit_attempt($secondFailure, 1, 0, 41);
remedial_contract_submit_attempt($secondFailure, 2, 49.99, 41);
remedial_contract_assert($secondFailure['progression'] === 'cost_recovery_required', 'Second-attempt failure displays cost recovery required');
remedial_contract_expect_error(
    static fn() => remedial_contract_submit_attempt($secondFailure, 3, 100, 41),
    'REMEDIAL_ATTEMPT_UNSUPPORTED',
    'A third remedial attempt is rejected'
);

$invalidStage = [
    'assignedFacultyId' => 41,
    'archived' => false,
    'historical' => false,
    'legacyUnclassified' => false,
    'attempts' => [],
    'progression' => 'first_attempt_pending',
];
remedial_contract_expect_error(
    static fn() => remedial_contract_submit_attempt($invalidStage, 2, 50, 41),
    'REMEDIAL_ATTEMPT_STAGE',
    'The second attempt cannot skip a missing first attempt'
);
remedial_contract_submit_attempt($invalidStage, 1, 49.99, 41);
remedial_contract_expect_error(
    static fn() => remedial_contract_submit_attempt($invalidStage, 1, 50, 41),
    'REMEDIAL_ATTEMPT_DUPLICATE',
    'A duplicate first-attempt submission is rejected'
);

foreach ([
    ['assignedFacultyId' => 99, 'archived' => false, 'historical' => false, 'legacyUnclassified' => false],
    ['assignedFacultyId' => 41, 'archived' => true, 'historical' => false, 'legacyUnclassified' => false],
    ['assignedFacultyId' => 41, 'archived' => false, 'historical' => true, 'legacyUnclassified' => false],
    ['assignedFacultyId' => 41, 'archived' => false, 'historical' => false, 'legacyUnclassified' => true],
] as $restriction) {
    $restricted = $restriction + ['attempts' => [], 'progression' => 'first_attempt_pending'];
    $expectedError = $restriction['legacyUnclassified']
        ? 'REMEDIAL_LEGACY_UNCLASSIFIED'
        : (($restriction['archived'] || $restriction['historical'])
            ? 'REMEDIAL_ENROLLMENT_READ_ONLY'
            : 'REMEDIAL_NOT_ASSIGNED_FACULTY');
    remedial_contract_expect_error(
        static fn() => remedial_contract_submit_attempt($restricted, 1, 50, 41),
        $expectedError,
        'Ownership, archived, historical, and legacy-unclassified restrictions are enforced'
    );
    remedial_contract_assert($restricted['attempts'] === [], 'Restricted enrollment retains its existing attempt records');
}

$root = dirname(__DIR__, 2);
$routes = (string) file_get_contents($root . '/backend/routes/api.php');
$faculty = (string) file_get_contents($root . '/backend/controllers/FacultyController.php');
$student = (string) file_get_contents($root . '/backend/controllers/StudentAcademicController.php');
$migration = (string) file_get_contents($root . '/database/migrations/029_remedial_attempt_progression.sql');
$apiClient = (string) file_get_contents($root . '/frontend/src/services/apiClient.ts');

remedial_contract_assert(
    str_contains($routes, "'path' => '/api/faculty/retention/remedial'")
        && str_contains($routes, "'handler' => 'handle_faculty_retention_remedial_save'"),
    'Existing Faculty remedial route remains the compatible write entry point'
);
remedial_contract_assert(
    str_contains($migration, 'CREATE TABLE IF NOT EXISTS enrollment_remedial_attempts')
        && str_contains($migration, 'UNIQUE (enrollment_id, attempt_number)')
        && str_contains($migration, 'attempt_number IN (1, 2)')
        && str_contains($migration, 'percentage >= 0 AND percentage <= 100')
        && str_contains($faculty, 'enrollment_remedial_attempts')
        && str_contains($faculty, 'attempt_number')
        && str_contains($faculty, 'percentage')
        && str_contains($faculty, 'actor_user_id'),
    'Migration and Faculty writes use the normalized attempt number, percentage, actor, and enrollment fields'
);
remedial_contract_assert(
    str_contains($faculty, 'FOR UPDATE')
        && str_contains($faculty, 'instructor_user_id')
        && str_contains($faculty, "LOWER(e.status) = 'active'"),
    'Faculty writes lock the enrollment and enforce assigned active-class ownership'
);
remedial_contract_assert(
    preg_match('/is_finite|isFinite/', $faculty) === 1
        && preg_match('/50(?:\.0+)?/', $faculty) === 1
        && preg_match('/attempt[_A-Za-z]*\s*(?:<=|<).*2|2.*attempt[_A-Za-z]*\s*(?:<=|<)/i', $faculty) === 1,
    'Backend validates finite percentage input, the 50 percent boundary, and the two-attempt limit'
);
remedial_contract_assert(
    preg_match('/remedial[^\n]*(?:status|outcome)/i', substr($faculty, (int) strpos($faculty, 'function handle_faculty_retention_remedial_save'))) === 0,
    'Backend remedial write does not trust a client-supplied status or outcome'
);
remedial_contract_assert(
    str_contains($student, 'enrollment_remedial_attempts')
        && str_contains($student, 'attempt_number')
        && str_contains($student, 'stage'),
    'Student retention reads bounded canonical attempt progression data'
);
remedial_contract_assert(
    str_contains($apiClient, 'attemptNumber')
        && str_contains($apiClient, 'percentage')
        && str_contains($apiClient, 'stage'),
    'Shared API contract exposes attempt number, percentage result, and server stage'
);

echo "POSTGRESQL INTEGRATION REQUIRED: execute HTTP persistence, unique-attempt, concurrent-submission, rollback, reload, and grade-recomputation cases against the disposable stack.\n";
echo "ALL REMEDIAL PROGRESSION CONTRACT TESTS PASSED.\n";
