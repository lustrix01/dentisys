<?php

declare(strict_types=1);

if (!function_exists('sanitize_for_log')) {
function sanitize_for_log(\Throwable $e): string
{
    return get_class($e) . ' [' . ($e->getCode() > 0 ? $e->getCode() : 0) . ']';
}
}

function handle_mfa_enroll_start(): void
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

        $authHeader = request_header('Authorization') ?? '';
        $token = auth_extract_bearer_token($authHeader);
        $jwtKey = config_key_bytes_at_least($config['jwt']['signing_key_b64'], 32, 'JWT_SIGNING_KEY');
        $claims = jwt_decode($token, $jwtKey, 'mfa_enrollment');

        if (!isset($claims['enrollment_stage']) || $claims['enrollment_stage'] !== 'start') {
            auth_controller_emit(auth_build_no_store_message_response('Invalid enrollment stage.', 401));
            return;
        }

        $result = mfa_runtime_enroll_start($pdo, $config, $claims, $context);

        auth_controller_emit(auth_build_no_store_json_response([
            'confirmation_token' => $result['confirmation_token'],
            'provisioning_uri' => $result['provisioning_uri'],
            'base32_secret' => $result['base32_secret'],
            'dev_mfa_code' => $result['dev_mfa_code'] ?? null,
        ], 200));
    } catch (ChallengeException | AuthException | \RuntimeException $e) {
        auth_controller_emit(auth_build_no_store_message_response($e->getMessage(), 401));
    } catch (MfaException $e) {
        auth_controller_emit(auth_build_no_store_message_response($e->getMessage(), 400));
    } catch (InactiveAccountException $e) {
        auth_controller_emit(auth_build_no_store_message_response($e->getMessage(), 403));
    } catch (RateLimitException $e) {
        auth_controller_emit(auth_build_no_store_message_response('Too many requests.', 429));
    } catch (\Throwable $e) {
        error_log('MFA enroll start error [' . ($context['request_id'] ?? '?') . ']: ' . sanitize_for_log($e));
        auth_controller_emit(auth_build_no_store_message_response('Internal server error.', 500));
    }
}

function handle_mfa_enroll_confirm(): void
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

        $authHeader = request_header('Authorization') ?? '';
        $rawToken = auth_extract_bearer_token($authHeader);
        $jwtKey = config_key_bytes_at_least($config['jwt']['signing_key_b64'], 32, 'JWT_SIGNING_KEY');
        $claims = jwt_decode($rawToken, $jwtKey, 'mfa_enrollment');

        if (!isset($claims['enrollment_stage']) || $claims['enrollment_stage'] !== 'confirm') {
            auth_controller_emit(auth_build_no_store_message_response('Invalid enrollment stage.', 401));
            return;
        }

        $body = request_body();

        if (!$body['has_body'] || !isset($body['data']['code'])) {
            auth_controller_emit(auth_build_no_store_message_response('Verification code required.', 400));
            return;
        }

        $code = (string) $body['data']['code'];

        if (strlen($code) < 1 || strlen($code) > 10) {
            auth_controller_emit(auth_build_no_store_message_response('Invalid verification code.', 400));
            return;
        }

        $result = mfa_runtime_enroll_confirm($pdo, $config, $claims, $code, $context);

        $cred = $result['credentials'];
        $response = auth_build_no_store_json_response([
            'access_token' => $cred['access_token'],
            'user' => [
                'user_id' => $cred['session']['user_id'],
            ],
            'recovery_codes' => $result['recovery_codes'],
        ], 200);

        $isHttps = request_is_https($config, $_SERVER);
        $cookieHeaders = build_refresh_cookie_header(
            $cred['refresh_token'],
            $cred['cookie_ttl'],
            $isHttps
        );
        $response['headers'] = array_merge($response['headers'], $cookieHeaders);

        auth_controller_emit($response);
    } catch (ChallengeException | AuthException | \RuntimeException $e) {
        auth_controller_emit(auth_build_no_store_message_response($e->getMessage(), 401));
    } catch (MfaException $e) {
        auth_controller_emit(auth_build_no_store_message_response($e->getMessage(), 400));
    } catch (InactiveAccountException $e) {
        auth_controller_emit(auth_build_no_store_message_response($e->getMessage(), 403));
    } catch (RateLimitException $e) {
        auth_controller_emit(auth_build_no_store_message_response('Too many requests.', 429));
    } catch (\Throwable $e) {
        error_log('MFA enroll confirm error [' . ($context['request_id'] ?? '?') . ']: ' . sanitize_for_log($e));
        auth_controller_emit(auth_build_no_store_message_response('Internal server error.', 500));
    }
}

function handle_mfa_verify(): void
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

        $authHeader = request_header('Authorization') ?? '';
        $rawToken = auth_extract_bearer_token($authHeader);
        $jwtKey = config_key_bytes_at_least($config['jwt']['signing_key_b64'], 32, 'JWT_SIGNING_KEY');
        $claims = jwt_decode($rawToken, $jwtKey, 'mfa_challenge');

        $body = request_body();

        if (!$body['has_body'] || !isset($body['data']['code'])) {
            auth_controller_emit(auth_build_no_store_message_response('Verification code required.', 400));
            return;
        }

        $code = (string) $body['data']['code'];

        if (strlen($code) < 1 || strlen($code) > 10) {
            auth_controller_emit(auth_build_no_store_message_response('Invalid verification code.', 400));
            return;
        }

        $result = mfa_runtime_verify($pdo, $config, $claims, $code, $context);

        $cred = $result['credentials'];
        $response = auth_build_no_store_json_response([
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
    } catch (ChallengeException | AuthException | \RuntimeException $e) {
        auth_controller_emit(auth_build_no_store_message_response($e->getMessage(), 401));
    } catch (MfaException $e) {
        auth_controller_emit(auth_build_no_store_message_response($e->getMessage(), 400));
    } catch (InactiveAccountException $e) {
        auth_controller_emit(auth_build_no_store_message_response($e->getMessage(), 403));
    } catch (RateLimitException $e) {
        auth_controller_emit(auth_build_no_store_message_response('Too many requests.', 429));
    } catch (\Throwable $e) {
        error_log('MFA verify error [' . ($context['request_id'] ?? '?') . ']: ' . sanitize_for_log($e));
        auth_controller_emit(auth_build_no_store_message_response('Internal server error.', 500));
    }
}

function handle_mfa_recover(): void
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

        $authHeader = request_header('Authorization') ?? '';
        $rawToken = auth_extract_bearer_token($authHeader);
        $jwtKey = config_key_bytes_at_least($config['jwt']['signing_key_b64'], 32, 'JWT_SIGNING_KEY');
        $claims = jwt_decode($rawToken, $jwtKey, 'mfa_challenge');

        $body = request_body();

        if (!$body['has_body'] || !isset($body['data']['code'])) {
            auth_controller_emit(auth_build_no_store_message_response('Recovery code required.', 400));
            return;
        }

        $code = (string) $body['data']['code'];

        $result = mfa_runtime_recover($pdo, $config, $claims, $code, $context);

        $cred = $result['credentials'];
        $response = auth_build_no_store_json_response([
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
    } catch (ChallengeException | AuthException | \RuntimeException $e) {
        auth_controller_emit(auth_build_no_store_message_response($e->getMessage(), 401));
    } catch (MfaException $e) {
        auth_controller_emit(auth_build_no_store_message_response($e->getMessage(), 400));
    } catch (InactiveAccountException $e) {
        auth_controller_emit(auth_build_no_store_message_response($e->getMessage(), 403));
    } catch (RateLimitException $e) {
        auth_controller_emit(auth_build_no_store_message_response('Too many requests.', 429));
    } catch (\Throwable $e) {
        error_log('MFA recover error [' . ($context['request_id'] ?? '?') . ']: ' . sanitize_for_log($e));
        auth_controller_emit(auth_build_no_store_message_response('Internal server error.', 500));
    }
}
