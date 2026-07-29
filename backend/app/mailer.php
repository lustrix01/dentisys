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

function log_to_outbox(
    string $to,
    string $subject,
    string $body,
    array $headers = [],
    bool $smtpSent = false,
    ?string $smtpError = null
): void {
    $entry = [
        'timestamp' => (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format(DATE_ATOM),
        'to' => $to,
        'subject' => $subject,
        'smtp_status' => $smtpSent ? 'SENT' : 'FAILED',
        'smtp_error' => $smtpError,
        'headers' => $headers,
        'body' => $body,
    ];
    @file_put_contents(
        email_outbox_log_path(),
        json_encode($entry, JSON_UNESCAPED_SLASHES) . PHP_EOL,
        FILE_APPEND | LOCK_EX
    );
}

/**
 * @return array{sent: bool, error: ?string, headers: array<string,string>}
 */
function smtp_transport(string $to, string $subject, string $body, array $config): array
{
    $smtp = $config['smtp'] ?? [];
    $host = (string) ($smtp['host'] ?? '');
    $port = (int) ($smtp['port'] ?? 25);
    $user = (string) ($smtp['user'] ?? '');
    $pass = (string) ($smtp['pass'] ?? '');
    $from = (string) ($smtp['from'] ?? 'noreply@dentisys.local');
    $encryption = strtolower((string) ($smtp['encryption'] ?? 'none'));
    $verifyPeer = (bool) ($smtp['verify_peer'] ?? true);
    $caFile = (string) ($smtp['ca_file'] ?? '');
    $isDevelopment = strtolower((string) ($config['app']['env'] ?? 'production')) === 'development';

    $headers = [
        'From' => $from,
        'To' => $to,
        'Subject' => $subject,
        'MIME-Version' => '1.0',
        'Content-Type' => 'text/html; charset=UTF-8',
        'Date' => date('r'),
    ];

    if ($host === '') {
        return ['sent' => false, 'error' => 'SMTP host is not configured.', 'headers' => $headers];
    }
    if (!$isDevelopment && !in_array($encryption, ['tls', 'starttls'], true)) {
        return ['sent' => false, 'error' => 'Encrypted SMTP is required outside development.', 'headers' => $headers];
    }
    if (!$isDevelopment && !$verifyPeer) {
        return ['sent' => false, 'error' => 'SMTP certificate verification is required outside development.', 'headers' => $headers];
    }

    $ssl = [
        'verify_peer' => $verifyPeer,
        'verify_peer_name' => $verifyPeer,
        'allow_self_signed' => !$verifyPeer,
        'peer_name' => $host,
    ];
    if ($caFile !== '') {
        $ssl['cafile'] = $caFile;
    }
    $context = stream_context_create(['ssl' => $ssl]);
    $remote = $encryption === 'tls' ? "tls://{$host}:{$port}" : "{$host}:{$port}";
    $errno = 0;
    $errstr = '';
    $socket = @stream_socket_client($remote, $errno, $errstr, 5, STREAM_CLIENT_CONNECT, $context);
    if (!is_resource($socket)) {
        return ['sent' => false, 'error' => "SMTP connection failed ({$errno}).", 'headers' => $headers];
    }

    try {
        stream_set_timeout($socket, 5);
        $read = static function () use ($socket): string {
            $response = '';
            while (($line = fgets($socket, 1024)) !== false) {
                $response .= $line;
                if (isset($line[3]) && $line[3] === ' ') {
                    break;
                }
            }
            return $response;
        };
        $send = static function (string $command) use ($socket, $read): string {
            fwrite($socket, $command . "\r\n");
            return $read();
        };
        $expect = static function (string $response, array $codes, string $stage): void {
            if (!in_array(substr($response, 0, 3), $codes, true)) {
                throw new RuntimeException("SMTP {$stage} failed.");
            }
        };

        $expect($read(), ['220'], 'greeting');
        $ehlo = $send('EHLO dentisys.local');
        $expect($ehlo, ['250'], 'EHLO');

        if ($encryption === 'starttls') {
            if (!str_contains(strtoupper($ehlo), 'STARTTLS')) {
                throw new RuntimeException('SMTP server does not advertise STARTTLS.');
            }
            $expect($send('STARTTLS'), ['220'], 'STARTTLS');
            if (!stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                throw new RuntimeException('SMTP TLS handshake failed.');
            }
            $expect($send('EHLO dentisys.local'), ['250'], 'EHLO after STARTTLS');
        }

        if ($user !== '' || $pass !== '') {
            if ($user === '' || $pass === '') {
                throw new RuntimeException('Both SMTP username and password are required.');
            }
            $expect($send('AUTH LOGIN'), ['334'], 'authentication');
            $expect($send(base64_encode($user)), ['334'], 'username');
            $expect($send(base64_encode($pass)), ['235'], 'password');
        }

        $expect($send("MAIL FROM:<{$from}>"), ['250'], 'MAIL FROM');
        $expect($send("RCPT TO:<{$to}>"), ['250', '251'], 'RCPT TO');
        $expect($send('DATA'), ['354'], 'DATA');

        $payload = '';
        foreach ($headers as $name => $value) {
            $payload .= "{$name}: {$value}\r\n";
        }
        $safeBody = preg_replace('/(?m)^\./', '..', $body) ?? $body;
        $expect($send($payload . "\r\n" . $safeBody . "\r\n."), ['250'], 'message delivery');
        $send('QUIT');
        fclose($socket);
        return ['sent' => true, 'error' => null, 'headers' => $headers];
    } catch (Throwable $e) {
        if (is_resource($socket)) {
            fclose($socket);
        }
        return ['sent' => false, 'error' => $e->getMessage(), 'headers' => $headers];
    }
}

function send_smtp_email(string $to, string $subject, string $body, array $config): bool
{
    return smtp_transport($to, $subject, $body, $config)['sent'];
}

function send_email(
    string $to,
    string $subject,
    string $body,
    array $config,
    bool $redactBody = false
): bool {
    $result = smtp_transport($to, $subject, $body, $config);
    log_to_outbox(
        $to,
        $subject,
        $redactBody ? '[REDACTED AUTHENTICATION MESSAGE]' : $body,
        $result['headers'],
        $result['sent'],
        $result['error']
    );
    return $result['sent'];
}
