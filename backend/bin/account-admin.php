<?php

declare(strict_types=1);

/*
 * Account administration for the system administrator (docs/contracts/roles.md section 7). Not an app feature:
 * the Dean role and the Dean's own email change only here, on the server. Every command prints what it will do,
 * asks "Type YES to continue", runs in one transaction and audits as System with the reason.
 *
 * Usage (inside the web container):
 *   docker compose exec web php /var/www/html/backend/bin/account-admin.php transfer-dean --to <faculty email> --old-dean faculty|deactivate --reason "..."
 *   docker compose exec web php /var/www/html/backend/bin/account-admin.php move-email --to <new email> --reason "..."
 *   docker compose exec web php /var/www/html/backend/bin/account-admin.php unretire-email <email> --reason "..."
 */

require __DIR__ . '/../app/bootstrap.php';
require_once __DIR__ . '/../controllers/StudentAuthController.php';
require_once __DIR__ . '/../controllers/SuperadminController.php';

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

function account_admin_dean(PDO $pdo): array
{
    $rows = $pdo->query("SELECT user_id, login_email, display_name, role, status FROM user_accounts WHERE role = 'admin' AND status = 'Active' FOR UPDATE")->fetchAll(PDO::FETCH_ASSOC);
    if (count($rows) !== 1) account_admin_fail('Expected exactly one active Dean account, found ' . count($rows) . '.');
    return $rows[0];
}

/** Why the Dean role cannot move now: a term is in progress, or the new Dean has a class whose term has not ended. Null when it can. */
function account_admin_transfer_blocker(PDO $pdo, int $newDeanId): ?string
{
    $today = (new DateTimeImmutable('now', new DateTimeZone('Asia/Manila')))->format('Y-m-d');
    $terms = academic_terms_read($pdo);
    foreach ($terms as $t) {
        if ($t['start_date'] <= $today && $t['end_date'] >= $today) return "A term is in progress ({$t['school_year']} {$t['semester']}, {$t['start_date']} to {$t['end_date']}).";
    }
    $stmt = $pdo->prepare('SELECT cs_name, school_year, semester, term_start_date, term_end_date FROM class_sections WHERE instructor_user_id = ? AND archived_at IS NULL');
    $stmt->execute([$newDeanId]);
    $current = academic_current_school_year($pdo);
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $class) {
        $end = academic_resolve_class_term_dates($class, $terms)['endDate'];
        // shortcut: a class with no term dates counts as not ended while its school year is the current or a later one.
        if ($end === null ? strcmp((string) $class['school_year'], $current) >= 0 : (string) $end >= $today) {
            return "The new Dean has a class whose term has not ended ({$class['cs_name']}, {$class['school_year']}). Archive or reassign it first.";
        }
    }
    return null;
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
if (!in_array($command, ['transfer-dean', 'move-email', 'unretire-email'], true)) {
    account_admin_fail('Usage: account-admin.php transfer-dean|move-email|unretire-email ... --reason "..."');
}
if (mb_strlen($reason) < 8 || mb_strlen($reason) > 240) account_admin_fail('--reason is required (8 to 240 characters).');
$systemActor = ['user_id' => null, 'login_email' => null, 'role' => 'system', 'display_name' => 'System', 'session_id' => null];
$context = ['request_id' => 'account-admin-' . uuid_v4_string(), 'ip_address' => null, 'user_agent' => 'backend/bin/account-admin.php',
    'http_method' => 'CLI', 'endpoint' => 'bin/account-admin.php ' . $command];

try {
    $afterCommit = [];
    if ($command === 'transfer-dean') {
        $oldDeanChoice = (string) ($options['old-dean'] ?? '');
        if (!in_array($oldDeanChoice, ['faculty', 'deactivate'], true)) account_admin_fail('--old-dean faculty|deactivate is required (there is no default).');
        $email = validate_institutional_email((string) ($options['to'] ?? ''));
        $stmt = $pdo->prepare("SELECT user_id, login_email, display_name FROM user_accounts WHERE login_email = ? AND role = 'faculty' AND status = 'Active'");
        $stmt->execute([$email]);
        $target = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($target === false) account_admin_fail("{$email} is not an active Faculty account.");
        $pdo->beginTransaction();
        $dean = account_admin_dean($pdo);
        $blocker = account_admin_transfer_blocker($pdo, (int) $target['user_id']);
        if ($blocker !== null) account_admin_fail("Refused: {$blocker}");
        account_admin_confirm(["make {$target['display_name']} ({$target['login_email']}) the Dean",
            $oldDeanChoice === 'faculty' ? "make {$dean['display_name']} ({$dean['login_email']}) a Faculty member again (still teaches)" : "deactivate {$dean['display_name']} ({$dean['login_email']}) (left)",
            'sign both out everywhere and email both']);
        $pdo->prepare("UPDATE user_accounts SET role = 'admin', updated_at = CURRENT_TIMESTAMP(6) WHERE user_id = ?")->execute([$target['user_id']]);
        $pdo->prepare("UPDATE user_accounts SET role = 'faculty', status = ?, disabled_at = " . ($oldDeanChoice === 'deactivate' ? 'CURRENT_TIMESTAMP(6)' : 'NULL') . ', updated_at = CURRENT_TIMESTAMP(6) WHERE user_id = ?')
            ->execute([$oldDeanChoice === 'deactivate' ? 'Disabled' : 'Active', $dean['user_id']]);
        foreach ([(int) $target['user_id'], (int) $dean['user_id']] as $id) people_end_sessions($pdo, $id, 'Dean role transferred');
        audit_record_action($pdo, $config, $systemActor, 'people', 'dean_transferred', 'user_account', (string) $target['user_id'],
            "Dean role transferred from {$dean['display_name']} to {$target['display_name']}; the outgoing Dean " . ($oldDeanChoice === 'faculty' ? 'is Faculty again.' : 'was deactivated.'),
            ['before' => ['Dean' => $dean['display_name']], 'after' => ['Dean' => $target['display_name'], 'Outgoing Dean' => $oldDeanChoice === 'faculty' ? 'Faculty' : 'Deactivated'],
                'reason' => $reason, 'context' => $context]);
        $pdo->commit();
        $afterCommit[] = [$target, ["You are now the Dean of DentiSYS ({$reason})."]];
        $afterCommit[] = [$dean, ['You are no longer the Dean of DentiSYS' . ($oldDeanChoice === 'faculty' ? '; your account is a Faculty account again.' : ' and your account was deactivated.')]];
        foreach ($afterCommit as [$person, $lines]) {
            send_email((string) $person['login_email'], 'The DentiSYS Dean role changed', email_dean_transferred_html((string) $person['display_name'], $lines), $config, true);
        }
    } elseif ($command === 'move-email') {
        $email = validate_institutional_email((string) ($options['to'] ?? ''));
        $pdo->beginTransaction();
        $dean = account_admin_dean($pdo);
        account_move_email_check($pdo, $dean, $email);
        account_admin_confirm(["move the Dean {$dean['display_name']} from {$dean['login_email']} to {$email}", "retire {$dean['login_email']} for good",
            'sign the Dean out, remove the password, 2FA and Google link, and email a password-setup link to the new address only']);
        $send = account_move_email($pdo, $config, array_merge($systemActor, ['context' => $context]), $dean, $email, $reason, false);
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
} catch (SuperadminConflict | ValidationException $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    account_admin_fail('Refused: ' . ($e instanceof ValidationException ? ($e->getErrors()[0]['message'] ?? 'invalid input') : $e->getMessage()));
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    account_admin_fail('Failed, nothing was changed: ' . $e->getMessage());
}
echo "Done.\n";
