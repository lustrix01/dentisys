<?php

declare(strict_types=1);

/*
 * One-time recalculation of current-term course grades with the official
 * BUCDM grade sheet rules (docs/contracts/official-imports.md section 4c).
 *
 *   preview  lists every grade that would change; writes nothing (rolled back).
 *   apply    saves them as one audited batch (actor System, one operation_uuid).
 *
 * Current school year only, non-archived classes only; past years are never
 * touched. Running apply twice changes nothing the second time.
 *
 * Usage (inside the web container):
 *   docker compose exec web php /var/www/html/backend/bin/recompute-current-grades.php preview
 *   docker compose exec web php /var/www/html/backend/bin/recompute-current-grades.php apply
 */

const RECOMPUTE_BATCH_LABEL = 'Recalculated current-term grades (official grade sheet rules)';

/** @return array{mode: string}|null null when the arguments are not exactly one of preview|apply */
function recompute_parse_args(array $argv): ?array
{
    $args = array_slice($argv, 1);
    return count($args) === 1 && in_array($args[0], ['preview', 'apply'], true) ? ['mode' => $args[0]] : null;
}

function recompute_fmt(mixed $percentage, mixed $gwa): string
{
    if ($percentage === null && $gwa === null) {
        return '-';
    }
    return ($percentage === null ? '-' : number_format((float) $percentage, 2, '.', '') . '%')
        . ' / ' . ($gwa === null ? '-' : number_format((float) $gwa, 2, '.', ''));
}

/** Enrollments whose stored grade differs between two snapshots keyed by enrollment_id. */
function recompute_diff(array $before, array $after): array
{
    $key = static fn(?array $r): string => $r === null ? '' : recompute_fmt($r['final_percentage'], $r['final_gwa']) . '|' . ($r['retention_state'] ?? '');
    $changes = [];
    foreach ($after as $id => $new) {
        $old = $before[$id] ?? null;
        if ($key($old) !== $key($new)) {
            $changes[] = ['student_number' => $new['student_number'], 'old' => $old, 'new' => $new, 'override' => ($new['retention_override_state'] ?? null) !== null];
        }
    }
    return $changes;
}

function recompute_line(string $className, array $change): string
{
    $old = $change['old'];
    $new = $change['new'];
    $oldText = $old === null ? '-' : recompute_fmt($old['final_percentage'], $old['final_gwa']);
    $line = sprintf('%s | %s | %s -> %s', $className, $change['student_number'], $oldText, recompute_fmt($new['final_percentage'], $new['final_gwa']));
    $oldState = $old['retention_state'] ?? null;
    if ($oldState !== ($new['retention_state'] ?? null)) {
        $line .= sprintf(' | retention: %s -> %s', $oldState ?? '-', $new['retention_state'] ?? '-');
    }
    return $line . (($change['override'] ?? false) ? ' | manual override kept' : '');
}

function recompute_summary(string $mode, int $grades, int $classes, int $skipped): string
{
    $skippedText = $skipped > 0 ? sprintf('; %d class(es) skipped (grade weights missing or invalid)', $skipped) : '';
    return $mode === 'preview'
        ? sprintf('PREVIEW: %d grade(s) in %d class(es) would change%s. Nothing was written.', $grades, $classes, $skippedText)
        : sprintf('APPLIED: %d grade(s) in %d class(es) recalculated%s.', $grades, $classes, $skippedText);
}

function recompute_snapshot(PDO $pdo, int $csId): array
{
    $stmt = $pdo->prepare(
        'SELECT e.enrollment_id, s.student_number, e.final_percentage, e.final_gwa, e.retention_state, e.retention_override_state
           FROM enrollments e JOIN students s ON s.student_id = e.student_id
          WHERE e.cs_id = ? ORDER BY e.enrollment_id'
    );
    $stmt->execute([$csId]);
    $rows = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $rows[(int) $row['enrollment_id']] = $row;
    }
    return $rows;
}

function recompute_run(PDO $pdo, array $config, string $mode): int
{
    $currentYear = academic_current_school_year($pdo);
    $threshold = remedial_attempts_course_grade_threshold($pdo);
    $classes = $pdo->prepare(
        'SELECT cs_id, cs_name, instructor_user_id FROM class_sections
          WHERE school_year >= ? AND archive_reason IS NULL AND instructor_user_id IS NOT NULL
          ORDER BY instructor_user_id, cs_id'
    );
    $classes->execute([$currentYear]);

    $batchId = uuid_v4_string();
    $_SERVER['HTTP_X_AUDIT_BATCH_ID'] = $batchId; // audit_record_action reads the batch id from here (R12)
    $actor = ['user_id' => null, 'login_email' => null, 'role' => 'system', 'display_name' => 'System', 'session_id' => null];
    $context = [
        'request_id' => 'recompute-current-grades-' . $batchId, 'ip_address' => null,
        'user_agent' => 'backend/bin/recompute-current-grades.php', 'http_method' => 'CLI', 'endpoint' => 'bin/recompute-current-grades.php',
    ];

    $gradeTotal = 0;
    $classTotal = 0;
    $skipped = 0;
    $pdo->beginTransaction();
    try {
        foreach ($classes->fetchAll(PDO::FETCH_ASSOC) as $class) {
            $csId = (int) $class['cs_id'];
            $before = recompute_snapshot($pdo, $csId);
            $pdo->exec('SAVEPOINT recompute_class');
            try {
                $computed = faculty_recompute_class_grades($pdo, (int) $class['instructor_user_id'], $csId, $currentYear, $threshold, true); // release: keep manual overrides, no notifications
            } catch (FacultyGradingConfigurationException $e) {
                $pdo->exec('ROLLBACK TO SAVEPOINT recompute_class');
                $skipped++;
                fwrite(STDERR, sprintf("SKIPPED %s: %s\n", $class['cs_name'], $e->getMessage()));
                continue;
            }
            $pdo->exec('RELEASE SAVEPOINT recompute_class');
            $changes = recompute_diff($before, recompute_snapshot($pdo, $csId));
            if ($changes === []) {
                continue;
            }
            foreach ($changes as $change) {
                echo recompute_line((string) $class['cs_name'], $change), "\n";
            }
            $classTotal++;
            $gradeTotal += count($changes);
            if ($mode === 'apply') { // every changed class is audited, even when only retention moved
                audit_record_action(
                    $pdo, $config, $actor, 'grading', 'grades_recomputed', 'class_section', (string) $csId,
                    sprintf('%s: %s, %d grade(s) changed.', RECOMPUTE_BATCH_LABEL, $class['cs_name'], count($changes)),
                    ['scope_cs_id' => $csId, 'context' => $context, 'after' => [
                        'gradeChanges' => faculty_audit_label_changes($pdo, $computed['gradeChanges']),
                        'retentionChanges' => array_values(array_filter(array_map(
                            static fn(array $c): ?array => ($c['old']['retention_state'] ?? null) === ($c['new']['retention_state'] ?? null) ? null
                                : ['studentNumber' => $c['student_number'], 'before' => $c['old']['retention_state'] ?? null, 'after' => $c['new']['retention_state'] ?? null],
                            $changes
                        ))),
                    ]]
                );
            }
        }
        $mode === 'apply' ? $pdo->commit() : $pdo->rollBack();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }
    echo recompute_summary($mode, $gradeTotal, $classTotal, $skipped), "\n";
    return 0;
}

if (PHP_SAPI === 'cli' && isset($argv[0]) && realpath($argv[0]) === __FILE__) {
    $parsed = recompute_parse_args($argv);
    if ($parsed === null) {
        fwrite(STDERR, "Usage: php recompute-current-grades.php preview|apply\n");
        exit(2);
    }
    require __DIR__ . '/../app/bootstrap.php';
    require_once __DIR__ . '/../controllers/FacultyController.php';
    try {
        $config = app_config();
        exit(recompute_run(create_pdo($config), $config, $parsed['mode']));
    } catch (Throwable $e) {
        fwrite(STDERR, 'ERROR: recalculation failed and was rolled back: ' . $e->getMessage() . "\n");
        exit(1);
    }
}
