<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/app/remedial_attempts.php';

function student_academic_verify_auth(PDO $pdo, array $config): array
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
        if (($authCtx['role'] ?? null) !== 'student') {
            throw new AuthException('Student authentication required.');
        }
        // This is deliberately re-evaluated from the token subject so a
        // request cannot select another Student through a query parameter.
        $identity = require_student_identity($pdo, $config, $authCtx);
        $authCtx['student'] = $identity['student'];
        $authCtx['student_id'] = $identity['student_id'];
        return $authCtx;
    } catch (AuthException | RuntimeException $e) {
        auth_error_response($e->getMessage(), 401);
        exit;
    }
}

function student_academic_profile(PDO $pdo, int $studentId): ?array
{
    $stmt = $pdo->prepare(
        'SELECT s.student_id, s.student_number,
                COALESCE(pi.name_prefix, s.name_prefix) AS name_prefix,
                COALESCE(pi.first_name, s.first_name) AS first_name,
                COALESCE(pi.middle_name, s.middle_name) AS middle_name,
                COALESCE(pi.last_name, s.last_name) AS last_name,
                COALESCE(pi.name_suffix, s.name_suffix) AS name_suffix,
                s.bu_email, s.contact, s.sex, s.year_level, s.status, s.admission_date,
                s.birthdate, ua.user_id AS account_user_id, ua.login_email,
                ua.role AS account_role, ua.status AS account_status
           FROM students s
           LEFT JOIN person_identities pi ON pi.person_id = s.person_id
           LEFT JOIN user_accounts ua ON ua.user_id = s.student_account_user_id
          WHERE s.student_id = ?
          LIMIT 1'
    );
    $stmt->execute([$studentId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!is_array($row)) {
        return null;
    }

    return [
        'id' => (string) $row['student_id'],
        'studentNumber' => (string) $row['student_number'],
        'prefix' => $row['name_prefix'],
        'suffix' => $row['name_suffix'],
        'firstName' => (string) $row['first_name'],
        'middleName' => $row['middle_name'] !== null ? (string) $row['middle_name'] : null,
        'lastName' => (string) $row['last_name'],
        'name' => trim(implode(' ', array_filter([
            $row['name_prefix'],
            $row['first_name'],
            $row['middle_name'],
            $row['last_name'],
            $row['name_suffix'],
        ], static fn(mixed $value): bool => $value !== null && trim((string) $value) !== ''))),
        'email' => $row['bu_email'] !== null ? (string) $row['bu_email'] : null,
        'contact' => $row['contact'] !== null ? (string) $row['contact'] : null,
        'sex' => $row['sex'] !== null ? (string) $row['sex'] : null,
        'yearLevel' => $row['year_level'] !== null ? (int) $row['year_level'] : null,
        'status' => (string) $row['status'],
        'admissionDate' => $row['admission_date'],
        'birthdate' => $row['birthdate'],
        'account' => [
            'userId' => $row['account_user_id'] !== null ? (string) $row['account_user_id'] : null,
            'email' => $row['login_email'] !== null ? (string) $row['login_email'] : null,
            'role' => $row['account_role'],
            'status' => $row['account_status'],
        ],
    ];
}

function student_academic_class_rows(PDO $pdo, int $studentId): array
{
    $stmt = $pdo->prepare(
        'SELECT e.enrollment_id, e.cs_id, e.status AS enrollment_status, e.date_enrolled,
                COALESCE(egb.final_percentage, e.final_percentage) AS final_percentage,
                COALESCE(egb.final_gwa, e.final_gwa) AS final_gwa,
                e.grade_components_json,
                COALESCE(egb.retention_state, e.retention_state) AS retention_state,
                e.remedial_state_json, e.clinic_hours_completed,
                cs.cs_name, cs.semester, cs.school_year, cs.year_level AS class_year_level,
                c.course_id, c.course_code, c.name AS course_name, c.units, c.is_clinical
           FROM enrollments e
           LEFT JOIN enrollment_grade_breakdowns egb ON egb.enrollment_id = e.enrollment_id
           JOIN class_sections cs ON cs.cs_id = e.cs_id
           JOIN courses c ON c.course_id = cs.course_id
          WHERE e.student_id = ?
            AND LOWER(e.status) = \'active\'
            AND LOWER(cs.status) = \'active\'
          ORDER BY cs.school_year DESC, cs.semester, c.course_code, e.enrollment_id'
    );
    $stmt->execute([$studentId]);
    $dbRows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    $enrollmentIds = array_map(static fn(array $row): int => (int) $row['enrollment_id'], $dbRows);
    $legacyByEnrollment = [];
    foreach ($dbRows as $row) {
        $legacyByEnrollment[(int) $row['enrollment_id']] = $row['remedial_state_json'] !== null;
    }
    // remedial_attempts_load performs one bounded read from
    // enrollment_remedial_attempts ordered by attempt_number and derives the
    // server-owned stage; this is intentionally not an N+1 lookup.
    $progressions = remedial_attempts_load($pdo, $enrollmentIds, $legacyByEnrollment);

    $rows = [];
    foreach ($dbRows as $row) {
        $enrollmentId = (int) $row['enrollment_id'];
        $rows[] = [
            'enrollmentId' => (string) $enrollmentId,
            'classId' => (string) $row['cs_id'],
            'className' => (string) $row['cs_name'],
            'courseId' => (string) $row['course_id'],
            'courseCode' => (string) $row['course_code'],
            'courseName' => (string) $row['course_name'],
            'units' => (float) $row['units'],
            'isClinical' => (bool) $row['is_clinical'],
            'semester' => (string) $row['semester'],
            'schoolYear' => (string) $row['school_year'],
            'yearLevel' => $row['class_year_level'] !== null ? (int) $row['class_year_level'] : null,
            'dateEnrolled' => $row['date_enrolled'],
            'grade' => $row['final_gwa'] !== null ? (float) $row['final_gwa'] : null,
            'percentage' => $row['final_percentage'] !== null ? (float) $row['final_percentage'] : null,
            'gradeComponents' => $row['grade_components_json'] !== null
                ? json_decode((string) $row['grade_components_json'], true)
                : null,
            'retentionState' => (string) $row['retention_state'],
            'remedial' => $row['remedial_state_json'] !== null
                ? json_decode((string) $row['remedial_state_json'], true)
                : null,
            'remedialProgression' => $progressions[$enrollmentId] ?? remedial_attempts_empty_progression(),
            'clinicHoursCompleted' => (int) $row['clinic_hours_completed'],
        ];
    }
    return $rows;
}

function handle_student_profile_get(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = student_academic_verify_auth($pdo, $config);
        $profile = student_academic_profile($pdo, (int) $authCtx['student_id']);
        if ($profile === null) {
            safe_error_response('Student profile not found.', 404);
            return;
        }
        json_response(['status' => 'ok', 'profile' => $profile], 200);
    } catch (Throwable $e) {
        error_log('Student profile read error: ' . get_class($e));
        safe_error_response('Unable to read Student profile.', 500);
    }
}

function handle_student_classes_get(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = student_academic_verify_auth($pdo, $config);
        json_response([
            'status' => 'ok',
            'classes' => student_academic_class_rows($pdo, (int) $authCtx['student_id']),
        ], 200);
    } catch (Throwable $e) {
        error_log('Student classes read error: ' . get_class($e));
        safe_error_response('Unable to read Student classes.', 500);
    }
}

function handle_student_retention_get(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = student_academic_verify_auth($pdo, $config);
        $classes = student_academic_class_rows($pdo, (int) $authCtx['student_id']);
        $atRisk = array_values(array_filter(
            $classes,
            static fn(array $row): bool => in_array($row['retentionState'], ['warning', 'critical', 'remedial'], true)
        ));
        json_response([
            'status' => 'ok',
            'retention' => [
                'records' => $classes,
                'atRiskCount' => count($atRisk),
                'hasPendingGrades' => count(array_filter($classes, static fn(array $row): bool => $row['grade'] === null)) > 0,
            ],
        ], 200);
    } catch (Throwable $e) {
        error_log('Student retention read error: ' . get_class($e));
        safe_error_response('Unable to read Student retention data.', 500);
    }
}

function handle_student_dashboard_get(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = student_academic_verify_auth($pdo, $config);
        $profile = student_academic_profile($pdo, (int) $authCtx['student_id']);
        $classes = student_academic_class_rows($pdo, (int) $authCtx['student_id']);
        if ($profile === null) {
            safe_error_response('Student profile not found.', 404);
            return;
        }
        $graded = array_values(array_filter($classes, static fn(array $row): bool => $row['grade'] !== null));
        $gwa = $graded === [] ? null : array_sum(array_column($graded, 'grade')) / count($graded);
        $attendance = $pdo->prepare(
            'SELECT COUNT(*) FILTER (WHERE r.status IN (\'present\', \'late\')) AS attended,
                    COUNT(*) AS total
               FROM attendance_records r
               JOIN enrollments e ON e.enrollment_id = r.enrollment_id
              WHERE e.student_id = ? AND LOWER(e.status) = \'active\''
        );
        $attendance->execute([(int) $authCtx['student_id']]);
        $attendanceRow = $attendance->fetch(PDO::FETCH_ASSOC) ?: ['attended' => 0, 'total' => 0];
        $totalAttendance = (int) $attendanceRow['total'];
        $attendanceRate = $totalAttendance > 0
            ? round(((int) $attendanceRow['attended'] / $totalAttendance) * 100, 2)
            : null;
        $clinicalHours = array_sum(array_map(static fn(array $row): int => $row['clinicHoursCompleted'], $classes));
        json_response([
            'status' => 'ok',
            'student' => $profile,
            'summary' => [
                'classCount' => count($classes),
                'gwa' => $gwa !== null ? round($gwa, 2) : null,
                'attendanceRate' => $attendanceRate,
                'clinicalHoursCompleted' => $clinicalHours,
                'retentionAlerts' => count(array_filter(
                    $classes,
                    static fn(array $row): bool => in_array($row['retentionState'], ['warning', 'critical', 'remedial'], true)
                )),
            ],
            'classes' => $classes,
        ], 200);
    } catch (Throwable $e) {
        error_log('Student dashboard read error: ' . get_class($e));
        safe_error_response('Unable to read Student dashboard.', 500);
    }
}
