<?php

declare(strict_types=1);

if (!function_exists('sanitize_for_log')) {
function sanitize_for_log(\Throwable $e): string
{
    return get_class($e) . ' [' . ($e->getCode() > 0 ? $e->getCode() : 0) . ']';
}
}

function handle_refresh(): void
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
    } catch (\Throwable $e) {
        error_log('Refresh config error [' . ($context['request_id'] ?? '?') . ']: ' . sanitize_for_log($e));
        auth_controller_emit(auth_build_no_store_message_response('Internal server error.', 500));
        return;
    }

    $isHttps = request_is_https($config, $_SERVER);

    $rateStorage = ['dir' => $config['rate_limit']['storage_dir']];

    try {
        $ipScope = bin2hex(hash('sha256', 'ip:' . $context['ip_address'], true));
        rate_limit_check($rateStorage, $ipScope, 'post_auth_refresh', 60, 30);
    } catch (RateLimitException $e) {
        auth_controller_emit(auth_build_no_store_message_response('Too many requests.', 429));
        return;
    }

    $refreshCookie = isset($_COOKIE['refresh_token'])
        && is_string($_COOKIE['refresh_token'])
            ? $_COOKIE['refresh_token']
            : null;

    if ($refreshCookie === null
        || strlen($refreshCookie) !== REFRESH_TOKEN_LENGTH
        || !preg_match(REFRESH_TOKEN_PATTERN, $refreshCookie)
    ) {
        $resp = auth_build_no_store_message_response('Authentication required.', 401);
        $resp['headers'][] = build_clear_cookie_header($isHttps)[0];
        auth_controller_emit($resp);
        return;
    }

    try {
        $pdo = create_pdo($config);
    } catch (\Throwable $e) {
        error_log('Refresh PDO error [' . $context['request_id'] . ']: ' . sanitize_for_log($e));
        auth_controller_emit(auth_build_no_store_message_response('Internal server error.', 500));
        return;
    }

    try {
        $result = auth_runtime_refresh($pdo, $config, $context, $refreshCookie);

        if ($result['type'] === 'rotated') {
            $resp = auth_build_no_store_json_response([
                'access_token' => $result['access_token'],
                'user' => ['user_id' => $result['user_id']],
            ], 200);
            $resp['headers'] = array_merge(
                $resp['headers'],
                build_refresh_cookie_header($result['child_raw_token'], $result['cookie_ttl'], $isHttps)
            );
            auth_controller_emit($resp);
            return;
        }

        $resp = auth_build_no_store_message_response('Authentication required.', 401);
        $resp['headers'][] = build_clear_cookie_header($isHttps)[0];
        auth_controller_emit($resp);
    } catch (ChallengeException | AuthException $e) {
        $resp = auth_build_no_store_message_response('Authentication required.', 401);
        $resp['headers'][] = build_clear_cookie_header($isHttps)[0];
        auth_controller_emit($resp);
    } catch (RateLimitException $e) {
        auth_controller_emit(auth_build_no_store_message_response('Too many requests.', 429));
    } catch (\Throwable $e) {
        error_log('Refresh error [' . $context['request_id'] . ']: ' . sanitize_for_log($e));
        auth_controller_emit(auth_build_no_store_message_response('Internal server error.', 500));
    }
}

function handle_logout(): void
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
    } catch (\Throwable $e) {
        error_log('Logout config error [' . ($context['request_id'] ?? '?') . ']: ' . sanitize_for_log($e));
        auth_controller_emit(auth_build_no_store_message_response('Internal server error.', 500));
        return;
    }

    $isHttps = request_is_https($config, $_SERVER);

    $rateStorage = ['dir' => $config['rate_limit']['storage_dir']];

    try {
        $ipScope = bin2hex(hash('sha256', 'ip:' . $context['ip_address'], true));
        rate_limit_check($rateStorage, $ipScope, 'post_auth_logout', 60, 30);
    } catch (RateLimitException $e) {
        auth_controller_emit(auth_build_no_store_message_response('Too many requests.', 429));
        return;
    }

    $refreshCookie = isset($_COOKIE['refresh_token'])
        && is_string($_COOKIE['refresh_token'])
            ? $_COOKIE['refresh_token']
            : null;

    if ($refreshCookie === null
        || strlen($refreshCookie) !== REFRESH_TOKEN_LENGTH
        || !preg_match(REFRESH_TOKEN_PATTERN, $refreshCookie)
    ) {
        $resp = auth_build_no_store_json_response(['status' => 'ok', 'message' => 'Logged out.'], 200);
        $resp['headers'][] = build_clear_cookie_header($isHttps)[0];
        auth_controller_emit($resp);
        return;
    }

    try {
        $pdo = create_pdo($config);
    } catch (\Throwable $e) {
        error_log('Logout PDO error [' . $context['request_id'] . ']: ' . sanitize_for_log($e));
        auth_controller_emit(auth_build_no_store_message_response('Internal server error.', 500));
        return;
    }

    try {
        auth_runtime_logout($pdo, $config, $context, $refreshCookie);

        $resp = auth_build_no_store_json_response(['status' => 'ok', 'message' => 'Logged out.'], 200);
        $resp['headers'][] = build_clear_cookie_header($isHttps)[0];
        auth_controller_emit($resp);
    } catch (RateLimitException $e) {
        auth_controller_emit(auth_build_no_store_message_response('Too many requests.', 429));
    } catch (\Throwable $e) {
        error_log('Logout error [' . $context['request_id'] . ']: ' . sanitize_for_log($e));
        auth_controller_emit(auth_build_no_store_message_response('Internal server error.', 500));
    }
}
