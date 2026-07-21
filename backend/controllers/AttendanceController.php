<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/app/bootstrap.php';
require_once dirname(__DIR__) . '/app/auth_runtime.php';

function attendance_get_authenticated_user(): array
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

    return ['pdo' => $pdo, 'config' => $config, 'user' => $user, 'context' => $context];
}

function handle_get_attendance(): void
{
    $auth = attendance_get_authenticated_user();
    $pdo = $auth['pdo'];

    $csId = isset($_GET['cs_id']) ? (int)$_GET['cs_id'] : 0;
    $date = isset($_GET['date']) ? trim($_GET['date']) : null;

    try {
        $query = "
            SELECT ar.record_id, ar.enrollment_id, ar.session_date, ar.session_code, ar.session_start, ar.session_end,
                   ar.status, ar.verification_method, ar.secretary_user_id, ar.override_reason, ar.override_by_user_id, ar.time_recorded,
                   e.student_id, e.cs_id, s.student_number, s.first_name, s.last_name
            FROM attendance_records ar
            JOIN enrollments e ON ar.enrollment_id = e.enrollment_id
            JOIN students s ON e.student_id = s.student_id
            WHERE 1=1
        ";
        $queryParams = [];

        if ($csId > 0) {
            $query .= " AND e.cs_id = ?";
            $queryParams[] = $csId;
        }

        if ($date !== null && $date !== '') {
            $query .= " AND ar.session_date = ?";
            $queryParams[] = $date;
        }

        $query .= " ORDER BY ar.session_date DESC, s.last_name ASC";

        $stmt = $pdo->prepare($query);
        $stmt->execute($queryParams);
        $records = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $formatted = array_map(function($r) {
            return [
                'record_id' => (int)$r['record_id'],
                'enrollment_id' => (int)$r['enrollment_id'],
                'student_id' => (int)$r['student_id'],
                'student_number' => $r['student_number'],
                'student_name' => trim($r['first_name'] . ' ' . $r['last_name']),
                'cs_id' => (int)$r['cs_id'],
                'session_date' => $r['session_date'],
                'session_code' => $r['session_code'],
                'status' => $r['status'],
                'verification_method' => $r['verification_method'],
                'secretary_user_id' => $r['secretary_user_id'] !== null ? (int)$r['secretary_user_id'] : null,
                'override_reason' => $r['override_reason'],
                'override_by_user_id' => $r['override_by_user_id'] !== null ? (int)$r['override_by_user_id'] : null,
                'time_recorded' => $r['time_recorded'],
            ];
        }, $records);

        auth_controller_emit(auth_build_no_store_json_response(['success' => true, 'attendance_records' => $formatted], 200));
    } catch (\Throwable $e) {
        error_log('Get Attendance Error: ' . $e->getMessage());
        auth_controller_emit(auth_build_no_store_message_response('Internal server error.', 500));
    }
}

function handle_record_attendance(): void
{
    $auth = attendance_get_authenticated_user();
    $pdo = $auth['pdo'];
    $body = request_body();

    if (!$body['has_body']) {
        auth_controller_emit(auth_build_no_store_message_response('Request body required.', 400));
        return;
    }

    $data = $body['data'];
    $enrollmentId = (int)($data['enrollment_id'] ?? 0);
    $sessionDate = trim($data['session_date'] ?? date('Y-m-d'));
    $status = trim($data['status'] ?? 'present');
    $sessionCode = trim($data['session_code'] ?? 'LECTURE');
    $verificationMethod = trim($data['verification_method'] ?? 'manual');

    if ($enrollmentId <= 0) {
        auth_controller_emit(auth_build_no_store_message_response('Enrollment ID required.', 400));
        return;
    }

    try {
        $stmt = $pdo->prepare("
            INSERT INTO attendance_records 
            (enrollment_id, session_date, session_code, status, verification_method, secretary_user_id, time_recorded)
            VALUES (?, ?, ?, ?, ?, ?, NOW(6))
            ON DUPLICATE KEY UPDATE 
                status = VALUES(status), 
                verification_method = VALUES(verification_method),
                time_recorded = NOW(6)
        ");
        $stmt->execute([
            $enrollmentId,
            $sessionDate,
            $sessionCode,
            $status,
            $verificationMethod,
            $auth['user']['user_id']
        ]);

        auth_controller_emit(auth_build_no_store_json_response([
            'success' => true,
            'message' => 'Attendance recorded successfully.'
        ], 200));
    } catch (\Throwable $e) {
        error_log('Record Attendance Error: ' . $e->getMessage());
        auth_controller_emit(auth_build_no_store_message_response('Internal server error.', 500));
    }
}

function handle_override_attendance(): void
{
    $auth = attendance_get_authenticated_user();
    $pdo = $auth['pdo'];
    $body = request_body();

    if (!$body['has_body']) {
        auth_controller_emit(auth_build_no_store_message_response('Request body required.', 400));
        return;
    }

    $data = $body['data'];
    $recordId = isset($data['record_id']) ? (int)$data['record_id'] : 0;
    $enrollmentId = isset($data['enrollment_id']) ? (int)$data['enrollment_id'] : 0;
    $sessionDate = trim($data['session_date'] ?? date('Y-m-d'));
    $status = trim($data['status'] ?? 'present');
    $reason = trim($data['reason'] ?? '');

    if (empty($reason)) {
        auth_controller_emit(auth_build_no_store_message_response('Override reason is required.', 400));
        return;
    }

    try {
        if ($recordId > 0) {
            $stmt = $pdo->prepare("
                UPDATE attendance_records
                SET status = ?, override_reason = ?, override_by_user_id = ?, override_at = NOW(6)
                WHERE record_id = ?
            ");
            $stmt->execute([$status, $reason, $auth['user']['user_id'], $recordId]);
        } else if ($enrollmentId > 0) {
            $stmt = $pdo->prepare("
                INSERT INTO attendance_records
                (enrollment_id, session_date, session_code, status, override_reason, override_by_user_id, override_at, time_recorded)
                VALUES (?, ?, 'OVERRIDE', ?, ?, ?, NOW(6), NOW(6))
                ON DUPLICATE KEY UPDATE
                    status = VALUES(status),
                    override_reason = VALUES(override_reason),
                    override_by_user_id = VALUES(override_by_user_id),
                    override_at = NOW(6)
            ");
            $stmt->execute([$enrollmentId, $sessionDate, $status, $reason, $auth['user']['user_id']]);
        } else {
            auth_controller_emit(auth_build_no_store_message_response('Either record_id or enrollment_id must be provided.', 400));
            return;
        }

        auth_controller_emit(auth_build_no_store_json_response([
            'success' => true,
            'message' => 'Attendance override recorded successfully.'
        ], 200));
    } catch (\Throwable $e) {
        error_log('Override Attendance Error: ' . $e->getMessage());
        auth_controller_emit(auth_build_no_store_message_response('Internal server error.', 500));
    }
}
