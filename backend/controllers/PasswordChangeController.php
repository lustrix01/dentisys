<?php

declare(strict_types=1);

if (!function_exists('sanitize_for_log')) {
    function sanitize_for_log(\Throwable $e): string
    {
        return get_class($e) . ' [' . ($e->getCode() > 0 ? $e->getCode() : 0) . ']';
    }
}

function password_change_validation_response(array $errors): void
{
    $response = build_validation_error_response($errors);
    $response['headers'] = array_merge($response['headers'], build_no_store_headers());
    auth_controller_emit($response);
}

function password_change_error_response(string $message, int $statusCode, ?string $code = null): void
{
    $response = build_error_response($message, $statusCode, $code);
    $response['headers'] = array_merge($response['headers'], build_no_store_headers());
    auth_controller_emit($response);
}

function password_change_success_response(): void
{
    $response = auth_build_no_store_json_response([
        'status' => 'ok',
        'sign_in_again' => true,
        'message' => 'Password changed successfully. Please sign in again.',
    ], 200);
    auth_controller_emit($response);
}

function password_change_validate_payload(array $data): array
{
    $values = [];
    $errors = [];

    foreach (['current_password', 'new_password', 'confirm_password'] as $field) {
        try {
            $values[$field] = extract_password($data, $field);
        } catch (InvalidCredentialsException $e) {
            $errors[] = ['field' => $field, 'message' => $e->getMessage()];
        }
    }

    if ($errors !== []) {
        throw new ValidationException($errors);
    }

    if (!hash_equals($values['new_password'], $values['confirm_password'])) {
        throw new ValidationException([
            ['field' => 'confirm_password', 'message' => 'Passwords do not match.'],
        ]);
    }

    try {
        // Keep the existing server-owned password policy. This endpoint does
        // not introduce a new strength or composition rule.
        validate_password_policy($values['new_password']);
    } catch (ValidationException $e) {
        $errors = array_map(
            static fn(array $error): array => [
                'field' => 'new_password',
                'message' => $error['message'] ?? 'Password does not satisfy the current policy.',
            ],
            $e->getErrors()
        );
        throw new ValidationException($errors);
    }

    return $values;
}

function handle_password_change(): void
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
        $authContext = auth_authenticated_context($pdo, $config);

        $allowedRoles = ['admin', 'faculty', 'secretary', 'student'];
        if (!in_array((string) ($authContext['role'] ?? ''), $allowedRoles, true)) {
            password_change_error_response('This account role cannot change a password.', 403);
            return;
        }

        $body = request_body();
        if (!$body['has_body']) {
            password_change_validation_response([
                ['field' => 'current_password', 'message' => 'Field is required.'],
                ['field' => 'new_password', 'message' => 'Field is required.'],
                ['field' => 'confirm_password', 'message' => 'Field is required.'],
            ]);
            return;
        }

        $passwords = password_change_validate_payload($body['data']);

        $rateStorage = ['dir' => $config['rate_limit']['storage_dir']];
        $userScope = bin2hex(hash('sha256', 'user:' . (int) $authContext['user_id'], true));
        $ipScope = bin2hex(hash('sha256', 'ip:' . $context['ip_address'], true));
        rate_limit_check($rateStorage, $userScope, 'post_auth_password_change', 900, 5);
        rate_limit_check($rateStorage, $ipScope, 'post_auth_password_change', 900, 20);

        auth_runtime_change_password(
            $pdo,
            $config,
            $authContext,
            $passwords['current_password'],
            $passwords['new_password'],
            $context
        );

        password_change_success_response();
    } catch (RequestException $e) {
        password_change_error_response($e->getMessage(), $e->getStatusCode());
    } catch (ValidationException $e) {
        password_change_validation_response($e->getErrors());
    } catch (PasswordChangeCurrentCredentialException $e) {
        password_change_validation_response([
            ['field' => 'current_password', 'message' => 'Current password is incorrect.'],
        ]);
    } catch (RateLimitException $e) {
        password_change_error_response('Too many password change attempts. Please try again later.', 429);
    } catch (AuthException $e) {
        password_change_error_response('Authentication required. Please sign in again.', 401);
    } catch (\Throwable $e) {
        error_log('Password change error [' . ($context['request_id'] ?? '?') . ']: ' . sanitize_for_log($e));
        password_change_error_response('Internal server error.', 500);
    }
}
