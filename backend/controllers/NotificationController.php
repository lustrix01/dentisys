<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/app/notifications.php';

function notification_verify_auth(PDO $pdo, array $config): array
{
    $authHeader = request_header('Authorization') ?? '';
    if ($authHeader === '') {
        auth_error_response('Authorization header required.', 401);
        exit;
    }
    try {
        $token = auth_extract_bearer_token($authHeader);
        $jwtKey = config_key_bytes_at_least($config['jwt']['signing_key_b64'], 32, 'JWT_SIGNING_KEY');
        return auth_verify_access_token($pdo, $config, $token, $jwtKey);
    } catch (AuthException | RuntimeException $e) {
        auth_error_response($e->getMessage(), 401);
        exit;
    }
}

function handle_notifications_list(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = notification_verify_auth($pdo, $config);
        $limit = (int) ($_GET['limit'] ?? 50);
        $limit = max(1, min(100, $limit));
        $unreadOnly = filter_var($_GET['unreadOnly'] ?? false, FILTER_VALIDATE_BOOLEAN);
        $sql = 'SELECT notification_id, recipient_user_id, notification_type, title, body,
                       entity_type, entity_id, deduplication_key, read_at, created_at
                  FROM notifications
                 WHERE recipient_user_id = ?';
        $params = [(int) $authCtx['user_id']];
        if ($unreadOnly) {
            $sql .= ' AND read_at IS NULL';
        }
        $sql .= ' ORDER BY created_at DESC, notification_id DESC LIMIT ' . $limit;
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $count = $pdo->prepare(
            'SELECT COUNT(*) FROM notifications WHERE recipient_user_id = ? AND read_at IS NULL'
        );
        $count->execute([(int) $authCtx['user_id']]);
        json_response([
            'status' => 'ok',
            'notifications' => array_map('notification_payload', $rows),
            'unreadCount' => (int) $count->fetchColumn(),
        ], 200);
    } catch (Throwable $e) {
        error_log('Notification list error: ' . get_class($e));
        safe_error_response('Unable to read notifications.', 500);
    }
}

function handle_notification_mark_read(array $params = []): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = notification_verify_auth($pdo, $config);
        $notificationId = (int) ($params['notification_id'] ?? 0);
        if ($notificationId <= 0) {
            safe_error_response('A valid notification id is required.', 422);
            return;
        }
        $now = (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d H:i:s.u');
        $stmt = $pdo->prepare(
            'UPDATE notifications
                SET read_at = COALESCE(read_at, ?)
              WHERE notification_id = ? AND recipient_user_id = ?
          RETURNING notification_id, recipient_user_id, notification_type, title, body,
                    entity_type, entity_id, deduplication_key, read_at, created_at'
        );
        $stmt->execute([$now, $notificationId, (int) $authCtx['user_id']]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!is_array($row)) {
            safe_error_response('Notification not found for this account.', 404);
            return;
        }
        json_response(['status' => 'ok', 'notification' => notification_payload($row)], 200);
    } catch (Throwable $e) {
        error_log('Notification read error: ' . get_class($e));
        safe_error_response('Unable to mark notification as read.', 500);
    }
}

function handle_notifications_mark_all_read(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = notification_verify_auth($pdo, $config);
        $now = (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d H:i:s.u');
        $stmt = $pdo->prepare(
            'UPDATE notifications SET read_at = COALESCE(read_at, ?)
              WHERE recipient_user_id = ? AND read_at IS NULL'
        );
        $stmt->execute([$now, (int) $authCtx['user_id']]);
        json_response(['status' => 'ok', 'markedRead' => $stmt->rowCount()], 200);
    } catch (Throwable $e) {
        error_log('Notification mark-all-read error: ' . get_class($e));
        safe_error_response('Unable to mark notifications as read.', 500);
    }
}
