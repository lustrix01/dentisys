<?php

declare(strict_types=1);

/**
 * Docker provides runtime configuration through process environment variables.
 * Optional overrides exist only for deterministic tests.
 */
function config_value(string $key, array $overrides, mixed $default): mixed
{
    $value = getenv($key);
    if ($value !== false && $value !== '') {
        return $value;
    }

    if (array_key_exists($key, $overrides) && $overrides[$key] !== '') {
        return $overrides[$key];
    }

    return $default;
}

function config_key_bytes_at_least(string $encoded, int $minimumBytes, string $label): string
{
    if ($encoded === '') {
        throw new RuntimeException(sprintf('Configuration key "%s" is empty. Set it in the container environment.', $label));
    }

    $decoded = base64_decode($encoded, true);
    if ($decoded === false || $decoded === '' || strlen($decoded) < $minimumBytes) {
        throw new RuntimeException(sprintf('Configuration key "%s" must be valid Base64 with at least %d bytes.', $label, $minimumBytes));
    }

    return $decoded;
}

function config_key_bytes_exact(string $encoded, int $exactBytes, string $label): string
{
    $decoded = config_key_bytes_at_least($encoded, 1, $label);
    if (strlen($decoded) !== $exactBytes) {
        throw new RuntimeException(sprintf('Configuration key "%s" must decode to exactly %d bytes.', $label, $exactBytes));
    }

    return $decoded;
}

function config_strict_bool(mixed $value, string $label, bool $default = false): bool
{
    if ($value === null || $value === '') {
        return $default;
    }

    if (is_bool($value)) {
        return $value;
    }

    $normalized = strtolower(trim((string) $value));
    if ($normalized === 'true') {
        return true;
    }
    if ($normalized === 'false') {
        return false;
    }

    throw new RuntimeException(sprintf('Configuration value "%s" must be true or false.', $label));
}

function config_environment(string $value): string
{
    $normalized = strtolower(trim($value));
    $allowed = ['development', 'test', 'single-server', 'production'];
    if (!in_array($normalized, $allowed, true)) {
        throw new RuntimeException('Configuration value "APP_ENV" must be one of: development, test, single-server, production.');
    }

    return $normalized;
}

function config_timezone(string $value): string
{
    $timezone = trim($value);
    if ($timezone === '') {
        throw new RuntimeException('Configuration value "APP_TIMEZONE" must not be empty.');
    }

    try {
        new DateTimeZone($timezone);
    } catch (Throwable $e) {
        throw new RuntimeException('Configuration value "APP_TIMEZONE" must be a valid IANA timezone.', 0, $e);
    }

    return $timezone;
}

function app_local_date(array $config, DateTimeImmutable $instant): string
{
    $timezone = (string) ($config['app']['operational_timezone'] ?? '');
    if ($timezone === '') {
        throw new RuntimeException('Application operational timezone is not configured.');
    }

    return $instant->setTimezone(new DateTimeZone($timezone))->format('Y-m-d');
}

function config_email_provider(string $value): string
{
    $normalized = strtolower(trim($value));
    if (!in_array($normalized, ['mailpit', 'smtp'], true)) {
        throw new RuntimeException('Configuration value "EMAIL_PROVIDER" must be mailpit or smtp.');
    }

    return $normalized;
}

function config_allowed_email_domains(array $overrides): array
{
    $pluralPresent = (getenv('ALLOWED_EMAIL_DOMAINS') !== false && trim((string) getenv('ALLOWED_EMAIL_DOMAINS')) !== '')
        || array_key_exists('ALLOWED_EMAIL_DOMAINS', $overrides);
    $raw = $pluralPresent
        ? (string) config_value('ALLOWED_EMAIL_DOMAINS', $overrides, '')
        : (string) config_value('ALLOWED_EMAIL_DOMAIN', $overrides, 'bicol-u.edu.ph');

    $domains = array_values(array_unique(array_map(
        static fn(string $domain): string => strtolower(trim($domain)),
        explode(',', $raw)
    )));
    if ($domains === [] || in_array('', $domains, true)) {
        throw new RuntimeException('Configuration value "ALLOWED_EMAIL_DOMAINS" must contain at least one domain.');
    }

    foreach ($domains as $domain) {
        if (strlen($domain) > 253
            || str_contains($domain, '@')
            || str_contains($domain, '://')
            || str_contains($domain, '/')
            || str_contains($domain, ':')
            || !preg_match('/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/', $domain)) {
            throw new RuntimeException(sprintf('Configuration value "ALLOWED_EMAIL_DOMAINS" contains malformed domain "%s".', $domain));
        }
    }

    return $domains;
}

function config_app_base_url(string $value, bool $required): string
{
    $url = rtrim(trim($value), '/');
    if ($url === '') {
        if ($required) {
            throw new RuntimeException('Configuration value "APP_BASE_URL" is required for single-server deployments.');
        }
        return '';
    }

    $parts = parse_url($url);
    if ($parts === false
        || !isset($parts['scheme'], $parts['host'])
        || !in_array(strtolower($parts['scheme']), ['http', 'https'], true)
        || isset($parts['user'], $parts['pass'], $parts['query'], $parts['fragment'])) {
        throw new RuntimeException('Configuration value "APP_BASE_URL" must be a valid absolute HTTP(S) URL.');
    }

    return $url;
}

function app_url(array $config, string $path, array $query = []): string
{
    $baseUrl = rtrim((string) ($config['app']['base_url'] ?? ''), '/');
    if ($baseUrl === '') {
        throw new RuntimeException('Configuration value "APP_BASE_URL" is required to generate application links.');
    }

    $url = $baseUrl . '/' . ltrim($path, '/');
    return $query === [] ? $url : $url . '?' . http_build_query($query, '', '&', PHP_QUERY_RFC3986);
}

function app_config(?array $overrides = null): array
{
    $values = $overrides ?? [];
    $appEnv = config_environment((string) config_value('APP_ENV', $values, 'development'));
    $isDevelopment = $appEnv === 'development';
    $isTest = $appEnv === 'test';
    $mockFlags = [
        'identity' => config_strict_bool(config_value('DEV_MOCK_IDENTITY_ENABLED', $values, false), 'DEV_MOCK_IDENTITY_ENABLED'),
        'biometrics' => config_strict_bool(config_value('DEV_MOCK_BIOMETRIC_ENABLED', $values, false), 'DEV_MOCK_BIOMETRIC_ENABLED'),
        'location' => config_strict_bool(config_value('DEV_MOCK_LOCATION_ENABLED', $values, false), 'DEV_MOCK_LOCATION_ENABLED'),
        'browser_attendance_prototype' => config_strict_bool(config_value('DEV_BROWSER_ATTENDANCE_PROTOTYPE_ENABLED', $values, false), 'DEV_BROWSER_ATTENDANCE_PROTOTYPE_ENABLED'),
    ];
    $studentAuthEnabled = config_strict_bool(
        config_value('STUDENT_AUTH_ENABLED', $values, false),
        'STUDENT_AUTH_ENABLED'
    );
    $emailProvider = config_email_provider(
        (string) config_value('EMAIL_PROVIDER', $values, ($isDevelopment || $isTest) ? 'mailpit' : 'smtp')
    );
    if (!$isDevelopment && !$isTest && ($emailProvider === 'mailpit' || in_array(true, $mockFlags, true))) {
        throw new RuntimeException('Development and test providers are forbidden when APP_ENV is production-like.');
    }
    $baseUrl = config_app_base_url(
        (string) config_value('APP_BASE_URL', $values, $isDevelopment ? 'http://localhost:5173' : ''),
        $appEnv === 'single-server'
    );
    $allowedEmailDomains = config_allowed_email_domains($values);
    $googleClientId = trim((string) config_value('GOOGLE_CLIENT_ID', $values, ''));
    $operationalTimezone = config_timezone(
        (string) config_value('APP_TIMEZONE', $values, 'Asia/Manila')
    );
    $biometricSidecarUrl = rtrim(trim((string) config_value('BIOMETRIC_SIDECAR_URL', $values, '')), '/');
    $biometricSidecarSecret = trim((string) config_value('BIOMETRIC_SIDECAR_SHARED_SECRET', $values, ''));
    $biometricChallengeTtl = (int) config_value('BIOMETRIC_CHALLENGE_TTL_SECONDS', $values, 120);
    if ($biometricChallengeTtl <= 0) {
        throw new RuntimeException('Configuration value "BIOMETRIC_CHALLENGE_TTL_SECONDS" must be positive.');
    }
    // Real biometrics is intentionally limited to the local development lane
    // until the deferred production approvals and camera calibration are complete.
    $biometricActive = ($isDevelopment && $biometricSidecarUrl !== '' && $biometricSidecarSecret !== '')
        ? 'sidecar'
        : ($mockFlags['biometrics'] ? 'development-mock' : 'disabled');

    return [
        'debug' => filter_var(config_value('APP_DEBUG', $values, false), FILTER_VALIDATE_BOOLEAN),
        'db' => [
            'host' => (string) config_value('DB_HOST', $values, 'db'),
            'port' => (int) config_value('DB_PORT', $values, 5432),
            'name' => (string) config_value('DB_NAME', $values, 'dentisys'),
            'user' => (string) config_value('DB_USER', $values, 'dentisys'),
            'pass' => (string) config_value('DB_PASS', $values, 'local-development-password'),
        ],
        'app' => [
            'env' => $appEnv,
            'base_url' => $baseUrl,
            'is_https' => filter_var(config_value('APP_IS_HTTPS', $values, 'false'), FILTER_VALIDATE_BOOLEAN),
            'operational_timezone' => $operationalTimezone,
            'allowed_email_domains' => $allowedEmailDomains,
            // Kept as a compatibility projection for existing non-policy callers.
            'allowed_email_domain' => $allowedEmailDomains[0],
        ],
        'cors' => [
            'allowed_origins' => (string) config_value('CORS_ALLOWED_ORIGINS', $values, 'http://localhost:5173'),
        ],
        'jwt' => [
            'signing_key_b64' => (string) config_value('JWT_SIGNING_KEY_B64', $values, 'ZGVudGlzeXMtZGV2LWp3dC1zaWduaW5nLWtleS0zMmI='),
            'access_ttl' => (int) config_value('JWT_ACCESS_TTL', $values, 86400),
        ],
        'mfa' => [
            'encryption_key_b64' => (string) config_value('MFA_ENCRYPTION_KEY_B64', $values, 'ZGVudGlzeXMtZGV2LW1mYS1lbmNyeXB0LWtleS0zMmI='),
            'issuer' => 'DentiSys',
        ],
        'audit' => [
            'mac_key_b64' => (string) config_value('AUDIT_MAC_KEY_B64', $values, 'ZGVudGlzeXMtZGV2LWF1ZGl0LW1hYy1rZXktMzJiaXQ='),
        ],
        'rate_limit' => [
            'enabled' => filter_var(config_value('RATE_LIMIT_ENABLED', $values, 'true'), FILTER_VALIDATE_BOOLEAN),
            'storage_dir' => (string) (config_value('RATE_LIMIT_STORAGE_DIR', $values, '') ?: dirname(__DIR__) . '/storage/ratelimit'),
        ],
        'mocks' => $mockFlags,
        'features' => [
            'student_auth_enabled' => $studentAuthEnabled,
        ],
        'providers' => [
            'identity' => [
                'password' => ['enabled' => true],
                'google' => [
                    'enabled' => $googleClientId !== '',
                    'client_id' => $googleClientId !== '' ? $googleClientId : null,
                ],
                'development_mock' => ['enabled' => $mockFlags['identity']],
            ],
            'email' => [
                'active' => $emailProvider,
            ],
            'biometrics' => [
                'active' => $biometricActive,
                'sidecar_url' => $biometricSidecarUrl,
                'sidecar_shared_secret' => $biometricSidecarSecret,
                'request_timeout_seconds' => (int) config_value('BIOMETRIC_SIDECAR_TIMEOUT_SECONDS', $values, 20),
                'challenge_ttl_seconds' => $biometricChallengeTtl,
            ],
            'location' => [
                'active' => $mockFlags['location'] ? 'development-mock' : 'disabled',
            ],
        ],
        'show_dev_reset_link' => $isDevelopment && filter_var(config_value('SHOW_DEV_RESET_LINK', $values, true), FILTER_VALIDATE_BOOLEAN),
        'show_dev_invitation_link' => $isDevelopment && filter_var(config_value('SHOW_DEV_INVITATION_LINK', $values, true), FILTER_VALIDATE_BOOLEAN),
        'smtp' => [
            'host' => (string) config_value('SMTP_HOST', $values, 'mailpit'),
            'port' => (int) config_value('SMTP_PORT', $values, 1025),
            'user' => (string) config_value('SMTP_USER', $values, ''),
            'pass' => (string) config_value('SMTP_PASS', $values, ''),
            'from' => (string) config_value('SMTP_FROM', $values, 'noreply@dentisys.local'),
            'encryption' => strtolower((string) config_value('SMTP_ENCRYPTION', $values, $isDevelopment ? 'none' : 'starttls')),
            'verify_peer' => filter_var(config_value('SMTP_VERIFY_PEER', $values, $isDevelopment ? 'false' : 'true'), FILTER_VALIDATE_BOOLEAN),
            'ca_file' => (string) config_value('SMTP_CA_FILE', $values, ''),
        ],
    ];
}
