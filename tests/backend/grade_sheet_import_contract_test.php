<?php

declare(strict_types=1);

// Official imports G2/G7/G8/G12/G13: source contract of the all-or-nothing grade sheet import save.

function assert_import(bool $condition, string $label): void
{
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$label}\n");
        exit(1);
    }
    echo "PASS: {$label}\n";
}

$root = __DIR__ . '/../../backend/';
$controller = (string) file_get_contents($root . 'controllers/FacultyController.php');
$start = strpos($controller, 'function handle_faculty_grade_sheet_import');
$end = strpos($controller, 'function faculty_save_computed_grade');
assert_import($start !== false && $end !== false && $end > $start, 'the import handler exists');
$handler = substr($controller, $start, $end - $start);

$routes = (string) file_get_contents($root . 'routes/api.php');
assert_import(str_contains($routes, "'/api/faculty/grade-sheet-import'") && str_contains($routes, "'handle_faculty_grade_sheet_import'"), 'POST /api/faculty/grade-sheet-import is routed');

$validate = strpos($handler, '// 1. Validate');
$write = strpos($handler, '// 2. Write.');
assert_import($validate !== false && $write > $validate, 'validation comes before any write');
foreach (['INSERT INTO assessments', 'UPDATE assessments', 'DELETE FROM assessment_scores', 'INSERT INTO assessment_scores'] as $sql) {
    $at = strpos($handler, $sql);
    assert_import($at !== false && $at > $write, "'{$sql}' runs only after validation");
}
assert_import(substr_count($handler, 'beginTransaction()') === 1 && substr_count($handler, '->commit()') === 1, 'one transaction, one commit');
assert_import(substr_count($handler, 'rollBack()') >= 2 && str_contains($handler, 'FacultyGradingConfigurationException'), 'any failure rolls back');
assert_import(str_contains($handler, 'academic_class_section_is_past') && str_contains($handler, 'academic_view_only_message'), 'past classes are refused with the view-only message (G12)');
assert_import(str_contains($handler, 'faculty_owned_class_id'), 'only the assigned Faculty may import');
assert_import(str_contains($handler, "status = 'Active'"), 'scored students need an Active enrollment');
assert_import(str_contains($handler, 'Maximum score cannot be lower than a score already saved'), 'a max below a saved score is refused (G2e)');
assert_import(str_contains($handler, '$seen[$key'), 'duplicate item and student scores are refused');
assert_import(str_contains($handler, 'faculty_grade_text($previous) === faculty_grade_text($score)') && str_contains($handler, '$scoresSkipped++'), 'equal scores are skipped (G8)');
assert_import(!str_contains($handler, 'remarks = EXCLUDED.remarks'), 'existing remarks are not overwritten');
assert_import(str_contains($handler, 'SAVEPOINT grade_recompute') && str_contains($handler, "'recomputeFailed'"), 'a failed recompute keeps the scores');
assert_import(substr_count($handler, 'uuid_v4_string()') === 1 && str_contains($handler, "'operation_uuid' => \$batchId"), 'every audit row shares one batch id (R12)');
assert_import(!str_contains($handler, 'audit_record_action($pdo, $config, $authCtx, \'grading\', \'assessment_scores_saved\''), 'audit rows go through the shared batch helper');
foreach (['assessment_created', 'assessment_updated', 'assessment_deleted', 'assessment_scores_saved'] as $code) {
    assert_import(str_contains($handler, "'{$code}'"), "{$code} is audited");
}

$audit = (string) file_get_contents($root . 'app/audit.php');
assert_import(str_contains($audit, "'operation_uuid' => \$extra['operation_uuid'] ?? null"), 'audit_record_action forwards an explicit batch id');
