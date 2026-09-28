<?php

declare(strict_types=1);

require_once __DIR__ . '/../../backend/app/email_template.php';
require_once __DIR__ . '/../../backend/app/mailer.php';

function assert_email(bool $condition, string $label): void
{
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$label}\n");
        exit(1);
    }
    echo "PASS: {$label}\n";
}

$link = 'https://dentisys.example.test/activate-student?token=abc123&x=1';
$emails = [
    'student invitation' => email_student_invitation_html('Juan <Dela> Cruz', 'Dr. Ana Reyes', 'DENT 401 — Oral Surgery', '2026-2027', $link),
    'secretary invitation' => email_secretary_invitation_html('Maria Santos', 'Dr. Ana Reyes', 'DENT 401', '2026-2027', $link),
    'faculty invitation' => email_faculty_invitation_html('Dr. Ana Reyes', 'ana@bicol-u.edu.ph', $link),
    'faculty invitation update' => email_faculty_invitation_html('Dr. Ana Reyes', 'ana@bicol-u.edu.ph', $link, true),
    'password reset' => email_password_reset_html('Ana Reyes', 'ana@bicol-u.edu.ph', $link),
    'faculty message' => email_faculty_message_html('Juan Cruz', 'Dr. Ana Reyes', "Please see me.\n\n<b>Room 2</b>"),
];

foreach ($emails as $label => $html) {
    assert_email(str_starts_with($html, '<!DOCTYPE html>'), "{$label} is a complete HTML document");
    assert_email(str_contains($html, 'Bicol University &middot; College of Dental Medicine'), "{$label} uses the institutional header");
    assert_email(str_contains($html, 'DentiSys Academic Portal'), "{$label} shows the portal title");
    assert_email(!str_contains($html, '<script'), "{$label} has no script");
}

foreach (['student invitation', 'secretary invitation', 'faculty invitation', 'password reset'] as $label) {
    assert_email(str_contains($emails[$label], 'href="https://dentisys.example.test/activate-student?token=abc123&amp;x=1"'), "{$label} links the escaped action URL");
    assert_email(str_contains($emails[$label], 'If the button above does not work'), "{$label} shows the copyable link");
}

assert_email(str_contains($emails['student invitation'], 'Juan &lt;Dela&gt; Cruz'), 'recipient names are escaped');
assert_email(str_contains($emails['student invitation'], 'Class Invitation Details'), 'student invitation has the class details card');
assert_email(str_contains($emails['student invitation'], 'S.Y. 2026-2027'), 'student invitation shows the school year');
assert_email(str_contains($emails['student invitation'], '24 hours'), 'student invitation states its 24-hour expiry');
assert_email(str_contains($emails['secretary invitation'], '7 days'), 'secretary invitation states its 7-day expiry');
assert_email(str_contains($emails['faculty message'], '&lt;b&gt;Room 2&lt;/b&gt;'), 'Faculty-written text is escaped');
assert_email(str_contains($emails['faculty message'], '>Please see me.</p>'), 'Faculty message paragraphs are kept');

// The SMTP body is base64 so no line exceeds the 998-character SMTP limit.
$encoded = rtrim(chunk_split(base64_encode($emails['student invitation']), 76, "\r\n"), "\r\n");
$longest = max(array_map('strlen', explode("\r\n", $encoded)));
assert_email($longest <= 76, 'encoded email lines stay within SMTP limits');
assert_email(base64_decode(str_replace("\r\n", '', $encoded), true) === $emails['student invitation'], 'encoded email round-trips');
$mailerSource = (string) file_get_contents(__DIR__ . '/../../backend/app/mailer.php');
assert_email(str_contains($mailerSource, "'Content-Transfer-Encoding' => 'base64'"), 'mailer declares base64 transfer encoding');
