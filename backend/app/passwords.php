<?php

declare(strict_types=1);

/** Normalize passwords before measuring or hashing them. */
function password_normalize_nfc(string $password): string
{
    if (!class_exists(Normalizer::class)) {
        throw new RuntimeException('Password normalization support is unavailable.');
    }
    $normalized = Normalizer::normalize($password, Normalizer::FORM_C);
    if (!is_string($normalized)) {
        throw new InvalidArgumentException('Password could not be normalized.');
    }
    return $normalized;
}

/** Hash user-set passwords with the approved Argon2id policy. */
function password_hash_user_password(string $password): string
{
    if (!defined('PASSWORD_ARGON2ID')) {
        throw new RuntimeException('Argon2id password hashing is unavailable.');
    }
    $hash = password_hash(password_normalize_nfc($password), PASSWORD_ARGON2ID, [
        'memory_cost' => 19456,
        'time_cost' => 2,
        'threads' => 1,
    ]);
    if (!is_string($hash) || $hash === '') {
        throw new RuntimeException('Password hashing failed.');
    }
    return $hash;
}

/** Verify Argon2id with NFC input; retain raw verification for legacy bcrypt. */
function password_verify_user_password(string $password, string $hash): bool
{
    $info = password_get_info($hash);
    if (($info['algoName'] ?? '') === 'argon2id') {
        try {
            return password_verify(password_normalize_nfc($password), $hash);
        } catch (Throwable) {
            return false;
        }
    }
    return password_verify($password, $hash);
}
