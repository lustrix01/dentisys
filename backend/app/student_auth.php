<?php

declare(strict_types=1);

const STUDENT_ACTIVATION_TOKEN_LENGTH = 43;
const STUDENT_ACTIVATION_TOKEN_PATTERN = '/^[A-Za-z0-9_-]{43}$/';

function student_auth_is_enabled(array $config): bool
{
    return ($config['features']['student_auth_enabled'] ?? false) === true;
}

function student_auth_mock_is_available(array $config): bool
{
    return student_auth_is_enabled($config)
        && in_array(($config['app']['env'] ?? ''), ['development', 'test'], true)
        && (($config['mocks']['identity'] ?? false) === true);
}

/**
 * Persist a bounded Student eligibility denial on an independent connection.
 * The independent transaction prevents a denial event from disappearing when
 * the authentication transaction that discovered it is rolled back.
 */
function student_auth_record_eligibility_denied(PDO $pdo, array $config, int $userId, string $reason): void
{
    unset($pdo);
    $allowedReasons = [
        'student_auth_disabled',
        'development_mock_unavailable',
        'identity_missing',
        'role_mismatch',
        'account_inactive',
        'student_inactive',
        'identity_email_mismatch',
        'identity_invariant_failed',
    ];
    if (!in_array($reason, $allowedReasons, true)) {
        $reason = 'identity_invariant_failed';
    }

    $context = [
        'request_id' => function_exists('request_id') ? request_id() : null,
        'ip_address' => function_exists('request_ip') ? request_ip() : null,
        'user_agent' => function_exists('request_user_agent') ? request_user_agent() : null,
        'http_method' => function_exists('request_method') ? request_method() : null,
        'endpoint' => function_exists('request_path') ? request_path() : null,
    ];

    try {
        $auditPdo = create_pdo($config);
        student_auth_audit($auditPdo, $config, $context, 'student_auth_eligibility_denied', 'Failed', [
            // Keep the independent denial transaction free of a foreign-key
            // wait on a user row locked by the rejected auth transaction.
            'actor_user_id' => null,
            'actor_role' => 'student',
            'target_type' => 'user_account',
            'target_id' => (string) $userId,
            'description' => 'Student authentication eligibility denied.',
            'reason' => $reason,
        ]);
    } catch (Throwable $e) {
        error_log('Student eligibility denial audit skipped [' . ($context['request_id'] ?? '?') . ']: ' . sanitize_for_log($e));
    }
}

/**
 * Post-activation Student identity invariant. Enrollment is intentionally not
 * consulted here; enrollment is an initial provisioning and object-scope gate.
 */
function auth_assert_student_eligible(PDO $pdo, array $config, int $userId, bool $lock = false): array
{
    $deny = static function (PDO $connection, array $runtimeConfig, int $accountId, string $reason): void {
        student_auth_record_eligibility_denied($connection, $runtimeConfig, $accountId, $reason);
        throw new AuthException('Student authentication is unavailable.');
    };

    $lockSql = $lock ? ' FOR UPDATE' : '';
    $stmt = $pdo->prepare(
        "SELECT ua.user_id, ua.login_email, ua.role, ua.display_name, ua.status,
                s.student_id, s.student_number, s.status AS student_status, s.bu_email
           FROM user_accounts ua
           JOIN students s ON s.student_account_user_id = ua.user_id
          WHERE ua.user_id = ?{$lockSql}"
    );
    $stmt->execute([$userId]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (count($rows) !== 1) {
        $deny($pdo, $config, $userId, 'identity_missing');
    }

    $row = $rows[0];
    if ($row['role'] !== 'student') {
        $deny($pdo, $config, $userId, 'role_mismatch');
    }
    if ($row['status'] !== 'Active') {
        $deny($pdo, $config, $userId, 'account_inactive');
    }
    if (strtolower((string) $row['student_status']) !== 'active') {
        $deny($pdo, $config, $userId, 'student_inactive');
    }
    if ($row['bu_email'] === null
        || strtolower(trim((string) $row['bu_email'])) !== strtolower(trim((string) $row['login_email']))) {
        $deny($pdo, $config, $userId, 'identity_email_mismatch');
    }

    return [
        'student_id' => (int) $row['student_id'],
        'student_number' => (string) $row['student_number'],
        'status' => (string) $row['student_status'],
    ];
}

function require_student_identity(PDO $pdo, array $config, array $authContext): array
{
    if (($authContext['role'] ?? null) !== 'student') {
        throw new AuthException('Student authentication required.');
    }

    $student = auth_assert_student_eligible($pdo, $config, (int) $authContext['user_id']);
    return ['student_id' => $student['student_id'], 'student' => $student];
}

function require_owned_enrollment(PDO $pdo, array $config, array $authContext, int $enrollmentId): array
{
    $identity = require_student_identity($pdo, $config, $authContext);
    $stmt = $pdo->prepare(
        "SELECT enrollment_id, student_id, cs_id, status
           FROM enrollments
          WHERE enrollment_id = ? AND student_id = ? AND status = 'Active'"
    );
    $stmt->execute([$enrollmentId, $identity['student_id']]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($row === false) {
        throw new AuthException('Enrollment not found.');
    }
    return $row;
}

function student_auth_audit(PDO $pdo, array $config, array $context, string $action, string $status, array $event = []): void
{
    try {
        $macKey = config_key_bytes_at_least($config['audit']['mac_key_b64'], 32, 'AUDIT_MAC_KEY');
        $pdo->beginTransaction();
        try {
            $auditCtx = audit_begin_operation($pdo);
            audit_finish_operation($pdo, $auditCtx, array_merge([
                'module_code' => 'auth',
                'action_code' => $action,
                'event_status' => $status,
                'actor_user_id' => null,
                'actor_username' => null,
                'actor_role' => null,
                'actor_display_name' => null,
                'session_id' => null,
                'target_type' => null,
                'target_id' => null,
                'description' => null,
                'reason' => null,
                'http_method' => $context['http_method'] ?? null,
                'endpoint' => $context['endpoint'] ?? null,
                'request_id' => $context['request_id'] ?? null,
                'ip_address' => $context['ip_address'] ?? null,
                'user_agent' => $context['user_agent'] ?? null,
            ], $event), $macKey);
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) { $pdo->rollBack(); }
            throw $e;
        }
    } catch (Throwable $e) {
        error_log('Student auth audit skipped [' . ($context['request_id'] ?? '?') . ']: ' . sanitize_for_log($e));
    }
}

function student_auth_activation_raw_token(): string
{
    return base64url_encode(random_bytes(32));
}

function student_auth_activation_email(array $student, string $link): string
{
    $name = htmlspecialchars(trim((string) ($student['first_name'] . ' ' . $student['last_name'])));
    $safeLink = htmlspecialchars($link);
    return "<p>Hello {$name},</p>"
        . '<p>A Faculty member has invited you to activate your DentiSys Student account.</p>'
        . "<p><a href=\"{$safeLink}\">Activate your Student account</a></p>"
        . '<p>This invitation expires in 24 hours. If it was unexpected, please contact your Faculty member.</p>';
}

function student_auth_activation_context(PDO $pdo, string $tokenDigest): ?array
{
    $stmt = $pdo->prepare(
        "SELECT token_id, user_id, related_student_id, related_cs_id, token_digest,
                issued_at, expires_at, used_at, revoked_at
           FROM security_tokens
          WHERE purpose = 'student_activation' AND token_digest = ?
          LIMIT 1"
    );
    pdo_bind_binary($stmt, 1, $tokenDigest);
    $stmt->execute();
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row === false ? null : $row;
}

function student_auth_active_enrollment(PDO $pdo, int $studentId, bool $lock = false): bool
{
    $suffix = $lock ? ' FOR UPDATE' : '';
    $stmt = $pdo->prepare("SELECT enrollment_id FROM enrollments WHERE student_id = ? AND status = 'Active' LIMIT 1{$suffix}");
    $stmt->execute([$studentId]);
    return $stmt->fetchColumn() !== false;
}

function student_auth_active_class_enrollment(PDO $pdo, int $studentId, int $classId, bool $lock = false): bool
{
    $suffix = $lock ? ' FOR UPDATE' : '';
    $stmt = $pdo->prepare(
        "SELECT e.enrollment_id FROM enrollments e
          JOIN class_sections cs ON cs.cs_id = e.cs_id
          WHERE e.student_id = ? AND e.cs_id = ? AND e.status = 'Active'
            AND lower(cs.status) = 'active'
          LIMIT 1{$suffix}"
    );
    $stmt->execute([$studentId, $classId]);
    return $stmt->fetchColumn() !== false;
}
