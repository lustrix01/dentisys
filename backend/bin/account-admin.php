<?php

declare(strict_types=1);

/*
 * Account administration for the system administrator (docs/contracts/roles.md section 7). Not an app feature:
 * the Superadmin account is created, its email moved and its 2FA reset (lockout) only here, on the server. Every command prints what it will do,
 * asks "Type YES to continue", runs in one transaction and audits as System with the reason.
 *
 * Usage (inside the web container):
 *   docker compose exec web php /var/www/html/backend/bin/account-admin.php create-superadmin --email <e> --first <f> --last <l> [--prefix <p> --middle <m> --suffix <s>] --reason "..."
 *   docker compose exec web php /var/www/html/backend/bin/account-admin.php reset-superadmin-2fa --reason "..."
 *   docker compose exec web php /var/www/html/backend/bin/account-admin.php move-email --to <new email> --reason "..."
 *   docker compose exec web php /var/www/html/backend/bin/account-admin.php unretire-email <email> --reason "..."
 */

require __DIR__ . '/../app/bootstrap.php';
require_once __DIR__ . '/../controllers/StudentAuthController.php';
require_once __DIR__ . '/../controllers/SuperadminController.php';
require_once __DIR__ . '/../controllers/FacultyInvitationController.php';

function account_admin_fail(string $message): never
{
    fwrite(STDERR, $message . "\n");
    exit(1);
}

/** @return array{0: string, 1: array<string, string>} the command and its --options; a bare word after the command is "arg". */
function account_admin_args(array $argv): array
{
    $command = $argv[1] ?? '';
    $options = [];
    for ($i = 2; $i < count($argv); $i++) {
        if (str_starts_with($argv[$i], '--')) {
            $options[substr($argv[$i], 2)] = $argv[++$i] ?? '';
        } else {
            $options['arg'] = $argv[$i];
        }
    }
    return [$command, $options];
}

/** The one Superadmin account (any status), locked; null when none exists. */
function account_admin_superadmin(PDO $pdo): ?array
{
    $row = $pdo->query("SELECT user_id, login_email, display_name, role, status FROM user_accounts WHERE role = 'superadmin' FOR UPDATE")->fetch(PDO::FETCH_ASSOC);
    return $row === false ? null : $row;
}

function account_admin_confirm(array $plan): void
{
    echo "This will:\n";
    foreach ($plan as $line) echo "  - {$line}\n";
    echo 'Type YES to continue: ';
    if (trim((string) fgets(STDIN)) !== 'YES') account_admin_fail('Cancelled. Nothing was changed.');
}

$config = app_config();
$pdo = create_pdo($config);
[$command, $options] = account_admin_args($argv);
$reason = trim((string) ($options['reason'] ?? ''));
if (!in_array($command, ['create-superadmin', 'reset-superadmin-2fa', 'move-email', 'unretire-email'], true)) {
    account_admin_fail('Usage: account-admin.php create-superadmin|reset-superadmin-2fa|move-email|unretire-email ... --reason "..."');
}
if (mb_strlen($reason) < 8 || mb_strlen($reason) > 240) account_admin_fail('--reason is required (8 to 240 characters).');
$systemActor = ['user_id' => null, 'login_email' => null, 'role' => 'system', 'display_name' => 'System', 'session_id' => null];
$context = ['request_id' => 'account-admin-' . uuid_v4_string(), 'ip_address' => null, 'user_agent' => 'backend/bin/account-admin.php',
    'http_method' => 'CLI', 'endpoint' => 'bin/account-admin.php ' . $command];

try {
    $afterCommit = [];
    if ($command === 'create-superadmin') {
        $pdo->beginTransaction();
        $invitation = superadmin_invitation_issue($pdo, $config, [
            'email' => (string) ($options['email'] ?? ''), 'prefix' => $options['prefix'] ?? null, 'firstName' => $options['first'] ?? null,
            'middleName' => $options['middle'] ?? null, 'lastName' => $options['last'] ?? null, 'suffix' => $options['suffix'] ?? null,
        ], $reason, $systemActor, $context);
        account_admin_confirm(["create the Superadmin account for {$invitation['name']} ({$invitation['email']}) as Pending Activation, or replace its still-unused set-password link",
            'email a set-password link to that address (expires in 7 days); the Superadmin sets up 2FA at the first sign-in']);
        $pdo->commit();
        $link = app_url($config, '/activate-faculty', ['token' => $invitation['token']]);
        // Recorded in the email outbox (Email History) like Faculty invitations; there is no acting user, so the account is its own sender.
        $sent = faculty_invitation_send_recorded($pdo, $config, (int) $invitation['userId'], $invitation['email'], $invitation['name'], 'DentiSYS Superadmin Invitation',
            'Superadmin Invitation', email_superadmin_invitation_html($invitation['name'], $invitation['email'], $link), (int) $invitation['userId']);
        if (!$sent) {
            $pdo->prepare("UPDATE security_tokens SET revoked_at = CURRENT_TIMESTAMP(6), revocation_reason = 'Superadmin invitation email delivery failed' WHERE token_id = ? AND used_at IS NULL AND revoked_at IS NULL")
                ->execute([$invitation['tokenId']]);
            account_admin_fail('The invitation email was not delivered and its link was revoked. Fix mail delivery and run the command again.');
        }
        echo "Invitation email sent to {$invitation['email']}.\n";
        if (!empty($config['show_dev_invitation_link'])) echo "Development invitation link: {$link}\n";
    } elseif ($command === 'reset-superadmin-2fa') {
        $pdo->beginTransaction();
        $superadmin = account_admin_superadmin($pdo);
        if ($superadmin === null || $superadmin['status'] !== 'Active') account_admin_fail('Refused: there is no active Superadmin account.');
        account_admin_confirm(["remove the authenticator and recovery codes of the Superadmin {$superadmin['display_name']} ({$superadmin['login_email']})",
            'sign the Superadmin out everywhere; the next sign-in opens Set up 2FA']);
        $revoke = $pdo->prepare(
            "UPDATE security_tokens
             SET mfa_status = CASE WHEN purpose = 'mfa_credential' THEN 'revoked' ELSE mfa_status END,
                 revoked_at = ?, revocation_reason = 'Reset on the server'
             WHERE user_id = ? AND purpose IN ('mfa_credential', 'mfa_recovery') AND revoked_at IS NULL"
        );
        $revoke->execute([(new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d H:i:s.u'), $superadmin['user_id']]);
        if ($revoke->rowCount() === 0) account_admin_fail('Refused: the Superadmin does not use 2FA.');
        people_end_sessions($pdo, (int) $superadmin['user_id'], '2FA reset on the server');
        audit_record_action($pdo, $config, $systemActor, 'people', 'superadmin_2fa_reset', 'user_account', (string) $superadmin['user_id'],
            "Reset 2FA for the Superadmin {$superadmin['display_name']} on the server.", ['reason' => $reason, 'context' => $context]);
        $pdo->commit();
    } elseif ($command === 'move-email') {
        $email = validate_institutional_email((string) ($options['to'] ?? ''));
        $pdo->beginTransaction();
        $superadmin = account_admin_superadmin($pdo);
        if ($superadmin === null || $superadmin['status'] !== 'Active') account_admin_fail('Refused: there is no active Superadmin account.');
        account_move_email_check($pdo, $superadmin, $email);
        account_admin_confirm(["move the Superadmin {$superadmin['display_name']} from {$superadmin['login_email']} to {$email}", "retire {$superadmin['login_email']} for good",
            'sign the Superadmin out, remove the password, 2FA and Google link, and email a password-setup link to the new address only']);
        $send = account_move_email($pdo, $config, array_merge($systemActor, ['context' => $context]), $superadmin, $email, $reason, false);
        $pdo->commit();
        $send();
    } else {
        $email = validate_email((string) ($options['arg'] ?? ''));
        $pdo->beginTransaction();
        $stmt = $pdo->prepare('SELECT user_id FROM retired_emails WHERE email = ? FOR UPDATE');
        $stmt->execute([$email]);
        $formerOwner = $stmt->fetchColumn();
        if ($formerOwner === false) account_admin_fail("{$email} is not a retired address.");
        account_admin_confirm(["release {$email} so it can be used again"]);
        $pdo->prepare('DELETE FROM retired_emails WHERE email = ?')->execute([$email]);
        audit_record_action($pdo, $config, $systemActor, 'people', 'email_unretired', 'user_account', (string) $formerOwner,
            "Released the retired email {$email}.", ['reason' => $reason, 'context' => $context]);
        $pdo->commit();
    }
} catch (SuperadminConflict | ValidationException | DomainException $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    account_admin_fail('Refused: ' . ($e instanceof ValidationException ? ($e->getErrors()[0]['message'] ?? 'invalid input') : $e->getMessage()));
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    account_admin_fail('Failed, nothing was changed: ' . $e->getMessage());
}
echo "Done.\n";
