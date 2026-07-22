<?php

declare(strict_types=1);

function email_outbox_log_path(): string
{
    $dir = dirname(__DIR__) . '/storage';
    if (!is_dir($dir)) {
        @mkdir($dir, 0777, true);
    }
    return $dir . '/email_outbox.log';
}

function log_to_outbox(string $to, string $subject, string $body, array $headers = [], bool $smtpSent = false, ?string $smtpError = null): void
{
    $timestamp = (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d H:i:s UTC');
    $logPath = email_outbox_log_path();

    $headerStr = '';
    foreach ($headers as $k => $v) {
        $headerStr .= "{$k}: {$v}\n";
    }

    $entry = sprintf(
        "========================================\n" .
        "DATE: %s\n" .
        "TO: %s\n" .
        "SUBJECT: %s\n" .
        "SMTP STATUS: %s\n" .
        ($smtpError !== null ? "SMTP ERROR: %s\n" : "") .
        "HEADERS:\n%s" .
        "----------------------------------------\n" .
        "BODY:\n%s\n" .
        "========================================\n\n",
        $timestamp,
        $to,
        $subject,
        $smtpSent ? 'SENT' : ($smtpError ? 'FAILED' : 'SKIPPED/LOGGED_ONLY'),
        $smtpError ?? '',
        $headerStr,
        $body
    );

    @file_put_contents($logPath, $entry, FILE_APPEND | LOCK_EX);
}

function send_smtp_email(string $to, string $subject, string $body, array $config): bool
{
    $smtp = $config['smtp'] ?? [];
    $host = (string) ($smtp['host'] ?? '');
    $port = (int) ($smtp['port'] ?? 25);
    $user = (string) ($smtp['user'] ?? '');
    $pass = str_replace(' ', '', (string) ($smtp['pass'] ?? ''));
    $from = (string) ($smtp['from'] ?? 'noreply@dentisys.local');

    if ($host === '' || $host === '127.0.0.1' && $port === 1025 && $user === '') {
        // If unconfigured or default empty local dev, skip live socket and return false (outbox will still log)
        return false;
    }

    $headers = [
        'From' => $from,
        'To' => $to,
        'Subject' => $subject,
        'MIME-Version' => '1.0',
        'Content-Type' => 'text/html; charset=UTF-8',
        'Date' => date('r'),
    ];

    $socket = null;
    $errno = 0;
    $errstr = '';

    try {
        $timeout = 5;
        $context = stream_context_create([
            'ssl' => [
                'verify_peer' => false,
                'verify_peer_name' => false,
                'allow_self_signed' => true,
            ]
        ]);

        $remote = ($port === 465) ? 'ssl://' . $host : $host;
        $socket = @stream_socket_client("{$remote}:{$port}", $errno, $errstr, $timeout, STREAM_CLIENT_CONNECT, $context);

        if (!$socket) {
            log_to_outbox($to, $subject, $body, $headers, false, "Connection failed: {$errstr} ({$errno})");
            return false;
        }

        stream_set_timeout($socket, $timeout);

        $readResponse = function () use ($socket): string {
            $response = '';
            while ($line = fgets($socket, 512)) {
                $response .= $line;
                if (isset($line[3]) && $line[3] === ' ') {
                    break;
                }
            }
            return $response;
        };

        $sendCommand = function (string $cmd) use ($socket, $readResponse): string {
            fputs($socket, $cmd . "\r\n");
            return $readResponse();
        };

        $greeting = $readResponse();
        if (substr($greeting, 0, 3) !== '220') {
            log_to_outbox($to, $subject, $body, $headers, false, "SMTP Greeting error: {$greeting}");
            fclose($socket);
            return false;
        }

        $ehlo = $sendCommand("EHLO dentisys.local");

        // Upgrade to STARTTLS if port 587 or TLS supported
        if ($port === 587 && str_contains($ehlo, 'STARTTLS')) {
            $starttls = $sendCommand("STARTTLS");
            if (substr($starttls, 0, 3) === '220') {
                if (!stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                    log_to_outbox($to, $subject, $body, $headers, false, "TLS encryption handshake failed.");
                    fclose($socket);
                    return false;
                }
                // Re-send EHLO after TLS handshake
                $ehlo = $sendCommand("EHLO dentisys.local");
            }
        }

        // Authenticate if credentials provided
        if ($user !== '' && $pass !== '') {
            $authRes = $sendCommand("AUTH LOGIN");
            if (substr($authRes, 0, 3) === '334') {
                $userRes = $sendCommand(base64_encode($user));
                if (substr($userRes, 0, 3) === '334') {
                    $passRes = $sendCommand(base64_encode($pass));
                    if (substr($passRes, 0, 3) !== '235') {
                        log_to_outbox($to, $subject, $body, $headers, false, "SMTP Auth failed: {$passRes}");
                        fclose($socket);
                        return false;
                    }
                }
            }
        }

        $mailFromRes = $sendCommand("MAIL FROM: <{$from}>");
        if (substr($mailFromRes, 0, 3) !== '250') {
            log_to_outbox($to, $subject, $body, $headers, false, "MAIL FROM failed: {$mailFromRes}");
            fclose($socket);
            return false;
        }

        $rcptToRes = $sendCommand("RCPT TO: <{$to}>");
        if (substr($rcptToRes, 0, 3) !== '250') {
            log_to_outbox($to, $subject, $body, $headers, false, "RCPT TO failed: {$rcptToRes}");
            fclose($socket);
            return false;
        }

        $dataRes = $sendCommand("DATA");
        if (substr($dataRes, 0, 3) !== '354') {
            log_to_outbox($to, $subject, $body, $headers, false, "DATA command failed: {$dataRes}");
            fclose($socket);
            return false;
        }

        $emailData = '';
        foreach ($headers as $k => $v) {
            $emailData .= "{$k}: {$v}\r\n";
        }
        $emailData .= "\r\n" . $body . "\r\n.";

        $sendDataRes = $sendCommand($emailData);
        $sendCommand("QUIT");
        fclose($socket);

        if (substr($sendDataRes, 0, 3) === '250') {
            log_to_outbox($to, $subject, $body, $headers, true, null);
            return true;
        } else {
            log_to_outbox($to, $subject, $body, $headers, false, "Send payload failed: {$sendDataRes}");
            return false;
        }
    } catch (\Throwable $e) {
        if (is_resource($socket)) {
            @fclose($socket);
        }
        log_to_outbox($to, $subject, $body, $headers, false, "SMTP Exception: " . $e->getMessage());
        return false;
    }
}

function send_email(string $to, string $subject, string $body, array $config): bool
{
    $headers = [
        'From' => $config['smtp']['from'] ?? 'noreply@dentisys.local',
        'To' => $to,
        'Subject' => $subject,
        'Content-Type' => 'text/html; charset=UTF-8',
        'Date' => date('r'),
    ];

    $sent = send_smtp_email($to, $subject, $body, $config);

    // If send_smtp_email returned false without error (e.g. unconfigured/dev mode), ensure it is logged
    if (!$sent && !file_exists(email_outbox_log_path())) {
        log_to_outbox($to, $subject, $body, $headers, false, null);
    }

    return $sent;
}
