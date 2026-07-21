<?php

declare(strict_types=1);

if (!function_exists('sanitize_for_log')) {
    function sanitize_for_log(\Throwable $e): string
    {
        return get_class($e) . ' [' . ($e->getCode() > 0 ? $e->getCode() : 0) . ']';
    }
}

function handle_register(): void
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

        $body = request_body();
        if (!$body['has_body']) {
            safe_error_response('Request body required.', 400);
            return;
        }

        $data = $body['data'];
        $name = validate_required_string($data, 'name', 2, 255);
        $email = validate_institutional_email($data['email'] ?? '');
        $password = extract_password($data, 'password');
        validate_password_policy($password);

        // Check if email already registered
        $stmt = $pdo->prepare("SELECT user_id, status FROM user_accounts WHERE login_email = ?");
        $stmt->execute([$email]);
        $existing = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($existing !== false) {
            validation_error_response([
                ['field' => 'email', 'message' => 'An account with this email address already exists.']
            ]);
            return;
        }

        $passwordHash = password_hash($password, PASSWORD_DEFAULT);
        $nowSql = (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d H:i:s.u');

        $pdo->beginTransaction();
        try {
            $macKey = config_key_bytes_at_least($config['audit']['mac_key_b64'], 32, 'AUDIT_MAC_KEY');
            $auditCtx = audit_begin_operation($pdo);

            $ins = $pdo->prepare(
                "INSERT INTO user_accounts (login_email, password_hash, role, display_name, title, status, created_at)
                 VALUES (?, ?, 'faculty', ?, 'Dental Faculty Member', 'Pending', ?)"
            );
            $ins->execute([$email, $passwordHash, $name, $nowSql]);
            $newUserId = (int) $pdo->lastInsertId();

            audit_finish_operation($pdo, $auditCtx, [
                'module_code' => 'auth',
                'action_code' => 'user_registration',
                'event_status' => 'Success',
                'actor_user_id' => $newUserId,
                'actor_username' => $email,
                'actor_role' => 'faculty',
                'actor_display_name' => $name,
                'session_id' => null,
                'target_type' => 'user_account',
                'target_id' => (string) $newUserId,
                'description' => 'Faculty registration submitted. Pending administrator approval.',
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
            'message' => 'Registration submitted successfully. Your account is pending administrator approval.',
        ], 201);
    } catch (ValidationException $e) {
        validation_error_response($e->getErrors());
    } catch (InvalidCredentialsException $e) {
        validation_error_response([['field' => 'password', 'message' => $e->getMessage()]]);
    } catch (\Throwable $e) {
        error_log('Register error [' . ($context['request_id'] ?? '?') . ']: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

function handle_admin_list_faculty(): void
{
    $context = [
        'request_id' => request_id(),
        'ip_address' => request_ip(),
        'user_agent' => request_user_agent(),
        'http_method' => request_method(),
        'endpoint' => request_path(),
        'auth_header' => request_header('Authorization') ?? '',
    ];

    try {
        $config = app_config();
        $pdo = create_pdo($config);

        $authHeader = $context['auth_header'];
        if ($authHeader === '') {
            auth_error_response('Authorization header required.', 401);
            return;
        }

        $token = auth_extract_bearer_token($authHeader);
        $jwtKey = config_key_bytes_at_least($config['jwt']['signing_key_b64'], 32, 'JWT_SIGNING_KEY');
        $authCtx = auth_verify_access_token($pdo, $token, $jwtKey);

        if ($authCtx['role'] !== 'admin') {
            safe_error_response('Access denied. Administrator privileges required.', 403);
            return;
        }

        $stmt = $pdo->prepare(
            "SELECT user_id AS id, login_email AS email, display_name AS name, role, title, status, created_at AS createdAt, approved_at AS approvedAt, rejected_at AS rejectedAt
             FROM user_accounts
             WHERE role = 'faculty' OR status = 'Pending'
             ORDER BY created_at DESC"
        );
        $stmt->execute();
        $users = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Map database status string to frontend format
        $mapped = array_map(function ($u) {
            $st = $u['status'];
            if ($st === 'Pending') $st = 'Pending Approval';
            return [
                'id' => (string) $u['id'],
                'email' => $u['email'],
                'name' => $u['name'],
                'role' => $u['role'],
                'title' => $u['title'] ?? 'Faculty Member',
                'status' => $st,
                'createdAt' => $u['createdAt'],
                'approvedAt' => $u['approvedAt'],
                'rejectedAt' => $u['rejectedAt'],
            ];
        }, $users);

        json_response($mapped, 200);
    } catch (AuthException | ChallengeException $e) {
        auth_error_response('Authentication required.', 401);
    } catch (\Throwable $e) {
        error_log('Admin list faculty error [' . ($context['request_id'] ?? '?') . ']: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

function handle_admin_faculty_approval(): void
{
    $context = [
        'request_id' => request_id(),
        'ip_address' => request_ip(),
        'user_agent' => request_user_agent(),
        'http_method' => request_method(),
        'endpoint' => request_path(),
        'auth_header' => request_header('Authorization') ?? '',
    ];

    try {
        $config = app_config();
        $pdo = create_pdo($config);

        $authHeader = $context['auth_header'];
        if ($authHeader === '') {
            auth_error_response('Authorization header required.', 401);
            return;
        }

        $token = auth_extract_bearer_token($authHeader);
        $jwtKey = config_key_bytes_at_least($config['jwt']['signing_key_b64'], 32, 'JWT_SIGNING_KEY');
        $authCtx = auth_verify_access_token($pdo, $token, $jwtKey);

        if ($authCtx['role'] !== 'admin') {
            safe_error_response('Access denied. Administrator privileges required.', 403);
            return;
        }

        $body = request_body();
        if (!$body['has_body']) {
            safe_error_response('Request body required.', 400);
            return;
        }

        $email = validate_email($body['data']['email'] ?? '');
        $action = validate_enum($body['data'], 'action', ['approve', 'reject']);

        $stmt = $pdo->prepare("SELECT user_id, login_email, display_name, status FROM user_accounts WHERE login_email = ?");
        $stmt->execute([$email]);
        $targetUser = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($targetUser === false) {
            safe_error_response('Faculty account not found.', 404);
            return;
        }

        $nowSql = (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d H:i:s.u');

        $pdo->beginTransaction();
        try {
            $macKey = config_key_bytes_at_least($config['audit']['mac_key_b64'], 32, 'AUDIT_MAC_KEY');
            $auditCtx = audit_begin_operation($pdo);

            if ($action === 'approve') {
                $upd = $pdo->prepare("UPDATE user_accounts SET status = 'Active', approved_at = ? WHERE user_id = ?");
                $upd->execute([$nowSql, $targetUser['user_id']]);
                $actionCode = 'faculty_account_approved';
                $message = "Faculty account for {$targetUser['display_name']} ({$email}) has been approved.";
            } else {
                $upd = $pdo->prepare("UPDATE user_accounts SET status = 'Rejected', rejected_at = ? WHERE user_id = ?");
                $upd->execute([$nowSql, $targetUser['user_id']]);
                $actionCode = 'faculty_account_rejected';
                $message = "Faculty account request for {$targetUser['display_name']} ({$email}) has been rejected.";
            }

            audit_finish_operation($pdo, $auditCtx, [
                'module_code' => 'admin',
                'action_code' => $actionCode,
                'event_status' => 'Success',
                'actor_user_id' => $authCtx['user_id'],
                'actor_username' => $authCtx['login_email'],
                'actor_role' => $authCtx['role'],
                'actor_display_name' => $authCtx['display_name'],
                'session_id' => $authCtx['session_id'],
                'target_type' => 'user_account',
                'target_id' => (string) $targetUser['user_id'],
                'description' => $message,
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
            'message' => $message,
        ], 200);
    } catch (ValidationException $e) {
        validation_error_response($e->getErrors());
    } catch (AuthException | ChallengeException $e) {
        auth_error_response('Authentication required.', 401);
    } catch (\Throwable $e) {
        error_log('Admin faculty approval error [' . ($context['request_id'] ?? '?') . ']: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}
