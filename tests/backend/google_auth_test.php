<?php

declare(strict_types=1);

require_once __DIR__ . '/../../backend/vendor/autoload.php';
require_once __DIR__ . '/../../backend/app/config.php';
require_once __DIR__ . '/../../backend/app/validation.php';
require_once __DIR__ . '/../../backend/app/jwt.php';
require_once __DIR__ . '/../../backend/app/ratelimit.php';
require_once __DIR__ . '/../../backend/app/google_auth.php';
require_once __DIR__ . '/../../backend/controllers/GoogleAuthController.php';

function google_test_assert(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$message}\n");
        exit(1);
    }
}

$config = app_config([
    'APP_ENV' => 'test',
    'GOOGLE_CLIENT_ID' => 'client.apps.googleusercontent.com',
    'ALLOWED_EMAIL_DOMAINS' => 'bicol-u.edu.ph,example.edu',
]);
$config['rate_limit']['storage_dir'] = sys_get_temp_dir() . '/dentisys-google-auth-test-' . bin2hex(random_bytes(4));
mkdir($config['rate_limit']['storage_dir'], 0700, true);
$config['jwt']['signing_key_b64'] = base64_encode(str_repeat('J', 32));
$validClaims = [
    'iss' => 'https://accounts.google.com',
    'aud' => 'client.apps.googleusercontent.com',
    'exp' => time() + 300,
    'sub' => 'google-subject-1',
    'email' => 'student@bicol-u.edu.ph',
    'email_verified' => true,
    'hd' => 'bicol-u.edu.ph',
];

$verified = google_verify_id_token($config, 'fixture', static fn(string $credential, string $audience): array => $validClaims);
google_test_assert($verified['sub'] === 'google-subject-1', 'verified subject is returned');
google_test_assert($verified['email'] === 'student@bicol-u.edu.ph', 'verified email is returned');

foreach ([
    'wrong audience' => ['aud' => 'other.apps.googleusercontent.com'],
    'wrong issuer' => ['iss' => 'accounts.example.com'],
    'expired' => ['exp' => time() - 1],
    'missing subject' => ['sub' => ''],
    'unverified email' => ['email_verified' => false],
    'missing hosted domain' => ['hd' => null],
    'disallowed hosted domain' => ['hd' => 'other.edu'],
] as $label => $override) {
    try {
        google_verify_id_token($config, 'fixture', static fn(string $credential, string $audience): array => array_merge($validClaims, $override));
        google_test_assert(false, "{$label} is rejected");
    } catch (GoogleIdentityException $e) {
        google_test_assert(true, "{$label} is rejected");
    }
}

putenv('ALLOWED_EMAIL_DOMAINS');
putenv('ALLOWED_EMAIL_DOMAIN');
$fallbackConfig = app_config(['ALLOWED_EMAIL_DOMAIN' => 'legacy.edu']);
google_test_assert($fallbackConfig['app']['allowed_email_domains'] === ['legacy.edu'], 'singular domain fallback is normalized');
google_test_assert(class_exists('Google\\Auth\\AccessToken'), 'Google AccessToken is available');
google_test_assert(class_exists('phpseclib3\\Crypt\\RSA'), 'phpseclib RSA support is available');

$googleContext = ['ip_address' => '198.51.100.10'];
$verifierCalls = 0;
for ($i = 0; $i < 30; $i++) {
    try {
        google_auth_verify_login_credential($config, $googleContext, 'invalid-fixture', static function () use (&$verifierCalls): array {
            $verifierCalls++;
            throw new GoogleIdentityException('Invalid Google identity.', 'invalid_google_identity');
        });
        google_test_assert(false, 'invalid Google credential is rejected');
    } catch (GoogleIdentityException) {
        // Invalid credentials still consume the IP bucket.
    }
}
$callsBeforeBlockedAttempt = $verifierCalls;
try {
    google_auth_verify_login_credential($config, $googleContext, 'invalid-fixture', static function () use (&$verifierCalls): array {
        $verifierCalls++;
        return $validClaims;
    });
    google_test_assert(false, 'Google IP limiter blocks the next verification attempt');
} catch (RateLimitException) {
    google_test_assert($verifierCalls === $callsBeforeBlockedAttempt, 'Google IP limiter runs before identity verification');
}

$linkChallenge = google_issue_link_challenge($config, [
    'user_id' => 42,
    'token_version' => 3,
], 'google-subject-link');
google_test_assert(is_string($linkChallenge['token']) && $linkChallenge['expires_in'] === 300, 'Google link challenge initializes through shared challenge state');
google_test_assert(google_auth_identity_error_status('domain_not_allowed') === 403, 'Disallowed Google domains map to HTTP 403');
google_test_assert(google_auth_identity_error_status('invalid_google_identity') === 401, 'Invalid Google identities map to HTTP 401');

foreach (glob($config['rate_limit']['storage_dir'] . '/*') ?: [] as $path) {
    @unlink($path);
}
@rmdir($config['rate_limit']['storage_dir']);

echo "ALL GOOGLE AUTH TESTS PASSED.\n";
