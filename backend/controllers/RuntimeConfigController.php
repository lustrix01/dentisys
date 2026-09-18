<?php

declare(strict_types=1);

function handle_runtime_config(): void
{
    $config = app_config();
    $mocks = $config['mocks'] ?? [];
    $features = $config['features'] ?? [];
    $providers = $config['providers'] ?? [];

    header('Cache-Control: no-store, max-age=0');
    header('Pragma: no-cache');
    json_response([
        'status' => 'ok',
        'environment' => (string) ($config['app']['env'] ?? 'unknown'),
        'allowed_email_domains' => array_values($config['app']['allowed_email_domains'] ?? []),
        'providers' => [
            'identity' => [
                'password' => [
                    'enabled' => (bool) ($providers['identity']['password']['enabled'] ?? true),
                ],
                'google' => [
                    'enabled' => (bool) ($providers['identity']['google']['enabled'] ?? false),
                    'client_id' => $providers['identity']['google']['client_id'] ?? null,
                ],
                'development_mock' => [
                    'enabled' => (bool) ($mocks['identity'] ?? false),
                ],
            ],
            'email' => [
                'active' => (string) ($providers['email']['active'] ?? 'smtp'),
            ],
            'biometrics' => [
                'active' => (string) ($providers['biometrics']['active'] ?? 'disabled'),
            ],
            'location' => [
                'active' => (string) ($providers['location']['active'] ?? 'disabled'),
            ],
        ],
        'features' => [
            'browser_attendance_prototype' => (bool) ($mocks['browser_attendance_prototype'] ?? false),
            'student_auth_enabled' => (bool) ($features['student_auth_enabled'] ?? false),
        ],
    ]);
}
