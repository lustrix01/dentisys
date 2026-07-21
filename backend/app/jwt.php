<?php

declare(strict_types=1);

function base64url_encode(string $data): string
{
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function base64url_decode(string $data): string
{
    if (!preg_match('/^[A-Za-z0-9_-]+$/', $data)) {
        throw new \InvalidArgumentException('Base64URL string contains invalid characters.');
    }

    $len = strlen($data);

    if ($len % 4 === 1) {
        throw new \InvalidArgumentException('Base64URL length modulo 4 must not be 1.');
    }

    $padded = str_pad($data, (int)ceil($len / 4) * 4, '=');
    $decoded = base64_decode(strtr($padded, '-_', '+/'), true);

    if ($decoded === false) {
        throw new \InvalidArgumentException('Base64URL decode failed.');
    }

    $reEncoded = base64url_encode($decoded);

    if ($reEncoded !== $data) {
        throw new \InvalidArgumentException('Base64URL has non-canonical encoding.');
    }

    return $decoded;
}

function jwt_generate_jti(): string
{
    return bin2hex(random_bytes(16));
}

function jwt_validate_type_claims(array $payload, string $expectedType): void
{
    $required = ['iat', 'exp', 'sub', 'jti'];

    foreach ($required as $key) {
        if (!array_key_exists($key, $payload)) {
            throw new \RuntimeException("Missing required claim: $key");
        }
    }

    if (!isset($payload['token_type']) || $payload['token_type'] !== $expectedType) {
        throw new \RuntimeException(sprintf('Expected token_type "%s".', $expectedType));
    }

    if (!is_int($payload['sub']) || $payload['sub'] < 1) {
        throw new \RuntimeException('sub must be a positive integer.');
    }

    if (!is_string($payload['jti']) || strlen($payload['jti']) !== 32 || !ctype_xdigit($payload['jti'])) {
        throw new \RuntimeException('jti must be exactly 32 lowercase hex characters.');
    }

    if (!is_int($payload['iat'])) {
        throw new \RuntimeException('iat must be an integer.');
    }

    if (!is_int($payload['exp'])) {
        throw new \RuntimeException('exp must be an integer.');
    }

    if ($expectedType === 'access') {
        if (!isset($payload['role']) || !is_string($payload['role']) || !in_array($payload['role'], ['admin', 'faculty', 'secretary'], true)) {
            throw new \RuntimeException('role must be one of admin, faculty, secretary.');
        }

        if (!isset($payload['sid']) || !is_string($payload['sid']) || !preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $payload['sid'])) {
            throw new \RuntimeException('sid must be a valid UUID.');
        }

        if (!isset($payload['token_version']) || !is_int($payload['token_version']) || $payload['token_version'] < 0) {
            throw new \RuntimeException('token_version must be a nonnegative integer.');
        }
    }
}

function jwt_encode(array $claims, string $keyBytes): string
{
    if (strlen($keyBytes) < 32) {
        throw new \RuntimeException('JWT signing key must be at least 32 bytes.');
    }

    $header = ['alg' => 'HS256', 'typ' => 'JWT'];
    $headerEncoded = base64url_encode(json_encode($header, JSON_UNESCAPED_SLASHES));
    $claimsEncoded = base64url_encode(json_encode($claims, JSON_UNESCAPED_SLASHES));

    $signature = hash_hmac('sha256', "$headerEncoded.$claimsEncoded", $keyBytes, true);
    $sigEncoded = base64url_encode($signature);

    return "$headerEncoded.$claimsEncoded.$sigEncoded";
}

function jwt_decode(string $token, string $keyBytes, string $expectedType, ?callable $clock = null): array
{
    if (strlen($keyBytes) < 32) {
        throw new \RuntimeException('JWT signing key must be at least 32 bytes.');
    }

    $clock = $clock ?? fn(): int => time();

    $segments = explode('.', $token);

    if (count($segments) !== 3) {
        throw new \RuntimeException('JWT must have exactly 3 segments.');
    }

    list($headerEncoded, $claimsEncoded, $sigEncoded) = $segments;

    if ($headerEncoded === '' || $claimsEncoded === '' || $sigEncoded === '') {
        throw new \RuntimeException('JWT segments must not be empty.');
    }

    $headerRaw = base64url_decode($headerEncoded);
    $header = json_decode($headerRaw, true);

    if (!is_array($header)) {
        throw new \RuntimeException('JWT header is not a JSON object.');
    }

    if (!isset($header['alg']) || $header['alg'] !== 'HS256') {
        throw new \RuntimeException('JWT algorithm must be HS256.');
    }

    if (!isset($header['typ']) || $header['typ'] !== 'JWT') {
        throw new \RuntimeException('JWT type must be JWT.');
    }

    $sigRaw = base64url_decode($sigEncoded);
    $expectedSig = hash_hmac('sha256', "$headerEncoded.$claimsEncoded", $keyBytes, true);

    if (!hash_equals($expectedSig, $sigRaw)) {
        throw new \RuntimeException('JWT signature verification failed.');
    }

    $payloadRaw = base64url_decode($claimsEncoded);
    $payload = json_decode($payloadRaw, true);

    if (!is_array($payload)) {
        throw new \RuntimeException('JWT payload is not a JSON object.');
    }

    jwt_validate_type_claims($payload, $expectedType);

    $now = $clock();

    if ($payload['exp'] <= $now) {
        throw new \RuntimeException('JWT has expired.');
    }

    if ($payload['iat'] > $now + 60) {
        throw new \RuntimeException('JWT iat is too far in the future.');
    }

    return $payload;
}
