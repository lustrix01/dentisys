<?php

declare(strict_types=1);

// Recovery-code regeneration and 2FA turn-off share the name-change budget: 10 attempts per 5 minutes per user.

require_once __DIR__ . '/../../backend/app/ratelimit.php';
require_once __DIR__ . '/../../backend/controllers/MfaController.php';

function assert_mfa_rate(bool $condition, string $label): void
{
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$label}\n");
        exit(1);
    }
    echo "PASS: {$label}\n";
}

$directory = sys_get_temp_dir() . '/dentisys_mfa_settings_' . bin2hex(random_bytes(6));
if (!mkdir($directory, 0700)) {
    throw new RuntimeException('Unable to create the temporary rate-limit test directory.');
}
$config = ['rate_limit' => ['storage_dir' => $directory]];
for ($attempt = 0; $attempt < 10; $attempt++) {
    mfa_settings_confirm_rate_limit($config, 77);
}
$blocked = false;
try {
    mfa_settings_confirm_rate_limit($config, 77);
} catch (RateLimitException $e) {
    $blocked = true;
}
assert_mfa_rate($blocked, 'Settings confirmation allows 10 attempts and rejects attempt 11');
mfa_settings_confirm_rate_limit($config, 78);
assert_mfa_rate(true, 'Another user is not affected');
foreach (glob($directory . '/*') ?: [] as $file) {
    unlink($file);
}
rmdir($directory);

$source = (string) file_get_contents(__DIR__ . '/../../backend/controllers/MfaController.php');
foreach (['handle_mfa_settings_recovery_codes', 'handle_mfa_settings_revoke'] as $handler) {
    preg_match('/^function ' . $handler . '\(.*?^}/ms', $source, $m);
    $body = $m[0] ?? '';
    assert_mfa_rate(
        strpos($body, 'mfa_settings_confirm_rate_limit(') !== false
            && strpos($body, 'mfa_settings_confirm_rate_limit(') < strpos($body, 'mfa_require_step_up(')
            && str_contains($body, 'catch (RateLimitException'),
        "{$handler} rate-limits before verifying the code and answers 429"
    );
}

echo "ALL MFA SETTINGS RATE LIMIT TESTS PASSED\n";
