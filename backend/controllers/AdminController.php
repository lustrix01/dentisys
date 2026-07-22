<?php

declare(strict_types=1);

if (!function_exists('sanitize_for_log')) {
    function sanitize_for_log(\Throwable $e): string
    {
        return get_class($e) . ' [' . ($e->getCode() > 0 ? $e->getCode() : 0) . ']';
    }
}

function admin_verify_auth(PDO $pdo, array $config): array
{
    $authHeader = request_header('Authorization') ?? '';
    if ($authHeader === '') {
        auth_error_response('Authorization header required.', 401);
        exit;
    }

    try {
        $token = auth_extract_bearer_token($authHeader);
        $jwtKey = config_key_bytes_at_least($config['jwt']['signing_key_b64'], 32, 'JWT_SIGNING_KEY');
        $authCtx = auth_verify_access_token($pdo, $token, $jwtKey);
    } catch (AuthException | \RuntimeException $e) {
        auth_error_response($e->getMessage(), 401);
        exit;
    }

    if ($authCtx['role'] !== 'admin') {
        safe_error_response('Access denied. Administrator privileges required.', 403);
        exit;
    }

    return $authCtx;
}

function handle_admin_dashboard_kpis(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = admin_verify_auth($pdo, $config);

        // Fetch counts from database
        $studentStmt = $pdo->query("
            SELECT 
                s.student_id, 
                s.student_number, 
                s.first_name, 
                s.last_name, 
                s.year_level, 
                s.status AS student_status,
                e.final_gwa,
                e.retention_state
            FROM students s
            LEFT JOIN enrollments e ON s.student_id = e.student_id
        ");
        $students = $studentStmt ? $studentStmt->fetchAll(PDO::FETCH_ASSOC) : [];

        $facultyStmt = $pdo->query("SELECT user_id, display_name, login_email, status FROM user_accounts WHERE role = 'faculty'");
        $faculty = $facultyStmt ? $facultyStmt->fetchAll(PDO::FETCH_ASSOC) : [];

        $attStmt = $pdo->query("
            SELECT 
                ar.record_id, 
                ar.status, 
                cs.cs_name
            FROM attendance_records ar
            LEFT JOIN enrollments e ON ar.enrollment_id = e.enrollment_id
            LEFT JOIN class_sections cs ON e.cs_id = cs.cs_id
        ");
        $attendance = $attStmt ? $attStmt->fetchAll(PDO::FETCH_ASSOC) : [];

        $totalStudents = count($students);

        $goodStanding = 0;
        $warningCount = 0;
        $criticalCount = 0;
        $remedialCount = 0;

        $gwa1_15 = 0;
        $gwa15_2 = 0;
        $gwa2_25 = 0;
        $gwa25_3 = 0;
        $gwa3plus = 0;

        foreach ($students as $s) {
            $st = strtolower($s['retention_state'] ?? $s['student_status'] ?? 'active');
            if ($st === 'active' || $st === 'good standing') {
                $goodStanding++;
            } elseif ($st === 'warning') {
                $warningCount++;
            } elseif ($st === 'critical') {
                $criticalCount++;
            } elseif ($st === 'remedial') {
                $remedialCount++;
            } else {
                $goodStanding++;
            }

            if (isset($s['final_gwa']) && $s['final_gwa'] !== null) {
                $gwa = (float) $s['final_gwa'];
                if ($gwa <= 1.5) {
                    $gwa1_15++;
                } elseif ($gwa <= 2.0) {
                    $gwa15_2++;
                } elseif ($gwa <= 2.5) {
                    $gwa2_25++;
                } elseif ($gwa <= 3.0) {
                    $gwa25_3++;
                } else {
                    $gwa3plus++;
                }
            } else {
                $gwa2_25++;
            }
        }

        $atRisk = $warningCount + $criticalCount;

        $attCount = count($attendance);
        $presentCount = 0;
        $classAttCounts = [];

        foreach ($attendance as $a) {
            $st = strtolower($a['status'] ?? '');
            $cName = $a['cs_name'] ?? 'CLINIC-A';
            if (!isset($classAttCounts[$cName])) {
                $classAttCounts[$cName] = ['total' => 0, 'present' => 0];
            }
            $classAttCounts[$cName]['total']++;

            if ($st === 'present' || $st === 'late') {
                $presentCount++;
                $classAttCounts[$cName]['present']++;
            }
        }

        $attendanceRate = $attCount > 0 ? (int) round(($presentCount / $attCount) * 100) : 100;

        $classAttendance = [];
        foreach ($classAttCounts as $cName => $counts) {
            $rate = $counts['total'] > 0 ? (int) round(($counts['present'] / $counts['total']) * 100) : 100;
            $classAttendance[] = ['name' => $cName, 'rate' => $rate];
        }
        if (empty($classAttendance)) {
            $classAttendance = [
                ['name' => 'CLINIC-A', 'rate' => 100],
            ];
        }

        $facultyList = array_map(function ($f) {
            return [
                'id' => (string) $f['user_id'],
                'name' => $f['display_name'] ?? 'Faculty Member',
                'email' => $f['login_email'] ?? '',
                'classes' => 'CLINIC-A, CLINIC-B',
                'subjects' => 'CLIN401, CLIN402',
                'status' => strtolower($f['status'] ?? 'approved'),
            ];
        }, $faculty);

        $activeFacultyCount = count(array_filter($facultyList, fn($f) => ($f['status'] ?? '') === 'active' || ($f['status'] ?? '') === 'approved'));

        json_response([
            'status' => 'ok',
            'kpis' => [
                'totalStudents' => $totalStudents,
                'totalFaculty' => $activeFacultyCount > 0 ? $activeFacultyCount : count($facultyList),
                'goodStanding' => $goodStanding,
                'atRisk' => $atRisk,
                'remedialCount' => $remedialCount,
                'attendanceRate' => $attendanceRate,
            ],
            'facultyList' => $facultyList,
            'gwaBuckets' => [
                ['range' => '1.0–1.5', 'count' => $gwa1_15, 'color' => '#10B981'],
                ['range' => '1.5–2.0', 'count' => $gwa15_2, 'color' => '#34D399'],
                ['range' => '2.0–2.5', 'count' => $gwa2_25, 'color' => '#F59E0B'],
                ['range' => '2.5–3.0', 'count' => $gwa25_3, 'color' => '#F97316'],
                ['range' => '3.0+', 'count' => $gwa3plus, 'color' => '#EF4444'],
            ],
            'statusCounts' => [
                'active' => $goodStanding,
                'warning' => $warningCount,
                'critical' => $criticalCount,
                'remedial' => $remedialCount,
            ],
            'classAttendance' => $classAttendance,
        ], 200);
    } catch (\Throwable $e) {
        error_log('Admin dashboard error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

function get_retention_storage_path(): string
{
    $dir = dirname(__DIR__) . '/storage';
    if (!is_dir($dir)) {
        @mkdir($dir, 0777, true);
    }
    return $dir . '/retention_criteria.json';
}

function handle_admin_retention_criteria_get(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = admin_verify_auth($pdo, $config);

        $path = get_retention_storage_path();
        if (file_exists($path)) {
            $data = json_decode((string) file_get_contents($path), true);
        } else {
            $data = [
                [
                    'id' => 'RC-001',
                    'name' => 'Standard Clinical Retention',
                    'description' => 'Primary threshold for all Year 3–4 clinical rotations. Students failing this are flagged for warning.',
                    'minGrade' => 2.5,
                    'minAttendance' => 80,
                    'maxRemedialSubjects' => 1,
                    'appliesToClinical' => true,
                    'enabled' => true,
                    'lastUpdated' => '2026-06-01',
                    'updatedBy' => 'admin@bicol-u.edu.ph',
                ],
                [
                    'id' => 'RC-002',
                    'name' => 'Didactic Course Standard',
                    'description' => 'Applies to non-clinical lecture and lab courses. Slightly relaxed compared to clinical standard.',
                    'minGrade' => 3.0,
                    'minAttendance' => 75,
                    'maxRemedialSubjects' => 2,
                    'appliesToClinical' => false,
                    'enabled' => true,
                    'lastUpdated' => '2026-05-15',
                    'updatedBy' => 'admin@bicol-u.edu.ph',
                ],
            ];
            @file_put_contents($path, json_encode($data, JSON_PRETTY_PRINT));
        }

        json_response($data, 200);
    } catch (\Throwable $e) {
        error_log('Admin retention criteria get error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

function handle_admin_retention_criteria_save(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = admin_verify_auth($pdo, $config);

        $body = request_body();
        if (!$body['has_body']) {
            safe_error_response('Request body required.', 400);
            return;
        }

        $items = $body['data'];
        if (!is_array($items)) {
            safe_error_response('Array of retention criteria required.', 400);
            return;
        }

        $path = get_retention_storage_path();
        file_put_contents($path, json_encode($items, JSON_PRETTY_PRINT));

        json_response(['status' => 'ok', 'message' => 'Retention criteria updated successfully.'], 200);
    } catch (\Throwable $e) {
        error_log('Admin retention criteria save error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

function handle_admin_audit_logs(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authHeader = request_header('Authorization') ?? '';
        if ($authHeader === '') {
            auth_error_response('Authorization header required.', 401);
            return;
        }

        try {
            $token = auth_extract_bearer_token($authHeader);
            $jwtKey = config_key_bytes_at_least($config['jwt']['signing_key_b64'], 32, 'JWT_SIGNING_KEY');
            $authCtx = auth_verify_access_token($pdo, $token, $jwtKey);
        } catch (AuthException | \RuntimeException $e) {
            auth_error_response($e->getMessage(), 401);
            return;
        }

        $query = $_GET['query'] ?? '';
        $role = $_GET['role'] ?? 'all';
        $module = $_GET['module'] ?? 'all';
        $status = $_GET['status'] ?? 'all';
        $date = $_GET['date'] ?? '';

        $sql = "SELECT event_id AS id, event_uuid, occurred_at AS timestamp, actor_username AS userName, actor_role AS userRole, action_code AS action, module_code AS module, description, event_status AS status, ip_address AS ipAddress, user_agent AS device
                FROM audit_events WHERE 1=1";
        $params = [];

        // Scoping for non-admin users (faculty/secretary)
        if ($authCtx['role'] !== 'admin') {
            $sql .= " AND (actor_user_id = ? OR actor_role = ?)";
            $params[] = $authCtx['user_id'];
            $params[] = $authCtx['role'];
        }

        if ($role !== 'all') {
            $sql .= " AND actor_role = ?";
            $params[] = $role;
        }
        if ($module !== 'all') {
            $sql .= " AND module_code = ?";
            $params[] = $module;
        }
        if ($status !== 'all') {
            $sql .= " AND event_status = ?";
            $params[] = $status;
        }
        if ($date !== '') {
            $sql .= " AND DATE(occurred_at) = ?";
            $params[] = $date;
        }
        if ($query !== '') {
            $sql .= " AND (actor_username LIKE ? OR action_code LIKE ? OR description LIKE ?)";
            $params[] = "%{$query}%";
            $params[] = "%{$query}%";
            $params[] = "%{$query}%";
        }

        $sql .= " ORDER BY occurred_at DESC LIMIT 200";

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $logs = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Normalize data for frontend AuditLog format
        $normalized = array_map(function ($l) {
            return [
                'id' => (string) $l['id'],
                'timestamp' => $l['timestamp'],
                'userName' => $l['userName'] ?? 'System',
                'userRole' => $l['userRole'] ?? 'system',
                'action' => $l['action'] ?? 'Operation',
                'module' => $l['module'] ?? 'System',
                'description' => $l['description'] ?? '',
                'status' => $l['status'] ?? 'Success',
                'ipAddress' => $l['ipAddress'] ?? '127.0.0.1',
                'device' => $l['device'] ?? 'Browser',
            ];
        }, $logs);

        json_response($normalized, 200);
    } catch (\Throwable $e) {
        error_log('Admin audit logs error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

function handle_admin_profile_get(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = admin_verify_auth($pdo, $config);

        $stmt = $pdo->prepare("SELECT user_id, login_email, display_name, title, theme FROM user_accounts WHERE user_id = ?");
        $stmt->execute([$authCtx['user_id']]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($user === false) {
            safe_error_response('User profile not found.', 404);
            return;
        }

        json_response([
            'status' => 'ok',
            'profile' => [
                'id' => (string) $user['user_id'],
                'name' => $user['display_name'],
                'email' => $user['login_email'],
                'title' => $user['title'] ?? 'Academic Dean',
                'office' => 'Dean Office, BU Dental Medicine',
                'theme' => $user['theme'] ?? 'light',
            ],
        ], 200);
    } catch (\Throwable $e) {
        error_log('Admin profile get error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

function handle_admin_profile_update(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = admin_verify_auth($pdo, $config);

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

        json_response(['status' => 'ok', 'message' => 'Profile details updated successfully.'], 200);
    } catch (ValidationException $e) {
        validation_error_response($e->getErrors());
    } catch (\Throwable $e) {
        error_log('Admin profile update error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

function get_settings_storage_path(): string
{
    $dir = dirname(__DIR__) . '/storage';
    if (!is_dir($dir)) {
        @mkdir($dir, 0777, true);
    }
    return $dir . '/system_settings.json';
}

function handle_admin_settings_get(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = admin_verify_auth($pdo, $config);

        $path = get_settings_storage_path();
        if (file_exists($path)) {
            $settings = json_decode((string) file_get_contents($path), true);
        } else {
            $settings = [
                'theme' => 'light',
                'retentionThreshold' => 2.5,
                'weights' => [
                    'practicum' => 40,
                    'exams' => 30,
                    'quizzes' => 20,
                    'attendance' => 10,
                ],
            ];
            @file_put_contents($path, json_encode($settings, JSON_PRETTY_PRINT));
        }

        json_response(['status' => 'ok', 'settings' => $settings], 200);
    } catch (\Throwable $e) {
        error_log('Admin settings get error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

function handle_admin_settings_update(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = admin_verify_auth($pdo, $config);

        $body = request_body();
        if (!$body['has_body']) {
            safe_error_response('Request body required.', 400);
            return;
        }

        $settings = $body['data'];
        $path = get_settings_storage_path();
        file_put_contents($path, json_encode($settings, JSON_PRETTY_PRINT));

        json_response(['status' => 'ok', 'message' => 'System settings updated successfully.'], 200);
    } catch (\Throwable $e) {
        error_log('Admin settings update error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

function handle_admin_reports_summary(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = admin_verify_auth($pdo, $config);

        // Fetch students with biometric consent
        $stmt = $pdo->query(
            "SELECT s.student_id, s.student_number, s.first_name, s.middle_name, s.last_name, s.bu_email, s.year_level, s.status,
                    b.consent_status, b.face_enrolled
             FROM students s
             LEFT JOIN biometric_profiles b ON s.student_id = b.student_id
             ORDER BY s.student_number ASC"
        );
        $students = $stmt ? $stmt->fetchAll(PDO::FETCH_ASSOC) : [];

        // Fetch attendance logs
        $attStmt = $pdo->query(
            "SELECT record_id AS id, enrollment_id AS studentId, session_date AS date, session_code AS subjectCode, status
             FROM attendance_records
             ORDER BY session_date DESC LIMIT 500"
        );
        $attendanceLogs = $attStmt ? $attStmt->fetchAll(PDO::FETCH_ASSOC) : [];

        $mappedStudents = array_map(function ($s) {
            $fullName = trim($s['first_name'] . ' ' . ($s['middle_name'] ? $s['middle_name'] . ' ' : '') . $s['last_name']);
            return [
                'id' => (string) $s['student_id'],
                'studentId' => $s['student_number'],
                'name' => $fullName,
                'email' => $s['bu_email'] ?? '',
                'yearLevel' => (int) ($s['year_level'] ?? 4),
                'status' => strtolower($s['status'] ?? 'active'),
                'overallGWA' => 1.75,
                'faceEnrolled' => (bool) ($s['face_enrolled'] ?? false),
                'consentStatus' => $s['consent_status'] ?? 'pending',
                'classId' => 'CLINIC-A',
                'enrolledSubjects' => [
                    ['code' => 'CLIN401', 'name' => 'Clinical Dentistry I', 'grade' => 1.75, 'hasRemedial' => false],
                    ['code' => 'CLIN402', 'name' => 'Clinical Dentistry II', 'grade' => 2.0, 'hasRemedial' => false],
                ],
                'remedialExams' => [],
            ];
        }, $students);

        json_response([
            'status' => 'ok',
            'reports' => [
                'students' => $mappedStudents,
                'attendance' => $attendanceLogs,
                'totalCount' => count($mappedStudents),
            ],
        ], 200);
    } catch (\Throwable $e) {
        error_log('Admin reports error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}
