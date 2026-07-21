<?php

declare(strict_types=1);

require_once __DIR__ . '/../../backend/app/ratelimit.php';

function assert_same(mixed $expected, mixed $actual, string $label): void
{
    if ($expected !== $actual) {
        fwrite(STDERR, "FAIL: $label\nExpected: " . var_export($expected, true) . "\nActual: " . var_export($actual, true) . "\n");
        exit(1);
    }
    echo "PASS: $label\n";
}

function assert_throws(callable $fn, string $needle, string $label): void
{
    try {
        $fn();
        fwrite(STDERR, "FAIL: $label -- expected exception containing '$needle'\n");
        exit(1);
    } catch (RateLimitException $e) {
        if ($needle === 'RateLimitException') {
            echo "PASS: $label\n";
            return;
        }
        $msg = $e->getMessage();
        if (!str_contains($msg, $needle)) {
            fwrite(STDERR, "FAIL: $label -- message '$msg' does not contain '$needle'\n");
            exit(1);
        }
    } catch (\Throwable $e) {
        $msg = $e->getMessage();
        if (!str_contains($msg, $needle) && !str_contains(get_class($e), $needle)) {
            fwrite(STDERR, "FAIL: $label -- got '" . get_class($e) . ": $msg', expected '$needle'\n");
            exit(1);
        }
    }
    echo "PASS: $label\n";
}

function make_storage(string $suffix = ''): array
{
    $dir = sys_get_temp_dir() . '/dentisys_test_rl_' . uniqid() . $suffix;
    @mkdir($dir, 0700, true);
    return [
        'dir' => $dir,
        'clock' => fn(): int => 1000000000,
    ];
}

function clean_storage(array $storage): void
{
    if (is_dir($storage['dir'])) {
        $files = glob($storage['dir'] . '/*');
        foreach ($files as $f) { @unlink($f); }
        @rmdir($storage['dir']);
    }
}

echo "=== Rate Limiter and Challenge State Tests ===\n\n";

echo "--- Rate Limiter ---\n";

$scope = str_repeat('a', 64);
$endpoint = 'test_endpoint';

// N accepted, N+1 denied
$st = make_storage();
for ($i = 1; $i <= 3; $i++) {
    rate_limit_check($st, $scope, $endpoint, 60, 3);
    assert_same(true, true, "Request $i of 3 accepted");
}

assert_throws(fn() => rate_limit_check($st, $scope, $endpoint, 60, 3), 'RateLimitException', 'Request 4 (N+1) denied');
clean_storage($st);

// Window expiry
$st = make_storage();
$scope2 = str_repeat('b', 64);
rate_limit_check($st, $scope2, $endpoint, 60, 2);
rate_limit_check($st, $scope2, $endpoint, 60, 2);
assert_throws(fn() => rate_limit_check($st, $scope2, $endpoint, 60, 2), 'RateLimitException', 'Rate limit blocked');

// Expire window by advancing clock
$stExp = [
    'dir' => $st['dir'],
    'clock' => fn(): int => 1000000061, // 61 seconds later
];
rate_limit_check($stExp, $scope2, $endpoint, 60, 2);
assert_same(true, true, 'Rate limit reset after window expiry');
clean_storage($st);

// Blocked state
$st = make_storage();
$scope3 = str_repeat('c', 64);
rate_limit_check($st, $scope3, $endpoint, 60, 1); // fills it
assert_throws(fn() => rate_limit_check($st, $scope3, $endpoint, 60, 1), 'RateLimitException', 'Blocked during window');

// Advance clock but still in blocked_until
$stBlocked = [
    'dir' => $st['dir'],
    'clock' => fn(): int => 1000000030, // 30 seconds later (still < 60)
];
assert_throws(fn() => rate_limit_check($stBlocked, $scope3, $endpoint, 60, 1), 'RateLimitException', 'Blocked until still active');
clean_storage($st);

// Invalid scope key
assert_throws(fn() => rate_limit_storage_path(['dir' => sys_get_temp_dir()], 'not64', 'test'), '64 lowercase', 'Invalid scope key rejected');

// Invalid endpoint code
assert_throws(fn() => rate_limit_storage_path(['dir' => sys_get_temp_dir()], str_repeat('a', 64), 'INVALID-UPPER'), 'must match', 'Invalid endpoint code rejected');

echo "\n--- Challenge State ---\n";

$jti = str_repeat('a', 32);
$st = make_storage();

// Init
challenge_state_init($st, $jti, 'mfa_challenge', 'verify', 3, 60);
assert_same(true, true, 'Challenge init succeeds');

// Duplicate init
assert_throws(fn() => challenge_state_init($st, $jti, 'mfa_challenge', 'verify', 3, 60), 'already exists', 'Duplicate init rejected');

// Attempt
challenge_state_attempt($st, $jti, 'mfa_challenge', 'verify');
challenge_state_attempt($st, $jti, 'mfa_challenge', 'verify');
challenge_state_attempt($st, $jti, 'mfa_challenge', 'verify');
assert_same(true, true, '3 attempts accepted');

// Exhausted
assert_throws(fn() => challenge_state_attempt($st, $jti, 'mfa_challenge', 'verify'), 'exhausted', '4th attempt rejected');

// Consume
$st2 = make_storage();
$jti2 = str_repeat('b', 32);
challenge_state_init($st2, $jti2, 'mfa_challenge', 'verify', 3, 60);
challenge_state_consume($st2, $jti2, 'mfa_challenge', 'verify');
assert_same(true, true, 'Consume succeeds');

// Second consume fails
assert_throws(fn() => challenge_state_consume($st2, $jti2, 'mfa_challenge', 'verify'), 'already been consumed', 'Second consume fails');

// Expired challenge
$stExpired = make_storage();
$jti3 = str_repeat('c', 32);
challenge_state_init($stExpired, $jti3, 'mfa_challenge', 'verify', 3, 30);
$stExpiredAfter = [
    'dir' => $stExpired['dir'],
    'clock' => fn(): int => 1000000100,
];
assert_throws(fn() => challenge_state_attempt($stExpiredAfter, $jti3, 'mfa_challenge', 'verify'), 'expired', 'Attempt on expired challenge rejected');
assert_throws(fn() => challenge_state_consume($stExpiredAfter, $jti3, 'mfa_challenge', 'verify'), 'expired', 'Consume on expired challenge rejected');

// Missing challenge
$missingJti = 'a' . str_repeat('0', 31);
assert_throws(fn() => challenge_state_attempt($st, $missingJti, 'mfa_challenge', 'verify'), 'not found', 'Missing challenge rejected');

clean_storage($st);
clean_storage($st2);
clean_storage($stExpired);
clean_storage($stExpired);

echo "\n=== ALL RATE LIMITER AND CHALLENGE STATE TESTS PASSED ===\n";
