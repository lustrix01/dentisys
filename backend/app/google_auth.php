<?php

declare(strict_types=1);

use Google\Auth\AccessToken;
use Google\Auth\Cache\FileSystemCacheItemPool;

class GoogleIdentityException extends RuntimeException
{
    public function __construct(string $message = 'Invalid Google identity.', private readonly string $reason = 'invalid_google_identity')
    {
        parent::__construct($message);
    }

    public function reason(): string
    {
        return $this->reason;
    }
}

function google_auth_cache_pool(): FileSystemCacheItemPool
{
    $path = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'dentisys-google-auth-cache';
    if (!is_dir($path) && !@mkdir($path, 0700, true) && !is_dir($path)) {
        throw new RuntimeException('Google certificate cache is unavailable.');
    }
    @chmod($path, 0700);
    return new FileSystemCacheItemPool($path);
}

/**
 * Verify a Google ID token and apply DentiSys identity policy.
 * The callable seam is used by deterministic tests and must return claims.
 */
function google_verify_id_token(array $config, string $credential, ?callable $verifier = null): array
{
    $clientId = trim((string) ($config['providers']['identity']['google']['client_id'] ?? ''));
    if ($clientId === '') {
        throw new GoogleIdentityException('Google Sign-In is not configured.', 'not_configured');
    }
    if ($credential === '' || strlen($credential) > 8192) {
        throw new GoogleIdentityException();
    }

    try {
        $claims = $verifier !== null
            ? $verifier($credential, $clientId)
            : (new AccessToken(null, google_auth_cache_pool()))->verify($credential, [
                'audience' => $clientId,
                'throwException' => true,
            ]);
    } catch (GoogleIdentityException $e) {
        throw $e;
    } catch (Throwable $e) {
        throw new GoogleIdentityException('Invalid Google identity.', 'invalid_google_identity');
    }

    if (!is_array($claims)) {
        throw new GoogleIdentityException();
    }

    $issuer = $claims['iss'] ?? null;
    if (!is_string($issuer) || !in_array($issuer, ['accounts.google.com', 'https://accounts.google.com'], true)) {
        throw new GoogleIdentityException();
    }

    $audience = $claims['aud'] ?? null;
    if (!is_string($audience) || !hash_equals($clientId, $audience)) {
        throw new GoogleIdentityException();
    }

    $expiresAt = $claims['exp'] ?? null;
    if ((!is_int($expiresAt) && !is_float($expiresAt) && !(is_string($expiresAt) && ctype_digit($expiresAt)))
        || (int) $expiresAt <= time()) {
        throw new GoogleIdentityException();
    }

    $subject = $claims['sub'] ?? null;
    if (!is_string($subject) || trim($subject) === '' || strlen($subject) > 255) {
        throw new GoogleIdentityException();
    }

    if (($claims['email_verified'] ?? null) !== true) {
        throw new GoogleIdentityException();
    }

    try {
        $email = validate_email((string) ($claims['email'] ?? ''));
    } catch (ValidationException $e) {
        throw new GoogleIdentityException();
    }
    $domain = substr(strrchr($email, '@'), 1);
    $allowedDomains = $config['app']['allowed_email_domains'] ?? [];
    if (!is_array($allowedDomains) || !in_array($domain, $allowedDomains, true)) {
        throw new GoogleIdentityException('Google account domain is not allowed.', 'domain_not_allowed');
    }

    $hostedDomain = $claims['hd'] ?? null;
    if (!is_string($hostedDomain) || trim($hostedDomain) === '' || !in_array(strtolower($hostedDomain), $allowedDomains, true)) {
        throw new GoogleIdentityException('Google Workspace domain is not allowed.', 'domain_not_allowed');
    }

    return [
        'sub' => $subject,
        'email' => $email,
        'email_domain' => $domain,
        'hd' => strtolower($hostedDomain),
        'iss' => $issuer,
        'aud' => $audience,
        'exp' => (int) $expiresAt,
    ];
}

function google_issue_link_challenge(array $config, array $user, string $googleSubject): array
{
    $jti = jwt_generate_jti();
    $now = time();
    $jwtKey = config_key_bytes_at_least($config['jwt']['signing_key_b64'], 32, 'JWT_SIGNING_KEY');
    $token = jwt_encode([
        'sub' => (int) $user['user_id'],
        'jti' => $jti,
        'token_type' => 'google_link_challenge',
        'token_version' => (int) $user['token_version'],
        'authentication_source' => 'google',
        'pending_google_subject' => $googleSubject,
        'iat' => $now,
        'exp' => $now + 300,
    ], $jwtKey);

    challenge_state_init(
        ['dir' => $config['rate_limit']['storage_dir']],
        $jti,
        'google_link_challenge',
        'complete_link',
        5,
        300
    );

    return ['token' => $token, 'expires_in' => 300];
}

function google_auth_audit(PDO $pdo, array $config, array $context, string $action, string $status, ?int $userId = null, ?string $description = null): void
{
    $startedTransaction = false;
    try {
        $macKey = config_key_bytes_at_least($config['audit']['mac_key_b64'], 32, 'AUDIT_MAC_KEY');
        if (!$pdo->inTransaction()) {
            $pdo->beginTransaction();
            $startedTransaction = true;
        }
        $auditCtx = audit_begin_operation($pdo);
        audit_finish_operation($pdo, $auditCtx, [
            'module_code' => 'auth',
            'action_code' => $action,
            'event_status' => $status,
            'actor_user_id' => $userId,
            'actor_username' => null,
            'actor_role' => null,
            'actor_display_name' => null,
            'session_id' => null,
            'target_type' => 'google_identity',
            'target_id' => null,
            'description' => $description,
            'reason' => null,
            'http_method' => $context['http_method'] ?? null,
            'endpoint' => $context['endpoint'] ?? null,
            'request_id' => $context['request_id'] ?? null,
            'ip_address' => $context['ip_address'] ?? null,
            'user_agent' => $context['user_agent'] ?? null,
        ], $macKey);
        if ($startedTransaction) { $pdo->commit(); }
    } catch (Throwable $e) {
        if ($startedTransaction && $pdo->inTransaction()) { $pdo->rollBack(); }
        error_log('Google auth audit skipped: ' . sanitize_for_log($e));
    }
}
