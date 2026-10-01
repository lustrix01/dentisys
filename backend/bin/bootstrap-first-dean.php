<?php

declare(strict_types=1);

/*
 * REG-010 first Dean. On a database with no Dean/Admin account, invite the
 * Dean named in deployment configuration:
 *   FIRST_DEAN_EMAIL (required), FIRST_DEAN_FIRST_NAME, FIRST_DEAN_LAST_NAME,
 *   and optional FIRST_DEAN_PREFIX, FIRST_DEAN_MIDDLE_NAME, FIRST_DEAN_SUFFIX.
 * The invitation e-mail uses the normal invitation acceptance page. Nothing
 * happens once a Dean account is active; an expired, unaccepted first-Dean
 * invitation is replaced by a new one.
 *
 * start-dev.ps1 runs it; an operator can also run it.
 *
 * Usage (inside the web container):
 *   docker compose exec web php /var/www/html/backend/bin/bootstrap-first-dean.php
 */

require __DIR__ . '/../app/bootstrap.php';
require_once __DIR__ . '/../controllers/FacultyInvitationController.php';

$config = app_config();
$pdo = create_pdo($config);
$setting = static function (string $name): ?string {
    $value = getenv($name);
    return $value === false || trim($value) === '' ? null : trim($value);
};
$settings = [
    'email' => $setting('FIRST_DEAN_EMAIL'),
    'prefix' => $setting('FIRST_DEAN_PREFIX'),
    'firstName' => $setting('FIRST_DEAN_FIRST_NAME'),
    'middleName' => $setting('FIRST_DEAN_MIDDLE_NAME'),
    'lastName' => $setting('FIRST_DEAN_LAST_NAME'),
    'suffix' => $setting('FIRST_DEAN_SUFFIX'),
];
$context = [
    'request_id' => 'bootstrap-first-dean-' . uuid_v4_string(),
    'ip_address' => null,
    'user_agent' => 'backend/bin/bootstrap-first-dean.php',
    'http_method' => 'CLI',
    'endpoint' => 'bin/bootstrap-first-dean.php',
];

$pdo->beginTransaction();
try {
    $result = first_dean_invitation_issue($pdo, $config, $settings, $context);
    $pdo->commit();
} catch (ValidationException $e) {
    $pdo->rollBack();
    $messages = array_map(static fn(array $error): string => "{$error['field']}: {$error['message']}", $e->getErrors());
    fwrite(STDERR, 'FIRST_DEAN_* is invalid: ' . implode('; ', $messages) . "\n");
    exit(1);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    fwrite(STDERR, 'First Dean invitation failed: ' . $e->getMessage() . "\n");
    exit(1);
}

echo $result['message'] . "\n";
if ($result['action'] === 'invited') {
    $link = app_url($config, '/activate-faculty', ['token' => $result['token']]);
    $sent = send_email($result['email'], 'DentiSys Dean Invitation', email_dean_invitation_html($result['name'], $result['email'], $link), $config, true);
    if (!$sent) {
        try {
            $pdo->beginTransaction();
            first_dean_invitation_delivery_failed($pdo, $config, $result, $context);
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            fwrite(STDERR, 'Invitation delivery failed and its token could not be revoked: ' . $e->getMessage() . "\n");
            exit(1);
        }
    }
    echo $sent ? "Invitation e-mail sent to {$result['email']}.\n" : "Invitation e-mail delivery failed; rerun after fixing mail delivery.\n";
    if ($sent && !empty($config['show_dev_invitation_link'])) {
        echo "Development invitation link: {$link}\n";
    }
    exit($sent ? 0 : 1);
}
exit(0);
