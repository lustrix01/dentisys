<?php

declare(strict_types=1);

// ATT-008 sessions from the weekly schedule. Logic: backend/app/auto_sessions.php.
require_once dirname(__DIR__) . '/app/auto_sessions.php';
require_once __DIR__ . '/FacultyController.php';

/** The Faculty member's own class (locked when asked), or an error response and null. */
function auto_sessions_faculty_class(PDO $pdo, array $authCtx, mixed $csId, bool $lock = false): ?array
{
    $id = faculty_owned_class_id($pdo, (int) $authCtx['user_id'], (string) (int) $csId);
    $class = $id > 0 ? auto_sessions_class_row($pdo, $id, $lock) : null;
    if ($class === null) {
        safe_error_response('Class is not assigned to this faculty member.', 403);
    }
    return $class;
}

function auto_sessions_settings_payload(PDO $pdo, array $class): array
{
    $geofence = attendance_session_bool($class['session_geofence_enabled']);
    return ['status' => 'ok', 'enabled' => attendance_session_bool($class['auto_sessions_enabled']),
        'biometricRequired' => attendance_session_bool($class['session_biometric_required']),
        'geofenceEnabled' => $geofence, 'geofenceRadius' => (int) $class['session_geofence_radius'],
        'missingRoomLocations' => auto_sessions_missing_rooms($pdo, class_meetings_read($pdo, $class))];
}

function handle_auto_sessions_get(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = faculty_verify_auth($pdo, $config);
        $class = auto_sessions_faculty_class($pdo, $authCtx, $_GET['csId'] ?? 0);
        if ($class !== null) {
            json_response(auto_sessions_settings_payload($pdo, $class), 200);
        }
    } catch (Throwable $e) {
        error_log('Auto sessions read error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

function handle_auto_sessions_save(): void
{
    $pdo = null;
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = faculty_verify_auth($pdo, $config);
        $data = request_body()['data'] ?? [];
        $context = attendance_session_request_context();
        $context['operation_uuid'] = uuid_v4_string(); // one batch for everything this save revokes or creates
        foreach (['enabled', 'biometricRequired', 'geofenceEnabled'] as $key) {
            if (array_key_exists($key, $data) && !is_bool($data[$key])) {
                throw new ValidationException([$key => 'Choose On or Off.']);
            }
        }
        $pdo->beginTransaction();
        $class = auto_sessions_faculty_class($pdo, $authCtx, $data['csId'] ?? 0, true);
        if ($class === null) {
            $pdo->rollBack();
            return;
        }
        $csId = (int) $class['cs_id'];
        if (academic_class_section_is_past($pdo, $csId)) {
            $pdo->rollBack();
            safe_error_response(academic_view_only_message($pdo, $csId), 409);
            return;
        }
        $radius = $data['geofenceRadius'] ?? $class['session_geofence_radius'];
        if (!is_numeric($radius) || (int) $radius != $radius || $radius < ATTENDANCE_GEOFENCE_RADIUS_MIN_METERS || $radius > ATTENDANCE_GEOFENCE_RADIUS_MAX_METERS) {
            throw new ValidationException(['geofenceRadius' => 'Radius must be a whole number from 50 to 2,000 metres.']);
        }
        $before = ['enabled' => attendance_session_bool($class['auto_sessions_enabled']), 'face' => attendance_session_bool($class['session_biometric_required']),
            'geofence' => attendance_session_bool($class['session_geofence_enabled']), 'radius' => (int) $class['session_geofence_radius']];
        $after = ['enabled' => $data['enabled'] ?? $before['enabled'], 'face' => $data['biometricRequired'] ?? $before['face'],
            'geofence' => $data['geofenceEnabled'] ?? $before['geofence'], 'radius' => (int) $radius];
        $meetings = class_meetings_read($pdo, $class);
        if ($after['geofence'] && ($missing = auto_sessions_missing_rooms($pdo, $meetings)) !== []) {
            throw new ValidationException(['geofenceEnabled' => AUTO_SESSIONS_ROOM_MESSAGE . ' Missing: ' . implode(', ', $missing) . '.']);
        }
        $nowLocal = attendance_session_now_utc()->setTimezone(new DateTimeZone((string) $config['app']['operational_timezone']));
        $turningOn = $after['enabled'] && !$before['enabled'];
        $overlaps = [];
        if ($turningOn) {
            $overlaps = auto_sessions_turn_on_overlaps($pdo, $class, $meetings, $nowLocal);
            if ($overlaps !== [] && ($data['confirmOverlap'] ?? null) !== true) {
                throw new BookingOverlapException($overlaps);
            }
        }
        $pdo->prepare('UPDATE class_sections SET auto_sessions_enabled = ?, session_biometric_required = ?, session_geofence_enabled = ?,
            session_geofence_radius = ?, auto_sessions_topped_up_on = CASE WHEN ? THEN NULL ELSE auto_sessions_topped_up_on END WHERE cs_id = ?')
            ->execute([$after['enabled'] ? 1 : 0, $after['face'] ? 1 : 0, $after['geofence'] ? 1 : 0, $after['radius'], $turningOn ? 1 : 0, $csId]);
        $audit = static fn(string $code, string $text, ?array $b, ?array $a) => audit_record_action($pdo, $config, $authCtx, 'attendance_session', $code, 'class_section',
            (string) $csId, $text . ' ' . audit_class_label($pdo, $csId) . '.', ['scope_cs_id' => $csId, 'before' => $b, 'after' => $a, 'context' => $context, 'operation_uuid' => $context['operation_uuid']]);
        $state = array_diff_key($after, ['enabled' => 1]);
        $class = auto_sessions_class_row($pdo, $csId);
        if ($turningOn) {
            $who = trim((string) ($authCtx['display_name'] ?? '')) ?: 'A user';
            $clock = static fn(string $t): string => (new DateTimeImmutable($t))->format('g:i A');
            booking_overlap_notify($pdo, $overlaps, static fn(array $o): string => "{$who} turned on sessions from the weekly schedule for {$class['cs_name']}: {$o['meeting']['room']}, "
                . (new DateTimeImmutable($o['meeting']['date']))->format('D, M j') . ' ' . $clock($o['meeting']['start']) . '–' . $clock($o['meeting']['end'])
                . ". This overlaps your {$o['className']} " . ($o['kind'] === 'schedule' ? 'regular schedule' : 'session') . '.', 'class_section', $csId);
            $audit('auto_sessions_enabled', 'Turned on sessions from the weekly schedule for', null, $state + ($overlaps === [] ? [] : ['overlaps' => $overlaps]));
            auto_sessions_top_up($pdo, $config, $csId, $context);
        } elseif ($before['enabled'] && !$after['enabled']) {
            $audit('auto_sessions_disabled', 'Turned off sessions from the weekly schedule for', array_diff_key($before, ['enabled' => 1]), null);
            auto_sessions_revoke($pdo, $config, $authCtx, $context, auto_sessions_upcoming($pdo, $config, $csId), 'Sessions from the weekly schedule turned off');
        } elseif ($after['enabled'] && ($changed = audit_changed_fields(array_diff_key($before, ['enabled' => 1]), $state)) !== null) {
            $audit('auto_sessions_updated', 'Changed the weekly schedule session settings of', $changed[0], $changed[1]);
            auto_sessions_apply_settings($pdo, $class, auto_sessions_upcoming($pdo, $config, $csId));
        }
        $payload = auto_sessions_settings_payload($pdo, $class);
        $pdo->commit();
        json_response($payload, 200);
    } catch (ValidationException $e) {
        $pdo instanceof PDO && $pdo->inTransaction() && $pdo->rollBack();
        validation_error_response($e->getErrors());
    } catch (AttendanceSessionException $e) {
        $pdo instanceof PDO && $pdo->inTransaction() && $pdo->rollBack();
        attendance_session_exception_response($e);
    } catch (Throwable $e) {
        $pdo instanceof PDO && $pdo->inTransaction() && $pdo->rollBack();
        error_log('Auto sessions save error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}
