<?php

declare(strict_types=1);

// Source-contract test for SEC-005 sign-in and account-security audit events.

function assert_sec_audit(bool $condition, string $label): void
{
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$label}\n");
        exit(1);
    }
    echo "PASS: {$label}\n";
}

function sec_audit_src(string $relative): string
{
    $source = file_get_contents(__DIR__ . '/../../' . $relative);
    if ($source === false) {
        fwrite(STDERR, "FAIL: cannot read {$relative}\n");
        exit(1);
    }
    return $source;
}

function sec_audit_function(string $source, string $name): string
{
    if (!preg_match('/^function ' . preg_quote($name, '/') . '\(.*?^}/ms', $source, $m)) {
        fwrite(STDERR, "FAIL: function {$name} not found\n");
        exit(1);
    }
    return $m[0];
}

$auth = sec_audit_src('backend/app/auth_runtime.php');
$google = sec_audit_src('backend/controllers/GoogleAuthController.php');
$mfa = sec_audit_src('backend/app/mfa_runtime.php');
$mfaController = sec_audit_src('backend/controllers/MfaController.php');
$identity = sec_audit_src('backend/app/account_identity.php');

assert_sec_audit(!str_contains($auth, "'refresh_rotation'"), 'refresh rotation writes no audit row');
assert_sec_audit(str_contains($auth, 'refresh_reuse_detected'), 'refresh reuse detection is still audited');
assert_sec_audit(!str_contains($google, 'google_link_required'), 'google_link_required is no longer written');
assert_sec_audit(str_contains($google, 'google_link_success') || str_contains(sec_audit_src('backend/app/google_auth.php'), 'google_link_success'), 'google_link_success is still written');
assert_sec_audit(!str_contains($mfa, 'mfa_enrollment_started'), 'mfa_enrollment_started is no longer written');
assert_sec_audit(str_contains($mfa, 'mfa_enrollment_completed'), 'mfa_enrollment_completed is still written');

$helper = sec_audit_function($mfa, 'mfa_audit_wrong_code');
assert_sec_audit(str_contains($helper, "'mfa_verification_failed'") && str_contains($helper, "'Failed'") && str_contains($helper, "'module_code' => 'mfa'"), 'wrong-code helper writes mfa/mfa_verification_failed/Failed');
assert_sec_audit(str_contains($helper, 'beginTransaction') && str_contains($helper, 'error_log'), 'wrong-code row uses its own best-effort transaction');
assert_sec_audit(!str_contains($helper, '$code'), 'wrong-code helper never receives the submitted code');

$verify = sec_audit_function($mfa, 'mfa_runtime_verify');
$recover = sec_audit_function($mfa, 'mfa_runtime_recover');
assert_sec_audit(str_contains($verify, "\$wrongKind = 'authenticator code'") && str_contains($verify, 'mfa_audit_wrong_code('), 'wrong TOTP code is audited');
assert_sec_audit(substr_count($recover, "\$wrongKind = 'recovery code'") === 2 && str_contains($recover, 'mfa_audit_wrong_code('), 'wrong recovery code is audited on both failure paths');
assert_sec_audit(!preg_match('/mfa_audit_wrong_code\([^)]*\$code/', $verify . $recover), 'submitted codes are not passed to the audit helper');

$regen = sec_audit_function($mfaController, 'handle_mfa_settings_recovery_codes');
$auditPos = strpos($regen, "'mfa_recovery_codes_regenerated'");
assert_sec_audit($auditPos !== false && $auditPos < strpos($regen, '$pdo->commit()'), 'regeneration audit is written inside the transaction before commit');
assert_sec_audit(!preg_match('/audit_record_action\([^;]*recovery/is', preg_replace("/'mfa_recovery_codes_regenerated'|Regenerated recovery codes\./", '', $regen)), 'regeneration audit carries no recovery codes');

assert_sec_audit(preg_match("/'before' => \['name' => \\\$currentName\], 'after' => \['name' => \\\$name\]/", $identity) === 1, 'profile_updated stores before and after');
assert_sec_audit(str_contains($identity, 'Changed own name from {$currentName} to {$name}.'), 'profile_updated description reads naturally');
