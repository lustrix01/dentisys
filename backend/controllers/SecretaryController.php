<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/app/bootstrap.php';
require_once dirname(__DIR__) . '/app/auth_runtime.php';

function secretary_get_authenticated_user(array $allowedRoles = ['secretary', 'admin', 'faculty']): array
{
    $config = app_config();
    $pdo = create_pdo($config);

    $context = [
        'request_id' => request_id(),
        'ip_address' => request_ip(),
        'user_agent' => request_user_agent(),
        'http_method' => request_method(),
        'endpoint' => request_path(),
        'auth_header' => request_header('Authorization') ?? '',
    ];

    try {
        $user = auth_runtime_me($pdo, $config, $context);
    } catch (\Throwable $e) {
        auth_controller_emit(auth_build_no_store_message_response('Authentication required.', 401));
        exit;
    }

    if (!empty($allowedRoles) && !in_array($user['role'], $allowedRoles, true)) {
        auth_controller_emit(auth_build_no_store_message_response('Forbidden: Invalid role.', 403));
        exit;
    }

    return ['pdo' => $pdo, 'config' => $config, 'user' => $user, 'context' => $context];
}

function handle_secretary_dashboard(): void
{
    $auth = secretary_get_authenticated_user(['secretary', 'admin', 'faculty']);
    $pdo = $auth['pdo'];
    $userId = (int)$auth['user']['user_id'];

    try {
        // Get class section assigned to secretary
        $stmtClass = $pdo->prepare("
            SELECT cs.cs_id, cs.cs_name, c.course_code, c.name as course_name, cs.lab_room, cs.lec_room, cs.block
            FROM class_sections cs
            JOIN courses c ON cs.course_id = c.course_id
            WHERE cs.secretary_user_id = ? OR ? = 'admin'
            ORDER BY cs.cs_id ASC
            LIMIT 1
        ");
        $stmtClass->execute([$userId, $auth['user']['role']]);
        $assignedClass = $stmtClass->fetch(PDO::FETCH_ASSOC);

        if (!$assignedClass) {
            // Fallback: pick any active class section if testing as admin
            $stmtAny = $pdo->query("
                SELECT cs.cs_id, cs.cs_name, c.course_code, c.name as course_name, cs.lab_room, cs.lec_room, cs.block
                FROM class_sections cs
                JOIN courses c ON cs.course_id = c.course_id
                WHERE cs.status = 'Active'
                ORDER BY cs.cs_id ASC
                LIMIT 1
            ");
            $assignedClass = $stmtAny->fetch(PDO::FETCH_ASSOC);
        }

        $csId = $assignedClass ? (int)$assignedClass['cs_id'] : 0;

        // Total enrolled students
        $stmtEnrolled = $pdo->prepare("SELECT COUNT(*) FROM enrollments WHERE cs_id = ?");
        $stmtEnrolled->execute([$csId]);
        $totalStudents = (int)$stmtEnrolled->fetchColumn();

        // Attendance stats for today
        $today = date('Y-m-d');
        $stmtTodayAtt = $pdo->prepare("
            SELECT 
                COUNT(*) as recorded,
                SUM(CASE WHEN ar.status = 'present' THEN 1 ELSE 0 END) as present_count,
                SUM(CASE WHEN ar.status = 'late' THEN 1 ELSE 0 END) as late_count,
                SUM(CASE WHEN ar.status = 'absent' THEN 1 ELSE 0 END) as absent_count,
                SUM(CASE WHEN ar.status = 'excused' THEN 1 ELSE 0 END) as excused_count
            FROM attendance_records ar
            JOIN enrollments e ON ar.enrollment_id = e.enrollment_id
            WHERE e.cs_id = ? AND ar.session_date = ?
        ");
        $stmtTodayAtt->execute([$csId, $today]);
        $todayStats = $stmtTodayAtt->fetch(PDO::FETCH_ASSOC);

        // Attendance override count by this secretary
        $stmtOverrides = $pdo->prepare("
            SELECT COUNT(*) FROM attendance_records 
            WHERE secretary_user_id = ? OR override_by_user_id = ?
        ");
        $stmtOverrides->execute([$userId, $userId]);
        $totalOverrides = (int)$stmtOverrides->fetchColumn();

        auth_controller_emit(auth_build_no_store_json_response([
            'success' => true,
            'assigned_class' => $assignedClass,
            'stats' => [
                'total_students' => $totalStudents,
                'today_present' => (int)($todayStats['present_count'] ?? 0),
                'today_late' => (int)($todayStats['late_count'] ?? 0),
                'today_absent' => (int)($todayStats['absent_count'] ?? 0),
                'today_excused' => (int)($todayStats['excused_count'] ?? 0),
                'total_overrides' => $totalOverrides,
            ]
        ], 200));
    } catch (\Throwable $e) {
        error_log('Secretary Dashboard Error: ' . $e->getMessage());
        auth_controller_emit(auth_build_no_store_message_response('Internal server error.', 500));
    }
}

function handle_get_assigned_class(): void
{
    $auth = secretary_get_authenticated_user(['secretary', 'admin', 'faculty']);
    $pdo = $auth['pdo'];
    $userId = (int)$auth['user']['user_id'];

    try {
        $stmtClass = $pdo->prepare("
            SELECT cs.cs_id, cs.cs_name, c.course_code, c.name as course_name, cs.lab_room, cs.lec_room, cs.block, cs.semester, cs.school_year
            FROM class_sections cs
            JOIN courses c ON cs.course_id = c.course_id
            WHERE cs.secretary_user_id = ? OR ? = 'admin'
            ORDER BY cs.cs_id ASC
            LIMIT 1
        ");
        $stmtClass->execute([$userId, $auth['user']['role']]);
        $assignedClass = $stmtClass->fetch(PDO::FETCH_ASSOC);

        if (!$assignedClass) {
            $stmtAny = $pdo->query("
                SELECT cs.cs_id, cs.cs_name, c.course_code, c.name as course_name, cs.lab_room, cs.lec_room, cs.block, cs.semester, cs.school_year
                FROM class_sections cs
                JOIN courses c ON cs.course_id = c.course_id
                WHERE cs.status = 'Active'
                ORDER BY cs.cs_id ASC
                LIMIT 1
            ");
            $assignedClass = $stmtAny->fetch(PDO::FETCH_ASSOC);
        }

        $csId = $assignedClass ? (int)$assignedClass['cs_id'] : 0;

        $stmtRoster = $pdo->prepare("
            SELECT s.student_id, s.student_number, s.first_name, s.last_name, s.middle_name, s.bu_email, e.enrollment_id
            FROM enrollments e
            JOIN students s ON e.student_id = s.student_id
            WHERE e.cs_id = ?
            ORDER BY s.last_name ASC, s.first_name ASC
        ");
        $stmtRoster->execute([$csId]);
        $roster = $stmtRoster->fetchAll(PDO::FETCH_ASSOC);

        auth_controller_emit(auth_build_no_store_json_response([
            'success' => true,
            'class' => $assignedClass,
            'roster' => $roster,
        ], 200));
    } catch (\Throwable $e) {
        error_log('Get Secretary Class Error: ' . $e->getMessage());
        auth_controller_emit(auth_build_no_store_message_response('Internal server error.', 500));
    }
}

function handle_get_cctv_feed_status(): void
{
    $auth = secretary_get_authenticated_user(['secretary', 'admin', 'faculty']);

    try {
        $cctvData = [
            'status' => 'Online',
            'active_cameras' => 4,
            'total_cameras' => 4,
            'stream_url' => 'https://cctv-stream.dentisys.internal/live/feed1',
            'detection_active' => true,
            'last_sync' => date('Y-m-d H:i:s'),
            'cameras' => [
                ['id' => 'CAM-01', 'name' => 'Dental Clinic Lab 101 Front', 'status' => 'Active', 'fps' => 30, 'resolution' => '1080p'],
                ['id' => 'CAM-02', 'name' => 'Dental Clinic Lab 101 Rear', 'status' => 'Active', 'fps' => 30, 'resolution' => '1080p'],
                ['id' => 'CAM-03', 'name' => 'Lecture Hall B Entrance', 'status' => 'Active', 'fps' => 25, 'resolution' => '720p'],
                ['id' => 'CAM-04', 'name' => 'Prosthodontics Lab Overhead', 'status' => 'Active', 'fps' => 30, 'resolution' => '1080p'],
            ]
        ];

        auth_controller_emit(auth_build_no_store_json_response(['success' => true, 'cctv' => $cctvData], 200));
    } catch (\Throwable $e) {
        error_log('Get CCTV Feed Status Error: ' . $e->getMessage());
        auth_controller_emit(auth_build_no_store_message_response('Internal server error.', 500));
    }
}
