<?php

declare(strict_types=1);

class RateLimitException extends \RuntimeException
{
    public function __construct(string $message = 'Too many requests.', int $code = 429, ?\Throwable $previous = null)
    {
        parent::__construct($message, $code, $previous);
    }
}

function rate_limit_storage_path(array $storage, string $scopeHex, string $endpointCode): string
{
    if (!preg_match('/^[a-f0-9]{64}$/', $scopeHex)) {
        throw new \InvalidArgumentException('Scope key must be exactly 64 lowercase hex characters.');
    }

    if (!preg_match('/^[a-z][a-z0-9_]*$/', $endpointCode)) {
        throw new \InvalidArgumentException('Endpoint code must match [a-z][a-z0-9_]*.');
    }

    $baseDir = realpath($storage['dir']);

    if ($baseDir === false) {
        $baseDir = $storage['dir'];
    }

    $filename = $scopeHex . '_' . $endpointCode . '.json';
    $path = $baseDir . DIRECTORY_SEPARATOR . $filename;

    $resolved = realpath(dirname($path));

    if ($resolved === false || $resolved !== $baseDir) {
        throw new \RuntimeException('Rate-limit storage path escaped the configured directory.');
    }

    return $path;
}

function rate_limit_ensure_dir(string $dir): void
{
    if (!is_dir($dir)) {
        $created = @mkdir($dir, 0700, true);

        if (!$created && !is_dir($dir)) {
            throw new \RuntimeException('Cannot create rate-limit storage directory.');
        }
    }
}

function rate_limit_read_state(string $path): array
{
    $fp = @fopen($path, 'c+');

    if ($fp === false) {
        throw new \RuntimeException('Cannot open rate-limit state file.');
    }

    if (!flock($fp, LOCK_EX)) {
        fclose($fp);
        throw new \RuntimeException('Cannot lock rate-limit state file.');
    }

    return ['fp' => $fp, 'path' => $path];
}

function rate_limit_close_state($fp): void
{
    if ($fp !== false) {
        flock($fp, LOCK_UN);
        fclose($fp);
    }
}

function rate_limit_parse_or_repair(string $raw, int $maxRequests, int $windowSeconds, int $now): array
{
    if ($raw === '') {
        return [
            'window_start' => $now,
            'count' => 0,
            'blocked_until' => null,
        ];
    }

    $data = json_decode($raw, true);

    if (!is_array($data) || !isset($data['window_start']) || !isset($data['count'])) {
        return [
            'window_start' => $now,
            'count' => $maxRequests,
            'blocked_until' => $now + $windowSeconds,
        ];
    }

    return $data;
}

function rate_limit_write_state($fp, array $data): void
{
    rewind($fp);

    if (!ftruncate($fp, 0)) {
        throw new \RuntimeException('Cannot truncate rate-limit state file.');
    }

    $json = json_encode($data, JSON_UNESCAPED_SLASHES);

    if (fwrite($fp, $json) === false) {
        throw new \RuntimeException('Cannot write rate-limit state file.');
    }

    if (!fflush($fp)) {
        throw new \RuntimeException('Cannot flush rate-limit state file.');
    }
}

function rate_limit_check(array $storage, string $scopeHex, string $endpointCode, int $windowSeconds, int $maxRequests): void
{
    $clock = isset($storage['clock']) ? $storage['clock'] : fn(): int => time();
    $now = $clock();

    rate_limit_ensure_dir($storage['dir']);
    $path = rate_limit_storage_path($storage, $scopeHex, $endpointCode);

    $fp = false;

    try {
        $handle = rate_limit_read_state($path);
        $fp = $handle['fp'];

        $raw = '';
        rewind($fp);
        $raw = stream_get_contents($fp);

        $data = rate_limit_parse_or_repair($raw !== false ? $raw : '', $maxRequests, $windowSeconds, $now);

        if ($now - ($data['window_start'] ?? 0) > $windowSeconds) {
            $data = [
                'window_start' => $now,
                'count' => 0,
                'blocked_until' => null,
            ];
        }

        if (isset($data['blocked_until']) && $data['blocked_until'] !== null && $now < $data['blocked_until']) {
            rate_limit_write_state($fp, $data);
            rate_limit_close_state($fp);
            $fp = false;
            throw new RateLimitException();
        }

        if ($data['count'] >= $maxRequests) {
            $data['blocked_until'] = $now + $windowSeconds;
            rate_limit_write_state($fp, $data);
            rate_limit_close_state($fp);
            $fp = false;
            throw new RateLimitException();
        }

        $data['count']++;
        rate_limit_write_state($fp, $data);
        rate_limit_close_state($fp);
        $fp = false;
    } finally {
        if ($fp !== false) {
            rate_limit_close_state($fp);
        }
    }
}

function challenge_state_key(string $challengeJti, string $tokenType, string $operation): string
{
    if (!preg_match('/^[a-f0-9]{32}$/', $challengeJti)) {
        throw new \InvalidArgumentException('Challenge JTI must be 32 lowercase hex characters.');
    }

    if (!in_array($tokenType, ['mfa_enrollment', 'mfa_challenge'], true)) {
        throw new \InvalidArgumentException('Invalid challenge token type.');
    }

    if (!preg_match('/^[a-z][a-z0-9_]*$/', $operation)) {
        throw new \InvalidArgumentException('Invalid challenge operation.');
    }

    return bin2hex(hash('sha256', "challenge:$challengeJti:$tokenType:$operation", true));
}

function challenge_state_path(array $storage, string $challengeJti, string $tokenType, string $operation): string
{
    $key = challenge_state_key($challengeJti, $tokenType, $operation);

    rate_limit_ensure_dir($storage['dir']);

    $baseDir = realpath($storage['dir']);

    if ($baseDir === false) {
        $baseDir = $storage['dir'];
    }

    $filename = $key . '_challenge.json';
    $path = $baseDir . DIRECTORY_SEPARATOR . $filename;

    $resolved = realpath(dirname($path));

    if ($resolved === false || $resolved !== $baseDir) {
        throw new \RuntimeException('Challenge state path escaped the configured directory.');
    }

    return $path;
}

function challenge_state_init(array $storage, string $challengeJti, string $tokenType, string $operation, int $maxAttempts, int $expirySeconds): void
{
    $clock = isset($storage['clock']) ? $storage['clock'] : fn(): int => time();
    $now = $clock();
    $path = challenge_state_path($storage, $challengeJti, $tokenType, $operation);
    $data = [
        'attempts' => 0,
        'max_attempts' => $maxAttempts,
        'consumed' => false,
        'created_at' => $now,
        'expires_at' => $now + $expirySeconds,
    ];

    $fp = @fopen($path, 'x');

    if ($fp === false) {
        throw new \RuntimeException('Challenge state already exists for this JTI.');
    }

    $json = json_encode($data, JSON_UNESCAPED_SLASHES);
    fwrite($fp, $json);
    fflush($fp);
    fclose($fp);
}

function challenge_state_attempt(array $storage, string $challengeJti, string $tokenType, string $operation): void
{
    $clock = isset($storage['clock']) ? $storage['clock'] : fn(): int => time();
    $now = $clock();
    $path = challenge_state_path($storage, $challengeJti, $tokenType, $operation);

    if (!is_file($path)) {
        throw new \RuntimeException('Challenge state not found.');
    }

    $fp = false;

    try {
        $fp = fopen($path, 'r+');
        if ($fp === false || !flock($fp, LOCK_EX)) {
            throw new \RuntimeException('Cannot lock challenge state.');
        }

        $raw = stream_get_contents($fp);
        $data = json_decode($raw, true);

        if (!is_array($data)) {
            throw new \RuntimeException('Corrupt challenge state.');
        }

        if ($data['expires_at'] <= $now) {
            throw new \RuntimeException('Challenge has expired.');
        }

        if ($data['consumed'] === true) {
            throw new \RuntimeException('Challenge has already been consumed.');
        }

        if ($data['attempts'] >= $data['max_attempts']) {
            throw new \RuntimeException('Challenge attempt limit exhausted.');
        }

        $data['attempts']++;
        rewind($fp);
        ftruncate($fp, 0);
        fwrite($fp, json_encode($data, JSON_UNESCAPED_SLASHES));
        fflush($fp);
    } finally {
        if ($fp !== false) {
            flock($fp, LOCK_UN);
            fclose($fp);
        }
    }
}

function challenge_state_consume(array $storage, string $challengeJti, string $tokenType, string $operation): void
{
    $clock = isset($storage['clock']) ? $storage['clock'] : fn(): int => time();
    $now = $clock();
    $path = challenge_state_path($storage, $challengeJti, $tokenType, $operation);

    if (!is_file($path)) {
        throw new \RuntimeException('Challenge state not found.');
    }

    $fp = false;

    try {
        $fp = fopen($path, 'r+');
        if ($fp === false || !flock($fp, LOCK_EX)) {
            throw new \RuntimeException('Cannot lock challenge state.');
        }

        $raw = stream_get_contents($fp);
        $data = json_decode($raw, true);

        if (!is_array($data)) {
            throw new \RuntimeException('Corrupt challenge state.');
        }

        if ($data['expires_at'] <= $now) {
            throw new \RuntimeException('Challenge has expired.');
        }

        if ($data['consumed'] === true) {
            throw new \RuntimeException('Challenge has already been consumed.');
        }

        $data['consumed'] = true;
        rewind($fp);
        ftruncate($fp, 0);
        fwrite($fp, json_encode($data, JSON_UNESCAPED_SLASHES));
        fflush($fp);
    } finally {
        if ($fp !== false) {
            flock($fp, LOCK_UN);
            fclose($fp);
        }
    }
}
