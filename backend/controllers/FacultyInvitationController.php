<?php

declare(strict_types=1);

if (!function_exists('sanitize_for_log')) {
    function sanitize_for_log(\Throwable $e): string
    {
        return get_class($e) . ' [' . ($e->getCode() > 0 ? $e->getCode() : 0) . ']';
    }
}

function faculty_invitation_token(): string
{
    return base64url_encode(random_bytes(32));
}

function faculty_invitation_token_row(PDO $pdo, string $token): ?array
{
    if (!preg_match('/^[A-Za-z0-9_-]{43}$/', $token)) {
        return null;
    }
    $digest = hash('sha256', $token, true);
    $stmt = $pdo->prepare(
        "SELECT t.token_id, t.user_id, t.expires_at, t.used_at, t.revoked_at,
                ua.login_email, ua.display_name, ua.name_prefix, ua.first_name, ua.middle_name,
                ua.last_name, ua.name_suffix, ua.role, ua.status
           FROM security_tokens t
           JOIN user_accounts ua ON ua.user_id = t.user_id
          WHERE t.purpose = 'faculty_invitation' AND t.token_digest = ?
          LIMIT 1"
    );
    pdo_bind_binary($stmt, 1, $digest);
    $stmt->execute();
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row === false ? null : $row;
}

function faculty_invitation_row_is_live(array $row): bool
{
    return $row['role'] === 'faculty'
        && $row['status'] === 'Pending Activation'
        && $row['used_at'] === null
        && $row['revoked_at'] === null
        && isset($row['expires_at'])
        && new DateTimeImmutable((string) $row['expires_at'], new DateTimeZone('UTC')) > new DateTimeImmutable('now', new DateTimeZone('UTC'));
}

function faculty_invitation_name_from_payload(array $data): string
{
    return faculty_invitation_name_parts_from_payload($data)['displayName'];
}

function faculty_invitation_name_parts_from_payload(array $data): array
{
    $structured = array_key_exists('firstName', $data)
        || array_key_exists('middleName', $data)
        || array_key_exists('lastName', $data)
        || array_key_exists('prefix', $data)
        || array_key_exists('suffix', $data);
    if (!$structured) {
        return [
            'displayName' => normalize_person_name(validate_person_name($data, 'name', 2, 255)),
            'structured' => false,
            'prefix' => null,
            'firstName' => null,
            'middleName' => null,
            'lastName' => null,
            'suffix' => null,
        ];
    }

    $first = validate_person_name($data, 'firstName', 2, 100);
    $last = validate_person_name($data, 'lastName', 2, 100);
    $middle = validate_optional_person_name($data, 'middleName', 2, 100);
    $prefix = validate_optional_string($data, 'prefix', 1, 50);
    $suffix = validate_optional_string($data, 'suffix', 1, 50);
    return [
        'displayName' => normalize_person_name(trim(implode(' ', array_filter(
            [$prefix, $first, $middle, $last, $suffix],
            static fn(mixed $part): bool => $part !== null && trim((string) $part) !== ''
        )))),
        'structured' => true,
        'prefix' => $prefix,
        'firstName' => $first,
        'middleName' => $middle,
        'lastName' => $last,
        'suffix' => $suffix,
    ];
}

function handle_admin_faculty_invitations_list(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        admin_verify_auth($pdo, $config);
        $stmt = $pdo->query(
            "SELECT ua.user_id, ua.login_email, ua.display_name, ua.name_prefix, ua.first_name, ua.middle_name,
                    ua.last_name, ua.name_suffix, ua.status, latest.issued_at, latest.expires_at,
                    latest.used_at, latest.revoked_at
               FROM user_accounts ua
               LEFT JOIN LATERAL (
                   SELECT issued_at, expires_at, used_at, revoked_at
                     FROM security_tokens
                    WHERE purpose = 'faculty_invitation' AND user_id = ua.user_id
                    ORDER BY issued_at DESC, token_id DESC
                    LIMIT 1
               ) latest ON TRUE
              WHERE ua.role = 'faculty'
              ORDER BY ua.created_at DESC, ua.user_id DESC"
        );
        $now = new DateTimeImmutable('now', new DateTimeZone('UTC'));
        $invitations = array_map(static function (array $row) use ($now): array {
            if ($row['used_at'] !== null && $row['status'] === 'Active') {
                $status = 'Accepted';
            } elseif ($row['revoked_at'] !== null) {
                $status = 'Revoked';
            } elseif ($row['expires_at'] !== null && new DateTimeImmutable((string) $row['expires_at'], new DateTimeZone('UTC')) <= $now) {
                $status = 'Expired';
            } elseif ($row['issued_at'] !== null) {
                $status = 'Pending';
            } else {
                $status = 'Not invited';
            }
            return [
                'id' => (string) $row['user_id'],
                'name' => (string) $row['display_name'],
                'prefix' => $row['name_prefix'],
                'firstName' => $row['first_name'],
                'middleName' => $row['middle_name'],
                'lastName' => $row['last_name'],
                'suffix' => $row['name_suffix'],
                'email' => (string) $row['login_email'],
                'invitedAt' => $row['issued_at'],
                'expiresAt' => $row['expires_at'],
                'status' => $status,
            ];
        }, $stmt->fetchAll(PDO::FETCH_ASSOC));
        json_response(['status' => 'ok', 'invitations' => $invitations], 200);
    } catch (AuthException | ChallengeException | \RuntimeException $e) {
        auth_error_response('Authentication required.', 401);
    } catch (Throwable $e) {
        error_log('Faculty invitation list error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

function handle_admin_faculty_invitation_create(): void
{
    $context = [
        'request_id' => request_id(),
        'ip_address' => request_ip(),
        'user_agent' => request_user_agent(),
        'http_method' => request_method(),
        'endpoint' => request_path(),
    ];
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $actor = admin_verify_auth($pdo, $config);
        $body = request_body();
        if (!$body['has_body']) {
            safe_error_response('Request body required.', 400);
            return;
        }
        if (array_diff(array_keys($body['data']), ['name', 'email', 'prefix', 'firstName', 'middleName', 'lastName', 'suffix']) !== []) {
            safe_error_response('Invalid request.', 400);
            return;
        }
        $nameParts = faculty_invitation_name_parts_from_payload($body['data']);
        $name = $nameParts['displayName'];
        $email = validate_institutional_email((string) ($body['data']['email'] ?? ''));
        $token = faculty_invitation_token();
        $digest = hash('sha256', $token, true);
        $passwordHash = password_hash(faculty_invitation_token(), PASSWORD_DEFAULT);
        $now = new DateTimeImmutable('now', new DateTimeZone('UTC'));
        $nowSql = $now->format('Y-m-d H:i:s.u');
        $expiresSql = $now->add(new DateInterval('P7D'))->format('Y-m-d H:i:s.u');

        $pdo->beginTransaction();
        try {
            $emailCheck = $pdo->prepare(
                'SELECT user_id, login_email, role, status FROM user_accounts WHERE lower(login_email) = lower(?) FOR UPDATE'
            );
            $emailCheck->execute([$email]);
            $existing = $emailCheck->fetch(PDO::FETCH_ASSOC);
            if ($existing !== false && ($existing['role'] !== 'faculty'
                || !in_array($existing['status'], ['Pending Activation', 'Pending', 'Rejected'], true))) {
                throw new DomainException('This email already belongs to an account that cannot be re-invited. Manual reconciliation is required.');
            }

            $auditContext = audit_begin_operation($pdo);
            if ($existing === false) {
                $insert = $pdo->prepare(
                    "INSERT INTO user_accounts
                        (login_email, password_hash, role, display_name, name_prefix, first_name, middle_name, last_name, name_suffix,
                         title, status, created_at, updated_at, approved_at, rejected_at, google_subject)
                     VALUES (?, ?, 'faculty', ?, ?, ?, ?, ?, ?, 'Dental Faculty Member', 'Pending Activation', ?, ?, ?, NULL, NULL)
                     RETURNING user_id"
                );
                $insert->execute([
                    $email, $passwordHash, $name,
                    $nameParts['prefix'], $nameParts['firstName'], $nameParts['middleName'],
                    $nameParts['lastName'], $nameParts['suffix'], $nowSql, $nowSql, $nowSql,
                ]);
                $userId = (int) $insert->fetchColumn();
            } else {
                $userId = (int) $existing['user_id'];
                $update = $pdo->prepare(
                    "UPDATE user_accounts
                        SET login_email = ?, password_hash = ?, display_name = ?, name_prefix = ?, first_name = ?,
                            middle_name = ?, last_name = ?, name_suffix = ?, status = 'Pending Activation',
                            updated_at = ?, approved_at = ?, rejected_at = NULL, google_subject = NULL
                      WHERE user_id = ?"
                );
                $update->execute([
                    $email, $passwordHash, $name,
                    $nameParts['prefix'], $nameParts['firstName'], $nameParts['middleName'],
                    $nameParts['lastName'], $nameParts['suffix'], $nowSql, $nowSql, $userId,
                ]);
            }

            $revoke = $pdo->prepare(
                "UPDATE security_tokens
                    SET revoked_at = ?, revocation_reason = 'Replaced by a new Admin-authorized Faculty invitation'
                  WHERE purpose = 'faculty_invitation' AND user_id = ?
                    AND used_at IS NULL AND revoked_at IS NULL"
            );
            $revoke->execute([$nowSql, $userId]);
            $insertToken = $pdo->prepare(
                "INSERT INTO security_tokens (purpose, user_id, token_digest, issued_at, expires_at)
                 VALUES ('faculty_invitation', ?, ?, ?, ?) RETURNING token_id"
            );
            $insertToken->bindValue(1, $userId, PDO::PARAM_INT);
            pdo_bind_binary($insertToken, 2, $digest);
            $insertToken->bindValue(3, $nowSql, PDO::PARAM_STR);
            $insertToken->bindValue(4, $expiresSql, PDO::PARAM_STR);
            $insertToken->execute();
            $tokenId = (int) $insertToken->fetchColumn();

            $macKey = config_key_bytes_at_least($config['audit']['mac_key_b64'], 32, 'AUDIT_MAC_KEY');
            audit_finish_operation($pdo, $auditContext, [
                'module_code' => 'admin',
                'action_code' => 'faculty_invited',
                'event_status' => 'Success',
                'actor_user_id' => $actor['user_id'],
                'actor_username' => $actor['login_email'],
                'actor_role' => $actor['role'],
                'actor_display_name' => $actor['display_name'],
                'session_id' => $actor['session_id'],
                'target_type' => 'security_token',
                'target_id' => (string) $tokenId,
                'description' => "Admin authorized Faculty invitation for {$name} ({$email}).",
                'reason' => null,
                'http_method' => $context['http_method'],
                'endpoint' => $context['endpoint'],
                'request_id' => $context['request_id'],
                'ip_address' => $context['ip_address'],
                'user_agent' => $context['user_agent'],
            ], $macKey);
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) { $pdo->rollBack(); }
            throw $e;
        }

        $link = app_url($config, '/activate-faculty', ['token' => $token]);
        $safeName = htmlspecialchars($name, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $safeLink = htmlspecialchars($link, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $subject = 'DentiSys Faculty Invitation';
        $message = "<p>Hello {$safeName},</p><p>An administrator has invited you to DentiSys. This invitation is your approval to establish a Faculty account.</p><p><a href=\"{$safeLink}\">Accept your Faculty invitation</a></p><p>Create your DentiSys password within seven days. Google verification is optional.</p>";
        $sent = send_email($email, $subject, $message, $config, true);
        $showDevLink = !empty($config['show_dev_invitation_link']);
        json_response([
            'status' => 'ok',
            'invitation' => [
                'id' => (string) $userId,
                'name' => $name,
                'prefix' => $nameParts['prefix'],
                'firstName' => $nameParts['firstName'],
                'middleName' => $nameParts['middleName'],
                'lastName' => $nameParts['lastName'],
                'suffix' => $nameParts['suffix'],
                'email' => $email,
                'invitedAt' => $nowSql,
                'expiresAt' => $expiresSql,
                'status' => 'Pending',
            ],
            'invitation_link' => $showDevLink ? $link : null,
            'delivery_status' => $sent ? 'Sent' : 'Failed',
            'message' => $sent ? 'Faculty invitation issued and sent.' : 'Faculty invitation issued, but email delivery failed.',
        ], 201);
    } catch (ValidationException $e) {
        validation_error_response($e->getErrors());
    } catch (DomainException $e) {
        safe_error_response($e->getMessage(), 409);
    } catch (AuthException | ChallengeException | \RuntimeException $e) {
        auth_error_response('Authentication required.', 401);
    } catch (PDOException $e) {
        if ((string) $e->getCode() === '23505') {
            safe_error_response('This email or invitation conflicts with an existing account. Manual reconciliation is required.', 409);
            return;
        }
        error_log('Faculty invitation create error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    } catch (Throwable $e) {
        error_log('Faculty invitation create error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

function handle_admin_faculty_invitation_update(): void
{
    $context = [
        'request_id' => request_id(),
        'ip_address' => request_ip(),
        'user_agent' => request_user_agent(),
        'http_method' => request_method(),
        'endpoint' => request_path(),
    ];
    $pdo = null;
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $actor = admin_verify_auth($pdo, $config);
        $body = request_body();
        $allowed = ['id', 'name', 'email', 'prefix', 'firstName', 'middleName', 'lastName', 'suffix'];
        if (!$body['has_body'] || array_diff(array_keys($body['data']), $allowed) !== []) {
            safe_error_response('Invalid request.', 400);
            return;
        }
        $rawId = $body['data']['id'] ?? null;
        $userId = is_int($rawId) ? $rawId : (is_string($rawId) && ctype_digit(trim($rawId)) ? (int) trim($rawId) : 0);
        if ($userId < 1) {
            throw new ValidationException([['field' => 'id', 'message' => 'A valid Faculty account is required.']]);
        }
        $nameParts = faculty_invitation_name_parts_from_payload($body['data']);
        $name = $nameParts['displayName'];
        $email = validate_institutional_email((string) ($body['data']['email'] ?? ''));
        $token = faculty_invitation_token();
        $digest = hash('sha256', $token, true);
        $passwordHash = password_hash(faculty_invitation_token(), PASSWORD_DEFAULT);
        $now = new DateTimeImmutable('now', new DateTimeZone('UTC'));
        $nowSql = $now->format('Y-m-d H:i:s.u');
        $expiresSql = $now->add(new DateInterval('P7D'))->format('Y-m-d H:i:s.u');

        $pdo->beginTransaction();
        $accountStmt = $pdo->prepare(
            'SELECT user_id, login_email, display_name, role, status
               FROM user_accounts WHERE user_id = ? FOR UPDATE'
        );
        $accountStmt->execute([$userId]);
        $account = $accountStmt->fetch(PDO::FETCH_ASSOC);
        if (!is_array($account) || $account['role'] !== 'faculty' || $account['status'] !== 'Pending Activation') {
            $pdo->rollBack();
            throw new DomainException('Only a pending Faculty invitation can be edited.');
        }

        $emailConflict = $pdo->prepare(
            'SELECT user_id FROM user_accounts
              WHERE lower(login_email) = lower(?) AND user_id <> ?
              LIMIT 1 FOR UPDATE'
        );
        $emailConflict->execute([$email, $userId]);
        if ($emailConflict->fetchColumn() !== false) {
            $pdo->rollBack();
            throw new DomainException('This email already belongs to another account.');
        }

        $auditContext = audit_begin_operation($pdo);
        $update = $pdo->prepare(
            "UPDATE user_accounts
                SET login_email = ?, display_name = ?, name_prefix = ?, first_name = ?, middle_name = ?,
                    last_name = ?, name_suffix = ?, password_hash = ?, google_subject = NULL,
                    token_version = token_version + 1, updated_at = ?
              WHERE user_id = ?"
        );
        $update->execute([
            $email, $name, $nameParts['prefix'], $nameParts['firstName'], $nameParts['middleName'],
            $nameParts['lastName'], $nameParts['suffix'], $passwordHash, $nowSql, $userId,
        ]);
        $revoke = $pdo->prepare(
            "UPDATE security_tokens
                SET revoked_at = ?, revocation_reason = 'Replaced by edited Faculty invitation'
              WHERE purpose = 'faculty_invitation' AND user_id = ?
                AND used_at IS NULL AND revoked_at IS NULL"
        );
        $revoke->execute([$nowSql, $userId]);
        $insertToken = $pdo->prepare(
            "INSERT INTO security_tokens (purpose, user_id, token_digest, issued_at, expires_at)
             VALUES ('faculty_invitation', ?, ?, ?, ?) RETURNING token_id"
        );
        $insertToken->bindValue(1, $userId, PDO::PARAM_INT);
        pdo_bind_binary($insertToken, 2, $digest);
        $insertToken->bindValue(3, $nowSql, PDO::PARAM_STR);
        $insertToken->bindValue(4, $expiresSql, PDO::PARAM_STR);
        $insertToken->execute();
        $tokenId = (int) $insertToken->fetchColumn();
        $macKey = config_key_bytes_at_least($config['audit']['mac_key_b64'], 32, 'AUDIT_MAC_KEY');
        audit_finish_operation($pdo, $auditContext, [
            'module_code' => 'admin',
            'action_code' => 'faculty_invitation_edited',
            'event_status' => 'Success',
            'actor_user_id' => $actor['user_id'],
            'actor_username' => $actor['login_email'],
            'actor_role' => $actor['role'],
            'actor_display_name' => $actor['display_name'],
            'session_id' => $actor['session_id'],
            'target_type' => 'security_token',
            'target_id' => (string) $tokenId,
            'description' => "Edited pending Faculty invitation for {$name} ({$email}); previous tokens were revoked.",
            'reason' => null,
            'http_method' => $context['http_method'],
            'endpoint' => $context['endpoint'],
            'request_id' => $context['request_id'],
            'ip_address' => $context['ip_address'],
            'user_agent' => $context['user_agent'],
        ], $macKey);
        $pdo->commit();

        $link = app_url($config, '/activate-faculty', ['token' => $token]);
        $sent = send_email(
            $email,
            'DentiSys Faculty Invitation Updated',
            '<p>Your pending DentiSys Faculty invitation was updated.</p><p><a href="' . htmlspecialchars($link, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '">Accept your Faculty invitation</a></p>',
            $config,
            true
        );
        json_response([
            'status' => 'ok',
            'invitation' => [
                'id' => (string) $userId,
                'name' => $name,
                'prefix' => $nameParts['prefix'],
                'firstName' => $nameParts['firstName'],
                'middleName' => $nameParts['middleName'],
                'lastName' => $nameParts['lastName'],
                'suffix' => $nameParts['suffix'],
                'email' => $email,
                'invitedAt' => $nowSql,
                'expiresAt' => $expiresSql,
                'status' => 'Pending',
            ],
            'invitation_link' => !empty($config['show_dev_invitation_link']) ? $link : null,
            'delivery_status' => $sent ? 'Sent' : 'Failed',
        ], 200);
    } catch (ValidationException $e) {
        if ($pdo instanceof PDO && $pdo->inTransaction()) { $pdo->rollBack(); }
        validation_error_response($e->getErrors());
    } catch (DomainException $e) {
        if ($pdo instanceof PDO && $pdo->inTransaction()) { $pdo->rollBack(); }
        safe_error_response($e->getMessage(), 409);
    } catch (AuthException | ChallengeException | RuntimeException $e) {
        if ($pdo instanceof PDO && $pdo->inTransaction()) { $pdo->rollBack(); }
        auth_error_response('Authentication required.', 401);
    } catch (Throwable $e) {
        if ($pdo instanceof PDO && $pdo->inTransaction()) { $pdo->rollBack(); }
        error_log('Faculty invitation edit error: ' . sanitize_for_log($e));
        safe_error_response('Unable to edit Faculty invitation.', 500);
    }
}

function handle_admin_faculty_invitation_revoke(): void
{
    $context = [
        'request_id' => request_id(),
        'ip_address' => request_ip(),
        'user_agent' => request_user_agent(),
        'http_method' => request_method(),
        'endpoint' => request_path(),
    ];
    $pdo = null;
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $actor = admin_verify_auth($pdo, $config);
        $body = request_body();
        $rawId = $body['has_body'] ? ($body['data']['id'] ?? null) : null;
        $userId = is_int($rawId) ? $rawId : (is_string($rawId) && ctype_digit(trim($rawId)) ? (int) trim($rawId) : 0);
        if ($userId < 1) {
            throw new ValidationException([['field' => 'id', 'message' => 'A valid Faculty account is required.']]);
        }
        $nowSql = (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d H:i:s.u');
        $pdo->beginTransaction();
        $account = $pdo->prepare('SELECT user_id, role, status, display_name, login_email FROM user_accounts WHERE user_id = ? FOR UPDATE');
        $account->execute([$userId]);
        $row = $account->fetch(PDO::FETCH_ASSOC);
        if (!is_array($row) || $row['role'] !== 'faculty' || $row['status'] !== 'Pending Activation') {
            $pdo->rollBack();
            throw new DomainException('Only a pending Faculty invitation can be revoked.');
        }
        $revoke = $pdo->prepare(
            "UPDATE security_tokens
                SET revoked_at = ?, revocation_reason = 'Revoked by administrator'
              WHERE purpose = 'faculty_invitation' AND user_id = ?
                AND used_at IS NULL AND revoked_at IS NULL"
        );
        $revoke->execute([$nowSql, $userId]);
        if ($revoke->rowCount() === 0) {
            $pdo->rollBack();
            safe_error_response('No live Faculty invitation exists for this account.', 404);
            return;
        }
        $macKey = config_key_bytes_at_least($config['audit']['mac_key_b64'], 32, 'AUDIT_MAC_KEY');
        $auditContext = audit_begin_operation($pdo);
        audit_finish_operation($pdo, $auditContext, [
            'module_code' => 'admin',
            'action_code' => 'faculty_invitation_revoked',
            'event_status' => 'Success',
            'actor_user_id' => $actor['user_id'],
            'actor_username' => $actor['login_email'],
            'actor_role' => $actor['role'],
            'actor_display_name' => $actor['display_name'],
            'session_id' => $actor['session_id'],
            'target_type' => 'user_account',
            'target_id' => (string) $userId,
            'description' => "Revoked pending Faculty invitation for {$row['display_name']} ({$row['login_email']}).",
            'reason' => 'Revoked by administrator',
            'http_method' => $context['http_method'],
            'endpoint' => $context['endpoint'],
            'request_id' => $context['request_id'],
            'ip_address' => $context['ip_address'],
            'user_agent' => $context['user_agent'],
        ], $macKey);
        $pdo->commit();
        json_response(['status' => 'ok', 'id' => (string) $userId, 'statusValue' => 'Revoked'], 200);
    } catch (ValidationException $e) {
        if ($pdo instanceof PDO && $pdo->inTransaction()) { $pdo->rollBack(); }
        validation_error_response($e->getErrors());
    } catch (DomainException $e) {
        if ($pdo instanceof PDO && $pdo->inTransaction()) { $pdo->rollBack(); }
        safe_error_response($e->getMessage(), 409);
    } catch (AuthException | ChallengeException | RuntimeException $e) {
        if ($pdo instanceof PDO && $pdo->inTransaction()) { $pdo->rollBack(); }
        auth_error_response('Authentication required.', 401);
    } catch (Throwable $e) {
        if ($pdo instanceof PDO && $pdo->inTransaction()) { $pdo->rollBack(); }
        error_log('Faculty invitation revoke error: ' . sanitize_for_log($e));
        safe_error_response('Unable to revoke Faculty invitation.', 500);
    }
}

function handle_admin_faculty_invitation_reissue(): void
{
    $context = [
        'request_id' => request_id(),
        'ip_address' => request_ip(),
        'user_agent' => request_user_agent(),
        'http_method' => request_method(),
        'endpoint' => request_path(),
    ];
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $actor = admin_verify_auth($pdo, $config);
        $body = request_body();
        if (!$body['has_body'] || array_diff(array_keys($body['data']), ['id']) !== []) {
            safe_error_response('Invalid request.', 400);
            return;
        }

        $rawId = $body['data']['id'] ?? null;
        $userId = is_int($rawId) ? $rawId : (is_string($rawId) && ctype_digit(trim($rawId)) ? (int) trim($rawId) : 0);
        if ($userId < 1) {
            throw new ValidationException([['field' => 'id', 'message' => 'A valid Faculty account is required.']]);
        }

        $token = faculty_invitation_token();
        $digest = hash('sha256', $token, true);
        $passwordHash = password_hash(faculty_invitation_token(), PASSWORD_DEFAULT);
        $now = new DateTimeImmutable('now', new DateTimeZone('UTC'));
        $nowSql = $now->format('Y-m-d H:i:s.u');
        $expiresSql = $now->add(new DateInterval('P7D'))->format('Y-m-d H:i:s.u');

        $pdo->beginTransaction();
        try {
            $accountStmt = $pdo->prepare(
                'SELECT user_id, login_email, display_name, role, status FROM user_accounts WHERE user_id = ? FOR UPDATE'
            );
            $accountStmt->execute([$userId]);
            $account = $accountStmt->fetch(PDO::FETCH_ASSOC);
            if ($account === false
                || $account['role'] !== 'faculty'
                || !in_array($account['status'], ['Pending Approval', 'Pending Activation', 'Pending', 'Rejected'], true)) {
                throw new DomainException('This Faculty account cannot be re-invited. Manual reconciliation is required.');
            }

            $auditContext = audit_begin_operation($pdo);
            $update = $pdo->prepare(
                "UPDATE user_accounts
                    SET password_hash = ?, status = 'Pending Activation', updated_at = ?,
                        approved_at = ?, rejected_at = NULL, google_subject = NULL
                  WHERE user_id = ?"
            );
            $update->execute([$passwordHash, $nowSql, $nowSql, $userId]);

            $revoke = $pdo->prepare(
                "UPDATE security_tokens
                    SET revoked_at = ?, revocation_reason = 'Replaced by a new Admin-authorized Faculty invitation'
                  WHERE purpose = 'faculty_invitation' AND user_id = ?
                    AND used_at IS NULL AND revoked_at IS NULL"
            );
            $revoke->execute([$nowSql, $userId]);
            $insertToken = $pdo->prepare(
                "INSERT INTO security_tokens (purpose, user_id, token_digest, issued_at, expires_at)
                 VALUES ('faculty_invitation', ?, ?, ?, ?) RETURNING token_id"
            );
            $insertToken->bindValue(1, $userId, PDO::PARAM_INT);
            pdo_bind_binary($insertToken, 2, $digest);
            $insertToken->bindValue(3, $nowSql, PDO::PARAM_STR);
            $insertToken->bindValue(4, $expiresSql, PDO::PARAM_STR);
            $insertToken->execute();
            $tokenId = (int) $insertToken->fetchColumn();

            $macKey = config_key_bytes_at_least($config['audit']['mac_key_b64'], 32, 'AUDIT_MAC_KEY');
            audit_finish_operation($pdo, $auditContext, [
                'module_code' => 'admin',
                'action_code' => 'faculty_invited',
                'event_status' => 'Success',
                'actor_user_id' => $actor['user_id'],
                'actor_username' => $actor['login_email'],
                'actor_role' => $actor['role'],
                'actor_display_name' => $actor['display_name'],
                'session_id' => $actor['session_id'],
                'target_type' => 'security_token',
                'target_id' => (string) $tokenId,
                'description' => "Admin reissued Faculty invitation for {$account['display_name']} ({$account['login_email']}).",
                'reason' => null,
                'http_method' => $context['http_method'],
                'endpoint' => $context['endpoint'],
                'request_id' => $context['request_id'],
                'ip_address' => $context['ip_address'],
                'user_agent' => $context['user_agent'],
            ], $macKey);
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) { $pdo->rollBack(); }
            throw $e;
        }

        $name = (string) $account['display_name'];
        $email = (string) $account['login_email'];
        $link = app_url($config, '/activate-faculty', ['token' => $token]);
        $safeName = htmlspecialchars($name, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $safeLink = htmlspecialchars($link, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $subject = 'DentiSys Faculty Invitation';
        $message = "<p>Hello {$safeName},</p><p>An administrator has invited you to DentiSys. This invitation is your approval to establish a Faculty account.</p><p><a href=\"{$safeLink}\">Accept your Faculty invitation</a></p><p>Create your DentiSys password within seven days. Google verification is optional.</p>";
        $sent = send_email($email, $subject, $message, $config, true);
        $showDevLink = !empty($config['show_dev_invitation_link']);
        json_response([
            'status' => 'ok',
            'invitation' => [
                'id' => (string) $userId,
                'name' => $name,
                'email' => $email,
                'invitedAt' => $nowSql,
                'expiresAt' => $expiresSql,
                'status' => 'Pending',
            ],
            'invitation_link' => $showDevLink ? $link : null,
            'delivery_status' => $sent ? 'Sent' : 'Failed',
            'message' => $sent ? 'Faculty invitation reissued and sent.' : 'Faculty invitation reissued, but email delivery failed.',
        ], 201);
    } catch (ValidationException $e) {
        validation_error_response($e->getErrors());
    } catch (DomainException $e) {
        safe_error_response($e->getMessage(), 409);
    } catch (AuthException | ChallengeException | \RuntimeException $e) {
        auth_error_response('Authentication required.', 401);
    } catch (PDOException $e) {
        error_log('Faculty invitation reissue error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    } catch (Throwable $e) {
        error_log('Faculty invitation reissue error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

function handle_auth_faculty_invitation_get(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $token = is_string($_GET['token'] ?? null) ? $_GET['token'] : '';
        $row = faculty_invitation_token_row($pdo, $token);
        if ($row === null || !faculty_invitation_row_is_live($row)) {
            auth_controller_emit(auth_build_no_store_message_response('Invalid or expired Faculty invitation.', 400));
            return;
        }
        auth_controller_emit(auth_build_no_store_json_response([
            'status' => 'ok',
            'invitation' => [
                'name' => (string) $row['display_name'],
                'prefix' => $row['name_prefix'],
                'firstName' => $row['first_name'],
                'middleName' => $row['middle_name'],
                'lastName' => $row['last_name'],
                'suffix' => $row['name_suffix'],
                'email' => (string) $row['login_email'],
                'expiresAt' => (string) $row['expires_at'],
            ],
        ], 200));
    } catch (Throwable $e) {
        error_log('Faculty invitation inspection error: ' . sanitize_for_log($e));
        auth_controller_emit(auth_build_no_store_message_response('Unable to inspect invitation.', 500));
    }
}

function handle_auth_faculty_invitation_accept(): void
{
    $context = [
        'request_id' => request_id(),
        'ip_address' => request_ip(),
        'user_agent' => request_user_agent(),
        'http_method' => request_method(),
        'endpoint' => request_path(),
    ];
    try {
        $config = app_config();
        $body = request_body();
        if (!$body['has_body']) {
            auth_controller_emit(auth_build_no_store_message_response('Request body required.', 400));
            return;
        }
        $data = $body['data'];
        if (array_diff(array_keys($data), ['token', 'password', 'credential']) !== []
            || !isset($data['token'], $data['password'])
            || !is_string($data['token'])
            || (isset($data['credential']) && !is_string($data['credential']))) {
            auth_controller_emit(auth_build_no_store_message_response('Invalid request.', 400));
            return;
        }
        $password = extract_password($data, 'password');
        validate_password_policy($password);
        $row = faculty_invitation_token_row(create_pdo($config), $data['token']);
        if ($row === null || !faculty_invitation_row_is_live($row)) {
            auth_controller_emit(auth_build_no_store_message_response('Invalid or expired Faculty invitation.', 400));
            return;
        }

        $googleSubject = null;
        if (isset($data['credential'])) {
            $claims = google_verify_id_token($config, $data['credential']);
            if (strtolower(trim($claims['email'])) !== strtolower(trim((string) $row['login_email']))) {
                auth_controller_emit(auth_build_no_store_message_response('Google identity does not match the invited Faculty email.', 409));
                return;
            }
            $googleSubject = $claims['sub'];
        }
        $passwordHash = password_hash($password, PASSWORD_DEFAULT);
        $tokenDigest = hash('sha256', $data['token'], true);
        $pdo = create_pdo($config);
        $pdo->beginTransaction();
        try {
            $accountStmt = $pdo->prepare(
                'SELECT user_id, login_email, role, display_name, status, google_subject FROM user_accounts WHERE user_id = ? FOR UPDATE'
            );
            $accountStmt->execute([(int) $row['user_id']]);
            $account = $accountStmt->fetch(PDO::FETCH_ASSOC);
            $tokenStmt = $pdo->prepare(
                "SELECT token_id, user_id, expires_at, used_at, revoked_at
                   FROM security_tokens
                  WHERE purpose = 'faculty_invitation' AND token_digest = ? FOR UPDATE"
            );
            pdo_bind_binary($tokenStmt, 1, $tokenDigest);
            $tokenStmt->execute();
            $lockedToken = $tokenStmt->fetch(PDO::FETCH_ASSOC);
            $valid = $account !== false && $lockedToken !== false
                && (int) $lockedToken['user_id'] === (int) $account['user_id']
                && $account['role'] === 'faculty'
                && $account['status'] === 'Pending Activation'
                && strtolower(trim((string) $account['login_email'])) === strtolower(trim((string) $row['login_email']))
                && $lockedToken['used_at'] === null && $lockedToken['revoked_at'] === null
                && new DateTimeImmutable((string) $lockedToken['expires_at'], new DateTimeZone('UTC')) > new DateTimeImmutable('now', new DateTimeZone('UTC'));
            if (!$valid) {
                throw new DomainException('Invalid or expired Faculty invitation.');
            }
            if ($googleSubject !== null) {
                $subjectStmt = $pdo->prepare('SELECT user_id FROM user_accounts WHERE google_subject = ? AND user_id <> ? FOR UPDATE');
                $subjectStmt->execute([$googleSubject, (int) $account['user_id']]);
                if ($subjectStmt->fetchColumn() !== false) {
                    throw new DomainException('This Google identity is already linked to another account.');
                }
            }
            $nowSql = (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d H:i:s.u');
            $update = $pdo->prepare(
                "UPDATE user_accounts SET password_hash = ?, google_subject = ?, status = 'Active',
                    updated_at = ?, rejected_at = NULL WHERE user_id = ?"
            );
            $update->execute([$passwordHash, $googleSubject, $nowSql, (int) $account['user_id']]);
            $consume = $pdo->prepare(
                'UPDATE security_tokens SET used_at = ? WHERE token_id = ? AND used_at IS NULL AND revoked_at IS NULL'
            );
            $consume->execute([$nowSql, (int) $lockedToken['token_id']]);
            if ($consume->rowCount() !== 1) {
                throw new DomainException('Invalid or expired Faculty invitation.');
            }
            $macKey = config_key_bytes_at_least($config['audit']['mac_key_b64'], 32, 'AUDIT_MAC_KEY');
            $auditContext = audit_begin_operation($pdo);
            audit_finish_operation($pdo, $auditContext, [
                'module_code' => 'auth', 'action_code' => 'faculty_invitation_accepted', 'event_status' => 'Success',
                'actor_user_id' => (int) $account['user_id'], 'actor_username' => $account['login_email'],
                'actor_role' => 'faculty', 'actor_display_name' => $account['display_name'], 'session_id' => null,
                'target_type' => 'user_account', 'target_id' => (string) $account['user_id'],
                'description' => 'Faculty invitation accepted and account activated.', 'reason' => null,
                'http_method' => $context['http_method'], 'endpoint' => $context['endpoint'],
                'request_id' => $context['request_id'], 'ip_address' => $context['ip_address'], 'user_agent' => $context['user_agent'],
            ], $macKey);
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) { $pdo->rollBack(); }
            throw $e;
        }
        auth_controller_emit(auth_build_no_store_json_response([
            'status' => 'ok', 'message' => 'Faculty account activated. You may now sign in.',
        ], 200));
    } catch (ValidationException $e) {
        validation_error_response($e->getErrors());
    } catch (InvalidCredentialsException $e) {
        auth_controller_emit(auth_build_no_store_json_response([
            'status' => 'error', 'message' => $e->getMessage(),
        ], 422));
    } catch (GoogleIdentityException $e) {
        auth_controller_emit(auth_build_no_store_json_response([
            'status' => 'error', 'message' => $e->getMessage(),
        ], google_auth_identity_error_status($e->reason())));
    } catch (DomainException $e) {
        auth_controller_emit(auth_build_no_store_message_response($e->getMessage(), 409));
    } catch (PDOException $e) {
        if ((string) $e->getCode() === '23505') {
            auth_controller_emit(auth_build_no_store_message_response('This Google identity is already linked to another account.', 409));
            return;
        }
        error_log('Faculty invitation acceptance error: ' . sanitize_for_log($e));
        auth_controller_emit(auth_build_no_store_message_response('Unable to accept Faculty invitation.', 500));
    } catch (Throwable $e) {
        error_log('Faculty invitation acceptance error: ' . sanitize_for_log($e));
        auth_controller_emit(auth_build_no_store_message_response('Unable to accept Faculty invitation.', 500));
    }
}
