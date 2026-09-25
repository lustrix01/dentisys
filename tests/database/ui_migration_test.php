<?php
declare(strict_types=1);

// Run only inside the disposable integration project, after migrations + demo seed.
if (getenv('APP_ENV') !== 'test') {
    fwrite(STDERR, "This test requires the disposable test environment.\n");
    exit(1);
}
require_once dirname(__DIR__, 2) . '/backend/app/config.php';
require_once dirname(__DIR__, 2) . '/backend/app/database.php';
require_once dirname(__DIR__, 2) . '/backend/app/account_identity.php';
$pdo = create_pdo(app_config());

function ui_expect(bool $ok, string $message): void {
    if (!$ok) throw new RuntimeException($message);
    echo "PASS: {$message}\n";
}
function ui_request(string $method, string $path, string $token = '', array $data = []): array {
    $context = stream_context_create(['http' => [
        'method' => $method, 'header' => "Content-Type: application/json\r\nAuthorization: Bearer {$token}\r\nConnection: close\r\n",
        'content' => $method === 'GET' ? '' : json_encode($data), 'ignore_errors' => true, 'timeout' => 20,
    ]]);
    $body = file_get_contents('http://127.0.0.1/api' . $path, false, $context);
    preg_match('/\s(\d{3})\s/', $http_response_header[0] ?? '', $match);
    return [(int) ($match[1] ?? 0), json_decode($body ?: '{}', true)];
}

ui_expect((bool) $pdo->query("SELECT to_regclass('public.person_identities') IS NOT NULL")->fetchColumn(), 'Canonical person relation exists');
ui_expect((bool) $pdo->query("SELECT to_regclass('public.grading_category_period_memberships') IS NOT NULL")->fetchColumn(), 'Normalized grading-period relation exists');
ui_expect((bool) $pdo->query("SELECT to_regclass('public.enrollment_grade_breakdowns') IS NOT NULL")->fetchColumn(), 'Normalized grade-breakdown relation exists');
ui_expect((bool) $pdo->query("SELECT to_regclass('public.enrollment_remedial_states') IS NOT NULL")->fetchColumn(), 'Normalized remedial-state relation exists');
ui_expect((int) $pdo->query('SELECT count(*) FROM user_accounts WHERE person_id IS NULL')->fetchColumn() === 0, 'Existing accounts have canonical person links');
ui_expect((int) $pdo->query('SELECT count(*) FROM students WHERE person_id IS NULL')->fetchColumn() === 0, 'Existing Students have canonical person links');
ui_expect((int) $pdo->query('SELECT count(*) FROM grading_category_periods')->fetchColumn() === (int) $pdo->query('SELECT count(*) FROM grading_category_period_memberships')->fetchColumn(), 'Period memberships preserve row counts');
ui_expect((int) $pdo->query("SELECT count(*)
    FROM attendance_records r
    JOIN attendance_sessions s ON s.session_id = r.attendance_session_id
    WHERE r.session_date IS DISTINCT FROM s.session_date
       OR r.session_code IS DISTINCT FROM s.session_code")->fetchColumn() === 0, 'Linked attendance rows match session facts');

$decimalProbe = $pdo->query("SELECT
    normalization_jsonb_number('0.9'::jsonb) = 0.9 AS ratio_ok,
    normalization_jsonb_number('22.5'::jsonb) = 22.5 AS contribution_ok,
    normalization_jsonb_number('18'::jsonb) = 18 AS integer_ok")->fetch(PDO::FETCH_ASSOC);
ui_expect(is_array($decimalProbe) && $decimalProbe['ratio_ok'] === true && $decimalProbe['contribution_ok'] === true && $decimalProbe['integer_ok'] === true, 'Decimal JSON numbers and integers normalize without loss');

$accountPersonId = (int) $pdo->query("SELECT person_id FROM user_accounts WHERE login_email = 'faculty@bicol-u.edu.ph'")->fetchColumn();
ui_expect($accountPersonId > 0, 'Faculty account points to a canonical person');
$pdo->beginTransaction();
account_identity_sync_canonical_person($pdo, $accountPersonId, [
    'prefix' => 'Dr.', 'firstName' => 'Faculty', 'middleName' => null, 'lastName' => 'Member', 'suffix' => null,
]);
$personPrefix = $pdo->prepare('SELECT name_prefix FROM person_identities WHERE person_id = ?');
$personPrefix->execute([$accountPersonId]);
$compatibilityPrefix = $pdo->prepare('SELECT name_prefix FROM user_accounts WHERE person_id = ?');
$compatibilityPrefix->execute([$accountPersonId]);
ui_expect($personPrefix->fetchColumn() === 'Dr.' && $compatibilityPrefix->fetchColumn() === 'Dr.', 'Canonical account name updates synchronize the compatibility role copy');
$pdo->rollBack();

$normalizationEnrollmentId = (int) $pdo->query('SELECT enrollment_id FROM enrollments ORDER BY enrollment_id LIMIT 1')->fetchColumn();
ui_expect($normalizationEnrollmentId > 0, 'Normalization fixture has an enrollment');
$pdo->beginTransaction();
$gradeJson = json_encode([
    'calculationMode' => 'authoritative_categories',
    'retentionThreshold' => 2.5,
    'categories' => [[
        'categoryId' => 1,
        'name' => 'Quiz',
        'earnedPoints' => 18,
        'possiblePoints' => 20,
        'ratio' => 0.9,
        'weight' => 25,
        'contribution' => 22.5,
    ]],
], JSON_THROW_ON_ERROR);
$gradeUpdate = $pdo->prepare("UPDATE enrollments SET final_percentage = 90, final_gwa = 1.75, grade_components_json = ?::jsonb WHERE enrollment_id = ?");
$gradeUpdate->execute([$gradeJson, $normalizationEnrollmentId]);
$gradeParts = $pdo->prepare('SELECT calculation_mode, final_percentage, final_gwa, retention_threshold FROM enrollment_grade_breakdowns WHERE enrollment_id = ?');
$gradeParts->execute([$normalizationEnrollmentId]);
$gradeRow = $gradeParts->fetch(PDO::FETCH_ASSOC);
ui_expect(is_array($gradeRow) && $gradeRow['calculation_mode'] === 'authoritative_categories' && $gradeRow['retention_threshold'] === '2.50', 'Grade JSON writes preserve the decimal retention threshold');
$categoryParts = $pdo->prepare('SELECT category_name, earned_points, possible_points, ratio, weight, contribution FROM enrollment_grade_breakdown_categories WHERE enrollment_id = ?');
$categoryParts->execute([$normalizationEnrollmentId]);
$categoryRow = $categoryParts->fetch(PDO::FETCH_ASSOC);
ui_expect(is_array($categoryRow)
    && $categoryRow['category_name'] === 'Quiz'
    && $categoryRow['earned_points'] === '18.0000'
    && $categoryRow['possible_points'] === '20.0000'
    && $categoryRow['ratio'] === '0.90000000'
    && $categoryRow['weight'] === '25.0000'
    && $categoryRow['contribution'] === '22.5000', 'Grade category decimals, ratios and contributions survive at declared precision');

$remedialJson = json_encode([
    'status' => 'pending',
    'originalGrade' => 4.75,
    'remedialScore' => 78.5,
    'remedialGrade' => 2.25,
    'examDate' => '2026-10-01',
    'notes' => 'UI normalization check',
], JSON_THROW_ON_ERROR);
$remedialUpdate = $pdo->prepare("UPDATE enrollments SET remedial_state_json = ?::jsonb WHERE enrollment_id = ?");
$remedialUpdate->execute([$remedialJson, $normalizationEnrollmentId]);
$remedialParts = $pdo->prepare('SELECT status, original_grade, remedial_score, remedial_grade, exam_date, notes FROM enrollment_remedial_states WHERE enrollment_id = ?');
$remedialParts->execute([$normalizationEnrollmentId]);
$remedialRow = $remedialParts->fetch(PDO::FETCH_ASSOC);
ui_expect(is_array($remedialRow)
    && $remedialRow['status'] === 'pending'
    && $remedialRow['original_grade'] === '4.75'
    && $remedialRow['remedial_score'] === '78.50'
    && $remedialRow['remedial_grade'] === '2.25'
    && $remedialRow['exam_date'] === '2026-10-01', 'Remedial decimal grades survive at declared precision');
$pdo->rollBack();

[$status, $login] = ui_request('POST', '/auth/login', '', ['email' => 'faculty@bicol-u.edu.ph', 'password' => 'Faculty123!']);
ui_expect($status === 200 && !empty($login['access_token']), 'Faculty password login');
$token = $login['access_token'];
[$status, $classes] = ui_request('GET', '/faculty/classes', $token);
ui_expect($status === 200 && $classes['currentSchoolYear'] === '2026-2027', 'Configured school year is returned');
$courseId = (int) $pdo->query('SELECT course_id FROM courses ORDER BY course_id LIMIT 1')->fetchColumn();
$tag = bin2hex(random_bytes(4));
$classPayload = ['courseId' => $courseId, 'csName' => 'UI verification ' . $tag, 'schoolYear' => '2026-2027', 'semester' => '1ST', 'yearLevel' => 1, 'block' => 'UI-' . $tag];
[$status, $created] = ui_request('POST', '/faculty/classes', $token, $classPayload);
ui_expect($status === 200 || $status === 201, 'Current-year class creation succeeds: ' . json_encode($created));
$classId = (string) $pdo->query("SELECT cs_id FROM class_sections WHERE cs_name = " . $pdo->quote($classPayload['csName']))->fetchColumn();
[$status] = ui_request('POST', '/faculty/classes', $token, array_merge($classPayload, ['schoolYear' => '2025-2026']));
ui_expect($status === 422, 'Past-year class creation is rejected');
$studentPayload = ['studentId' => 'UI-' . $tag, 'prefix' => 'Ms.', 'firstName' => 'Ana Maria', 'middleName' => 'De Leon', 'lastName' => 'Dela Cruz', 'suffix' => 'III', 'email' => 'ui-' . $tag . '@bicol-u.edu.ph', 'classId' => $classId, 'yearLevel' => 1];
[$status, $created] = ui_request('POST', '/faculty/students', $token, $studentPayload);
ui_expect($status === 200 || $status === 201, 'Five-part Student create succeeds: ' . json_encode($created));
$studentId = (string) $created['student']['id'];
[$status, $students] = ui_request('GET', '/faculty/students', $token);
$student = array_values(array_filter($students, fn($row) => (string) $row['id'] === $studentId))[0] ?? [];
ui_expect($status === 200 && $student['firstName'] === 'Ana Maria' && $student['lastName'] === 'Dela Cruz' && $student['suffix'] === 'III', 'Compound names and affixes survive reload');
[$status] = ui_request('PUT', '/faculty/students/' . $studentId, $token, ['prefix' => '', 'suffix' => '', 'middleName' => '']);
ui_expect($status === 200, 'Optional name parts can be cleared');
$stmt = $pdo->prepare('SELECT name_prefix, middle_name, name_suffix FROM students WHERE student_id = ?');
$stmt->execute([$studentId]);
$parts = $stmt->fetch(PDO::FETCH_ASSOC);
ui_expect($parts['name_prefix'] === null && $parts['name_suffix'] === null && $parts['middle_name'] === null, 'Blank optional parts persist as null');
[$status] = ui_request('PUT', '/faculty/students/' . $studentId, $token, ['prefix' => str_repeat('a', 51)]);
ui_expect($status === 422, 'Overlong prefix returns a validation error');
[$status, $retention] = ui_request('GET', '/faculty/retention', $token);
$record = array_values(array_filter($retention['retention'] ?? [], fn($row) => $row['studentId'] === $studentId))[0] ?? [];
ui_expect($status === 200 && $record['midtermComplete'] === false && $record['watchlistUnlocked'] === false, 'Incomplete midterm starts locked');
foreach ([1, 2] as $attempt) {
    [$status] = ui_request('POST', '/faculty/retention/watchlist/unlock', $token, ['classId' => $classId]);
    ui_expect($status === 200, 'Class-wide manual unlock is idempotent, attempt ' . $attempt);
}
$stmt = $pdo->prepare("SELECT count(*) FROM audit_events WHERE action_code = 'watchlist_unlock' AND scope_cs_id = ?");
$stmt->execute([$classId]);
ui_expect((int) $stmt->fetchColumn() === 1, 'Unlock is audited exactly once');
[$status, $retention] = ui_request('GET', '/faculty/retention', $token);
$record = array_values(array_filter($retention['retention'] ?? [], fn($row) => $row['studentId'] === $studentId))[0] ?? [];
ui_expect($record['watchlistUnlocked'] === true && $record['midtermComplete'] === false && $record['midtermPercentage'] === null, 'Unlock survives reload without fabricating grades');
[$status] = ui_request('POST', '/faculty/retention/watchlist/unlock', $token, ['classId' => 2147483000]);
ui_expect($status === 404, 'Unowned class cannot be unlocked');
$pdo->prepare("UPDATE class_sections SET school_year = '2025-2026' WHERE cs_id = ?")->execute([$classId]);
[$status] = ui_request('POST', '/faculty/students', $token, array_merge($studentPayload, ['studentId' => 'UI2-' . $tag]));
ui_expect($status === 409, 'Historical roster rejects new Students');
[$status] = ui_request('PUT', '/faculty/students/' . $studentId, $token, ['firstName' => 'Changed']);
ui_expect($status === 403, 'Historical-only roster cannot edit canonical Student');
[$status] = ui_request('POST', '/faculty/retention/watchlist/unlock', $token, ['classId' => $classId]);
ui_expect($status === 409, 'Historical class cannot be unlocked');
echo "PASS: UI migration database/API checks completed.\n";
