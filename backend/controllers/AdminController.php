<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/app/remedial_attempts.php';

if (!function_exists('sanitize_for_log')) {
    function sanitize_for_log(\Throwable $e): string
    {
        return get_class($e) . ' [' . ($e->getCode() > 0 ? $e->getCode() : 0) . ']';
    }
}

function handle_admin_email_logs(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = admin_verify_auth($pdo, $config);
        json_response([
            'status' => 'ok',
            'actions' => array_map(
                static fn(array $a): array => ['sentAt' => audit_manila_iso((string) $a['sentAt'])] + $a,
                email_history_actions($pdo, (int) $authCtx['user_id'])
            ),
        ], 200);
    } catch (\Throwable $e) {
        error_log('Admin email logs error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
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
        $authCtx = auth_verify_access_token($pdo, $config, $token, $jwtKey);
    } catch (AuthException | \RuntimeException $e) {
        auth_error_response($e->getMessage(), 401);
        exit;
    }

    if ($authCtx['role'] !== 'admin') {
        safe_error_response('Access denied. Administrator privileges required.', 403);
        exit;
    }

    if (account_identity_fetch($pdo, (int) $authCtx['user_id']) === null) {
        safe_error_response('Administrator identity is unavailable.', 409);
        exit;
    }

    return $authCtx;
}

/** Newest Dean-overview entries for the Dashboard (same Entry shape as the Audit Trail). */
function admin_recent_audit_events(PDO $pdo, int $deanId, int $limit = 20): array
{
    $params = audit_read_params([], 'admin');
    $params['pageSize'] = max(1, min(20, $limit));
    return audit_read_entries($pdo, ['user_id' => $deanId, 'role' => 'admin'], $params)['entries'];
}

function handle_admin_dashboard_kpis(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = admin_verify_auth($pdo, $config);
        $currentSchoolYear = academic_current_school_year($pdo);
        $schoolYear = academic_resolve_school_year_filter($pdo, $_GET['schoolYear'] ?? null);
        $yearParams = $schoolYear === null ? [] : [':school_year' => $schoolYear];
        $studentYearWhere = $schoolYear === null ? '' : 'WHERE UPPER(cs_scope.school_year) = UPPER(:school_year)';
        $facultyYearJoin = $schoolYear === null ? '' : 'AND UPPER(cs.school_year) = UPPER(:school_year)';
        $attendanceYearAnd = $schoolYear === null ? '' : 'AND UPPER(cs.school_year) = UPPER(:school_year)';
        $availableSchoolYears = academic_school_year_options(
            $pdo->query('SELECT DISTINCT school_year FROM class_sections WHERE school_year IS NOT NULL')->fetchAll(PDO::FETCH_COLUMN),
            $currentSchoolYear
        );

        // Fetch counts from database
        $studentStmt = $pdo->prepare("
            SELECT 
                s.student_id, 
                s.student_number, 
                COALESCE(pi.first_name, s.first_name) AS first_name,
                COALESCE(pi.last_name, s.last_name) AS last_name,
                s.year_level, 
                s.status AS student_status,
                AVG(COALESCE(egb.final_gwa, e.final_gwa)) AS final_gwa,
                MAX(CASE " . retention_effective_state_sql('e', 'COALESCE(egb.retention_state, e.retention_state)') . "
                    WHEN 'remedial' THEN 2 ELSE 1 END) AS risk_score
            FROM students s
            LEFT JOIN enrollments e ON s.student_id = e.student_id AND e.cs_id NOT IN (SELECT hx.cs_id FROM class_sections hx WHERE hx.archive_reason IN ('cancelled', 'mistake'))
            LEFT JOIN class_sections cs_scope ON cs_scope.cs_id = e.cs_id
            LEFT JOIN person_identities pi ON pi.person_id = s.person_id
            LEFT JOIN enrollment_grade_breakdowns egb ON egb.enrollment_id = e.enrollment_id
            {$studentYearWhere}
            GROUP BY s.student_id, s.student_number, pi.first_name, s.first_name,
                     pi.last_name, s.last_name, s.year_level, s.status
        ");
        $studentStmt->execute($yearParams);
        $students = $studentStmt->fetchAll(PDO::FETCH_ASSOC);

        $facultyStmt = $pdo->prepare(
            "SELECT u.user_id,
                    COALESCE(NULLIF(CONCAT_WS(' ', NULLIF(pi.name_prefix, ''),
                        NULLIF(pi.first_name, ''), NULLIF(pi.middle_name, ''),
                        NULLIF(pi.last_name, ''), NULLIF(pi.name_suffix, '')), ''), u.display_name) AS display_name,
                    u.login_email, u.status,
                    STRING_AGG(DISTINCT cs.cs_name, ', ' ORDER BY cs.cs_name) AS classes,
                    STRING_AGG(DISTINCT c.course_code, ', ' ORDER BY c.course_code) AS subjects,
                    COUNT(DISTINCT e.student_id) AS student_count
             FROM user_accounts u
             LEFT JOIN person_identities pi ON pi.person_id = u.person_id
             LEFT JOIN class_sections cs ON cs.instructor_user_id = u.user_id AND (cs.archive_reason IS NULL OR cs.archive_reason = 'finished') {$facultyYearJoin}
             LEFT JOIN courses c ON c.course_id = cs.course_id
             LEFT JOIN enrollments e ON e.cs_id = cs.cs_id
             WHERE u.role = 'faculty'
             GROUP BY u.user_id, u.display_name, u.login_email, u.status,
                      pi.name_prefix, pi.first_name, pi.middle_name, pi.last_name, pi.name_suffix"
        );
        $facultyStmt->execute($yearParams);
        $faculty = $facultyStmt->fetchAll(PDO::FETCH_ASSOC);

        $attStmt = $pdo->prepare("
            SELECT 
                ar.record_id, 
                ar.status, 
                cs.cs_name
            FROM attendance_records ar
            LEFT JOIN enrollments e ON ar.enrollment_id = e.enrollment_id
            LEFT JOIN class_sections cs ON e.cs_id = cs.cs_id
            WHERE NOT EXISTS (SELECT 1 FROM attendance_sessions rs WHERE rs.session_id = ar.attendance_session_id AND rs.status = 'revoked')
            AND (cs.archive_reason IS NULL OR cs.archive_reason = 'finished')
            {$attendanceYearAnd}
        ");
        $attStmt->execute($yearParams);
        $attendance = $attStmt->fetchAll(PDO::FETCH_ASSOC);

        $totalStudents = count($students);

        $goodStanding = 0;
        $noGrade = 0;
        $remedialCount = 0;
        $atRiskStudents = [];

        $gwa1_15 = 0;
        $gwa16_24 = 0;
        $gwa25_3 = 0;
        $gwaAbove3 = 0;

        foreach ($students as $s) {
            $riskScore = (int) ($s['risk_score'] ?? 0);
            if ($riskScore >= 2) {
                $remedialCount++;
                $atRiskStudents[(int) $s['student_id']] = true;
            } elseif (isset($s['final_gwa'])) {
                $goodStanding++;
            } else {
                $noGrade++;
            }

            if (isset($s['final_gwa']) && $s['final_gwa'] !== null) {
                $gwa = (float) $s['final_gwa'];
                if ($gwa <= 1.5) {
                    $gwa1_15++;
                } elseif ($gwa < 2.5) {
                    $gwa16_24++;
                } elseif ($gwa <= 3.0) {
                    $gwa25_3++;
                } else {
                    $gwaAbove3++;
                }
            }
        }

        // At-Risk Count = Remedial students plus students with a Midterm At Risk
        // course in the current school year (spec 2026-10-17), counted once each.
        if ($schoolYear === null || strcasecmp((string) $schoolYear, (string) $currentSchoolYear) === 0) {
            $midtermStmt = $pdo->prepare("
                SELECT e.enrollment_id, e.student_id, e.cs_id, COALESCE(egb.final_gwa, e.final_gwa) AS final_gwa, e.remedial_state_json
                FROM enrollments e
                JOIN class_sections cs ON cs.cs_id = e.cs_id
                LEFT JOIN enrollment_grade_breakdowns egb ON egb.enrollment_id = e.enrollment_id
                WHERE LOWER(e.status) = 'active' AND UPPER(cs.school_year) = UPPER(:current_year)
                  AND (cs.archive_reason IS NULL OR cs.archive_reason = 'finished')
            ");
            $midtermStmt->execute([':current_year' => (string) $currentSchoolYear]);
            $midtermRows = $midtermStmt->fetchAll(PDO::FETCH_ASSOC);
            $midtermIds = faculty_midterm_at_risk_ids($pdo, $midtermRows);
            foreach ($midtermRows as $row) {
                if (isset($midtermIds[(int) $row['enrollment_id']])) {
                    $atRiskStudents[(int) $row['student_id']] = true;
                }
            }
        }
        $atRisk = count($atRiskStudents);

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

            // Excused counts as attended.
            if ($st === 'present' || $st === 'late' || $st === 'excused') {
                $presentCount++;
                $classAttCounts[$cName]['present']++;
            }
        }

        $attendanceRate = $attCount > 0 ? (int) round(($presentCount / $attCount) * 100) : null;

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
            'currentSchoolYear' => $currentSchoolYear,
            'schoolYearFilter' => $schoolYear ?? 'all',
            'availableSchoolYears' => $availableSchoolYears,
            'kpis' => [
                'totalStudents' => $totalStudents,
                'totalFaculty' => $activeFacultyCount > 0 ? $activeFacultyCount : count($facultyList),
                'goodStanding' => $goodStanding,
                'noGrade' => $noGrade,
                'atRisk' => $atRisk,
                'remedialCount' => $remedialCount,
                'attendanceRate' => $attendanceRate,
            ],
            'facultyList' => $facultyList,
            'gwaBuckets' => [
                ['range' => '1.0–1.5', 'count' => $gwa1_15, 'color' => '#10B981'],
                ['range' => '1.6–2.4', 'count' => $gwa16_24, 'color' => '#F59E0B'],
                ['range' => '2.5–3.0', 'count' => $gwa25_3, 'color' => '#F97316'],
                ['range' => 'Above 3.0', 'count' => $gwaAbove3, 'color' => '#EF4444'],
            ],
            'statusCounts' => [
                'active' => $goodStanding,
                'noGrade' => $noGrade,
                'remedial' => $remedialCount,
            ],
            'classAttendance' => $classAttendance,
            'recentAuditEvents' => admin_recent_audit_events($pdo, (int) $authCtx['user_id']),
            'academicTermReminder' => academic_next_term_reminder(academic_terms_read($pdo), app_local_date($config, attendance_session_now_utc())),
        ], 200);
    } catch (ValidationException $e) {
        validation_error_response($e->getErrors());
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
             VALUES ('retention_criteria', ?, 0, 'Administrator-defined retention criteria.', CURRENT_TIMESTAMP(6), ?)
             ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value,
                 updated_at = EXCLUDED.updated_at, updated_by_user_id = EXCLUDED.updated_by_user_id"
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
            $authCtx = auth_verify_access_token($pdo, $config, $token, $jwtKey);
        } catch (AuthException | \RuntimeException $e) {
            auth_error_response($e->getMessage(), 401);
            return;
        }

        if (($authCtx['role'] ?? '') !== 'admin') {
            safe_error_response('Access denied. Administrator privileges required.', 403);
            return;
        }

        $result = audit_read_entries(
            $pdo,
            ['user_id' => (int) $authCtx['user_id'], 'role' => 'admin'],
            audit_read_params($_GET, 'admin')
        );
        json_response(['status' => 'ok'] + $result, 200);
    } catch (ValidationException $e) {
        validation_error_response($e->getErrors());
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

        $user = account_identity_fetch($pdo, (int) $authCtx['user_id']);

        if ($user === null) {
            safe_error_response('User profile not found.', 404);
            return;
        }

        json_response([
            'status' => 'ok',
            'profile' => [
                ...account_identity_profile_parts($user ?: []),
                'id' => (string) $user['user_id'],
                'name' => account_identity_display_name($user),
                'email' => $user['login_email'],
                'title' => $user['title'] ?? 'Academic Dean',
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

        $result = account_identity_change_own_name($pdo, $config, $authCtx, $body['data'], true);
        json_response(['status' => 'ok', 'message' => 'Profile details updated successfully.', ...$result], 200);
    } catch (ValidationException $e) {
        validation_error_response($e->getErrors());
    } catch (AccountIdentityStepUpException $e) {
        emit_response(build_error_response($e->getMessage(), 403, $e->apiCode));
    } catch (RateLimitException $e) {
        emit_response(build_error_response('Too many requests.', 429, 'RATE_LIMITED'));
    } catch (DomainException $e) {
        safe_error_response($e->getMessage(), 409);
    } catch (\PDOException $e) {
        error_log('Profile update database error: ' . sanitize_for_log($e));
        $sqlState = (string) $e->getCode();
        if ($sqlState === '23505') {
            safe_error_response('That email address is already used by another account.', 409);
        } elseif ($sqlState === '23514' || $sqlState === 'P0001') {
            safe_error_response('Your profile could not be saved because your linked Student record does not match this account. Contact the administrator.', 409);
        } else {
            safe_error_response('Internal server error.', 500);
        }
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
             WHERE setting_key = 'grading_defaults'"
        );
        $rows = $stmt ? $stmt->fetchAll(PDO::FETCH_KEY_PAIR) : [];
        $grading = isset($rows['grading_defaults']) ? json_decode($rows['grading_defaults'], true) : [];
        $transmutation = $grading['transmutation_defaults'] ?? [];
        $themeStmt = $pdo->prepare("SELECT theme FROM user_accounts WHERE user_id = ?");
        $themeStmt->execute([$authCtx['user_id']]);
        $settings = [
            'theme' => $themeStmt->fetchColumn() ?: 'light',
            // Fixed college policy (read-only): GWA 2.5 or worse triggers remedial.
            'retentionThreshold' => remedial_attempts_course_grade_threshold(),
            'transmutationDefaults' => [
                'minimumPercentage' => (float) ($transmutation['minimum_percentage'] ?? 50),
                'maximumPercentage' => (float) ($transmutation['maximum_percentage'] ?? 100),
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
        // The retention trigger (fixed at 2.5) and course grading weights (set
        // per course by Faculty) are not Admin settings; those keys are ignored.
        $existingGradingStmt = $pdo->query("SELECT setting_value FROM system_settings WHERE setting_key = 'grading_defaults' LIMIT 1");
        $existingGrading = json_decode((string) ($existingGradingStmt->fetchColumn() ?: '{}'), true);
        $existingTransmutation = $existingGrading['transmutation_defaults'] ?? [];
        $transmutation = $settings['transmutationDefaults'] ?? [
            'minimumPercentage' => $existingTransmutation['minimum_percentage'] ?? 50,
            'maximumPercentage' => $existingTransmutation['maximum_percentage'] ?? 100,
        ];
        if ($transmutation instanceof \stdClass) {
            $transmutation = get_object_vars($transmutation);
        }
        $transmutationIsArray = is_array($transmutation);
        if (!$transmutationIsArray) {
            $transmutation = [];
        }
        $minimumRaw = $transmutation['minimumPercentage'] ?? 50;
        $maximumRaw = $transmutation['maximumPercentage'] ?? 100;
        $transmutationNumbersAreValid = is_numeric($minimumRaw) && is_numeric($maximumRaw);
        $minimumTransmutation = is_numeric($minimumRaw) ? (float) $minimumRaw : 0.0;
        $maximumTransmutation = is_numeric($maximumRaw) ? (float) $maximumRaw : 0.0;
        $settings['transmutationDefaults'] = [
            'minimumPercentage' => $minimumTransmutation,
            'maximumPercentage' => $maximumTransmutation,
        ];
        if (!in_array($theme, ['light', 'dark'], true)
            || !$transmutationIsArray || !$transmutationNumbersAreValid
            || !is_finite($minimumTransmutation) || !is_finite($maximumTransmutation)
            || $minimumTransmutation < 0 || $minimumTransmutation > 100
            || $maximumTransmutation < 0 || $maximumTransmutation > 100
            || $minimumTransmutation > $maximumTransmutation
        ) {
            safe_error_response('A theme and valid transmutation bounds are required.', 422);
            return;
        }
        $pdo->beginTransaction();
        $oldThemeStmt = $pdo->prepare('SELECT theme FROM user_accounts WHERE user_id = ?');
        $oldThemeStmt->execute([$authCtx['user_id']]);
        $oldTheme = $oldThemeStmt->fetchColumn();
        $themeStmt = $pdo->prepare("UPDATE user_accounts SET theme = ? WHERE user_id = ?");
        $themeStmt->execute([$theme, $authCtx['user_id']]);
        $transmutationStmt = $pdo->prepare(
            "UPDATE system_settings
             SET setting_value = jsonb_set(setting_value, '{transmutation_defaults}',
                    jsonb_build_object('minimum_percentage', ?::numeric, 'maximum_percentage', ?::numeric), true),
                 updated_at = CURRENT_TIMESTAMP(6), updated_by_user_id = ?
             WHERE setting_key = 'grading_defaults'"
        );
        $transmutationStmt->execute([
            $minimumTransmutation, $maximumTransmutation, $authCtx['user_id'],
        ]);
        // R3/R4: only the changed settings; no row when nothing changed. Audit state does not accept floats, so percentages are text.
        $fmt = static fn($v): ?string => $v === null ? null : number_format((float) $v, 2, '.', '');
        $changed = audit_changed_fields(
            [
                'transmutationMinimumPercentage' => $fmt($existingTransmutation['minimum_percentage'] ?? null),
                'transmutationMaximumPercentage' => $fmt($existingTransmutation['maximum_percentage'] ?? null),
                'theme' => $oldTheme === false ? null : $oldTheme,
            ],
            [
                'transmutationMinimumPercentage' => $fmt($minimumTransmutation),
                'transmutationMaximumPercentage' => $fmt($maximumTransmutation),
                'theme' => $theme,
            ]
        );
        if ($changed !== null) {
            audit_record_action(
                $pdo, $config, $authCtx, 'settings', 'system_settings_updated', 'system_settings', 'grading_defaults',
                sprintf('Updated system settings: transmutation %.2f%%-%.2f%%, theme %s.', $minimumTransmutation, $maximumTransmutation, $theme),
                ['before' => $changed[0], 'after' => $changed[1]]
            );
        }
        $pdo->commit();

        $settings['retentionThreshold'] = remedial_attempts_course_grade_threshold();
        unset($settings['weights']);
        json_response(['status' => 'ok', 'message' => 'System settings persisted successfully.', 'settings' => $settings], 200);
    } catch (\Throwable $e) {
        error_log('Admin settings update error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

/**
 * BIO-002: the Dean may revoke a Student's biometric enrollment; the Student
 * must then re-enroll. The Dean cannot enroll on the Student's behalf.
 */
function handle_admin_biometric_revoke(): void
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
        $authCtx = admin_verify_auth($pdo, $config);
        $body = request_body();
        $data = $body['has_body'] && is_array($body['data']) ? $body['data'] : [];
        $studentId = filter_var($data['studentId'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
        if ($studentId === false) {
            throw new ValidationException([['field' => 'studentId', 'message' => 'A valid student is required.']]);
        }
        $reason = validate_required_string($data, 'reason', 8, 240);

        $pdo->beginTransaction();
        try {
            $revoked = student_biometric_invalidate(
                $pdo, $config, $authCtx, $context, (int) $studentId, 'revoked',
                'biometric_enrollment_revoked_by_dean',
                'The Dean revoked the Student\'s biometric enrollment; re-enrollment is required.',
                $reason
            );
            if (!$revoked) {
                $pdo->rollBack();
                safe_error_response('This Student has no active biometric enrollment.', 409);
                return;
            }
            $recipientStmt = $pdo->prepare('SELECT COALESCE(student_account_user_id, user_id) FROM students WHERE student_id = ?');
            $recipientStmt->execute([(int) $studentId]);
            $recipientUserId = (int) $recipientStmt->fetchColumn();
            if ($recipientUserId > 0) {
                notification_create_idempotent(
                    $pdo,
                    $recipientUserId,
                    'biometric_enrollment',
                    'Face check-in enrollment revoked',
                    "The Dean revoked your face check-in enrollment. Re-enroll from Face Registration to use face check-in again; manual attendance remains available. Reason: {$reason}",
                    'student',
                    (string) $studentId,
                    'biometric-dean-revoke:' . $studentId . ':' . attendance_session_now_utc()->format('YmdHisu')
                );
            }
            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) { $pdo->rollBack(); }
            throw $e;
        }
        json_response(['status' => 'ok', 'message' => 'Biometric enrollment revoked. The Student must re-enroll to use face check-in.'], 200);
    } catch (ValidationException $e) {
        validation_error_response($e->getErrors());
    } catch (StudentBiometricException $e) {
        safe_error_response($e->getMessage(), 503);
    } catch (\Throwable $e) {
        error_log('Admin biometric revoke error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

function handle_admin_reports_summary(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = admin_verify_auth($pdo, $config);
        $currentSchoolYear = academic_current_school_year($pdo);
        $schoolYear = academic_resolve_school_year_filter($pdo, $_GET['schoolYear'] ?? null);
        $yearParams = $schoolYear === null ? [] : [':school_year' => $schoolYear];
        $yearWhere = $schoolYear === null ? '' : 'WHERE UPPER(cs.school_year) = UPPER(:school_year)';
        $availableSchoolYears = academic_school_year_options(
            $pdo->query('SELECT DISTINCT school_year FROM class_sections WHERE school_year IS NOT NULL')->fetchAll(PDO::FETCH_COLUMN),
            $currentSchoolYear
        );

        // Fetch students with biometric consent. With a school year, only
        // students enrolled in that year's classes are listed.
        $stmt = $pdo->prepare(
            "SELECT s.student_id, s.student_number,
                    COALESCE(pi.name_prefix, s.name_prefix) AS name_prefix,
                    COALESCE(pi.first_name, s.first_name) AS first_name,
                    COALESCE(pi.middle_name, s.middle_name) AS middle_name,
                    COALESCE(pi.last_name, s.last_name) AS last_name,
                    COALESCE(pi.name_suffix, s.name_suffix) AS name_suffix,
                    s.bu_email, s.year_level, s.status, b.consent_status, b.face_enrolled,
                    COALESCE(egb.final_gwa, e.final_gwa) AS final_gwa,
                    COALESCE(egb.final_percentage, e.final_percentage) AS final_percentage,
                    " . retention_effective_state_sql('e', 'COALESCE(egb.retention_state, e.retention_state)') . " AS retention_state,
                    e.remedial_state_json, ers.status AS normalized_remedial_status,
                    ers.original_grade AS normalized_original_grade,
                    ers.remedial_score AS normalized_remedial_score,
                    ers.remedial_grade AS normalized_remedial_grade,
                    ers.exam_date AS normalized_exam_date,
                    ers.notes AS normalized_remedial_notes,
                    e.grade_components_json, e.clinic_hours_completed,
                    cs.cs_id, cs.cs_name, c.course_code, c.name AS course_name, c.units, c.is_clinical
             FROM students s
             LEFT JOIN person_identities pi ON pi.person_id = s.person_id
             LEFT JOIN enrollments e ON e.student_id = s.student_id AND e.cs_id NOT IN (SELECT hx.cs_id FROM class_sections hx WHERE hx.archive_reason IN ('cancelled', 'mistake'))
             LEFT JOIN enrollment_grade_breakdowns egb ON egb.enrollment_id = e.enrollment_id
             LEFT JOIN enrollment_remedial_states ers ON ers.enrollment_id = e.enrollment_id
             LEFT JOIN class_sections cs ON cs.cs_id = e.cs_id
             LEFT JOIN courses c ON c.course_id = cs.course_id
             LEFT JOIN biometric_profiles b ON s.student_id = b.student_id
             {$yearWhere}
             ORDER BY s.student_number ASC, cs.cs_id ASC"
        );
        $stmt->execute($yearParams);
        $students = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Fetch attendance logs. Aliases are quoted: PostgreSQL lowercases
        // unquoted aliases, and the page reads these camelCase keys.
        $attStmt = $pdo->prepare(
            "SELECT r.record_id AS id, s.student_id AS \"studentId\", r.session_date AS date,
                    c.course_code AS \"subjectCode\", cs.cs_name AS \"className\", r.status
             FROM attendance_records r
             JOIN enrollments e ON e.enrollment_id = r.enrollment_id
             JOIN students s ON s.student_id = e.student_id
             JOIN class_sections cs ON cs.cs_id = e.cs_id
             JOIN courses c ON c.course_id = cs.course_id
             {$yearWhere} " . ($schoolYear === null ? 'WHERE' : 'AND') . "
                 NOT EXISTS (SELECT 1 FROM attendance_sessions rs WHERE rs.session_id = r.attendance_session_id AND rs.status = 'revoked')
                 AND (cs.archive_reason IS NULL OR cs.archive_reason = 'finished')
             ORDER BY session_date DESC"
        );
        $attStmt->execute($yearParams);
        $attendanceLogs = array_map(static fn(array $row): array => [
            'id' => (string) $row['id'],
            'studentId' => (string) $row['studentId'],
            'date' => $row['date'],
            'subjectCode' => $row['subjectCode'],
            'className' => $row['className'],
            'status' => $row['status'],
        ], $attStmt->fetchAll(PDO::FETCH_ASSOC));

        $grouped = [];
        $gwaTotals = [];
        $stateRank = ['remedial' => 3, 'cleared' => 2, 'active' => 1];
        foreach ($students as $s) {
            $id = (string) $s['student_id'];
            if (!isset($grouped[$id])) {
                $grouped[$id] = [
                    'id' => $id, 'studentId' => $s['student_number'],
                    'name' => trim($s['first_name'] . ' ' . ($s['middle_name'] ? $s['middle_name'] . ' ' : '') . $s['last_name']),
                    'email' => $s['bu_email'] ?? '', 'yearLevel' => $s['year_level'] !== null ? (int) $s['year_level'] : null,
                    'status' => $s['retention_state'] ?? strtolower($s['status'] ?? 'active'),
                    'overallGWA' => null, 'faceEnrolled' => (bool) ($s['face_enrolled'] ?? false),
                    'consentStatus' => $s['consent_status'] ?? 'pending', 'classId' => null,
                    'className' => null, 'enrolledSubjects' => [], 'remedialExams' => [],
                    'clinicHoursCompleted' => 0,
                ];
                $gwaTotals[$id] = ['weighted' => 0.0, 'units' => 0.0];
            }
            if ($s['cs_id'] !== null) {
                $grouped[$id]['classId'] = (string) $s['cs_id'];
                $grouped[$id]['className'] = $s['cs_name'];
                // Final grade of the class shown for this student (the same enrollment as classId).
                $grouped[$id]['classGraded'] = $s['final_gwa'] !== null;
                // Standing is the most serious state across all enrollments.
                $state = strtolower((string) ($s['retention_state'] ?? 'active'));
                if (($stateRank[$state] ?? 0) > ($stateRank[strtolower((string) $grouped[$id]['status'])] ?? 0)) {
                    $grouped[$id]['status'] = $state;
                }
                $grouped[$id]['clinicHoursCompleted'] += (int) ($s['clinic_hours_completed'] ?? 0);
                // Overall GWA is the unit-weighted average of recorded course grades.
                if ($s['final_gwa'] !== null) {
                    $units = (float) ($s['units'] ?? 0) > 0 ? (float) $s['units'] : 1.0;
                    $gwaTotals[$id]['weighted'] += (float) $s['final_gwa'] * $units;
                    $gwaTotals[$id]['units'] += $units;
                    $grouped[$id]['overallGWA'] = round($gwaTotals[$id]['weighted'] / $gwaTotals[$id]['units'], 2);
                }
                $grouped[$id]['enrolledSubjects'][] = [
                    'code' => $s['course_code'], 'name' => $s['course_name'],
                    'units' => (float) $s['units'], 'grade' => $s['final_gwa'] !== null ? (float) $s['final_gwa'] : null,
                    'percentage' => $s['final_percentage'] !== null ? (float) $s['final_percentage'] : null,
                    'isClinical' => (bool) $s['is_clinical'],
                    'hasRemedial' => $s['retention_state'] === 'remedial',
                    'components' => $s['grade_components_json'] ? json_decode($s['grade_components_json'], true) : null,
                ];
                $legacyRemedial = remedial_state_json_legacy_payload($s['remedial_state_json']);
                // enrollment_remedial_states is a projection of the same JSON,
                // so an override-only value (not a remedial record) is skipped.
                if ($legacyRemedial !== null) {
                    $remedial = $legacyRemedial;
                    if ($s['normalized_remedial_status'] !== null) {
                        $remedial['status'] = $s['normalized_remedial_status'];
                        $remedial['originalGrade'] = $s['normalized_original_grade'] !== null ? (float) $s['normalized_original_grade'] : null;
                        $remedial['remedialScore'] = $s['normalized_remedial_score'] !== null ? (float) $s['normalized_remedial_score'] : null;
                        $remedial['remedialGrade'] = $s['normalized_remedial_grade'] !== null ? (float) $s['normalized_remedial_grade'] : null;
                        $remedial['examDate'] = $s['normalized_exam_date'];
                        $remedial['notes'] = $s['normalized_remedial_notes'];
                    }
                    $grouped[$id]['remedialExams'][] = $remedial;
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
            'schoolYear' => $schoolYear,
            'currentSchoolYear' => $currentSchoolYear,
            'availableSchoolYears' => $availableSchoolYears,
        ], 200);
    } catch (ValidationException $e) {
        validation_error_response($e->getErrors());
    } catch (\Throwable $e) {
        error_log('Admin reports error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

/** ACA-002 Settings operations share authentication, transaction and error handling. */
function handle_admin_academic_terms(): void
{
    $pdo = null;
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $actor = admin_verify_auth($pdo, $config);
        if (request_method() === 'GET') {
            json_response(['status' => 'ok', 'currentSchoolYear' => academic_current_school_year($pdo),
                'today' => app_local_date($config, attendance_session_now_utc()), 'terms' => academic_terms_list($pdo)]);
            return;
        }
        $body = request_body();
        if (!$body['has_body']) { safe_error_response('Request body required.', 400); return; }
        $pdo->beginTransaction();
        academic_terms_lock($pdo);
        $data = $body['data'];
        $path = request_path();
        if (str_ends_with($path, '/copy')) {
            $result = academic_terms_copy_year($pdo, $config, $actor);
        } elseif (str_ends_with($path, '/delete')) {
            academic_term_delete($pdo, $config, $actor, (int) ($data['id'] ?? 0));
            $result = [];
        } else {
            $result = academic_term_save($pdo, $config, $actor, $data, str_ends_with($path, '/preview'));
        }
        if (str_ends_with($path, '/preview') || ($result['confirmationRequired'] ?? false)) $pdo->rollBack();
        else $pdo->commit();
        json_response(['status' => 'ok'] + $result);
    } catch (ValidationException $e) {
        if ($pdo instanceof PDO && $pdo->inTransaction()) $pdo->rollBack();
        validation_error_response($e->getErrors());
    } catch (Throwable $e) {
        if ($pdo instanceof PDO && $pdo->inTransaction()) $pdo->rollBack();
        error_log('Academic terms error: ' . sanitize_for_log($e));
        safe_error_response('Unable to save academic terms.', 500);
    }
}
