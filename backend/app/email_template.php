<?php

declare(strict_types=1);

// Shared layout for every email DentiSys sends. It follows the email design in
// frontend/src/components/email/EmailPreviewModal.tsx (green institutional
// header, greeting, details card, action button, copyable link, notice and
// signature) using table layout and inline styles, which is what email
// clients render reliably.

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
 *  - details: ['title' => string, 'badge' => ?string, 'rows' => list<[label, value]>] (escaped here)
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
        '<p style="margin:0 0 16px 0;font-family:' . $font . ';font-size:14px;line-height:22px;color:#475569;">' . $html . '</p>';

    $body = '';
    $body .= '<p style="margin:0 0 10px 0;font-family:' . $font . ';font-size:16px;line-height:24px;font-weight:bold;color:#0f172a;">'
        . email_escape((string) ($email['greeting'] ?? 'Hello,')) . '</p>';
    foreach (($email['intro'] ?? []) as $paragraph) {
        $body .= $p((string) $paragraph);
    }

    if (!empty($email['details']['rows'])) {
        $details = $email['details'];
        $badge = isset($details['badge']) && $details['badge'] !== null
            ? '<td align="right" valign="top" style="padding:0 0 10px 0;font-family:' . $font . ';"><span style="display:inline-block;padding:3px 10px;border-radius:999px;background:#059669;color:#ffffff;font-size:10px;font-weight:bold;">'
                . email_escape((string) $details['badge']) . '</span></td>'
            : '';
        $rows = '';
        foreach ($details['rows'] as [$label, $value]) {
            $rows .= '<tr><td style="padding:0 0 12px 0;font-family:' . $font . ';">'
                . '<div style="font-size:10px;line-height:14px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:#94a3b8;">' . email_escape((string) $label) . '</div>'
                . '<div style="font-size:14px;line-height:20px;font-weight:bold;color:#1e293b;">' . email_escape((string) $value) . '</div>'
                . '</td></tr>';
        }
        $body .= '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 20px 0;border:2px solid #a7f3d0;border-radius:16px;background:#f0fdf4;">'
            . '<tr><td style="padding:18px 20px;">'
            . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-bottom:1px solid #a7f3d0;margin-bottom:14px;"><tr>'
            . '<td style="padding:0 0 10px 0;font-family:' . $font . ';font-size:12px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:#065f46;">'
            . email_escape((string) ($details['title'] ?? 'Details')) . '</td>' . $badge . '</tr></table>'
            . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' . $rows . '</table>'
            . '</td></tr></table>';
    }

    if (!empty($email['action_text'])) {
        $body .= $p((string) $email['action_text']);
    }

    if (!empty($email['button']['url'])) {
        $url = email_escape((string) $email['button']['url']);
        $label = email_escape((string) ($email['button']['label'] ?? 'Open DentiSys'));
        $body .= '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 20px 0;"><tr>'
            . '<td bgcolor="#059669" style="border-radius:12px;background:#059669;">'
            . '<a href="' . $url . '" target="_blank" style="display:inline-block;padding:14px 26px;font-family:' . $font . ';font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:12px;">'
            . $label . ' &rarr;</a></td></tr></table>';
        if ($email['show_link'] ?? true) {
            $body .= '<p style="margin:0 0 6px 0;font-family:' . $font . ';font-size:12px;line-height:18px;color:#64748b;">If the button above does not work, copy and paste this link into your browser:</p>'
                . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px 0;"><tr>'
                . '<td style="padding:10px 12px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;font-family:Consolas, Menlo, monospace;font-size:12px;line-height:18px;color:#475569;word-break:break-all;">'
                . '<a href="' . $url . '" target="_blank" style="color:#475569;text-decoration:none;">' . $url . '</a></td></tr></table>';
        }
    }

    if (!empty($email['notice'])) {
        $body .= '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px 0;"><tr>'
            . '<td style="padding:12px 14px;border:1px solid #fcd34d;border-radius:12px;background:#fffbeb;font-family:' . $font . ';font-size:12px;line-height:19px;color:#78350f;">'
            . (string) $email['notice'] . '</td></tr></table>';
    }

    foreach (($email['outro'] ?? []) as $paragraph) {
        $body .= $p((string) $paragraph);
    }

    $signature = $email['signature'] ?? [];
    $signatureName = (string) ($signature['name'] ?? 'DentiSys Academic Portal');
    $signatureLines = $signature['lines'] ?? ['Bicol University College of Dental Medicine'];
    $sig = '<p style="margin:0 0 4px 0;font-family:' . $font . ';font-size:13px;font-weight:bold;color:#1e293b;">' . email_escape($signatureName) . '</p>';
    foreach ($signatureLines as $line) {
        $sig .= '<p style="margin:0 0 4px 0;font-family:' . $font . ';font-size:12px;color:#64748b;">' . email_escape((string) $line) . '</p>';
    }
    $sig .= '<p style="margin:0;font-family:' . $font . ';font-size:11px;color:#94a3b8;">DentiSys Academic &amp; Clinical Management System &middot; Legazpi City, Philippines</p>';

    $preheader = email_escape((string) ($email['preheader'] ?? ''));

    return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">'
        . '<meta name="viewport" content="width=device-width, initial-scale=1.0"><title>DentiSys</title></head>'
        . '<body style="margin:0;padding:0;background:#f1f5f9;">'
        . '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f1f5f9;">' . $preheader . '</div>'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f1f5f9" style="background:#f1f5f9;">'
        . '<tr><td align="center" style="padding:24px 12px;">'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">'
        . '<tr><td align="center" bgcolor="#065f46" style="padding:26px 24px;background:#065f46;background-image:linear-gradient(90deg,#065f46,#115e59,#064e3b);">'
        . '<p style="margin:0 0 4px 0;font-family:' . $font . ';font-size:11px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:#a7f3d0;">Bicol University &middot; College of Dental Medicine</p>'
        . '<p style="margin:0;font-family:' . $font . ';font-size:20px;line-height:28px;font-weight:bold;color:#ffffff;">DentiSys Academic Portal</p>'
        . '</td></tr>'
        . '<tr><td style="padding:28px 28px 8px 28px;">' . $body . '</td></tr>'
        . '<tr><td style="padding:20px 28px 28px 28px;border-top:1px solid #f1f5f9;">' . $sig . '</td></tr>'
        . '</table></td></tr></table></body></html>';
}

const EMAIL_DEPARTMENT = 'BU College of Dental Medicine';

function email_student_invitation_html(
    string $studentName,
    string $facultyName,
    string $className,
    string $schoolYear,
    string $link
): string {
    $faculty = $facultyName !== '' ? $facultyName : 'your Faculty instructor';
    $yearLine = $schoolYear !== '' ? ' for <strong style="color:#0f172a;">Academic Year ' . email_escape($schoolYear) . '</strong>' : '';
    return email_render([
        'preheader' => "You're invited to join {$className} on DentiSys.",
        'greeting' => "Hello {$studentName},",
        'intro' => [
            'You have been invited by your instructor, ' . email_strong($faculty)
                . ', to join the official class roster for ' . email_strong($className) . ' on DentiSys' . $yearLine . '.',
        ],
        'details' => [
            'title' => 'Class Invitation Details',
            'badge' => 'Enrolled Roster',
            'rows' => [
                ['Class Section / Course', $className],
                ['Academic School Year', $schoolYear !== '' ? 'S.Y. ' . $schoolYear : '—'],
                ['Course Faculty Instructor', $faculty],
                ['Department / College', EMAIL_DEPARTMENT],
            ],
        ],
        'action_text' => 'To activate your student account, confirm your class membership, and access clinical requirements, attendance logs, and academic assessments, please click the button below:',
        'button' => ['label' => 'Accept Invitation & Join Class', 'url' => $link],
        'notice' => '<strong>Important:</strong> This invitation link is unique to your institutional email address and will expire in <strong>24 hours</strong>. If you were not expecting it, please contact your Faculty instructor.',
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
    $yearText = $schoolYear !== '' ? ' (S.Y. ' . email_escape($schoolYear) . ')' : '';
    return email_render([
        'preheader' => "You're invited to serve as Class Secretary for {$className}.",
        'greeting' => "Dear {$studentName},",
        'intro' => [
            'You have been officially invited by ' . email_strong($facultyName) . ' to serve as the '
                . email_strong('Class Secretary') . ' for ' . email_strong($className) . $yearText
                . ' at the Bicol University College of Dental Medicine.',
        ],
        'details' => [
            'title' => 'Class Secretary Appointment',
            'badge' => 'Invitation',
            'rows' => [
                ['Class Section', $className],
                ['Academic School Year', $schoolYear !== '' ? 'S.Y. ' . $schoolYear : '—'],
                ['Appointed By', $facultyName],
                ['Department / College', EMAIL_DEPARTMENT],
            ],
        ],
        'action_text' => 'As Class Secretary, you will assist in attendance monitoring and clinic log management. To accept this appointment, set up your password and activate your Class Secretary account using the button below:',
        'button' => ['label' => 'Accept Appointment & Activate Account', 'url' => $link],
        'notice' => '<strong>Notice:</strong> This invitation link is valid for <strong>7 days</strong> from issuance. If you were not expecting this invitation, you can ignore this email.',
        'signature' => ['name' => $facultyName, 'lines' => ['Bicol University College of Dental Medicine']],
    ]);
}

function email_faculty_invitation_html(string $name, string $email, string $link, bool $updated = false): string
{
    $intro = $updated
        ? ['Your pending DentiSys Faculty invitation was updated by an administrator. Links from earlier invitation emails no longer work; please use the button below.']
        : ['An administrator has invited you to join the ' . email_strong('DentiSys Faculty Portal')
            . '. This invitation is your approval to establish a Faculty account.'];
    return email_render([
        'preheader' => $updated ? 'Your DentiSys Faculty invitation was updated.' : "You're invited to the DentiSys Faculty Portal.",
        'greeting' => $name !== '' ? "Dear {$name}," : 'Hello,',
        'intro' => $intro,
        'details' => [
            'title' => 'Faculty Account Invitation',
            'badge' => $updated ? 'Updated' : 'Faculty',
            'rows' => [
                ['Invited Name', $name !== '' ? $name : '—'],
                ['Institutional Email', $email],
                ['Account Role', 'Faculty'],
                ['Department / College', EMAIL_DEPARTMENT],
            ],
        ],
        'action_text' => 'To create your DentiSys password and activate your Faculty account, please click the button below:',
        'button' => ['label' => 'Accept Faculty Invitation', 'url' => $link],
        'notice' => '<strong>Important:</strong> Create your DentiSys password within <strong>7 days</strong>. You can link Google Sign-In from your profile after activation. If you were not expecting this invitation, you can ignore this email.',
        'signature' => ['name' => 'DentiSys Administration', 'lines' => ['Bicol University College of Dental Medicine']],
    ]);
}

function email_dean_invitation_html(string $name, string $email, string $link): string
{
    return email_render([
        'preheader' => "You're invited to administer DentiSys as Dean.",
        'greeting' => $name !== '' ? "Dear {$name}," : 'Hello,',
        'intro' => ['This DentiSys installation has no Dean account yet. You have been named as its first ' . email_strong('Dean') . ' in the deployment configuration.'],
        'details' => [
            'title' => 'Dean Account Invitation',
            'badge' => 'Dean',
            'rows' => [
                ['Invited Name', $name !== '' ? $name : '—'],
                ['Institutional Email', $email],
                ['Account Role', 'Dean'],
                ['Department / College', EMAIL_DEPARTMENT],
            ],
        ],
        'action_text' => 'To create your DentiSys password and activate the Dean account, please click the button below:',
        'button' => ['label' => 'Accept Dean Invitation', 'url' => $link],
        'notice' => '<strong>Important:</strong> Create your DentiSys password within <strong>7 days</strong>. You can link Google Sign-In from your profile after activation. If you were not expecting this invitation, you can ignore this email.',
        'signature' => ['name' => 'DentiSys', 'lines' => ['Bicol University College of Dental Medicine']],
    ]);
}

function email_password_reset_html(string $name, string $email, string $link): string
{
    return email_render([
        'preheader' => 'Reset your DentiSys password.',
        'greeting' => $name !== '' ? "Hello {$name}," : 'Hello,',
        'intro' => ['We received a request to reset the password for your DentiSys account.'],
        'details' => [
            'title' => 'Password Reset Request',
            'badge' => null,
            'rows' => [
                ['Account Email', $email],
            ],
        ],
        'action_text' => 'Click the button below to set a new password:',
        'button' => ['label' => 'Reset Password', 'url' => $link],
        'notice' => '<strong>Important:</strong> This link will expire in <strong>24 hours</strong>. If you did not request a password reset, you can ignore this email; your password will not change.',
        'signature' => ['name' => 'DentiSys Academic Portal', 'lines' => ['Bicol University College of Dental Medicine']],
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
