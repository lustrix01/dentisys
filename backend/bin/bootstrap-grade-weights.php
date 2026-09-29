<?php

declare(strict_types=1);

/*
 * Give every class offering that has no grade weights a starting
 * configuration, so every class can be graded (DentiSys requires saved grade
 * weights; there is no fallback computation).
 *
 * For each Faculty + course + semester + school year with non-archived classes
 * and no saved configuration, this saves a period configuration through the
 * same code path as the Grade Weights editor:
 *   Midterm: Quiz, Laboratory, Midterm Exam, Attendance
 *   Final:   Quiz, Laboratory, Final Exam,   Attendance
 * using the course's stored component ratios (quizzes / practicum / exams /
 * attendance) or 20 / 40 / 30 / 10, with a 40 / 60 Midterm / Final split.
 * Attendance date ranges come from the classes' term dates: Midterm runs from
 * the term start to its midpoint, Final from the next day to the term end
 * (left unset when the classes have no term dates).
 * Existing assessments are linked by name; any other type is linked by keyword
 * (exam -> the period exam, lab/practic/clinic -> Laboratory, otherwise Quiz)
 * and listed in the output. Faculty can edit the weights afterwards.
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

function bootstrap_weights_from_course(mixed $raw): array
{
    $defaults = ['quizzes' => 20.0, 'practicum' => 40.0, 'exams' => 30.0, 'attendance' => 10.0];
    $decoded = is_string($raw) ? json_decode($raw, true) : null;
    if (!is_array($decoded)) {
        return $defaults;
    }
    $weights = [];
    foreach (array_keys($defaults) as $key) {
        $value = $decoded[$key] ?? 0;
        if (!is_numeric($value) || (float) $value < 0) {
            return $defaults;
        }
        $weights[$key] = round((float) $value, 4);
    }
    return abs(array_sum($weights) - 100.0) < 0.0001 ? $weights : $defaults;
}

function bootstrap_period_categories(array $weights, string $period): array
{
    $examName = $period === 'Midterm' ? 'Midterm Exam' : 'Final Exam';
    $rows = [
        ['Quiz', $weights['quizzes'], 'assessment'],
        ['Laboratory', $weights['practicum'], 'assessment'],
        [$examName, $weights['exams'], 'assessment'],
        ['Attendance', $weights['attendance'], 'attendance'],
    ];
    $categories = [];
    foreach ($rows as [$name, $weight, $sourceKind]) {
        if ($weight <= 0) {
            continue; // weights must be positive
        }
        $categories[] = [
            'name' => $name,
            'weight' => rtrim(rtrim(number_format($weight, 4, '.', ''), '0'), '.'),
            'sortOrder' => count($categories) + 1,
            'gradingPeriod' => $period,
            'sourceKind' => $sourceKind,
        ];
    }
    return $categories;
}

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
    $weights = bootstrap_weights_from_course($offering['grading_config']);
    if ($dryRun) {
        echo "WOULD CREATE: {$label} quizzes {$weights['quizzes']} / laboratory {$weights['practicum']} / exams {$weights['exams']} / attendance {$weights['attendance']}\n";
        continue;
    }
    $actor = [
        'user_id' => (int) $offering['instructor_user_id'],
        'login_email' => (string) $offering['login_email'],
        'role' => (string) $offering['role'],
        'display_name' => (string) $offering['display_name'],
        'session_id' => null,
    ];
    $payload = [
        'courseId' => (int) $offering['course_id'],
        'semester' => (string) $offering['semester'],
        'schoolYear' => (string) $offering['school_year'],
        'schemaMode' => 'periods',
        'termRatio' => ['midterm' => 40, 'final' => 60],
        'midtermCategories' => bootstrap_period_categories($weights, 'Midterm'),
        'finalCategories' => bootstrap_period_categories($weights, 'Final'),
    ];
    $dateRanges = bootstrap_attendance_date_ranges($offering['term_start'], $offering['term_end']);
    if ($dateRanges !== null) {
        $payload['attendanceDateRanges'] = $dateRanges;
    }
    $keywordLinks = [];
    for ($attempt = 0; $attempt < 2; $attempt++) {
        try {
            faculty_grading_save_configuration($pdo, $config, $actor, $payload, $context);
            $created++;
            echo "CREATED: {$label}\n";
            foreach ($keywordLinks as $line) {
                echo "  linked by keyword: {$line}\n";
            }
            break;
        } catch (FacultyGradingConfigurationException $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            if ($attempt === 0 && $e->errorCode === 'GRADING_CATEGORY_ASSIGNMENT_REQUIRED') {
                $payload['assessmentAssignments'] = [];
                foreach ($e->details['assessments'] ?? [] as $item) {
                    $category = bootstrap_keyword_category((string) $item['legacyType'], $item['gradingPeriod'] ?? null);
                    $payload['assessmentAssignments'][] = ['assessmentId' => $item['assessmentId'], 'categoryName' => $category];
                    $keywordLinks[] = sprintf('"%s" (%s) -> %s', $item['title'], $item['legacyType'], $category);
                }
                continue;
            }
            $failed++;
            echo "FAILED: {$label}: {$e->getMessage()}\n";
            break;
        }
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
    "SELECT a.assessment_id, a.title, a.type, a.grading_period, cs.cs_name, gc.config_id, gc.schema_mode
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
    "SELECT gcp.category_id, gcp.name
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
        $periodCategories->execute([$assessment['config_id'], $assessment['grading_period'] ?: 'Midterm']);
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
    foreach ($candidates as $candidate) {
        if (faculty_grading_category_match_key($candidate['name']) === $typeKey) {
            $chosen = $candidate;
            break;
        }
    }
    if ($chosen === null) {
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
