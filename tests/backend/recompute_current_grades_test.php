<?php

declare(strict_types=1);

require __DIR__ . '/../../backend/bin/recompute-current-grades.php';

function recompute_expect(bool $ok, string $label): void
{
    if (!$ok) {
        fwrite(STDERR, "FAIL: {$label}\n");
        exit(1);
    }
    echo "PASS: {$label}\n";
}

recompute_expect(recompute_parse_args(['x', 'preview']) === ['mode' => 'preview'], 'preview parses');
recompute_expect(recompute_parse_args(['x', 'apply']) === ['mode' => 'apply'], 'apply parses');
recompute_expect(recompute_parse_args(['x']) === null && recompute_parse_args(['x', 'go']) === null && recompute_parse_args(['x', 'apply', 'y']) === null, 'anything else is rejected');

$row = static fn($p, $g, $r) => ['student_number' => '2020-1', 'final_percentage' => $p, 'final_gwa' => $g, 'retention_state' => $r];
$same = [1 => $row('85.00', '2.00', 'Passed')];
recompute_expect(recompute_diff($same, $same) === [], 'unchanged grades produce no change (idempotent)');
$changes = recompute_diff($same, [1 => $row('86.5', '1.75', 'Passed')]);
recompute_expect(count($changes) === 1, 'a moved grade is listed');
recompute_expect(recompute_line('DENT 101-A', $changes[0]) === 'DENT 101-A | 2020-1 | 85.00% / 2.00 -> 86.50% / 1.75', 'line shows old and new percentage and grade');
$retention = recompute_diff($same, [1 => $row('85.00', '2.00', 'Remedial')]);
recompute_expect(str_ends_with(recompute_line('C', $retention[0]), '| retention: Passed -> Remedial'), 'retention change is shown');
recompute_expect(str_contains(recompute_summary('preview', 3, 2, 0), 'Nothing was written'), 'preview summary says nothing was written');
recompute_expect(str_starts_with(recompute_summary('apply', 3, 2, 1), 'APPLIED: 3 grade(s) in 2 class(es)') && str_contains(recompute_summary('apply', 3, 2, 1), '1 class(es) skipped'), 'apply summary counts grades, classes and skips');

$src = file_get_contents(__DIR__ . '/../../backend/bin/recompute-current-grades.php');
recompute_expect(str_contains($src, "\$mode === 'apply' ? \$pdo->commit() : \$pdo->rollBack()") && str_contains($src, "if (\$mode === 'apply') {"), 'preview rolls back and writes no audit row; apply audits every changed class');
recompute_expect(!str_contains($src, "\$computed['gradeChanges'] !== []") && str_contains($src, "'retentionChanges'"), 'a retention-only change is still audited');
recompute_expect(str_contains($src, '$threshold, true)'), 'the script recalculates in release mode');

// Release mode (official-imports 4c): manual overrides kept, no notifications; every other path unchanged.
$ovr = ['student_number' => '2020-1', 'final_percentage' => '85.00', 'final_gwa' => '2.00', 'retention_state' => 'Passed', 'retention_override_state' => 'Remedial'];
$moved = recompute_diff([1 => $ovr], [1 => ['final_percentage' => '86.00'] + $ovr]);
recompute_expect(str_ends_with(recompute_line('C', $moved[0]), ' | manual override kept'), 'a student with a manual override is marked');
recompute_expect(!str_contains(recompute_line('C', recompute_diff($same, [1 => $row('86.5', '1.75', 'Passed')])[0]), 'override'), 'a student without an override is not marked');
$ctl = file_get_contents(__DIR__ . '/../../backend/controllers/FacultyController.php');
$fn = static function (string $name) use ($ctl): string {
    $start = strpos($ctl, "function {$name}(");
    return substr($ctl, $start, strpos($ctl, "
function ", $start + 1) - $start);
};
$save = $fn('faculty_save_computed_grade');
recompute_expect(str_contains($save, 'bool $release = false') && str_contains($save, "(\$release ? '' : 'retention_override_state = NULL") && str_contains($save, 'if (!$release && $before !== null'), 'default save clears overrides and notifies; release keeps and stays silent');
recompute_expect(str_contains($fn('faculty_recompute_class_grades'), 'bool $release = false') && str_contains($ctl, '$breakdown, (int) $enrollmentId, $release)'), 'release flag reaches the save');
recompute_expect(substr_count($ctl, '$retentionThreshold, true') === 0, 'no controller path passes release');
recompute_expect(str_contains($src, 'archive_reason IS NULL') && str_contains($src, 'school_year >= ?'), 'only current-year non-archived classes are selected');
echo "PASS: recompute-current-grades checks completed.\n";
