<?php

declare(strict_types=1);

// Attendance rates count Excused as attended (present, late or excused).
// Server rates also ignore records of revoked sessions (ATT-001).

$root = dirname(__DIR__, 2);
$failures = 0;

function attendance_rate_assert(bool $condition, string $message): void
{
    global $failures;
    echo ($condition ? 'PASS: ' : 'FAIL: ') . $message . "\n";
    if (!$condition) {
        $failures++;
    }
}

$frontendRates = [
    'frontend/src/pages/admin/SystemAudit.tsx',
    'frontend/src/pages/secretary/AttendanceList.tsx',
    'frontend/src/pages/secretary/utils.ts',
    'frontend/src/pages/student/Dashboard.tsx',
    'frontend/src/pages/student/Classes.tsx',
];
$hasFrontend = is_dir("{$root}/frontend/src");
if ($hasFrontend) {
    foreach ($frontendRates as $file) {
        $source = (string) file_get_contents("{$root}/{$file}");
        attendance_rate_assert(
            !preg_match("/'present' \\|\\| \\w+\\.status === 'late'\\)\\.length/", $source),
            "{$file} does not count only present and late as attended"
        );
        attendance_rate_assert(str_contains($source, "status === 'excused').length"), "{$file} counts excused as attended");
    }
    $logs = (string) file_get_contents("{$root}/frontend/src/pages/student/AttendanceLogs.tsx");
    attendance_rate_assert(str_contains($logs, '(presentCount + lateCount + excusedCount) / totalCount'), 'Student attendance log rate counts excused');
}

$controllers = [
    'AdminController.php' => ["\$st === 'present' || \$st === 'late' || \$st === 'excused'"],
    'SecretaryController.php' => ["\$st === 'present' || \$st === 'late' || \$st === 'excused'"],
    'FacultyController.php' => ["ar.status IN ('present', 'late', 'excused')"],
    'StudentAcademicController.php' => ["r.status IN (\\'present\\', \\'late\\', \\'excused\\')"],
];
foreach ($controllers as $controller => $needles) {
    $source = (string) file_get_contents("{$root}/backend/controllers/{$controller}");
    foreach ($needles as $needle) {
        attendance_rate_assert(str_contains($source, $needle), "{$controller} counts excused as attended");
    }
    attendance_rate_assert(str_contains($source, "rs.status = 'revoked'") || str_contains($source, "rs.status = \\'revoked\\'"), "{$controller} ignores revoked sessions in its rate");
}

if ($failures > 0) {
    exit(1);
}
echo "ALL ATTENDANCE RATE CONTRACT TESTS PASSED.\n";
