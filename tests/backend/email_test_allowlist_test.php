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

require_once __DIR__ . '/../../backend/app/mailer.php';

$custom = ['providers' => ['email' => ['active' => 'custom']], 'email_test_allowlist' => $list];
assert_allowlist(email_reaches_recipient('live.abc@bicol-u.edu.ph', $custom), 'CUSTOM mode delivers to an allowlisted recipient');
assert_allowlist(!email_reaches_recipient('student@bicol-u.edu.ph', $custom), 'CUSTOM mode sends other recipients to Mailpit only');
foreach (['smtp', 'mailpit'] as $provider) {
    $other = ['providers' => ['email' => ['active' => $provider]], 'email_test_allowlist' => $list];
    assert_allowlist(email_reaches_recipient('student@bicol-u.edu.ph', $other), "The allowlist does not apply when EMAIL_PROVIDER={$provider}");
}
echo "ALL EMAIL TEST ALLOWLIST TESTS PASSED.\n";
