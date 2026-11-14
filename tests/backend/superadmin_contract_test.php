<?php

declare(strict_types=1);

// ADM-001 Superadmin mode, DB-free checks (docs/contracts/superadmin.md). The database behaviour is in
// tests/database/superadmin_integration.php.
require_once __DIR__ . '/../../backend/app/validation.php';
require_once __DIR__ . '/../../backend/app/audit_catalogue.php';
require_once __DIR__ . '/../../backend/app/auth_runtime.php';
require_once __DIR__ . '/../../backend/controllers/SuperadminController.php';

function assert_superadmin(bool $condition, string $label): void
{
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$label}\n");
        exit(1);
    }
    echo "PASS: {$label}\n";
}

$routes = (string) file_get_contents(__DIR__ . '/../../backend/routes/api.php');
$controller = (string) file_get_contents(__DIR__ . '/../../backend/controllers/SuperadminController.php');
$faculty = (string) file_get_contents(__DIR__ . '/../../backend/controllers/FacultyController.php');
$audit = (string) file_get_contents(__DIR__ . '/../../backend/app/audit_catalogue.php');
$migration = (string) file_get_contents(__DIR__ . '/../../database/migrations/060_course_retire.sql');

// Routes (SA5: Dean role only, no mode header).
foreach ([
    ['GET', '/api/admin/courses', 'handle_admin_courses'], ['POST', '/api/admin/courses/update', 'handle_admin_courses'],
    ['POST', '/api/admin/courses/retire', 'handle_admin_courses'], ['POST', '/api/admin/courses/restore', 'handle_admin_courses'],
    ['GET', '/api/admin/people', 'handle_admin_people'], ['POST', '/api/admin/people/deactivate', 'handle_admin_people'],
    ['POST', '/api/admin/people/reactivate', 'handle_admin_people'],
] as [$method, $path, $handler]) {
    assert_superadmin(str_contains($routes, "['method' => '{$method}', 'path' => '{$path}', 'handler' => '{$handler}']"), "{$method} {$path} is registered");
}
assert_superadmin(substr_count($controller, 'admin_verify_auth($pdo, $config)') === 2, 'Both handlers require the Dean role through admin_verify_auth');
assert_superadmin(!str_contains($controller, 'request_header(') && !str_contains($controller, '$_SERVER'), 'The server reads no mode header (SA5)');

// Migration 060 copies the rooms status pattern and defaults every course to active.
assert_superadmin(str_contains($migration, "status varchar(10) NOT NULL DEFAULT 'active'") && str_contains($migration, "CHECK ((status = 'retired') = (retired_at IS NOT NULL))"), 'Migration 060 adds status and the retired_at pairing check');

// Faculty: retired courses leave the picker and cannot be typed again (SA15, SA16).
assert_superadmin(str_contains($faculty, "FROM courses WHERE status = 'active' ORDER BY course_code ASC"), 'The Faculty course picker lists active courses only');
assert_superadmin(substr_count($faculty, "'This course was retired by the Dean. Ask the Dean to restore it.', 409, 'course_retired'") === 2, 'A retired course (typed code or id) is refused with the Dean message');

// Deactivation (SA19-SA23).
$deactivate = substr($controller, (int) strpos($controller, 'function people_deactivate'), 3600);
foreach ([
    'people_fetch($pdo, $userId, true)' => 'locks the account row (FOR UPDATE)', 'auth_invalidate_account' => 'bumps token_version', 'auth_revoke_session' => 'revokes every session',
    "'Account deactivated'" => 'uses the session revocation reason', 'archived_at IS NULL' => 'ignores archived classes',
    "'account_deactivated'" => 'writes an audit row',
] as $needle => $what) {
    assert_superadmin(str_contains($deactivate, $needle), "Deactivation {$what}");
}
assert_superadmin(str_contains($controller, "FOR UPDATE OF ua"), 'The account lookup can lock the row');
assert_superadmin(str_contains($controller, "ua.role IN ('student', 'secretary') AND s.student_id IS NOT NULL") && str_contains($controller, "signs in with the Student's own account (REG-006)"), 'A Student who is a Class Secretary is one account, so one deactivation blocks both sign-ins (answer 3)');
assert_superadmin(str_contains($controller, "ua.role = 'faculty' OR (ua.role IN ('student', 'secretary') AND s.student_id IS NOT NULL)"), 'Only Faculty and Student accounts are people: Deans and Secretary-only accounts are not (SA23)');
assert_superadmin(str_contains($controller, "'faculty_has_current_classes'") && str_contains($controller, 'Reassign or archive them first.'), 'A Faculty member with current classes is refused with the list');

// Sign-in message (answer 4).
assert_superadmin((new InactiveAccountException('Disabled'))->getMessage() === 'Account status: Disabled. Contact the Dean.', 'A deactivated account sees the existing message plus "Contact the Dean."');
assert_superadmin((new InactiveAccountException('Pending Activation'))->getMessage() === 'Account status: Pending Activation', 'Other statuses keep their message');

// Audit catalogue: codes, Dean visibility, class-work scope.
foreach (['course_updated' => 'Course changed', 'course_retired' => 'Course retired', 'course_restored' => 'Course restored',
    'account_deactivated' => 'Account deactivated', 'account_reactivated' => 'Account reactivated'] as $code => $label) {
    $info = audit_code_info($code);
    assert_superadmin($info['label'] === $label && $info['deanVisible'] === true, "{$code} is labelled and Dean-visible");
}
assert_superadmin(audit_code_info('account_deactivated')['area'] === AUDIT_AREA_PEOPLE && audit_code_info('course_retired')['area'] === AUDIT_AREA_SETTINGS, 'Account events are People & accounts, course events Settings & terms');
$classWork = array_keys(array_filter(audit_catalogue(), static fn(array $c): bool => in_array($c[1], AUDIT_CLASS_WORK_AREAS, true) && !$c[2]));
assert_superadmin(in_array('assessment_scores_saved', $classWork, true) && in_array('faculty_attendance_change', $classWork, true) && in_array('retention_remedial_save', $classWork, true)
    && !in_array('login_failed', $classWork, true) && !in_array('room_created', $classWork, true), 'Class-work scope is grades, attendance and retention codes only');

$overview = audit_read_params([], 'admin');
assert_superadmin($overview['scope'] === 'overview' && $overview['facultyId'] === '' && $overview['studentId'] === '', 'The Dean query defaults to the overview');
$work = audit_read_params(['scope' => 'class_work', 'area' => 'Grading', 'facultyId' => '3', 'classId' => '9', 'studentId' => '12'], 'admin');
assert_superadmin($work['scope'] === 'class_work' && $work['area'] === 'Grading' && $work['facultyId'] === '3' && $work['classId'] === '9' && $work['studentId'] === '12', 'Class-work scope takes the area and the Faculty, class and Student filters');
assert_superadmin(audit_read_params(['scope' => 'class_work', 'facultyId' => '3'], 'faculty')['scope'] === 'overview', 'Other roles can never ask for class-work scope');
assert_superadmin(audit_read_params(['facultyId' => '3', 'studentId' => '5'], 'admin')['facultyId'] === '', 'The class-work filters are ignored in the overview');
foreach ([['scope' => 'everything'], ['scope' => 'class_work', 'facultyId' => 'x'], ['scope' => 'class_work', 'studentId' => '0'], ['area' => 'Grading']] as $bad) {
    try {
        audit_read_params($bad, 'admin');
        assert_superadmin(false, 'Rejects ' . json_encode($bad));
    } catch (ValidationException) {
        assert_superadmin(true, 'Rejects ' . json_encode($bad));
    }
}
assert_superadmin(str_contains($audit, "if (\$role === 'admin' && \$p['scope'] === 'class_work') {") && str_contains($audit, "e.action_code IN ({\$classWorkCodes})"), 'Class-work scope replaces the Dean visibility filter with the class-work codes');

// JSON shapes.
$course = course_json(['course_id' => '12', 'course_code' => 'DENT 101', 'name' => 'Dental Anatomy', 'units' => '3.0', 'lecture_units' => '2.0', 'lab_units' => '1.0',
    'status' => 'active', 'retired_at' => null, 'class_count' => '4', 'current_class_count' => '2']);
assert_superadmin($course['id'] === 12 && $course['units'] === 3.0 && $course['labUnits'] === 1.0 && $course['classCount'] === 4 && array_key_exists('retiredAt', $course) && $course['retiredAt'] === null, 'A course carries id, units, usage counts and a null retiredAt');
$legacy = course_json(['course_id' => '2', 'course_code' => 'A', 'name' => 'B', 'units' => '3.0', 'lecture_units' => null, 'lab_units' => null,
    'status' => 'retired', 'retired_at' => '2026-11-14 01:00:00', 'class_count' => '0', 'current_class_count' => '0']);
assert_superadmin($legacy['lectureUnits'] === null && $legacy['status'] === 'retired' && str_starts_with((string) $legacy['retiredAt'], '2026-11-14T09:00:00'), 'An older course keeps a null lecture/lab split; retiredAt is Manila time');
$person = people_json(['user_id' => '7', 'display_name' => 'Dr. A', 'login_email' => 'a@x.test', 'kind' => 'faculty', 'status' => 'Disabled', 'disabled_at' => null,
    'two_factor' => true, 'last_activity_at' => null, 'student_number' => null], [['csId' => 1, 'label' => 'DENT-1A', 'schoolYear' => '2026-2027', 'current' => true]]);
assert_superadmin($person['status'] === 'deactivated' && $person['twoFactor'] === true && $person['classes'][0]['current'] === true && !array_key_exists('enrolledClasses', $person), 'A Faculty person lists classes and a Disabled account reads as deactivated');
$student = people_json(['user_id' => '8', 'display_name' => 'S', 'login_email' => 's@x.test', 'kind' => 'student', 'status' => 'Active', 'disabled_at' => null,
    'two_factor' => false, 'last_activity_at' => null, 'student_number' => '2026-1'], []);
assert_superadmin($student['studentNo'] === '2026-1' && $student['enrolledClasses'] === [] && !array_key_exists('classes', $student), 'A Student person has a student number and enrolled classes');
