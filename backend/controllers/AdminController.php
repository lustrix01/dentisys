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
                AVG(e.final_gwa) AS final_gwa,
                MAX(CASE e.retention_state
                    WHEN 'critical' THEN 4 WHEN 'remedial' THEN 3
                    WHEN 'warning' THEN 2 WHEN 'active' THEN 1 ELSE 0 END) AS risk_score
            FROM students s
            LEFT JOIN enrollments e ON s.student_id = e.student_id
            GROUP BY s.student_id, s.student_number, s.first_name, s.last_name, s.year_level, s.status
        ");
        $students = $studentStmt ? $studentStmt->fetchAll(PDO::FETCH_ASSOC) : [];

        $facultyStmt = $pdo->query(
            "SELECT u.user_id, u.display_name, u.login_email, u.status,
                    GROUP_CONCAT(DISTINCT cs.cs_name ORDER BY cs.cs_name SEPARATOR ', ') AS classes,
                    GROUP_CONCAT(DISTINCT c.course_code ORDER BY c.course_code SEPARATOR ', ') AS subjects,
                    COUNT(DISTINCT e.student_id) AS student_count
             FROM user_accounts u
             LEFT JOIN class_sections cs ON cs.instructor_user_id = u.user_id
             LEFT JOIN courses c ON c.course_id = cs.course_id
             LEFT JOIN enrollments e ON e.cs_id = cs.cs_id
             WHERE u.role = 'faculty'
             GROUP BY u.user_id, u.display_name, u.login_email, u.status"
        );
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
            $riskScore = (int) ($s['risk_score'] ?? 0);
            $st = $riskScore >= 4 ? 'critical' : ($riskScore === 3 ? 'remedial' : ($riskScore === 2 ? 'warning' : 'active'));
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
            }
        }

        $atRisk = $warningCount + $criticalCount;

        $attCount = count($attendance);
        $presentCount = 0;
        $classAttCounts = [];

        foreach ($attendance as $a) {
            $st = strtolower($a['status'] ?? '');
            $cName = $a['cs_name'] ?? 'Unassigned';
            if (!isset($classAttCounts[$cName])) {
                $classAttCounts[$cName] = ['total' => 0, 'present' => 0];
            }
            $classAttCounts[$cName]['total']++;

            if ($st === 'present' || $st === 'late') {
                $presentCount++;
                $classAttCounts[$cName]['present']++;
            }
        }

        $attendanceRate = $attCount > 0 ? (int) round(($presentCount / $attCount) * 100) : 0;

        $classAttendance = [];
        foreach ($classAttCounts as $cName => $counts) {
            $rate = $counts['total'] > 0 ? (int) round(($counts['present'] / $counts['total']) * 100) : 0;
            $classAttendance[] = ['name' => $cName, 'rate' => $rate];
        }
        $facultyList = array_map(function ($f) {
            return [
                'id' => (string) $f['user_id'],
                'name' => $f['display_name'] ?? 'Faculty Member',
                'email' => $f['login_email'] ?? '',
                'classes' => $f['classes'] ?? '',
                'subjects' => $f['subjects'] ?? '',
                'studentCount' => (int) ($f['student_count'] ?? 0),
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

function handle_admin_retention_criteria_get(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = admin_verify_auth($pdo, $config);

        $stmt = $pdo->query("SELECT setting_value FROM system_settings WHERE setting_key = 'retention_criteria' LIMIT 1");
        $data = json_decode((string) ($stmt->fetchColumn() ?: '[]'), true);
        json_response(is_array($data) ? $data : [], 200);
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
            safe_error_response('Array of retention criteria required.', 422);
            return;
        }
        $normalized = [];
        foreach ($items as $index => $item) {
            if (!is_array($item)) {
                safe_error_response("Criterion at index {$index} is invalid.", 422);
                return;
            }
            $name = trim((string) ($item['name'] ?? ''));
            $minGrade = (float) ($item['minGrade'] ?? 0);
            $minAttendance = (float) ($item['minAttendance'] ?? -1);
            $maxRemedial = (int) ($item['maxRemedialSubjects'] ?? -1);
            if ($name === '' || $minGrade < 1 || $minGrade > 5 || $minAttendance < 0 || $minAttendance > 100 || $maxRemedial < 0) {
                safe_error_response("Criterion '{$name}' contains invalid thresholds.", 422);
                return;
            }
            $normalized[] = [
                'id' => trim((string) ($item['id'] ?? '')) ?: 'RC-' . str_pad((string) ($index + 1), 3, '0', STR_PAD_LEFT),
                'name' => $name,
                'description' => trim((string) ($item['description'] ?? '')),
                'minGrade' => $minGrade,
                'minAttendance' => $minAttendance,
                'maxRemedialSubjects' => $maxRemedial,
                'appliesToClinical' => (bool) ($item['appliesToClinical'] ?? false),
                'enabled' => (bool) ($item['enabled'] ?? true),
                'lastUpdated' => gmdate('Y-m-d'),
                'updatedBy' => $authCtx['login_email'],
            ];
        }
        $encoded = json_encode($normalized, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $stmt = $pdo->prepare(
            "INSERT INTO system_settings
                (setting_key, setting_value, is_internal, description, updated_at, updated_by_user_id)
             VALUES ('retention_criteria', ?, 0, 'Administrator-defined retention criteria.', NOW(6), ?)
             ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value),
                 updated_at = VALUES(updated_at), updated_by_user_id = VALUES(updated_by_user_id)"
        );
        $stmt->execute([$encoded, $authCtx['user_id']]);

        json_response([
            'status' => 'ok',
            'message' => 'Retention criteria updated successfully.',
            'criteria' => $normalized,
        ], 200);
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
            $sql .= " AND (
                actor_user_id = ?
                OR (
                    canonical_schema_version >= 2
                    AND scope_cs_id IS NOT NULL
                    AND EXISTS (
                        SELECT 1 FROM class_sections cs
                         WHERE cs.cs_id = audit_events.scope_cs_id
                           AND (cs.instructor_user_id = ? OR cs.secretary_user_id = ?)
                    )
                )
            )";
            $params[] = $authCtx['user_id'];
            $params[] = $authCtx['user_id'];
            $params[] = $authCtx['user_id'];
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
        $name = validate_person_name($data, 'name', 2, 255);
        $email = validate_institutional_email($data['email'] ?? '');

        email_mfa_update_account_identity($pdo, (int) $authCtx['user_id'], $name, $email);

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

        $stmt = $pdo->query(
            "SELECT setting_key, setting_value FROM system_settings
             WHERE setting_key IN ('retention_policy', 'grading_defaults')"
        );
        $rows = $stmt ? $stmt->fetchAll(PDO::FETCH_KEY_PAIR) : [];
        $retention = isset($rows['retention_policy']) ? json_decode($rows['retention_policy'], true) : [];
        $grading = isset($rows['grading_defaults']) ? json_decode($rows['grading_defaults'], true) : [];
        $themeStmt = $pdo->prepare("SELECT theme FROM user_accounts WHERE user_id = ?");
        $themeStmt->execute([$authCtx['user_id']]);
        $settings = [
            'theme' => $themeStmt->fetchColumn() ?: 'light',
            'retentionThreshold' => (float) ($retention['retention_threshold'] ?? 2.5),
            'weights' => $grading['default_weights'] ?? [
                'practicum' => 40, 'exams' => 30, 'quizzes' => 20, 'attendance' => 10,
            ],
        ];

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
        $theme = (string) ($settings['theme'] ?? 'light');
        $threshold = (float) ($settings['retentionThreshold'] ?? 2.5);
        $weights = $settings['weights'] ?? [];
        if (!in_array($theme, ['light', 'dark'], true)
            || $threshold < 1.0 || $threshold > 5.0
            || !is_array($weights)
            || abs(array_sum(array_map('floatval', $weights)) - 100.0) > 0.001
        ) {
            safe_error_response('Theme, retention threshold, and grading weights totaling 100 are required.', 422);
            return;
        }
        $pdo->beginTransaction();
        $themeStmt = $pdo->prepare("UPDATE user_accounts SET theme = ? WHERE user_id = ?");
        $themeStmt->execute([$theme, $authCtx['user_id']]);
        $retentionStmt = $pdo->prepare(
            "UPDATE system_settings
             SET setting_value = JSON_SET(setting_value, '$.retention_threshold', ?),
                 updated_at = NOW(6), updated_by_user_id = ?
             WHERE setting_key = 'retention_policy'"
        );
        $retentionStmt->execute([$threshold, $authCtx['user_id']]);
        $gradingStmt = $pdo->prepare(
            "UPDATE system_settings
             SET setting_value = JSON_SET(
                    setting_value,
                    '$.default_weights.quizzes', ?,
                    '$.default_weights.exams', ?,
                    '$.default_weights.practicum', ?,
                    '$.default_weights.attendance', ?,
                    '$.retention_gwa_threshold', ?
                 ),
                 updated_at = NOW(6), updated_by_user_id = ?
             WHERE setting_key = 'grading_defaults'"
        );
        $gradingStmt->execute([
            (float) ($weights['quizzes'] ?? 0), (float) ($weights['exams'] ?? 0),
            (float) ($weights['practicum'] ?? 0), (float) ($weights['attendance'] ?? 0),
            $threshold, $authCtx['user_id'],
        ]);
        $pdo->commit();

        json_response(['status' => 'ok', 'message' => 'System settings persisted successfully.', 'settings' => $settings], 200);
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
            "SELECT s.student_id, s.student_number, s.first_name, s.middle_name, s.last_name,
                    s.bu_email, s.year_level, s.status, b.consent_status, b.face_enrolled,
                    e.final_gwa, e.retention_state, e.remedial_state_json, e.grade_components_json,
                    cs.cs_id, cs.cs_name, c.course_code, c.name AS course_name, c.units, c.is_clinical
             FROM students s
             LEFT JOIN enrollments e ON e.student_id = s.student_id
             LEFT JOIN class_sections cs ON cs.cs_id = e.cs_id
             LEFT JOIN courses c ON c.course_id = cs.course_id
             LEFT JOIN biometric_profiles b ON s.student_id = b.student_id
             ORDER BY s.student_number ASC, cs.cs_id ASC"
        );
        $students = $stmt ? $stmt->fetchAll(PDO::FETCH_ASSOC) : [];

        // Fetch attendance logs
        $attStmt = $pdo->query(
            "SELECT r.record_id AS id, s.student_id AS studentId, r.session_date AS date,
                    c.course_code AS subjectCode, cs.cs_name AS className, r.status
             FROM attendance_records r
             JOIN enrollments e ON e.enrollment_id = r.enrollment_id
             JOIN students s ON s.student_id = e.student_id
             JOIN class_sections cs ON cs.cs_id = e.cs_id
             JOIN courses c ON c.course_id = cs.course_id
             ORDER BY session_date DESC LIMIT 500"
        );
        $attendanceLogs = $attStmt ? $attStmt->fetchAll(PDO::FETCH_ASSOC) : [];

        $grouped = [];
        foreach ($students as $s) {
            $id = (string) $s['student_id'];
            if (!isset($grouped[$id])) {
                $grouped[$id] = [
                    'id' => $id, 'studentId' => $s['student_number'],
                    'name' => trim($s['first_name'] . ' ' . ($s['middle_name'] ? $s['middle_name'] . ' ' : '') . $s['last_name']),
                    'email' => $s['bu_email'] ?? '', 'yearLevel' => (int) ($s['year_level'] ?? 4),
                    'status' => $s['retention_state'] ?? strtolower($s['status'] ?? 'active'),
                    'overallGWA' => null, 'faceEnrolled' => (bool) ($s['face_enrolled'] ?? false),
                    'consentStatus' => $s['consent_status'] ?? 'pending', 'classId' => null,
                    'className' => null, 'enrolledSubjects' => [], 'remedialExams' => [],
                ];
            }
            if ($s['cs_id'] !== null) {
                $grouped[$id]['classId'] = (string) $s['cs_id'];
                $grouped[$id]['className'] = $s['cs_name'];
                $grouped[$id]['overallGWA'] = $s['final_gwa'] !== null ? (float) $s['final_gwa'] : null;
                $grouped[$id]['enrolledSubjects'][] = [
                    'code' => $s['course_code'], 'name' => $s['course_name'],
                    'units' => (float) $s['units'], 'grade' => $s['final_gwa'] !== null ? (float) $s['final_gwa'] : 0,
                    'isClinical' => (bool) $s['is_clinical'],
                    'hasRemedial' => $s['retention_state'] === 'remedial',
                    'components' => $s['grade_components_json'] ? json_decode($s['grade_components_json'], true) : null,
                ];
                if ($s['remedial_state_json']) {
                    $grouped[$id]['remedialExams'][] = json_decode($s['remedial_state_json'], true);
                }
            }
        }
        $mappedStudents = array_values($grouped);

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
