<?php

declare(strict_types=1);

// Shared layout for every email DentiSys sends. It follows the email design in
// frontend/src/components/email/EmailPreviewModal.tsx. It uses a simple
// institutional header and email-safe tables with inline styles.

const EMAIL_FONT = "Arial, 'Helvetica Neue', Helvetica, sans-serif";

function email_escape(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

/** Bold, escaped value for use inside an email paragraph. */
function email_strong(string $value): string
{
    return '<strong style="color:#0f172a;">' . email_escape($value) . '</strong>';
}

/** Plain text (for example a Faculty-written message) as escaped paragraphs. */
function email_text_paragraphs(string $text): array
{
    $blocks = preg_split('/\R{2,}/u', trim($text)) ?: [];
    $paragraphs = [];
    foreach ($blocks as $block) {
        if (trim($block) !== '') {
            $paragraphs[] = nl2br(email_escape(trim($block)), false);
        }
    }
    return $paragraphs;
}

/**
 * Render a complete HTML email.
 *
 * $email keys (all optional except greeting):
 *  - preheader: string, inbox preview text
 *  - greeting: string, e.g. "Hello Juan Dela Cruz," (escaped here)
 *  - intro: list of paragraph HTML (callers escape values)
 *  - details: ['title' => string, 'rows' => list<[label, value]>] (escaped here)
 *  - action_text: paragraph HTML shown above the button
 *  - button: ['label' => string, 'url' => string] (escaped here)
 *  - show_link: bool, show the copyable URL under the button (default true when a button is set)
 *  - notice: HTML for the amber notice box
 *  - outro: list of paragraph HTML
 *  - signature: ['name' => string, 'lines' => list<string>] (escaped here)
 */
function email_render(array $email): string
{
    $font = EMAIL_FONT;
    $p = static fn(string $html): string =>
        '<p style="margin:0 0 14px;font-family:' . $font . ';font-size:15px;line-height:23px;color:#374151;">' . $html . '</p>';

    $body = '<p style="margin:0 0 14px;font-family:' . $font . ';font-size:15px;line-height:23px;font-weight:bold;color:#111827;">'
        . email_escape((string) ($email['greeting'] ?? 'Hello,')) . '</p>';
    foreach (($email['intro'] ?? []) as $paragraph) {
        $body .= $p((string) $paragraph);
    }

    if (!empty($email['details']['rows'])) {
        $details = $email['details'];
        $rows = '';
        foreach ($details['rows'] as [$label, $value]) {
            $rows .= '<tr>'
                . '<td valign="top" style="width:38%;padding:9px 12px 9px 0;border-top:1px solid #e5e7eb;font-family:' . $font . ';font-size:13px;line-height:19px;color:#6b7280;">' . email_escape((string) $label) . '</td>'
                . '<td valign="top" style="padding:9px 0;border-top:1px solid #e5e7eb;font-family:' . $font . ';font-size:14px;line-height:20px;font-weight:bold;color:#1f2937;">' . email_escape((string) $value) . '</td>'
                . '</tr>';
        }
        $body .= '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0;border-collapse:collapse;">'
            . '<tr><td colspan="2" style="padding:0 0 8px;font-family:' . $font . ';font-size:14px;line-height:20px;font-weight:bold;color:#1f2937;">'
            . email_escape((string) ($details['title'] ?? 'Details')) . '</td></tr>'
            . $rows . '</table>';
    }

    if (!empty($email['action_text'])) {
        $body .= $p((string) $email['action_text']);
    }

    if (!empty($email['button']['url'])) {
        $url = email_escape((string) $email['button']['url']);
        $label = email_escape((string) ($email['button']['label'] ?? 'Open DentiSys'));
        $body .= '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0;"><tr>'
            . '<td bgcolor="#176b4d" style="background:#176b4d;border-radius:4px;">'
            . '<a href="' . $url . '" target="_blank" style="display:inline-block;padding:11px 18px;font-family:' . $font . ';font-size:14px;line-height:20px;font-weight:bold;color:#ffffff;text-decoration:none;">'
            . $label . '</a></td></tr></table>';
        if ($email['show_link'] ?? true) {
            $body .= '<p style="margin:0 0 6px;font-family:' . $font . ';font-size:13px;line-height:19px;color:#4b5563;">If the button above does not work, copy and paste this link into your browser:</p>'
                . '<p style="margin:0 0 18px;font-family:' . $font . ';font-size:12px;line-height:18px;overflow-wrap:anywhere;">'
                . '<a href="' . $url . '" target="_blank" style="color:#176b4d;">' . $url . '</a></p>';
        }
    }

    if (!empty($email['notice'])) {
        $body .= '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;border-left:3px solid #c79a32;background:#faf8f1;"><tr>'
            . '<td style="padding:10px 12px;font-family:' . $font . ';font-size:13px;line-height:20px;color:#514629;">'
            . (string) $email['notice'] . '</td></tr></table>';
    }

    foreach (($email['outro'] ?? []) as $paragraph) {
        $body .= $p((string) $paragraph);
    }

    $signature = $email['signature'] ?? [];
    $signatureName = (string) ($signature['name'] ?? 'DentiSys');
    $signatureLines = $signature['lines'] ?? ['Bicol University College of Dental Medicine'];
    $sig = '<p style="margin:0 0 3px;font-family:' . $font . ';font-size:14px;line-height:20px;font-weight:bold;color:#1f2937;">' . email_escape($signatureName) . '</p>';
    foreach ($signatureLines as $line) {
        $sig .= '<p style="margin:0 0 3px;font-family:' . $font . ';font-size:13px;line-height:19px;color:#4b5563;">' . email_escape((string) $line) . '</p>';
    }

    $preheader = email_escape((string) ($email['preheader'] ?? ''));
    return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">'
        . '<meta name="viewport" content="width=device-width, initial-scale=1.0"><title>DentiSys</title></head>'
        . '<body style="margin:0;padding:0;background:#f3f4f6;">'
        . '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f3f4f6;">' . $preheader . '</div>'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f3f4f6" style="background:#f3f4f6;">'
        . '<tr><td align="center" style="padding:24px 12px;">'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border:1px solid #e5e7eb;border-collapse:separate;">'
        . '<tr><td style="padding:18px 24px;border-bottom:3px solid #176b4d;font-family:' . $font . ';">'
        . '<p style="margin:0 0 4px;font-size:12px;line-height:18px;color:#4b5563;">Bicol University &middot; College of Dental Medicine</p>'
        . '<p style="margin:0;font-size:18px;line-height:24px;font-weight:bold;color:#1f2937;">DentiSys Academic Portal</p>'
        . '</td></tr>'
        . '<tr><td style="padding:24px;font-family:' . $font . ';">' . $body . '</td></tr>'
        . '<tr><td style="padding:16px 24px 20px;border-top:1px solid #e5e7eb;font-family:' . $font . ';">' . $sig . '</td></tr>'
        . '</table></td></tr></table></body></html>';
}
function email_student_invitation_html(
    string $studentName,
    string $facultyName,
    string $className,
    string $schoolYear,
    string $link
): string {
    $faculty = $facultyName !== '' ? $facultyName : 'your Faculty instructor';
    return email_render([
        'preheader' => "Class invitation: {$className}",
        'greeting' => "Hello {$studentName},",
        'intro' => [email_strong($faculty) . ' invited you to join ' . email_strong($className) . ' on DentiSys.'],
        'details' => [
            'title' => 'Class Invitation Details',
            'rows' => [
                ['Class', $className],
                ['School year', $schoolYear !== '' ? 'S.Y. ' . $schoolYear : 'Not provided'],
                ['Faculty', $faculty],
            ],
        ],
        'action_text' => 'Accept the invitation to set your password and join the class.',
        'button' => ['label' => 'Accept invitation', 'url' => $link],
        'notice' => 'This link expires in <strong>7 days</strong>. If you were not expecting this invitation, contact your Faculty instructor.',
        'signature' => ['name' => $faculty, 'lines' => ['Bicol University College of Dental Medicine']],
    ]);
}

function email_secretary_invitation_html(
    string $studentName,
    string $facultyName,
    string $className,
    string $schoolYear,
    string $link
): string {
    return email_render([
        'preheader' => "Class Secretary invitation for {$className}",
        'greeting' => "Hello {$studentName},",
        'intro' => [email_strong($facultyName) . ' invited you to serve as Class Secretary for ' . email_strong($className) . '.'],
        'details' => [
            'title' => 'Class Secretary Appointment',
            'rows' => [
                ['Class', $className],
                ['School year', $schoolYear !== '' ? 'S.Y. ' . $schoolYear : 'Not provided'],
                ['Faculty', $facultyName],
            ],
        ],
        'action_text' => 'You will help with attendance and clinic logs. Accept the appointment to set your password and activate your account.',
        'button' => ['label' => 'Accept appointment', 'url' => $link],
        'notice' => 'This link expires in <strong>7 days</strong>. If you were not expecting this invitation, you can ignore this email.',
        'signature' => ['name' => $facultyName, 'lines' => ['Bicol University College of Dental Medicine']],
    ]);
}

function email_faculty_invitation_html(string $name, string $email, string $link, bool $updated = false): string
{
    $intro = $updated
        ? ["The Dean's Office updated your pending faculty invitation. Use the new link below; earlier invitation links no longer work."]
        : ["The Dean's Office invited you to create a Faculty account in DentiSys."];
    return email_render([
        'preheader' => $updated ? 'Your faculty invitation was updated.' : 'Faculty account invitation',
        'greeting' => $name !== '' ? "Hello {$name}," : 'Hello,',
        'intro' => $intro,
        'details' => [
            'title' => 'Faculty Account Invitation',
            'rows' => [
                ['Name', $name !== '' ? $name : 'Not provided'],
                ['Email', $email],
                ['Role', 'Faculty'],
            ],
        ],
        'action_text' => 'Use the link below to set your password and activate your account.',
        'button' => ['label' => 'Accept invitation', 'url' => $link],
        'notice' => 'This link expires in <strong>7 days</strong>. After activation, you can connect Google Sign-In from your profile. If you were not expecting this invitation, you can ignore this email.',
        'signature' => ['name' => 'Office of the Dean', 'lines' => ['Bicol University College of Dental Medicine']],
    ]);
}

function email_dean_invitation_html(string $name, string $email, string $link): string
{
    return email_render([
        'preheader' => 'Dean account invitation',
        'greeting' => $name !== '' ? "Hello {$name}," : 'Hello,',
        'intro' => ['You have been invited to set up the first Dean account for DentiSys.'],
        'details' => [
            'title' => 'Dean Account Invitation',
            'rows' => [
                ['Name', $name !== '' ? $name : 'Not provided'],
                ['Email', $email],
                ['Role', 'Dean'],
            ],
        ],
        'action_text' => 'Use the link below to set your password and activate the account.',
        'button' => ['label' => 'Accept invitation', 'url' => $link],
        'notice' => 'This link expires in <strong>7 days</strong>. If you were not expecting this invitation, you can ignore this email.',
        'signature' => ['name' => 'DentiSys', 'lines' => ['Bicol University College of Dental Medicine']],
    ]);
}

function email_password_reset_html(string $name, string $email, string $link): string
{
    return email_render([
        'preheader' => 'Reset your DentiSys password.',
        'greeting' => $name !== '' ? "Hello {$name}," : 'Hello,',
        'intro' => ['A password reset was requested for your DentiSys account.'],
        'details' => [
            'title' => 'Account',
            'rows' => [
                ['Email', $email],
            ],
        ],
        'action_text' => 'Click the button below to set a new password:',
        'button' => ['label' => 'Reset Password', 'url' => $link],
        'notice' => 'This link expires in <strong>24 hours</strong>. If you did not request a reset, you can ignore this email. Your password will stay the same.',
        'signature' => ['name' => 'DentiSys Support', 'lines' => ['Bicol University College of Dental Medicine']],
    ]);
}

/** A message a Faculty member writes in Email Management, wrapped in the DentiSys layout. */
function email_faculty_message_html(string $recipientName, string $facultyName, string $messageText): string
{
    return email_render([
        'preheader' => mb_substr(preg_replace('/\s+/u', ' ', trim($messageText)) ?? '', 0, 120),
        'greeting' => $recipientName !== '' ? "Dear {$recipientName}," : 'Hello,',
        'intro' => email_text_paragraphs($messageText),
        'signature' => ['name' => $facultyName !== '' ? $facultyName : 'Your Faculty instructor', 'lines' => ['Bicol University College of Dental Medicine']],
    ]);
}
