<?php

declare(strict_types=1);

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\SMTP;
use PHPMailer\PHPMailer\Exception as PHPMailerException;

if (!function_exists('validate_email')) {
    function validate_email(string $email): string
    {
        $email = trim($email);
        if ($email === '') {
            throw new ValidationException([['field' => 'email', 'message' => 'Email address is required.']]);
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new ValidationException([['field' => 'email', 'message' => 'Invalid email address format.']]);
        }
        return $email;
    }
}

if (!function_exists('validate_institutional_email')) {
    function validate_institutional_email(string $email): string
    {
        $email = validate_email($email);
        return $email;
    }
}

/**
 * Log an email attempt into the email_log table.
 */
function log_email_attempt(
    PDO $pdo,
    string $recipientEmail,
    string $subject,
    string $emailType,
    string $status,
    ?string $errorMessage = null
): int {
    try {
        $stmt = $pdo->prepare(
            "INSERT INTO email_log (recipient_email, subject, email_type, status, timestamp, error_message)
             VALUES (?, ?, ?, ?, NOW(6), ?)"
        );
        $stmt->execute([
            $recipientEmail,
            $subject,
            $emailType,
            $status,
            $errorMessage
        ]);
        return (int) $pdo->lastInsertId();
    } catch (\Throwable $e) {
        error_log("Failed to insert into email_log: " . $e->getMessage());
        return 0;
    }
}

/**
 * Check if a duplicate email was sent recently (to prevent spam/duplicate triggers).
 */
function is_duplicate_email(
    PDO $pdo,
    string $recipientEmail,
    string $emailType,
    int $throttleSeconds = 60
): bool {
    try {
        $stmt = $pdo->prepare(
            "SELECT email_log_id FROM email_log
             WHERE recipient_email = ? AND email_type = ? AND status = 'Sent'
               AND timestamp >= (NOW(6) - INTERVAL ? SECOND)
             LIMIT 1"
        );
        $stmt->execute([$recipientEmail, $emailType, $throttleSeconds]);
        return $stmt->fetch() !== false;
    } catch (\Throwable $e) {
        return false;
    }
}

/**
 * Primary function to send outgoing email using PHPMailer.
 *
 * @param PDO $pdo Active database connection for email logging
 * @param string $recipientEmail Recipient email address
 * @param string $recipientName Recipient display name
 * @param string $subject Email subject line
 * @param string $htmlBody HTML content of the email
 * @param string $textBody Plain text alternative body
 * @param string $emailType Categorical identifier (e.g. 'Class Secretary Assignment', 'Session Notification', 'Password Reset', 'Privacy Consent')
 * @param bool $preventDuplicate Whether to check and suppress duplicate emails within 60s
 * @return array Standard result array ['success' => bool, 'message' => string, 'email_log_id' => int|null, 'error' => string|null]
 */
function send_system_email(
    PDO $pdo,
    string $recipientEmail,
    string $recipientName,
    string $subject,
    string $htmlBody,
    string $textBody,
    string $emailType = 'System Notice',
    bool $preventDuplicate = true
): array {
    // 1. Validate recipient email
    try {
        $recipientEmail = validate_email($recipientEmail);
    } catch (ValidationException $e) {
        $errorMsg = 'Invalid recipient email address.';
        log_email_attempt($pdo, $recipientEmail, $subject, $emailType, 'Failed', $errorMsg);
        return [
            'success' => false,
            'message' => $errorMsg,
            'email_log_id' => null,
            'error' => $errorMsg,
        ];
    }

    // 2. Duplicate prevention check
    if ($preventDuplicate && is_duplicate_email($pdo, $recipientEmail, $emailType, 60)) {
        $msg = 'Email sending skipped: duplicate email sent recently.';
        return [
            'success' => true,
            'message' => $msg,
            'email_log_id' => null,
            'error' => null,
        ];
    }

    $config = app_config();
    $smtpConfig = $config['smtp'] ?? [];

    $mail = new PHPMailer(true);

    try {
        $host = $smtpConfig['host'] ?? '';
        $port = (int) ($smtpConfig['port'] ?? 587);
        $user = $smtpConfig['user'] ?? '';
        $pass = $smtpConfig['pass'] ?? '';
        $secure = strtolower($smtpConfig['secure'] ?? 'tls');
        $fromEmail = $smtpConfig['from_email'] ?? 'noreply@bicol-u.edu.ph';
        $fromName = $smtpConfig['from_name'] ?? 'DentiSys Official';

        if (!empty($host) && !empty($user)) {
            $mail->isSMTP();
            $mail->Host = $host;
            $mail->SMTPAuth = true;
            $mail->Username = $user;
            $mail->Password = $pass;
            $mail->Port = $port;
            $mail->Timeout = 10;

            if ($secure === 'tls') {
                $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
            } elseif ($secure === 'ssl') {
                $mail->SMTPSecure = PHPMailer::ENCRYPTION_SMTPS;
            } else {
                $mail->SMTPSecure = '';
                $mail->SMTPAutoTLS = false;
            }
        } else {
            // Local dev fallback if SMTP is not explicitly set up
            $mail->isMail();
        }

        $mail->setFrom($fromEmail, $fromName);
        $mail->addAddress($recipientEmail, $recipientName);

        $mail->isHTML(true);
        $mail->Subject = $subject;
        $mail->Body = $htmlBody;
        $mail->AltBody = $textBody ?: strip_tags($htmlBody);
        $mail->CharSet = 'UTF-8';

        $mail->send();

        $logId = log_email_attempt($pdo, $recipientEmail, $subject, $emailType, 'Sent', null);

        return [
            'success' => true,
            'message' => 'Email sent successfully.',
            'email_log_id' => $logId,
            'error' => null,
        ];
    } catch (PHPMailerException $e) {
        $errorDetails = $mail->ErrorInfo ?: $e->getMessage();
        error_log("PHPMailer Exception [{$emailType}] to {$recipientEmail}: " . $errorDetails);

        $logId = log_email_attempt($pdo, $recipientEmail, $subject, $emailType, 'Failed', $errorDetails);

        return [
            'success' => false,
            'message' => 'Failed to send email. Please check server SMTP configuration.',
            'email_log_id' => $logId,
            'error' => 'Email delivery failed.',
        ];
    } catch (\Throwable $e) {
        $errorDetails = $e->getMessage();
        error_log("General Mailer Exception [{$emailType}] to {$recipientEmail}: " . $errorDetails);

        $logId = log_email_attempt($pdo, $recipientEmail, $subject, $emailType, 'Failed', $errorDetails);

        return [
            'success' => false,
            'message' => 'An unexpected error occurred while processing email delivery.',
            'email_log_id' => $logId,
            'error' => 'Email delivery error.',
        ];
    }
}
