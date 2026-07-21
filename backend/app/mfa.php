<?php

declare(strict_types=1);

function base32_encode(string $data): string
{
    $alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    $result = '';
    $bits = 0;
    $buffer = 0;
    $len = strlen($data);

    for ($i = 0; $i < $len; $i++) {
        $buffer = ($buffer << 8) | ord($data[$i]);
        $bits += 8;

        while ($bits >= 5) {
            $bits -= 5;
            $result .= $alphabet[($buffer >> $bits) & 0x1F];
        }
    }

    if ($bits > 0) {
        $result .= $alphabet[($buffer << (5 - $bits)) & 0x1F];
    }

    return $result;
}

function base32_decode(string $data): string
{
    $data = strtoupper($data);
    $alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    $result = '';
    $bits = 0;
    $buffer = 0;
    $len = strlen($data);

    for ($i = 0; $i < $len; $i++) {
        $ch = $data[$i];
        $val = strpos($alphabet, $ch);

        if ($val === false) {
            throw new \InvalidArgumentException(sprintf('Invalid Base32 character: %s', $ch));
        }

        $buffer = ($buffer << 5) | $val;
        $bits += 5;

        if ($bits >= 8) {
            $bits -= 8;
            $result .= chr(($buffer >> $bits) & 0xFF);
        }
    }

    if ($bits >= 5 || ($bits > 0 && ($buffer & ((1 << $bits) - 1)) !== 0)) {
        throw new \InvalidArgumentException('Invalid Base32 length: dangling bits detected.');
    }

    return $result;
}

function mfa_compute_totp(string $base32Secret, int $step, string $algorithm = 'sha1', int $digits = 6, int $period = 30): array
{
    $allowedAlgos = ['sha1', 'sha256', 'sha512'];

    if (!in_array($algorithm, $allowedAlgos, true)) {
        throw new \InvalidArgumentException("Unsupported TOTP algorithm: $algorithm");
    }

    if ($digits < 6 || $digits > 8) {
        throw new \InvalidArgumentException("Digit count must be 6-8, got $digits");
    }

    if ($period < 1) {
        throw new \InvalidArgumentException("Period must be positive, got $period");
    }

    $secret = base32_decode($base32Secret);

    $counterBE = pack('N', 0) . pack('N', $step);

    $hmac = hash_hmac($algorithm, $counterBE, $secret, true);

    $offset = ord($hmac[strlen($hmac) - 1]) & 0x0F;

    $binary = ((ord($hmac[$offset]) & 0x7F) << 24)
        | ((ord($hmac[$offset + 1]) & 0xFF) << 16)
        | ((ord($hmac[$offset + 2]) & 0xFF) << 8)
        | (ord($hmac[$offset + 3]) & 0xFF);

    $code = str_pad((string)($binary % (10 ** $digits)), $digits, '0', STR_PAD_LEFT);

    return ['step' => $step, 'code' => $code];
}

function mfa_verify_window(string $base32Secret, string $userCode, string $algorithm = 'sha1', int $digits = 6, int $period = 30, int $windowWidth = 1, ?callable $clock = null): array
{
    $clock = $clock ?? fn(): int => time();
    $currentStep = intdiv($clock(), $period);

    for ($offset = -$windowWidth; $offset <= $windowWidth; $offset++) {
        $candidate = mfa_compute_totp($base32Secret, $currentStep + $offset, $algorithm, $digits, $period);

        if (hash_equals($candidate['code'], $userCode)) {
            return ['valid' => true, 'matched_step' => $currentStep + $offset];
        }
    }

    return ['valid' => false, 'matched_step' => null];
}

function mfa_encrypt_secret(string $plaintext, string $keyBytes): array
{
    if (strlen($keyBytes) !== 32) {
        throw new \RuntimeException('MFA encryption key must be exactly 32 bytes.');
    }

    $ivLen = openssl_cipher_iv_length('aes-256-gcm');

    if ($ivLen === false) {
        throw new \RuntimeException('Cannot determine AES-256-GCM IV length.');
    }

    $iv = random_bytes($ivLen);

    $ciphertext = openssl_encrypt($plaintext, 'aes-256-gcm', $keyBytes, OPENSSL_RAW_DATA, $iv, $tag);

    if ($ciphertext === false) {
        throw new \RuntimeException('AES-256-GCM encryption failed.');
    }

    if (!is_string($tag) || strlen($tag) !== 16) {
        throw new \RuntimeException('AES-256-GCM did not produce a 16-byte authentication tag.');
    }

    return [
        'ciphertext' => $ciphertext,
        'nonce' => $iv,
        'auth_tag' => $tag,
    ];
}

function mfa_decrypt_secret(string $ciphertext, string $nonce, string $authTag, string $keyBytes): ?string
{
    if (strlen($keyBytes) !== 32) {
        throw new \RuntimeException('MFA encryption key must be exactly 32 bytes.');
    }

    $ivLen = openssl_cipher_iv_length('aes-256-gcm');

    if (strlen($nonce) !== $ivLen) {
        throw new \RuntimeException(sprintf('Nonce must be %d bytes.', $ivLen));
    }

    if (strlen($authTag) !== 16) {
        throw new \RuntimeException('Authentication tag must be exactly 16 bytes.');
    }

    $plaintext = openssl_decrypt($ciphertext, 'aes-256-gcm', $keyBytes, OPENSSL_RAW_DATA, $nonce, $authTag);

    if ($plaintext === false) {
        return null;
    }

    return $plaintext;
}

function mfa_generate_secret(): string
{
    return base32_encode(random_bytes(20));
}

function mfa_generate_recovery_codes(int $count = 8): array
{
    $codes = [];
    $hashes = [];

    for ($i = 0; $i < $count; $i++) {
        $raw = random_bytes(16);
        $canonical = bin2hex($raw);
        $display = implode('-', str_split($canonical, 4));

        $hash = password_hash($canonical, PASSWORD_DEFAULT);

        if ($hash === false) {
            throw new \RuntimeException('password_hash() returned false for recovery code.');
        }

        $codes[] = $display;
        $hashes[] = $hash;
    }

    return ['codes' => $codes, 'hashes' => $hashes];
}

function mfa_normalize_recovery_code(string $displayOrInput): string
{
    $cleaned = str_replace(['-', ' ', "\t", "\n", "\r"], '', trim($displayOrInput));
    $cleaned = strtolower($cleaned);

    if (strlen($cleaned) !== 32) {
        throw new \InvalidArgumentException('Recovery code must be exactly 32 hex characters after normalization.');
    }

    if (!ctype_xdigit($cleaned)) {
        throw new \InvalidArgumentException('Recovery code contains non-hexadecimal characters.');
    }

    return $cleaned;
}
