<?php

declare(strict_types=1);

// CLS-004 join a class by code. Logic: backend/app/class_join.php.
require_once dirname(__DIR__) . '/app/class_join.php';
require_once __DIR__ . '/FacultyController.php';
require_once __DIR__ . '/SecretaryController.php';
require_once __DIR__ . '/StudentAcademicController.php';

/** Shared envelope: runs $work, mapping the usual failures to responses. */
function class_join_run(callable $work): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $work($pdo, $config);
    } catch (RateLimitException $e) {
        $response = build_error_response(CLASS_JOIN_TOO_MANY, 429, 'RATE_LIMITED');
        if ($e->retryAfterSeconds > 0) {
            $response['headers'][] = 'Retry-After: ' . $e->retryAfterSeconds;
        }
        emit_response($response);
    } catch (DomainException $e) {
        if ($e->getMessage() === 'One or more selected Students are not active.' || str_starts_with($e->getMessage(), 'This Student cannot be added')) {
            safe_error_response($e->getMessage(), 422);
            return;
        }
        safe_error_response($e->getMessage(), 409);
    } catch (\Throwable $e) {
        error_log('Class join error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

/** The Faculty member's own class, or an error response and null. */
function class_join_faculty_class(PDO $pdo, array $authCtx, mixed $csId): ?array
{
    $id = faculty_owned_class_id($pdo, (int) $authCtx['user_id'], (string) (int) $csId);
    $class = $id > 0 ? class_join_class_row($pdo, $id) : null;
    if ($class === null) {
        safe_error_response('Class is not assigned to this faculty member.', 403);
    }
    return $class;
}

/** Same, and the class must still take changes (current year, not archived). */
function class_join_faculty_open_class(PDO $pdo, array $config, array $authCtx, mixed $csId): ?array
{
    $class = class_join_faculty_class($pdo, $authCtx, $csId);
    if ($class !== null && !class_join_class_is_open($pdo, $config, $class)) {
        safe_error_response(academic_view_only_message($pdo, (int) $class['cs_id']), 409);
        return null;
    }
    return $class;
}

function handle_class_join_faculty_get(): void
{
    class_join_run(static function (PDO $pdo, array $config): void {
        $authCtx = faculty_verify_auth($pdo, $config);
        $class = class_join_faculty_class($pdo, $authCtx, $_GET['csId'] ?? 0);
        if ($class === null) {
            return;
        }
        $pdo->beginTransaction();
        $settings = class_join_settings($pdo, $config, $class, true);
        $pdo->commit();
        json_response(['status' => 'ok'] + $settings, 200);
    });
}

function handle_class_join_faculty_new_code(): void
{
    class_join_run(static function (PDO $pdo, array $config): void {
        $authCtx = faculty_verify_auth($pdo, $config);
        $body = request_body();
        $class = class_join_faculty_open_class($pdo, $config, $authCtx, $body['data']['csId'] ?? 0);
        if ($class === null) {
            return;
        }
        $pdo->beginTransaction();
        try {
            class_join_store_code($pdo, (int) $class['cs_id'], false);
            class_join_audit($pdo, $config, $authCtx, 'class_code_regenerated', (int) $class['cs_id'], 'Replaced the join code of ' . audit_class_label($pdo, (int) $class['cs_id']) . '.');
            $settings = class_join_settings($pdo, $config, class_join_class_row($pdo, (int) $class['cs_id']), true);
            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) { $pdo->rollBack(); }
            throw $e;
        }
        json_response(['status' => 'ok'] + $settings, 200);
    });
}

function handle_class_join_faculty_settings(): void
{
    class_join_run(static function (PDO $pdo, array $config): void {
        $authCtx = faculty_verify_auth($pdo, $config);
        $data = request_body()['data'] ?? [];
        $class = class_join_faculty_open_class($pdo, $config, $authCtx, $data['csId'] ?? 0);
        if ($class === null) {
            return;
        }
        $csId = (int) $class['cs_id'];
        $changes = [
            'enabled' => ['join_code_enabled', (bool) $class['join_code_enabled'], ['class_code_disabled', 'class_code_enabled'], 'Join code'],
            'autoApprove' => ['join_auto_approve', (bool) $class['join_auto_approve'], ['class_auto_approve_changed', 'class_auto_approve_changed'], 'Auto-approve'],
        ];
        $pdo->beginTransaction();
        try {
            foreach ($changes as $key => [$column, $current, $codes, $label]) {
                if (!array_key_exists($key, $data)) {
                    continue;
                }
                if (!is_bool($data[$key])) {
                    $pdo->rollBack();
                    safe_error_response("{$key} must be true or false.", 422);
                    return;
                }
                if ($data[$key] === $current) {
                    continue;
                }
                $stmt = $pdo->prepare("UPDATE class_sections SET {$column} = ? WHERE cs_id = ?");
                $stmt->bindValue(1, $data[$key], PDO::PARAM_BOOL);
                $stmt->bindValue(2, $csId, PDO::PARAM_INT);
                $stmt->execute();
                $word = $data[$key] ? 'on' : 'off';
                class_join_audit($pdo, $config, $authCtx, $codes[$data[$key] ? 1 : 0], $csId,
                    "Turned {$label} {$word} for " . audit_class_label($pdo, $csId) . '.', null,
                    [$column => $current], [$column => $data[$key]]);
            }
            $settings = class_join_settings($pdo, $config, class_join_class_row($pdo, $csId), true);
            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) { $pdo->rollBack(); }
            throw $e;
        }
        json_response(['status' => 'ok'] + $settings, 200);
    });
}

function handle_class_join_faculty_requests(): void
{
    class_join_run(static function (PDO $pdo, array $config): void {
        $authCtx = faculty_verify_auth($pdo, $config);
        $class = class_join_faculty_class($pdo, $authCtx, $_GET['csId'] ?? 0);
        if ($class === null) {
            return;
        }
        $stmt = $pdo->prepare(
            "SELECT r.request_id, r.created_at, s.student_id, s.student_number, s.bu_email,
                    COALESCE(pi.name_prefix, s.name_prefix) AS name_prefix, COALESCE(pi.first_name, s.first_name) AS first_name,
                    COALESCE(pi.middle_name, s.middle_name) AS middle_name, COALESCE(pi.last_name, s.last_name) AS last_name,
                    COALESCE(pi.name_suffix, s.name_suffix) AS name_suffix
               FROM class_join_requests r
               JOIN students s ON s.student_id = r.student_id
               LEFT JOIN person_identities pi ON pi.person_id = s.person_id
              WHERE r.cs_id = ? AND r.status = 'pending'
              ORDER BY r.created_at, r.request_id"
        );
        $stmt->execute([(int) $class['cs_id']]);
        $requests = array_map(static fn(array $r): array => [
            'requestId' => (int) $r['request_id'],
            'studentId' => (int) $r['student_id'],
            'studentNumber' => (string) $r['student_number'],
            'name' => account_identity_display_name($r),
            'email' => $r['bu_email'] !== null ? (string) $r['bu_email'] : null,
            'requestedAt' => (string) $r['created_at'],
        ], $stmt->fetchAll(PDO::FETCH_ASSOC));
        json_response(['status' => 'ok', 'requests' => $requests], 200);
    });
}

function class_join_faculty_decide(bool $approve): void
{
    class_join_run(static function (PDO $pdo, array $config) use ($approve): void {
        $authCtx = faculty_verify_auth($pdo, $config);
        $data = request_body()['data'] ?? [];
        $class = class_join_faculty_class($pdo, $authCtx, $data['csId'] ?? 0);
        if ($class === null) {
            return;
        }
        $requestId = (int) ($data['requestId'] ?? 0);
        if ($requestId <= 0) {
            safe_error_response('requestId is required.', 400);
            return;
        }
        $pdo->beginTransaction();
        try {
            class_join_decide($pdo, $config, $authCtx, $requestId, (int) $class['cs_id'], $approve);
            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) { $pdo->rollBack(); }
            throw $e;
        }
        json_response(['status' => 'ok'], 200);
    });
}

function handle_class_join_faculty_approve(): void
{
    class_join_faculty_decide(true);
}

function handle_class_join_faculty_reject(): void
{
    class_join_faculty_decide(false);
}

/**
 * Student code lookup shared by the join and the preview: wrong-try limit, normalize, find the open class.
 * A miss counts as a wrong try (10 in 15 minutes block), answers 404 and returns null.
 */
function class_join_student_find_open_class(PDO $pdo, array $config, array $authCtx, mixed $rawCode): ?array
{
    $storage = ['dir' => $config['rate_limit']['storage_dir']];
    $scope = bin2hex(hash('sha256', 'class-join:' . $authCtx['user_id'], true));
    rate_limit_assert_not_blocked($storage, $scope, 'post_class_join_wrong', 900, 10);

    $code = class_join_normalize($rawCode);
    $class = null;
    if ($code !== null) {
        $stmt = $pdo->prepare('SELECT cs_id FROM class_sections WHERE join_code = ? AND join_code_enabled');
        $stmt->execute([$code]);
        $csId = (int) ($stmt->fetchColumn() ?: 0);
        $class = $csId > 0 ? class_join_class_row($pdo, $csId) : null;
    }
    if ($class === null || !class_join_class_is_open($pdo, $config, $class)) {
        rate_limit_record_login_failure($storage, $scope, 'post_class_join_wrong', 900, 10, 900); // throws on the 10th
        safe_error_response(CLASS_JOIN_NO_MATCH, 404);
        return null;
    }
    return $class;
}

/** CLS-004: shows the Student the class behind a code before joining. Read-only, so no audit row (SEC-005). */
function handle_class_join_student_preview(): void
{
    class_join_run(static function (PDO $pdo, array $config): void {
        $authCtx = student_academic_verify_auth($pdo, $config);
        $class = class_join_student_find_open_class($pdo, $config, $authCtx, $_GET['code'] ?? '');
        if ($class === null) {
            return;
        }
        $state = $pdo->prepare(
            "SELECT EXISTS (SELECT 1 FROM enrollments WHERE student_id = :s AND cs_id = :c AND LOWER(status) = 'active'),
                    EXISTS (SELECT 1 FROM class_join_requests WHERE student_id = :s AND cs_id = :c AND status = 'pending')"
        );
        $state->execute(['s' => (int) $authCtx['student_id'], 'c' => (int) $class['cs_id']]);
        [$enrolled, $pending] = $state->fetch(PDO::FETCH_NUM);
        json_response(['status' => 'ok', 'class' => [
            'courseCode' => (string) $class['course_code'],
            'title' => trim((string) $class['course_name']),
            'section' => (string) $class['cs_name'],
            'facultyName' => (string) ($class['faculty_name'] ?? ''),
            'semester' => (string) $class['semester'],
            'schoolYear' => (string) $class['school_year'],
        ], 'alreadyEnrolled' => (bool) $enrolled, 'pending' => (bool) $pending], 200);
    });
}

function handle_class_join_student_join(): void
{
    class_join_run(static function (PDO $pdo, array $config): void {
        $authCtx = student_academic_verify_auth($pdo, $config);
        $class = class_join_student_find_open_class($pdo, $config, $authCtx, request_body()['data']['code'] ?? '');
        if ($class === null) {
            return;
        }

        $csId = (int) $class['cs_id'];
        $studentId = (int) $authCtx['student_id'];
        $pdo->beginTransaction();
        try {
            $already = $pdo->prepare("SELECT 1 FROM enrollments WHERE student_id = ? AND cs_id = ? AND LOWER(status) = 'active'");
            $already->execute([$studentId, $csId]);
            if ($already->fetchColumn() !== false) {
                $pdo->rollBack();
                safe_error_response('You are already in this class.', 409);
                return;
            }
            $insert = $pdo->prepare("INSERT INTO class_join_requests (cs_id, student_id, requested_by_user_id) VALUES (?, ?, ?)
                                     ON CONFLICT (cs_id, student_id) WHERE status = 'pending' DO NOTHING RETURNING request_id");
            $insert->execute([$csId, $studentId, (int) $authCtx['user_id']]);
            $requestId = $insert->fetchColumn();
            if ($requestId === false) {
                $pdo->rollBack();
                safe_error_response('Your request to join is waiting for the Faculty.', 409);
                return;
            }
            class_join_audit($pdo, $config, $authCtx, 'class_join_requested', $csId,
                audit_student_label($pdo, $studentId) . ' asked to join ' . audit_class_label($pdo, $csId) . '.', $studentId);
            $joined = (bool) $class['join_auto_approve'];
            if ($joined) {
                class_join_decide($pdo, $config, CLASS_JOIN_SYSTEM_ACTOR, (int) $requestId, $csId, true);
            } else {
                $facultyUserId = (int) ($class['instructor_user_id'] ?? 0);
                if ($facultyUserId > 0 && $facultyUserId !== (int) $authCtx['user_id']) {
                    $facultyStmt = $pdo->prepare("SELECT user_id FROM user_accounts WHERE user_id = ? AND LOWER(status) = 'active' LIMIT 1");
                    $facultyStmt->execute([$facultyUserId]);
                    if ($facultyStmt->fetchColumn() !== false) {
                        notification_create_idempotent(
                            $pdo,
                            $facultyUserId,
                            'class_enrollment',
                            'Join request waiting',
                            audit_student_label($pdo, $studentId) . ' requested to join ' . class_join_label($class) . '.',
                            'class_section',
                            (string) $csId,
                            "class-join-request:{$requestId}:{$facultyUserId}"
                        );
                    }
                }
            }
            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) { $pdo->rollBack(); }
            throw $e;
        }
        json_response(['status' => 'ok', 'result' => $joined ? 'joined' : 'pending', 'className' => class_join_label($class)], 200);
    });
}

function handle_class_join_student_requests(): void
{
    class_join_run(static function (PDO $pdo, array $config): void {
        $authCtx = student_academic_verify_auth($pdo, $config);
        $stmt = $pdo->prepare(
            "SELECT r.request_id, r.created_at, cs.cs_name, c.course_code, COALESCE(cs.course_title, c.name) AS course_name
               FROM class_join_requests r
               JOIN class_sections cs ON cs.cs_id = r.cs_id
               JOIN courses c ON c.course_id = cs.course_id
              WHERE r.student_id = ? AND r.status = 'pending'
              ORDER BY r.created_at DESC, r.request_id DESC"
        );
        $stmt->execute([(int) $authCtx['student_id']]);
        $requests = array_map(static fn(array $r): array => [
            'requestId' => (int) $r['request_id'],
            'classCode' => (string) $r['course_code'],
            'title' => (string) $r['course_name'],
            'section' => (string) $r['cs_name'],
            'requestedAt' => (string) $r['created_at'],
        ], $stmt->fetchAll(PDO::FETCH_ASSOC));
        json_response(['status' => 'ok', 'requests' => $requests], 200);
    });
}
