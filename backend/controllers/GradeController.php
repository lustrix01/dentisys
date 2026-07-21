<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/app/bootstrap.php';
require_once dirname(__DIR__) . '/app/auth_runtime.php';

function grade_get_authenticated_user(): array
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

function handle_get_assessments(): void
{
    $auth = grade_get_authenticated_user();
    $pdo = $auth['pdo'];
    $csId = isset($_GET['cs_id']) ? (int)$_GET['cs_id'] : 0;

    try {
        $query = "SELECT assessment_id, cs_id, title, type, grading_period, max_score, weight, due_date, instructions, status FROM assessments WHERE 1=1";
        $params = [];

        if ($csId > 0) {
            $query .= " AND cs_id = ?";
            $params[] = $csId;
        }

        $query .= " ORDER BY due_date DESC, assessment_id DESC";

        $stmt = $pdo->prepare($query);
        $stmt->execute($params);
        $assessments = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $formatted = array_map(function($a) {
            return [
                'assessment_id' => (int)$a['assessment_id'],
                'cs_id' => (int)$a['cs_id'],
                'title' => $a['title'],
                'type' => $a['type'],
                'grading_period' => $a['grading_period'],
                'max_score' => (float)$a['max_score'],
                'weight' => $a['weight'] !== null ? (float)$a['weight'] : null,
                'due_date' => $a['due_date'],
                'instructions' => $a['instructions'],
                'status' => $a['status'],
            ];
        }, $assessments);

        auth_controller_emit(auth_build_no_store_json_response(['success' => true, 'assessments' => $formatted], 200));
    } catch (\Throwable $e) {
        error_log('Get Assessments Error: ' . $e->getMessage());
        auth_controller_emit(auth_build_no_store_message_response('Internal server error.', 500));
    }
}

function handle_create_assessment(): void
{
    $auth = grade_get_authenticated_user();
    $pdo = $auth['pdo'];
    $body = request_body();

    if (!$body['has_body']) {
        auth_controller_emit(auth_build_no_store_message_response('Request body required.', 400));
        return;
    }

    $data = $body['data'];
    $csId = (int)($data['cs_id'] ?? 0);
    $title = trim($data['title'] ?? '');
    $type = trim($data['type'] ?? 'Quiz');
    $gradingPeriod = trim($data['grading_period'] ?? 'Midterm');
    $maxScore = (float)($data['max_score'] ?? 100);
    $weight = isset($data['weight']) ? (float)$data['weight'] : null;
    $dueDate = !empty($data['due_date']) ? trim($data['due_date']) : null;
    $instructions = trim($data['instructions'] ?? '');

    if ($csId <= 0 || empty($title)) {
        auth_controller_emit(auth_build_no_store_message_response('Class Section ID and title are required.', 400));
        return;
    }

    try {
        $stmt = $pdo->prepare("
            INSERT INTO assessments (cs_id, title, type, grading_period, max_score, weight, due_date, instructions)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $stmt->execute([$csId, $title, $type, $gradingPeriod, $maxScore, $weight, $dueDate, $instructions]);
        $assessmentId = (int)$pdo->lastInsertId();

        auth_controller_emit(auth_build_no_store_json_response([
            'success' => true,
            'message' => 'Assessment created successfully.',
            'assessment_id' => $assessmentId,
        ], 201));
    } catch (\Throwable $e) {
        error_log('Create Assessment Error: ' . $e->getMessage());
        auth_controller_emit(auth_build_no_store_message_response('Internal server error.', 500));
    }
}

function handle_get_scores(): void
{
    $auth = grade_get_authenticated_user();
    $pdo = $auth['pdo'];

    $assessmentId = isset($_GET['assessment_id']) ? (int)$_GET['assessment_id'] : 0;
    $studentId = isset($_GET['student_id']) ? (int)$_GET['student_id'] : 0;

    try {
        $query = "
            SELECT sc.score_id, sc.assessment_id, sc.student_id, sc.score, sc.submitted_at, sc.remarks,
                   s.student_number, s.first_name, s.last_name
            FROM assessment_scores sc
            JOIN students s ON sc.student_id = s.student_id
            WHERE 1=1
        ";
        $params = [];

        if ($assessmentId > 0) {
            $query .= " AND sc.assessment_id = ?";
            $params[] = $assessmentId;
        }

        if ($studentId > 0) {
            $query .= " AND sc.student_id = ?";
            $params[] = $studentId;
        }

        $stmt = $pdo->prepare($query);
        $stmt->execute($params);
        $scores = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $formatted = array_map(function($s) {
            return [
                'score_id' => (int)$s['score_id'],
                'assessment_id' => (int)$s['assessment_id'],
                'student_id' => (int)$s['student_id'],
                'student_number' => $s['student_number'],
                'student_name' => trim($s['first_name'] . ' ' . $s['last_name']),
                'score' => (float)$s['score'],
                'submitted_at' => $s['submitted_at'],
                'remarks' => $s['remarks'],
            ];
        }, $scores);

        auth_controller_emit(auth_build_no_store_json_response(['success' => true, 'scores' => $formatted], 200));
    } catch (\Throwable $e) {
        error_log('Get Scores Error: ' . $e->getMessage());
        auth_controller_emit(auth_build_no_store_message_response('Internal server error.', 500));
    }
}

function handle_save_scores(): void
{
    $auth = grade_get_authenticated_user();
    $pdo = $auth['pdo'];
    $body = request_body();

    if (!$body['has_body']) {
        auth_controller_emit(auth_build_no_store_message_response('Request body required.', 400));
        return;
    }

    $data = $body['data'];
    $assessmentId = (int)($data['assessment_id'] ?? 0);
    $scores = $data['scores'] ?? [];

    if ($assessmentId <= 0 || !is_array($scores)) {
        auth_controller_emit(auth_build_no_store_message_response('Assessment ID and scores array are required.', 400));
        return;
    }

    try {
        $pdo->beginTransaction();

        $stmt = $pdo->prepare("
            INSERT INTO assessment_scores (assessment_id, student_id, score, remarks, submitted_at)
            VALUES (?, ?, ?, ?, NOW(6))
            ON DUPLICATE KEY UPDATE
                score = VALUES(score),
                remarks = VALUES(remarks),
                submitted_at = NOW(6)
        ");

        foreach ($scores as $item) {
            $studentId = (int)($item['student_id'] ?? 0);
            $scoreVal = (float)($item['score'] ?? 0);
            $remarks = trim($item['remarks'] ?? '');

            if ($studentId > 0) {
                $stmt->execute([$assessmentId, $studentId, $scoreVal, $remarks]);
            }
        }

        $pdo->commit();

        auth_controller_emit(auth_build_no_store_json_response([
            'success' => true,
            'message' => 'Scores saved successfully.'
        ], 200));
    } catch (\Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        error_log('Save Scores Error: ' . $e->getMessage());
        auth_controller_emit(auth_build_no_store_message_response('Internal server error.', 500));
    }
}

function handle_compute_class_grades(): void
{
    $auth = grade_get_authenticated_user();
    $pdo = $auth['pdo'];
    $body = request_body();

    if (!$body['has_body']) {
        auth_controller_emit(auth_build_no_store_message_response('Request body required.', 400));
        return;
    }

    $csId = (int)($body['data']['cs_id'] ?? 0);

    if ($csId <= 0) {
        auth_controller_emit(auth_build_no_store_message_response('Class Section ID is required.', 400));
        return;
    }

    try {
        // Get all enrollments for class section
        $stmtEnroll = $pdo->prepare("SELECT enrollment_id, student_id FROM enrollments WHERE cs_id = ?");
        $stmtEnroll->execute([$csId]);
        $enrollments = $stmtEnroll->fetchAll(PDO::FETCH_ASSOC);

        // Get assessments for class section
        $stmtAss = $pdo->prepare("SELECT assessment_id, type, max_score, weight FROM assessments WHERE cs_id = ?");
        $stmtAss->execute([$csId]);
        $assessments = $stmtAss->fetchAll(PDO::FETCH_ASSOC);

        $pdo->beginTransaction();

        $updStmt = $pdo->prepare("
            UPDATE enrollments
            SET final_percentage = ?, final_gwa = ?, grade_components_json = ?, retention_state = ?, updated_at = NOW(6)
            WHERE enrollment_id = ?
        ");

        foreach ($enrollments as $env) {
            $enrollmentId = (int)$env['enrollment_id'];
            $studentId = (int)$env['student_id'];

            // Compute student score averages per assessment type
            $stmtScore = $pdo->prepare("
                SELECT a.type, sc.score, a.max_score
                FROM assessment_scores sc
                JOIN assessments a ON sc.assessment_id = a.assessment_id
                WHERE a.cs_id = ? AND sc.student_id = ?
            ");
            $stmtScore->execute([$csId, $studentId]);
            $studentScores = $stmtScore->fetchAll(PDO::FETCH_ASSOC);

            $typeTotals = [];
            foreach ($studentScores as $sRow) {
                $t = $sRow['type'];
                if (!isset($typeTotals[$t])) {
                    $typeTotals[$t] = ['earned' => 0, 'max' => 0];
                }
                $typeTotals[$t]['earned'] += (float)$sRow['score'];
                $typeTotals[$t]['max'] += (float)$sRow['max_score'];
            }

            $components = [
                'quizzes' => isset($typeTotals['Quiz']) && $typeTotals['Quiz']['max'] > 0 ? round(($typeTotals['Quiz']['earned'] / $typeTotals['Quiz']['max']) * 100, 2) : 85.0,
                'exams' => isset($typeTotals['Midterm Exam']) && $typeTotals['Midterm Exam']['max'] > 0 ? round(($typeTotals['Midterm Exam']['earned'] / $typeTotals['Midterm Exam']['max']) * 100, 2) : 82.0,
                'practicum' => isset($typeTotals['Activity']) && $typeTotals['Activity']['max'] > 0 ? round(($typeTotals['Activity']['earned'] / $typeTotals['Activity']['max']) * 100, 2) : 88.0,
                'attendance' => 92.0,
            ];

            // Default weight distribution: Quizzes 20%, Exams 30%, Practicum 40%, Attendance 10%
            $finalPct = round(($components['quizzes'] * 0.2) + ($components['exams'] * 0.3) + ($components['practicum'] * 0.4) + ($components['attendance'] * 0.1), 2);

            // Convert percentage to GWA
            $gwa = 1.0;
            if ($finalPct >= 96) $gwa = 1.0;
            else if ($finalPct >= 93) $gwa = 1.25;
            else if ($finalPct >= 90) $gwa = 1.5;
            else if ($finalPct >= 87) $gwa = 1.75;
            else if ($finalPct >= 84) $gwa = 2.0;
            else if ($finalPct >= 80) $gwa = 2.25;
            else if ($finalPct >= 75) $gwa = 2.5;
            else if ($finalPct >= 70) $gwa = 2.75;
            else if ($finalPct >= 60) $gwa = 3.0;
            else $gwa = 5.0;

            $retentionState = $gwa > 2.5 ? ($gwa > 3.0 ? 'critical' : 'warning') : 'active';

            $updStmt->execute([$finalPct, $gwa, json_encode($components), $retentionState, $enrollmentId]);
        }

        $pdo->commit();

        auth_controller_emit(auth_build_no_store_json_response([
            'success' => true,
            'message' => 'Class grades computed and saved successfully.'
        ], 200));
    } catch (\Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        error_log('Compute Class Grades Error: ' . $e->getMessage());
        auth_controller_emit(auth_build_no_store_message_response('Internal server error.', 500));
    }
}
