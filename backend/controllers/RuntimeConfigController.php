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
        'providers' => [
            'identity' => [
                'primary' => (string) ($providers['identity']['primary'] ?? 'password'),
                'development_mock_enabled' => (bool) ($mocks['identity'] ?? false),
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
