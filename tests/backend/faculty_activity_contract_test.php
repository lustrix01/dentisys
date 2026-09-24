<?php

declare(strict_types=1);

function assert_faculty_activity_contract(bool $condition, string $label): void
{
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$label}\n");
        exit(1);
    }
    echo "PASS: {$label}\n";
}

$controller = file_get_contents(__DIR__ . '/../../backend/controllers/FacultyController.php');
$routes = file_get_contents(__DIR__ . '/../../backend/routes/api.php');
$client = file_get_contents(__DIR__ . '/../../frontend/src/services/apiClient.ts');
$page = file_get_contents(__DIR__ . '/../../frontend/src/components/AuditTrailPage.tsx');
assert_faculty_activity_contract(
    is_string($controller) && is_string($routes) && is_string($client) && is_string($page),
    'Faculty activity contract sources are readable'
);

$handlerStart = strpos($controller, 'function handle_faculty_activity_get(): void');
$handlerEnd = strpos($controller, 'function handle_faculty_dashboard_kpis(): void', $handlerStart);
assert_faculty_activity_contract($handlerStart !== false && $handlerEnd !== false, 'Faculty activity handler exists');
$handler = substr($controller, $handlerStart, $handlerEnd - $handlerStart);

assert_faculty_activity_contract(
    str_contains($routes, "'path' => '/api/faculty/activity'")
        && str_contains($routes, "'handler' => 'handle_faculty_activity_get'"),
    'Faculty activity route is registered'
);
assert_faculty_activity_contract(str_contains($handler, 'faculty_verify_auth'), 'Faculty activity requires server-side authentication');
assert_faculty_activity_contract(str_contains($handler, "'activity' => faculty_activity_rows"), 'Faculty activity returns the exact activity response envelope');
assert_faculty_activity_contract(str_contains($controller, 'actor_user_id = ?'), 'Faculty activity includes the authenticated actor scope');
assert_faculty_activity_contract(str_contains($controller, 'cs.instructor_user_id = ?'), 'Faculty activity includes only authorized Faculty class scopes');
assert_faculty_activity_contract(str_contains($controller, 'canonical_schema_version >= 2'), 'Faculty activity ignores legacy unscoped audit rows');
assert_faculty_activity_contract(!str_contains($handler, 'handle_admin_audit_logs'), 'Faculty activity does not reuse Admin-wide audit handling');
assert_faculty_activity_contract(!str_contains($controller, 'before_state_json') && !str_contains($controller, 'after_state_json'), 'Faculty activity does not expose raw audit state');
assert_faculty_activity_contract(str_contains($controller, "LIMIT ' . " . '$limit'), 'Faculty activity bounds the requested refresh payload');

assert_faculty_activity_contract(str_contains($client, 'getFacultyActivityApi'), 'Frontend exposes a typed Faculty activity request');
assert_faculty_activity_contract(str_contains($client, '`/faculty/activity?limit=${boundedLimit}`'), 'Frontend request targets the Faculty activity endpoint');
assert_faculty_activity_contract(str_contains($page, 'getFacultyActivityApi(100)'), 'Faculty audit page loads persisted activity');
assert_faculty_activity_contract(str_contains($page, 'setLoading(false)'), 'Faculty audit page clears loading state after refresh');
assert_faculty_activity_contract(str_contains($page, 'setError(err instanceof Error ? err.message'), 'Faculty audit page surfaces request errors');
assert_faculty_activity_contract(str_contains($page, 'No audit records match the selected filters.'), 'Faculty audit page preserves the truthful empty state');
assert_faculty_activity_contract(str_contains($page, "allLogs || role === 'faculty' ? dbLogs"), 'Faculty audit page preserves authorized class-scoped actors');

echo "ALL FACULTY ACTIVITY CONTRACT TESTS PASSED\n";
