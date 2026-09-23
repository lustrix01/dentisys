<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/app/notifications.php';

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
        $authCtx = auth_verify_access_token($pdo, $config, $token, $jwtKey);
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
              AND LOWER(e.status) = 'active'
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
            LEFT JOIN enrollments e ON e.cs_id = cs.cs_id AND LOWER(e.status) = 'active'
            LEFT JOIN attendance_records ar ON ar.enrollment_id = e.enrollment_id
            WHERE cs.instructor_user_id = :faculty_id
              AND (LOWER(cs.status) = 'active' OR cs.status IS NULL)
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
                'yearLevel' => $row['year_level'] !== null ? (int) $row['year_level'] : null,
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
                : null,
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
               AND LOWER(e.status) = 'active'
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
        $yearLevel = array_key_exists('yearLevel', $data) && $data['yearLevel'] !== null && $data['yearLevel'] !== ''
            ? (int) $data['yearLevel']
            : null;
        $status = strtolower(trim((string) ($data['status'] ?? 'active')));
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
            try {
                $email = validate_institutional_email($email);
            } catch (ValidationException $e) {
                $errors['email'] = $e->getErrors()[0]['message'] ?? 'Email is not valid.';
            }
        }
        if ($yearLevel !== null && ($yearLevel < 1 || $yearLevel > 4)) {
            $errors['yearLevel'] = 'Year level must be between 1 and 4.';
        }
        if (!in_array(strtolower($status), ['active', 'disabled', 'archived'], true)) {
            $errors['status'] = 'Student status must be active, disabled, or archived.';
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

/**
 * Update a canonical Student profile only when the Faculty owns at least one
 * class-section enrollment for that Student. Student number and enrollment
 * membership are intentionally outside this profile contract.
 */
function handle_faculty_student_update(array $params = []): void
{
    $context = [
        'request_id' => request_id(),
        'ip_address' => request_ip(),
        'user_agent' => request_user_agent(),
        'http_method' => request_method(),
        'endpoint' => request_path(),
    ];
    $pdo = null;
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = faculty_verify_auth($pdo, $config);
        $body = request_body();
        if (!$body['has_body']) {
            safe_error_response('Request body required.', 400);
            return;
        }

        $rawId = $params['student_id'] ?? $body['data']['studentId'] ?? $body['data']['id'] ?? null;
        $studentId = is_int($rawId) ? $rawId : (is_string($rawId) && ctype_digit(trim($rawId)) ? (int) trim($rawId) : 0);
        if ($studentId <= 0) {
            throw new ValidationException([['field' => 'studentId', 'message' => 'A valid Student id is required.']]);
        }

        $data = $body['data'];
        $allowed = [
            'studentId', 'id', 'firstName', 'middleName', 'lastName', 'email',
            'contact', 'sex', 'yearLevel', 'status', 'admissionDate', 'birthdate',
        ];
        $errors = [];
        foreach (array_keys($data) as $field) {
            if (!in_array($field, $allowed, true)) {
                $errors[$field] = 'This field is not editable through the Student roster contract.';
            }
        }
        if (array_key_exists('studentNumber', $data)) {
            $errors['studentNumber'] = 'Student number is the canonical identity and cannot be edited here.';
        }
        if ($errors !== []) {
            throw new ValidationException($errors);
        }

        $pdo->beginTransaction();
        $select = $pdo->prepare(
            'SELECT s.student_id, s.student_number, s.first_name, s.middle_name, s.last_name,
                    s.bu_email, s.student_account_user_id, s.contact, s.sex, s.year_level, s.status,
                    s.admission_date, s.birthdate
               FROM students s
              WHERE s.student_id = ?
                AND EXISTS (
                    SELECT 1 FROM enrollments e
                    JOIN class_sections cs ON cs.cs_id = e.cs_id
                    WHERE e.student_id = s.student_id
                      AND cs.instructor_user_id = ?
                )
              FOR UPDATE'
        );
        $select->execute([$studentId, (int) $authCtx['user_id']]);
        $before = $select->fetch(PDO::FETCH_ASSOC);
        if (!is_array($before)) {
            $pdo->rollBack();
            safe_error_response('Student is not in a class assigned to this Faculty member.', 403);
            return;
        }

        $updates = [];
        $values = [];
        if (array_key_exists('firstName', $data)) {
            $updates[] = 'first_name = ?';
            $values[] = validate_person_name($data, 'firstName', 2, 100);
        }
        if (array_key_exists('middleName', $data)) {
            $updates[] = 'middle_name = ?';
            $values[] = validate_optional_person_name($data, 'middleName', 2, 100);
        }
        if (array_key_exists('lastName', $data)) {
            $updates[] = 'last_name = ?';
            $values[] = validate_person_name($data, 'lastName', 2, 100);
        }
        if (array_key_exists('email', $data)) {
            $email = trim((string) $data['email']);
            if ($before['student_account_user_id'] !== null
                && strtolower(trim((string) $before['bu_email'])) !== strtolower($email)) {
                throw new DomainException('Email for an activated Student is controlled by the canonical account identity.');
            }
            $updates[] = 'bu_email = ?';
            $values[] = $email === '' ? null : validate_institutional_email($email);
        }
        if (array_key_exists('contact', $data)) {
            $updates[] = 'contact = ?';
            $values[] = validate_optional_string($data, 'contact', 1, 50);
        }
        if (array_key_exists('sex', $data)) {
            $updates[] = 'sex = ?';
            $values[] = validate_optional_string($data, 'sex', 1, 1);
        }
        if (array_key_exists('yearLevel', $data)) {
            $yearLevel = $data['yearLevel'];
            if ($yearLevel === null || $yearLevel === '') {
                $updates[] = 'year_level = ?';
                $values[] = null;
            } else {
                $yearLevel = is_int($yearLevel) ? $yearLevel : (is_string($yearLevel) && ctype_digit(trim($yearLevel)) ? (int) trim($yearLevel) : 0);
                if ($yearLevel < 1 || $yearLevel > 4) {
                    throw new ValidationException([['field' => 'yearLevel', 'message' => 'Year level must be between 1 and 4.']]);
                }
                $updates[] = 'year_level = ?';
                $values[] = $yearLevel;
            }
        }
        if (array_key_exists('status', $data)) {
            $status = strtolower(trim((string) $data['status']));
            if (!in_array($status, ['active', 'disabled', 'archived'], true)) {
                throw new ValidationException([['field' => 'status', 'message' => 'Student status must be active, disabled, or archived.']]);
            }
            $updates[] = 'status = ?';
            $values[] = $status;
        }
        foreach (['admissionDate' => 'admission_date', 'birthdate' => 'birthdate'] as $input => $column) {
            if (array_key_exists($input, $data)) {
                $value = $data[$input];
                if ($value !== null && $value !== '' && (!is_string($value) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $value))) {
                    throw new ValidationException([['field' => $input, 'message' => 'Date must use YYYY-MM-DD format.']]);
                }
                $updates[] = $column . ' = ?';
                $values[] = ($value === '' ? null : $value);
            }
        }
        if ($updates === []) {
            throw new ValidationException([['field' => 'fields', 'message' => 'At least one editable Student field is required.']]);
        }

        $values[] = $studentId;
        $pdo->prepare('UPDATE students SET ' . implode(', ', $updates) . ', updated_at = CURRENT_TIMESTAMP(6) WHERE student_id = ?')
            ->execute($values);
        $select->execute([$studentId, (int) $authCtx['user_id']]);
        $after = $select->fetch(PDO::FETCH_ASSOC);
        if (!is_array($after)) {
            throw new RuntimeException('Updated Student could not be reloaded.');
        }

        $macKey = config_key_bytes_at_least($config['audit']['mac_key_b64'], 32, 'AUDIT_MAC_KEY');
        $auditCtx = audit_begin_operation($pdo);
        audit_finish_operation($pdo, $auditCtx, [
            'module_code' => 'class_management',
            'action_code' => 'student_update',
            'event_status' => 'Success',
            'actor_user_id' => $authCtx['user_id'],
            'actor_username' => $authCtx['login_email'],
            'actor_role' => $authCtx['role'],
            'actor_display_name' => $authCtx['display_name'],
            'session_id' => $authCtx['session_id'],
            'target_type' => 'student',
            'target_id' => (string) $studentId,
            'description' => 'Updated Student roster profile fields.',
            'reason' => null,
            'http_method' => $context['http_method'],
            'endpoint' => $context['endpoint'],
            'request_id' => $context['request_id'],
            'ip_address' => $context['ip_address'],
            'user_agent' => $context['user_agent'],
        ], $macKey, $before, $after);
        $pdo->commit();

        json_response([
            'status' => 'ok',
            'student' => [
                'id' => (string) $after['student_id'],
                'studentId' => (string) $after['student_number'],
                'firstName' => $after['first_name'],
                'middleName' => $after['middle_name'],
                'lastName' => $after['last_name'],
                'name' => trim(implode(' ', array_filter([$after['first_name'], $after['middle_name'], $after['last_name']], static fn(mixed $part): bool => $part !== null && trim((string) $part) !== ''))),
                'email' => $after['bu_email'],
                'contact' => $after['contact'],
                'sex' => $after['sex'],
                'yearLevel' => $after['year_level'] !== null ? (int) $after['year_level'] : null,
                'status' => $after['status'],
                'admissionDate' => $after['admission_date'],
                'birthdate' => $after['birthdate'],
            ],
        ], 200);
    } catch (ValidationException $e) {
        if ($pdo instanceof PDO && $pdo->inTransaction()) { $pdo->rollBack(); }
        validation_error_response($e->getErrors());
    } catch (DomainException $e) {
        if ($pdo instanceof PDO && $pdo->inTransaction()) { $pdo->rollBack(); }
        safe_error_response($e->getMessage(), 409);
    } catch (Throwable $e) {
        if ($pdo instanceof PDO && $pdo->inTransaction()) { $pdo->rollBack(); }
        error_log('Faculty student update error: ' . sanitize_for_log($e));
        safe_error_response('Failed to update Student.', 500);
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

final class FacultyGradingConfigurationException extends RuntimeException
{
    public function __construct(
        string $message,
        public readonly int $statusCode = 422,
        public readonly string $errorCode = 'GRADING_CONFIGURATION_INVALID',
        public readonly array $details = []
    ) {
        parent::__construct($message, $statusCode);
    }
}

function faculty_grading_configuration_error(FacultyGradingConfigurationException $e): void
{
    $payload = [
        'status' => 'error',
        'code' => $e->errorCode,
        'message' => $e->getMessage(),
        'requestId' => function_exists('request_id') ? request_id() : null,
    ];
    foreach ($e->details as $key => $value) {
        $payload[$key] = $value;
    }
    emit_response(build_json_response($payload, $e->statusCode));
}

function faculty_grading_required_text(mixed $value, string $field, int $maxLength): string
{
    if (!is_scalar($value)) {
        throw new FacultyGradingConfigurationException("{$field} is required.");
    }
    $text = trim((string) $value);
    if ($text === '' || strlen($text) > $maxLength) {
        throw new FacultyGradingConfigurationException("{$field} is required and must be at most {$maxLength} characters.");
    }
    return $text;
}

function faculty_grading_normalize_semester(mixed $value): string
{
    return strtoupper(faculty_grading_required_text($value, 'semester', 50));
}

function faculty_grading_normalize_school_year(mixed $value): string
{
    return strtoupper(faculty_grading_required_text($value, 'schoolYear', 20));
}

function faculty_grading_positive_id(mixed $value, string $field): int
{
    if (is_int($value) && $value > 0) {
        return $value;
    }
    if (is_string($value) && ctype_digit($value) && (int) $value > 0) {
        return (int) $value;
    }
    if (is_float($value) && is_finite($value) && $value > 0 && floor($value) === $value) {
        return (int) $value;
    }
    throw new FacultyGradingConfigurationException("{$field} must be a positive integer.");
}

function faculty_grading_version(mixed $value): int
{
    if (is_int($value) && $value >= 0) {
        return $value;
    }
    if (is_string($value) && ctype_digit($value)) {
        return (int) $value;
    }
    if (is_float($value) && is_finite($value) && $value >= 0 && floor($value) === $value) {
        return (int) $value;
    }
    throw new FacultyGradingConfigurationException('version must be a nonnegative integer.');
}

function faculty_grading_weight_basis_points(mixed $value): ?int
{
    if (is_int($value)) {
        return $value > 0 && $value <= 100 ? $value * 10000 : null;
    }
    if (is_float($value) && is_finite($value)) {
        $value = rtrim(rtrim(number_format($value, 4, '.', ''), '0'), '.');
    }
    if (!is_string($value)) {
        return null;
    }
    $text = trim($value);
    if (!preg_match('/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,4})?$/', $text)) {
        return null;
    }
    [$whole, $fraction] = array_pad(explode('.', $text, 2), 2, '');
    $basisPoints = ((int) $whole * 10000) + (int) str_pad($fraction, 4, '0');
    return $basisPoints > 0 && $basisPoints <= 1000000 ? $basisPoints : null;
}

function faculty_grading_category_id(mixed $value): ?int
{
    if ($value === null || $value === '') {
        return null;
    }
    if (is_int($value) && $value > 0) {
        return $value;
    }
    if (is_string($value) && ctype_digit($value) && (int) $value > 0) {
        return (int) $value;
    }
    return null;
}

function faculty_grading_category_name_key(mixed $value): string
{
    $name = trim((string) $value);
    return function_exists('mb_strtolower') ? mb_strtolower($name, 'UTF-8') : strtolower($name);
}

function faculty_grading_source_kind(mixed $value, mixed $categoryName = null): string
{
    if ($value === null || $value === '') {
        return faculty_grading_category_name_key($categoryName) === 'attendance'
            ? 'attendance'
            : 'assessment';
    }
    if (!is_scalar($value) || !in_array((string) $value, ['attendance', 'assessment'], true)) {
        throw new FacultyGradingConfigurationException(
            'Category sourceKind must be attendance or assessment.',
            422,
            'GRADING_CATEGORY_SOURCE_KIND_INVALID'
        );
    }
    return (string) $value;
}

function faculty_grading_normalize_categories(mixed $value): array
{
    if (!is_array($value) || $value === []) {
        throw new FacultyGradingConfigurationException('At least one grading category is required.');
    }

    $categories = [];
    $ids = [];
    $names = [];
    $sortOrders = [];
    $totalBasisPoints = 0;

    foreach (array_values($value) as $index => $rawCategory) {
        if ($rawCategory instanceof \stdClass) {
            $rawCategory = get_object_vars($rawCategory);
        }
        if (!is_array($rawCategory)) {
            throw new FacultyGradingConfigurationException('Each grading category must be an object.');
        }

        $categoryId = faculty_grading_category_id($rawCategory['id'] ?? null);
        if ($categoryId !== null) {
            if (isset($ids[$categoryId])) {
                throw new FacultyGradingConfigurationException('Category identifiers must be unique.');
            }
            $ids[$categoryId] = true;
        }

        $name = faculty_grading_required_text($rawCategory['name'] ?? '', 'Category name', 255);
        $nameKey = faculty_grading_category_name_key($name);
        if (isset($names[$nameKey])) {
            throw new FacultyGradingConfigurationException('Category names must be unique.');
        }
        $names[$nameKey] = true;

        $weightBasisPoints = faculty_grading_weight_basis_points($rawCategory['weight'] ?? null);
        if ($weightBasisPoints === null) {
            throw new FacultyGradingConfigurationException('Category weights must be positive numbers between 0 and 100.');
        }
        $totalBasisPoints += $weightBasisPoints;

        $sortOrder = $rawCategory['sortOrder'] ?? ($index + 1);
        if (is_string($sortOrder) && ctype_digit($sortOrder)) {
            $sortOrder = (int) $sortOrder;
        }
        if (!is_int($sortOrder) || $sortOrder <= 0 || isset($sortOrders[$sortOrder])) {
            throw new FacultyGradingConfigurationException('Category sortOrder values must be unique positive integers.');
        }
        $sortOrders[$sortOrder] = true;

        $categories[] = [
            'id' => $categoryId,
            'name' => $name,
            'weight' => number_format($weightBasisPoints / 10000, 4, '.', ''),
            'weightBasisPoints' => $weightBasisPoints,
            'sortOrder' => $sortOrder,
            'sourceKind' => faculty_grading_source_kind($rawCategory['sourceKind'] ?? null, $name),
        ];
    }

    if ($totalBasisPoints !== 1000000) {
        throw new FacultyGradingConfigurationException('Category weights must total exactly 100%.');
    }

    return $categories;
}

function faculty_grading_default_period_template(): array
{
    return [
        'schemaMode' => 'periods',
        'termRatio' => [
            'midterm' => 40,
            'final' => 60,
        ],
        'midtermCategories' => [
            ['name' => 'Quiz', 'weight' => 25, 'sortOrder' => 1, 'sourceKind' => 'assessment'],
            ['name' => 'Activity', 'weight' => 25, 'sortOrder' => 2, 'sourceKind' => 'assessment'],
            ['name' => 'Midterm Exam', 'weight' => 40, 'sortOrder' => 3, 'sourceKind' => 'assessment'],
            ['name' => 'Attendance', 'weight' => 10, 'sortOrder' => 4, 'sourceKind' => 'attendance'],
        ],
        'finalCategories' => [
            ['name' => 'Quiz', 'weight' => 20, 'sortOrder' => 1, 'sourceKind' => 'assessment'],
            ['name' => 'Activity', 'weight' => 20, 'sortOrder' => 2, 'sourceKind' => 'assessment'],
            ['name' => 'Laboratory', 'weight' => 20, 'sortOrder' => 3, 'sourceKind' => 'assessment'],
            ['name' => 'Final Exam', 'weight' => 30, 'sortOrder' => 4, 'sourceKind' => 'assessment'],
            ['name' => 'Attendance', 'weight' => 10, 'sortOrder' => 5, 'sourceKind' => 'attendance'],
        ],
        'attendanceDateRanges' => [
            'midterm' => ['startDate' => null, 'endDate' => null],
            'final' => ['startDate' => null, 'endDate' => null],
        ],
    ];
}

function faculty_grading_normalize_term_ratio(mixed $value): array
{
    if ($value instanceof \stdClass) {
        $value = get_object_vars($value);
    }
    if (!is_array($value)) {
        throw new FacultyGradingConfigurationException('termRatio with midterm and final values is required.');
    }
    $midtermBasisPoints = faculty_grading_percentage_basis_points($value['midterm'] ?? null);
    $finalBasisPoints = faculty_grading_percentage_basis_points($value['final'] ?? null);
    if ($midtermBasisPoints === null || $finalBasisPoints === null || $midtermBasisPoints + $finalBasisPoints !== 1000000) {
        throw new FacultyGradingConfigurationException('Term contribution weights must be between 0 and 100 and total exactly 100%.');
    }
    return [
        'midterm' => number_format($midtermBasisPoints / 10000, 4, '.', ''),
        'final' => number_format($finalBasisPoints / 10000, 4, '.', ''),
        'midtermBasisPoints' => $midtermBasisPoints,
        'finalBasisPoints' => $finalBasisPoints,
    ];
}

function faculty_grading_percentage_basis_points(mixed $value): ?int
{
    if ($value === null || $value === '') {
        return null;
    }
    if (!is_int($value) && !is_float($value) && !is_string($value)) {
        return null;
    }
    $text = is_int($value) || is_float($value) ? (string) $value : trim((string) $value);
    if (!preg_match('/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,4})?$/', $text)) {
        return null;
    }
    [$whole, $fraction] = array_pad(explode('.', $text, 2), 2, '');
    $basisPoints = ((int) $whole * 10000) + (int) str_pad($fraction, 4, '0');
    return $basisPoints >= 0 && $basisPoints <= 1000000 ? $basisPoints : null;
}

function faculty_grading_normalize_period_categories(mixed $value, string $period): array
{
    $categories = faculty_grading_normalize_categories($value);
    foreach ($categories as &$category) {
        $category['gradingPeriod'] = $period;
    }
    unset($category);
    return $categories;
}

function faculty_grading_date_value(mixed $value, string $field): ?string
{
    if ($value === null || $value === '') {
        return null;
    }
    if (!is_string($value) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) {
        throw new FacultyGradingConfigurationException(
            "{$field} must be a calendar date in YYYY-MM-DD format.",
            422,
            'GRADING_PERIOD_DATE_RANGE_INVALID'
        );
    }
    $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value);
    $errors = DateTimeImmutable::getLastErrors();
    if (!$date || ($errors !== false && ($errors['warning_count'] > 0 || $errors['error_count'] > 0)) || $date->format('Y-m-d') !== $value) {
        throw new FacultyGradingConfigurationException(
            "{$field} must be a valid calendar date.",
            422,
            'GRADING_PERIOD_DATE_RANGE_INVALID'
        );
    }
    return $value;
}

function faculty_grading_date_range_input(mixed $value, array $existing, string $period): array
{
    if ($value === null) {
        return ['startDate' => null, 'endDate' => null];
    }
    if ($value instanceof \stdClass) {
        $value = get_object_vars($value);
    }
    if (!is_array($value)) {
        throw new FacultyGradingConfigurationException(
            "{$period} attendance date range must be an object.",
            422,
            'GRADING_PERIOD_DATE_RANGE_INVALID'
        );
    }
    $startValue = array_key_exists('startDate', $value) ? $value['startDate'] : $existing['startDate'];
    $endValue = array_key_exists('endDate', $value) ? $value['endDate'] : $existing['endDate'];
    $start = faculty_grading_date_value($startValue, "{$period}.startDate");
    $end = faculty_grading_date_value($endValue, "{$period}.endDate");
    if ($start !== null && $end !== null && $start > $end) {
        throw new FacultyGradingConfigurationException(
            "{$period} attendance startDate must be on or before endDate.",
            422,
            'GRADING_PERIOD_DATE_RANGE_INVALID'
        );
    }
    return ['startDate' => $start, 'endDate' => $end];
}

function faculty_grading_date_ranges_from_row(array $row): array
{
    return [
        'midterm' => [
            'startDate' => $row['midterm_start_date'] ?? null,
            'endDate' => $row['midterm_end_date'] ?? null,
        ],
        'final' => [
            'startDate' => $row['final_start_date'] ?? null,
            'endDate' => $row['final_end_date'] ?? null,
        ],
    ];
}

function faculty_grading_normalize_date_ranges(mixed $value, array $existing): array
{
    if ($value === null) {
        return [
            'midterm' => ['startDate' => null, 'endDate' => null],
            'final' => ['startDate' => null, 'endDate' => null],
        ];
    }
    if ($value instanceof \stdClass) {
        $value = get_object_vars($value);
    }
    if (!is_array($value)) {
        throw new FacultyGradingConfigurationException(
            'attendanceDateRanges must contain midterm and final objects.',
            422,
            'GRADING_PERIOD_DATE_RANGE_INVALID'
        );
    }
    $ranges = [];
    foreach (['midterm', 'final'] as $period) {
        $ranges[$period] = array_key_exists($period, $value)
            ? faculty_grading_date_range_input($value[$period], $existing[$period] ?? ['startDate' => null, 'endDate' => null], ucfirst($period))
            : ($existing[$period] ?? ['startDate' => null, 'endDate' => null]);
    }
    $midtermEnd = $ranges['midterm']['endDate'];
    $finalStart = $ranges['final']['startDate'];
    if ($midtermEnd !== null && $finalStart !== null && $midtermEnd >= $finalStart) {
        throw new FacultyGradingConfigurationException(
            'Midterm attendance must end before Finals attendance starts.',
            422,
            'GRADING_PERIOD_DATE_RANGE_INVALID'
        );
    }
    return $ranges;
}

function faculty_grading_require_offering(PDO $pdo, int $facultyId, mixed $courseValue, mixed $semesterValue, mixed $schoolYearValue): array
{
    $courseId = faculty_grading_positive_id($courseValue, 'courseId');
    $semester = faculty_grading_normalize_semester($semesterValue);
    $schoolYear = faculty_grading_normalize_school_year($schoolYearValue);
    $stmt = $pdo->prepare(
        "SELECT c.course_id, c.course_code, c.name AS course_name
           FROM class_sections cs
           JOIN courses c ON c.course_id = cs.course_id
          WHERE cs.instructor_user_id = ?
            AND cs.course_id = ?
            AND UPPER(cs.semester) = ?
            AND UPPER(cs.school_year) = ?
            AND cs.status = 'Active'
          ORDER BY cs.cs_id
          LIMIT 1"
    );
    $stmt->execute([$facultyId, $courseId, $semester, $schoolYear]);
    $course = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$course) {
        throw new FacultyGradingConfigurationException(
            'Faculty is not assigned to the requested course, semester, and school year.',
            403,
            'FACULTY_COURSE_ACCESS_DENIED'
        );
    }

    return [
        'facultyUserId' => $facultyId,
        'courseId' => (int) $course['course_id'],
        'courseCode' => $course['course_code'],
        'courseName' => $course['course_name'],
        'semester' => $semester,
        'schoolYear' => $schoolYear,
    ];
}

function faculty_grading_find_config(PDO $pdo, array $offering, bool $forUpdate = false): ?array
{
    $sql = "SELECT config_id, faculty_user_id, course_id, semester, school_year, version,
                   schema_mode, term_midterm_weight, term_final_weight,
                   midterm_start_date, midterm_end_date, final_start_date, final_end_date,
                   created_at, updated_at, updated_by_user_id
              FROM grading_configs
             WHERE faculty_user_id = ? AND course_id = ? AND semester = ? AND school_year = ?";
    if ($forUpdate) {
        $sql .= ' FOR UPDATE';
    }
    $stmt = $pdo->prepare($sql);
    $stmt->execute([
        $offering['facultyUserId'],
        $offering['courseId'],
        $offering['semester'],
        $offering['schoolYear'],
    ]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function faculty_grading_offering_for_class(PDO $pdo, int $facultyId, int $csId): array
{
    $stmt = $pdo->prepare(
        'SELECT course_id, semester, school_year
           FROM class_sections
          WHERE cs_id = ? AND instructor_user_id = ?'
    );
    $stmt->execute([$csId, $facultyId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        throw new FacultyGradingConfigurationException(
            'Class is not assigned to this faculty member.',
            403,
            'FACULTY_SECTION_ACCESS_DENIED'
        );
    }
    return faculty_grading_require_offering(
        $pdo,
        $facultyId,
        $row['course_id'],
        $row['semester'],
        $row['school_year'],
    );
}

function faculty_grading_snapshot(PDO $pdo, array $offering, array $configRow): array
{
    $schemaMode = (string) ($configRow['schema_mode'] ?? 'overall');
    if ($schemaMode === 'periods') {
        $stmt = $pdo->prepare(
            "SELECT gcp.category_id, gcp.name, gcp.weight, gcp.sort_order, gcp.grading_period,
                    gcp.source_kind,
                    EXISTS (
                        SELECT 1
                          FROM assessments a
                          JOIN class_sections cs ON cs.cs_id = a.cs_id
                         WHERE a.grading_category_id = gcp.category_id
                           AND a.grading_period = gcp.grading_period
                           AND cs.instructor_user_id = ?
                           AND cs.course_id = ?
                           AND UPPER(cs.semester) = ?
                           AND UPPER(cs.school_year) = ?
                    ) AS in_use
               FROM grading_category_periods gcp
              WHERE gcp.config_id = ?
              ORDER BY gcp.grading_period, gcp.sort_order, gcp.category_period_id"
        );
        $stmt->execute([
            $offering['facultyUserId'],
            $offering['courseId'],
            $offering['semester'],
            $offering['schoolYear'],
            (int) $configRow['config_id'],
        ]);
    } else {
        $stmt = $pdo->prepare(
            "SELECT gc.category_id, gc.name, gc.weight, gc.sort_order, gc.grading_period,
                    NULL AS source_kind,
                    EXISTS (
                        SELECT 1
                          FROM assessments a
                          JOIN class_sections cs ON cs.cs_id = a.cs_id
                         WHERE a.grading_category_id = gc.category_id
                           AND cs.instructor_user_id = ?
                           AND cs.course_id = ?
                           AND UPPER(cs.semester) = ?
                           AND UPPER(cs.school_year) = ?
                    ) AS in_use
               FROM grading_categories gc
              WHERE gc.config_id = ?
              ORDER BY gc.sort_order, gc.category_id"
        );
        $stmt->execute([
            $offering['facultyUserId'],
            $offering['courseId'],
            $offering['semester'],
            $offering['schoolYear'],
            (int) $configRow['config_id'],
        ]);
    }
    $categories = array_map(static fn(array $row): array => [
        'id' => (int) $row['category_id'],
        'name' => $row['name'],
        'weight' => (float) $row['weight'],
        'sortOrder' => (int) $row['sort_order'],
        'gradingPeriod' => $row['grading_period'] !== null ? (string) $row['grading_period'] : null,
        'sourceKind' => $row['source_kind'] !== null ? (string) $row['source_kind'] : null,
        'inUse' => filter_var($row['in_use'], FILTER_VALIDATE_BOOLEAN),
    ], $stmt->fetchAll(PDO::FETCH_ASSOC));

    $snapshot = [
        'id' => (string) $configRow['config_id'],
        'course' => [
            'id' => (int) $offering['courseId'],
            'code' => $offering['courseCode'],
            'name' => $offering['courseName'],
        ],
        'semester' => $offering['semester'],
        'schoolYear' => $offering['schoolYear'],
        'version' => (int) $configRow['version'],
        'categories' => $categories,
        'schemaMode' => $schemaMode,
    ];

    if ($schemaMode === 'periods') {
        $snapshot['termRatio'] = [
            'midterm' => (float) $configRow['term_midterm_weight'],
            'final' => (float) $configRow['term_final_weight'],
        ];
        $snapshot['attendanceDateRanges'] = faculty_grading_date_ranges_from_row($configRow);
        $snapshot['midtermCategories'] = array_values(array_filter(
            $categories,
            static fn(array $category): bool => $category['gradingPeriod'] === null || $category['gradingPeriod'] === 'Midterm'
        ));
        $snapshot['finalCategories'] = array_values(array_filter(
            $categories,
            static fn(array $category): bool => $category['gradingPeriod'] === null || $category['gradingPeriod'] === 'Final'
        ));
    }

    return $snapshot;
}

function faculty_grading_legacy_assessment_mappings(PDO $pdo, array $offering, array $categories): array
{
    $categoryIndexesByName = [];
    foreach ($categories as $index => $category) {
        $period = $category['gradingPeriod'] ?? null;
        $key = ($period === null ? '*' : $period) . ':' . faculty_grading_category_name_key($category['name']);
        $categoryIndexesByName[$key] = $index;
    }

    // Lock the offering sections before inspecting assessments. New assessment
    // inserts reference these rows and therefore cannot race the first-save
    // transition into an uncategorized authoritative state.
    $sectionLock = $pdo->prepare(
        "SELECT cs_id
           FROM class_sections
          WHERE instructor_user_id = ?
            AND course_id = ?
            AND UPPER(semester) = ?
            AND UPPER(school_year) = ?
            AND status = 'Active'
          ORDER BY cs_id
          FOR UPDATE"
    );
    $sectionLock->execute([
        $offering['facultyUserId'],
        $offering['courseId'],
        $offering['semester'],
        $offering['schoolYear'],
    ]);

    $assessmentStmt = $pdo->prepare(
        "SELECT a.assessment_id, a.title, a.type, a.grading_period
           FROM assessments a
           JOIN class_sections cs ON cs.cs_id = a.cs_id
          WHERE cs.instructor_user_id = ?
            AND cs.course_id = ?
            AND UPPER(cs.semester) = ?
            AND UPPER(cs.school_year) = ?
            AND cs.status = 'Active'
            AND a.status = 'Active'
            AND a.grading_category_id IS NULL
          ORDER BY a.assessment_id
          FOR UPDATE OF a"
    );
    $assessmentStmt->execute([
        $offering['facultyUserId'],
        $offering['courseId'],
        $offering['semester'],
        $offering['schoolYear'],
    ]);

    $mappings = [];
    $unmatched = [];
    foreach ($assessmentStmt->fetchAll(PDO::FETCH_ASSOC) as $assessment) {
        $legacyType = (string) ($assessment['type'] ?? '');
        $legacyPeriod = (string) ($assessment['grading_period'] ?? '');
        $categoryIndex = $categoryIndexesByName[$legacyPeriod . ':' . faculty_grading_category_name_key($legacyType)]
            ?? $categoryIndexesByName['*:' . faculty_grading_category_name_key($legacyType)]
            ?? null;
        if ($categoryIndex === null) {
            $unmatched[] = [
                'assessmentId' => (int) $assessment['assessment_id'],
                'title' => (string) $assessment['title'],
                'legacyType' => $assessment['type'],
            ];
            continue;
        }
        if (($categories[$categoryIndex]['sourceKind'] ?? 'assessment') === 'attendance') {
            throw new FacultyGradingConfigurationException(
                'An existing assessment cannot be assigned to the authoritative Attendance category.',
                422,
                'GRADING_ATTENDANCE_CATEGORY_ASSESSMENT_INVALID',
                ['assessmentId' => (int) $assessment['assessment_id']]
            );
        }
        $mappings[] = [
            'assessmentId' => (int) $assessment['assessment_id'],
            'categoryIndex' => $categoryIndex,
        ];
    }

    if ($unmatched !== []) {
        throw new FacultyGradingConfigurationException(
            'Existing assessments require matching grading categories before this configuration can be activated.',
            422,
            'GRADING_CATEGORY_ASSIGNMENT_REQUIRED',
            ['assessments' => $unmatched]
        );
    }

    return $mappings;
}

function faculty_grading_apply_legacy_assessment_mappings(PDO $pdo, array $mappings, array $categoryIds): void
{
    if ($mappings === []) {
        return;
    }

    $update = $pdo->prepare(
        'UPDATE assessments
            SET grading_category_id = ?
          WHERE assessment_id = ?
            AND grading_category_id IS NULL'
    );
    foreach ($mappings as $mapping) {
        $categoryId = $categoryIds[$mapping['categoryIndex']] ?? null;
        if ($categoryId === null) {
            throw new FacultyGradingConfigurationException(
                'Existing assessments could not be linked to the new grading categories.'
            );
        }
        $update->execute([$categoryId, $mapping['assessmentId']]);
        if ($update->rowCount() !== 1) {
            throw new FacultyGradingConfigurationException(
                'Existing assessments changed while the grading configuration was being created.'
            );
        }
    }
}

function faculty_grading_audit_state(array $snapshot): array
{
    $auditState = $snapshot;
    $auditState['categories'] = array_map(static function (array $category): array {
        $category['weight'] = number_format((float) $category['weight'], 4, '.', '');
        return $category;
    }, $snapshot['categories'] ?? []);
    if (isset($auditState['termRatio']) && is_array($auditState['termRatio'])) {
        foreach ($auditState['termRatio'] as $key => $value) {
            $auditState['termRatio'][$key] = number_format((float) $value, 4, '.', '');
        }
    }
    foreach (['midtermCategories', 'finalCategories'] as $periodKey) {
        if (isset($auditState[$periodKey]) && is_array($auditState[$periodKey])) {
            $auditState[$periodKey] = array_map(static function (array $category): array {
                if (isset($category['weight'])) {
                    $category['weight'] = number_format((float) $category['weight'], 4, '.', '');
                }
                return $category;
            }, $auditState[$periodKey]);
        }
    }
    return $auditState;
}

function handle_faculty_grading_config_get(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = faculty_verify_auth($pdo, $config);
        $offering = faculty_grading_require_offering(
            $pdo,
            (int) $authCtx['user_id'],
            $_GET['courseId'] ?? null,
            $_GET['semester'] ?? null,
            $_GET['schoolYear'] ?? null,
        );
        $configRow = faculty_grading_find_config($pdo, $offering);
        $response = [
            'status' => 'ok',
            'configuration' => $configRow ? faculty_grading_snapshot($pdo, $offering, $configRow) : null,
        ];
        if ($configRow === null) {
            $response['defaults'] = faculty_grading_default_period_template();
        }
        json_response($response, 200);
    } catch (FacultyGradingConfigurationException $e) {
        faculty_grading_configuration_error($e);
    } catch (\Throwable $e) {
        error_log('Faculty grading configuration get error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

function handle_faculty_grading_config_save(): void
{
    $context = [
        'request_id' => request_id(),
        'ip_address' => request_ip(),
        'user_agent' => request_user_agent(),
        'http_method' => request_method(),
        'endpoint' => request_path(),
    ];
    $pdo = null;

    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = faculty_verify_auth($pdo, $config);
        $body = request_body();
        if (!$body['has_body']) {
            throw new FacultyGradingConfigurationException('Request body required.', 400, 'BAD_REQUEST');
        }
        $data = $body['data'];
        $offering = faculty_grading_require_offering(
            $pdo,
            (int) $authCtx['user_id'],
            $data['courseId'] ?? null,
            $data['semester'] ?? null,
            $data['schoolYear'] ?? null,
        );
        $hasPeriodPayload = array_key_exists('midtermCategories', $data) || array_key_exists('finalCategories', $data);
        $schemaMode = (string) ($data['schemaMode'] ?? ($hasPeriodPayload ? 'periods' : 'overall'));
        if (!in_array($schemaMode, ['overall', 'periods'], true)) {
            throw new FacultyGradingConfigurationException('schemaMode must be overall or periods.');
        }
        $termRatio = null;
        if ($schemaMode === 'periods') {
            $termRatio = faculty_grading_normalize_term_ratio($data['termRatio'] ?? null);
            $midtermCategories = faculty_grading_normalize_period_categories($data['midtermCategories'] ?? null, 'Midterm');
            $finalCategories = faculty_grading_normalize_period_categories($data['finalCategories'] ?? null, 'Final');
            $categories = array_merge($midtermCategories, $finalCategories);
        } else {
            $categories = faculty_grading_normalize_categories($data['categories'] ?? null);
            foreach ($categories as &$category) {
                $category['gradingPeriod'] = null;
                $category['sourceKind'] = 'assessment';
            }
            unset($category);
        }
        $requestedVersion = null;
        if (array_key_exists('version', $data) && $data['version'] !== null && $data['version'] !== '') {
            $requestedVersion = faculty_grading_version($data['version']);
        }

        $dateRangesSupplied = array_key_exists('attendanceDateRanges', $data);
        $dateRanges = null;

        $pdo->beginTransaction();
        $existing = faculty_grading_find_config($pdo, $offering, true);
        $beforeState = null;
        $isCreate = $existing === null;
        if ($existing !== null) {
            if ($requestedVersion === null || $requestedVersion !== (int) $existing['version']) {
                throw new FacultyGradingConfigurationException(
                    'The grading configuration is stale. Reload it before saving.',
                    409,
                    'GRADING_CONFIGURATION_VERSION_CONFLICT'
                );
            }
            $existingSchemaMode = (string) ($existing['schema_mode'] ?? 'overall');
            if ($existingSchemaMode !== $schemaMode) {
                if ($existingSchemaMode === 'overall' && $schemaMode === 'periods') {
                    if (($data['convertFromOverall'] ?? false) !== true) {
                        throw new FacultyGradingConfigurationException(
                            'Converting an overall configuration to period categories requires explicit confirmation.',
                            409,
                            'GRADING_PERIOD_CONVERSION_REQUIRED'
                        );
                    }
                } else {
                    throw new FacultyGradingConfigurationException(
                        'An existing period configuration cannot be changed back to overall categories.',
                        409,
                        'GRADING_SCHEMA_MODE_CONFLICT'
                    );
                }
            }
            $beforeState = faculty_grading_snapshot($pdo, $offering, $existing);
        } elseif ($requestedVersion !== null && $requestedVersion !== 0) {
            throw new FacultyGradingConfigurationException(
                'The grading configuration was created concurrently. Reload it before saving.',
                409,
                'GRADING_CONFIGURATION_VERSION_CONFLICT'
            );
        }

        if ($schemaMode === 'periods') {
            $existingDateRanges = $existing !== null
                ? faculty_grading_date_ranges_from_row($existing)
                : [
                    'midterm' => ['startDate' => null, 'endDate' => null],
                    'final' => ['startDate' => null, 'endDate' => null],
                ];
            if ($dateRangesSupplied) {
                $dateRanges = faculty_grading_normalize_date_ranges(
                    $data['attendanceDateRanges'],
                    $existingDateRanges
                );
            } else {
                $dateRanges = $existingDateRanges;
            }
        }

        $legacyAssessmentMappings = $existing === null
            ? faculty_grading_legacy_assessment_mappings($pdo, $offering, $categories)
            : [];

        if ($existing === null) {
            $insertConfig = $pdo->prepare(
                "INSERT INTO grading_configs
                    (faculty_user_id, course_id, semester, school_year, version,
                     schema_mode, term_midterm_weight, term_final_weight,
                     midterm_start_date, midterm_end_date, final_start_date, final_end_date,
                     updated_by_user_id)
                 VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT (faculty_user_id, course_id, semester, school_year) DO NOTHING
                 RETURNING config_id, faculty_user_id, course_id, semester, school_year,
                           version, schema_mode, term_midterm_weight, term_final_weight,
                           midterm_start_date, midterm_end_date, final_start_date, final_end_date,
                           created_at, updated_at, updated_by_user_id"
            );
            $insertConfig->execute([
                $offering['facultyUserId'],
                $offering['courseId'],
                $offering['semester'],
                $offering['schoolYear'],
                $schemaMode,
                $termRatio['midterm'] ?? null,
                $termRatio['final'] ?? null,
                $dateRanges['midterm']['startDate'] ?? null,
                $dateRanges['midterm']['endDate'] ?? null,
                $dateRanges['final']['startDate'] ?? null,
                $dateRanges['final']['endDate'] ?? null,
                $authCtx['user_id'],
            ]);
            $existing = $insertConfig->fetch(PDO::FETCH_ASSOC) ?: null;
            if ($existing === null) {
                throw new FacultyGradingConfigurationException(
                    'The grading configuration was created concurrently. Reload it before saving.',
                    409,
                    'GRADING_CONFIGURATION_VERSION_CONFLICT'
                );
            }
        }

        $configId = (int) $existing['config_id'];
        $existingCategoryStmt = $pdo->prepare('SELECT category_id, grading_period FROM grading_categories WHERE config_id = ?');
        $existingCategoryStmt->execute([$configId]);
        $existingCategoryRows = [];
        foreach ($existingCategoryStmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $existingCategoryRows[(int) $row['category_id']] = [
                'gradingPeriod' => $row['grading_period'] !== null ? (string) $row['grading_period'] : null,
            ];
        }
        $existingCategoryIds = array_keys($existingCategoryRows);
        $incomingCategoryIds = [];
        $categoriesForSave = [];
        $incomingById = [];
        foreach ($categories as $category) {
            if ($category['id'] === null) {
                $categoriesForSave[] = $category;
                continue;
            }
            $categoryId = (int) $category['id'];
            if (isset($incomingById[$categoryId])) {
                continue;
            }
            $incomingById[$categoryId] = $category;
            $categoriesForSave[] = $category;
            $incomingCategoryIds[] = $categoryId;
        }
        $existingCategoryIdSet = array_fill_keys($existingCategoryIds, true);
        foreach ($incomingCategoryIds as $categoryId) {
            if (!isset($existingCategoryIdSet[$categoryId])) {
                throw new FacultyGradingConfigurationException('Category identifier does not belong to this configuration.');
            }
        }

        foreach ($categoriesForSave as $category) {
            if ($category['id'] === null) {
                continue;
            }
            $existingPeriod = $existingCategoryRows[(int) $category['id']]['gradingPeriod'];
            if ($schemaMode === 'periods'
                && $existingPeriod !== null
                && $existingPeriod !== $category['gradingPeriod']) {
                throw new FacultyGradingConfigurationException(
                    'A period category can only be edited in its own grading period.',
                    422,
                    'GRADING_CATEGORY_PERIOD_MAPPING_INVALID'
                );
            }
        }

        $removedCategoryIds = array_values(array_diff($existingCategoryIds, $incomingCategoryIds));
        if ($removedCategoryIds !== []) {
            $placeholders = implode(',', array_fill(0, count($removedCategoryIds), '?'));
            $inUseStmt = $pdo->prepare(
                "SELECT COUNT(*)
                   FROM assessments a
                   JOIN class_sections cs ON cs.cs_id = a.cs_id
                  WHERE a.grading_category_id IN ({$placeholders})
                    AND cs.instructor_user_id = ?
                    AND cs.course_id = ?
                    AND UPPER(cs.semester) = ?
                    AND UPPER(cs.school_year) = ?"
            );
            $inUseStmt->execute(array_merge($removedCategoryIds, [
                $offering['facultyUserId'],
                $offering['courseId'],
                $offering['semester'],
                $offering['schoolYear'],
            ]));
            if ((int) $inUseStmt->fetchColumn() > 0) {
                throw new FacultyGradingConfigurationException(
                    'A grading category referenced by an assessment cannot be deleted.',
                    409,
                    'GRADING_CATEGORY_IN_USE'
                );
            }
            if ($schemaMode === 'periods') {
                $deleteRemovedMemberships = $pdo->prepare(
                    "DELETE FROM grading_category_periods WHERE config_id = ? AND category_id IN ({$placeholders})"
                );
                $deleteRemovedMemberships->execute(array_merge([$configId], $removedCategoryIds));
            }
            $deleteCategory = $pdo->prepare("DELETE FROM grading_categories WHERE config_id = ? AND category_id IN ({$placeholders})");
            $deleteCategory->execute(array_merge([$configId], $removedCategoryIds));
        }

        if ($existingCategoryIds !== [] && $schemaMode !== 'periods') {
            $temporaryName = $pdo->prepare(
                "UPDATE grading_categories SET name = ? WHERE config_id = ? AND category_id = ?"
            );
            foreach ($categoriesForSave as $category) {
                if ($category['id'] !== null) {
                    $temporaryName->execute([
                        '__grading_pending_' . $category['id'],
                        $configId,
                        $category['id'],
                    ]);
                }
            }
        }

        $categoryIds = [];
        $insertedCategoryIds = [];
        $periodCategoryNonce = $schemaMode === 'periods'
            ? bin2hex(random_bytes(8))
            : null;
        $insertCategory = $pdo->prepare(
            "INSERT INTO grading_categories (config_id, name, weight, sort_order, grading_period)
             VALUES (?, ?, ?, ?, ?) RETURNING category_id"
        );
        $updateCategory = $pdo->prepare(
            "UPDATE grading_categories
                SET name = ?, weight = ?, sort_order = ?
              WHERE config_id = ? AND category_id = ?"
        );
        foreach ($categoriesForSave as $category) {
            if ($category['id'] === null) {
                $insertCategory->execute([
                    $configId,
                    $schemaMode === 'periods'
                        ? '__grading_period_category_' . $configId . '_' . $periodCategoryNonce . '_' . (count($insertedCategoryIds) + 1)
                        : $category['name'],
                    $category['weight'],
                    $category['sortOrder'],
                    null,
                ]);
                $categoryIds[] = (int) $insertCategory->fetchColumn();
                $insertedCategoryIds[] = $categoryIds[array_key_last($categoryIds)];
            } elseif ($schemaMode === 'periods') {
                $categoryIds[] = $category['id'];
            } else {
                $updateCategory->execute([
                    $category['name'],
                    $category['weight'],
                    $category['sortOrder'],
                    $configId,
                    $category['id'],
                ]);
                if ($updateCategory->rowCount() !== 1) {
                    throw new FacultyGradingConfigurationException('Category update failed.');
                }
                $categoryIds[] = $category['id'];
            }
        }

        if ($schemaMode === 'periods') {
            $existingMembershipStmt = $pdo->prepare(
                'SELECT category_period_id, category_id, grading_period, source_kind FROM grading_category_periods WHERE config_id = ?'
            );
            $existingMembershipStmt->execute([$configId]);
            $existingMemberships = [];
            foreach ($existingMembershipStmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
                $existingMemberships[(int) $row['category_id'] . ':' . $row['grading_period']] = [
                    'categoryPeriodId' => (int) $row['category_period_id'],
                    'categoryId' => (int) $row['category_id'],
                    'gradingPeriod' => (string) $row['grading_period'],
                    'sourceKind' => (string) $row['source_kind'],
                ];
            }

            $incomingMemberships = [];
            $newCategoryIndex = 0;
            $assessmentMembershipKeys = [];
            if (!$isCreate && (string) ($existing['schema_mode'] ?? 'overall') === 'overall') {
                $assessmentMembershipStmt = $pdo->prepare(
                    "SELECT DISTINCT a.grading_category_id, a.grading_period
                       FROM assessments a
                       JOIN class_sections cs ON cs.cs_id = a.cs_id
                      WHERE a.grading_category_id IS NOT NULL
                        AND a.grading_period IN ('Midterm', 'Final')
                        AND cs.instructor_user_id = ?
                        AND cs.course_id = ?
                        AND UPPER(cs.semester) = ?
                        AND UPPER(cs.school_year) = ?"
                );
                $assessmentMembershipStmt->execute([
                    $offering['facultyUserId'],
                    $offering['courseId'],
                    $offering['semester'],
                    $offering['schoolYear'],
                ]);
                foreach ($assessmentMembershipStmt->fetchAll(PDO::FETCH_ASSOC) as $assessmentMembership) {
                    $assessmentMembershipKeys[
                        (int) $assessmentMembership['grading_category_id'] . ':' . (string) $assessmentMembership['grading_period']
                    ] = true;
                }
            }
            foreach ($categories as $category) {
                $categoryId = $category['id'] !== null
                    ? (int) $category['id']
                    : (int) $insertedCategoryIds[$newCategoryIndex++];
                $membershipKey = $categoryId . ':' . $category['gradingPeriod'];
                $existingMembership = $existingMemberships[$membershipKey] ?? null;
                $sourceKind = $existingMembership['sourceKind']
                    ?? faculty_grading_source_kind($category['sourceKind'] ?? null, $category['name']);
                if ($existingMembership === null
                    && $sourceKind === 'attendance'
                    && isset($assessmentMembershipKeys[$membershipKey])) {
                    // An overall configuration can contain a legacy category
                    // named Attendance that is already assessment-backed.
                    // Preserve that association during explicit conversion.
                    $sourceKind = 'assessment';
                }
                $incomingMemberships[$membershipKey] = [
                    'categoryId' => $categoryId,
                    'gradingPeriod' => $category['gradingPeriod'],
                    'name' => $category['name'],
                    'weight' => $category['weight'],
                    'sortOrder' => $category['sortOrder'],
                    'sourceKind' => $sourceKind,
                ];
            }

            $attendancePeriods = [];
            foreach ($incomingMemberships as $membership) {
                if ($membership['sourceKind'] !== 'attendance') {
                    continue;
                }
                $period = $membership['gradingPeriod'];
                if (isset($attendancePeriods[$period])) {
                    throw new FacultyGradingConfigurationException(
                        'Each period may contain only one authoritative attendance category.',
                        422,
                        'GRADING_ATTENDANCE_CATEGORY_DUPLICATE'
                    );
                }
                $attendancePeriods[$period] = true;
            }

            $attendanceMembershipInUse = $pdo->prepare(
                "SELECT 1
                   FROM assessments a
                   JOIN class_sections cs ON cs.cs_id = a.cs_id
                  WHERE a.grading_category_id = ?
                    AND a.grading_period = ?
                    AND cs.instructor_user_id = ?
                    AND cs.course_id = ?
                    AND UPPER(cs.semester) = ?
                    AND UPPER(cs.school_year) = ?
                  LIMIT 1"
            );
            foreach ($incomingMemberships as $membership) {
                if ($membership['sourceKind'] !== 'attendance') {
                    continue;
                }
                $attendanceMembershipInUse->execute([
                    $membership['categoryId'],
                    $membership['gradingPeriod'],
                    $offering['facultyUserId'],
                    $offering['courseId'],
                    $offering['semester'],
                    $offering['schoolYear'],
                ]);
                if ($attendanceMembershipInUse->fetchColumn()) {
                    throw new FacultyGradingConfigurationException(
                        'The authoritative Attendance category cannot be associated with an assessment.',
                        422,
                        'GRADING_ATTENDANCE_CATEGORY_ASSESSMENT_INVALID'
                    );
                }
            }

            if (!$isCreate && (string) ($existing['schema_mode'] ?? 'overall') === 'overall') {
                $assessmentRefsStmt = $pdo->prepare(
                    "SELECT a.assessment_id, a.grading_category_id, a.grading_period, a.status
                       FROM assessments a
                       JOIN class_sections cs ON cs.cs_id = a.cs_id
                      WHERE (a.grading_category_id IS NOT NULL OR LOWER(COALESCE(a.status, '')) = 'active')
                        AND cs.instructor_user_id = ?
                        AND cs.course_id = ?
                        AND UPPER(cs.semester) = ?
                        AND UPPER(cs.school_year) = ?"
                );
                $assessmentRefsStmt->execute([
                    $offering['facultyUserId'],
                    $offering['courseId'],
                    $offering['semester'],
                    $offering['schoolYear'],
                ]);
                $missingAssessmentRefs = [];
                foreach ($assessmentRefsStmt->fetchAll(PDO::FETCH_ASSOC) as $assessmentRef) {
                    $categoryId = $assessmentRef['grading_category_id'] !== null
                        ? (int) $assessmentRef['grading_category_id']
                        : null;
                    if ($categoryId === null) {
                        $missingAssessmentRefs[] = [
                            'assessmentId' => (int) $assessmentRef['assessment_id'],
                            'categoryId' => null,
                            'gradingPeriod' => (string) ($assessmentRef['grading_period'] ?? ''),
                            'status' => (string) ($assessmentRef['status'] ?? ''),
                        ];
                        continue;
                    }
                    $membershipKey = $categoryId . ':' . (string) $assessmentRef['grading_period'];
                    if (!isset($incomingMemberships[$membershipKey])) {
                        $missingAssessmentRefs[] = [
                            'assessmentId' => (int) $assessmentRef['assessment_id'],
                            'categoryId' => $categoryId,
                            'gradingPeriod' => (string) $assessmentRef['grading_period'],
                            'status' => (string) ($assessmentRef['status'] ?? ''),
                        ];
                    }
                }
                if ($missingAssessmentRefs !== []) {
                    throw new FacultyGradingConfigurationException(
                        'Every existing assessment must have a category mapping for its grading period during conversion.',
                        422,
                        'GRADING_CATEGORY_PERIOD_MAPPING_REQUIRED',
                        ['assessmentReferences' => $missingAssessmentRefs]
                    );
                }
            }

            $removedMemberships = array_diff_key($existingMemberships, $incomingMemberships);
            foreach ($removedMemberships as $removedMembership) {
                $membershipInUseStmt = $pdo->prepare(
                    "SELECT COUNT(*)
                       FROM assessments a
                       JOIN class_sections cs ON cs.cs_id = a.cs_id
                      WHERE a.grading_category_id = ?
                        AND a.grading_period = ?
                        AND cs.instructor_user_id = ?
                        AND cs.course_id = ?
                        AND UPPER(cs.semester) = ?
                        AND UPPER(cs.school_year) = ?"
                );
                $membershipInUseStmt->execute([
                    $removedMembership['categoryId'],
                    $removedMembership['gradingPeriod'],
                    $offering['facultyUserId'],
                    $offering['courseId'],
                    $offering['semester'],
                    $offering['schoolYear'],
                ]);
                if ((int) $membershipInUseStmt->fetchColumn() > 0) {
                    throw new FacultyGradingConfigurationException(
                        'A period grading category referenced by an assessment cannot be deleted.',
                        409,
                        'GRADING_CATEGORY_IN_USE'
                    );
                }
            }

            if ($existingMemberships !== []) {
                $temporaryMembershipName = $pdo->prepare(
                    'UPDATE grading_category_periods SET name = ? WHERE config_id = ? AND category_period_id = ?'
                );
                foreach ($existingMemberships as $existingMembership) {
                    $temporaryMembershipName->execute([
                        '__grading_period_pending_' . $existingMembership['categoryId'] . '_' . $existingMembership['gradingPeriod'],
                        $configId,
                        $existingMembership['categoryPeriodId'],
                    ]);
                }
            }

            $deleteMissingMembership = $pdo->prepare(
                'DELETE FROM grading_category_periods WHERE config_id = ? AND category_id = ? AND grading_period = ?'
            );
            foreach ($removedMemberships as $removedMembership) {
                $deleteMissingMembership->execute([
                    $configId,
                    $removedMembership['categoryId'],
                    $removedMembership['gradingPeriod'],
                ]);
            }

            $upsertMembership = $pdo->prepare(
                "INSERT INTO grading_category_periods
                    (config_id, category_id, grading_period, name, weight, sort_order, source_kind)
                 VALUES (?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT (config_id, category_id, grading_period) DO UPDATE
                 SET name = EXCLUDED.name,
                     weight = EXCLUDED.weight,
                     sort_order = EXCLUDED.sort_order,
                     updated_at = CURRENT_TIMESTAMP(6)"
            );
            foreach ($incomingMemberships as $membership) {
                $upsertMembership->execute([
                    $configId,
                    $membership['categoryId'],
                    $membership['gradingPeriod'],
                    $membership['name'],
                    $membership['weight'],
                    $membership['sortOrder'],
                    $membership['sourceKind'],
                ]);
            }
        }

        if ($isCreate) {
            faculty_grading_apply_legacy_assessment_mappings($pdo, $legacyAssessmentMappings, $categoryIds);
        }

        $newVersion = $isCreate ? 1 : ((int) $existing['version'] + 1);
        $updateConfig = $pdo->prepare(
            "UPDATE grading_configs
                SET version = ?, schema_mode = ?, term_midterm_weight = ?, term_final_weight = ?,
                    midterm_start_date = ?, midterm_end_date = ?, final_start_date = ?, final_end_date = ?,
                    updated_by_user_id = ?, updated_at = CURRENT_TIMESTAMP(6)
              WHERE config_id = ? AND version = ?"
        );
        $expectedVersion = $isCreate ? 1 : (int) $existing['version'];
        $updateConfig->execute([
            $newVersion,
            $schemaMode,
            $termRatio['midterm'] ?? null,
            $termRatio['final'] ?? null,
            $dateRanges['midterm']['startDate'] ?? null,
            $dateRanges['midterm']['endDate'] ?? null,
            $dateRanges['final']['startDate'] ?? null,
            $dateRanges['final']['endDate'] ?? null,
            $authCtx['user_id'],
            $configId,
            $expectedVersion,
        ]);
        if ($updateConfig->rowCount() !== 1) {
            throw new FacultyGradingConfigurationException(
                'The grading configuration is stale. Reload it before saving.',
                409,
                'GRADING_CONFIGURATION_VERSION_CONFLICT'
            );
        }

        $afterRow = faculty_grading_find_config($pdo, $offering, true);
        $afterState = faculty_grading_snapshot($pdo, $offering, $afterRow);
        $auditBeforeState = $beforeState !== null ? faculty_grading_audit_state($beforeState) : null;
        $auditAfterState = faculty_grading_audit_state($afterState);
        $macKey = config_key_bytes_at_least($config['audit']['mac_key_b64'], 32, 'AUDIT_MAC_KEY');
        $auditCtx = audit_begin_operation($pdo);
        audit_finish_operation($pdo, $auditCtx, [
            'module_code' => 'faculty_grading',
            'action_code' => 'grading_config_update',
            'event_status' => 'Success',
            'actor_user_id' => $authCtx['user_id'],
            'actor_username' => $authCtx['login_email'],
            'actor_role' => $authCtx['role'],
            'actor_display_name' => $authCtx['display_name'],
            'session_id' => $authCtx['session_id'],
            'target_type' => 'grading_config',
            'target_id' => (string) $configId,
            'description' => sprintf(
                'Updated Grade Weights for %s, %s, %s.',
                $offering['courseCode'],
                $offering['semester'],
                $offering['schoolYear']
            ),
            'reason' => null,
            'http_method' => $context['http_method'],
            'endpoint' => $context['endpoint'],
            'request_id' => $context['request_id'],
            'ip_address' => $context['ip_address'],
            'user_agent' => $context['user_agent'],
        ], $macKey, $auditBeforeState, $auditAfterState);
        $pdo->commit();

        json_response([
            'status' => 'ok',
            'configuration' => $afterState,
        ], $isCreate ? 201 : 200);
    } catch (FacultyGradingConfigurationException $e) {
        if ($pdo instanceof PDO && $pdo->inTransaction()) {
            $pdo->rollBack();
        }
        faculty_grading_configuration_error($e);
    } catch (\Throwable $e) {
        if ($pdo instanceof PDO && $pdo->inTransaction()) {
            $pdo->rollBack();
        }
        error_log('Faculty grading configuration save error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
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

function faculty_transmutation_defaults(PDO $pdo): array
{
    $stmt = $pdo->query("SELECT setting_value FROM system_settings WHERE setting_key = 'grading_defaults' LIMIT 1");
    $grading = json_decode((string) ($stmt->fetchColumn() ?: '{}'), true);
    $defaults = $grading['transmutation_defaults'] ?? [];
    $minimum = (float) ($defaults['minimum_percentage'] ?? 50);
    $maximum = (float) ($defaults['maximum_percentage'] ?? 100);
    if (!is_finite($minimum) || !is_finite($maximum) || $minimum < 0 || $maximum > 100 || $minimum > $maximum) {
        throw new RuntimeException('Persisted transmutation defaults are invalid.');
    }
    return [
        'minimumPercentage' => $minimum,
        'maximumPercentage' => $maximum,
    ];
}

function faculty_effective_assessment_percentage(
    float $rawScore,
    float $maxScore,
    bool $enabled,
    float $minimumPercentage,
    float $maximumPercentage,
    ?string $attendanceStatus
): ?float {
    if ($maxScore <= 0) {
        throw new InvalidArgumentException('Assessment maximum score must be positive.');
    }
    $rawPercentage = ($rawScore / $maxScore) * 100;
    if (!$enabled) {
        return $rawPercentage;
    }
    if ($attendanceStatus === null) {
        return null;
    }
    if ($attendanceStatus === 'absent') {
        return 0.0;
    }
    if (in_array($attendanceStatus, ['present', 'late', 'excused'], true)) {
        return $minimumPercentage + (($rawPercentage / 100) * ($maximumPercentage - $minimumPercentage));
    }
    throw new InvalidArgumentException('Attendance status is invalid for transmutation.');
}

function faculty_period_attendance_summary(
    PDO $pdo,
    int $csId,
    int $enrollmentId,
    ?string $startDate,
    ?string $endDate
): array {
    if ($startDate === null || $endDate === null) {
        return [
            'status' => 'incomplete',
            'reason' => 'missing_date_range',
            'percentage' => null,
            'sessions' => [],
        ];
    }

    $recordStmt = $pdo->prepare(
        "SELECT COALESCE(r.attendance_session_id, 0) AS session_id,
                r.session_date, r.session_code, r.status AS attendance_status,
                COALESCE(s.status, 'recorded') AS session_status
           FROM attendance_records r
           JOIN enrollments e ON e.enrollment_id = r.enrollment_id
           LEFT JOIN attendance_sessions s
             ON s.session_id = r.attendance_session_id
          WHERE r.enrollment_id = ?
            AND e.cs_id = ?
            AND r.session_date BETWEEN ? AND ?
            AND (s.session_id IS NULL OR s.status <> 'revoked')
          ORDER BY r.session_date, r.record_id"
    );
    $recordStmt->execute([$enrollmentId, $csId, $startDate, $endDate]);
    $rows = $recordStmt->fetchAll(PDO::FETCH_ASSOC);

    // A created/ended session with no attendance record is an
    // unresolved expected result. Include it alongside direct/manual records.
    $sessionStmt = $pdo->prepare(
        "SELECT s.session_id, s.session_date, s.session_code,
                s.status AS session_status, NULL AS attendance_status
           FROM attendance_sessions s
          WHERE s.cs_id = ?
            AND s.session_date BETWEEN ? AND ?
            AND s.status <> 'revoked'
            AND NOT EXISTS (
                SELECT 1
                  FROM attendance_records r
                 WHERE r.enrollment_id = ?
                   AND (
                       r.attendance_session_id = s.session_id
                       OR (r.attendance_session_id IS NULL
                           AND r.session_date = s.session_date
                           AND COALESCE(r.session_code, '') = COALESCE(s.session_code, ''))
                   )
            )
          ORDER BY s.session_date, s.session_id"
    );
    $sessionStmt->execute([$csId, $startDate, $endDate, $enrollmentId]);
    $rows = array_merge($rows, $sessionStmt->fetchAll(PDO::FETCH_ASSOC));
    usort($rows, static fn(array $left, array $right): int => strcmp(
        (string) $left['session_date'] . ':' . (string) $left['session_id'],
        (string) $right['session_date'] . ':' . (string) $right['session_id']
    ));
    if ($rows === []) {
        return [
            'status' => 'incomplete',
            'reason' => 'no_sessions',
            'percentage' => null,
            'sessions' => [],
        ];
    }

    $points = [];
    $missing = [];
    foreach ($rows as $row) {
        $attendanceStatus = $row['attendance_status'] !== null
            ? strtolower((string) $row['attendance_status'])
            : null;
        $pointsForStatus = [
            'present' => 100.0,
            'excused' => 100.0,
            'late' => 80.0,
            'absent' => 0.0,
        ];
        if ($attendanceStatus === null || !array_key_exists($attendanceStatus, $pointsForStatus)) {
            $missing[] = [
                'sessionId' => (string) $row['session_id'],
                'sessionDate' => $row['session_date'],
                'sessionCode' => $row['session_code'],
                'sessionStatus' => $row['session_status'],
            ];
            continue;
        }
        $points[] = $pointsForStatus[$attendanceStatus];
    }
    if ($missing !== []) {
        return [
            'status' => 'incomplete',
            'reason' => 'unresolved_attendance',
            'percentage' => null,
            'sessions' => $missing,
        ];
    }
    return [
        'status' => 'computed',
        'reason' => null,
        'percentage' => array_sum($points) / count($points),
        'sessions' => array_map(static fn(array $row): array => [
            'sessionId' => (string) $row['session_id'],
            'sessionDate' => $row['session_date'],
            'sessionCode' => $row['session_code'],
            'status' => strtolower((string) $row['attendance_status']),
            'sessionStatus' => $row['session_status'],
        ], $rows),
    ];
}

function faculty_compute_period_result(PDO $pdo, array $group, string $period): array
{
    $membershipStmt = $pdo->prepare(
        'SELECT category_id, name, weight, sort_order, source_kind
           FROM grading_category_periods
          WHERE config_id = ? AND grading_period = ?
          ORDER BY sort_order, category_period_id'
    );
    $membershipStmt->execute([(int) $group['configId'], $period]);
    $memberships = $membershipStmt->fetchAll(PDO::FETCH_ASSOC);
    $dateKey = strtolower($period);
    $range = $group['attendanceDateRanges'][$dateKey] ?? ['startDate' => null, 'endDate' => null];
    $categories = [];
    $incomplete = [];

    $attendanceMemberships = array_values(array_filter(
        $memberships,
        static fn(array $membership): bool => (string) ($membership['source_kind'] ?? 'assessment') === 'attendance'
    ));
    if (count($attendanceMemberships) > 1) {
        $incomplete[] = [
            'categoryId' => (int) $attendanceMemberships[0]['category_id'],
            'name' => 'Attendance',
            'sourceKind' => 'attendance',
            'reason' => 'duplicate_attendance_sources',
            'categoryIds' => array_map(
                static fn(array $membership): int => (int) $membership['category_id'],
                $attendanceMemberships
            ),
        ];
        // Invalid legacy rows must never cause the same attendance records to
        // be added more than once during a direct recomputation.
        $memberships = array_values(array_filter(
            $memberships,
            static fn(array $membership): bool => (string) ($membership['source_kind'] ?? 'assessment') !== 'attendance'
        ));
    }

    foreach ($memberships as $membership) {
        $categoryId = (int) $membership['category_id'];
        $sourceKind = (string) ($membership['source_kind'] ?? 'assessment');
        $weight = (float) $membership['weight'];
        if ($sourceKind === 'attendance') {
            $attendance = faculty_period_attendance_summary(
                $pdo,
                (int) $group['csId'],
                (int) $group['enrollmentId'],
                $range['startDate'] ?? null,
                $range['endDate'] ?? null,
            );
            if ($attendance['status'] !== 'computed') {
                $incomplete[] = [
                    'categoryId' => $categoryId,
                    'name' => (string) $membership['name'],
                    'sourceKind' => $sourceKind,
                    'reason' => $attendance['reason'],
                    'sessions' => $attendance['sessions'],
                ];
                continue;
            }
            $ratio = ((float) $attendance['percentage']) / 100;
            $contribution = $ratio * $weight;
            $categories[] = [
                'categoryId' => $categoryId,
                'name' => (string) $membership['name'],
                'sourceKind' => $sourceKind,
                'earnedPoints' => round((float) $attendance['percentage'], 4),
                'possiblePoints' => 100.0,
                'ratio' => round($ratio, 6),
                'weight' => round($weight, 4),
                'contribution' => round($contribution, 4),
                'sessions' => $attendance['sessions'],
            ];
            continue;
        }

        $categoryRows = array_values(array_filter(
            $group['assessments'],
            static fn(array $assessment): bool => (int) ($assessment['grading_category_id'] ?? 0) === $categoryId
                && (string) ($assessment['grading_period'] ?? '') === $period
        ));
        if ($categoryRows === []) {
            $incomplete[] = [
                'categoryId' => $categoryId,
                'name' => (string) $membership['name'],
                'sourceKind' => $sourceKind,
                'reason' => 'no_assessment_results',
            ];
            continue;
        }
        $earnedPoints = 0.0;
        $possiblePoints = 0.0;
        foreach ($categoryRows as $assessment) {
            if (!($assessment['_has_score'] ?? false)) {
                $incomplete[] = [
                    'categoryId' => $categoryId,
                    'name' => (string) $membership['name'],
                    'sourceKind' => $sourceKind,
                    'reason' => 'missing_assessment_score',
                    'assessmentId' => (string) $assessment['assessment_id'],
                ];
                continue 2;
            }
            $enabled = filter_var($assessment['transmutation_enabled'], FILTER_VALIDATE_BOOLEAN);
            $effectivePercentage = faculty_effective_assessment_percentage(
                (float) $assessment['score'],
                (float) $assessment['max_score'],
                $enabled,
                (float) $assessment['transmutation_minimum_percentage'],
                (float) $assessment['transmutation_maximum_percentage'],
                $assessment['linked_attendance_status'] !== null
                    ? (string) $assessment['linked_attendance_status'] : null
            );
            if ($effectivePercentage === null) {
                $incomplete[] = [
                    'categoryId' => $categoryId,
                    'name' => (string) $membership['name'],
                    'sourceKind' => $sourceKind,
                    'reason' => 'unresolved_assessment_attendance',
                    'assessmentId' => (string) $assessment['assessment_id'],
                ];
                continue 2;
            }
            $earnedPoints += ($effectivePercentage / 100) * (float) $assessment['max_score'];
            $possiblePoints += (float) $assessment['max_score'];
        }
        if ($possiblePoints <= 0) {
            $incomplete[] = [
                'categoryId' => $categoryId,
                'name' => (string) $membership['name'],
                'sourceKind' => $sourceKind,
                'reason' => 'no_assessment_results',
            ];
            continue;
        }
        $ratio = $earnedPoints / $possiblePoints;
        $contribution = $ratio * $weight;
        $categories[] = [
            'categoryId' => $categoryId,
            'name' => (string) $membership['name'],
            'sourceKind' => $sourceKind,
            'earnedPoints' => round($earnedPoints, 4),
            'possiblePoints' => round($possiblePoints, 4),
            'ratio' => round($ratio, 6),
            'weight' => round($weight, 4),
            'contribution' => round($contribution, 4),
        ];
    }

    $periodBreakdown = [
        'period' => $period,
        'status' => $incomplete === [] ? 'computed' : 'incomplete',
        'categories' => $categories,
        'incomplete' => $incomplete,
        'attendanceDateRange' => $range,
    ];
    if ($incomplete !== []) {
        $periodBreakdown['percentage'] = null;
        return [
            'status' => 'incomplete',
            'percentage' => null,
            'breakdown' => $periodBreakdown,
        ];
    }
    $percentage = round(array_sum(array_column($categories, 'contribution')), 2);
    $periodBreakdown['percentage'] = $percentage;
    return [
        'status' => 'computed',
        'percentage' => $percentage,
        'breakdown' => $periodBreakdown,
    ];
}

function handle_faculty_assessments_get(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = faculty_verify_auth($pdo, $config);

        $stmt = $pdo->prepare(
            "SELECT a.assessment_id, a.title, a.type, a.grading_category_id, a.grading_period, a.max_score,
                    a.weight, a.due_date, a.instructions, a.status, a.created_at,
                    a.transmutation_enabled, a.transmutation_minimum_percentage,
                    a.transmutation_maximum_percentage, a.attendance_session_date,
                    a.attendance_session_code,
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
            'gradingCategoryId' => $row['grading_category_id'] !== null ? (string) $row['grading_category_id'] : null,
            'gradingPeriod' => $row['grading_period'],
            'maxScore' => (float) $row['max_score'],
            'weight' => $row['weight'] !== null ? (float) $row['weight'] : null,
            'dueDate' => $row['due_date'],
            'instructions' => $row['instructions'],
            'status' => $row['status'],
            'transmutationEnabled' => filter_var($row['transmutation_enabled'], FILTER_VALIDATE_BOOLEAN),
            'transmutationMinimumPercentage' => (float) $row['transmutation_minimum_percentage'],
            'transmutationMaximumPercentage' => (float) $row['transmutation_maximum_percentage'],
            'attendanceSessionDate' => $row['attendance_session_date'],
            'attendanceSessionCode' => $row['attendance_session_code'],
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
        $transmutationDefaults = faculty_transmutation_defaults($pdo);
        $pdo->beginTransaction();
        foreach ($items as $item) {
            if ($item instanceof \stdClass) {
                $item = get_object_vars($item);
            }
            if (!is_array($item)) {
                $pdo->rollBack();
                safe_error_response('Assessment entry is invalid.', 422);
                return;
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
            $assessmentId = ctype_digit((string) ($item['id'] ?? '')) ? (int) $item['id'] : 0;
            $existing = null;
            if ($assessmentId > 0) {
                $existingStmt = $pdo->prepare(
                    "SELECT a.grading_category_id, a.transmutation_enabled, a.transmutation_minimum_percentage,
                            a.transmutation_maximum_percentage, a.attendance_session_date,
                            a.attendance_session_code
                     FROM assessments a
                     JOIN class_sections cs ON cs.cs_id = a.cs_id
                     WHERE a.assessment_id = ? AND cs.instructor_user_id = ?"
                );
                $existingStmt->execute([$assessmentId, $authCtx['user_id']]);
                $existing = $existingStmt->fetch(PDO::FETCH_ASSOC) ?: null;
                if (!$existing) {
                    $pdo->rollBack();
                    safe_error_response('Assessment not found.', 404);
                    return;
                }
            }
            $offering = faculty_grading_offering_for_class($pdo, (int) $authCtx['user_id'], $csId);
            $gradingConfig = faculty_grading_find_config($pdo, $offering, true);
            $categoryWasSupplied = array_key_exists('gradingCategoryId', $item);
            $gradingCategoryId = $categoryWasSupplied
                ? faculty_grading_category_id($item['gradingCategoryId'])
                : faculty_grading_category_id($existing['grading_category_id'] ?? null);
            if ($categoryWasSupplied && $gradingCategoryId === null) {
                $pdo->rollBack();
                safe_error_response('A valid grading category is required.', 422);
                return;
            }
            if ($gradingConfig !== null) {
                if ($gradingCategoryId === null) {
                    $pdo->rollBack();
                    safe_error_response('A saved grading configuration requires a stable grading category.', 422);
                    return;
                }
                $categoryStmt = $pdo->prepare(
                    "SELECT gc.grading_period,
                            gcp.source_kind,
                            EXISTS (
                                SELECT 1
                                  FROM grading_category_periods gcp
                                 WHERE gcp.config_id = gc.config_id
                                   AND gcp.category_id = gc.category_id
                                   AND gcp.grading_period = ?
                            ) AS period_membership
                       FROM grading_categories gc
                       LEFT JOIN grading_category_periods gcp
                         ON gcp.config_id = gc.config_id
                        AND gcp.category_id = gc.category_id
                        AND gcp.grading_period = ?
                      WHERE gc.config_id = ? AND gc.category_id = ?"
                );
                $categoryStmt->execute([$period, $period, (int) $gradingConfig['config_id'], $gradingCategoryId]);
                $categoryRow = $categoryStmt->fetch(PDO::FETCH_ASSOC) ?: null;
                if ($categoryRow === null) {
                    $pdo->rollBack();
                    safe_error_response('Grading category does not belong to this course configuration.', 422);
                    return;
                }
                $categoryPeriod = $categoryRow['grading_period'];
                if (($gradingConfig['schema_mode'] ?? 'overall') === 'periods'
                    && !filter_var($categoryRow['period_membership'], FILTER_VALIDATE_BOOLEAN)) {
                    $pdo->rollBack();
                    safe_error_response('Grading category does not belong to the assessment period.', 422);
                    return;
                }
                if (($gradingConfig['schema_mode'] ?? 'overall') === 'periods'
                    && $categoryPeriod !== null
                    && (string) $categoryPeriod !== $period) {
                    $pdo->rollBack();
                    safe_error_response('Grading category does not belong to the assessment period.', 422);
                    return;
                }
                if (($gradingConfig['schema_mode'] ?? 'overall') === 'periods'
                    && (string) ($categoryRow['source_kind'] ?? 'assessment') === 'attendance') {
                    $pdo->rollBack();
                    safe_error_response('The authoritative Attendance category cannot be used for an assessment.', 422);
                    return;
                }
            } elseif (!$categoryWasSupplied && $gradingCategoryId === null) {
                $allowedTypes = ['Quiz', 'Activity', 'Assignment', 'Laboratory', 'Midterm Exam', 'Final Exam', 'Others'];
                if (!in_array($type, $allowedTypes, true)) {
                    $pdo->rollBack();
                    safe_error_response('Assessment type is invalid.', 422);
                    return;
                }
            }
            $transmutationEnabled = array_key_exists('transmutationEnabled', $item)
                ? filter_var($item['transmutationEnabled'], FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE)
                : ($existing ? filter_var($existing['transmutation_enabled'], FILTER_VALIDATE_BOOLEAN) : false);
            $minimumPercentage = array_key_exists('transmutationMinimumPercentage', $item)
                ? (float) $item['transmutationMinimumPercentage']
                : (float) ($existing['transmutation_minimum_percentage'] ?? $transmutationDefaults['minimumPercentage']);
            $maximumPercentage = array_key_exists('transmutationMaximumPercentage', $item)
                ? (float) $item['transmutationMaximumPercentage']
                : (float) ($existing['transmutation_maximum_percentage'] ?? $transmutationDefaults['maximumPercentage']);
            $attendanceSessionDate = array_key_exists('attendanceSessionDate', $item)
                ? trim((string) ($item['attendanceSessionDate'] ?? ''))
                : (string) ($existing['attendance_session_date'] ?? '');
            $attendanceSessionCode = array_key_exists('attendanceSessionCode', $item)
                ? trim((string) ($item['attendanceSessionCode'] ?? ''))
                : (string) ($existing['attendance_session_code'] ?? '');
            $attendanceSessionDate = $attendanceSessionDate !== '' ? $attendanceSessionDate : null;
            $attendanceSessionCode = $attendanceSessionCode !== '' ? $attendanceSessionCode : null;
            $sessionDate = $attendanceSessionDate === null
                ? null
                : DateTimeImmutable::createFromFormat('!Y-m-d', $attendanceSessionDate);
            if ((array_key_exists('transmutationMinimumPercentage', $item)
                    && !is_numeric($item['transmutationMinimumPercentage']))
                || (array_key_exists('transmutationMaximumPercentage', $item)
                    && !is_numeric($item['transmutationMaximumPercentage']))
                || ($attendanceSessionCode !== null && strlen($attendanceSessionCode) > 100)
                || $transmutationEnabled === null
                || !is_finite($minimumPercentage) || !is_finite($maximumPercentage)
                || $minimumPercentage < 0 || $maximumPercentage > 100
                || $minimumPercentage > $maximumPercentage
                || (($attendanceSessionDate === null) !== ($attendanceSessionCode === null))
                || ($attendanceSessionDate !== null && (!$sessionDate || $sessionDate->format('Y-m-d') !== $attendanceSessionDate))
            ) {
                $pdo->rollBack();
                safe_error_response('Transmutation bounds and attendance linkage are invalid.', 422);
                return;
            }
            if ($transmutationEnabled && ($attendanceSessionDate === null || $attendanceSessionCode === null)) {
                $pdo->rollBack();
                safe_error_response('Enabled transmutation requires a linked attendance session.', 422);
                return;
            }
            if ($attendanceSessionDate !== null && $attendanceSessionCode !== null) {
                $sessionStmt = $pdo->prepare(
                    "SELECT 1
                     FROM attendance_records ar
                     JOIN enrollments e ON e.enrollment_id = ar.enrollment_id
                     WHERE e.cs_id = ? AND ar.session_date = ? AND ar.session_code = ?
                     LIMIT 1"
                );
                $sessionStmt->execute([$csId, $attendanceSessionDate, $attendanceSessionCode]);
                if (!$sessionStmt->fetchColumn()) {
                    $pdo->rollBack();
                    safe_error_response('Attendance session is not available for the assessment class.', 422);
                    return;
                }
            }
            if ($assessmentId > 0) {
                $stmt = $pdo->prepare(
                    "UPDATE assessments AS a
                     SET cs_id = ?, title = ?, type = ?, grading_category_id = ?, grading_period = ?,
                         max_score = ?, weight = ?, due_date = ?, instructions = ?,
                         status = ?, transmutation_enabled = ?,
                         transmutation_minimum_percentage = ?, transmutation_maximum_percentage = ?,
                         attendance_session_date = ?, attendance_session_code = ?
                     FROM class_sections AS cs
                     WHERE a.assessment_id = ? AND cs.cs_id = a.cs_id AND cs.instructor_user_id = ?"
                );
                $stmt->execute([
                    $csId, $title, $type, $gradingCategoryId, $period, $maxScore, $weight,
                    $item['dueDate'] ?? null, $item['instructions'] ?? null,
                    $item['status'] ?? 'Active', $transmutationEnabled ? 'true' : 'false',
                    $minimumPercentage, $maximumPercentage, $attendanceSessionDate, $attendanceSessionCode,
                    $assessmentId, $authCtx['user_id'],
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
                     (cs_id, title, type, grading_category_id, grading_period, max_score, weight, due_date, instructions, status,
                      transmutation_enabled, transmutation_minimum_percentage, transmutation_maximum_percentage,
                      attendance_session_date, attendance_session_code)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING assessment_id"
                );
                $stmt->execute([
                    $csId, $title, $type, $gradingCategoryId, $period, $maxScore, $weight,
                    $item['dueDate'] ?? null, $item['instructions'] ?? null,
                    $item['status'] ?? 'Active', $transmutationEnabled ? 'true' : 'false',
                    $minimumPercentage, $maximumPercentage, $attendanceSessionDate, $attendanceSessionCode,
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
            if ($scoreRow instanceof \stdClass) {
                $scoreRow = get_object_vars($scoreRow);
            }
            if (!is_array($scoreRow)) {
                $pdo->rollBack();
                safe_error_response('Every score must be a valid score entry.', 422);
                return;
            }
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
    $pdo = null;
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

        $pdo->beginTransaction();
        $lockEnrollmentsSql =
            "SELECT e.enrollment_id
               FROM enrollments e
               JOIN class_sections cs ON cs.cs_id = e.cs_id
              WHERE cs.instructor_user_id = ?";
        $lockEnrollmentParams = [(int) $authCtx['user_id']];
        if ($csId > 0) {
            $lockEnrollmentsSql .= ' AND e.cs_id = ?';
            $lockEnrollmentParams[] = $csId;
        }
        $lockEnrollmentsSql .= ' FOR UPDATE';
        $lockEnrollments = $pdo->prepare($lockEnrollmentsSql);
        $lockEnrollments->execute($lockEnrollmentParams);
        $lockConfigsSql =
            "SELECT gc.config_id
               FROM grading_configs gc
               JOIN class_sections cs
                 ON cs.instructor_user_id = gc.faculty_user_id
                AND cs.course_id = gc.course_id
                AND UPPER(cs.semester) = gc.semester
                AND UPPER(cs.school_year) = gc.school_year
              WHERE gc.faculty_user_id = ?";
        $lockConfigParams = [(int) $authCtx['user_id']];
        if ($csId > 0) {
            $lockConfigsSql .= ' AND cs.cs_id = ?';
            $lockConfigParams[] = $csId;
        }
        $lockConfigsSql .= ' FOR UPDATE';
        $lockConfigs = $pdo->prepare($lockConfigsSql);
        $lockConfigs->execute($lockConfigParams);

        $sql = "SELECT e.enrollment_id, e.student_id, e.cs_id,
                       e.final_percentage, e.final_gwa, e.grade_components_json,
                       a.assessment_id, a.title, a.grading_period, a.grading_category_id,
                       a.weight, a.max_score, a.transmutation_enabled,
                       a.transmutation_minimum_percentage, a.transmutation_maximum_percentage,
                       a.attendance_session_date, a.attendance_session_code,
                       gc.config_id, gc.schema_mode, gc.term_midterm_weight, gc.term_final_weight,
                       gc.midterm_start_date, gc.midterm_end_date,
                       gc.final_start_date, gc.final_end_date,
                       gcat.name AS grading_category_name,
                       gcat.weight AS grading_category_weight,
                       gcp.name AS period_category_name,
                       gcp.weight AS period_category_weight,
                       gcp.grading_period AS period_category_period,
                       gcp.source_kind AS period_category_source_kind,
                       sc.score_id, sc.score,
                       linked_att.record_id AS linked_attendance_record_id,
                       linked_att.status AS linked_attendance_status,
                       att.attendance_percentage
                FROM enrollments e
                JOIN class_sections cs ON cs.cs_id = e.cs_id
                LEFT JOIN assessments a ON a.cs_id = e.cs_id AND a.status <> 'Archived'
                LEFT JOIN grading_configs gc
                       ON gc.faculty_user_id = cs.instructor_user_id
                      AND gc.course_id = cs.course_id
                      AND gc.semester = UPPER(cs.semester)
                      AND gc.school_year = UPPER(cs.school_year)
                LEFT JOIN grading_categories gcat
                       ON gcat.config_id = gc.config_id
                      AND gcat.category_id = a.grading_category_id
                LEFT JOIN grading_category_periods gcp
                       ON gcp.config_id = gc.config_id
                      AND gcp.category_id = a.grading_category_id
                      AND gcp.grading_period = a.grading_period
                LEFT JOIN assessment_scores sc ON sc.assessment_id = a.assessment_id AND sc.student_id = e.student_id
                LEFT JOIN attendance_records linked_att
                       ON linked_att.enrollment_id = e.enrollment_id
                      AND linked_att.session_date = a.attendance_session_date
                      AND linked_att.session_code = a.attendance_session_code
                LEFT JOIN (
                    SELECT enrollment_id,
                           AVG(CASE
                               WHEN status IN ('present', 'excused') THEN 100
                               WHEN status = 'late' THEN 80
                               WHEN status = 'absent' THEN 0
                               ELSE NULL
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
        $sql .= " ORDER BY e.enrollment_id, a.assessment_id";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $results = [];
        $grouped = [];
        foreach ($rows as $row) {
            $enrollmentId = (string) $row['enrollment_id'];
                if (!isset($grouped[$enrollmentId])) {
                    $grouped[$enrollmentId] = [
                        'enrollmentId' => $enrollmentId,
                        'studentId' => (string) $row['student_id'],
                        'csId' => (int) $row['cs_id'],
                        'configId' => $row['config_id'] !== null ? (int) $row['config_id'] : null,
                        'schemaMode' => $row['schema_mode'] !== null ? (string) $row['schema_mode'] : 'overall',
                        'termRatio' => [
                            'midterm' => $row['term_midterm_weight'] !== null ? (float) $row['term_midterm_weight'] : null,
                            'final' => $row['term_final_weight'] !== null ? (float) $row['term_final_weight'] : null,
                        ],
                        'attendanceDateRanges' => [
                            'midterm' => ['startDate' => $row['midterm_start_date'], 'endDate' => $row['midterm_end_date']],
                            'final' => ['startDate' => $row['final_start_date'], 'endDate' => $row['final_end_date']],
                        ],
                        'persistedPercentage' => $row['final_percentage'] !== null ? (float) $row['final_percentage'] : null,
                        'persistedGwa' => $row['final_gwa'] !== null ? (float) $row['final_gwa'] : null,
                        'persistedBreakdown' => $row['grade_components_json'] !== null
                            ? json_decode((string) $row['grade_components_json'], true)
                            : null,
                        'attendancePercentage' => $row['attendance_percentage'] !== null
                            ? (float) $row['attendance_percentage'] : null,
                        'assessments' => [],
                    ];
                }
                if ($row['config_id'] !== null
                    && ($row['assessment_id'] !== null)
                    && ($row['grading_category_id'] === null
                        || $row['grading_category_weight'] === null
                        || ($row['schema_mode'] === 'periods' && $row['period_category_weight'] === null))
                ) {
                    throw new FacultyGradingConfigurationException(
                        sprintf(
                            'Assessment #%s does not have a valid category in the authoritative grading configuration.',
                            $row['assessment_id']
                        ),
                        422,
                        'GRADING_ASSESSMENT_CATEGORY_INVALID'
                    );
                }
                if ($row['assessment_id'] !== null) {
                    $row['_has_score'] = $row['score_id'] !== null;
                    $grouped[$enrollmentId]['assessments'][] = $row;
                }
        }
        $updateWithBreakdown = $pdo->prepare(
            "UPDATE enrollments
             SET final_percentage = ?, final_gwa = ?, retention_state = ?, grade_components_json = ?
             WHERE enrollment_id = ?"
        );
        foreach ($grouped as $group) {
            if ($group['configId'] !== null && $group['schemaMode'] === 'periods') {
                $midterm = faculty_compute_period_result($pdo, $group, 'Midterm');
                $final = faculty_compute_period_result($pdo, $group, 'Final');
                $periodBreakdown = [
                    'calculationMode' => 'authoritative_periods',
                    'termRatio' => $group['termRatio'],
                    'periods' => [
                        'midterm' => $midterm['breakdown'],
                        'final' => $final['breakdown'],
                    ],
                    'retentionThreshold' => $retentionThreshold,
                ];
                $midtermWeight = (float) ($group['termRatio']['midterm'] ?? 0);
                $finalWeight = (float) ($group['termRatio']['final'] ?? 0);
                $midtermRequired = $midtermWeight > 0.0;
                $finalRequired = $finalWeight > 0.0;
                if (($midtermRequired && $midterm['status'] !== 'computed')
                    || ($finalRequired && $final['status'] !== 'computed')) {
                    $results[] = [
                        'status' => 'incomplete_period',
                        'enrollmentId' => $group['enrollmentId'],
                        'studentId' => $group['studentId'],
                        'periods' => [
                            'midterm' => $midterm['breakdown'],
                            'final' => $final['breakdown'],
                        ],
                        'breakdown' => $periodBreakdown,
                        'previouslyPersisted' => $group['persistedPercentage'] !== null,
                        'previousPercentage' => $group['persistedPercentage'],
                        'previousGwa' => $group['persistedGwa'],
                    ];
                    continue;
                }
                $midtermPercentage = $midterm['percentage'] !== null
                    ? (float) $midterm['percentage']
                    : 0.0;
                $finalPercentage = $final['percentage'] !== null
                    ? (float) $final['percentage']
                    : 0.0;
                $percentage = round(
                    ($midtermPercentage * $midtermWeight / 100)
                    + ($finalPercentage * $finalWeight / 100),
                    2
                );
                $gwa = faculty_percentage_to_gwa($percentage);
                $retention = $gwa <= $retentionThreshold
                    ? 'active'
                    : ($gwa <= $warningUpperBound ? 'warning' : 'critical');
                $periodBreakdown['percentage'] = $percentage;
                $periodBreakdown['gwa'] = $gwa;
                $periodBreakdown['retentionState'] = $retention;
                $updateWithBreakdown->execute([
                    $percentage,
                    $gwa,
                    $retention,
                    json_encode($periodBreakdown, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                    $group['enrollmentId'],
                ]);
                $results[] = [
                    'status' => 'computed',
                    'enrollmentId' => $group['enrollmentId'],
                    'studentId' => $group['studentId'],
                    'percentage' => $percentage,
                    'gwa' => $gwa,
                    'retentionState' => $retention,
                    'periods' => [
                        'midterm' => $midterm['breakdown'],
                        'final' => $final['breakdown'],
                    ],
                    'breakdown' => $periodBreakdown,
                ];
                continue;
            }
            if ($group['configId'] !== null) {
                $categoryTotals = [];
                $missingAssessments = [];
                foreach ($group['assessments'] as $assessment) {
                    if (!($assessment['_has_score'] ?? false)) {
                        continue;
                    }
                    $enabled = filter_var($assessment['transmutation_enabled'], FILTER_VALIDATE_BOOLEAN);
                    $effectivePercentage = faculty_effective_assessment_percentage(
                        (float) $assessment['score'],
                        (float) $assessment['max_score'],
                        $enabled,
                        (float) $assessment['transmutation_minimum_percentage'],
                        (float) $assessment['transmutation_maximum_percentage'],
                        $assessment['linked_attendance_status'] !== null
                            ? (string) $assessment['linked_attendance_status'] : null
                    );
                    if ($effectivePercentage === null) {
                        $missingAssessments[] = [
                            'assessmentId' => (string) $assessment['assessment_id'],
                            'attendanceSessionDate' => $assessment['attendance_session_date'],
                            'attendanceSessionCode' => $assessment['attendance_session_code'],
                        ];
                        continue;
                    }
                    $categoryId = (string) $assessment['grading_category_id'];
                    if (!isset($categoryTotals[$categoryId])) {
                        $categoryTotals[$categoryId] = [
                            'categoryId' => (int) $assessment['grading_category_id'],
                            'name' => $assessment['grading_category_name'],
                            'weight' => (float) $assessment['grading_category_weight'],
                            'earnedPoints' => 0.0,
                            'possiblePoints' => 0.0,
                        ];
                    }
                    $categoryTotals[$categoryId]['earnedPoints'] +=
                        ($effectivePercentage / 100) * (float) $assessment['max_score'];
                    $categoryTotals[$categoryId]['possiblePoints'] += (float) $assessment['max_score'];
                }
                if ($missingAssessments !== []) {
                    $results[] = [
                        'status' => 'incomplete_attendance',
                        'enrollmentId' => $group['enrollmentId'],
                        'studentId' => $group['studentId'],
                        'missingAssessments' => $missingAssessments,
                    ];
                    continue;
                }
                if ($categoryTotals === []) {
                    continue;
                }
                $percentage = 0.0;
                $categoryBreakdown = [];
                foreach ($categoryTotals as $category) {
                    if ($category['possiblePoints'] <= 0) {
                        continue;
                    }
                    $ratio = $category['earnedPoints'] / $category['possiblePoints'];
                    $contribution = $ratio * $category['weight'];
                    $percentage += $contribution;
                    $categoryBreakdown[] = [
                        'categoryId' => $category['categoryId'],
                        'name' => $category['name'],
                        'earnedPoints' => round($category['earnedPoints'], 4),
                        'possiblePoints' => round($category['possiblePoints'], 4),
                        'ratio' => round($ratio, 6),
                        'weight' => round($category['weight'], 4),
                        'contribution' => round($contribution, 4),
                    ];
                }
                $percentage = round($percentage, 2);
                $gwa = faculty_percentage_to_gwa($percentage);
                $retention = $gwa <= $retentionThreshold
                    ? 'active'
                    : ($gwa <= $warningUpperBound ? 'warning' : 'critical');
                $breakdown = [
                    'calculationMode' => 'authoritative_categories',
                    'categories' => $categoryBreakdown,
                    'retentionThreshold' => $retentionThreshold,
                ];
                $updateWithBreakdown->execute([
                    $percentage,
                    $gwa,
                    $retention,
                    json_encode($breakdown, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                    $group['enrollmentId'],
                ]);
                $results[] = [
                    'status' => 'computed',
                    'enrollmentId' => $group['enrollmentId'],
                    'studentId' => $group['studentId'],
                    'percentage' => $percentage,
                    'gwa' => $gwa,
                    'retentionState' => $retention,
                    'breakdown' => $breakdown,
                ];
                continue;
            }

            $weightedPoints = 0.0;
            $completedWeight = 0.0;
            $missingAssessments = [];
            foreach ($group['assessments'] as $assessment) {
                if (!($assessment['_has_score'] ?? false)) {
                    continue;
                }
                $enabled = filter_var($assessment['transmutation_enabled'], FILTER_VALIDATE_BOOLEAN);
                $effectivePercentage = faculty_effective_assessment_percentage(
                    (float) $assessment['score'],
                    (float) $assessment['max_score'],
                    $enabled,
                    (float) $assessment['transmutation_minimum_percentage'],
                    (float) $assessment['transmutation_maximum_percentage'],
                    $assessment['linked_attendance_status'] !== null
                        ? (string) $assessment['linked_attendance_status'] : null
                );
                if ($effectivePercentage === null) {
                    $missingAssessments[] = [
                        'assessmentId' => (string) $assessment['assessment_id'],
                        'attendanceSessionDate' => $assessment['attendance_session_date'],
                        'attendanceSessionCode' => $assessment['attendance_session_code'],
                    ];
                    continue;
                }
                $weight = (float) ($assessment['weight'] ?? 0);
                $weightedPoints += ($effectivePercentage / 100) * $weight;
                $completedWeight += $weight;
            }
            if ($missingAssessments !== []) {
                $results[] = [
                    'status' => 'incomplete_attendance',
                    'enrollmentId' => $group['enrollmentId'],
                    'studentId' => $group['studentId'],
                    'missingAssessments' => $missingAssessments,
                ];
                continue;
            }
            if ($completedWeight <= 0) {
                continue;
            }
            $assessmentPercentage = ($weightedPoints / $completedWeight) * 100;
            $hasAttendance = $group['attendancePercentage'] !== null;
            $effectiveAttendanceWeight = $hasAttendance ? $attendanceWeight : 0.0;
            $assessmentWeight = 100.0 - $effectiveAttendanceWeight;
            $attendancePercentage = $hasAttendance ? (float) $group['attendancePercentage'] : null;
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
            $updateWithBreakdown->execute([
                $percentage,
                $gwa,
                $retention,
                json_encode($breakdown, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                $group['enrollmentId'],
            ]);
            $results[] = [
                'status' => 'computed',
                'enrollmentId' => $group['enrollmentId'],
                'studentId' => $group['studentId'],
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
    } catch (FacultyGradingConfigurationException $e) {
        if ($pdo instanceof PDO && $pdo->inTransaction()) {
            $pdo->rollBack();
        }
        faculty_grading_configuration_error($e);
    } catch (\Throwable $e) {
        if ($pdo instanceof PDO && $pdo->inTransaction()) { $pdo->rollBack(); }
        error_log('Faculty grades compute error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

function faculty_attendance_error_response(string $message, int $statusCode, string $code): void
{
    emit_response(build_error_response($message, $statusCode, $code));
}

function faculty_attendance_query_value(array $query, string $field): ?string
{
    if (!array_key_exists($field, $query) || !is_scalar($query[$field])) {
        return null;
    }

    $value = trim((string) $query[$field]);
    return $value === '' ? null : $value;
}

function faculty_attendance_positive_int(mixed $value): ?int
{
    if (is_int($value) && $value > 0) {
        return $value;
    }
    if (is_string($value) && ctype_digit($value) && (int) $value > 0) {
        return (int) $value;
    }
    if (is_float($value) && is_finite($value) && $value > 0 && floor($value) === $value) {
        return (int) $value;
    }
    return null;
}

function faculty_attendance_validate_date(string $value, array $config, string $field = 'date'): string
{
    $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value, new DateTimeZone('UTC'));
    $errors = DateTimeImmutable::getLastErrors();
    if (!$date
        || ($errors !== false && ($errors['warning_count'] > 0 || $errors['error_count'] > 0))
        || $date->format('Y-m-d') !== $value
    ) {
        throw new ValidationException([[
            'field' => $field,
            'message' => 'Worksheet date must be a valid YYYY-MM-DD date.',
        ]]);
    }

    $today = app_local_date($config, new DateTimeImmutable('now', new DateTimeZone('UTC')));
    if ($value > $today) {
        throw new ValidationException([[
            'field' => $field,
            'message' => 'Worksheet date cannot be in the future.',
        ]]);
    }

    return $value;
}

function faculty_attendance_session_payload(?array $session): ?array
{
    if ($session === null) {
        return null;
    }

    return [
        'sessionId' => (string) $session['session_id'],
        'classId' => (string) $session['cs_id'],
        'sessionDate' => $session['session_date'],
        'sessionCode' => $session['session_code'],
        'room' => $session['room'],
        'status' => $session['status'],
        'startedAt' => $session['started_at'],
        'endedAt' => $session['ended_at'],
        'geofenceEnabled' => (bool) $session['geofence_enabled'],
        'geofenceRadiusMeters' => $session['geofence_radius_meters'] !== null ? (float) $session['geofence_radius_meters'] : null,
        'biometricRequired' => (bool) $session['biometric_required'],
        'openingTime' => $session['opening_time'] !== null ? substr((string) $session['opening_time'], 0, 5) : null,
        'presentCutoff' => $session['present_cutoff_time'] !== null ? substr((string) $session['present_cutoff_time'], 0, 5) : null,
        'lateCutoff' => $session['late_cutoff_time'] !== null ? substr((string) $session['late_cutoff_time'], 0, 5) : null,
        'timingConfigured' => $session['opening_time'] !== null && $session['present_cutoff_time'] !== null && $session['late_cutoff_time'] !== null,
        'revokedAt' => $session['revoked_at'] ?? null,
        'revocationReason' => $session['revocation_reason'] ?? null,
    ];
}

function faculty_attendance_record_payload(array $row): array
{
    return [
        'id' => $row['record_id'] !== null ? (string) $row['record_id'] : null,
        'enrollmentId' => (string) $row['enrollment_id'],
        'studentId' => (string) $row['student_id'],
        'studentNumber' => $row['student_number'],
        'studentName' => trim(implode(' ', array_filter([
            $row['first_name'] ?? null,
            $row['middle_name'] ?? null,
            $row['last_name'] ?? null,
        ], static fn(mixed $part): bool => $part !== null && trim((string) $part) !== ''))),
        'date' => $row['session_date'],
        'sessionCode' => $row['session_code'],
        'attendanceSessionId' => $row['attendance_session_id'] !== null ? (string) $row['attendance_session_id'] : null,
        'status' => $row['status'],
        'verificationMethod' => $row['verification_method'],
        'timeRecorded' => $row['time_recorded'],
        'overrideReason' => $row['override_reason'],
        'overrideAt' => $row['override_at'],
    ];
}

function handle_faculty_attendance_get(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = faculty_verify_auth($pdo, $config);
        $query = is_array($_GET ?? null) ? $_GET : [];
        $hasWorksheetQuery = array_key_exists('csId', $query)
            || array_key_exists('date', $query)
            || array_key_exists('sessionId', $query);

        if (!$hasWorksheetQuery) {
            $stmt = $pdo->prepare(
                "SELECT r.record_id, r.attendance_session_id, r.session_date, r.session_code, r.status, r.verification_method,
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
                'attendanceSessionId' => $row['attendance_session_id'] !== null ? (string) $row['attendance_session_id'] : null,
                'studentId' => (string) $row['student_id'],
                'studentNumber' => $row['student_number'],
                'date' => $row['session_date'],
                'sessionCode' => $row['session_code'],
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
            return;
        }

        $csId = faculty_attendance_positive_int(faculty_attendance_query_value($query, 'csId'));
        $dateValue = faculty_attendance_query_value($query, 'date');
        if ($csId === null || $dateValue === null) {
            faculty_attendance_error_response('csId and date are required for a worksheet read.', 422, 'VALIDATION_ERROR');
            return;
        }
        $worksheetDate = faculty_attendance_validate_date($dateValue, $config);
        $sessionId = faculty_attendance_positive_int(faculty_attendance_query_value($query, 'sessionId'));
        if (array_key_exists('sessionId', $query) && $sessionId === null) {
            faculty_attendance_error_response('sessionId must be a positive integer when supplied.', 422, 'VALIDATION_ERROR');
            return;
        }

        $classStmt = $pdo->prepare(
            "SELECT cs.cs_id, cs.cs_name, cs.course_id, cs.block, cs.semester, cs.school_year, cs.status,
                    c.course_code, c.name AS course_name, c.units
             FROM class_sections cs
             JOIN courses c ON c.course_id = cs.course_id
             WHERE cs.cs_id = ? AND cs.instructor_user_id = ?"
        );
        $classStmt->execute([$csId, $authCtx['user_id']]);
        $class = $classStmt->fetch(PDO::FETCH_ASSOC);
        if (!is_array($class)) {
            faculty_attendance_error_response('Class section is not assigned to this Faculty member.', 403, 'FACULTY_SECTION_ACCESS_DENIED');
            return;
        }

        $sessionStmt = $pdo->prepare(
            "SELECT session_id, cs_id, session_date, session_code, room, status, started_at, ended_at,
                    geofence_enabled, geofence_radius_meters, biometric_required,
                    opening_time, present_cutoff_time, late_cutoff_time, revoked_at,
                    revocation_reason
             FROM attendance_sessions
             WHERE cs_id = ? AND session_date = ?
             ORDER BY started_at ASC, session_id ASC"
        );
        $sessionStmt->execute([$csId, $worksheetDate]);
        $matchingSessions = $sessionStmt->fetchAll(PDO::FETCH_ASSOC);
        $selectedSession = null;
        if ($sessionId !== null) {
            foreach ($matchingSessions as $matchingSession) {
                if ((int) $matchingSession['session_id'] === $sessionId) {
                    $selectedSession = $matchingSession;
                    break;
                }
            }
            if ($selectedSession === null) {
                faculty_attendance_error_response('Attendance session was not found for this class and date.', 404, 'ATTENDANCE_SESSION_NOT_FOUND');
                return;
            }
        } elseif (count($matchingSessions) === 1) {
            // A single session is unambiguous and remains compatible with the
            // previous response shape. Multiple sessions are never collapsed.
            $selectedSession = $matchingSessions[0];
        }

        if ($sessionId !== null) {
            $rosterStmt = $pdo->prepare(
                "SELECT e.enrollment_id, s.student_id, s.student_number, s.first_name, s.middle_name, s.last_name,
                        r.record_id, r.session_date, r.session_code, r.attendance_session_id, r.status,
                        r.verification_method, r.time_recorded, r.override_reason, r.override_at
                 FROM enrollments e
                 JOIN students s ON s.student_id = e.student_id
                 LEFT JOIN attendance_records r
                   ON r.enrollment_id = e.enrollment_id
                  AND r.attendance_session_id = ?
                  AND r.session_date = ?
                 WHERE e.cs_id = ? AND LOWER(e.status) = 'active'
                 ORDER BY s.last_name, s.first_name, e.enrollment_id"
            );
            $rosterStmt->execute([$sessionId, $worksheetDate, $csId]);
        } elseif ($selectedSession !== null) {
            $rosterStmt = $pdo->prepare(
                "SELECT e.enrollment_id, s.student_id, s.student_number, s.first_name, s.middle_name, s.last_name,
                        r.record_id, r.session_date, r.session_code, r.attendance_session_id, r.status,
                        r.verification_method, r.time_recorded, r.override_reason, r.override_at
                 FROM enrollments e
                 JOIN students s ON s.student_id = e.student_id
                 LEFT JOIN LATERAL (
                     SELECT r.record_id, r.session_date, r.session_code, r.attendance_session_id, r.status,
                            r.verification_method, r.time_recorded, r.override_reason, r.override_at
                     FROM attendance_records r
                     WHERE r.enrollment_id = e.enrollment_id
                       AND r.session_date = ?
                       AND (r.attendance_session_id = ? OR r.attendance_session_id IS NULL)
                     ORDER BY CASE WHEN r.attendance_session_id = ? THEN 0 ELSE 1 END, r.record_id DESC
                     LIMIT 1
                 ) r ON TRUE
                 WHERE e.cs_id = ? AND LOWER(e.status) = 'active'
                 ORDER BY s.last_name, s.first_name, e.enrollment_id"
            );
            $rosterStmt->execute([$worksheetDate, (int) $selectedSession['session_id'], (int) $selectedSession['session_id'], $csId]);
        } else {
            $rosterStmt = $pdo->prepare(
                "SELECT e.enrollment_id, s.student_id, s.student_number, s.first_name, s.middle_name, s.last_name,
                        r.record_id, r.session_date, r.session_code, r.attendance_session_id, r.status,
                        r.verification_method, r.time_recorded, r.override_reason, r.override_at
                 FROM enrollments e
                 JOIN students s ON s.student_id = e.student_id
                 LEFT JOIN LATERAL (
                     SELECT r.record_id, r.session_date, r.session_code, r.attendance_session_id, r.status,
                            r.verification_method, r.time_recorded, r.override_reason, r.override_at
                     FROM attendance_records r
                     WHERE r.enrollment_id = e.enrollment_id AND r.session_date = ?
                     ORDER BY r.record_id DESC
                     LIMIT 1
                 ) r ON TRUE
                 WHERE e.cs_id = ? AND LOWER(e.status) = 'active'
                 ORDER BY s.last_name, s.first_name, e.enrollment_id"
            );
            $rosterStmt->execute([$worksheetDate, $csId]);
        }

        $roster = array_map(
            static function (array $row) use ($worksheetDate): array {
                if ($row['session_date'] === null) {
                    $row['session_date'] = $worksheetDate;
                }
                return faculty_attendance_record_payload($row);
            },
            $rosterStmt->fetchAll(PDO::FETCH_ASSOC)
        );
        json_response([
            'status' => 'ok',
            'worksheet' => [
                'classSection' => [
                    'id' => (string) $class['cs_id'],
                    'name' => $class['cs_name'],
                    'block' => $class['block'],
                    'semester' => $class['semester'],
                    'schoolYear' => $class['school_year'],
                    'status' => $class['status'],
                ],
                'course' => [
                    'id' => (int) $class['course_id'],
                    'code' => $class['course_code'],
                    'name' => $class['course_name'],
                    'units' => (float) $class['units'],
                ],
                'date' => $worksheetDate,
                'attendanceSession' => $selectedSession !== null
                    ? faculty_attendance_session_payload($selectedSession)
                    : null,
                'attendanceSessions' => array_map(
                    static fn(array $matchingSession): array => faculty_attendance_session_payload($matchingSession),
                    $matchingSessions
                ),
                'roster' => $roster,
            ],
        ], 200);
    } catch (ValidationException $e) {
        validation_error_response($e->getErrors());
    } catch (\Throwable $e) {
        error_log('Faculty attendance get error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

function handle_faculty_attendance_session_create(): void
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
        $requestedCsId = faculty_attendance_positive_int($data['csId'] ?? ($data['classSectionId'] ?? null));
        $subjectCode = strtoupper(trim((string) ($data['subjectCode'] ?? '')));
        $today = app_local_date($config, attendance_session_now_utc());
        $sessionDate = trim((string) ($data['sessionDate'] ?? ($data['date'] ?? $today)));
        $sessionDate = faculty_attendance_validate_date($sessionDate, $config, 'sessionDate');
        $classStmt = $pdo->prepare(
            "SELECT cs.cs_id, cs.secretary_user_id
               FROM class_sections cs
               JOIN courses c ON c.course_id = cs.course_id
              WHERE cs.instructor_user_id = ?
                AND (cs.cs_id = ? OR (? <> '' AND UPPER(c.course_code) = ?))
                AND LOWER(cs.status) = 'active'
              ORDER BY cs.cs_id LIMIT 1"
        );
        $classStmt->execute([$authCtx['user_id'], $requestedCsId ?? 0, $subjectCode, $subjectCode]);
        $class = $classStmt->fetch(PDO::FETCH_ASSOC);
        if (!is_array($class)) {
            safe_error_response('Class section is not assigned to this faculty member.', 403);
            return;
        }
        $csId = (int) $class['cs_id'];
        [$openingTime, $presentCutoff, $lateCutoff] = attendance_session_timing_from_request($data);
        $room = array_key_exists('room', $data) && trim((string) $data['room']) !== ''
            ? validate_required_string($data, 'room', 1, 255)
            : null;
        $biometricRequired = attendance_session_request_bool($data, 'biometricRequired', false);
        attendance_session_require_timing_for_biometric(
            $biometricRequired,
            $openingTime,
            $presentCutoff,
            $lateCutoff
        );
        $geofenceEnabled = attendance_session_request_bool($data, 'geofenceEnabled', $biometricRequired);
        $latitude = attendance_session_request_float($data, 'geofenceLatitude', -90, 90);
        $longitude = attendance_session_request_float($data, 'geofenceLongitude', -180, 180);
        $radius = attendance_session_request_float($data, 'geofenceRadiusMeters', 0.01, null);
        if (($latitude === null) !== ($longitude === null)) {
            throw new ValidationException([['field' => 'geofenceLatitude', 'message' => 'Geofence latitude and longitude must be provided together.']]);
        }
        if ($geofenceEnabled && $radius === null) {
            $radius = 100.0;
        }
        $sessionCode = trim((string) ($data['sessionCode'] ?? ''));
        if ($sessionCode === '') {
            $sessionCode = attendance_session_code($csId, $sessionDate);
        }
        if (strlen($sessionCode) > 100) {
            throw new ValidationException([['field' => 'sessionCode', 'message' => 'Session code must not exceed 100 characters.']]);
        }
        $now = attendance_session_now_utc();
        $nowSql = $now->format('Y-m-d H:i:s.u');

        $pdo->beginTransaction();
        try {
            $lock = $pdo->prepare("SELECT cs_id, secretary_user_id FROM class_sections WHERE cs_id = ? AND instructor_user_id = ? AND LOWER(status) = 'active' FOR UPDATE");
            $lock->execute([$csId, $authCtx['user_id']]);
            $lockedClass = $lock->fetch(PDO::FETCH_ASSOC);
            if (!is_array($lockedClass)) {
                $pdo->rollBack();
                safe_error_response('Class section is not assigned to this Faculty member.', 403);
                return;
            }
            $active = $pdo->prepare("SELECT 1 FROM attendance_sessions WHERE cs_id = ? AND status = 'active' FOR UPDATE");
            $active->execute([$csId]);
            if ($active->fetchColumn() !== false) {
                $pdo->rollBack();
                safe_error_response('An active attendance session already exists for this class section.', 409);
                return;
            }
            $secretaryUserId = $lockedClass['secretary_user_id'] !== null
                ? (int) $lockedClass['secretary_user_id']
                : (int) $authCtx['user_id'];
            $insert = $pdo->prepare(
                "INSERT INTO attendance_sessions (
                    cs_id, secretary_user_id, owner_user_id, session_date, session_code, room,
                    started_at, status, geofence_enabled, geofence_latitude, geofence_longitude,
                    geofence_radius_meters, biometric_required, opening_time, present_cutoff_time,
                    late_cutoff_time, created_at, updated_at
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 RETURNING session_id"
            );
            $insert->execute([
                $csId, $secretaryUserId, $authCtx['user_id'], $sessionDate, $sessionCode, $room,
                $nowSql, $geofenceEnabled, $latitude, $longitude, $radius, $biometricRequired,
                $openingTime, $presentCutoff, $lateCutoff, $nowSql, $nowSql,
            ]);
            $sessionId = (int) $insert->fetchColumn();
            attendance_session_record_audit(
                $pdo, $config, $authCtx, $context, 'attendance_session_created', $sessionId, $csId,
                "Created attendance session '{$sessionCode}' for class section #{$csId}.", null, null,
                ['session_id' => $sessionId, 'cs_id' => $csId, 'session_date' => $sessionDate, 'status' => 'active', 'opening_time' => $openingTime, 'present_cutoff_time' => $presentCutoff, 'late_cutoff_time' => $lateCutoff]
            );
            $pdo->commit();
        } catch (PDOException $e) {
            if ($pdo->inTransaction()) { $pdo->rollBack(); }
            if (($e->errorInfo[0] ?? (string) $e->getCode()) === '23505') {
                safe_error_response('An active attendance session or duplicate session code already exists for this class section.', 409);
                return;
            }
            throw $e;
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) { $pdo->rollBack(); }
            throw $e;
        }

        $session = attendance_session_fetch_for_manager($pdo, (int) $authCtx['user_id'], 'faculty', $sessionId);
        json_response(['status' => 'ok', 'session' => attendance_session_map($session ?? [], true)], 201);
    } catch (ValidationException $e) {
        validation_error_response($e->getErrors());
    } catch (\Throwable $e) {
        error_log('Faculty attendance session create error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

function handle_faculty_attendance_session_revoke(): void
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
        $sessionId = faculty_attendance_positive_int($body['data']['sessionId'] ?? null);
        $reason = array_key_exists('reason', $body['data']) ? trim((string) $body['data']['reason']) : null;
        if ($sessionId === null) {
            throw new ValidationException([['field' => 'sessionId', 'message' => 'A valid attendance session ID is required.']]);
        }
        if ($reason !== null && strlen($reason) > 500) {
            throw new ValidationException([['field' => 'reason', 'message' => 'Reason must not exceed 500 characters.']]);
        }
        $now = attendance_session_now_utc();
        $nowSql = $now->format('Y-m-d H:i:s.u');
        $pdo->beginTransaction();
        try {
            $session = attendance_session_fetch_for_manager($pdo, (int) $authCtx['user_id'], 'faculty', $sessionId, true);
            if ($session === null) {
                $pdo->rollBack();
                safe_error_response('Attendance session was not found in an assigned class.', 404);
                return;
            }
            if (strtolower((string) $session['status']) !== 'active') {
                $pdo->rollBack();
                safe_error_response('Attendance session is not active.', 409);
                return;
            }
            $update = $pdo->prepare(
                "UPDATE attendance_sessions
                    SET status = 'revoked', revoked_at = ?, revoked_by_user_id = ?,
                        revocation_reason = ?, updated_at = ?
                  WHERE session_id = ? AND status = 'active'"
            );
            $update->execute([$nowSql, $authCtx['user_id'], $reason, $nowSql, $sessionId]);
            attendance_session_record_audit(
                $pdo, $config, $authCtx, $context, 'attendance_session_revoked', $sessionId, (int) $session['cs_id'],
                "Revoked attendance session '{$session['session_code']}' for class section #{$session['cs_id']}.", $reason,
                ['session_id' => $sessionId, 'status' => 'active'],
                ['session_id' => $sessionId, 'status' => 'revoked', 'revoked_at' => $nowSql]
            );
            $pdo->commit();
            $session['status'] = 'revoked';
            $session['revoked_at'] = $nowSql;
            $session['revoked_by_user_id'] = $authCtx['user_id'];
            $session['revocation_reason'] = $reason;
            $session['updated_at'] = $nowSql;
            json_response(['status' => 'ok', 'session' => attendance_session_map($session, true)], 200);
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) { $pdo->rollBack(); }
            throw $e;
        }
    } catch (ValidationException $e) {
        validation_error_response($e->getErrors());
    } catch (Throwable $e) {
        error_log('Faculty attendance session revoke error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

function handle_faculty_attendance_session_end(): void
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
        $sessionId = faculty_attendance_positive_int($body['data']['sessionId'] ?? null);
        if ($sessionId === null) {
            throw new ValidationException([['field' => 'sessionId', 'message' => 'A valid attendance session ID is required.']]);
        }

        $now = attendance_session_now_utc();
        $nowSql = $now->format('Y-m-d H:i:s.u');
        $pdo->beginTransaction();
        try {
            $session = attendance_session_fetch_for_manager($pdo, (int) $authCtx['user_id'], 'faculty', $sessionId, true);
            if ($session === null) {
                $pdo->rollBack();
                safe_error_response('Attendance session was not found in an assigned class.', 404);
                return;
            }
            if (strtolower((string) $session['status']) !== 'active') {
                $pdo->rollBack();
                safe_error_response('Attendance session has already concluded.', 409);
                return;
            }
            $update = $pdo->prepare(
                "UPDATE attendance_sessions
                    SET status = 'ended', ended_at = ?, updated_at = ?
                  WHERE session_id = ? AND status = 'active'"
            );
            $update->execute([$nowSql, $nowSql, $sessionId]);
            if ($update->rowCount() !== 1) {
                $pdo->rollBack();
                safe_error_response('Attendance session could not be ended.', 409);
                return;
            }
            $resolvedAbsentCount = attendance_session_resolve_absences($pdo, $sessionId, $now);
            attendance_session_record_audit(
                $pdo, $config, $authCtx, $context, 'attendance_session_ended', $sessionId, (int) $session['cs_id'],
                "Ended attendance session '{$session['session_code']}' for class section #{$session['cs_id']}.", null,
                ['session_id' => $sessionId, 'status' => 'active'],
                ['session_id' => $sessionId, 'status' => 'ended', 'ended_at' => $nowSql, 'resolved_absent_count' => $resolvedAbsentCount]
            );
            $pdo->commit();
            $session['status'] = 'ended';
            $session['ended_at'] = $nowSql;
            $session['updated_at'] = $nowSql;
            json_response(['status' => 'ok', 'session' => attendance_session_map($session, true)], 200);
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) { $pdo->rollBack(); }
            throw $e;
        }
    } catch (ValidationException $e) {
        validation_error_response($e->getErrors());
    } catch (Throwable $e) {
        error_log('Faculty attendance session end error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

function handle_faculty_attendance_override(): void
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
        if (!is_array($data)) {
            faculty_attendance_error_response('Request body must be a JSON object.', 422, 'VALIDATION_ERROR');
            return;
        }

        $recordId = faculty_attendance_positive_int($data['recordId'] ?? null) ?? 0;
        $csId = faculty_attendance_positive_int($data['csId'] ?? null);
        $enrollmentId = faculty_attendance_positive_int($data['enrollmentId'] ?? null);
        $studentId = faculty_attendance_positive_int($data['studentId'] ?? null);
        $status = $data['status'] ?? null;
        $reason = null;
        if (array_key_exists('reason', $data)) {
            if (!is_string($data['reason'])) {
                faculty_attendance_error_response('Reason must be a string when supplied.', 422, 'VALIDATION_ERROR');
                return;
            }
            $reason = trim($data['reason']);
            if (strlen($reason) > 500) {
                faculty_attendance_error_response('Reason must not exceed 500 characters.', 422, 'VALIDATION_ERROR');
                return;
            }
        }
        if (!is_string($status) || !in_array($status, ['present', 'absent', 'late', 'excused'], true)) {
            faculty_attendance_error_response('Status must be one of: present, absent, late, excused.', 422, 'VALIDATION_ERROR');
            return;
        }

        $rawDate = null;
        if (array_key_exists('sessionDate', $data)) {
            $rawDate = $data['sessionDate'];
        } elseif (array_key_exists('date', $data)) {
            $rawDate = $data['date'];
        }
        if ($rawDate !== null && !is_string($rawDate)) {
            faculty_attendance_error_response('sessionDate must be a YYYY-MM-DD string.', 422, 'VALIDATION_ERROR');
            return;
        }
        $requestedDate = $rawDate !== null ? faculty_attendance_validate_date(trim($rawDate), $config, 'sessionDate') : null;
        $requestedSessionId = null;
        $sessionIdProvided = array_key_exists('sessionId', $data) || array_key_exists('attendanceSessionId', $data);
        $sessionValue = array_key_exists('sessionId', $data)
            ? $data['sessionId']
            : ($data['attendanceSessionId'] ?? null);
        if ($sessionIdProvided) {
            $requestedSessionId = faculty_attendance_positive_int($sessionValue);
            if ($requestedSessionId === null) {
                faculty_attendance_error_response('sessionId must be a positive integer when supplied.', 422, 'VALIDATION_ERROR');
                return;
            }
            if (array_key_exists('sessionId', $data) && array_key_exists('attendanceSessionId', $data)
                && faculty_attendance_positive_int($data['attendanceSessionId']) !== $requestedSessionId
            ) {
                faculty_attendance_error_response('sessionId and attendanceSessionId must identify the same session.', 422, 'VALIDATION_ERROR');
                return;
            }
        }

        $pdo->beginTransaction();
        $target = null;
        $created = false;

        if ($recordId > 0) {
            $recordStmt = $pdo->prepare(
                "SELECT r.record_id, r.enrollment_id, r.session_date, r.session_code, r.attendance_session_id,
                        r.status, r.verification_method, r.time_recorded, r.override_reason, r.override_at,
                        e.student_id, e.cs_id, s.student_number, s.first_name, s.middle_name, s.last_name,
                        cs.cs_name, cs.instructor_user_id, c.course_code
                 FROM attendance_records r
                 JOIN enrollments e ON e.enrollment_id = r.enrollment_id
                 JOIN students s ON s.student_id = e.student_id
                 JOIN class_sections cs ON cs.cs_id = e.cs_id
                 JOIN courses c ON c.course_id = cs.course_id
                 WHERE r.record_id = ?
                 FOR UPDATE"
            );
            $recordStmt->execute([$recordId]);
            $target = $recordStmt->fetch(PDO::FETCH_ASSOC) ?: null;
            if ($target === null) {
                $pdo->rollBack();
                faculty_attendance_error_response('Attendance record was not found.', 404, 'ATTENDANCE_RECORD_NOT_FOUND');
                return;
            }
            if ((int) $target['instructor_user_id'] !== (int) $authCtx['user_id']) {
                $pdo->rollBack();
                faculty_attendance_error_response('Attendance record is not in a class assigned to this Faculty member.', 403, 'FACULTY_SECTION_ACCESS_DENIED');
                return;
            }
            if ($csId !== null && $csId !== (int) $target['cs_id']) {
                $pdo->rollBack();
                faculty_attendance_error_response('Attendance record does not belong to the selected class section.', 422, 'ATTENDANCE_RECORD_MISMATCH');
                return;
            }
            if ($enrollmentId !== null && $enrollmentId !== (int) $target['enrollment_id']) {
                $pdo->rollBack();
                faculty_attendance_error_response('Attendance record does not belong to the selected enrollment.', 422, 'ATTENDANCE_RECORD_MISMATCH');
                return;
            }
            if ($studentId !== null && $studentId !== (int) $target['student_id']) {
                $pdo->rollBack();
                faculty_attendance_error_response('Attendance record does not belong to the selected Student.', 422, 'ATTENDANCE_RECORD_MISMATCH');
                return;
            }
            if ($requestedDate !== null && $requestedDate !== (string) $target['session_date']) {
                $pdo->rollBack();
                faculty_attendance_error_response('Attendance record does not belong to the selected worksheet date.', 422, 'ATTENDANCE_RECORD_MISMATCH');
                return;
            }
            $requestedDate = faculty_attendance_validate_date((string) $target['session_date'], $config, 'sessionDate');
            $csId = (int) $target['cs_id'];
            $enrollmentId = (int) $target['enrollment_id'];
            $studentId = (int) $target['student_id'];
        } else {
            if ($csId === null || $requestedDate === null || ($enrollmentId === null && $studentId === null)) {
                $pdo->rollBack();
                faculty_attendance_error_response('csId, sessionDate, and enrollmentId or studentId are required when creating attendance.', 422, 'VALIDATION_ERROR');
                return;
            }

            $classOwnerStmt = $pdo->prepare(
                'SELECT 1 FROM class_sections WHERE cs_id = ? AND instructor_user_id = ?'
            );
            $classOwnerStmt->execute([$csId, $authCtx['user_id']]);
            if (!$classOwnerStmt->fetchColumn()) {
                $pdo->rollBack();
                faculty_attendance_error_response('Class section is not assigned to this Faculty member.', 403, 'FACULTY_SECTION_ACCESS_DENIED');
                return;
            }

            $enrollmentSql =
                "SELECT e.enrollment_id, e.student_id, e.cs_id, s.student_number, s.first_name, s.middle_name, s.last_name,
                        cs.cs_name, cs.instructor_user_id, c.course_code
                 FROM enrollments e
                 JOIN students s ON s.student_id = e.student_id
                 JOIN class_sections cs ON cs.cs_id = e.cs_id
                 JOIN courses c ON c.course_id = cs.course_id
                 WHERE e.cs_id = ? AND cs.instructor_user_id = ?";
            $enrollmentParams = [$csId, $authCtx['user_id']];
            if ($enrollmentId !== null) {
                $enrollmentSql .= ' AND e.enrollment_id = ?';
                $enrollmentParams[] = $enrollmentId;
            } else {
                $enrollmentSql .= ' AND e.student_id = ?';
                $enrollmentParams[] = $studentId;
            }
            $enrollmentSql .= " AND LOWER(e.status) = 'active' FOR UPDATE";
            $enrollmentStmt = $pdo->prepare($enrollmentSql);
            $enrollmentStmt->execute($enrollmentParams);
            $enrollment = $enrollmentStmt->fetch(PDO::FETCH_ASSOC) ?: null;
            if ($enrollment === null) {
                $pdo->rollBack();
                faculty_attendance_error_response('Student enrollment was not found in the selected class section.', 404, 'ENROLLMENT_NOT_FOUND');
                return;
            }
            if ($studentId !== null && $studentId !== (int) $enrollment['student_id']) {
                $pdo->rollBack();
                faculty_attendance_error_response('The selected Student does not match the enrollment.', 422, 'ENROLLMENT_MISMATCH');
                return;
            }
            $target = array_merge($enrollment, [
                'record_id' => null,
                'session_date' => $requestedDate,
                'session_code' => null,
                'attendance_session_id' => null,
                'status' => null,
                'verification_method' => null,
                'time_recorded' => null,
                'override_reason' => null,
                'override_at' => null,
            ]);

            $existingSql =
                "SELECT r.record_id, r.session_date, r.session_code, r.attendance_session_id, r.status,
                        r.verification_method, r.time_recorded, r.override_reason, r.override_at
                 FROM attendance_records r
                 WHERE r.enrollment_id = ? AND r.session_date = ?";
            $existingParams = [(int) $enrollment['enrollment_id'], $requestedDate];
            if ($requestedSessionId !== null) {
                $existingSql .= ' AND (r.attendance_session_id = ? OR r.attendance_session_id IS NULL)';
                $existingParams[] = $requestedSessionId;
                $existingSql .= ' ORDER BY CASE WHEN r.attendance_session_id = ? THEN 0 ELSE 1 END, r.record_id DESC';
                $existingParams[] = $requestedSessionId;
            } else {
                $existingSql .= ' ORDER BY r.record_id DESC';
            }
            $existingSql .= ' LIMIT 1 FOR UPDATE';
            $existingStmt = $pdo->prepare($existingSql);
            $existingStmt->execute($existingParams);
            $existing = $existingStmt->fetch(PDO::FETCH_ASSOC) ?: null;
            if ($existing !== null) {
                $target = array_merge($target, $existing);
                $recordId = (int) $existing['record_id'];
            }
        }

        if ($requestedSessionId !== null) {
            $sessionStmt = $pdo->prepare(
                "SELECT session_id, cs_id, session_date, session_code
                 FROM attendance_sessions
                 WHERE session_id = ? AND cs_id = ? AND session_date = ?"
            );
            $sessionStmt->execute([$requestedSessionId, $csId, $requestedDate]);
            $requestedSession = $sessionStmt->fetch(PDO::FETCH_ASSOC) ?: null;
            if ($requestedSession === null) {
                $pdo->rollBack();
                faculty_attendance_error_response('Attendance session does not belong to the selected class and date.', 422, 'ATTENDANCE_SESSION_MISMATCH');
                return;
            }
            if ($target['record_id'] !== null
                && $target['attendance_session_id'] !== null
                && (int) $target['attendance_session_id'] !== $requestedSessionId
            ) {
                $pdo->rollBack();
                faculty_attendance_error_response('Existing attendance session linkage cannot be reassigned.', 409, 'ATTENDANCE_SESSION_MISMATCH');
                return;
            }
        }

        $beforeState = $target['record_id'] !== null ? [
            'recordId' => (int) $target['record_id'],
            'enrollmentId' => (int) $target['enrollment_id'],
            'studentId' => (int) $target['student_id'],
            'studentNumber' => $target['student_number'],
            'csId' => (int) $target['cs_id'],
            'className' => $target['cs_name'],
            'courseCode' => $target['course_code'],
            'sessionDate' => $target['session_date'],
            'attendanceSessionId' => $target['attendance_session_id'] !== null ? (int) $target['attendance_session_id'] : null,
            'sessionCode' => $target['session_code'],
            'status' => $target['status'],
        ] : null;
        $hasPersistedStatus = $target['record_id'] !== null && $target['status'] !== null;
        if ($hasPersistedStatus && (string) $target['status'] === $status) {
            $recordIdValue = (string) $target['record_id'];
            $sessionIdValue = $target['attendance_session_id'] !== null
                ? (string) $target['attendance_session_id']
                : null;
            $pdo->rollBack();
            json_response([
                'status' => 'ok',
                'message' => 'Attendance record is unchanged.',
                'operation' => 'unchanged',
                'changed' => false,
                'recordId' => $recordIdValue,
                'attendanceSessionId' => $sessionIdValue,
            ], 200);
            return;
        }
        if ($hasPersistedStatus && ($reason === null || $reason === '')) {
            $pdo->rollBack();
            faculty_attendance_error_response('A non-empty reason is required when changing an existing attendance status.', 422, 'VALIDATION_ERROR');
            return;
        }
        $nowSql = (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d H:i:s.u');

        if ($target['record_id'] === null) {
            $sessionCode = null;
            if ($requestedSessionId !== null) {
                $sessionCode = $requestedSession['session_code'];
            }
            $insert = $pdo->prepare(
                "INSERT INTO attendance_records
                    (enrollment_id, attendance_session_id, session_date, session_code, status,
                     verification_method, time_recorded, override_reason, override_by_user_id, override_at)
                 VALUES (?, ?, ?, ?, ?, 'manual_faculty', ?, ?, ?, ?)
                 RETURNING record_id"
            );
            $insert->execute([
                (int) $target['enrollment_id'],
                $requestedSessionId,
                $requestedDate,
                $sessionCode,
                $status,
                $nowSql,
                $reason,
                (int) $authCtx['user_id'],
                $nowSql,
            ]);
            $target['record_id'] = (int) $insert->fetchColumn();
            $target['session_date'] = $requestedDate;
            $target['session_code'] = $sessionCode;
            $target['attendance_session_id'] = $requestedSessionId;
            $target['status'] = $status;
            $target['verification_method'] = 'manual_faculty';
            $target['time_recorded'] = $nowSql;
            $target['override_reason'] = $reason;
            $target['override_at'] = $nowSql;
            $created = true;
        } else {
            $update = $pdo->prepare(
                "UPDATE attendance_records
                 SET status = ?, verification_method = 'manual_faculty', override_reason = ?,
                     override_by_user_id = ?, override_at = ?
                 WHERE record_id = ?"
            );
            $update->execute([$status, $reason, (int) $authCtx['user_id'], $nowSql, (int) $target['record_id']]);
            $target['status'] = $status;
            $target['verification_method'] = 'manual_faculty';
            $target['override_reason'] = $reason;
            $target['override_at'] = $nowSql;
        }

        $afterState = [
            'recordId' => (int) $target['record_id'],
            'enrollmentId' => (int) $target['enrollment_id'],
            'studentId' => (int) $target['student_id'],
            'studentNumber' => $target['student_number'],
            'csId' => (int) $target['cs_id'],
            'className' => $target['cs_name'],
            'courseCode' => $target['course_code'],
            'sessionDate' => $target['session_date'],
            'attendanceSessionId' => $target['attendance_session_id'] !== null ? (int) $target['attendance_session_id'] : null,
            'sessionCode' => $target['session_code'],
            'status' => $target['status'],
        ];
        $macKey = config_key_bytes_at_least($config['audit']['mac_key_b64'], 32, 'AUDIT_MAC_KEY');
        $auditCtx = audit_begin_operation($pdo);
        audit_finish_operation($pdo, $auditCtx, [
            'module_code' => 'faculty_attendance',
            'action_code' => 'faculty_attendance_change',
            'event_status' => 'Success',
            'actor_user_id' => $authCtx['user_id'],
            'actor_username' => $authCtx['login_email'],
            'actor_role' => $authCtx['role'],
            'actor_display_name' => $authCtx['display_name'],
            'session_id' => $authCtx['session_id'],
            'scope_cs_id' => (int) $target['cs_id'],
            'target_type' => 'attendance_record',
            'target_id' => (string) $target['record_id'],
            'description' => sprintf(
                'Faculty attendance %s for Student #%s in %s on %s: %s.',
                $created ? 'recorded' : 'corrected',
                $target['student_number'],
                $target['class_name'] ?? $target['cs_name'],
                $target['session_date'],
                $status
            ),
            'reason' => $reason,
            'http_method' => $context['http_method'],
            'endpoint' => $context['endpoint'],
            'request_id' => $context['request_id'],
            'ip_address' => $context['ip_address'],
            'user_agent' => $context['user_agent'],
        ], $macKey, $beforeState, $afterState);
        $pdo->commit();

        json_response([
            'status' => 'ok',
            'message' => $created ? 'Attendance record created and audited.' : 'Attendance record updated and audited.',
            'operation' => $created ? 'created' : 'updated',
            'recordId' => (string) $target['record_id'],
            'attendanceSessionId' => $target['attendance_session_id'] !== null ? (string) $target['attendance_session_id'] : null,
        ], 200);
    } catch (\Throwable $e) {
        if (isset($pdo) && $pdo->inTransaction()) {
            $pdo->rollBack();
        }
        error_log('Faculty attendance override error: ' . sanitize_for_log($e));
        if ($e instanceof ValidationException) {
            validation_error_response($e->getErrors());
            return;
        }
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
               AND LOWER(e.status) = 'active'
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
    $pdo = null;
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
        $remedialValue = $data['remedial'] ?? null;
        $remedial = is_array($remedialValue)
            ? $remedialValue
            : ($remedialValue instanceof \stdClass ? get_object_vars($remedialValue) : null);
        if (($enrollmentId <= 0 && ($studentId <= 0 || $classId <= 0)) || !is_array($remedial)) {
            safe_error_response('Enrollment or student/class identifiers and remedial details are required.', 422);
            return;
        }
        $json = json_encode($remedial, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($json === false) {
            safe_error_response('Remedial details could not be encoded.', 422);
            return;
        }
        $remedialStatus = (string) ($remedial['status'] ?? 'pending');
        $state = in_array($remedialStatus, ['passed', 'removed'], true) ? 'active' : 'remedial';
        $where = $enrollmentId > 0
            ? 'e.enrollment_id = ?'
            : 'e.student_id = ? AND e.cs_id = ?';
        $stmt = $pdo->prepare(
            "UPDATE enrollments AS e
             SET remedial_state_json = ?, retention_state = ?
             FROM class_sections AS cs
             WHERE {$where} AND cs.cs_id = e.cs_id AND cs.instructor_user_id = ?
               AND LOWER(e.status) = 'active'"
        );
        $params = $enrollmentId > 0
            ? [$json, $state, $enrollmentId, $authCtx['user_id']]
            : [$json, $state, $studentId, $classId, $authCtx['user_id']];
        $pdo->beginTransaction();
        $stmt->execute($params);
        if ($stmt->rowCount() === 0) {
            $pdo->rollBack();
            safe_error_response('Enrollment not found in an assigned class.', 404);
            return;
        }
        $recipientWhere = $enrollmentId > 0 ? 'e.enrollment_id = ?' : 'e.student_id = ? AND e.cs_id = ?';
        $recipient = $pdo->prepare(
            "SELECT e.enrollment_id, s.student_account_user_id, c.course_code
               FROM enrollments e
               JOIN students s ON s.student_id = e.student_id
               JOIN class_sections cs ON cs.cs_id = e.cs_id
               JOIN courses c ON c.course_id = cs.course_id
              WHERE {$recipientWhere} AND cs.instructor_user_id = ?"
        );
        $recipientParams = $enrollmentId > 0
            ? [$enrollmentId, $authCtx['user_id']]
            : [$studentId, $classId, $authCtx['user_id']];
        $recipient->execute($recipientParams);
        $target = $recipient->fetch(PDO::FETCH_ASSOC);
        $notification = null;
        if (is_array($target) && $target['student_account_user_id'] !== null) {
            $notification = notification_create_idempotent(
                $pdo,
                (int) $target['student_account_user_id'],
                'remedial_assignment',
                'Remedial update for ' . (string) $target['course_code'],
                $state === 'remedial'
                    ? 'A Faculty member recorded a remedial action for your course enrollment.'
                    : 'Your course remedial state was updated to ' . $state . '.',
                'enrollment',
                (string) $target['enrollment_id'],
                'remedial:' . (string) $target['enrollment_id'] . ':' . $remedialStatus
            );
        }
        $pdo->commit();
        json_response([
            'status' => 'ok',
            'message' => 'Remedial record persisted successfully.',
            'enrollmentId' => is_array($target) ? (string) $target['enrollment_id'] : ($enrollmentId > 0 ? (string) $enrollmentId : null),
            'notification' => $notification !== null ? ['created' => $notification['created']] : null,
        ], 200);
    } catch (\Throwable $e) {
        if ($pdo instanceof PDO && $pdo->inTransaction()) { $pdo->rollBack(); }
        error_log('Faculty retention remedial save error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

function handle_faculty_retention_status_update(): void
{
    $pdo = null;
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
        $pdo->beginTransaction();
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
            $pdo->rollBack();
            safe_error_response('Enrollment not found in an assigned class.', 404);
            return;
        }
        $recipient = $pdo->prepare(
            "SELECT e.enrollment_id, s.student_account_user_id, c.course_code
               FROM enrollments e
               JOIN students s ON s.student_id = e.student_id
               JOIN class_sections cs ON cs.cs_id = e.cs_id
               JOIN courses c ON c.course_id = cs.course_id
              WHERE e.student_id = ? AND e.cs_id = ?
                AND cs.instructor_user_id = ?
                AND LOWER(e.status) = 'active'"
        );
        $recipient->execute([$studentId, $classId, $authCtx['user_id']]);
        $target = $recipient->fetch(PDO::FETCH_ASSOC);
        $notification = null;
        if (is_array($target) && $target['student_account_user_id'] !== null) {
            $notification = notification_create_idempotent(
                $pdo,
                (int) $target['student_account_user_id'],
                'retention_status',
                'Retention status updated for ' . (string) $target['course_code'],
                'A Faculty member updated your retention status to ' . $state . '.',
                'enrollment',
                (string) $target['enrollment_id'],
                'retention:' . (string) $target['enrollment_id'] . ':' . $state
            );
        }
        $pdo->commit();
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
            'notification' => $notification !== null ? ['created' => $notification['created']] : null,
        ], 200);
    } catch (\Throwable $e) {
        if ($pdo instanceof PDO && $pdo->inTransaction()) { $pdo->rollBack(); }
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
        $transmutationDefaults = faculty_transmutation_defaults($pdo);
        json_response([
            'status' => 'ok',
            'settings' => [
                'theme' => in_array($theme, ['light', 'dark'], true) ? $theme : 'light',
                'transmutationDefaults' => $transmutationDefaults,
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
               AND LOWER(e.status) = 'active'
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
               AND LOWER(e.status) = 'active'
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
                    'yearLevel' => $s['year_level'] !== null ? (int) $s['year_level'] : null,
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
                : null;
            $grouped[$id]['enrolledSubjects'][] = [
                'code' => $s['course_code'],
                'name' => $s['course_name'],
                'units' => (float) $s['units'],
                'grade' => $s['final_gwa'] !== null ? (float) $s['final_gwa'] : null,
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
                // The current class-section schema stores rooms, not schedules.
                // Keep this compatibility key without conflating either room with a schedule.
                'schedule' => null,
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

function handle_faculty_class_update(): void
{
    $context = [
        'request_id' => request_id(),
        'ip_address' => request_ip(),
        'user_agent' => request_user_agent(),
        'http_method' => request_method(),
        'endpoint' => request_path(),
    ];

    $pdo = null;
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
        $rawCsId = $data['csId'] ?? null;
        if (is_int($rawCsId)) {
            $csId = $rawCsId;
        } elseif (is_string($rawCsId) && ctype_digit(trim($rawCsId))) {
            $csId = (int) trim($rawCsId);
        } else {
            safe_error_response('Valid csId is required.', 400);
            return;
        }
        if ($csId <= 0) {
            safe_error_response('Valid csId is required.', 400);
            return;
        }

        $errors = [];
        $protectedFields = [
            'courseId' => 'Course catalog identity is controlled and cannot be edited here.',
            'courseCode' => 'Course catalog identity is controlled and cannot be edited here.',
            'courseName' => 'Course catalog identity is controlled and cannot be edited here.',
            'semester' => 'Protected term identity is controlled and cannot be edited here.',
            'schoolYear' => 'Protected term identity is controlled and cannot be edited here.',
            'termCode' => 'Protected term identity is controlled and cannot be edited here.',
            'termStartDate' => 'Protected term identity is controlled and cannot be edited here.',
            'termEndDate' => 'Protected term identity is controlled and cannot be edited here.',
            'instructorUserId' => 'Class-section ownership is controlled and cannot be edited here.',
            'secretaryUserId' => 'Class-section assignment is controlled and cannot be edited here.',
            'status' => 'Class-section status is controlled and cannot be edited here.',
            'schedule' => 'Schedule is not a persisted class-section field; edit lecRoom or labRoom separately.',
        ];
        foreach ($protectedFields as $field => $message) {
            if (array_key_exists($field, $data)) {
                $errors[$field] = $message;
            }
        }

        $allowedFields = ['csId', 'csName', 'block', 'yearLevel', 'lecRoom', 'labRoom'];
        foreach (array_keys($data) as $field) {
            if (!in_array($field, $allowedFields, true) && !array_key_exists($field, $protectedFields)) {
                $errors[$field] = 'This field is not editable through the class-section contract.';
            }
        }
        if ($errors !== []) {
            throw new ValidationException($errors);
        }

        $updates = [];
        $params = [];
        if (array_key_exists('csName', $data)) {
            $updates[] = 'cs_name = ?';
            $params[] = validate_required_string($data, 'csName', 2, 255);
        }
        if (array_key_exists('block', $data)) {
            $updates[] = 'block = ?';
            $params[] = validate_required_string($data, 'block', 1, 50);
        }
        if (array_key_exists('yearLevel', $data)) {
            $rawYearLevel = $data['yearLevel'];
            if (is_int($rawYearLevel)) {
                $yearLevel = $rawYearLevel;
            } elseif (is_string($rawYearLevel) && ctype_digit(trim($rawYearLevel))) {
                $yearLevel = (int) trim($rawYearLevel);
            } else {
                throw new ValidationException(['yearLevel' => 'Year level must be an integer between 1 and 4.']);
            }
            if ($yearLevel < 1 || $yearLevel > 4) {
                throw new ValidationException(['yearLevel' => 'Year level must be an integer between 1 and 4.']);
            }
            $updates[] = 'year_level = ?';
            $params[] = $yearLevel;
        }
        if (array_key_exists('lecRoom', $data)) {
            $updates[] = 'lec_room = ?';
            $params[] = validate_optional_string($data, 'lecRoom', 1, 100);
        }
        if (array_key_exists('labRoom', $data)) {
            $updates[] = 'lab_room = ?';
            $params[] = validate_optional_string($data, 'labRoom', 1, 100);
        }
        if ($updates === []) {
            throw new ValidationException(['fields' => 'At least one editable class-section field is required.']);
        }

        $pdo->beginTransaction();
        try {
            $select = $pdo->prepare("
                SELECT cs_id, cs_name, course_id, instructor_user_id, semester, school_year,
                       year_level, lab_room, lec_room, block, status, term_code,
                       term_start_date, term_end_date
                FROM class_sections
                WHERE cs_id = ? AND instructor_user_id = ?
                FOR UPDATE
            ");
            $select->execute([$csId, $authCtx['user_id']]);
            $before = $select->fetch(PDO::FETCH_ASSOC);
            if (!$before) {
                $pdo->rollBack();
                safe_error_response('Class section not found or not assigned to this faculty member.', 403);
                return;
            }

            $update = $pdo->prepare(
                'UPDATE class_sections SET ' . implode(', ', $updates) . ' WHERE cs_id = ? AND instructor_user_id = ?'
            );
            $update->execute(array_merge($params, [$csId, $authCtx['user_id']]));

            $select->execute([$csId, $authCtx['user_id']]);
            $after = $select->fetch(PDO::FETCH_ASSOC);
            if (!$after) {
                throw new RuntimeException('Updated class section could not be reloaded.');
            }

            $macKey = config_key_bytes_at_least($config['audit']['mac_key_b64'], 32, 'AUDIT_MAC_KEY');
            $auditCtx = audit_begin_operation($pdo);
            audit_finish_operation($pdo, $auditCtx, [
                'module_code' => 'class_management',
                'action_code' => 'class_update',
                'event_status' => 'Success',
                'actor_user_id' => $authCtx['user_id'],
                'actor_username' => $authCtx['login_email'],
                'actor_role' => $authCtx['role'],
                'actor_display_name' => $authCtx['display_name'],
                'session_id' => $authCtx['session_id'],
                'scope_cs_id' => $csId,
                'target_type' => 'class_section',
                'target_id' => (string) $csId,
                'description' => "Updated class section '{$after['cs_name']}'.",
                'reason' => null,
                'http_method' => $context['http_method'],
                'endpoint' => $context['endpoint'],
                'request_id' => $context['request_id'],
                'ip_address' => $context['ip_address'],
                'user_agent' => $context['user_agent'],
            ], $macKey, $before, $after);

            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }

        json_response([
            'status' => 'ok',
            'message' => 'Class section updated successfully.',
            'csId' => $csId,
        ], 200);
    } catch (ValidationException $e) {
        validation_error_response($e->getErrors());
    } catch (Throwable $e) {
        if ($pdo instanceof PDO && $pdo->inTransaction()) {
            $pdo->rollBack();
        }
        error_log('Faculty class update error: ' . sanitize_for_log($e));
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
            WHERE LOWER(s.status) = 'active'
              AND NOT EXISTS (
                SELECT 1 FROM enrollments e
                 WHERE e.cs_id = ? AND e.student_id = s.student_id AND LOWER(e.status) = 'active'
            )
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
                'yearLevel' => $s['year_level'] !== null ? (int) $s['year_level'] : null,
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
            $existingStmt = $pdo->prepare(
                'SELECT enrollment_id, status
                   FROM enrollments
                  WHERE student_id = ? AND cs_id = ?
                  FOR UPDATE'
            );
            $insertStmt = $pdo->prepare(
                "INSERT INTO enrollments (student_id, cs_id, status, date_enrolled, retention_state, created_at)
                 VALUES (?, ?, 'Active', CURRENT_DATE, 'active', CURRENT_TIMESTAMP(6))
                 RETURNING enrollment_id"
            );
            $reviveStmt = $pdo->prepare(
                "UPDATE enrollments
                    SET status = 'Active', date_enrolled = COALESCE(date_enrolled, CURRENT_DATE), updated_at = CURRENT_TIMESTAMP(6)
                  WHERE enrollment_id = ? AND LOWER(status) <> 'active'"
            );

            $enrolledCount = 0;
            $studentExists = $pdo->prepare("SELECT 1 FROM students WHERE student_id = ? AND LOWER(status) = 'active'");
            foreach ($studentIds as $sId) {
                $stId = (int) $sId;
                if ($stId > 0) {
                    $studentExists->execute([$stId]);
                    if ($studentExists->fetchColumn() === false) {
                        $pdo->rollBack();
                        safe_error_response('One or more selected Students are not active.', 422);
                        return;
                    }
                    $existingStmt->execute([$stId, $csId]);
                    $existing = $existingStmt->fetch(PDO::FETCH_ASSOC);
                    if (is_array($existing)) {
                        $reviveStmt->execute([(int) $existing['enrollment_id']]);
                        if ($reviveStmt->rowCount() > 0) {
                            $enrolledCount++;
                        }
                        continue;
                    }
                    $insertStmt->execute([$stId, $csId]);
                    if ($insertStmt->fetchColumn() !== false) {
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
            $archiveStmt = $pdo->prepare(
                "UPDATE enrollments
                    SET status = 'Archived', updated_at = CURRENT_TIMESTAMP(6)
                  WHERE cs_id = ? AND student_id = ? AND LOWER(status) = 'active'"
            );
            $archiveStmt->execute([$csId, $studentId]);
            if ($archiveStmt->rowCount() === 0) {
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
                'description' => "Archived Student #{$studentId}'s current membership in class section #{$csId}; historical grades and attendance were preserved.",
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
            'message' => 'Student removed from the active class roster; historical grades and attendance were preserved.',
            'enrollmentStatus' => 'Archived',
        ], 200);
    } catch (\Throwable $e) {
        error_log('Faculty class unenroll error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}


