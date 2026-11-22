<?php

declare(strict_types=1);

require_once __DIR__ . '/notifications.php';
require_once __DIR__ . '/remedial_attempts.php';

/** Format a stored timestamp as ISO-8601 in Asia/Manila without depending on controller load order. */
function grade_release_format_time(?string $value): ?string
{
    if ($value === null || trim($value) === '') {
        return null;
    }
    return (new DateTimeImmutable($value))->setTimezone(new DateTimeZone('Asia/Manila'))->format('c');
}

/**
 * Format a GWA to the display form used in student notifications (e.g. 2.50 -> 2.5, 2.25 -> 2.25).
 */
function grade_release_format_gwa(float $gwa): string
{
    return (string) preg_replace('/0$/', '', number_format($gwa, 2, '.', ''));
}

/**
 * Decode class_sections.midterm_published_snapshot into the canonical snapshot shape.
 *
 * @return array{version: int, entries: array<string, array{percentage: float, rawPercentage: ?float, gwa: float, isAtRisk: bool, gradedCount: int, totalCount: int, components: array}>}
 */
function grade_release_parse_midterm_snapshot(mixed $json): array
{
    $empty = ['version' => 1, 'entries' => []];
    if ($json === null || $json === '' || $json === false) {
        return $empty;
    }
    $decoded = is_array($json) ? $json : json_decode((string) $json, true);
    if (!is_array($decoded) || !is_array($decoded['entries'] ?? null)) {
        return $empty;
    }

    $entries = [];
    foreach ($decoded['entries'] as $enrollmentId => $entry) {
        if (!is_array($entry)) {
            continue;
        }
        $key = (string) $enrollmentId;
        if ($key === '' || !isset($entry['percentage']) || !is_numeric($entry['percentage']) || !isset($entry['gwa']) || !is_numeric($entry['gwa'])) {
            continue;
        }
        $entries[$key] = [
            'percentage' => (float) $entry['percentage'],
            'rawPercentage' => isset($entry['rawPercentage']) && is_numeric($entry['rawPercentage']) ? (float) $entry['rawPercentage'] : null,
            'gwa' => (float) $entry['gwa'],
            'isAtRisk' => (bool) ($entry['isAtRisk'] ?? false),
            'gradedCount' => (int) ($entry['gradedCount'] ?? 0),
            'totalCount' => (int) ($entry['totalCount'] ?? 0),
            'components' => is_array($entry['components'] ?? null) ? $entry['components'] : [],
        ];
    }

    return ['version' => 1, 'entries' => $entries];
}

/**
 * Read one enrollment's externally visible Midterm state from the class's published snapshot.
 *
 * @return array{published: bool, complete: bool, percentage: ?float, rawPercentage: ?float, gwa: ?float, isAtRisk: bool, gradedCount: int, totalCount: int, components: array}
 */
function grade_release_midterm_entry_from_snapshot(array $classRow, int $enrollmentId, ?PDO $pdo = null, ?array &$readCache = null): array
{
    $unpublished = [
        'published' => false,
        'complete' => false,
        'percentage' => null,
        'rawPercentage' => null,
        'gwa' => null,
        'isAtRisk' => false,
        'gradedCount' => 0,
        'totalCount' => 0,
        'components' => [],
    ];
    if (($classRow['grades_submitted_at'] ?? null) !== null || ($classRow['midterm_published_at'] ?? null) === null) {
        return $unpublished;
    }

    $rawSnapshot = $classRow['midterm_published_snapshot'] ?? null;
    if ($rawSnapshot !== null && $rawSnapshot !== '') {
        $snapshot = grade_release_parse_midterm_snapshot($rawSnapshot);
        $key = (string) $enrollmentId;
        if (isset($snapshot['entries'][$key])) {
            $entry = $snapshot['entries'][$key];
            return [
                'published' => true,
                'complete' => true,
                'percentage' => $entry['percentage'],
                'rawPercentage' => $entry['rawPercentage'],
                'gwa' => $entry['gwa'],
                'isAtRisk' => $entry['isAtRisk'],
                'gradedCount' => $entry['gradedCount'],
                'totalCount' => $entry['totalCount'],
                'components' => $entry['components'],
            ];
        }
        return [
            'published' => true,
            'complete' => false,
            'percentage' => null,
            'rawPercentage' => null,
            'gwa' => null,
            'isAtRisk' => false,
            'gradedCount' => 0,
            'totalCount' => 0,
            'components' => [],
        ];
    }

    if ($pdo !== null && function_exists('faculty_watchlist_midterm')) {
        $readCache ??= [];
        $enrollment = array_merge($classRow, ['enrollment_id' => $enrollmentId]);
        if (!isset($enrollment['student_id']) || !isset($enrollment['cs_id'])) {
            $lookup = $pdo->prepare('SELECT student_id, cs_id FROM enrollments WHERE enrollment_id = ?');
            $lookup->execute([$enrollmentId]);
            $found = $lookup->fetch(PDO::FETCH_ASSOC);
            if (is_array($found)) {
                $enrollment = array_merge($enrollment, $found);
            }
        }
        if (isset($enrollment['student_id'], $enrollment['cs_id'])) {
            $midterm = faculty_watchlist_midterm($pdo, $enrollment, $readCache, true);
            $complete = (bool) ($midterm['complete'] ?? false);
            $percentage = isset($midterm['percentage']) && $midterm['percentage'] !== null ? (float) $midterm['percentage'] : null;
            $gwa = null;
            if ($percentage !== null && function_exists('faculty_percentage_to_gwa_exact')) {
                $gwa = round(faculty_percentage_to_gwa_exact($percentage, 'Midterm'), 2);
            }
            $threshold = defined('RETENTION_GWA_TRIGGER') ? RETENTION_GWA_TRIGGER : 2.5;
            return [
                'published' => true,
                'complete' => $complete,
                'percentage' => $percentage,
                'rawPercentage' => isset($midterm['rawPercentage']) && $midterm['rawPercentage'] !== null ? (float) $midterm['rawPercentage'] : null,
                'gwa' => $gwa,
                'isAtRisk' => $complete && $gwa !== null && $gwa >= $threshold,
                'gradedCount' => (int) ($midterm['gradedCount'] ?? 0),
                'totalCount' => (int) ($midterm['totalCount'] ?? 0),
                'components' => is_array($midterm['components'] ?? null) ? $midterm['components'] : [],
            ];
        }
    }

    return [
        'published' => true,
        'complete' => false,
        'percentage' => null,
        'rawPercentage' => null,
        'gwa' => null,
        'isAtRisk' => false,
        'gradedCount' => 0,
        'totalCount' => 0,
        'components' => [],
    ];
}

function grade_release_has_open_batch(PDO $pdo, int $csId): bool
{
    $stmt = $pdo->prepare("SELECT 1 FROM grade_change_batches WHERE cs_id = ? AND status IN ('draft', 'pending') LIMIT 1");
    $stmt->execute([$csId]);
    return $stmt->fetchColumn() !== false;
}

/**
 * Send a remedial_assignment in-app notification only on an actual state transition
 * into or out of Remedial (2.5-4.9). Idempotent across Withdraw -> Re-submit.
 */
function grade_release_notify_remedial_transition(PDO $pdo, int $enrollmentId, ?float $gwa, string $effectiveRetentionState): void
{
    $stmt = $pdo->prepare(
        "SELECT c.course_code, cs.cs_name, ua.user_id AS recipient_user_id
           FROM enrollments e
           JOIN class_sections cs ON cs.cs_id = e.cs_id
           JOIN courses c ON c.course_id = cs.course_id
           JOIN students s ON s.student_id = e.student_id
           JOIN user_accounts ua ON ua.user_id = COALESCE(s.student_account_user_id, s.user_id)
          WHERE e.enrollment_id = ?
            AND LOWER(ua.status) = 'active'
          LIMIT 1"
    );
    $stmt->execute([$enrollmentId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!is_array($row)) {
        return;
    }

    $recipientUserId = (int) $row['recipient_user_id'];
    if ($recipientUserId <= 0) {
        return;
    }

    $threshold = defined('RETENTION_GWA_TRIGGER') ? RETENTION_GWA_TRIGGER : 2.5;
    $gradeNeedsRemedial = $gwa !== null && is_finite($gwa) && $gwa >= $threshold && $gwa < 5.0;
    if ($gradeNeedsRemedial && strtolower($effectiveRetentionState) === 'cleared') {
        return;
    }
    $isRemedial = $gradeNeedsRemedial && strtolower($effectiveRetentionState) === 'remedial';

    $latestStmt = $pdo->prepare(
        "SELECT title
           FROM notifications
          WHERE recipient_user_id = ?
            AND notification_type = 'remedial_assignment'
            AND entity_type = 'enrollment'
            AND entity_id = ?
            AND (title LIKE 'Remedial required%' OR title LIKE 'Remedial no longer required%')
          ORDER BY notification_id DESC
          LIMIT 1"
    );
    $latestStmt->execute([$recipientUserId, (string) $enrollmentId]);
    $lastTitle = $latestStmt->fetchColumn();
    $prev = (is_string($lastTitle) && str_starts_with($lastTitle, 'Remedial required')) ? 'remedial' : 'none';

    if (($prev === 'remedial') === $isRemedial) {
        return;
    }

    $countStmt = $pdo->prepare(
        "SELECT COUNT(*)
           FROM notifications
          WHERE recipient_user_id = ?
            AND notification_type = 'remedial_assignment'
            AND entity_type = 'enrollment'
            AND entity_id = ?
            AND (title LIKE 'Remedial required%' OR title LIKE 'Remedial no longer required%')"
    );
    $countStmt->execute([$recipientUserId, (string) $enrollmentId]);
    $cycle = ((int) $countStmt->fetchColumn()) + 1;

    $course = (string) $row['course_code'];
    $section = (string) $row['cs_name'];
    $gradeText = $gwa !== null && is_finite($gwa) ? grade_release_format_gwa($gwa) : '';

    if ($prev !== 'remedial' && $isRemedial) {
        notification_create_idempotent(
            $pdo,
            $recipientUserId,
            'remedial_assignment',
            "Remedial required in {$course}",
            "Your computed grade in {$course} ({$section}) is {$gradeText}, which requires a remedial exam. Your Faculty will schedule it; see Retention for details.",
            'enrollment',
            (string) $enrollmentId,
            "grade-retention:{$enrollmentId}:remedial:{$cycle}"
        );
        return;
    }

    if ($prev === 'remedial' && !$isRemedial) {
        $body = $gradeText !== ''
            ? "Your recomputed grade in {$course} ({$section}) is {$gradeText}. A remedial exam is no longer required for this course."
            : "A remedial exam is no longer required for {$course} ({$section}).";
        notification_create_idempotent(
            $pdo,
            $recipientUserId,
            'remedial_assignment',
            "Remedial no longer required in {$course}",
            $body,
            'enrollment',
            (string) $enrollmentId,
            "grade-retention:{$enrollmentId}:cleared:{$cycle}"
        );
    }
}

/**
 * Notify active enrolled students with an active account when their Midterm Advisory
 * status transitions into At-Risk (on Publish/Update) or out of At-Risk (on Update).
 *
 * @return array{notifiedAtRisk: int, notifiedCleared: int}
 */
function grade_release_notify_midterm_transitions(PDO $pdo, int $csId, array $prevEntries, array $nextEntries): array
{
    $stmt = $pdo->prepare(
        "SELECT e.enrollment_id, c.course_code, cs.cs_name, ua.user_id AS recipient_user_id
           FROM enrollments e
           JOIN class_sections cs ON cs.cs_id = e.cs_id
           JOIN courses c ON c.course_id = cs.course_id
           JOIN students s ON s.student_id = e.student_id
           JOIN user_accounts ua ON ua.user_id = COALESCE(s.student_account_user_id, s.user_id)
          WHERE e.cs_id = ?
            AND LOWER(e.status) = 'active'
            AND LOWER(ua.status) = 'active'
          ORDER BY e.enrollment_id"
    );
    $stmt->execute([$csId]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $latestStmt = $pdo->prepare(
        "SELECT title
           FROM notifications
          WHERE recipient_user_id = ?
            AND notification_type = 'midterm_advisory'
            AND entity_type = 'enrollment'
            AND entity_id = ?
          ORDER BY notification_id DESC
          LIMIT 1"
    );
    $countStmt = $pdo->prepare(
        "SELECT COUNT(*)
           FROM notifications
          WHERE recipient_user_id = ?
            AND notification_type = 'midterm_advisory'
            AND entity_type = 'enrollment'
            AND entity_id = ?"
    );

    $notifiedAtRisk = 0;
    $notifiedCleared = 0;

    foreach ($rows as $row) {
        $enrollmentId = (int) $row['enrollment_id'];
        $key = (string) $enrollmentId;
        $recipientUserId = (int) $row['recipient_user_id'];
        if ($recipientUserId <= 0) {
            continue;
        }

        $latestStmt->execute([$recipientUserId, $key]);
        $lastTitle = $latestStmt->fetchColumn();
        $lastNotifiedAtRisk = is_string($lastTitle) && str_starts_with($lastTitle, 'Midterm advisory in ');

        $nowAtRisk = (bool) ($nextEntries[$key]['isAtRisk'] ?? false);
        $wasAtRiskInPrev = (bool) ($prevEntries[$key]['isAtRisk'] ?? false);

        if (!$lastNotifiedAtRisk && $nowAtRisk) {
            $countStmt->execute([$recipientUserId, $key]);
            $cycle = ((int) $countStmt->fetchColumn()) + 1;
            $course = (string) $row['course_code'];
            $section = (string) $row['cs_name'];
            $grade = grade_release_format_gwa((float) ($nextEntries[$key]['gwa'] ?? 0.0));
            $res = notification_create_idempotent(
                $pdo,
                $recipientUserId,
                'midterm_advisory',
                "Midterm advisory in {$course}",
                "Your published Midterm grade in {$course} ({$section}) is {$grade}. This is an informational advisory; contact your Faculty for academic support.",
                'enrollment',
                $key,
                "midterm-advisory:{$enrollmentId}:at_risk:{$cycle}"
            );
            if ($res['created']) {
                $notifiedAtRisk++;
            }
            continue;
        }

        if ($lastNotifiedAtRisk && !$nowAtRisk && $wasAtRiskInPrev) {
            $countStmt->execute([$recipientUserId, $key]);
            $cycle = ((int) $countStmt->fetchColumn()) + 1;
            $course = (string) $row['course_code'];
            $section = (string) $row['cs_name'];
            $hasGwa = isset($nextEntries[$key]['gwa']) && is_numeric($nextEntries[$key]['gwa']);
            $body = $hasGwa
                ? 'Your updated Midterm grade in ' . $course . ' (' . $section . ') is ' . grade_release_format_gwa((float) $nextEntries[$key]['gwa']) . '. You are no longer listed on the Midterm Advisory.'
                : "Your updated Midterm scores in {$course} ({$section}) changed. You are no longer listed on the Midterm Advisory.";
            $res = notification_create_idempotent(
                $pdo,
                $recipientUserId,
                'midterm_advisory',
                "Midterm advisory cleared in {$course}",
                $body,
                'enrollment',
                $key,
                "midterm-advisory:{$enrollmentId}:cleared:{$cycle}"
            );
            if ($res['created']) {
                $notifiedCleared++;
            }
        }
    }

    return ['notifiedAtRisk' => $notifiedAtRisk, 'notifiedCleared' => $notifiedCleared];
}

/**
 * Compute the Midterm publish preview, dirty diff, and live snapshot entries for one class.
 */
function grade_release_compute_midterm_preview(PDO $pdo, int $csId, array $classRow): array
{
    $cfgStmt = $pdo->prepare(
        "SELECT gc.config_id, gc.schema_mode
           FROM grading_configs gc
           JOIN class_sections cs
             ON gc.faculty_user_id = cs.instructor_user_id
            AND gc.course_id = cs.course_id
            AND gc.semester = UPPER(cs.semester)
            AND gc.school_year = UPPER(cs.school_year)
          WHERE cs.cs_id = ?
          LIMIT 1"
    );
    $cfgStmt->execute([$csId]);
    $cfgRow = $cfgStmt->fetch(PDO::FETCH_ASSOC);
    $schemaMode = ($cfgRow && ($cfgRow['schema_mode'] ?? 'overall') === 'periods') ? 'periods' : 'overall';

    $submitted = ($classRow['grades_submitted_at'] ?? null) !== null;
    $archived = ($classRow['archive_reason'] ?? null) !== null;
    $published = $schemaMode === 'periods' && !$submitted && ($classRow['midterm_published_at'] ?? null) !== null;
    $publishedAt = $published ? grade_release_format_time((string) $classRow['midterm_published_at']) : null;

    if ($schemaMode !== 'periods') {
        return [
            'eligible' => false,
            'schemaMode' => 'overall',
            'published' => false,
            'publishedAt' => null,
            'dirty' => false,
            'readyCount' => 0,
            'atRisk' => [],
            'missing' => [],
            'diff' => ['added' => [], 'removed' => []],
            'liveEntries' => [],
            'prevEntries' => [],
            'publishedAtRiskCount' => 0,
        ];
    }

    $enrStmt = $pdo->prepare(
        "SELECT e.enrollment_id, e.student_id, e.cs_id, e.final_gwa, e.remedial_state_json,
                s.student_number,
                TRIM(COALESCE(pi.last_name, s.last_name) || ', ' || COALESCE(pi.first_name, s.first_name)) AS name
           FROM enrollments e
           JOIN students s ON s.student_id = e.student_id
           LEFT JOIN person_identities pi ON pi.person_id = s.person_id
          WHERE e.cs_id = ? AND LOWER(e.status) = 'active'
          ORDER BY COALESCE(pi.last_name, s.last_name), COALESCE(pi.first_name, s.first_name), s.student_id"
    );
    $enrStmt->execute([$csId]);
    $enrollments = $enrStmt->fetchAll(PDO::FETCH_ASSOC);

    $readCache = [];
    if ($enrollments !== [] && function_exists('faculty_retention_preload')) {
        faculty_retention_preload($pdo, $enrollments, $readCache);
    }

    $midtermCategoryIds = [];
    if (function_exists('faculty_retention_read_config')) {
        $grading = faculty_retention_read_config($pdo, $csId, $readCache);
        foreach ($grading['periodMemberships']['Midterm'] ?? [] as $membership) {
            if (($membership['source_kind'] ?? 'assessment') !== 'attendance') {
                $midtermCategoryIds[(int) $membership['category_id']] = true;
            }
        }
    }

    $threshold = defined('RETENTION_GWA_TRIGGER') ? RETENTION_GWA_TRIGGER : 2.5;
    $liveEntries = [];
    $liveAtRisk = [];
    $incompleteRows = [];
    $studentInfoByKey = [];
    $readyCount = 0;

    foreach ($enrollments as $row) {
        $eid = (int) $row['enrollment_id'];
        $key = (string) $eid;
        $studentInfoByKey[$key] = [
            'enrollmentId' => $eid,
            'name' => (string) $row['name'],
            'studentNumber' => (string) $row['student_number'],
        ];

        $midterm = function_exists('faculty_watchlist_midterm')
            ? faculty_watchlist_midterm($pdo, $row, $readCache, false)
            : ['complete' => false, 'percentage' => null];

        if (($midterm['complete'] ?? false) === true && ($midterm['percentage'] ?? null) !== null) {
            $pct = (float) $midterm['percentage'];
            $exactGwa = function_exists('faculty_percentage_to_gwa_exact')
                ? faculty_percentage_to_gwa_exact($pct, 'Midterm')
                : 5.0;
            $gwa = round($exactGwa, 2);
            $isAtRisk = $exactGwa >= $threshold;
            $liveEntries[$key] = [
                'percentage' => $pct,
                'rawPercentage' => isset($midterm['rawPercentage']) && $midterm['rawPercentage'] !== null ? (float) $midterm['rawPercentage'] : null,
                'gwa' => $gwa,
                'isAtRisk' => $isAtRisk,
                'gradedCount' => (int) ($midterm['gradedCount'] ?? 0),
                'totalCount' => (int) ($midterm['totalCount'] ?? 0),
                'components' => is_array($midterm['components'] ?? null) ? $midterm['components'] : [],
            ];
            $readyCount++;
            if ($isAtRisk) {
                $liveAtRisk[] = [
                    'enrollmentId' => $eid,
                    'name' => (string) $row['name'],
                    'studentNumber' => (string) $row['student_number'],
                    'grade' => $gwa,
                    'percentage' => $pct,
                ];
            }
        } else {
            $missingAssessments = 0;
            foreach ($readCache['assessments'][$eid]['Midterm'] ?? [] as $assessment) {
                $catId = (int) ($assessment['grading_category_id'] ?? 0);
                $inWeightedCategory = $midtermCategoryIds === [] ? $catId > 0 : isset($midtermCategoryIds[$catId]);
                if ($inWeightedCategory && !($assessment['_has_score'] ?? false)) {
                    $missingAssessments++;
                }
            }
            $incompleteRows[] = [
                'name' => (string) $row['name'],
                'studentNumber' => (string) $row['student_number'],
                'missingAssessments' => $missingAssessments,
            ];
        }
    }

    $missing = [];
    foreach ($incompleteRows as $inc) {
        if ($inc['missingAssessments'] > 0) {
            $missing[] = [
                'name' => $inc['name'],
                'studentNumber' => $inc['studentNumber'],
                'missingCount' => $inc['missingAssessments'],
            ];
        } elseif ($readyCount > 0) {
            $missing[] = [
                'name' => $inc['name'],
                'studentNumber' => $inc['studentNumber'],
                'missingCount' => 1,
            ];
        }
    }

    $prevEntries = [];
    $publishedAtRiskCount = 0;
    $dirty = false;
    $diff = ['added' => [], 'removed' => []];

    if ($published) {
        $rawSnapshot = $classRow['midterm_published_snapshot'] ?? null;
        if ($rawSnapshot !== null && $rawSnapshot !== '') {
            $prevEntries = grade_release_parse_midterm_snapshot($rawSnapshot)['entries'];
        } else {
            $pubReadCache = [];
            foreach ($enrollments as $row) {
                $eid = (int) $row['enrollment_id'];
                $entry = grade_release_midterm_entry_from_snapshot($row + $classRow, $eid, $pdo, $pubReadCache);
                if ($entry['complete'] && $entry['percentage'] !== null && $entry['gwa'] !== null) {
                    $prevEntries[(string) $eid] = [
                        'percentage' => (float) $entry['percentage'],
                        'rawPercentage' => $entry['rawPercentage'],
                        'gwa' => (float) $entry['gwa'],
                        'isAtRisk' => (bool) $entry['isAtRisk'],
                        'gradedCount' => (int) $entry['gradedCount'],
                        'totalCount' => (int) $entry['totalCount'],
                        'components' => $entry['components'],
                    ];
                }
            }
        }

        // Resolve labels for any snapshot enrollments that are no longer active in $enrollments.
        $missingStudentKeys = array_diff(array_keys($prevEntries), array_keys($studentInfoByKey));
        if ($missingStudentKeys !== []) {
            $missingIds = array_values(array_filter(array_map('intval', $missingStudentKeys), static fn(int $id): bool => $id > 0));
            if ($missingIds !== []) {
                $ph = implode(',', array_fill(0, count($missingIds), '?'));
                $msStmt = $pdo->prepare(
                    "SELECT e.enrollment_id, s.student_number,
                            TRIM(COALESCE(pi.last_name, s.last_name) || ', ' || COALESCE(pi.first_name, s.first_name)) AS name
                       FROM enrollments e
                       JOIN students s ON s.student_id = e.student_id
                       LEFT JOIN person_identities pi ON pi.person_id = s.person_id
                      WHERE e.enrollment_id IN ({$ph})"
                );
                $msStmt->execute($missingIds);
                foreach ($msStmt->fetchAll(PDO::FETCH_ASSOC) as $msRow) {
                    $msKey = (string) $msRow['enrollment_id'];
                    $studentInfoByKey[$msKey] = [
                        'enrollmentId' => (int) $msRow['enrollment_id'],
                        'name' => (string) $msRow['name'],
                        'studentNumber' => (string) $msRow['student_number'],
                    ];
                }
            }
        }

        foreach ($prevEntries as $pe) {
            if (!empty($pe['isAtRisk'])) {
                $publishedAtRiskCount++;
            }
        }

        $allKeys = array_unique(array_merge(array_keys($prevEntries), array_keys($liveEntries)));
        foreach ($allKeys as $key) {
            $prev = $prevEntries[$key] ?? null;
            $live = $liveEntries[$key] ?? null;

            if (($prev === null) !== ($live === null)) {
                $dirty = true;
            } elseif (
                round((float) $prev['percentage'], 2) !== round((float) $live['percentage'], 2)
                || round((float) $prev['gwa'], 2) !== round((float) $live['gwa'], 2)
                || (bool) $prev['isAtRisk'] !== (bool) $live['isAtRisk']
            ) {
                $dirty = true;
            }

            $prevAtRisk = (bool) ($prev['isAtRisk'] ?? false);
            $liveAtRiskFlag = (bool) ($live['isAtRisk'] ?? false);
            $info = $studentInfoByKey[$key] ?? ['enrollmentId' => (int) $key, 'name' => 'Student #' . $key, 'studentNumber' => ''];

            if (!$prevAtRisk && $liveAtRiskFlag) {
                $diff['added'][] = [
                    'enrollmentId' => $info['enrollmentId'],
                    'name' => $info['name'],
                    'studentNumber' => $info['studentNumber'],
                    'grade' => (float) $live['gwa'],
                ];
            } elseif ($prevAtRisk && !$liveAtRiskFlag) {
                $diff['removed'][] = [
                    'enrollmentId' => $info['enrollmentId'],
                    'name' => $info['name'],
                    'studentNumber' => $info['studentNumber'],
                    'grade' => isset($live['gwa']) ? (float) $live['gwa'] : null,
                ];
            }
        }
    }

    return [
        'eligible' => !$submitted && !$archived && $readyCount > 0,
        'schemaMode' => 'periods',
        'published' => $published,
        'publishedAt' => $publishedAt,
        'dirty' => $dirty,
        'readyCount' => $readyCount,
        'atRisk' => $liveAtRisk,
        'missing' => $missing,
        'diff' => $diff,
        'liveEntries' => $liveEntries,
        'prevEntries' => $prevEntries,
        'publishedAtRiskCount' => $published ? $publishedAtRiskCount : count($liveAtRisk),
    ];
}
