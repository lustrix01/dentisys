<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/app/bootstrap.php';
require_once dirname(__DIR__) . '/app/auth_runtime.php';

function faculty_get_authenticated_user(array $allowedRoles = ['faculty', 'admin']): array
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

function handle_faculty_dashboard(): void
{
    $auth = faculty_get_authenticated_user(['faculty', 'admin']);
    $pdo = $auth['pdo'];
    $userId = (int)$auth['user']['user_id'];

    try {
        // Enrolled students in class sections taught by faculty
        $stmtTotal = $pdo->prepare("
            SELECT COUNT(DISTINCT e.student_id) as total_students
            FROM class_sections cs
            JOIN enrollments e ON cs.cs_id = e.cs_id
            WHERE cs.instructor_user_id = ? AND cs.status = 'Active'
        ");
        $stmtTotal->execute([$userId]);
        $totalStudents = (int)$stmtTotal->fetchColumn();

        // At risk students count
        $stmtRisk = $pdo->prepare("
            SELECT COUNT(DISTINCT e.student_id) as at_risk
            FROM class_sections cs
            JOIN enrollments e ON cs.cs_id = e.cs_id
            WHERE cs.instructor_user_id = ? AND e.retention_state IN ('warning', 'critical')
        ");
        $stmtRisk->execute([$userId]);
        $atRiskCount = (int)$stmtRisk->fetchColumn();

        // Pending remedials count
        $stmtRemedial = $pdo->prepare("
            SELECT COUNT(DISTINCT e.enrollment_id) as pending_remedials
            FROM class_sections cs
            JOIN enrollments e ON cs.cs_id = e.cs_id
            WHERE cs.instructor_user_id = ? AND e.retention_state = 'remedial'
        ");
        $stmtRemedial->execute([$userId]);
        $pendingRemedials = (int)$stmtRemedial->fetchColumn();

        // Attendance rate
        $stmtAtt = $pdo->prepare("
            SELECT 
                COUNT(*) as total_records,
                SUM(CASE WHEN ar.status IN ('present', 'late') THEN 1 ELSE 0 END) as present_records
            FROM class_sections cs
            JOIN enrollments e ON cs.cs_id = e.cs_id
            JOIN attendance_records ar ON e.enrollment_id = ar.enrollment_id
            WHERE cs.instructor_user_id = ?
        ");
        $stmtAtt->execute([$userId]);
        $attData = $stmtAtt->fetch(PDO::FETCH_ASSOC);
        $totalRecs = (int)($attData['total_records'] ?? 0);
        $presentRecs = (int)($attData['present_records'] ?? 0);
        $attendanceRate = $totalRecs > 0 ? round(($presentRecs / $totalRecs) * 100, 1) : 95.0;

        // Assigned class sections
        $stmtClasses = $pdo->prepare("
            SELECT cs.cs_id, cs.cs_name, c.course_code, c.name as course_name, cs.semester, cs.school_year, cs.year_level
            FROM class_sections cs
            JOIN courses c ON cs.course_id = c.course_id
            WHERE cs.instructor_user_id = ? AND cs.status = 'Active'
            ORDER BY cs.cs_name ASC
        ");
        $stmtClasses->execute([$userId]);
        $assignedClasses = $stmtClasses->fetchAll(PDO::FETCH_ASSOC);

        auth_controller_emit(auth_build_no_store_json_response([
            'success' => true,
            'stats' => [
                'total_students' => $totalStudents,
                'at_risk_count' => $atRiskCount,
                'pending_remedials' => $pendingRemedials,
                'attendance_rate' => $attendanceRate,
            ],
            'classes' => $assignedClasses
        ], 200));
    } catch (\Throwable $e) {
        error_log('Faculty Dashboard Error: ' . $e->getMessage());
        auth_controller_emit(auth_build_no_store_message_response('Internal server error.', 500));
    }
}

function handle_get_assigned_classes(): void
{
    $auth = faculty_get_authenticated_user(['faculty', 'admin']);
    $pdo = $auth['pdo'];
    $userId = (int)$auth['user']['user_id'];

    try {
        $stmt = $pdo->prepare("
            SELECT cs.cs_id, cs.cs_name, cs.course_id, c.course_code, c.name as course_name, 
                   cs.semester, cs.school_year, cs.year_level, cs.lab_room, cs.lec_room, cs.block
            FROM class_sections cs
            JOIN courses c ON cs.course_id = c.course_id
            WHERE cs.instructor_user_id = ? AND cs.status = 'Active'
            ORDER BY cs.cs_name ASC
        ");
        $stmt->execute([$userId]);
        $classes = $stmt->fetchAll(PDO::FETCH_ASSOC);

        auth_controller_emit(auth_build_no_store_json_response(['success' => true, 'classes' => $classes], 200));
    } catch (\Throwable $e) {
        error_log('Get Assigned Classes Error: ' . $e->getMessage());
        auth_controller_emit(auth_build_no_store_message_response('Internal server error.', 500));
    }
}

function handle_get_class_students(array $params = []): void
{
    $auth = faculty_get_authenticated_user(['faculty', 'admin']);
    $pdo = $auth['pdo'];
    $userId = (int)$auth['user']['user_id'];
    $csId = (int)($params['id'] ?? 0);

    try {
        $stmt = $pdo->prepare("
            SELECT 
                s.student_id, s.student_number, s.first_name, s.last_name, s.middle_name, s.bu_email, s.year_level,
                e.enrollment_id, e.cs_id, e.status as enrollment_status, e.final_percentage, e.final_gwa,
                e.grade_components_json, e.retention_state, e.remedial_state_json, e.clinic_hours_completed
            FROM enrollments e
            JOIN students s ON e.student_id = s.student_id
            JOIN class_sections cs ON e.cs_id = cs.cs_id
            WHERE cs.cs_id = ? AND (cs.instructor_user_id = ? OR ? = 'admin')
            ORDER BY s.last_name ASC, s.first_name ASC
        ");
        $stmt->execute([$csId, $userId, $auth['user']['role']]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $students = array_map(function($r) {
            return [
                'student_id' => (int)$r['student_id'],
                'student_number' => $r['student_number'],
                'first_name' => $r['first_name'],
                'last_name' => $r['last_name'],
                'middle_name' => $r['middle_name'],
                'full_name' => trim($r['first_name'] . ' ' . ($r['middle_name'] ? $r['middle_name'] . ' ' : '') . $r['last_name']),
                'bu_email' => $r['bu_email'],
                'year_level' => (int)$r['year_level'],
                'enrollment_id' => (int)$r['enrollment_id'],
                'cs_id' => (int)$r['cs_id'],
                'final_percentage' => $r['final_percentage'] !== null ? (float)$r['final_percentage'] : null,
                'final_gwa' => $r['final_gwa'] !== null ? (float)$r['final_gwa'] : null,
                'grade_components' => $r['grade_components_json'] ? json_decode($r['grade_components_json'], true) : null,
                'retention_state' => $r['retention_state'],
                'remedial_state' => $r['remedial_state_json'] ? json_decode($r['remedial_state_json'], true) : null,
                'clinic_hours_completed' => (int)$r['clinic_hours_completed'],
            ];
        }, $rows);

        auth_controller_emit(auth_build_no_store_json_response(['success' => true, 'students' => $students], 200));
    } catch (\Throwable $e) {
        error_log('Get Class Students Error: ' . $e->getMessage());
        auth_controller_emit(auth_build_no_store_message_response('Internal server error.', 500));
    }
}

function handle_get_retention_monitoring(): void
{
    $auth = faculty_get_authenticated_user(['faculty', 'admin']);
    $pdo = $auth['pdo'];
    $userId = (int)$auth['user']['user_id'];

    try {
        $stmt = $pdo->prepare("
            SELECT 
                e.enrollment_id, e.student_id, e.cs_id, e.retention_state, e.final_gwa, e.remedial_state_json,
                s.student_number, s.first_name, s.last_name, s.bu_email,
                cs.cs_name, c.course_code, c.name as course_name
            FROM enrollments e
            JOIN students s ON e.student_id = s.student_id
            JOIN class_sections cs ON e.cs_id = cs.cs_id
            JOIN courses c ON cs.course_id = c.course_id
            WHERE (cs.instructor_user_id = ? OR ? = 'admin')
            ORDER BY e.retention_state DESC, s.last_name ASC
        ");
        $stmt->execute([$userId, $auth['user']['role']]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $records = array_map(function($r) {
            return [
                'enrollment_id' => (int)$r['enrollment_id'],
                'student_id' => (int)$r['student_id'],
                'student_number' => $r['student_number'],
                'student_name' => trim($r['first_name'] . ' ' . $r['last_name']),
                'bu_email' => $r['bu_email'],
                'cs_id' => (int)$r['cs_id'],
                'cs_name' => $r['cs_name'],
                'course_code' => $r['course_code'],
                'course_name' => $r['course_name'],
                'retention_state' => $r['retention_state'],
                'final_gwa' => $r['final_gwa'] !== null ? (float)$r['final_gwa'] : null,
                'remedial_state' => $r['remedial_state_json'] ? json_decode($r['remedial_state_json'], true) : null,
            ];
        }, $rows);

        auth_controller_emit(auth_build_no_store_json_response(['success' => true, 'retention_records' => $records], 200));
    } catch (\Throwable $e) {
        error_log('Get Retention Monitoring Error: ' . $e->getMessage());
        auth_controller_emit(auth_build_no_store_message_response('Internal server error.', 500));
    }
}

function handle_update_remedial_score(): void
{
    $auth = faculty_get_authenticated_user(['faculty', 'admin']);
    $pdo = $auth['pdo'];
    $body = request_body();

    if (!$body['has_body']) {
        auth_controller_emit(auth_build_no_store_message_response('Request body required.', 400));
        return;
    }

    $data = $body['data'];
    $enrollmentId = (int)($data['enrollment_id'] ?? 0);
    $score = isset($data['score']) ? (float)$data['score'] : null;
    $notes = trim($data['notes'] ?? '');
    $remedialStatus = trim($data['status'] ?? 'completed');

    if ($enrollmentId <= 0) {
        auth_controller_emit(auth_build_no_store_message_response('Invalid enrollment ID.', 400));
        return;
    }

    try {
        $remedialState = [
            'remedial_score' => $score,
            'notes' => $notes,
            'status' => $remedialStatus,
            'updated_at' => date('c'),
            'updated_by' => $auth['user']['user_id'],
        ];

        $newRetentionState = ($score !== null && $score >= 75) ? 'active' : 'remedial';

        $stmt = $pdo->prepare("
            UPDATE enrollments
            SET remedial_state_json = ?, retention_state = ?, updated_at = NOW(6)
            WHERE enrollment_id = ?
        ");
        $stmt->execute([json_encode($remedialState), $newRetentionState, $enrollmentId]);

        auth_controller_emit(auth_build_no_store_json_response([
            'success' => true,
            'message' => 'Remedial record updated successfully.'
        ], 200));
    } catch (\Throwable $e) {
        error_log('Update Remedial Score Error: ' . $e->getMessage());
        auth_controller_emit(auth_build_no_store_message_response('Internal server error.', 500));
    }
}

function handle_get_biometric_profiles(): void
{
    $auth = faculty_get_authenticated_user(['faculty', 'admin']);
    $pdo = $auth['pdo'];

    try {
        $stmt = $pdo->prepare("
            SELECT bp.profile_id, bp.student_id, bp.consent_status, bp.face_enrolled, bp.enrolled_at,
                   s.student_number, s.first_name, s.last_name, s.bu_email
            FROM biometric_profiles bp
            JOIN students s ON bp.student_id = s.student_id
            ORDER BY s.last_name ASC
        ");
        $stmt->execute();
        $profiles = $stmt->fetchAll(PDO::FETCH_ASSOC);

        auth_controller_emit(auth_build_no_store_json_response(['success' => true, 'biometric_profiles' => $profiles], 200));
    } catch (\Throwable $e) {
        error_log('Get Biometric Profiles Error: ' . $e->getMessage());
        auth_controller_emit(auth_build_no_store_message_response('Internal server error.', 500));
    }
}

function handle_update_biometric_consent(): void
{
    $auth = faculty_get_authenticated_user(['faculty', 'admin']);
    $pdo = $auth['pdo'];
    $body = request_body();

    if (!$body['has_body']) {
        auth_controller_emit(auth_build_no_store_message_response('Request body required.', 400));
        return;
    }

    $data = $body['data'];
    $studentId = (int)($data['student_id'] ?? 0);
    $consentStatus = trim($data['consent_status'] ?? 'pending');
    $faceEnrolled = !empty($data['face_enrolled']) ? 1 : 0;

    if ($studentId <= 0) {
        auth_controller_emit(auth_build_no_store_message_response('Invalid student ID.', 400));
        return;
    }

    try {
        $stmtCheck = $pdo->prepare("SELECT profile_id FROM biometric_profiles WHERE student_id = ?");
        $stmtCheck->execute([$studentId]);
        $existing = $stmtCheck->fetchColumn();

        if ($existing) {
            $stmt = $pdo->prepare("
                UPDATE biometric_profiles
                SET consent_status = ?, face_enrolled = ?, consent_responded_at = NOW(6), updated_at = NOW(6)
                WHERE student_id = ?
            ");
            $stmt->execute([$consentStatus, $faceEnrolled, $studentId]);
        } else {
            $stmt = $pdo->prepare("
                INSERT INTO biometric_profiles (student_id, consent_status, face_enrolled, consent_responded_at)
                VALUES (?, ?, ?, NOW(6))
            ");
            $stmt->execute([$studentId, $consentStatus, $faceEnrolled]);
        }

        auth_controller_emit(auth_build_no_store_json_response(['success' => true, 'message' => 'Biometric status updated.'], 200));
    } catch (\Throwable $e) {
        error_log('Update Biometric Consent Error: ' . $e->getMessage());
        auth_controller_emit(auth_build_no_store_message_response('Internal server error.', 500));
    }
}

function handle_get_email_outbox(): void
{
    $auth = faculty_get_authenticated_user(['faculty', 'admin']);
    $pdo = $auth['pdo'];

    try {
        $stmt = $pdo->prepare("
            SELECT email_id, sender_user_id, recipient_email, recipient_name, subject, email_type, status, sent_at, created_at
            FROM email_outbox
            ORDER BY created_at DESC
            LIMIT 100
        ");
        $stmt->execute();
        $emails = $stmt->fetchAll(PDO::FETCH_ASSOC);

        auth_controller_emit(auth_build_no_store_json_response(['success' => true, 'emails' => $emails], 200));
    } catch (\Throwable $e) {
        error_log('Get Email Outbox Error: ' . $e->getMessage());
        auth_controller_emit(auth_build_no_store_message_response('Internal server error.', 500));
    }
}

function handle_send_email(): void
{
    $auth = faculty_get_authenticated_user(['faculty', 'admin']);
    $pdo = $auth['pdo'];
    $body = request_body();

    if (!$body['has_body']) {
        auth_controller_emit(auth_build_no_store_message_response('Request body required.', 400));
        return;
    }

    $data = $body['data'];
    $recipientEmail = trim($data['recipient_email'] ?? '');
    $recipientName = trim($data['recipient_name'] ?? '');
    $subject = trim($data['subject'] ?? '');
    $emailType = trim($data['email_type'] ?? 'Other');
    $messageBody = trim($data['message_body'] ?? '');

    if (empty($recipientEmail) || empty($subject)) {
        auth_controller_emit(auth_build_no_store_message_response('Recipient email and subject are required.', 400));
        return;
    }

    try {
        // Generate UUID v4 for operation_uuid
        $opUuid = sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
            mt_rand(0, 0xffff), mt_rand(0, 0xffff),
            mt_rand(0, 0xffff),
            mt_rand(0, 0x0fff) | 0x4000,
            mt_rand(0, 0x3fff) | 0x8000,
            mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
        );

        $stmt = $pdo->prepare("
            INSERT INTO email_outbox 
            (sender_user_id, recipient_email, recipient_name, subject, email_type, message_body, status, operation_uuid)
            VALUES (?, ?, ?, ?, ?, ?, 'Pending', ?)
        ");
        $stmt->execute([
            $auth['user']['user_id'],
            $recipientEmail,
            $recipientName,
            $subject,
            $emailType,
            $messageBody,
            $opUuid
        ]);

        auth_controller_emit(auth_build_no_store_json_response([
            'success' => true,
            'message' => 'Email queued for sending successfully.'
        ], 201));
    } catch (\Throwable $e) {
        error_log('Send Email Error: ' . $e->getMessage());
        auth_controller_emit(auth_build_no_store_message_response('Internal server error.', 500));
    }
}
