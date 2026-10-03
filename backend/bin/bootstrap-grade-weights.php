<?php

declare(strict_types=1);

/*
 * Give every class offering that has no grade weights a starting
 * configuration, so every class can be graded (DentiSys requires saved grade
 * weights; there is no fallback computation).
 *
 * For each Faculty + course + semester + school year with non-archived classes
 * and no saved configuration, this saves the editable Lecture/Laboratory
 * syllabus defaults through the same code path as the Grade Weights editor.
 * Existing assessments must resolve to one explicit category in their period
 * and component; ambiguous or unmatched assessments are reported for Faculty
 * mapping instead of guessed. Existing configurations are never overwritten.
 *
 * Usage (inside the web container):
 *   docker compose exec web php /var/www/html/backend/bin/bootstrap-grade-weights.php --dry-run
 *   docker compose exec web php /var/www/html/backend/bin/bootstrap-grade-weights.php
 */

require __DIR__ . '/../app/bootstrap.php';
require_once __DIR__ . '/../controllers/FacultyController.php';

$dryRun = in_array('--dry-run', $argv, true);
$config = app_config();
$pdo = create_pdo($config);

function bootstrap_attendance_date_ranges(?string $termStart, ?string $termEnd): ?array
{
    if ($termStart === null || $termEnd === null || $termStart >= $termEnd) {
        return null;
    }
    $start = new DateTimeImmutable($termStart);
    $end = new DateTimeImmutable($termEnd);
    $days = (int) $start->diff($end)->days;
    $midtermEnd = $start->modify('+' . intdiv($days, 2) . ' days');
    return [
        'midterm' => ['startDate' => $start->format('Y-m-d'), 'endDate' => $midtermEnd->format('Y-m-d')],
        'final' => ['startDate' => $midtermEnd->modify('+1 day')->format('Y-m-d'), 'endDate' => $end->format('Y-m-d')],
    ];
}

function bootstrap_keyword_category(string $type, ?string $period): string
{
    $key = strtolower($type);
    if (str_contains($key, 'exam')) {
        return $period === 'Final' ? 'Final Exam' : 'Midterm Exam';
    }
    if (str_contains($key, 'lab') || str_contains($key, 'practic') || str_contains($key, 'clinic')) {
        return 'Laboratory';
    }
    return 'Quiz';
}

$offerings = $pdo->query(
    "SELECT cs.instructor_user_id, cs.course_id, cs.semester, cs.school_year,
            c.course_code, c.grading_config::text AS grading_config,
            ua.login_email, ua.role, ua.display_name,
            MIN(cs.term_start_date)::text AS term_start, MAX(cs.term_end_date)::text AS term_end
       FROM class_sections cs
       JOIN courses c ON c.course_id = cs.course_id
       JOIN user_accounts ua ON ua.user_id = cs.instructor_user_id
      WHERE cs.status = 'Active'
        AND NOT EXISTS (
            SELECT 1 FROM grading_configs gc
             WHERE gc.faculty_user_id = cs.instructor_user_id
               AND gc.course_id = cs.course_id
               AND gc.semester = UPPER(cs.semester)
               AND gc.school_year = UPPER(cs.school_year))
      GROUP BY cs.instructor_user_id, cs.course_id, cs.semester, cs.school_year,
               c.course_code, c.grading_config::text, ua.login_email, ua.role, ua.display_name
      ORDER BY cs.school_year, cs.semester, c.course_code, cs.instructor_user_id"
)->fetchAll(PDO::FETCH_ASSOC);

if ($offerings === []) {
    echo "Every active class offering already has grade weights.\n";
}

$context = [
    'request_id' => uuid_v4_string(),
    'ip_address' => null,
    'user_agent' => 'bin/bootstrap-grade-weights.php',
    'http_method' => 'CLI',
    'endpoint' => 'bin/bootstrap-grade-weights.php',
];
$created = 0;
$failed = 0;
foreach ($offerings as $offering) {
    $label = sprintf('%s %s %s (%s)', $offering['course_code'], $offering['semester'], $offering['school_year'], $offering['display_name']);
    if ($dryRun) {
        echo "WOULD CREATE: {$label} grouped syllabus defaults (Lecture/Laboratory 60/40; Midterm/Finals 30/70)\n";
        continue;
    }
    $actor = [
        'user_id' => (int) $offering['instructor_user_id'],
        'login_email' => (string) $offering['login_email'],
        'role' => (string) $offering['role'],
        'display_name' => (string) $offering['display_name'],
        'session_id' => null,
    ];
    $payload = array_merge(faculty_grading_default_period_template(), [
        'courseId' => (int) $offering['course_id'],
        'semester' => (string) $offering['semester'],
        'schoolYear' => (string) $offering['school_year'],
    ]);
    $dateRanges = bootstrap_attendance_date_ranges($offering['term_start'], $offering['term_end']);
    if ($dateRanges !== null) {
        $payload['attendanceDateRanges'] = $dateRanges;
    }
    try {
        faculty_grading_save_configuration($pdo, $config, $actor, $payload, $context);
        $created++;
        echo "CREATED: {$label}\n";
    } catch (FacultyGradingConfigurationException $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        $failed++;
        $message = in_array($e->errorCode, [
            'GRADING_CATEGORY_ASSIGNMENT_REQUIRED',
            'GRADING_COMPONENT_MAPPING_REQUIRED',
        ], true)
            ? $e->getMessage() . ' Supply an explicit assessment, period, and component mapping, then retry.'
            : $e->getMessage();
        echo "FAILED: {$label}: {$message}\n";
    }
}

if ($offerings !== []) {
    echo $dryRun
        ? sprintf("%d offering(s) have no grade weights. Run without --dry-run to create them.\n", count($offerings))
        : sprintf("Created %d configuration(s); %d failed.\n", $created, $failed);
}

// Configured offerings can still hold assessments without a category (for
// example Closed assessments that older versions skipped when the weights were
// first saved). Link them by name, then by keyword, so every graded
// assessment belongs to a category.
$unlinked = $pdo->query(
    "SELECT a.assessment_id, a.title, a.type, a.grading_period, cs.cs_name, gc.config_id, gc.schema_mode,
            gc.component_mode
       FROM assessments a
       JOIN class_sections cs ON cs.cs_id = a.cs_id
       JOIN grading_configs gc
         ON gc.faculty_user_id = cs.instructor_user_id
        AND gc.course_id = cs.course_id
        AND gc.semester = UPPER(cs.semester)
        AND gc.school_year = UPPER(cs.school_year)
      WHERE cs.status = 'Active'
        AND a.status <> 'Archived'
        AND a.grading_category_id IS NULL
      ORDER BY a.assessment_id"
)->fetchAll(PDO::FETCH_ASSOC);
$periodCategories = $pdo->prepare(
    "SELECT gcp.category_id, gcp.name, gcp.component
       FROM grading_category_period_memberships gcp
       JOIN grading_categories gc ON gc.category_id = gcp.category_id
      WHERE gc.config_id = ? AND gcp.grading_period = ? AND gcp.source_kind = 'assessment'
      ORDER BY gcp.sort_order"
);
$overallCategories = $pdo->prepare(
    'SELECT category_id, name FROM grading_categories WHERE config_id = ? ORDER BY sort_order'
);
$link = $pdo->prepare('UPDATE assessments SET grading_category_id = ? WHERE assessment_id = ? AND grading_category_id IS NULL');
$linked = 0;
foreach ($unlinked as $assessment) {
    if ($assessment['schema_mode'] === 'periods') {
        $gradingPeriod = (string) ($assessment['grading_period'] ?? '');
        if (($assessment['component_mode'] ?? 'combined') === 'lecture_laboratory'
            && !in_array($gradingPeriod, ['Midterm', 'Final'], true)) {
            echo "NOT LINKED: \"{$assessment['title']}\" ({$assessment['cs_name']}) — grouped assessments need an explicit Midterm/Final period and Lecture/Laboratory category mapping.\n";
            continue;
        }
        $periodCategories->execute([
            $assessment['config_id'],
            $gradingPeriod !== '' ? $gradingPeriod : 'Midterm',
        ]);
        $candidates = $periodCategories->fetchAll(PDO::FETCH_ASSOC);
    } else {
        $overallCategories->execute([$assessment['config_id']]);
        $candidates = $overallCategories->fetchAll(PDO::FETCH_ASSOC);
    }
    if ($candidates === []) {
        echo "NOT LINKED: \"{$assessment['title']}\" ({$assessment['cs_name']}) — its configuration has no category for this period.\n";
        continue;
    }
    $chosen = null;
    $how = 'name';
    $typeKey = faculty_grading_category_match_key($assessment['type']);
    if (($assessment['component_mode'] ?? 'combined') === 'lecture_laboratory') {
        $matches = array_values(array_filter(
            $candidates,
            static fn(array $candidate): bool => faculty_grading_category_match_key($candidate['name']) === $typeKey
        ));
        if (count($matches) !== 1) {
            $components = implode(', ', array_map(
                static fn(array $candidate): string => (string) ($candidate['component'] ?? 'Combined'),
                $matches !== [] ? $matches : $candidates
            ));
            echo "NOT LINKED: \"{$assessment['title']}\" ({$assessment['cs_name']}) — grouped categories need an unambiguous component assignment"
                . ($components !== '' ? " ({$components})" : '') . ".\n";
            continue;
        }
        $chosen = $matches[0];
    }
    if ($chosen === null) {
        foreach ($candidates as $candidate) {
            if (faculty_grading_category_match_key($candidate['name']) === $typeKey) {
                $chosen = $candidate;
                break;
            }
        }
    }
    if ($chosen === null && ($assessment['component_mode'] ?? 'combined') !== 'lecture_laboratory') {
        $how = 'keyword';
        $wanted = strtolower(bootstrap_keyword_category((string) $assessment['type'], $assessment['grading_period']));
        $needle = str_contains($wanted, 'exam') ? 'exam' : (str_contains($wanted, 'lab') ? 'lab' : 'quiz');
        foreach ($candidates as $candidate) {
            if (str_contains(strtolower($candidate['name']), $needle)) {
                $chosen = $candidate;
                break;
            }
        }
        if ($chosen === null) {
            $how = 'first category';
            $chosen = $candidates[0];
        }
    }
    if ($dryRun) {
        echo "WOULD LINK ({$how}): \"{$assessment['title']}\" ({$assessment['cs_name']}, {$assessment['type']}) -> {$chosen['name']}\n";
        continue;
    }
    $link->execute([$chosen['category_id'], $assessment['assessment_id']]);
    $linked += $link->rowCount();
    if ($how !== 'name') {
        echo "LINKED ({$how}): \"{$assessment['title']}\" ({$assessment['cs_name']}, {$assessment['type']}) -> {$chosen['name']}\n";
    }
}
if (!$dryRun && $unlinked !== []) {
    echo "Linked {$linked} existing assessment(s) to their course's categories.\n";
}
exit($failed > 0 ? 1 : 0);
