<?php

declare(strict_types=1);

// Backlog 12.4 / CLS-004 join a class by code, DB-free checks (docs/contracts/class-join-code.md).
require_once __DIR__ . '/../../backend/app/config.php';
require_once __DIR__ . '/../../backend/app/class_join.php';
require_once __DIR__ . '/../../backend/app/audit_catalogue.php';

function assert_class_join(bool $condition, string $label): void
{
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$label}\n");
        exit(1);
    }
    echo "PASS: {$label}\n";
}

$root = __DIR__ . '/../../';
foreach (['0', 'O', '1', 'I', 'L'] as $bad) {
    assert_class_join(!str_contains(CLASS_JOIN_ALPHABET, $bad), "The alphabet has no {$bad}");
}
for ($i = 0; $i < 200; $i++) {
    $code = class_join_generate_code();
    if (preg_match('/^[' . CLASS_JOIN_ALPHABET . ']{6}$/', $code) !== 1) {
        assert_class_join(false, "Generated code {$code} is 6 allowed characters");
    }
}
assert_class_join(true, '200 generated codes are 6 allowed characters');
assert_class_join(class_join_format('K7M4QX') === 'K7M-4QX', 'A code is shown as XXX-XXX');
foreach (['K7M-4QX', 'k7m4qx', ' k7m 4qx ', "K7M\t-4QX"] as $input) {
    assert_class_join(class_join_normalize($input) === 'K7M4QX', 'Normalizes ' . json_encode($input));
}
foreach (['', 'K7M4Q', 'K7M4QXX', 'K7M-4Q0', 'K7M4QL', 'K7M4QI', 'K7M4Q1', 'KOM4QX', null, 123456] as $input) {
    assert_class_join(class_join_normalize($input) === null, 'Rejects ' . json_encode($input));
}
assert_class_join(CLASS_JOIN_NO_MATCH === 'That code does not match an open class.', 'Wrong-code message is exact');
assert_class_join(CLASS_JOIN_TOO_MANY === 'Too many tries. Wait 15 minutes.', 'Rate-limit message is exact');
assert_class_join(class_join_link(['app' => ['base_url' => 'https://dentisys.example']], 'K7M4QX') === 'https://dentisys.example/student/classes?join=K7M4QX', 'The join link opens My Classes with the code');

$routes = (string) file_get_contents($root . 'backend/routes/api.php');
foreach ([
    ['GET', '/api/faculty/classes/join', 'faculty_get'], ['POST', '/api/faculty/classes/join/code', 'faculty_new_code'],
    ['POST', '/api/faculty/classes/join/settings', 'faculty_settings'], ['GET', '/api/faculty/classes/join/requests', 'faculty_requests'],
    ['POST', '/api/faculty/classes/join/requests/approve', 'faculty_approve'], ['POST', '/api/faculty/classes/join/requests/reject', 'faculty_reject'],
    ['POST', '/api/student/classes/join', 'student_join'], ['GET', '/api/student/classes/join/preview', 'student_preview'], ['GET', '/api/student/join-requests', 'student_requests'],
] as [$method, $path, $handler]) {
    assert_class_join(str_contains($routes, "['method' => '{$method}', 'path' => '{$path}', 'handler' => 'handle_class_join_{$handler}']"), "{$method} {$path} is registered");
}
assert_class_join(!str_contains($routes, '/api/secretary/join-code') && !str_contains($routes, 'handle_class_join_secretary'), 'The Class Secretary has no join-code route');
foreach (['class_code_regenerated', 'class_code_disabled', 'class_code_enabled', 'class_auto_approve_changed', 'class_join_requested', 'class_join_approved', 'class_join_rejected'] as $code) {
    assert_class_join((audit_catalogue()[$code] ?? null) !== null && audit_catalogue()[$code][2] === false, "{$code} is catalogued and Dean-hidden");
}
$controller = (string) file_get_contents($root . 'backend/controllers/ClassJoinController.php');
$logic = (string) file_get_contents($root . 'backend/app/class_join.php');
assert_class_join(!str_contains($logic . $controller, "'before' => ['join_code'") && !str_contains($controller, 'Replaced the join code of \' . $'), 'Audit rows never store the code value');
assert_class_join(str_contains($controller, "'post_class_join_wrong', 900, 10") && str_contains($controller, 'Retry-After'), 'Ten wrong codes in 15 minutes block, with Retry-After');
$preview = substr($controller, (int) strpos($controller, 'function handle_class_join_student_preview'), 1400);
$find = substr($controller, (int) strpos($controller, 'function class_join_student_find_open_class'), 1200);
assert_class_join(str_contains($preview, 'class_join_student_find_open_class') && str_contains($controller, 'class_join_student_find_open_class($pdo, $config, $authCtx, request_body()'), 'Preview and join share one lookup');
assert_class_join(str_contains($find, "'post_class_join_wrong', 900, 10") && str_contains($find, 'rate_limit_record_login_failure') && str_contains($find, 'CLASS_JOIN_NO_MATCH, 404'), 'A wrong lookup counts in the same 10-in-15-minutes bucket with the same 404 message');
assert_class_join(!str_contains($preview, 'class_join_audit') && !str_contains($preview, 'rate_limit_reset'), 'A preview writes no audit row and never resets the counter');
$migration = (string) file_get_contents($root . 'database/migrations/066_class_join_codes.sql');
assert_class_join(str_contains($migration, "CHECK (status IN ('pending', 'approved', 'rejected'))") && str_contains($migration, "WHERE status = 'pending'"), 'Migration 066 limits status and allows one pending request per Student and class');
echo "PASS: Class join contract checks completed.\n";
