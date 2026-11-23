<?php

declare(strict_types=1);

// Superadmin Classes, DB-free checks written from docs/contracts/superadmin-classes.md.
// The database and HTTP behaviour is in tests/database/superadmin_classes_integration.php.
require_once __DIR__ . '/../../backend/app/config.php';
require_once __DIR__ . '/../../backend/app/validation.php';
require_once __DIR__ . '/../../backend/app/audit_catalogue.php';
require_once __DIR__ . '/../../backend/app/email_template.php';

function assert_sc(bool $condition, string $label): void
{
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$label}\n");
        exit(1);
    }
    echo "PASS: {$label}\n";
}

$root = __DIR__ . '/../../';
$read = static fn(string $rel): string => (string) file_get_contents($root . $rel);
$routes = $read('backend/routes/api.php');

// ---- Routes: the four contract routes, with the right verbs, on one Superadmin-only handler ----
$routeHandler = static function (string $method, string $path) use ($routes): ?string {
    return preg_match("/'method' => '{$method}',\s*'path' => '" . preg_quote($path, '/') . "',\s*'handler' => '([a-z0-9_]+)'/", $routes, $m) === 1 ? $m[1] : null;
};
$handlerBody = static function (string $handler) use ($root): ?string {
    foreach (glob($root . 'backend/controllers/*.php') ?: [] as $file) {
        $src = (string) file_get_contents($file);
        if (preg_match('/^function ' . preg_quote($handler, '/') . '\(/m', $src, $m, PREG_OFFSET_CAPTURE) === 1) {
            $start = $m[0][1];
            $next = strpos($src, "\nfunction ", $start + 10);
            return substr($src, $start, ($next === false ? strlen($src) : $next) - $start);
        }
    }
    return null;
};
foreach ([['GET', '/api/admin/classes'], ['GET', '/api/admin/classes/filters'], ['GET', '/api/admin/classes/detail'], ['POST', '/api/admin/classes/change-faculty']] as [$method, $path]) {
    $handler = $routeHandler($method, $path);
    $body = $handler === null ? null : $handlerBody($handler);
    assert_sc($handler !== null, "{$method} {$path} is routed");
    assert_sc($body !== null && str_contains($body, 'superadmin_verify_auth(') && !preg_match('/(?<!super)admin_verify_auth\(/', $body), "{$method} {$path} checks the Superadmin role only (Dean, Faculty, Secretary, Student get 403)");
}
assert_sc($routeHandler('POST', '/api/admin/classes') === null && $routeHandler('GET', '/api/admin/classes/change-faculty') === null, 'Creating, editing, archiving and restoring are not offered here: no POST /api/admin/classes and no GET change-faculty');
foreach (['/api/admin/classes/archive', '/api/admin/classes/restore', '/api/admin/classes/update', '/api/admin/classes/create'] as $path) {
    assert_sc(!str_contains($routes, "'{$path}'"), "No {$path} route: those stay with Faculty (CLS-001, CLS-003)");
}

// ---- Data: no migration ----
assert_sc(!preg_grep('/class_assign|faculty_chang/i', array_map('basename', glob($root . 'database/migrations/*.sql') ?: [])), 'No migration for Superadmin Classes (the owner is class_sections.instructor_user_id)');

// ---- Audit catalogue: registered like class_archive, labelled, in the Superadmin overview ----
$info = audit_code_info('class_faculty_changed');
$archive = audit_code_info('class_archive');
assert_sc($info['area'] === $archive['area'], 'class_faculty_changed is in the same area as class_archive (People)');
assert_sc($info['deanVisible'] === true && $archive['deanVisible'] === true, 'class_faculty_changed is on the Superadmin overview like class_archive');
assert_sc($info['label'] !== audit_code_info('zz_unknown_code')['label'], 'class_faculty_changed has its own label, not the unknown-code fallback');
$row = ['action_code' => 'class_faculty_changed', 'module_code' => 'class_management', 'target_type' => 'class_section', 'target_id' => '5'];
$before = ['instructor_user_id' => 3, 'name' => 'Dr. Reyes'];
$after = ['instructor_user_id' => 7, 'name' => 'Dr. Ana Cruz'];
$changes = audit_row_changes($row, $before, $after);
assert_sc($changes === [['field' => 'Faculty', 'before' => 'Dr. Reyes', 'after' => 'Dr. Ana Cruz']], 'The Audit Trail shows "Faculty: Old → New" as one change line');
assert_sc(audit_row_change_text($row, $before, $after, $changes) === 'Faculty: Dr. Reyes → Dr. Ana Cruz', 'The Audit Trail change text reads "Faculty: Old → New"');

// ---- Email: a template per notice, escaping what it is given ----
assert_sc(function_exists('email_class_faculty_changed_html') || function_exists('email_class_faculty_change_html'), 'An email template exists for the Class moved / Class assigned notices');
$html = email_class_faculty_changed_html('Dr. Ana Cruz', 'Class assigned to you', ['DENT 101 (CDM-1A) is now yours. Reason: Leave.']);
assert_sc(str_contains($html, 'Dr. Ana Cruz') && str_contains($html, 'DENT 101 (CDM-1A) is now yours.'), 'The notice email greets the Faculty member and carries the notice text');

// ---- Controller: the contract's refusal codes, messages and limits are present ----
$controller = $read('backend/controllers/SuperadminClassesController.php');
foreach (['validation', 'class_not_found', 'class_not_current', 'same_faculty', 'faculty_not_eligible', 'grading_weights_clash', 'session_open'] as $code) {
    assert_sc(str_contains($controller, "'{$code}'"), "Refusal code {$code} exists");
}
foreach (['Enter a reason of 8 to 240 characters.', 'Class not found.', 'Past and archived classes are view-only.', 'This class already belongs to that Faculty member.', 'Choose an active Faculty member.', 'Choose another Faculty member.', 'End the open attendance session first'] as $message) {
    assert_sc(str_contains($controller, $message), "Refusal message: {$message}");
}
assert_sc(preg_match('/const SUPERADMIN_CLASSES_PAGE_SIZE\s*=\s*50;/', $controller) === 1, 'Paging is 50 per page');
assert_sc(str_contains($controller, 'FOR UPDATE'), 'Change Faculty locks the class row FOR UPDATE');
assert_sc(str_contains($controller, 'beginTransaction') && str_contains($controller, 'commit()'), 'Change Faculty runs in one transaction');
assert_sc(str_contains($controller, "'class_assignment'") && str_contains($controller, 'notification_create_idempotent('), 'In-app notices use notification_create_idempotent with type class_assignment');
assert_sc(str_contains($controller, "'class_faculty_changed'") && str_contains($controller, 'audit_record_action('), 'The change is audited as class_faculty_changed');
foreach (['Class moved', 'Class assigned to you'] as $subject) {
    assert_sc(str_contains($controller, "'{$subject}'"), "Email subject \"{$subject}\"");
}
assert_sc(!preg_match('/UPDATE\s+(enrollments|assessment_scores|attendance_sessions|attendance_records)\b/i', $controller), 'Change Faculty never rewrites enrollments, scores, sessions or records');
assert_sc(preg_match('/UPDATE\s+class_sections\s+SET\s+instructor_user_id\s*=\s*\?\s+WHERE\s+cs_id\s*=\s*\?/i', $controller) === 1 && substr_count(strtolower($controller), 'update class_sections') === 1, 'Change Faculty updates exactly one column of class_sections');
