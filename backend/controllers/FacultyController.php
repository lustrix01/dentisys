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

    try {
        $token = auth_extract_bearer_token($authHeader);
        $jwtKey = config_key_bytes_at_least($config['jwt']['signing_key_b64'], 32, 'JWT_SIGNING_KEY');
        $authCtx = auth_verify_access_token($pdo, $token, $jwtKey);
    } catch (AuthException | \RuntimeException $e) {
        auth_error_response($e->getMessage(), 401);
        exit;
    }

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

        $studentStmt = $pdo->prepare("
            SELECT DISTINCT
                s.student_id, 
                s.status AS student_status,
                e.retention_state
            FROM students s
            JOIN enrollments e ON s.student_id = e.student_id
            JOIN class_sections cs ON e.cs_id = cs.cs_id
            WHERE cs.instructor_user_id = :faculty_id
        ");
        $studentStmt->execute([':faculty_id' => $authCtx['user_id']]);
        $students = $studentStmt ? $studentStmt->fetchAll(PDO::FETCH_ASSOC) : [];

        $classStmt = $pdo->prepare("
            SELECT
                cs.cs_id,
                cs.cs_name,
                c.course_code,
                c.name AS course_name,
                COUNT(DISTINCT e.student_id) AS student_count,
                COUNT(ar.record_id) AS attendance_total,
                SUM(CASE WHEN ar.status IN ('present', 'late') THEN 1 ELSE 0 END) AS attendance_met
            FROM class_sections cs
            JOIN courses c ON c.course_id = cs.course_id
            LEFT JOIN enrollments e ON e.cs_id = cs.cs_id
            LEFT JOIN attendance_records ar ON ar.enrollment_id = e.enrollment_id
            WHERE cs.instructor_user_id = :faculty_id
              AND (cs.status = 'active' OR cs.status IS NULL)
            GROUP BY cs.cs_id, cs.cs_name, c.course_code, c.name
            ORDER BY cs.cs_id
        ");
        $classStmt->execute([':faculty_id' => $authCtx['user_id']]);
        $classesList = $classStmt ? $classStmt->fetchAll(PDO::FETCH_ASSOC) : [];
        $activeClassesCount = count($classesList);

        $totalStudents = count($students);
        $goodStanding = 0;
        $atRisk = 0;
        $remedial = 0;

        foreach ($students as $s) {
            $st = strtolower($s['retention_state'] ?? $s['student_status'] ?? 'active');
            if ($st === 'active' || $st === 'good standing') {
                $goodStanding++;
            } elseif ($st === 'warning' || $st === 'critical') {
                $atRisk++;
            } elseif ($st === 'remedial') {
                $remedial++;
            } else {
                $goodStanding++;
            }
        }

        $attendanceTotal = 0;
        $attendanceMet = 0;
        $mappedClasses = array_map(function ($c) use (&$attendanceTotal, &$attendanceMet) {
            $classTotal = (int) ($c['attendance_total'] ?? 0);
            $classMet = (int) ($c['attendance_met'] ?? 0);
            $attendanceTotal += $classTotal;
            $attendanceMet += $classMet;
            return [
                'id' => (string)$c['cs_id'],
                'name' => $c['cs_name'],
                'courseCode' => $c['course_code'],
                'courseName' => $c['course_name'],
                'students' => (int) ($c['student_count'] ?? 0),
                'attendance' => $classTotal > 0
                    ? round(($classMet / $classTotal) * 100, 1)
                    : null,
            ];
        }, $classesList);

        json_response([
            'status' => 'ok',
            'kpis' => [
                'assignedStudents' => $totalStudents,
                'activeClasses' => $activeClassesCount,
                'averageAttendance' => $attendanceTotal > 0
                    ? round(($attendanceMet / $attendanceTotal) * 100, 1)
                    : null,
                'retentionAlerts' => $atRisk,
                'goodStanding' => $goodStanding,
                'remedialCount' => $remedial,
            ],
            'classes' => $mappedClasses,
        ], 200);
    } catch (\Throwable $e) {
        error_log('Faculty dashboard error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

function faculty_map_student_rows(array $rows): array
{
    $byStudent = [];
    $statusPriority = ['active' => 0, 'warning' => 1, 'remedial' => 2, 'critical' => 3];
    foreach ($rows as $row) {
        $id = (string) $row['student_id'];
        if (!isset($byStudent[$id])) {
            $fullName = trim($row['first_name'] . ($row['middle_name'] ? ' ' . $row['middle_name'] : '') . ' ' . $row['last_name']);
            $byStudent[$id] = [
                'id' => $id,
                'studentId' => $row['student_number'],
                'name' => $fullName,
                'firstName' => $row['first_name'],
                'middleName' => $row['middle_name'] ?? '',
                'lastName' => $row['last_name'],
                'email' => $row['bu_email'] ?? '',
                'contact' => $row['contact'] ?? '',
                'sex' => $row['sex'] ?? '',
                'yearLevel' => (int) ($row['year_level'] ?? 4),
                'status' => 'active',
                'admissionDate' => $row['admission_date'] ?? '',
                'birthdate' => $row['birthdate'] ?? '',
                'faceEnrolled' => (bool) ($row['face_enrolled'] ?? false),
                'consentStatus' => strtolower($row['consent_status'] ?? 'pending'),
                'overallGWA' => null,
                'clinicHoursCompleted' => 0,
                'classSections' => [],
                'enrolledSubjects' => [],
                '_grades' => [],
            ];
        }
        $entry = &$byStudent[$id];
        $state = strtolower((string) ($row['retention_state'] ?? 'active'));
        if (($statusPriority[$state] ?? 0) > ($statusPriority[$entry['status']] ?? 0)) {
            $entry['status'] = $state;
        }
        if ($row['final_gwa'] !== null) {
            $entry['_grades'][] = (float) $row['final_gwa'];
        }
        $entry['clinicHoursCompleted'] += (int) ($row['clinic_hours_completed'] ?? 0);
        $entry['classSections'][] = [
            'classId' => (string) $row['cs_id'],
            'className' => $row['cs_name'],
            'enrollmentId' => (string) $row['enrollment_id'],
        ];
        $entry['enrolledSubjects'][] = [
            'code' => $row['course_code'],
            'name' => $row['course_name'],
            'units' => (float) $row['units'],
            'isClinical' => (bool) $row['is_clinical'],
            'classId' => (string) $row['cs_id'],
            'enrollmentId' => (string) $row['enrollment_id'],
            'components' => $row['grade_components_json']
                ? json_decode($row['grade_components_json'], true)
                : ['quizzes' => 0, 'exams' => 0, 'practicum' => 0, 'attendance' => 0],
            'grade' => $row['final_gwa'] !== null ? (float) $row['final_gwa'] : null,
            'hasRemedial' => $state === 'remedial',
        ];
        unset($entry);
    }

    $mapped = array_values($byStudent);
    foreach ($mapped as &$student) {
        $student['overallGWA'] = count($student['_grades']) > 0
            ? array_sum($student['_grades']) / count($student['_grades'])
            : null;
        unset($student['_grades']);
    }
    unset($student);
    return $mapped;
}

function handle_faculty_students(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = faculty_verify_auth($pdo, $config);

        $stmt = $pdo->prepare("
            SELECT DISTINCT 
                s.student_id, s.student_number, s.first_name, s.middle_name, s.last_name, 
                s.bu_email, s.contact, s.sex, s.year_level, s.status, s.admission_date, 
                s.birthdate, b.consent_status, b.face_enrolled,
                cs.cs_id, cs.cs_name, e.enrollment_id, e.final_gwa, e.grade_components_json,
                e.retention_state, e.clinic_hours_completed, c.course_code,
                c.name AS course_name, c.units, c.is_clinical
            FROM students s
            JOIN enrollments e ON s.student_id = e.student_id
            JOIN class_sections cs ON e.cs_id = cs.cs_id
            JOIN courses c ON c.course_id = cs.course_id
            LEFT JOIN biometric_profiles b ON s.student_id = b.student_id
            WHERE cs.instructor_user_id = :faculty_id
        ");
        $stmt->execute([':faculty_id' => $authCtx['user_id']]);
        $students = $stmt ? $stmt->fetchAll(PDO::FETCH_ASSOC) : [];

        $mapped = faculty_map_student_rows($students);

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
        $firstName = normalize_person_name((string) ($data['firstName'] ?? ''));
        $middleName = normalize_person_name((string) ($data['middleName'] ?? ''));
        $lastName = normalize_person_name((string) ($data['lastName'] ?? ''));
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

        $errors = [];
        if (strlen($studentNumber) < 3) {
            $errors['studentId'] = 'Student ID number must be at least 3 characters.';
        }
        if (empty($firstName) || strlen($firstName) < 2) {
            $errors['firstName'] = 'First name must be at least 2 characters.';
        }
        if (empty($lastName) || strlen($lastName) < 2) {
            $errors['lastName'] = 'Last name must be at least 2 characters.';
        }
        if (!empty($email)) {
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                $errors['email'] = 'Invalid email address format.';
            } else {
                $domain = substr(strrchr(mb_strtolower($email), '@'), 1);
                if ($domain !== 'bicol-u.edu.ph') {
                    $errors['email'] = 'Only official Bicol University email addresses (@bicol-u.edu.ph) are allowed.';
                }
            }
        }
        if ($yearLevel < 1 || $yearLevel > 4) {
            $errors['yearLevel'] = 'Year level must be between 1 and 4.';
        }

        if (!empty($errors)) {
            validation_error_response($errors);
            return;
        }

        $classRef = $data['classId'] ?? '';
        $csId = $classRef !== ''
            ? faculty_owned_class_id($pdo, (int) $authCtx['user_id'], $classRef)
            : 0;
        if ($classRef !== '' && $csId <= 0) {
            safe_error_response('Selected class is not assigned to this faculty member.', 403);
            return;
        }
        if ($csId <= 0) {
            $classStmt = $pdo->prepare("SELECT cs_id FROM class_sections WHERE instructor_user_id = ? AND status = 'Active' ORDER BY cs_id LIMIT 1");
            $classStmt->execute([$authCtx['user_id']]);
            $csId = (int) ($classStmt->fetchColumn() ?: 0);
        }
        if ($csId <= 0) {
            safe_error_response('Create or select an assigned class before registering a student.', 422);
            return;
        }

        $pdo->beginTransaction();
        $stmt = $pdo->prepare("INSERT INTO students (student_number, first_name, middle_name, last_name, bu_email, contact, sex, year_level, status, admission_date, birthdate, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(6)) RETURNING student_id");
        $stmt->execute([
            $studentNumber, $firstName, $middleName ?: null, $lastName, $email ?: null,
            $contact ?: null, $sex ?: null, $yearLevel, $status, $admissionDate, $birthdate
        ]);
        $newId = (int) $stmt->fetchColumn();
        $enroll = $pdo->prepare("INSERT INTO enrollments (student_id, cs_id, status, date_enrolled) VALUES (?, ?, 'Active', CURRENT_DATE) RETURNING enrollment_id");
        $enroll->execute([$newId, $csId]);
        $enrollmentId = (int) $enroll->fetchColumn();
        $classInfo = $pdo->prepare("SELECT cs_name FROM class_sections WHERE cs_id = ?");
        $classInfo->execute([$csId]);
        $className = (string) $classInfo->fetchColumn();
        $pdo->commit();

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
                'classSections' => [[
                    'classId' => (string) $csId,
                    'className' => $className,
                    'enrollmentId' => (string) $enrollmentId,
                ]],
                'enrolledSubjects' => [],
            ],
        ], 201);
    } catch (\Throwable $e) {
        if (isset($pdo) && $pdo->inTransaction()) { $pdo->rollBack(); }
        error_log('Faculty student create error: ' . sanitize_for_log($e));
        if ($e instanceof PDOException && (string) $e->getCode() === '23000') {
            safe_error_response('Student number or email already exists.', 409);
            return;
        }
        safe_error_response('Failed to register student.', 500);
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

        $studentId = (int) ($body['data']['studentId'] ?? 0);
        $owner = $pdo->prepare(
            "SELECT 1 FROM enrollments e JOIN class_sections cs ON cs.cs_id = e.cs_id
             WHERE e.student_id = ? AND cs.instructor_user_id = ? LIMIT 1"
        );
        $owner->execute([$studentId, $authCtx['user_id']]);
        if ($studentId <= 0 || !$owner->fetchColumn()) {
            safe_error_response('Student not found in an assigned class.', 404);
            return;
        }
        safe_error_response('Biometric integration is not configured. Use manual attendance controls.', 501);
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

function faculty_owned_class_id(PDO $pdo, int $facultyId, mixed $classRef): int
{
    $value = trim((string) $classRef);
    if ($value === '') {
        return 0;
    }
    $stmt = ctype_digit($value)
        ? $pdo->prepare("SELECT cs_id FROM class_sections WHERE cs_id = ? AND instructor_user_id = ?")
        : $pdo->prepare("SELECT cs_id FROM class_sections WHERE cs_name = ? AND instructor_user_id = ?");
    $stmt->execute([ctype_digit($value) ? (int) $value : $value, $facultyId]);
    return (int) ($stmt->fetchColumn() ?: 0);
}

function faculty_percentage_to_gwa(float $percentage): float
{
    if ($percentage >= 97) return 1.0;
    if ($percentage >= 94) return 1.25;
    if ($percentage >= 91) return 1.5;
    if ($percentage >= 88) return 1.75;
    if ($percentage >= 85) return 2.0;
    if ($percentage >= 82) return 2.25;
    if ($percentage >= 80) return 2.5;
    if ($percentage >= 78) return 2.75;
    if ($percentage >= 75) return 3.0;
    return 5.0;
}

function handle_faculty_assessments_get(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = faculty_verify_auth($pdo, $config);

        $stmt = $pdo->prepare(
            "SELECT a.assessment_id, a.title, a.type, a.grading_period, a.max_score,
                    a.weight, a.due_date, a.instructions, a.status, a.created_at,
                    cs.cs_id, cs.cs_name, c.course_code
             FROM assessments a
             JOIN class_sections cs ON cs.cs_id = a.cs_id
             JOIN courses c ON c.course_id = cs.course_id
             WHERE cs.instructor_user_id = ?
             ORDER BY a.created_at DESC, a.assessment_id DESC"
        );
        $stmt->execute([$authCtx['user_id']]);
        $assessments = array_map(static fn(array $row): array => [
            'id' => (string) $row['assessment_id'],
            'title' => $row['title'],
            'type' => $row['type'],
            'gradingPeriod' => $row['grading_period'],
            'maxScore' => (float) $row['max_score'],
            'weight' => $row['weight'] !== null ? (float) $row['weight'] : null,
            'dueDate' => $row['due_date'],
            'instructions' => $row['instructions'],
            'status' => $row['status'],
            'classId' => (string) $row['cs_id'],
            'className' => $row['cs_name'],
            'subjectCode' => $row['course_code'],
            'createdAt' => $row['created_at'],
        ], $stmt->fetchAll(PDO::FETCH_ASSOC));

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

        $items = $body['data'];
        if (!is_array($items)) {
            safe_error_response('Assessments must be an array.', 422);
            return;
        }

        $persisted = [];
        $pdo->beginTransaction();
        foreach ($items as $item) {
            if (!is_array($item)) {
                continue;
            }
            $csId = faculty_owned_class_id($pdo, (int) $authCtx['user_id'], $item['classId'] ?? '');
            if ($csId <= 0) {
                $pdo->rollBack();
                safe_error_response('Assessment class is not assigned to this faculty member.', 403);
                return;
            }
            $title = trim((string) ($item['title'] ?? ''));
            $type = (string) ($item['type'] ?? '');
            $period = (string) ($item['gradingPeriod'] ?? '');
            $maxScore = (float) ($item['maxScore'] ?? 0);
            $weight = isset($item['weight']) ? (float) $item['weight'] : null;
            if ($title === '' || $maxScore <= 0 || !in_array($period, ['Midterm', 'Final'], true)) {
                $pdo->rollBack();
                safe_error_response('Assessment title, valid period, and positive maximum score are required.', 422);
                return;
            }
            $allowedTypes = ['Quiz', 'Activity', 'Assignment', 'Laboratory', 'Midterm Exam', 'Final Exam', 'Others'];
            if (!in_array($type, $allowedTypes, true)) {
                $pdo->rollBack();
                safe_error_response('Assessment type is invalid.', 422);
                return;
            }
            $assessmentId = ctype_digit((string) ($item['id'] ?? '')) ? (int) $item['id'] : 0;
            if ($assessmentId > 0) {
                $stmt = $pdo->prepare(
                    "UPDATE assessments AS a
                     SET cs_id = ?, title = ?, type = ?, grading_period = ?,
                         max_score = ?, weight = ?, due_date = ?, instructions = ?,
                         status = ?
                     FROM class_sections AS cs
                     WHERE a.assessment_id = ? AND cs.cs_id = a.cs_id AND cs.instructor_user_id = ?"
                );
                $stmt->execute([
                    $csId, $title, $type, $period, $maxScore, $weight,
                    $item['dueDate'] ?? null, $item['instructions'] ?? null,
                    $item['status'] ?? 'Active', $assessmentId, $authCtx['user_id'],
                ]);
                if ($stmt->rowCount() === 0) {
                    $exists = $pdo->prepare(
                        "SELECT 1
                           FROM assessments a
                           JOIN class_sections cs ON cs.cs_id = a.cs_id
                          WHERE a.assessment_id = ?
                            AND cs.instructor_user_id = ?"
                    );
                    $exists->execute([$assessmentId, $authCtx['user_id']]);
                    if (!$exists->fetchColumn()) {
                        $pdo->rollBack();
                        safe_error_response('Assessment not found.', 404);
                        return;
                    }
                }
            } else {
                $stmt = $pdo->prepare(
                    "INSERT INTO assessments
                     (cs_id, title, type, grading_period, max_score, weight, due_date, instructions, status)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING assessment_id"
                );
                $stmt->execute([
                    $csId, $title, $type, $period, $maxScore, $weight,
                    $item['dueDate'] ?? null, $item['instructions'] ?? null,
                    $item['status'] ?? 'Active',
                ]);
                $assessmentId = (int) $stmt->fetchColumn();
            }
            $persisted[] = ['id' => (string) $assessmentId, 'classId' => (string) $csId, 'title' => $title];
        }
        $pdo->commit();

        json_response(['status' => 'ok', 'message' => 'Assessments persisted successfully.', 'assessments' => $persisted], 200);
    } catch (\Throwable $e) {
        if (isset($pdo) && $pdo->inTransaction()) { $pdo->rollBack(); }
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

        $assessmentId = (int) ($_GET['assessmentId'] ?? 0);
        $owner = $pdo->prepare(
            "SELECT 1 FROM assessments a JOIN class_sections cs ON cs.cs_id = a.cs_id
             WHERE a.assessment_id = ? AND cs.instructor_user_id = ?"
        );
        $owner->execute([$assessmentId, $authCtx['user_id']]);
        if (!$owner->fetchColumn()) {
            safe_error_response('Assessment not found.', 404);
            return;
        }
        $stmt = $pdo->prepare(
            "SELECT sc.score_id, sc.student_id, sc.score, sc.remarks, sc.submitted_at
             FROM assessment_scores sc WHERE sc.assessment_id = ? ORDER BY sc.student_id"
        );
        $stmt->execute([$assessmentId]);
        $scores = array_map(static fn(array $row): array => [
            'id' => (string) $row['score_id'],
            'studentId' => (string) $row['student_id'],
            'score' => (float) $row['score'],
            'remarks' => $row['remarks'],
            'submittedAt' => $row['submitted_at'],
        ], $stmt->fetchAll(PDO::FETCH_ASSOC));

        json_response([
            'status' => 'ok',
            'assessmentId' => (string) $assessmentId,
            'scores' => $scores,
        ], 200);
    } catch (\Throwable $e) {
        error_log('Faculty scores get error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

function handle_faculty_assessment_delete(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = faculty_verify_auth($pdo, $config);
        $body = request_body();
        if (!$body['has_body']) {
            safe_error_response('Assessment identifier is required.', 422);
            return;
        }
        $assessmentId = (int) ($body['data']['assessmentId'] ?? 0);
        if ($assessmentId <= 0) {
            safe_error_response('Assessment identifier is required.', 422);
            return;
        }
        $owner = $pdo->prepare(
            "SELECT a.assessment_id
             FROM assessments a
             JOIN class_sections cs ON cs.cs_id = a.cs_id
             WHERE a.assessment_id = ? AND cs.instructor_user_id = ?
             FOR UPDATE"
        );
        $pdo->beginTransaction();
        $owner->execute([$assessmentId, $authCtx['user_id']]);
        if (!$owner->fetchColumn()) {
            $pdo->rollBack();
            safe_error_response('Assessment not found in an assigned class.', 404);
            return;
        }
        $scores = $pdo->prepare("DELETE FROM assessment_scores WHERE assessment_id = ?");
        $scores->execute([$assessmentId]);
        $assessment = $pdo->prepare("DELETE FROM assessments WHERE assessment_id = ?");
        $assessment->execute([$assessmentId]);
        if ($assessment->rowCount() !== 1) {
            throw new RuntimeException('Assessment deletion did not affect exactly one row.');
        }
        $pdo->commit();
        json_response([
            'status' => 'ok',
            'message' => 'Assessment and its scores were deleted.',
            'assessmentId' => (string) $assessmentId,
            'deletedScoreCount' => $scores->rowCount(),
        ], 200);
    } catch (\Throwable $e) {
        if (isset($pdo) && $pdo->inTransaction()) { $pdo->rollBack(); }
        error_log('Faculty assessment delete error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

function handle_faculty_scores_save(): void
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
        $assessmentId = (int) ($data['assessmentId'] ?? 0);
        $scores = $data['scores'] ?? [];
        $assessment = $pdo->prepare(
            "SELECT a.max_score, a.cs_id
             FROM assessments a JOIN class_sections cs ON cs.cs_id = a.cs_id
             WHERE a.assessment_id = ? AND cs.instructor_user_id = ?"
        );
        $assessment->execute([$assessmentId, $authCtx['user_id']]);
        $row = $assessment->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            safe_error_response('Assessment not found.', 404);
            return;
        }
        if (!is_array($scores) || $scores === []) {
            safe_error_response('At least one score is required.', 422);
            return;
        }
        $pdo->beginTransaction();
        $enrolled = $pdo->prepare(
            "SELECT 1 FROM enrollments WHERE cs_id = ? AND student_id = ? AND status = 'Active'"
        );
        $upsert = $pdo->prepare(
            "INSERT INTO assessment_scores (assessment_id, student_id, score, submitted_at, remarks)
             VALUES (?, ?, ?, CURRENT_TIMESTAMP(6), ?)
             ON CONFLICT (assessment_id, student_id) DO UPDATE
             SET score = EXCLUDED.score,
                 submitted_at = EXCLUDED.submitted_at,
                 remarks = EXCLUDED.remarks"
        );
        $saved = 0;
        foreach ($scores as $scoreRow) {
            $studentId = (int) ($scoreRow['studentId'] ?? 0);
            $score = (float) ($scoreRow['score'] ?? -1);
            if ($studentId <= 0 || $score < 0 || $score > (float) $row['max_score']) {
                $pdo->rollBack();
                safe_error_response('Every score must belong to the class and be between zero and the assessment maximum.', 422);
                return;
            }
            $enrolled->execute([$row['cs_id'], $studentId]);
            if (!$enrolled->fetchColumn()) {
                $pdo->rollBack();
                safe_error_response('A scored student is not enrolled in the assessment class.', 422);
                return;
            }
            $upsert->execute([$assessmentId, $studentId, $score, $scoreRow['remarks'] ?? null]);
            $saved++;
        }
        $pdo->commit();
        json_response(['status' => 'ok', 'message' => 'Student scores persisted successfully.', 'savedCount' => $saved], 200);
    } catch (\Throwable $e) {
        if (isset($pdo) && $pdo->inTransaction()) { $pdo->rollBack(); }
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
        $body = request_body();
        $data = $body['has_body'] ? $body['data'] : [];
        $classRef = $data['classId'] ?? '';
        $csId = $classRef !== '' ? faculty_owned_class_id($pdo, (int) $authCtx['user_id'], $classRef) : 0;
        if ($classRef !== '' && $csId <= 0) {
            safe_error_response('Class is not assigned to this faculty member.', 403);
            return;
        }

        $settingsStmt = $pdo->query("SELECT setting_value FROM system_settings WHERE setting_key = 'grading_defaults' LIMIT 1");
        $gradingSettings = json_decode((string) ($settingsStmt->fetchColumn() ?: '{}'), true);
        $attendanceWeight = max(0.0, min(100.0, (float) ($gradingSettings['default_weights']['attendance'] ?? 0)));
        $retentionStmt = $pdo->query("SELECT setting_value FROM system_settings WHERE setting_key = 'retention_policy' LIMIT 1");
        $retentionSettings = json_decode((string) ($retentionStmt->fetchColumn() ?: '{}'), true);
        $retentionThreshold = (float) ($retentionSettings['retention_threshold'] ?? 2.5);
        if ($retentionThreshold < 1.0 || $retentionThreshold > 5.0) {
            throw new RuntimeException('Persisted retention threshold is invalid.');
        }
        $warningUpperBound = min(5.0, $retentionThreshold + 0.5);

        $sql = "SELECT e.enrollment_id, e.student_id, e.cs_id,
                       SUM((sc.score / NULLIF(a.max_score, 0)) * COALESCE(a.weight, 0)) AS weighted_points,
                       SUM(CASE WHEN sc.score_id IS NOT NULL THEN COALESCE(a.weight, 0) ELSE 0 END) AS completed_weight,
                       MAX(att.attendance_percentage) AS attendance_percentage
                FROM enrollments e
                JOIN class_sections cs ON cs.cs_id = e.cs_id
                LEFT JOIN assessments a ON a.cs_id = e.cs_id AND a.status <> 'Archived'
                LEFT JOIN assessment_scores sc ON sc.assessment_id = a.assessment_id AND sc.student_id = e.student_id
                LEFT JOIN (
                    SELECT enrollment_id,
                           AVG(CASE
                               WHEN status IN ('present', 'excused') THEN 100
                               WHEN status = 'late' THEN 80
                               ELSE 0
                           END) AS attendance_percentage
                    FROM attendance_records
                    GROUP BY enrollment_id
                ) att ON att.enrollment_id = e.enrollment_id
                WHERE cs.instructor_user_id = :faculty_id";
        $params = [':faculty_id' => $authCtx['user_id']];
        if ($csId > 0) {
            $sql .= " AND e.cs_id = :cs_id";
            $params[':cs_id'] = $csId;
        }
        $sql .= " GROUP BY e.enrollment_id, e.student_id, e.cs_id";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $results = [];
        $pdo->beginTransaction();
        foreach ($rows as $row) {
            $completedWeight = (float) ($row['completed_weight'] ?? 0);
            if ($completedWeight <= 0) {
                continue;
            }
            $assessmentPercentage = ((float) $row['weighted_points'] / $completedWeight) * 100;
            $hasAttendance = $row['attendance_percentage'] !== null;
            $effectiveAttendanceWeight = $hasAttendance ? $attendanceWeight : 0.0;
            $assessmentWeight = 100.0 - $effectiveAttendanceWeight;
            $attendancePercentage = $hasAttendance ? (float) $row['attendance_percentage'] : null;
            $percentage = round(
                ($assessmentPercentage * $assessmentWeight / 100)
                + (($attendancePercentage ?? 0) * $effectiveAttendanceWeight / 100),
                2
            );
            $gwa = faculty_percentage_to_gwa($percentage);
            $retention = $gwa <= $retentionThreshold
                ? 'active'
                : ($gwa <= $warningUpperBound ? 'warning' : 'critical');
            $breakdown = [
                'assessmentPercentage' => round($assessmentPercentage, 2),
                'assessmentWeight' => $assessmentWeight,
                'attendancePercentage' => $attendancePercentage !== null ? round($attendancePercentage, 2) : null,
                'attendanceWeight' => $effectiveAttendanceWeight,
                'retentionThreshold' => $retentionThreshold,
            ];
            $updateWithBreakdown = $pdo->prepare(
                "UPDATE enrollments
                 SET final_percentage = ?, final_gwa = ?, retention_state = ?, grade_components_json = ?
                 WHERE enrollment_id = ?"
            );
            $updateWithBreakdown->execute([
                $percentage,
                $gwa,
                $retention,
                json_encode($breakdown, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                $row['enrollment_id'],
            ]);
            $results[] = [
                'enrollmentId' => (string) $row['enrollment_id'],
                'studentId' => (string) $row['student_id'],
                'percentage' => $percentage,
                'gwa' => $gwa,
                'retentionState' => $retention,
                'breakdown' => $breakdown,
            ];
        }
        $pdo->commit();
        json_response([
            'status' => 'ok',
            'message' => 'Grades computed and persisted successfully.',
            'results' => $results,
        ], 200);
    } catch (\Throwable $e) {
        if (isset($pdo) && $pdo->inTransaction()) { $pdo->rollBack(); }
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

        $stmt = $pdo->prepare(
            "SELECT r.record_id, r.session_date, r.session_code, r.status, r.verification_method,
                    r.override_reason, r.override_at, s.student_id, s.student_number,
                    cs.cs_id, cs.cs_name, c.course_code
             FROM attendance_records r
             JOIN enrollments e ON e.enrollment_id = r.enrollment_id
             JOIN students s ON s.student_id = e.student_id
             JOIN class_sections cs ON cs.cs_id = e.cs_id
             JOIN courses c ON c.course_id = cs.course_id
             WHERE cs.instructor_user_id = ?
             ORDER BY r.session_date DESC, r.record_id DESC"
        );
        $stmt->execute([$authCtx['user_id']]);
        $records = array_map(static fn(array $row): array => [
            'id' => (string) $row['record_id'],
            'studentId' => (string) $row['student_id'],
            'studentNumber' => $row['student_number'],
            'date' => $row['session_date'],
            'subjectCode' => $row['course_code'],
            'classId' => (string) $row['cs_id'],
            'className' => $row['cs_name'],
            'status' => $row['status'],
            'verificationMethod' => $row['verification_method'],
            'overrideReason' => $row['override_reason'],
            'overrideAt' => $row['override_at'],
        ], $stmt->fetchAll(PDO::FETCH_ASSOC));
        json_response([
            'status' => 'ok',
            'records' => $records,
        ], 200);
    } catch (\Throwable $e) {
        error_log('Faculty attendance get error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

function handle_faculty_attendance_session_create(): void
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
        $subjectCode = strtoupper(trim((string) ($data['subjectCode'] ?? '')));
        $sessionDate = trim((string) ($data['date'] ?? ''));
        $topic = trim((string) ($data['topic'] ?? ''));
        $date = DateTimeImmutable::createFromFormat('!Y-m-d', $sessionDate);
        if ($subjectCode === '' || !$date || $date->format('Y-m-d') !== $sessionDate) {
            safe_error_response('A valid subject and session date are required.', 422);
            return;
        }
        $classStmt = $pdo->prepare(
            "SELECT cs.cs_id
             FROM class_sections cs
             JOIN courses c ON c.course_id = cs.course_id
             WHERE cs.instructor_user_id = ? AND c.course_code = ? AND cs.status = 'Active'
             ORDER BY cs.cs_id LIMIT 1"
        );
        $classStmt->execute([$authCtx['user_id'], $subjectCode]);
        $csId = (int) ($classStmt->fetchColumn() ?: 0);
        if ($csId <= 0) {
            safe_error_response('Subject is not assigned to this faculty member.', 403);
            return;
        }
        unset($topic, $csId);
        safe_error_response(
            'Attendance session scheduling is not configured. Record or override each student attendance entry explicitly.',
            501
        );
    } catch (\Throwable $e) {
        error_log('Faculty attendance session create error: ' . sanitize_for_log($e));
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

        $data = $body['data'];
        $recordId = (int) ($data['recordId'] ?? 0);
        $status = (string) ($data['status'] ?? '');
        $reason = trim((string) ($data['reason'] ?? ''));
        if ($recordId <= 0 || !in_array($status, ['present', 'absent', 'late', 'excused'], true) || strlen($reason) < 8) {
            safe_error_response('Record, valid status, and an override reason of at least 8 characters are required.', 422);
            return;
        }
        $stmt = $pdo->prepare(
            "UPDATE attendance_records AS r
             SET status = ?, verification_method = 'manual_faculty', override_reason = ?,
                 override_by_user_id = ?, override_at = CURRENT_TIMESTAMP(6)
             FROM enrollments AS e
             JOIN class_sections AS cs ON cs.cs_id = e.cs_id
             WHERE r.record_id = ? AND e.enrollment_id = r.enrollment_id AND cs.instructor_user_id = ?"
        );
        $stmt->execute([$status, $reason, $authCtx['user_id'], $recordId, $authCtx['user_id']]);
        if ($stmt->rowCount() === 0) {
            safe_error_response('Attendance record not found in an assigned class.', 404);
            return;
        }
        json_response(['status' => 'ok', 'message' => 'Manual attendance override persisted successfully.', 'recordId' => (string) $recordId], 200);
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

        $stmt = $pdo->prepare(
            "SELECT e.enrollment_id, e.student_id, e.final_percentage, e.final_gwa,
                    e.retention_state, e.remedial_state_json, s.student_number,
                    s.first_name, s.middle_name, s.last_name, cs.cs_id, cs.cs_name, c.course_code
             FROM enrollments e
             JOIN students s ON s.student_id = e.student_id
             JOIN class_sections cs ON cs.cs_id = e.cs_id
             JOIN courses c ON c.course_id = cs.course_id
             WHERE cs.instructor_user_id = ?
             ORDER BY e.retention_state DESC, s.last_name, s.first_name"
        );
        $stmt->execute([$authCtx['user_id']]);
        $retention = array_map(static fn(array $row): array => [
            'enrollmentId' => (string) $row['enrollment_id'],
            'studentId' => (string) $row['student_id'],
            'studentNumber' => $row['student_number'],
            'studentName' => trim($row['first_name'] . ' ' . ($row['middle_name'] ? $row['middle_name'] . ' ' : '') . $row['last_name']),
            'classId' => (string) $row['cs_id'],
            'className' => $row['cs_name'],
            'subjectCode' => $row['course_code'],
            'percentage' => $row['final_percentage'] !== null ? (float) $row['final_percentage'] : null,
            'gwa' => $row['final_gwa'] !== null ? (float) $row['final_gwa'] : null,
            'state' => $row['retention_state'],
            'remedial' => $row['remedial_state_json'] ? json_decode($row['remedial_state_json'], true) : null,
        ], $stmt->fetchAll(PDO::FETCH_ASSOC));
        json_response([
            'status' => 'ok',
            'retention' => $retention,
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
        $body = request_body();
        if (!$body['has_body']) {
            safe_error_response('Request body required.', 400);
            return;
        }
        $data = $body['data'];
        $enrollmentId = (int) ($data['enrollmentId'] ?? 0);
        $studentId = (int) ($data['studentId'] ?? 0);
        $classId = (int) ($data['classId'] ?? 0);
        $remedial = $data['remedial'] ?? null;
        if (($enrollmentId <= 0 && ($studentId <= 0 || $classId <= 0)) || !is_array($remedial)) {
            safe_error_response('Enrollment or student/class identifiers and remedial details are required.', 422);
            return;
        }
        $json = json_encode($remedial, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $remedialStatus = (string) ($remedial['status'] ?? 'pending');
        $state = in_array($remedialStatus, ['passed', 'removed'], true) ? 'active' : 'remedial';
        $where = $enrollmentId > 0
            ? 'e.enrollment_id = ?'
            : 'e.student_id = ? AND e.cs_id = ?';
        $stmt = $pdo->prepare(
            "UPDATE enrollments AS e
             SET remedial_state_json = ?, retention_state = ?
             FROM class_sections AS cs
             WHERE {$where} AND cs.cs_id = e.cs_id AND cs.instructor_user_id = ?"
        );
        $params = $enrollmentId > 0
            ? [$json, $state, $enrollmentId, $authCtx['user_id']]
            : [$json, $state, $studentId, $classId, $authCtx['user_id']];
        $stmt->execute($params);
        if ($stmt->rowCount() === 0) {
            safe_error_response('Enrollment not found in an assigned class.', 404);
            return;
        }
        json_response(['status' => 'ok', 'message' => 'Remedial record persisted successfully.', 'enrollmentId' => $enrollmentId > 0 ? (string) $enrollmentId : null], 200);
    } catch (\Throwable $e) {
        error_log('Faculty retention remedial save error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

function handle_faculty_retention_status_update(): void
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
        $classId = (int) ($data['classId'] ?? 0);
        $state = (string) ($data['status'] ?? '');
        $reason = trim((string) ($data['reason'] ?? ''));
        if ($studentId <= 0 || $classId <= 0 || !in_array($state, ['active', 'warning', 'critical', 'remedial'], true) || mb_strlen($reason) < 8) {
            safe_error_response('Student, class, valid retention state, and an eight-character reason are required.', 422);
            return;
        }
        $stmt = $pdo->prepare(
            "UPDATE enrollments e
             SET retention_state = ?,
                 remedial_state_json = jsonb_set(
                     jsonb_set(COALESCE(e.remedial_state_json, '{}'::jsonb), '{overrideReason}', to_jsonb(?::text), true),
                     '{overriddenAt}', to_jsonb(?::text), true
                 )
             FROM class_sections cs
             WHERE cs.cs_id = e.cs_id
               AND e.student_id = ? AND e.cs_id = ? AND cs.instructor_user_id = ?"
        );
        $now = gmdate('Y-m-d\TH:i:s\Z');
        $stmt->execute([$state, $reason, $now, $studentId, $classId, $authCtx['user_id']]);
        if ($stmt->rowCount() === 0) {
            safe_error_response('Enrollment not found in an assigned class.', 404);
            return;
        }
        json_response([
            'status' => 'ok',
            'message' => 'Retention state persisted successfully.',
            'retention' => [
                'studentId' => (string) $studentId,
                'classId' => (string) $classId,
                'state' => $state,
                'reason' => $reason,
                'updatedAt' => $now,
            ],
        ], 200);
    } catch (\Throwable $e) {
        error_log('Faculty retention status update error: ' . sanitize_for_log($e));
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
        $name = validate_person_name($data, 'name', 2, 255);
        $email = validate_institutional_email($data['email'] ?? '');

        update_account_identity($pdo, (int) $authCtx['user_id'], $name, $email);

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

        $stmt = $pdo->prepare("SELECT theme FROM user_accounts WHERE user_id = ?");
        $stmt->execute([$authCtx['user_id']]);
        $theme = $stmt->fetchColumn();
        json_response([
            'status' => 'ok',
            'settings' => [
                'theme' => in_array($theme, ['light', 'dark'], true) ? $theme : 'light',
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
        $body = request_body();
        if (!$body['has_body']) {
            safe_error_response('Request body required.', 400);
            return;
        }
        $theme = (string) ($body['data']['theme'] ?? '');
        if (!in_array($theme, ['light', 'dark'], true)) {
            safe_error_response('Theme must be light or dark.', 422);
            return;
        }
        $stmt = $pdo->prepare("UPDATE user_accounts SET theme = ? WHERE user_id = ?");
        $stmt->execute([$theme, $authCtx['user_id']]);
        json_response(['status' => 'ok', 'message' => 'Faculty preferences saved successfully.'], 200);
    } catch (\Throwable $e) {
        error_log('Faculty settings update error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

function handle_faculty_email_send(): void
{
    $context = [
        'request_id' => request_id(),
        'ip_address' => request_ip(),
        'user_agent' => request_user_agent(),
        'http_method' => request_method(),
        'endpoint' => request_path(),
    ];

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
        $studentIds = $data['studentIds'] ?? [];
        $type = validate_required_string($data, 'emailType', 2, 100);
        $subject = validate_optional_string($data, 'subject', 1, 255) ?? "DentiSys Notification: {$type}";

        if (!is_array($studentIds) || count($studentIds) === 0) {
            safe_error_response('At least one studentId is required.', 400);
            return;
        }

        $messageText = validate_optional_string($data, 'message', 1, 10000)
            ?? "This is an official DentiSys {$type} notice.";
        $allowedTypes = ['Privacy Consent', 'At-Risk Notification', 'Other'];
        $emailType = in_array($type, $allowedTypes, true) ? $type : 'Other';
        $studentIds = array_values(array_unique(array_filter(
            array_map(static fn(mixed $id): int => (int) $id, $studentIds),
            static fn(int $id): bool => $id > 0
        )));
        if (count($studentIds) === 0) {
            safe_error_response('At least one valid studentId is required.', 422);
            return;
        }
        $placeholders = implode(',', array_fill(0, count($studentIds), '?'));
        $recipientStmt = $pdo->prepare(
            "SELECT DISTINCT s.student_id, s.bu_email,
                    TRIM(CONCAT(s.first_name, ' ', COALESCE(s.middle_name, ''), ' ', s.last_name)) AS student_name
               FROM students s
               JOIN enrollments e ON e.student_id = s.student_id
               JOIN class_sections cs ON cs.cs_id = e.cs_id
              WHERE cs.instructor_user_id = ?
                AND s.student_id IN ({$placeholders})"
        );
        $recipientStmt->execute(array_merge([(int) $authCtx['user_id']], $studentIds));
        $validatedRecipients = $recipientStmt->fetchAll(PDO::FETCH_ASSOC);
        $ownedIds = array_map(static fn(array $row): int => (int) $row['student_id'], $validatedRecipients);
        if (count(array_diff($studentIds, $ownedIds)) > 0) {
            safe_error_response('One or more students are not enrolled in your classes.', 403);
            return;
        }
        $safeMessage = nl2br(htmlspecialchars($messageText, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'));
        $messageBody = "<p>{$safeMessage}</p>";
        $insert = $pdo->prepare(
            "INSERT INTO email_outbox
             (sender_user_id, recipient_email, recipient_name, subject, email_type, message_body, status, operation_uuid)
             VALUES (?, ?, ?, ?, ?, ?, 'Pending', ?) RETURNING email_id"
        );
        $finish = $pdo->prepare(
            "UPDATE email_outbox
             SET status = ?, sent_at = ?, failure_reason = ?
             WHERE email_id = ?"
        );
        $results = [];
        foreach ($validatedRecipients as $recipient) {
            $recipientName = trim((string) $recipient['student_name']);
            $recipientEmail = mb_strtolower(trim((string) ($recipient['bu_email'] ?? '')));
            if ($recipientEmail === '' || !filter_var($recipientEmail, FILTER_VALIDATE_EMAIL)) {
                $results[] = [
                    'id' => null,
                    'studentId' => (string) $recipient['student_id'],
                    'recipient' => null,
                    'status' => 'Failed',
                    'failureReason' => 'Student has no valid email address.',
                ];
                continue;
            }
            $operationUuid = uuid_v4_string();
            $insert->execute([
                $authCtx['user_id'], $recipientEmail, $recipientName,
                $subject, $emailType, $messageBody, $operationUuid,
            ]);
            $emailId = (int) $insert->fetchColumn();
            if ($emailId <= 0) {
                throw new RuntimeException('Email outbox insert did not return a valid identifier.');
            }
            $sent = send_email($recipientEmail, $subject, $messageBody, $config);
            $status = $sent ? 'Sent' : 'Failed';
            $sentAt = $sent ? (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d H:i:s.u') : null;
            $failure = $sent ? null : 'SMTP delivery failed or is not configured.';
            $finish->execute([$status, $sentAt, $failure, $emailId]);
            $results[] = [
                'id' => (string) $emailId,
                'recipient' => $recipientEmail,
                'status' => $status,
            ];
        }

        $sentCount = count(array_filter($results, static fn(array $row): bool => $row['status'] === 'Sent'));
        $failedCount = count($results) - $sentCount;
        json_response([
            'status' => $failedCount === 0 ? 'ok' : 'partial',
            'message' => $failedCount === 0
                ? 'Notification email(s) sent successfully.'
                : "{$sentCount} email(s) sent; {$failedCount} failed.",
            'sentCount' => $sentCount,
            'failedCount' => $failedCount,
            'deliveries' => $results,
        ], $failedCount === 0 ? 200 : 207);
    } catch (ValidationException $e) {
        validation_error_response($e->getErrors());
    } catch (\Throwable $e) {
        error_log('Faculty email send error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

function handle_faculty_email_logs(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = faculty_verify_auth($pdo, $config);

        $stmt = $pdo->prepare(
            "SELECT email_id, recipient_email, recipient_name, subject, email_type, status,
                    sent_at, failure_reason, created_at
             FROM email_outbox
             WHERE sender_user_id = ?
             ORDER BY created_at DESC LIMIT 100"
        );
        $stmt->execute([$authCtx['user_id']]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $mapped = array_map(function ($r) {
            return [
                'id' => 'mail-' . $r['email_id'],
                'recipient' => $r['recipient_name'] ?: $r['recipient_email'],
                'recipientEmail' => $r['recipient_email'],
                'subject' => $r['subject'],
                'type' => $r['email_type'],
                'sentAt' => $r['sent_at'] ?: $r['created_at'],
                'status' => $r['status'],
                'failureReason' => $r['failure_reason'],
            ];
        }, $rows);

        json_response([
            'status' => 'ok',
            'logs' => $mapped,
        ], 200);
    } catch (\Throwable $e) {
        error_log('Faculty email logs error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

function handle_faculty_reports_summary(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = faculty_verify_auth($pdo, $config);

        $stmt = $pdo->prepare(
            "SELECT s.student_id, s.student_number, s.first_name, s.middle_name, s.last_name,
                    s.bu_email, s.year_level, s.status, b.consent_status, b.face_enrolled,
                    e.final_gwa, e.final_percentage, e.retention_state, e.remedial_state_json,
                    e.grade_components_json, e.clinic_hours_completed, cs.cs_id, cs.cs_name,
                    c.course_code, c.name AS course_name, c.units, c.is_clinical
             FROM students s
             JOIN enrollments e ON e.student_id = s.student_id
             JOIN class_sections cs ON cs.cs_id = e.cs_id
             JOIN courses c ON c.course_id = cs.course_id
             LEFT JOIN biometric_profiles b ON s.student_id = b.student_id
             WHERE cs.instructor_user_id = ?
             ORDER BY s.student_number ASC, cs.cs_id ASC"
        );
        $stmt->execute([$authCtx['user_id']]);
        $students = $stmt ? $stmt->fetchAll(PDO::FETCH_ASSOC) : [];

        $grouped = [];
        foreach ($students as $s) {
            $id = (string) $s['student_id'];
            if (!isset($grouped[$id])) {
                $grouped[$id] = [
                    'id' => $id,
                    'studentId' => $s['student_number'],
                    'name' => trim($s['first_name'] . ' ' . ($s['middle_name'] ? $s['middle_name'] . ' ' : '') . $s['last_name']),
                    'email' => $s['bu_email'] ?? '',
                    'yearLevel' => (int) ($s['year_level'] ?? 4),
                    'status' => $s['retention_state'],
                    'overallGWA' => null,
                    'faceEnrolled' => (bool) ($s['face_enrolled'] ?? false),
                    'consentStatus' => $s['consent_status'] ?? 'pending',
                    'classId' => (string) $s['cs_id'],
                    'className' => $s['cs_name'],
                    'clinicHoursCompleted' => (int) $s['clinic_hours_completed'],
                    'enrolledSubjects' => [],
                    'remedialExams' => [],
                ];
            }
            $components = $s['grade_components_json']
                ? json_decode($s['grade_components_json'], true)
                : ['quizzes' => 0, 'exams' => 0, 'practicum' => 0, 'attendance' => 0];
            $grouped[$id]['enrolledSubjects'][] = [
                'code' => $s['course_code'],
                'name' => $s['course_name'],
                'units' => (float) $s['units'],
                'grade' => $s['final_gwa'] !== null ? (float) $s['final_gwa'] : 0,
                'isClinical' => (bool) $s['is_clinical'],
                'hasRemedial' => $s['retention_state'] === 'remedial',
                'components' => $components,
            ];
            if ($s['final_gwa'] !== null) {
                $grouped[$id]['overallGWA'] = (float) $s['final_gwa'];
            }
            if ($s['remedial_state_json']) {
                $grouped[$id]['remedialExams'][] = json_decode($s['remedial_state_json'], true);
            }
        }
        $mappedStudents = array_values($grouped);
        $graded = array_values(array_filter(array_column($mappedStudents, 'overallGWA'), static fn($value) => $value !== null));
        $atRisk = count(array_filter($mappedStudents, static fn(array $student): bool => in_array($student['status'], ['warning', 'critical', 'remedial'], true)));

        json_response([
            'status' => 'ok',
            'reports' => [
                'students' => $mappedStudents,
                'summary' => [
                    'totalStudents' => count($mappedStudents),
                    'averageGWA' => $graded ? round(array_sum($graded) / count($graded), 2) : null,
                    'atRiskCount' => $atRisk,
                    'retentionPassRate' => count($mappedStudents) > 0
                        ? round(((count($mappedStudents) - $atRisk) / count($mappedStudents)) * 100, 2)
                        : null,
                ],
            ],
        ], 200);
    } catch (\Throwable $e) {
        error_log('Faculty reports summary error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

function handle_faculty_classes_get(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = faculty_verify_auth($pdo, $config);

        $stmt = $pdo->prepare("
            SELECT 
                cs.cs_id,
                cs.cs_name,
                cs.course_id,
                cs.instructor_user_id,
                cs.secretary_user_id,
                cs.semester,
                cs.school_year,
                cs.year_level,
                cs.lab_room,
                cs.lec_room,
                cs.block,
                cs.status,
                cs.created_at,
                c.course_code,
                c.name AS course_name,
                c.units,
                u.display_name AS instructor_name,
                (SELECT COUNT(*) FROM enrollments e WHERE e.cs_id = cs.cs_id) AS enrolled_count
            FROM class_sections cs
            LEFT JOIN courses c ON cs.course_id = c.course_id
            LEFT JOIN user_accounts u ON cs.instructor_user_id = u.user_id
            WHERE cs.instructor_user_id = :faculty_id
            ORDER BY cs.created_at DESC
        ");
        $stmt->execute([':faculty_id' => $authCtx['user_id']]);
        $classes = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $mapped = array_map(function ($cls) {
            $schedule = array_filter([$cls['lec_room'] ?? '', $cls['lab_room'] ?? '']);
            $scheduleStr = implode(' / ', $schedule) ?: 'TBA';
            return [
                'id' => (string) $cls['cs_id'],
                'csId' => (int) $cls['cs_id'],
                'csName' => $cls['cs_name'],
                'courseId' => (int) $cls['course_id'],
                'courseCode' => $cls['course_code'] ?? 'DENT',
                'courseName' => $cls['course_name'] ?? $cls['cs_name'],
                'units' => (float) ($cls['units'] ?? 3.0),
                'schoolYear' => $cls['school_year'],
                'semester' => $cls['semester'],
                'yearLevel' => (int) ($cls['year_level'] ?? 1),
                'block' => $cls['block'] ?? 'A',
                'schedule' => $scheduleStr,
                'labRoom' => $cls['lab_room'] ?? '',
                'lecRoom' => $cls['lec_room'] ?? '',
                'enrolledCount' => (int) ($cls['enrolled_count'] ?? 0),
                'instructorName' => $cls['instructor_name'] ?? 'Faculty Instructor',
                'status' => $cls['status'] ?? 'Active',
            ];
        }, $classes);

        json_response([
            'status' => 'ok',
            'classes' => $mapped,
        ], 200);
    } catch (\Throwable $e) {
        error_log('Faculty classes get error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

function handle_faculty_courses_get(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = faculty_verify_auth($pdo, $config);

        $stmt = $pdo->query("SELECT course_id, course_code, name, units, year_level, semester, is_clinical FROM courses ORDER BY course_code ASC");
        $courses = $stmt ? $stmt->fetchAll(PDO::FETCH_ASSOC) : [];

        $mapped = array_map(function ($c) {
            return [
                'id' => (int) $c['course_id'],
                'courseCode' => $c['course_code'],
                'name' => $c['name'],
                'units' => (float) $c['units'],
                'yearLevel' => (int) ($c['year_level'] ?? 1),
                'semester' => $c['semester'] ?? '1ST',
                'isClinical' => (bool) ($c['is_clinical'] ?? false),
            ];
        }, $courses);

        json_response([
            'status' => 'ok',
            'courses' => $mapped,
        ], 200);
    } catch (\Throwable $e) {
        error_log('Faculty courses get error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

function handle_faculty_class_create(): void
{
    $context = [
        'request_id' => request_id(),
        'ip_address' => request_ip(),
        'user_agent' => request_user_agent(),
        'http_method' => request_method(),
        'endpoint' => request_path(),
    ];

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
        $csName = validate_required_string($data, 'csName', 2, 255);
        $courseId = (int) ($data['courseId'] ?? 0);
        $semester = validate_required_string($data, 'semester', 1, 20);
        $schoolYear = validate_required_string($data, 'schoolYear', 4, 20);
        $yearLevel = (int) ($data['yearLevel'] ?? 1);
        $block = validate_optional_string($data, 'block', 1, 50) ?? 'A';
        $labRoom = validate_optional_string($data, 'labRoom', 1, 100);
        $lecRoom = validate_optional_string($data, 'lecRoom', 1, 100);

        if ($courseId <= 0) {
            safe_error_response('Valid courseId is required.', 400);
            return;
        }

        $termCode = "{$schoolYear}-{$semester}";

        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare("
                INSERT INTO class_sections (
                    cs_name, course_id, instructor_user_id, semester, school_year, year_level, lab_room, lec_room, block, status, term_code, term_start_date, term_end_date, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active', ?, '2024-08-15', '2024-12-20', CURRENT_TIMESTAMP(6)) RETURNING cs_id
            ");
            $stmt->execute([
                $csName, $courseId, $authCtx['user_id'], $semester, $schoolYear, $yearLevel, $labRoom, $lecRoom, $block, $termCode
            ]);
            $newCsId = (int) $stmt->fetchColumn();

            $macKey = config_key_bytes_at_least($config['audit']['mac_key_b64'], 32, 'AUDIT_MAC_KEY');
            $auditCtx = audit_begin_operation($pdo);
            audit_finish_operation($pdo, $auditCtx, [
                'module_code' => 'class_management',
                'action_code' => 'class_create',
                'event_status' => 'Success',
                'actor_user_id' => $authCtx['user_id'],
                'actor_username' => $authCtx['login_email'],
                'actor_role' => $authCtx['role'],
                'actor_display_name' => $authCtx['display_name'],
                'session_id' => $authCtx['session_id'],
                'scope_cs_id' => $newCsId,
                'target_type' => 'class_section',
                'target_id' => (string) $newCsId,
                'description' => "Created class section '{$csName}' for term {$termCode}.",
                'reason' => null,
                'http_method' => $context['http_method'],
                'endpoint' => $context['endpoint'],
                'request_id' => $context['request_id'],
                'ip_address' => $context['ip_address'],
                'user_agent' => $context['user_agent'],
            ], $macKey);

            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) { $pdo->rollBack(); }
            throw $e;
        }

        json_response([
            'status' => 'ok',
            'message' => 'Class section created successfully.',
            'csId' => $newCsId,
        ], 201);
    } catch (ValidationException $e) {
        validation_error_response($e->getErrors());
    } catch (\Throwable $e) {
        error_log('Faculty class create error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

function handle_faculty_class_available_students(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = faculty_verify_auth($pdo, $config);

        $csId = (int) ($_GET['csId'] ?? 0);
        if ($csId <= 0) {
            safe_error_response('Parameter csId is required.', 400);
            return;
        }
        if (faculty_owned_class_id($pdo, (int) $authCtx['user_id'], (string) $csId) <= 0) {
            safe_error_response('Class is not assigned to this faculty member.', 403);
            return;
        }

        $stmt = $pdo->prepare("
            SELECT s.student_id, s.student_number, s.first_name, s.middle_name, s.last_name, s.bu_email, s.year_level, s.status
            FROM students s
            WHERE s.student_id NOT IN (SELECT e.student_id FROM enrollments e WHERE e.cs_id = ?)
            ORDER BY s.last_name ASC, s.first_name ASC
        ");
        $stmt->execute([$csId]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $mapped = array_map(function ($s) {
            $fullName = trim($s['first_name'] . ($s['middle_name'] ? ' ' . $s['middle_name'] : '') . ' ' . $s['last_name']);
            return [
                'id' => (string) $s['student_id'],
                'studentId' => $s['student_number'],
                'name' => $fullName,
                'email' => $s['bu_email'] ?? '',
                'yearLevel' => (int) ($s['year_level'] ?? 1),
                'status' => strtolower($s['status'] ?? 'active'),
            ];
        }, $rows);

        json_response([
            'status' => 'ok',
            'students' => $mapped,
        ], 200);
    } catch (\Throwable $e) {
        error_log('Faculty available students error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

function handle_faculty_class_enroll_students(): void
{
    $context = [
        'request_id' => request_id(),
        'ip_address' => request_ip(),
        'user_agent' => request_user_agent(),
        'http_method' => request_method(),
        'endpoint' => request_path(),
    ];

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
        $csId = (int) ($data['csId'] ?? 0);
        $studentIds = $data['studentIds'] ?? [];

        if ($csId <= 0 || !is_array($studentIds) || count($studentIds) === 0) {
            safe_error_response('csId and at least one studentId are required.', 400);
            return;
        }
        if (faculty_owned_class_id($pdo, (int) $authCtx['user_id'], (string) $csId) <= 0) {
            safe_error_response('Class is not assigned to this faculty member.', 403);
            return;
        }

        $pdo->beginTransaction();
        try {
            $insertStmt = $pdo->prepare("
                INSERT INTO enrollments (student_id, cs_id, status, date_enrolled, retention_state, created_at)
                VALUES (?, ?, 'Active', CURRENT_DATE, 'active', CURRENT_TIMESTAMP(6))
                ON CONFLICT (student_id, cs_id) DO NOTHING
            ");

            $enrolledCount = 0;
            foreach ($studentIds as $sId) {
                $stId = (int) $sId;
                if ($stId > 0) {
                    $insertStmt->execute([$stId, $csId]);
                    if ($insertStmt->rowCount() > 0) {
                        $enrolledCount++;
                    }
                }
            }

            $macKey = config_key_bytes_at_least($config['audit']['mac_key_b64'], 32, 'AUDIT_MAC_KEY');
            $auditCtx = audit_begin_operation($pdo);
            audit_finish_operation($pdo, $auditCtx, [
                'module_code' => 'class_management',
                'action_code' => 'student_enroll',
                'event_status' => 'Success',
                'actor_user_id' => $authCtx['user_id'],
                'actor_username' => $authCtx['login_email'],
                'actor_role' => $authCtx['role'],
                'actor_display_name' => $authCtx['display_name'],
                'session_id' => $authCtx['session_id'],
                'scope_cs_id' => $csId,
                'target_type' => 'class_section',
                'target_id' => (string) $csId,
                'description' => "Enrolled {$enrolledCount} student(s) into class section #{$csId}.",
                'reason' => null,
                'http_method' => $context['http_method'],
                'endpoint' => $context['endpoint'],
                'request_id' => $context['request_id'],
                'ip_address' => $context['ip_address'],
                'user_agent' => $context['user_agent'],
            ], $macKey);

            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) { $pdo->rollBack(); }
            throw $e;
        }

        json_response([
            'status' => 'ok',
            'message' => "Successfully enrolled {$enrolledCount} student(s).",
            'enrolledCount' => $enrolledCount,
        ], 200);
    } catch (\Throwable $e) {
        error_log('Faculty class enroll error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

function handle_faculty_class_unenroll_student(): void
{
    $context = [
        'request_id' => request_id(),
        'ip_address' => request_ip(),
        'user_agent' => request_user_agent(),
        'http_method' => request_method(),
        'endpoint' => request_path(),
    ];

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
        $csId = (int) ($data['csId'] ?? 0);
        $studentId = (int) ($data['studentId'] ?? 0);

        if ($csId <= 0 || $studentId <= 0) {
            safe_error_response('csId and studentId are required.', 400);
            return;
        }
        if (faculty_owned_class_id($pdo, (int) $authCtx['user_id'], (string) $csId) <= 0) {
            safe_error_response('Class is not assigned to this faculty member.', 403);
            return;
        }

        $pdo->beginTransaction();
        try {
            $delStmt = $pdo->prepare("DELETE FROM enrollments WHERE cs_id = ? AND student_id = ?");
            $delStmt->execute([$csId, $studentId]);
            if ($delStmt->rowCount() === 0) {
                $pdo->rollBack();
                safe_error_response('Student is not enrolled in this class.', 404);
                return;
            }

            $macKey = config_key_bytes_at_least($config['audit']['mac_key_b64'], 32, 'AUDIT_MAC_KEY');
            $auditCtx = audit_begin_operation($pdo);
            audit_finish_operation($pdo, $auditCtx, [
                'module_code' => 'class_management',
                'action_code' => 'student_unenroll',
                'event_status' => 'Success',
                'actor_user_id' => $authCtx['user_id'],
                'actor_username' => $authCtx['login_email'],
                'actor_role' => $authCtx['role'],
                'actor_display_name' => $authCtx['display_name'],
                'session_id' => $authCtx['session_id'],
                'scope_cs_id' => $csId,
                'target_type' => 'class_section',
                'target_id' => (string) $csId,
                'description' => "Removed student #{$studentId} from class section #{$csId}.",
                'reason' => null,
                'http_method' => $context['http_method'],
                'endpoint' => $context['endpoint'],
                'request_id' => $context['request_id'],
                'ip_address' => $context['ip_address'],
                'user_agent' => $context['user_agent'],
            ], $macKey);

            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) { $pdo->rollBack(); }
            throw $e;
        }

        json_response([
            'status' => 'ok',
            'message' => 'Student removed from class section successfully.',
        ], 200);
    } catch (\Throwable $e) {
        error_log('Faculty class unenroll error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}


