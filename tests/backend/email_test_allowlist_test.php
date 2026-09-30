<?php

declare(strict_types=1);

require_once __DIR__ . '/../../backend/app/config.php';

function assert_allowlist(bool $condition, string $label): void
{
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$label}\n");
        exit(1);
    }
    echo "PASS: {$label}\n";
}

$list = config_email_test_allowlist(' Tester@Bicol-U.edu.ph, live.*@bicol-u.edu.ph ,, ');
assert_allowlist($list === ['tester@bicol-u.edu.ph', 'live.*@bicol-u.edu.ph'], 'The allowlist is trimmed, lower-cased and drops empty entries');
assert_allowlist(email_test_allowlist_allows($list, 'TESTER@bicol-u.edu.ph'), 'An exact address matches without regard to case');
assert_allowlist(email_test_allowlist_allows($list, 'live.abc123@bicol-u.edu.ph'), 'A wildcard entry matches');
assert_allowlist(!email_test_allowlist_allows($list, 'student@bicol-u.edu.ph'), 'Other addresses are not allowed');
assert_allowlist(!email_test_allowlist_allows($list, 'live.x@bicol-u.edu.ph.evil.test'), 'A wildcard entry is anchored at both ends');
assert_allowlist(!email_test_allowlist_allows([], 'tester@bicol-u.edu.ph'), 'An empty allowlist allows nothing');
// The container environment takes precedence over overrides; clear it so the defaults are tested.
putenv('EMAIL_ALLOWLIST_ENABLED');
foreach (['development', 'single-server', 'production'] as $appEnv) {
    $config = app_config(['APP_ENV' => $appEnv]);
    assert_allowlist($config['email_test_mode'] === true, "The allowlist is enabled by default when APP_ENV={$appEnv}");
}
$disabled = app_config(['APP_ENV' => 'single-server', 'EMAIL_ALLOWLIST_ENABLED' => 'false']);
assert_allowlist($disabled['email_test_mode'] === false, 'EMAIL_ALLOWLIST_ENABLED=false turns the allowlist off');
$enabled = app_config(['APP_ENV' => 'production', 'EMAIL_ALLOWLIST_ENABLED' => 'true']);
assert_allowlist($enabled['email_test_mode'] === true, 'EMAIL_ALLOWLIST_ENABLED=true keeps the allowlist on in production');
echo "ALL EMAIL TEST ALLOWLIST TESTS PASSED.\n";
