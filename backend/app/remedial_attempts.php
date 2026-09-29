<?php

declare(strict_types=1);

/**
 * Authoritative two-attempt remedial progression helpers.
 *
 * The legacy enrollment.remedial_state_json value is intentionally treated as
 * opaque current-state evidence. It is never parsed to invent attempt numbers;
 * an enrollment with only that legacy value is exposed as unclassified and
 * cannot start a new canonical sequence without reconciliation.
 */

/**
 * Decode enrollment.remedial_state_json as legacy remedial evidence.
 *
 * Earlier builds of the Faculty retention status override wrote only
 * {overrideReason, overriddenAt} into this column. That is not a remedial
 * record, so it must not mark the enrollment as legacy/unclassified (which
 * blocked remedial scheduling). Returns null when there is no legacy record.
 */
function remedial_state_json_legacy_payload(mixed $raw): ?array
{
    if ($raw === null || $raw === '' || $raw === false) {
        return null;
    }
    $decoded = json_decode((string) $raw, true);
    if (!is_array($decoded)) {
        return null;
    }
    $remedialKeys = array_diff(array_keys($decoded), ['overrideReason', 'overriddenAt']);
    return $remedialKeys === [] ? null : $decoded;
}

function remedial_state_json_is_legacy(mixed $raw): bool
{
    return remedial_state_json_legacy_payload($raw) !== null;
}

final class RemedialAttemptException extends RuntimeException
{
    public function __construct(
        string $message,
        private readonly int $statusCode,
        private readonly string $errorCode,
    ) {
        parent::__construct($message, $statusCode);
    }

    public function statusCode(): int
    {
        return $this->statusCode;
    }

    public function errorCode(): string
    {
        return $this->errorCode;
    }
}

function remedial_attempts_error(string $message, string $code, int $status = 422): RemedialAttemptException
{
    return new RemedialAttemptException($message, $status, $code);
}

function remedial_attempts_empty_progression(bool $legacyUnclassified = false): array
{
    return [
        'stage' => $legacyUnclassified ? 'legacy_unclassified' : 'none',
        'attempts' => [],
        'passedAttempt' => null,
        'legacyUnclassified' => $legacyUnclassified,
        'costRecovery' => null,
        'cleared' => false,
    ];
}

/**
 * Apply a recorded cost recovery result to a progression that required it.
 * Passing cost recovery clears the Student for the course; failing it is final.
 */
function remedial_attempts_apply_cost_recovery(array $progression, ?array $costRecoveryRow): array
{
    if ($costRecoveryRow === null || ($progression['stage'] ?? null) !== 'cost_recovery_required') {
        return $progression;
    }
    $outcome = (string) $costRecoveryRow['outcome'];
    $progression['stage'] = $outcome === 'passed' ? 'cost_recovery_passed' : 'cost_recovery_failed';
    $progression['costRecovery'] = [
        'finalGrade' => (float) $costRecoveryRow['final_grade'],
        'outcome' => $outcome,
        'recordedAt' => (string) ($costRecoveryRow['recorded_at'] ?? ''),
    ];
    $progression['cleared'] = $outcome === 'passed';
    return $progression;
}

/**
 * True when the Student has satisfied the retention policy for this course:
 * passed remedial attempt 1 or 2, or passed the cost recovery program.
 */
function remedial_progression_is_cleared(array $progression): bool
{
    return in_array($progression['stage'] ?? null, ['passed', 'cost_recovery_passed'], true);
}

/** Retention state shown to users for one enrollment (see SQL helper below). */
function retention_effective_state(string $storedState, array $progression): string
{
    return in_array($storedState, ['remedial', 'active'], true) && remedial_progression_is_cleared($progression)
        ? 'cleared'
        : $storedState;
}

/**
 * SQL for an enrollment's retention state as shown to users: a stored
 * 'remedial' (or plain 'active') state becomes 'cleared' once the policy is
 * satisfied. The
 * stored grade and state are unchanged (passing does not change grades).
 */
function retention_effective_state_sql(string $enrollmentAlias, string $stateExpression): string
{
    return "CASE WHEN {$stateExpression} IN ('remedial', 'active') AND (
                EXISTS (SELECT 1 FROM enrollment_remedial_attempts ra_clear
                         WHERE ra_clear.enrollment_id = {$enrollmentAlias}.enrollment_id AND ra_clear.outcome = 'passed')
                OR EXISTS (SELECT 1 FROM enrollment_cost_recovery cr_clear
                         WHERE cr_clear.enrollment_id = {$enrollmentAlias}.enrollment_id AND cr_clear.outcome = 'passed')
             ) THEN 'cleared' ELSE {$stateExpression} END";
}

/**
 * Load all attempt rows for a bounded enrollment set in one query.
 *
 * $legacyByEnrollment is supplied by the already-loaded enrollment rows so
 * callers do not need a query per enrollment merely to classify legacy data.
 */
function remedial_attempts_load(PDO $pdo, array $enrollmentIds, array $legacyByEnrollment = []): array
{
    $ids = [];
    foreach ($enrollmentIds as $enrollmentId) {
        $id = (int) $enrollmentId;
        if ($id > 0) {
            $ids[$id] = true;
        }
    }

    $result = [];
    foreach (array_keys($ids) as $id) {
        $result[$id] = remedial_attempts_empty_progression((bool) ($legacyByEnrollment[$id] ?? false));
    }
    if ($result === []) {
        return $result;
    }

    $placeholders = implode(',', array_fill(0, count($result), '?'));
    $stmt = $pdo->prepare(
        "SELECT remedial_attempt_id, enrollment_id, attempt_number, scheduled_date,
                percentage, outcome, actor_user_id, created_at, updated_at, notes
           FROM enrollment_remedial_attempts
          WHERE enrollment_id IN ({$placeholders})
          ORDER BY enrollment_id, attempt_number"
    );
    $stmt->execute(array_keys($result));
    $grouped = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $enrollmentId = (int) $row['enrollment_id'];
        if (isset($result[$enrollmentId])) {
            $grouped[$enrollmentId][] = $row;
        }
    }

    $costStmt = $pdo->prepare(
        "SELECT enrollment_id, final_grade, outcome, recorded_at
           FROM enrollment_cost_recovery
          WHERE enrollment_id IN ({$placeholders})"
    );
    $costStmt->execute(array_keys($result));
    $costByEnrollment = [];
    foreach ($costStmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $costByEnrollment[(int) $row['enrollment_id']] = $row;
    }

    foreach ($result as $enrollmentId => $_) {
        $progression = remedial_attempts_progression_from_rows(
            $grouped[$enrollmentId] ?? [],
            (bool) ($legacyByEnrollment[$enrollmentId] ?? false)
        );
        $result[$enrollmentId] = remedial_attempts_apply_cost_recovery(
            $progression,
            $costByEnrollment[$enrollmentId] ?? null
        );
    }

    return $result;
}

/**
 * Lock an enrollment's canonical attempts after the caller has begun a
 * transaction. The enrollment row must be locked by the caller first so all
 * writes for one progression serialize on the same parent row.
 */
function remedial_attempts_lock_rows(PDO $pdo, int $enrollmentId): array
{
    $stmt = $pdo->prepare(
        'SELECT remedial_attempt_id, enrollment_id, attempt_number, scheduled_date,
                percentage, outcome, actor_user_id, created_at, updated_at, notes
           FROM enrollment_remedial_attempts
          WHERE enrollment_id = ?
          ORDER BY attempt_number
          FOR UPDATE'
    );
    $stmt->execute([$enrollmentId]);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

function remedial_attempts_progression_from_rows(array $rows, bool $legacyUnclassified = false): array
{
    if ($rows === []) {
        return remedial_attempts_empty_progression($legacyUnclassified);
    }

    $attempts = [];
    $numbers = [];
    foreach ($rows as $row) {
        $number = (int) ($row['attempt_number'] ?? 0);
        $outcome = (string) ($row['outcome'] ?? '');
        if (!in_array($number, [1, 2], true) || in_array($number, $numbers, true)) {
            return remedial_attempts_empty_progression(true);
        }
        if (!in_array($outcome, ['pending', 'passed', 'failed'], true)) {
            return remedial_attempts_empty_progression(true);
        }
        if ($outcome === 'pending' && $row['percentage'] !== null) {
            return remedial_attempts_empty_progression(true);
        }
        if ($outcome !== 'pending' && $row['percentage'] === null) {
            return remedial_attempts_empty_progression(true);
        }

        $numbers[] = $number;
        $attempts[] = [
            'attemptNumber' => $number,
            'scheduledDate' => $row['scheduled_date'] !== null ? (string) $row['scheduled_date'] : null,
            'percentage' => $row['percentage'] !== null ? (float) $row['percentage'] : null,
            'outcome' => $outcome,
            // `status` keeps the existing Retention UI/readers compatible;
            // `outcome` is the canonical database-derived field.
            'status' => $outcome,
            'actorUserId' => $row['actor_user_id'] !== null ? (string) $row['actor_user_id'] : null,
            'notes' => isset($row['notes']) && $row['notes'] !== '' ? (string) $row['notes'] : null,
            'createdAt' => (string) ($row['created_at'] ?? ''),
            'updatedAt' => (string) ($row['updated_at'] ?? ''),
        ];
    }

    usort($attempts, static fn(array $left, array $right): int => $left['attemptNumber'] <=> $right['attemptNumber']);
    if (($attempts[0]['attemptNumber'] ?? null) !== 1) {
        return remedial_attempts_empty_progression(true);
    }

    $first = $attempts[0];
    if (count($attempts) === 2) {
        $second = $attempts[1];
        if ($second['attemptNumber'] !== 2 || $first['outcome'] !== 'failed') {
            return remedial_attempts_empty_progression(true);
        }
    }

    if ($first['outcome'] === 'pending') {
        if (count($attempts) !== 1) {
            return remedial_attempts_empty_progression(true);
        }
        $stage = 'attempt_1_pending';
        $passedAttempt = null;
    } elseif ($first['outcome'] === 'passed') {
        if (count($attempts) !== 1) {
            return remedial_attempts_empty_progression(true);
        }
        $stage = 'passed';
        $passedAttempt = 1;
    } elseif (count($attempts) === 1) {
        $stage = 'attempt_2_available';
        $passedAttempt = null;
    } else {
        $second = $attempts[1];
        if ($second['outcome'] === 'pending') {
            $stage = 'attempt_2_pending';
            $passedAttempt = null;
        } elseif ($second['outcome'] === 'passed') {
            $stage = 'passed';
            $passedAttempt = 2;
        } else {
            $stage = 'cost_recovery_required';
            $passedAttempt = null;
        }
    }

    return [
        'stage' => $stage,
        'attempts' => $attempts,
        'passedAttempt' => $passedAttempt,
        'legacyUnclassified' => false,
        'costRecovery' => null,
        'cleared' => $stage === 'passed',
    ];
}

function remedial_attempts_parse_request(array $data): array
{
    $enrollmentId = $data['enrollmentId'] ?? null;
    if (is_string($enrollmentId) && ctype_digit(trim($enrollmentId))) {
        $enrollmentId = (int) trim($enrollmentId);
    }
    if (!is_int($enrollmentId) || $enrollmentId <= 0) {
        throw remedial_attempts_error('A valid enrollmentId is required.', 'REMEDIAL_ENROLLMENT_REQUIRED');
    }

    $attemptNumber = $data['attemptNumber'] ?? null;
    if (is_string($attemptNumber) && ctype_digit(trim($attemptNumber))) {
        $attemptNumber = (int) trim($attemptNumber);
    }
    if (!is_int($attemptNumber) || !in_array($attemptNumber, [1, 2], true)) {
        throw remedial_attempts_error(
            'Only remedial attempts 1 and 2 are supported.',
            'REMEDIAL_ATTEMPT_UNSUPPORTED'
        );
    }

    $hasPercentage = array_key_exists('percentage', $data) && $data['percentage'] !== null;
    $percentage = null;
    if ($hasPercentage) {
        $raw = $data['percentage'];
        if (is_string($raw)) {
            $raw = trim($raw);
            if ($raw === '') {
                throw remedial_attempts_error(
                    'Enter a percentage score before recording a remedial result.',
                    'REMEDIAL_SCORE_REQUIRED'
                );
            }
        }
        if (is_bool($raw) || is_array($raw) || is_object($raw) || !is_numeric($raw)) {
            throw remedial_attempts_error(
                'percentage must be a finite number from 0 to 100.',
                'REMEDIAL_SCORE_INVALID'
            );
        }
        $percentage = (float) $raw;
        if (!is_finite($percentage)) {
            throw remedial_attempts_error(
                'percentage must be a finite number from 0 to 100.',
                'REMEDIAL_SCORE_INVALID'
            );
        }
        if ($percentage < 0 || $percentage > 100) {
            throw remedial_attempts_error(
                'percentage must be a finite number from 0 to 100.',
                'REMEDIAL_SCORE_RANGE'
            );
        }
        // The additive relation stores percentage at two decimal places. Make
        // the derived outcome agree with the value that PostgreSQL persists.
        $percentage = round($percentage, 2);
    }

    $scheduledDate = null;
    if (array_key_exists('scheduledDate', $data) && $data['scheduledDate'] !== null) {
        if (!is_string($data['scheduledDate'])) {
            throw remedial_attempts_error('scheduledDate must be an ISO date.', 'REMEDIAL_SCHEDULED_DATE_INVALID');
        }
        $scheduledDate = trim($data['scheduledDate']);
        if ($scheduledDate === '') {
            $scheduledDate = null;
        } else {
            $date = \DateTimeImmutable::createFromFormat('!Y-m-d', $scheduledDate);
            $dateErrors = \DateTimeImmutable::getLastErrors();
            if ($date === false || ($dateErrors !== false && ($dateErrors['warning_count'] > 0 || $dateErrors['error_count'] > 0)) || $date->format('Y-m-d') !== $scheduledDate) {
                throw remedial_attempts_error('scheduledDate must be an ISO date.', 'REMEDIAL_SCHEDULED_DATE_INVALID');
            }
        }
    }

    // Optional Faculty notes; an omitted field keeps the stored notes.
    $hasNotes = array_key_exists('notes', $data);
    $notes = null;
    if ($hasNotes && $data['notes'] !== null) {
        if (!is_string($data['notes'])) {
            throw remedial_attempts_error('Notes must be text.', 'REMEDIAL_NOTES_INVALID');
        }
        $notes = trim($data['notes']);
        if (mb_strlen($notes) > 500) {
            throw remedial_attempts_error('Notes must not exceed 500 characters.', 'REMEDIAL_NOTES_INVALID');
        }
        if ($notes === '') {
            $notes = null;
        }
    }

    return [
        'enrollmentId' => $enrollmentId,
        'attemptNumber' => $attemptNumber,
        'scheduledDate' => $scheduledDate,
        'hasPercentage' => $hasPercentage,
        'percentage' => $percentage,
        'hasNotes' => $hasNotes,
        'notes' => $notes,
    ];
}

/**
 * College policy: a course GWA of 2.5 or worse (2.5 to 5.0) triggers remedial;
 * 1.0 up to (but not including) 2.5 is passing. The trigger is fixed and is no
 * longer an Admin setting.
 */
const RETENTION_GWA_TRIGGER = 2.5;

function remedial_attempts_course_grade_threshold(?PDO $pdo = null): float
{
    return RETENTION_GWA_TRIGGER;
}

function remedial_attempts_error_response(RemedialAttemptException $exception): void
{
    emit_response(build_error_response(
        $exception->getMessage(),
        $exception->statusCode(),
        $exception->errorCode()
    ));
}
