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

        if ($result['type'] === 'direct_login') {
            $cred = $result['credentials'];
            $response = auth_build_no_store_json_response([
                'type' => 'direct_login',
                'mfa_required' => false,
                'mfa_enrolled' => false,
                'access_token' => $cred['access_token'],
                'user' => [
                    'user_id' => $cred['session']['user_id'],
                ],
            ], 200);

            $isHttps = request_is_https($config, $_SERVER);
            $cookieHeaders = build_refresh_cookie_header(
                $cred['refresh_token'],
                $cred['cookie_ttl'],
                $isHttps
            );
            $response['headers'] = array_merge($response['headers'], $cookieHeaders);

            auth_controller_emit($response);
            return;
        } elseif ($result['type'] === 'enrollment_start') {
            $payload = [
                'type' => 'mfa_enrollment',
                'mfa_required' => true,
                'mfa_enrolled' => false,
                'enrollment_token' => $result['enrollment_token'],
            ];
        } else {
            $payload = [
                'type' => 'mfa_challenge',
                'mfa_required' => true,
                'mfa_enrolled' => true,
                'mfa_session_token' => $result['mfa_session_token'],
                'dev_mfa_code' => $result['dev_mfa_code'] ?? null,
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
