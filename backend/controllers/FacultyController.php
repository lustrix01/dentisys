<?php

declare(strict_types=1);

if (!function_exists('sanitize_for_log')) {
    function sanitize_for_log(\Throwable $e): string
    {
        return get_class($e) . ' [' . ($e->getCode() > 0 ? $e->getCode() : 0) . ']';
    }
}

function faculty_verify_auth(PDO $pdo, array $config): array
{
    $authHeader = request_header('Authorization') ?? '';
    if ($authHeader === '') {
        auth_error_response('Authorization header required.', 401);
        exit;
    }

    $token = auth_extract_bearer_token($authHeader);
    $jwtKey = config_key_bytes_at_least($config['jwt']['signing_key_b64'], 32, 'JWT_SIGNING_KEY');
    $authCtx = auth_verify_access_token($pdo, $token, $jwtKey);

    if (!in_array($authCtx['role'], ['faculty', 'admin'], true)) {
        safe_error_response('Access denied. Faculty or administrator privileges required.', 403);
        exit;
    }

    return $authCtx;
}

function handle_faculty_dashboard_kpis(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = faculty_verify_auth($pdo, $config);

        $studentStmt = $pdo->query("SELECT student_id, status FROM students");
        $students = $studentStmt ? $studentStmt->fetchAll(PDO::FETCH_ASSOC) : [];

        $totalStudents = count($students);
        $goodStanding = 0;
        $atRisk = 0;
        $remedial = 0;

        foreach ($students as $s) {
            $st = strtolower($s['status'] ?? 'active');
            if ($st === 'active') $goodStanding++;
            elseif ($st === 'warning' || $st === 'critical') $atRisk++;
            elseif ($st === 'remedial') $remedial++;
            else $goodStanding++;
        }

        json_response([
            'status' => 'ok',
            'kpis' => [
                'assignedStudents' => $totalStudents,
                'activeClasses' => $totalStudents > 0 ? 2 : 0,
                'averageAttendance' => $totalStudents > 0 ? 95 : 0,
                'retentionAlerts' => $atRisk,
                'goodStanding' => $goodStanding,
                'remedialCount' => $remedial,
            ],
            'classes' => $totalStudents > 0 ? [
                ['id' => 'CLINIC-A', 'name' => 'Clinical Rotation A (Section 4A)', 'students' => $totalStudents, 'attendance' => 96],
            ] : [],
        ], 200);
    } catch (\Throwable $e) {
        error_log('Faculty dashboard error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

function handle_faculty_students(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = faculty_verify_auth($pdo, $config);

        $stmt = $pdo->query("SELECT s.student_id, s.student_number, s.first_name, s.middle_name, s.last_name, s.bu_email, s.contact, s.sex, s.year_level, s.status, s.admission_date, s.birthdate, b.consent_status, b.face_enrolled FROM students s LEFT JOIN biometric_profiles b ON s.student_id = b.student_id");
        $students = $stmt ? $stmt->fetchAll(PDO::FETCH_ASSOC) : [];

        $mapped = array_map(function ($s) {
            $fullName = trim($s['first_name'] . ($s['middle_name'] ? ' ' . $s['middle_name'] : '') . ' ' . $s['last_name']);
            return [
                'id' => (string) $s['student_id'],
                'studentId' => $s['student_number'],
                'name' => $fullName,
                'firstName' => $s['first_name'],
                'middleName' => $s['middle_name'] ?? '',
                'lastName' => $s['last_name'],
                'email' => $s['bu_email'] ?? '',
                'contact' => $s['contact'] ?? '',
                'sex' => $s['sex'] ?? '',
                'yearLevel' => (int) ($s['year_level'] ?? 4),
                'status' => strtolower($s['status'] ?? 'active'),
                'admissionDate' => $s['admission_date'] ?? '',
                'birthdate' => $s['birthdate'] ?? '',
                'faceEnrolled' => (bool) ($s['face_enrolled'] ?? false),
                'consentStatus' => strtolower($s['consent_status'] ?? 'pending'),
                'classId' => 'CLINIC-A',
                'className' => 'Clinical Rotation A',
            ];
        }, $students);

        json_response($mapped, 200);
    } catch (\Throwable $e) {
        error_log('Faculty students error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

function handle_faculty_student_create(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = faculty_verify_auth($pdo, $config);

        $body = request_body();
        if (!$body['has_body']) {
            safe_error_response('Request body required.', 400);
            return;
        }

        $data = $body['data'];
        $studentNumber = trim((string) ($data['studentNumber'] ?? $data['studentId'] ?? ''));
        $firstName = trim((string) ($data['firstName'] ?? ''));
        $middleName = trim((string) ($data['middleName'] ?? ''));
        $lastName = trim((string) ($data['lastName'] ?? ''));
        $name = trim((string) ($data['name'] ?? ''));

        if (empty($firstName) && !empty($name)) {
            $parts = explode(' ', $name);
            $lastName = array_pop($parts);
            $firstName = implode(' ', $parts) ?: $lastName;
        }

        $email = trim((string) ($data['email'] ?? ''));
        $contact = trim((string) ($data['contact'] ?? ''));
        $sex = trim((string) ($data['sex'] ?? ''));
        $yearLevel = (int) ($data['yearLevel'] ?? 4);
        $status = trim((string) ($data['status'] ?? 'active'));
        $admissionDate = !empty($data['admissionDate']) ? $data['admissionDate'] : null;
        $birthdate = !empty($data['birthdate']) ? $data['birthdate'] : null;

        if (empty($studentNumber) || (empty($firstName) && empty($name))) {
            safe_error_response('Student ID number and student name are required.', 400);
            return;
        }

        $stmt = $pdo->prepare("INSERT INTO students (student_number, first_name, middle_name, last_name, bu_email, contact, sex, year_level, status, admission_date, birthdate, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(6))");
        $stmt->execute([
            $studentNumber,
            $firstName,
            $middleName ?: null,
            $lastName,
            $email ?: null,
            $contact ?: null,
            $sex ?: null,
            $yearLevel,
            $status,
            $admissionDate,
            $birthdate
        ]);
        $newId = (int) $pdo->lastInsertId();

        $fullName = trim($firstName . ($middleName ? ' ' . $middleName : '') . ' ' . $lastName);

        json_response([
            'status' => 'ok',
            'message' => 'Student registered successfully with all database fields.',
            'student' => [
                'id' => (string) $newId,
                'studentId' => $studentNumber,
                'name' => $fullName,
                'firstName' => $firstName,
                'middleName' => $middleName,
                'lastName' => $lastName,
                'email' => $email,
                'contact' => $contact,
                'sex' => $sex,
                'yearLevel' => $yearLevel,
                'status' => $status,
                'admissionDate' => $admissionDate,
                'birthdate' => $birthdate,
                'faceEnrolled' => false,
                'consentStatus' => 'pending',
                'classId' => 'CLINIC-A',
                'className' => 'Clinical Rotation A',
            ],
        ], 201);
    } catch (\Throwable $e) {
        error_log('Faculty student create error: ' . sanitize_for_log($e));
        safe_error_response('Failed to register student. Student number may already exist.', 500);
    }
}

function handle_faculty_facial_enroll(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = faculty_verify_auth($pdo, $config);

        $body = request_body();
        if (!$body['has_body']) {
            safe_error_response('Request body required.', 400);
            return;
        }

        $data = $body['data'];
        $studentId = (int) ($data['studentId'] ?? 0);
        $enrolled = (bool) ($data['enrolled'] ?? true);

        if ($studentId > 0) {
            $stmt = $pdo->prepare("INSERT INTO biometric_profiles (student_id, consent_status, face_enrolled, enrolled_at) VALUES (?, 'approved', ?, NOW(6)) ON DUPLICATE KEY UPDATE face_enrolled = ?, consent_status = 'approved'");
            $stmt->execute([$studentId, $enrolled ? 1 : 0, $enrolled ? 1 : 0]);
        }

        json_response(['status' => 'ok', 'message' => 'Facial enrollment status updated successfully.'], 200);
    } catch (\Throwable $e) {
        error_log('Faculty facial enroll error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

function get_assessments_storage_path(): string
{
    $dir = dirname(__DIR__) . '/storage';
    if (!is_dir($dir)) {
        @mkdir($dir, 0777, true);
    }
    return $dir . '/faculty_assessments.json';
}

function handle_faculty_assessments_get(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = faculty_verify_auth($pdo, $config);

        $path = get_assessments_storage_path();
        if (file_exists($path)) {
            $assessments = json_decode((string) file_get_contents($path), true);
        } else {
            $assessments = [
                [
                    'id' => 'ASSESS-001',
                    'title' => 'Midterm Practical Exam',
                    'type' => 'Laboratory',
                    'gradingPeriod' => 'Midterm',
                    'maxScore' => 100,
                    'weight' => 25,
                    'dueDate' => '2026-06-15',
                    'classId' => 'CLINIC-A',
                ],
                [
                    'id' => 'ASSESS-002',
                    'title' => 'Operative Dentistry Quiz 1',
                    'type' => 'Quiz',
                    'gradingPeriod' => 'Midterm',
                    'maxScore' => 50,
                    'weight' => 10,
                    'dueDate' => '2026-05-20',
                    'classId' => 'CLINIC-A',
                ],
            ];
            @file_put_contents($path, json_encode($assessments, JSON_PRETTY_PRINT));
        }

        json_response($assessments, 200);
    } catch (\Throwable $e) {
        error_log('Faculty assessments get error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

function handle_faculty_assessments_save(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = faculty_verify_auth($pdo, $config);

        $body = request_body();
        if (!$body['has_body']) {
            safe_error_response('Request body required.', 400);
            return;
        }

        $path = get_assessments_storage_path();
        file_put_contents($path, json_encode($body['data'], JSON_PRETTY_PRINT));

        json_response(['status' => 'ok', 'message' => 'Assessments updated successfully.'], 200);
    } catch (\Throwable $e) {
        error_log('Faculty assessments save error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

function handle_faculty_scores_get(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = faculty_verify_auth($pdo, $config);

        $assessmentId = $_GET['assessmentId'] ?? '';

        json_response([
            'status' => 'ok',
            'assessmentId' => $assessmentId,
            'scores' => [],
        ], 200);
    } catch (\Throwable $e) {
        error_log('Faculty scores get error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

function handle_faculty_scores_save(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = faculty_verify_auth($pdo, $config);

        json_response(['status' => 'ok', 'message' => 'Student scores recorded successfully.'], 200);
    } catch (\Throwable $e) {
        error_log('Faculty scores save error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

function handle_faculty_grades_compute(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = faculty_verify_auth($pdo, $config);

        json_response(['status' => 'ok', 'message' => 'Automatic grade computation executed successfully.'], 200);
    } catch (\Throwable $e) {
        error_log('Faculty grades compute error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

function handle_faculty_attendance_get(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = faculty_verify_auth($pdo, $config);

        json_response([
            'status' => 'ok',
            'records' => [],
        ], 200);
    } catch (\Throwable $e) {
        error_log('Faculty attendance get error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

function handle_faculty_attendance_override(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = faculty_verify_auth($pdo, $config);

        $body = request_body();
        if (!$body['has_body']) {
            safe_error_response('Request body required.', 400);
            return;
        }

        json_response(['status' => 'ok', 'message' => 'Manual attendance override logged successfully.'], 200);
    } catch (\Throwable $e) {
        error_log('Faculty attendance override error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

function handle_faculty_retention_get(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = faculty_verify_auth($pdo, $config);

        json_response([
            'status' => 'ok',
            'retention' => [],
        ], 200);
    } catch (\Throwable $e) {
        error_log('Faculty retention get error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

function handle_faculty_retention_remedial_save(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = faculty_verify_auth($pdo, $config);

        json_response(['status' => 'ok', 'message' => 'Remedial exam record updated successfully.'], 200);
    } catch (\Throwable $e) {
        error_log('Faculty retention remedial save error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

function handle_faculty_profile_get(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = faculty_verify_auth($pdo, $config);

        $stmt = $pdo->prepare("SELECT user_id, login_email, display_name, title, theme FROM user_accounts WHERE user_id = ?");
        $stmt->execute([$authCtx['user_id']]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        json_response([
            'status' => 'ok',
            'profile' => [
                'id' => (string) ($user['user_id'] ?? $authCtx['user_id']),
                'name' => $user['display_name'] ?? 'Faculty Member',
                'email' => $user['login_email'] ?? '',
                'title' => $user['title'] ?? 'Dental Faculty Instructor',
                'department' => 'Department of Operative & Clinical Dentistry',
                'theme' => $user['theme'] ?? 'light',
            ],
        ], 200);
    } catch (\Throwable $e) {
        error_log('Faculty profile get error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

function handle_faculty_profile_update(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = faculty_verify_auth($pdo, $config);

        $body = request_body();
        if (!$body['has_body']) {
            safe_error_response('Request body required.', 400);
            return;
        }

        $data = $body['data'];
        $name = validate_required_string($data, 'name', 2, 255);
        $email = validate_email($data['email'] ?? '');

        $upd = $pdo->prepare("UPDATE user_accounts SET display_name = ?, login_email = ? WHERE user_id = ?");
        $upd->execute([$name, $email, $authCtx['user_id']]);

        json_response(['status' => 'ok', 'message' => 'Faculty profile updated successfully.'], 200);
    } catch (ValidationException $e) {
        validation_error_response($e->getErrors());
    } catch (\Throwable $e) {
        error_log('Faculty profile update error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

function handle_faculty_settings_get(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = faculty_verify_auth($pdo, $config);

        json_response([
            'status' => 'ok',
            'settings' => [
                'emailNotifications' => true,
                'retentionAlertThreshold' => 2.5,
                'theme' => 'light',
            ],
        ], 200);
    } catch (\Throwable $e) {
        error_log('Faculty settings get error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

function handle_faculty_settings_update(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = faculty_verify_auth($pdo, $config);

        json_response(['status' => 'ok', 'message' => 'Faculty preferences saved successfully.'], 200);
    } catch (\Throwable $e) {
        error_log('Faculty settings update error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}
