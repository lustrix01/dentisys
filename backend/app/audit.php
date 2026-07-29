<?php

declare(strict_types=1);

class AuditException extends \RuntimeException
{
}

function audit_begin_operation(PDO $pdo): array
{
    $inTransaction = $pdo->inTransaction();

    if (!$inTransaction) {
        throw new AuditException('audit_begin_operation requires an active transaction.');
    }

    $stmt = $pdo->prepare(
        "SELECT setting_value, is_internal FROM system_settings
         WHERE setting_key = 'audit_chain_head'
         FOR UPDATE"
    );
    $stmt->execute();
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($row === false) {
        throw new AuditException("system_settings row 'audit_chain_head' not found.");
    }

    if ((int)($row['is_internal'] ?? 0) !== 1) {
        throw new AuditException("system_settings row 'audit_chain_head' is not marked internal.");
    }

    $value = json_decode($row['setting_value'], true);

    if (!is_array($value)) {
        throw new AuditException("system_settings 'audit_chain_head' contains invalid JSON.");
    }

    if (!isset($value['latest_sequence']) || !is_int($value['latest_sequence']) || $value['latest_sequence'] < 0) {
        throw new AuditException("audit_chain_head 'latest_sequence' must be a nonnegative integer.");
    }

    if (!isset($value['latest_mac']) || !is_string($value['latest_mac'])) {
        throw new AuditException("audit_chain_head 'latest_mac' must be a string.");
    }

    if (strlen($value['latest_mac']) !== 64 || !ctype_xdigit($value['latest_mac'])) {
        throw new AuditException("audit_chain_head 'latest_mac' must be exactly 64 lowercase hex characters.");
    }

    return [
        'latest_sequence' => $value['latest_sequence'],
        'latest_mac_hex' => $value['latest_mac'],
    ];
}

function audit_finish_operation(
    PDO $pdo,
    array $auditContext,
    array $event,
    string $macKeyBytes,
    ?array $beforeState = null,
    ?array $afterState = null,
    ?callable $clock = null
): array {
    $inTransaction = $pdo->inTransaction();

    if (!$inTransaction) {
        throw new AuditException('audit_finish_operation requires an active transaction.');
    }

    if (!isset($auditContext['latest_sequence']) || !isset($auditContext['latest_mac_hex'])) {
        throw new AuditException('auditContext is missing required fields.');
    }

    $latestSeq = $auditContext['latest_sequence'];
    $prevMacHex = $auditContext['latest_mac_hex'];
    $nextSeq = $latestSeq + 1;

    if (strlen($macKeyBytes) < 32) {
        throw new AuditException('Audit MAC key must be at least 32 bytes.');
    }

    $clock = $clock ?? fn(): DateTimeImmutable => new DateTimeImmutable('now', new DateTimeZone('UTC'));
    $now = $clock();

    $eventUuid = uuid_v4_string();

    $beforeStateJson = null;
    $beforeStateHash = null;
    if ($beforeState !== null) {
        $redactedBefore = audit_redact_state($beforeState);
        $beforeStateJson = json_encode($redactedBefore, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if ($beforeStateJson === false) {
            throw new AuditException('Failed to encode before state JSON.');
        }
        $beforeStateHash = hash('sha256', $beforeStateJson, true);
    }

    $afterStateJson = null;
    $afterStateHash = null;
    if ($afterState !== null) {
        $redactedAfter = audit_redact_state($afterState);
        $afterStateJson = json_encode($redactedAfter, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if ($afterStateJson === false) {
            throw new AuditException('Failed to encode after state JSON.');
        }
        $afterStateHash = hash('sha256', $afterStateJson, true);
    }

    $canonical = audit_build_canonical_event($event, $eventUuid, $nextSeq, $now, $beforeStateHash, $afterStateHash);
    $canonicalBytes = $canonical['canonical_bytes'];

    $prevMac = hex2bin($prevMacHex);

    if ($prevMac === false) {
        throw new AuditException('Cannot decode previous MAC hex.');
    }

    $eventMac = hash_hmac('sha256', $canonicalBytes . $prevMac, $macKeyBytes, true);

    $eventMacHex = bin2hex($eventMac);
    $sqlTimestamp = $now->format('Y-m-d H:i:s.u');

    $insertSql = "INSERT INTO audit_events (
        event_uuid, sequence_number, occurred_at,
        actor_user_id, actor_username, actor_role, actor_display_name, session_id, scope_cs_id,
        module_code, action_code, event_status,
        target_type, target_id, description, reason,
        http_method, endpoint, request_id, correlation_id, operation_uuid,
        ip_address, user_agent, device_id, device_name,
        before_state_json, after_state_json,
        before_state_hash, after_state_hash,
        previous_event_mac, event_mac,
        mac_key_version, canonical_schema_version
    ) VALUES (
        :event_uuid, :sequence_number, :occurred_at,
        :actor_user_id, :actor_username, :actor_role, :actor_display_name, :session_id, :scope_cs_id,
        :module_code, :action_code, :event_status,
        :target_type, :target_id, :description, :reason,
        :http_method, :endpoint, :request_id, :correlation_id, :operation_uuid,
        :ip_address, :user_agent, :device_id, :device_name,
        :before_state_json, :after_state_json,
        :before_state_hash, :after_state_hash,
        :previous_event_mac, :event_mac,
        :mac_key_version, :canonical_schema_version
    )";

    $stmt = $pdo->prepare($insertSql);

    $bindings = [
        ':event_uuid' => $eventUuid,
        ':sequence_number' => $nextSeq,
        ':occurred_at' => $sqlTimestamp,
        ':actor_user_id' => $event['actor_user_id'] ?? null,
        ':actor_username' => $event['actor_username'] ?? null,
        ':actor_role' => $event['actor_role'] ?? null,
        ':actor_display_name' => $event['actor_display_name'] ?? null,
        ':session_id' => $event['session_id'] ?? null,
        ':scope_cs_id' => isset($event['scope_cs_id']) ? (int) $event['scope_cs_id'] : null,
        ':module_code' => $event['module_code'] ?? '',
        ':action_code' => $event['action_code'] ?? '',
        ':event_status' => $event['event_status'] ?? 'Success',
        ':target_type' => $event['target_type'] ?? null,
        ':target_id' => $event['target_id'] ?? null,
        ':description' => $event['description'] ?? null,
        ':reason' => $event['reason'] ?? null,
        ':http_method' => $event['http_method'] ?? null,
        ':endpoint' => $event['endpoint'] ?? null,
        ':request_id' => $event['request_id'] ?? null,
        ':correlation_id' => $event['correlation_id'] ?? null,
        ':operation_uuid' => $event['operation_uuid'] ?? null,
        ':ip_address' => $event['ip_address'] ?? null,
        ':user_agent' => $event['user_agent'] ?? null,
        ':device_id' => $event['device_id'] ?? null,
        ':device_name' => $event['device_name'] ?? null,
        ':before_state_json' => $beforeStateJson,
        ':after_state_json' => $afterStateJson,
        ':before_state_hash' => $beforeStateHash,
        ':after_state_hash' => $afterStateHash,
        ':previous_event_mac' => $prevMac,
        ':event_mac' => $eventMac,
        ':mac_key_version' => 1,
        ':canonical_schema_version' => 2,
    ];

    $allowedStatuses = ['Success', 'Failed', 'Warning'];

    if (!in_array($bindings[':event_status'], $allowedStatuses, true)) {
        throw new AuditException("event_status must be one of: " . implode(', ', $allowedStatuses));
    }

    foreach ($bindings as $key => $value) {
        $paramType = PDO::PARAM_STR;

        if ($value === null) {
            if (in_array($key, [':previous_event_mac', ':event_mac'],
                true)) {
                throw new AuditException("$key must not be null.");
            }
            $stmt->bindValue($key, null, PDO::PARAM_NULL);
        } elseif (is_int($value)) {
            $stmt->bindValue($key, $value, PDO::PARAM_INT);
        } elseif (is_string($value) && in_array($key, [':previous_event_mac', ':event_mac', ':before_state_hash', ':after_state_hash'], true)) {
            $stmt->bindValue($key, $value, PDO::PARAM_LOB);
        } else {
            $stmt->bindValue($key, $value, PDO::PARAM_STR);
        }
    }

    if (!$stmt->execute()) {
        throw new AuditException('Failed to insert audit event.');
    }

    $updateSql = "UPDATE system_settings
                  SET setting_value = JSON_OBJECT(
                      'latest_sequence', :next_seq,
                      'latest_mac', :latest_mac
                  )
                  WHERE setting_key = 'audit_chain_head'";

    $updateStmt = $pdo->prepare($updateSql);
    $updateStmt->bindValue(':next_seq', $nextSeq, PDO::PARAM_INT);
    $updateStmt->bindValue(':latest_mac', $eventMacHex, PDO::PARAM_STR);
    $updateStmt->execute();

    if ($updateStmt->rowCount() !== 1) {
        throw new AuditException('Failed to update audit chain head (rowCount != 1).');
    }

    return [
        'event_uuid' => $eventUuid,
        'sequence_number' => $nextSeq,
        'event_mac_hex' => $eventMacHex,
    ];
}

function uuid_v4_string(): string
{
    $data = random_bytes(16);
    $data[6] = chr((ord($data[6]) & 0x0F) | 0x40);
    $data[8] = chr((ord($data[8]) & 0x3F) | 0x80);

    return sprintf(
        '%s-%s-%s-%s-%s',
        bin2hex(substr($data, 0, 4)),
        bin2hex(substr($data, 4, 2)),
        bin2hex(substr($data, 6, 2)),
        bin2hex(substr($data, 8, 2)),
        bin2hex(substr($data, 10, 6))
    );
}

function audit_build_canonical_event(
    array $event,
    string $eventUuid,
    int $sequenceNumber,
    DateTimeImmutable $occurredAt,
    ?string $beforeStateHash,
    ?string $afterStateHash
): array {
    $canonical = [
        'action_code' => $event['action_code'] ?? '',
        'actor_display_name' => $event['actor_display_name'] ?? null,
        'actor_role' => $event['actor_role'] ?? null,
        'actor_user_id' => $event['actor_user_id'] ?? null,
        'actor_username' => $event['actor_username'] ?? null,
        'after_state_hash' => $afterStateHash !== null ? bin2hex($afterStateHash) : null,
        'before_state_hash' => $beforeStateHash !== null ? bin2hex($beforeStateHash) : null,
        'canonical_schema_version' => 2,
        'correlation_id' => $event['correlation_id'] ?? null,
        'description' => $event['description'] ?? null,
        'device_id' => $event['device_id'] ?? null,
        'device_name' => $event['device_name'] ?? null,
        'endpoint' => $event['endpoint'] ?? null,
        'event_status' => $event['event_status'] ?? 'Success',
        'event_uuid' => $eventUuid,
        'http_method' => $event['http_method'] ?? null,
        'ip_address' => $event['ip_address'] ?? null,
        'mac_key_version' => 1,
        'module_code' => $event['module_code'] ?? '',
        'occurred_at' => $occurredAt->format('Y-m-d\TH:i:s.u\Z'),
        'operation_uuid' => $event['operation_uuid'] ?? null,
        'reason' => $event['reason'] ?? null,
        'request_id' => $event['request_id'] ?? null,
        'sequence_number' => $sequenceNumber,
        'session_id' => $event['session_id'] ?? null,
        'scope_cs_id' => isset($event['scope_cs_id']) ? (int) $event['scope_cs_id'] : null,
        'target_id' => $event['target_id'] ?? null,
        'target_type' => $event['target_type'] ?? null,
        'user_agent' => $event['user_agent'] ?? null,
    ];

    $sorted = audit_sort_recursive($canonical);

    $json = json_encode($sorted, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

    if ($json === false) {
        throw new AuditException('Failed to encode canonical event JSON: ' . json_last_error_msg());
    }

    return [
        'canonical_bytes' => $json,
        'canonical_array' => $sorted,
    ];
}

function audit_sort_recursive(array $data): array
{
    if (array_is_list($data)) {
        $result = [];

        foreach ($data as $key => $value) {
            $result[] = is_array($value) ? audit_sort_recursive($value) : $value;
        }

        return $result;
    }

    ksort($data, SORT_STRING);
    $result = [];

    foreach ($data as $key => $value) {
        $result[$key] = is_array($value) ? audit_sort_recursive($value) : $value;
    }

    return $result;
}

function audit_redact_state(array $state): array
{
    $sensitiveKeys = [
        'password', 'password_hash',
        'token', 'access_token', 'refresh_token', 'reset_token', 'invitation_token',
        'token_digest', 'secret_hash',
        'secret', 'mfa_secret', 'recovery_code',
        'ciphertext', 'nonce', 'auth_tag',
        'template_reference', 'image_references',
        'message_body',
    ];

    $result = [];

    foreach ($state as $key => $value) {
        $keyLower = strtolower((string) $key);
        $isSensitive = false;

        foreach ($sensitiveKeys as $sk) {
            if ($keyLower === $sk) {
                $isSensitive = true;
                break;
            }
        }

        if ($isSensitive) {
            $result[$key] = '[REDACTED]';
        } elseif (is_array($value)) {
            $result[$key] = audit_redact_state($value);
        } elseif (is_float($value)) {
            throw new \InvalidArgumentException("Float value not allowed in audit state: $key");
        } elseif ($value instanceof \DateTimeImmutable || $value instanceof \DateTime) {
            throw new \InvalidArgumentException("DateTime objects must be converted to strings before redaction.");
        } elseif (is_object($value)) {
            throw new \InvalidArgumentException("Object type not supported in audit state: " . get_class($value));
        } else {
            $result[$key] = $value;
        }
    }

    return $result;
}
