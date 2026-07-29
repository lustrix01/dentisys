<?php

declare(strict_types=1);

use RobThree\Auth\Algorithm;
use RobThree\Auth\Providers\Qr\BaconQrCodeProvider;
use RobThree\Auth\TwoFactorAuth;

function mfa_totp_service(): TwoFactorAuth
{
    static $service = null;
    if (!$service instanceof TwoFactorAuth) {
        $service = new TwoFactorAuth(
            new BaconQrCodeProvider(4, '#ffffff', '#000000', 'svg'),
            'DentiSys',
            6,
            30,
            Algorithm::Sha1
        );
    }
    return $service;
}

function mfa_compute_totp(string $base32Secret, int $step, string $algorithm = 'sha1', int $digits = 6, int $period = 30): array
{
    if ($algorithm !== 'sha1' || $digits !== 6 || $period !== 30) {
        throw new \InvalidArgumentException('DentiSys authenticator credentials use SHA-1, six digits, and a 30-second period.');
    }
    return ['step' => $step, 'code' => mfa_totp_service()->getCode($base32Secret, $step * $period)];
}

function mfa_verify_window(string $base32Secret, string $userCode, string $algorithm = 'sha1', int $digits = 6, int $period = 30, int $windowWidth = 1, ?callable $clock = null): array
{
    if ($algorithm !== 'sha1' || $digits !== 6 || $period !== 30) {
        throw new \InvalidArgumentException('Unsupported authenticator credential parameters.');
    }
    $time = $clock ? $clock() : null;
    $matchedStep = 0;
    $valid = mfa_totp_service()->verifyCode($base32Secret, $userCode, $windowWidth, $time, $matchedStep);
    return ['valid' => $valid, 'matched_step' => $valid ? $matchedStep : null];
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
    return mfa_totp_service()->createSecret(160);
}

function mfa_provisioning_payload(string $accountEmail, string $secret): array
{
    $label = 'DentiSys:' . $accountEmail;
    $service = mfa_totp_service();
    return [
        'provisioning_uri' => $service->getQRText($label, $secret),
        'qr_code_data_uri' => $service->getQRCodeImageAsDataUri($label, $secret, 240),
    ];
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
