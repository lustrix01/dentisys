<?php

declare(strict_types=1);

if (!function_exists('sanitize_for_log')) {
function sanitize_for_log(\Throwable $e): string
{
    return get_class($e) . ' [' . ($e->getCode() > 0 ? $e->getCode() : 0) . ']';
}
}

function handle_login(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);

        $context = [
            'request_id' => request_id(),
            'ip_address' => request_ip(),
            'user_agent' => request_user_agent(),
            'http_method' => request_method(),
            'endpoint' => request_path(),
        ];

        $body = request_body();

        if (!$body['has_body']) {
            auth_controller_emit(auth_build_no_store_message_response('Request body required.', 400));
            return;
        }

        $result = auth_runtime_login($pdo, $config, $body['data'], $context);

        if ($result['type'] === 'enrollment_start') {
            $payload = [
                'mfa_required' => true,
                'mfa_enrolled' => false,
                'enrollment_token' => $result['enrollment_token'],
            ];
        } else {
            $payload = [
                'mfa_required' => true,
                'mfa_enrolled' => true,
                'mfa_session_token' => $result['mfa_session_token'],
            ];
        }

        auth_controller_emit(auth_build_no_store_json_response($payload, 200));
    } catch (InvalidCredentialsException $e) {
        auth_controller_emit(auth_build_no_store_message_response('Invalid credentials.', 401));
    } catch (InactiveAccountException $e) {
        auth_controller_emit(auth_build_no_store_message_response($e->getMessage(), 403));
    } catch (TooManyMfaCredentialsException $e) {
        error_log('Login error [' . ($context['request_id'] ?? '?') . ']: ' . sanitize_for_log($e));
        auth_controller_emit(auth_build_no_store_message_response('Internal server error.', 500));
    } catch (ValidationException $e) {
        auth_controller_emit(auth_build_no_store_message_response('Validation failed.', 400));
    } catch (RateLimitException $e) {
        auth_controller_emit(auth_build_no_store_message_response('Too many requests.', 429));
    } catch (\Throwable $e) {
        error_log('Login error [' . ($context['request_id'] ?? '?') . ']: ' . sanitize_for_log($e));
        auth_controller_emit(auth_build_no_store_message_response('Internal server error.', 500));
    }
}

function handle_register(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);

        $body = request_body();
        if (!$body['has_body']) {
            auth_controller_emit(auth_build_no_store_message_response('Request body required.', 400));
            return;
        }

        $data = $body['data'];
        $email = trim(strtolower((string) ($data['email'] ?? '')));
        $password = (string) ($data['password'] ?? '');
        $name = trim((string) ($data['name'] ?? ''));
        $role = trim(strtolower((string) ($data['role'] ?? 'faculty')));

        if ($email === '' || $password === '' || $name === '') {
            auth_controller_emit(auth_build_no_store_message_response('Name, email, and password are required.', 400));
            return;
        }

        if (strlen($password) < 8) {
            auth_controller_emit(auth_build_no_store_message_response('Password must be at least 8 characters.', 400));
            return;
        }

        if (!in_array($role, ['faculty', 'admin', 'secretary'], true)) {
            $role = 'faculty';
        }

        $stmt = $pdo->prepare("SELECT user_id FROM user_accounts WHERE login_email = ?");
        $stmt->execute([$email]);
        if ($stmt->fetch()) {
            auth_controller_emit(auth_build_no_store_message_response('Email address is already registered.', 409));
            return;
        }

        $hash = password_hash($password, PASSWORD_DEFAULT);
        $status = ($role === 'faculty') ? 'Pending Approval' : 'Active';

        $pdo->beginTransaction();
        $stmt = $pdo->prepare(
            "INSERT INTO user_accounts (login_email, password_hash, role, display_name, status, token_version)
             VALUES (?, ?, ?, ?, ?, 1)"
        );
        $stmt->execute([$email, $hash, $role, $name, $status]);
        $userId = (int) $pdo->lastInsertId();
        $pdo->commit();

        $msg = ($status === 'Pending Approval')
            ? 'Registration submitted successfully. Please wait for Dean approval before logging in.'
            : 'Account registered successfully. You can now log in.';

        auth_controller_emit(auth_build_no_store_json_response([
            'success' => true,
            'message' => $msg,
            'user_id' => $userId,
            'status' => $status
        ], 201));
    } catch (\Throwable $e) {
        if (isset($pdo) && $pdo->inTransaction()) {
            $pdo->rollBack();
        }
        error_log('Register error: ' . $e->getMessage());
        auth_controller_emit(auth_build_no_store_message_response('Registration failed.', 500));
    }
}

function handle_me(): void
{
    try {
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

        $userInfo = auth_runtime_me($pdo, $config, $context);

        auth_controller_emit(auth_build_no_store_json_response($userInfo, 200));
    } catch (ChallengeException $e) {
        auth_controller_emit(auth_build_no_store_message_response('Authentication required.', 401));
    } catch (AuthException $e) {
        auth_controller_emit(auth_build_no_store_message_response('Authentication required.', 401));
    } catch (\Throwable $e) {
        error_log('Me error [' . ($context['request_id'] ?? '?') . ']: ' . sanitize_for_log($e));
        auth_controller_emit(auth_build_no_store_message_response('Internal server error.', 500));
    }
}
