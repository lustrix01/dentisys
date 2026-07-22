<?php
require_once __DIR__ . '/../app/bootstrap.php';

try {
    $config = app_config();
    $pdo = create_pdo($config);

    echo "1. Requesting password reset...\n";
    $email = 'osl2023-5510-65059@bicol-u.edu.ph';
    $email = validate_email($email);

    $resetToken = bin2hex(random_bytes(16));
    $tokenHash = hash('sha256', $resetToken);
    $now = new DateTimeImmutable('now', new DateTimeZone('UTC'));
    $nowSql = $now->format('Y-m-d H:i:s.u');
    $expiresSql = $now->add(new DateInterval('PT15M'))->format('Y-m-d H:i:s.u');
    $metaJson = json_encode(['email' => $email, 'display_name' => 'Faculty Test User']);

    $pdo->beginTransaction();
    $macKey = config_key_bytes_at_least($config['audit']['mac_key_b64'], 32, 'AUDIT_MAC_KEY');
    $auditCtx = audit_begin_operation($pdo);

    $ins = $pdo->prepare(
        "INSERT INTO security_tokens (purpose, secret_hash, issued_at, expires_at, metadata_json)
         VALUES ('password_reset', ?, ?, ?, ?)"
    );
    $ins->execute([$tokenHash, $nowSql, $expiresSql, $metaJson]);
    $stId = (int) $pdo->lastInsertId();

    audit_finish_operation($pdo, $auditCtx, [
        'module_code' => 'auth',
        'action_code' => 'password_reset_requested',
        'event_status' => 'Success',
        'actor_user_id' => null,
        'actor_username' => $email,
        'actor_role' => 'faculty',
        'actor_display_name' => 'Faculty Test User',
        'session_id' => null,
        'target_type' => 'security_token',
        'target_id' => (string) $stId,
        'description' => 'Test password reset token created.',
        'reason' => null,
        'http_method' => 'POST',
        'endpoint' => '/api/auth/password/reset-request',
        'request_id' => 'test-req',
        'ip_address' => '127.0.0.1',
        'user_agent' => 'PHP CLI',
    ], $macKey);
    $pdo->commit();

    echo "Reset token issued: {$resetToken}\n";

    echo "2. Confirming password reset with token...\n";
    $tokenHash2 = hash('sha256', $resetToken);
    $stmt = $pdo->prepare("SELECT token_id, user_id, expires_at, used_at, revoked_at, metadata_json FROM security_tokens WHERE purpose = 'password_reset' AND secret_hash = ?");
    $stmt->execute([$tokenHash2]);
    $tokenRow = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($tokenRow === false) {
        throw new Exception("Token row not found!");
    }

    $meta = json_decode($tokenRow['metadata_json'], true);
    $newPassHash = password_hash('NewPassword123!', PASSWORD_DEFAULT);

    $pdo->beginTransaction();
    $auditCtx2 = audit_begin_operation($pdo);

    $chkUser = $pdo->prepare("SELECT user_id FROM user_accounts WHERE login_email = ?");
    $chkUser->execute([$meta['email']]);
    $existingUser = $chkUser->fetch(PDO::FETCH_ASSOC);

    if ($existingUser !== false) {
        $uId = (int) $existingUser['user_id'];
        $upd = $pdo->prepare("UPDATE user_accounts SET password_hash = ?, token_version = token_version + 1 WHERE user_id = ?");
        $upd->execute([$newPassHash, $uId]);
    } else {
        $insUser = $pdo->prepare("INSERT INTO user_accounts (login_email, password_hash, role, display_name, status, created_at, approved_at) VALUES (?, ?, 'faculty', ?, 'Active', NOW(6), NOW(6))");
        $insUser->execute([$meta['email'], $newPassHash, $meta['display_name']]);
        $uId = (int) $pdo->lastInsertId();
    }

    $markUsed = $pdo->prepare("UPDATE security_tokens SET used_at = ? WHERE token_id = ?");
    $markUsed->execute([$nowSql, $tokenRow['token_id']]);

    audit_finish_operation($pdo, $auditCtx2, [
        'module_code' => 'auth',
        'action_code' => 'password_reset_completed',
        'event_status' => 'Success',
        'actor_user_id' => $uId,
        'actor_username' => $meta['email'],
        'actor_role' => 'faculty',
        'actor_display_name' => $meta['display_name'],
        'session_id' => null,
        'target_type' => 'user_account',
        'target_id' => (string) $uId,
        'description' => 'Password reset completed.',
        'reason' => null,
        'http_method' => 'POST',
        'endpoint' => '/api/auth/password/reset-confirm',
        'request_id' => 'test-confirm',
        'ip_address' => '127.0.0.1',
        'user_agent' => 'PHP CLI',
    ], $macKey);

    $pdo->commit();

    echo "SUCCESS! Password reset confirmed and account updated for {$meta['email']}.\n";

} catch (\Throwable $e) {
    if (isset($pdo) && $pdo->inTransaction()) { $pdo->rollBack(); }
    echo "ERROR: " . $e->getMessage() . "\n" . $e->getTraceAsString() . "\n";
}
