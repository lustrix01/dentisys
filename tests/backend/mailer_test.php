<?php

declare(strict_types=1);

require_once __DIR__ . '/../../backend/app/mailer.php';

function assert_mailer(bool $condition, string $label): void
{
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$label}\n");
        exit(1);
    }
    echo "PASS: {$label}\n";
}

$base = [
    'app' => ['env' => 'production'],
    'smtp' => [
        'host' => 'smtp.example.test',
        'port' => 587,
        'from' => 'noreply@example.test',
        'user' => '',
        'pass' => '',
        'ca_file' => '',
    ],
];

$unencrypted = $base;
$unencrypted['smtp']['encryption'] = 'none';
$unencrypted['smtp']['verify_peer'] = true;
$result = smtp_transport('person@example.test', 'Subject', '<p>Body</p>', $unencrypted);
assert_mailer($result['sent'] === false, 'Production SMTP fails closed without encryption');
assert_mailer($result['error'] === 'Encrypted SMTP is required outside development.', 'Unencrypted production rejection is explicit');

$unverified = $base;
$unverified['smtp']['encryption'] = 'starttls';
$unverified['smtp']['verify_peer'] = false;
$result = smtp_transport('person@example.test', 'Subject', '<p>Body</p>', $unverified);
assert_mailer($result['sent'] === false, 'Production SMTP fails closed without certificate verification');
assert_mailer($result['error'] === 'SMTP certificate verification is required outside development.', 'Certificate rejection is explicit');

echo "ALL MAILER POLICY TESTS PASSED\n";
