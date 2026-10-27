<?php

declare(strict_types=1);

/**
 * Audit read side (docs/contracts/audit-logging.md sections 3-5, rules R12/R13).
 * One table of action codes (label, area, Dean-visible, sign-in row) and one
 * reader used by the Dean Audit Trail, the Dashboard, and Faculty/Secretary
 * My Activity. Nothing here writes or alters a stored row.
 */

const AUDIT_AREA_SECURITY = 'Sign-in & security';
const AUDIT_AREA_PEOPLE = 'People & accounts';
const AUDIT_AREA_SETTINGS = 'Settings & terms';
const AUDIT_AREA_GRADING = 'Grading';
const AUDIT_AREA_ATTENDANCE = 'Attendance';
const AUDIT_AREA_RETENTION = 'Retention';
const AUDIT_AREA_BIOMETRICS = 'Biometrics';
const AUDIT_PAGE_SIZE = 50;
// Dean attention cards: each card counts, and filters to, exactly these codes.
const AUDIT_ATTENTION_CARDS = [
    'failedSignIns' => ['login_failed', 'google_login_denied'],
    'securityAlerts' => ['refresh_reuse_detected', 'mfa_verification_failed'],
    'mfaTurnedOff' => ['mfa_revoked'],
];
const AUDIT_TIMEZONE = 'Asia/Manila';
// shortcut: a batch lists at most 500 members, larger batches still report the full count; raise if a roster ever exceeds it.
const AUDIT_BATCH_MEMBER_CAP = 500;

/** Codes that are stored but never shown on any screen (contract 5.1 STOP, 5.5 face-check evidence). */
const AUDIT_HIDDEN_CODES = ['refresh_rotation', 'biometric_attendance_recorded'];

/** code => [label, area, Dean sees it, sign-in row (behind the Sign-ins chip in My Activity)]. */
function audit_catalogue(): array
{
    static $map = null;
    if ($map !== null) {
        return $map;
    }
    $S = AUDIT_AREA_SECURITY; $P = AUDIT_AREA_PEOPLE; $T = AUDIT_AREA_SETTINGS; $G = AUDIT_AREA_GRADING;
    $A = AUDIT_AREA_ATTENDANCE; $R = AUDIT_AREA_RETENTION; $B = AUDIT_AREA_BIOMETRICS;
    $map = [
        // 5.1 Sign-in and account security
        'login_success' => ['Signed in', $S, false, true],
        'login_failed' => ['Sign-in failed', $S, true, true],
        'logout' => ['Signed out', $S, false, true],
        'google_login_success' => ['Signed in with Google', $S, false, true],
        'google_login_denied' => ['Google sign-in refused', $S, true, true],
        'google_link_success' => ['Google account linked', $S, true, false],
        'google_profile_link_success' => ['Google account linked', $S, true, false],
        'google_link_denied' => ['Google link refused', $S, true, false],
        'google_profile_link_denied' => ['Google link refused', $S, true, false],
        'password_changed' => ['Password changed', $S, true, false],
        'password_reset_requested' => ['Password reset requested', $S, true, false],
        'password_reset_completed' => ['Password reset completed', $S, true, false],
        'mfa_enrollment_completed' => ['2FA turned on', $S, true, false],
        'mfa_verification_success' => ['2FA code accepted', $S, false, true],
        'mfa_recovery_success' => ['Recovery code used', $S, false, true],
        'mfa_verification_failed' => ['Wrong 2FA or recovery code', $S, true, true],
        'mfa_recovery_codes_regenerated' => ['Recovery codes regenerated', $S, true, false],
        'mfa_revoked' => ['2FA turned off', $S, true, false],
        'refresh_reuse_detected' => ['Stolen sign-in token blocked', $S, true, true],
        'profile_updated' => ['Name changed', $S, true, false],
        // Old steps that are no longer written (R13): labelled, own view only, behind the Sign-ins chip.
        'google_link_required' => ['Google link needed', $S, false, true],
        'mfa_enrollment_started' => ['2FA setup started', $S, false, true],
        'development_mock_student_session_created' => ['Development mock sign-in', $S, false, true],
        // 5.2 People, accounts and roles
        'first_dean_invited' => ['First Dean invited', $P, true, false],
        'first_dean_invitation_delivery_failed' => ['First Dean invitation failed', $P, true, false],
        'faculty_invited' => ['Faculty invited', $P, true, false],
        'faculty_invitation_edited' => ['Faculty invitation edited', $P, true, false],
        'faculty_invitation_revoked' => ['Faculty invitation revoked', $P, true, false],
        'faculty_invitation_accepted' => ['Account activated', $P, true, false],
        'secretary_activated' => ['Account activated', $P, true, false],
        'student_activation_completed' => ['Account activated', $P, true, false],
        'student_auth_eligibility_denied' => ['Student activation refused', $P, true, false],
        'student_created' => ['Student added', $P, true, false],
        'student_update' => ['Student details changed', $P, true, false],
        'student_enroll' => ['Student enrolled in class', $P, true, false],
        'student_unenroll' => ['Student removed from class', $P, true, false],
        'student_invited' => ['Student invited', $P, true, false],
        'secretary_invited' => ['Secretary invited', $P, true, false],
        'secretary_invitation_revoked' => ['Secretary invitation revoked', $P, true, false],
        'secretary_appointed' => ['Secretary appointed', $P, true, false],
        'secretary_appointment_ended' => ['Secretary appointment ended', $P, true, false],
        'class_create' => ['Class created', $P, true, false],
        'class_update' => ['Class changed', $P, true, false],
        'class_archive' => ['Class archived', $P, true, false],
        'class_restore' => ['Class restored', $P, true, false],
        // 5.3 Settings and terms
        'system_settings_updated' => ['System settings changed', $T, true, false],
        'academic_term_created' => ['Term added', $T, true, false],
        'academic_term_updated' => ['Term changed', $T, true, false],
        'academic_term_deleted' => ['Term deleted', $T, true, false],
        'academic_terms_copied' => ['Terms copied to next year', $T, true, false],
        // 5.4 Grading (own view only)
        'grading_config_update' => ['Grade weights changed', $G, false, false],
        'assessment_created' => ['Assessment added', $G, false, false],
        'assessment_updated' => ['Assessment changed', $G, false, false],
        'assessment_deleted' => ['Assessment deleted', $G, false, false],
        'assessment_scores_saved' => ['Scores changed', $G, false, false],
        'grades_recomputed' => ['Grades recomputed', $G, false, false],
        // 5.5 Attendance (own view only)
        'attendance_session_started' => ['Attendance session created', $A, false, false],
        'attendance_session_updated' => ['Attendance session changed', $A, false, false],
        'attendance_session_ended' => ['Attendance session ended', $A, false, false],
        'attendance_session_revoked' => ['Attendance session revoked', $A, false, false],
        'attendance_session_auto_opened' => ['Session opened automatically', $A, false, false],
        'attendance_session_auto_ended' => ['Session ended automatically', $A, false, false],
        'biometric_attendance_recorded' => ['Attendance recorded by face check', $A, false, false],
        'secretary_attendance_override' => ['Attendance set by Secretary', $A, false, false],
        'faculty_attendance_change' => ['Attendance corrected by Faculty', $A, false, false],
        'excused_requested' => ['Excused requested', $A, false, false],
        'excused_approved' => ['Excused approved', $A, false, false],
        'excused_rejected' => ['Excused rejected', $A, false, false],
        // 5.6 Retention (own view only)
        'retention_remedial_save' => ['Remedial attempt recorded', $R, false, false],
        'cost_recovery_recorded' => ['Cost recovery result recorded', $R, false, false],
        'watchlist_unlock' => ['Midterm Watchlist unlocked', $R, false, false],
        // 5.7 Biometrics
        'biometric_consent_granted' => ['Face-check consent given', $B, true, false],
        'biometric_consent_revoked' => ['Face-check consent withdrawn', $B, true, false],
        'biometric_enrollment_started' => ['Face enrolment started', $B, false, false],
        'biometric_enrollment_succeeded' => ['Face enrolment succeeded', $B, false, false],
        'biometric_enrollment_failed' => ['Face enrolment failed', $B, false, false],
        'biometric_enrollment_revoked' => ['Face enrolment deleted', $B, true, false],
        'biometric_enrollment_revoked_by_dean' => ['Face enrolment deleted', $B, true, false],
        'biometric_enrollment_revoked_inactive' => ['Face enrolment deleted', $B, true, false],
        'biometric_enrollment_expired' => ['Face enrolment deleted', $B, true, false],
        'biometric_verification_failed' => ['Face check failed', $B, false, false],
    ];
    return $map;
}

/** Label, area, Dean-visibility and sign-in flag of a code. Unknown codes: humanised, area from module, own view only. */
function audit_code_info(string $code, ?string $module = null): array
{
    $known = audit_catalogue()[$code] ?? null;
    if ($known !== null) {
        return ['label' => $known[0], 'area' => $known[1], 'deanVisible' => $known[2], 'isSignIn' => $known[3]];
    }
    $byModule = [
        'auth' => AUDIT_AREA_SECURITY, 'mfa' => AUDIT_AREA_SECURITY, 'settings' => AUDIT_AREA_SETTINGS,
        'grading' => AUDIT_AREA_GRADING, 'faculty_grading' => AUDIT_AREA_GRADING,
        'attendance_session' => AUDIT_AREA_ATTENDANCE, 'faculty_attendance' => AUDIT_AREA_ATTENDANCE, 'secretary_attendance' => AUDIT_AREA_ATTENDANCE,
        'retention' => AUDIT_AREA_RETENTION, 'faculty_retention' => AUDIT_AREA_RETENTION,
        'student_biometric' => AUDIT_AREA_BIOMETRICS,
    ];
    return [
        'label' => ucfirst(str_replace('_', ' ', $code)),
        'area' => $byModule[(string) $module] ?? AUDIT_AREA_PEOPLE,
        'deanVisible' => false,
        'isSignIn' => false,
    ];
}

/** Quoted SQL list of known codes matching a predicate; codes come from the constant table, never from input. */
function audit_sql_codes(callable $keep): string
{
    $codes = array_keys(array_filter(audit_catalogue(), $keep));
    return $codes === [] ? "''" : "'" . implode("','", $codes) . "'";
}

function audit_areas_for(string $role): array
{
    return match ($role) {
        'admin' => [AUDIT_AREA_SECURITY, AUDIT_AREA_PEOPLE, AUDIT_AREA_SETTINGS, AUDIT_AREA_BIOMETRICS],
        'secretary' => [AUDIT_AREA_SECURITY, AUDIT_AREA_PEOPLE, AUDIT_AREA_ATTENDANCE, AUDIT_AREA_BIOMETRICS],
        default => [AUDIT_AREA_SECURITY, AUDIT_AREA_PEOPLE, AUDIT_AREA_GRADING, AUDIT_AREA_ATTENDANCE, AUDIT_AREA_RETENTION],
    };
}

/** Validates the query string of the three audit endpoints (422 on bad values). */
function audit_read_params(array $get, string $role): array
{
    $errors = [];
    $date = static function (string $key) use ($get, &$errors): ?string {
        $v = trim((string) ($get[$key] ?? ''));
        if ($v === '') {
            return null;
        }
        $ok = preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $v, $m) === 1 && checkdate((int) $m[2], (int) $m[3], (int) $m[1]);
        if (!$ok) {
            $errors[] = ['field' => $key, 'message' => 'Date must be YYYY-MM-DD.'];
            return null;
        }
        return $v;
    };
    $from = $date('from');
    $to = $date('to');
    if ($from !== null && $to !== null && $from > $to) {
        $errors[] = ['field' => 'from', 'message' => 'From date must not be after the To date.'];
    }
    $q = trim((string) ($get['q'] ?? ''));
    if (mb_strlen($q) > 100) {
        $errors[] = ['field' => 'q', 'message' => 'Search must be 100 characters or fewer.'];
    }
    $area = trim((string) ($get['area'] ?? ''));
    if ($area !== '' && !in_array($area, audit_areas_for($role), true)) {
        $errors[] = ['field' => 'area', 'message' => 'Unknown area.'];
    }
    $status = trim((string) ($get['status'] ?? ''));
    if ($status !== '' && !in_array($status, ['Success', 'Warning', 'Failed'], true)) {
        $errors[] = ['field' => 'status', 'message' => 'Status must be Success, Warning or Failed.'];
    }
    $filterRole = trim((string) ($get['role'] ?? ''));
    if ($role === 'admin' && $filterRole !== '' && !in_array($filterRole, ['admin', 'faculty', 'secretary', 'student', 'system'], true)) {
        $errors[] = ['field' => 'role', 'message' => 'Unknown role.'];
    }
    $cls = trim((string) ($get['cls'] ?? ''));
    if ($role === 'faculty' && $cls !== '' && preg_match('/^[1-9]\d{0,9}$/', $cls) !== 1) {
        $errors[] = ['field' => 'cls', 'message' => 'Class must be a class id.'];
    }
    $card = trim((string) ($get['card'] ?? ''));
    if ($role === 'admin' && $card !== '' && !array_key_exists($card, AUDIT_ATTENTION_CARDS)) {
        $errors[] = ['field' => 'card', 'message' => 'Unknown attention card.'];
    }
    $signins = (string) ($get['signins'] ?? '');
    if (!in_array($signins, ['', '0', '1'], true)) {
        $errors[] = ['field' => 'signins', 'message' => 'Sign-ins must be 0 or 1.'];
    }
    $sort = (string) ($get['sort'] ?? 'newest');
    if (!in_array($sort, ['newest', 'oldest'], true)) {
        $errors[] = ['field' => 'sort', 'message' => 'Sort must be newest or oldest.'];
    }
    $page = (string) ($get['page'] ?? '1');
    if (preg_match('/^[1-9]\d{0,5}$/', $page) !== 1) {
        $errors[] = ['field' => 'page', 'message' => 'Page must be a positive whole number.'];
    }
    if ($errors !== []) {
        throw new ValidationException($errors);
    }

    return [
        'q' => $q, 'area' => $area, 'from' => $from, 'to' => $to, 'status' => $status,
        'role' => $role === 'admin' ? $filterRole : '', 'cls' => $role === 'faculty' ? $cls : '',
        'card' => $role === 'admin' ? $card : '',
        'signins' => $signins === '1', 'sort' => $sort === 'oldest' ? 'ASC' : 'DESC', 'page' => (int) $page,
        'pageSize' => AUDIT_PAGE_SIZE,
    ];
}

/** ISO-8601 in Asia/Manila (+08:00) from a stored UTC timestamp. */
function audit_manila_iso(string $utc): string
{
    try {
        return (new DateTimeImmutable($utc, new DateTimeZone('UTC')))
            ->setTimezone(new DateTimeZone(AUDIT_TIMEZONE))->format('Y-m-d\TH:i:sP');
    } catch (Throwable) {
        return $utc;
    }
}

/**
 * The visible, filtered, grouped audit entries for one viewer.
 * $viewer: ['user_id' => int, 'role' => 'admin'|'faculty'|'secretary']; $p: audit_read_params() result.
 */
function audit_read_entries(PDO $pdo, array $viewer, array $p): array
{
    $role = (string) $viewer['role'];
    $me = (int) $viewer['user_id'];
    $dateSql = "DATE((e.occurred_at AT TIME ZONE 'UTC') AT TIME ZONE '" . AUDIT_TIMEZONE . "')";

    if ($role === 'faculty' && $p['cls'] !== '') {
        $own = $pdo->prepare('SELECT 1 FROM class_sections WHERE cs_id = ? AND instructor_user_id = ?');
        $own->execute([(int) $p['cls'], $me]);
        if (!$own->fetchColumn()) {
            throw new ValidationException([['field' => 'cls', 'message' => 'Class not found among your classes.']]);
        }
    }

    // Visibility first (applies to old rows too), then the viewer's filters.
    $hidden = "'" . implode("','", AUDIT_HIDDEN_CODES) . "'";
    $signinCodes = audit_sql_codes(static fn(array $c): bool => $c[3]);
    $where = ["e.action_code NOT IN ({$hidden})"];
    $params = [];
    if ($role === 'admin') {
        // Overview codes always (failures and alerts included); anything else only the Dean's own, sign-ins behind the chip.
        $deanCodes = audit_sql_codes(static fn(array $c): bool => $c[2]);
        $ownSql = 'e.actor_user_id = ?' . ($p['signins'] ? '' : " AND e.action_code NOT IN ({$signinCodes})");
        $where[] = "(e.action_code IN ({$deanCodes}) OR ({$ownSql}))";
        $params[] = $me;
    } else {
        $where[] = 'e.actor_user_id = ?' . ($p['signins'] ? '' : " AND e.action_code NOT IN ({$signinCodes})");
        $params[] = $me;
    }
    $dateWhere = [];
    $dateParams = [];
    if ($p['from'] !== null) {
        $dateWhere[] = "{$dateSql} >= ?";
        $dateParams[] = $p['from'];
    }
    if ($p['to'] !== null) {
        $dateWhere[] = "{$dateSql} <= ?";
        $dateParams[] = $p['to'];
    }
    array_push($where, ...$dateWhere);
    array_push($params, ...$dateParams);
    if ($p['area'] !== '') {
        $areaCodes = audit_sql_codes(static fn(array $c): bool => $c[1] === $p['area']);
        $where[] = "e.action_code IN ({$areaCodes})"; // shortcut: unknown (unmapped) codes only show with no Area filter.
    }
    if (($p['card'] ?? '') !== '') {
        $where[] = "e.action_code IN ('" . implode("','", AUDIT_ATTENTION_CARDS[$p['card']]) . "')";
    }
    if ($p['status'] !== '') {
        $where[] = 'e.event_status = ?';
        $params[] = $p['status'];
    }
    if ($p['role'] !== '') {
        $where[] = $p['role'] === 'system' ? "(e.actor_role IS NULL OR e.actor_role = 'system')" : 'e.actor_role = ?';
        if ($p['role'] !== 'system') {
            $params[] = $p['role'];
        }
    }
    if ($p['cls'] !== '') {
        $where[] = 'e.scope_cs_id = ?';
        $params[] = (int) $p['cls'];
    }
    $whereSql = implode(' AND ', $where);
    $gkey = 'COALESCE(e.operation_uuid::text, e.event_id::text)';

    // Search: any member of a group may match, so it is a HAVING over the group.
    $having = '';
    $havingParams = [];
    if ($p['q'] !== '') {
        $like = '%' . addcslashes($p['q'], '\\%_') . '%';
        $labelCodes = array_keys(array_filter(audit_catalogue(), static fn(array $c): bool => stripos($c[0], $p['q']) !== false));
        $labelSql = $labelCodes === [] ? 'FALSE' : "e.action_code IN ('" . implode("','", $labelCodes) . "')";
        $having = "HAVING bool_or(e.description ILIKE ? OR e.actor_display_name ILIKE ? OR e.actor_username ILIKE ? OR e.after_state_json ILIKE ? OR {$labelSql})";
        $havingParams = [$like, $like, $like, $like];
    }
    $groupSql = "SELECT {$gkey} AS gkey, MAX(e.occurred_at) AS last_at, MAX(e.event_id) AS last_id, COUNT(*) AS n
                   FROM audit_events e WHERE {$whereSql} GROUP BY 1 {$having}";
    $groupParams = array_merge($params, $havingParams);

    $totalStmt = $pdo->prepare("SELECT COUNT(*) FROM ({$groupSql}) g");
    $totalStmt->execute($groupParams);
    $total = (int) $totalStmt->fetchColumn();

    $dir = $p['sort'];
    $pageSize = (int) $p['pageSize'];
    $groupStmt = $pdo->prepare(
        "{$groupSql} ORDER BY last_at {$dir}, last_id {$dir} LIMIT {$pageSize} OFFSET " . (($p['page'] - 1) * $pageSize)
    );
    $groupStmt->execute($groupParams);
    $groups = $groupStmt->fetchAll(PDO::FETCH_ASSOC);

    $entries = [];
    if ($groups !== []) {
        $keys = '{' . implode(',', array_map(static fn(array $g): string => '"' . $g['gkey'] . '"', $groups)) . '}';
        $rowStmt = $pdo->prepare(
            "SELECT * FROM (
                SELECT e.event_id, e.occurred_at, e.actor_user_id, e.actor_username, e.actor_role, e.actor_display_name,
                       e.scope_cs_id, e.module_code, e.action_code, e.event_status, e.target_type, e.target_id,
                       e.description, e.reason, e.ip_address, e.user_agent, e.operation_uuid, e.endpoint,
                       e.before_state_json, e.after_state_json, {$gkey} AS gkey,
                       ROW_NUMBER() OVER (PARTITION BY {$gkey} ORDER BY e.occurred_at DESC, e.event_id DESC) AS rn
                  FROM audit_events e
                 WHERE {$whereSql} AND {$gkey} = ANY (CAST(? AS TEXT[]))
             ) x WHERE rn <= " . AUDIT_BATCH_MEMBER_CAP . ' ORDER BY occurred_at DESC, event_id DESC'
        );
        $rowStmt->execute(array_merge($params, [$keys]));
        $byGroup = [];
        foreach ($rowStmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $byGroup[$row['gkey']][] = $row;
        }
        $lookups = audit_read_lookups($pdo, array_merge(...array_values($byGroup)));
        foreach ($groups as $g) {
            if (isset($byGroup[$g['gkey']])) {
                $entries[] = audit_build_entry($byGroup[$g['gkey']], (int) $g['n'], $lookups, $role === 'admin');
            }
        }
    }

    $result = [
        'entries' => $entries, 'total' => $total, 'page' => (int) $p['page'], 'pageSize' => $pageSize,
        'areas' => audit_areas_for($role),
    ];
    if ($role === 'admin') {
        // Attention cards: same date range, every Dean-visible failure/alert (not narrowed by the other filters).
        $attWhere = array_merge(["e.action_code IN ('login_failed','google_login_denied','refresh_reuse_detected','mfa_verification_failed','mfa_revoked')"], $dateWhere);
        $att = $pdo->prepare('SELECT e.action_code, COUNT(*) FROM audit_events e WHERE ' . implode(' AND ', $attWhere) . ' GROUP BY 1');
        $att->execute($dateParams);
        $c = $att->fetchAll(PDO::FETCH_KEY_PAIR);
        $result['attention'] = [
            'failedSignIns' => (int) ($c['login_failed'] ?? 0) + (int) ($c['google_login_denied'] ?? 0),
            'securityAlerts' => (int) ($c['refresh_reuse_detected'] ?? 0) + (int) ($c['mfa_verification_failed'] ?? 0),
            'mfaTurnedOff' => (int) ($c['mfa_revoked'] ?? 0),
        ];
    }

    return $result;
}

/** Batched name lookups for a page of rows (one query per kind, never per row). */
function audit_read_lookups(PDO $pdo, array $rows): array
{
    $ids = ['class' => [], 'assessment' => [], 'student' => [], 'enrollment' => [], 'session' => [], 'record' => [], 'user' => [], 'xr' => []];
    $typeKey = ['class_section' => 'class', 'assessment' => 'assessment', 'student' => 'student', 'enrollment' => 'enrollment',
        'attendance_session' => 'session', 'attendance_record' => 'record', 'attendance_excused_request' => 'xr', 'user_account' => 'user',
        'student_biometric_profile' => 'student'];
    foreach ($rows as $r) {
        if ($r['scope_cs_id'] !== null) {
            $ids['class'][(int) $r['scope_cs_id']] = true;
        }
        $key = $typeKey[(string) $r['target_type']] ?? null;
        if ($key !== null && ctype_digit((string) $r['target_id'])) {
            $ids[$key][(int) $r['target_id']] = true;
        }
    }
    $fetch = static function (string $sql, array $set) use ($pdo): array {
        if ($set === []) {
            return [];
        }
        $stmt = $pdo->prepare($sql);
        $stmt->execute(['{' . implode(',', array_keys($set)) . '}']);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    };
    $lk = ['class' => [], 'assessment' => [], 'student' => [], 'enrollment' => [], 'session' => [], 'record' => [], 'user' => [], 'xr' => []];
    $any = 'ANY (CAST(? AS INTEGER[]))';

    foreach ($fetch("SELECT assessment_id, title, grading_period, cs_id FROM assessments WHERE assessment_id = {$any}", $ids['assessment']) as $a) {
        $lk['assessment'][(int) $a['assessment_id']] = $a;
        $ids['class'][(int) $a['cs_id']] = true;
    }
    foreach ($fetch("SELECT session_id, session_code, session_date, cs_id FROM attendance_sessions WHERE session_id = {$any}", $ids['session']) as $s) {
        $lk['session'][(int) $s['session_id']] = $s;
        $ids['class'][(int) $s['cs_id']] = true;
    }
    foreach ($fetch("SELECT record_id, enrollment_id, session_date FROM attendance_records WHERE record_id = {$any}", $ids['record']) as $rec) {
        $lk['record'][(int) $rec['record_id']] = $rec;
        $ids['enrollment'][(int) $rec['enrollment_id']] = true;
    }
    foreach ($fetch("SELECT request_id, enrollment_id FROM attendance_excused_requests WHERE request_id = {$any}", $ids['xr']) as $xr) {
        $lk['xr'][(int) $xr['request_id']] = (int) $xr['enrollment_id'];
        $ids['enrollment'][(int) $xr['enrollment_id']] = true;
    }
    foreach ($fetch("SELECT enrollment_id, student_id, cs_id FROM enrollments WHERE enrollment_id = {$any}", $ids['enrollment']) as $en) {
        $lk['enrollment'][(int) $en['enrollment_id']] = $en;
        $ids['class'][(int) $en['cs_id']] = true;
        $ids['student'][(int) $en['student_id']] = true;
    }
    foreach ($fetch("SELECT cs_id, cs_name FROM class_sections WHERE cs_id = {$any}", $ids['class']) as $c) {
        $lk['class'][(int) $c['cs_id']] = (string) $c['cs_name'];
    }
    $students = $fetch(
        "SELECT s.student_id, s.student_number,
                COALESCE(pi.name_prefix, s.name_prefix) AS name_prefix, COALESCE(pi.first_name, s.first_name) AS first_name,
                COALESCE(pi.middle_name, s.middle_name) AS middle_name, COALESCE(pi.last_name, s.last_name) AS last_name,
                COALESCE(pi.name_suffix, s.name_suffix) AS name_suffix
           FROM students s LEFT JOIN person_identities pi ON pi.person_id = s.person_id
          WHERE s.student_id = {$any}",
        $ids['student']
    );
    foreach ($students as $s) {
        $lk['student'][(int) $s['student_id']] = account_identity_display_name($s) . ' (' . $s['student_number'] . ')';
    }
    foreach ($fetch("SELECT user_id, display_name, login_email FROM user_accounts WHERE user_id = {$any}", $ids['user']) as $u) {
        $lk['user'][(int) $u['user_id']] = trim((string) $u['display_name']) !== '' ? (string) $u['display_name'] : (string) $u['login_email'];
    }

    return $lk;
}

function audit_json(?string $json): ?array
{
    if ($json === null || $json === '') {
        return null;
    }
    $v = json_decode($json, true);
    return is_array($v) ? $v : null;
}

/** "Name (number)" from a labelled change entry (studentName/studentNumber), else "Student #id". */
function audit_change_person(array $c): string
{
    $name = trim((string) ($c['studentName'] ?? ''));
    return $name !== '' ? $name . ' (' . ($c['studentNumber'] ?? '') . ')' : 'Student #' . ($c['studentId'] ?? '?');
}

function audit_value(mixed $v): string
{
    if ($v === null || $v === '') {
        return '—';
    }
    return is_bool($v) ? ($v ? 'Yes' : 'No') : (string) $v;
}

function audit_field_name(string $key): string
{
    return ucfirst(strtolower(trim(preg_replace('/([a-z])([A-Z])/', '$1 $2', str_replace('_', ' ', $key)))));
}

/** Scalar leaves of a state as path => text; ids and hashes are skipped (they are not readable). */
function audit_flatten(?array $state, string $path = ''): array
{
    $out = [];
    foreach ($state ?? [] as $k => $v) {
        if (is_string($k) && preg_match('/(^id$|_id$|Id$|_hash$|uuid)/i', $k) === 1) {
            continue;
        }
        $label = is_int($k) ? '#' . ($k + 1) : audit_field_name((string) $k);
        $name = $path === '' ? $label : $path . ' · ' . $label;
        if (!is_array($v)) {
            $out[$name] = $v;
        } elseif ($v === [] || (array_is_list($v) && count(array_filter($v, 'is_scalar')) === count($v))) {
            $out[$name] = implode(', ', array_map('strval', $v));
        } elseif (array_is_list($v) && count($v) > 5) {
            $out[$name] = count($v) . ' items';
        } else {
            $out += audit_flatten($v, $name);
        }
    }
    return $out;
}

/** Field / Before / After lines stored in the row (R4, R13: old rows show what they stored). */
function audit_row_changes(array $r, ?array $before, ?array $after): array
{
    $code = (string) $r['action_code'];
    $line = static fn(string $f, mixed $b, mixed $a): array => ['field' => $f, 'before' => audit_value($b), 'after' => audit_value($a)];
    $out = [];
    if ($code === 'assessment_scores_saved' || $code === 'grades_recomputed') {
        foreach ($after['changes'] ?? [] as $c) {
            $out[] = $line(audit_change_person($c) . ' · ' . ($c['assessment'] ?? 'Assessment') . ' · ' . (($c['field'] ?? '') === 'remarks' ? 'Remark' : 'Score'), $c['before'] ?? null, $c['after'] ?? null);
        }
        foreach ($after['gradeChanges'] ?? [] as $g) {
            $out[] = $line(audit_change_person($g) . ' · ' . ($g['period'] ?? 'Final') . ' grade', $g['before'] ?? null, $g['after'] ?? null);
        }
        return $out;
    }
    if ($code === 'assessment_deleted') {
        $out[] = $line('Assessment', $before['title'] ?? null, 'Deleted');
        foreach ($before['scores'] ?? [] as $s) {
            $out[] = $line(audit_change_person($s) . ' · Score', ($s['score'] ?? null) . (($s['remarks'] ?? '') !== '' ? ' (' . $s['remarks'] . ')' : ''), 'Deleted');
        }
        return $out;
    }
    if (str_starts_with($code, 'biometric_consent_')) {
        $b = $before['consent_status'] ?? null;
        $a = $after['consent_status'] ?? null;
        return $a === null ? [] : [$line('Face-check consent', $b === $a ? null : $b, $a)]; // old rows stored the same state twice
    }
    if ($code === 'grading_config_update') {
        $weights = static function (?array $s): array {
            $w = [];
            foreach ($s['categories'] ?? [] as $c) {
                $w[trim(($c['name'] ?? '') . ' (' . ($c['gradingPeriod'] ?? '') . ')')] = rtrim(rtrim((string) ($c['weight'] ?? ''), '0'), '.') . '%';
            }
            return $w;
        };
        $b = $weights($before);
        foreach ($weights($after) as $name => $w) {
            if (($b[$name] ?? null) !== $w) {
                $out[] = $line($name . ' weight', $b[$name] ?? null, $w);
            }
        }
        return $out;
    }
    $b = audit_flatten($before);
    $a = audit_flatten($after);
    foreach (array_unique(array_merge(array_keys($b), array_keys($a))) as $k) {
        if (($b[$k] ?? null) != ($a[$k] ?? null)) {
            $out[] = $line((string) $k, $b[$k] ?? null, $a[$k] ?? null);
        }
        if (count($out) >= 200) {
            break;
        }
    }
    return $out;
}

/** One-line "Change" column. '—' when nothing changed or the row stored no before/after. */
function audit_row_change_text(array $r, ?array $before, ?array $after, array $changes): string
{
    $code = (string) $r['action_code'];
    $n = fn(int $count, string $one, string $many): string => $count . ' ' . ($count === 1 ? $one : $many);
    if ($code === 'assessment_scores_saved') {
        if (isset($after['savedCount'])) { // old row
            return (int) $after['savedCount'] . ' saved, ' . (int) ($after['clearedCount'] ?? 0) . ' cleared';
        }
        $cells = count($after['changes'] ?? []);
        $grades = count($after['gradeChanges'] ?? []);
        return implode(', ', array_filter([
            $cells > 0 ? $n($cells, 'score or remark changed', 'scores or remarks changed') : null,
            $grades > 0 ? $n($grades, 'grade moved', 'grades moved') : null,
        ])) ?: '—';
    }
    if ($code === 'grades_recomputed') {
        if (isset($after['gradeChanges'])) {
            return $n(count($after['gradeChanges']), 'grade changed', 'grades changed');
        }
        return isset($after['computed'], $after['total']) ? (int) $after['computed'] . ' of ' . (int) $after['total'] . ' computed' : '—';
    }
    if ($code === 'assessment_deleted') {
        return isset($before['scoreCount']) ? $n((int) $before['scoreCount'], 'score deleted', 'scores deleted') : '—';
    }
    if ($before === null || $before === [] || $changes === []) {
        return '—';
    }
    if (count($changes) === 1) {
        $c = $changes[0];
        return mb_strimwidth($c['field'] . ': ' . $c['before'] . ' → ' . $c['after'], 0, 90, '…');
    }
    return count($changes) . ' fields changed';
}

/** "Record" column: a readable name, or "<Target type> #<id>" when the target is gone or the row is old (R13). */
function audit_row_record(array $r, array $lk, ?array $before, ?array $after): string
{
    if (audit_code_info((string) $r['action_code'])['isSignIn']) {
        return '—'; // the account itself is the Who
    }
    $type = (string) $r['target_type'];
    $id = (string) $r['target_id'];
    $key = ctype_digit($id) ? (int) $id : 0;
    $class = static fn(?int $cs): ?string => $cs !== null && isset($lk['class'][$cs]) ? $lk['class'][$cs] : null;
    $scope = $r['scope_cs_id'] !== null ? (int) $r['scope_cs_id'] : null;
    $join = static fn(?string ...$parts): string => implode(' · ', array_filter($parts, static fn($p): bool => $p !== null && $p !== ''));
    $fallback = static fn(): string => $id === '' ? '—' : ucfirst(str_replace('_', ' ', $type)) . ' #' . $id;

    switch ($type) {
        case 'class_section':
            return $class($key) ?? $fallback();
        case 'assessment':
            $a = $lk['assessment'][$key] ?? null;
            $title = $a['title'] ?? ($before['title'] ?? ($after['title'] ?? ($after['changes'][0]['assessment'] ?? null)));
            if ($title === null) {
                return $fallback();
            }
            $period = $a['grading_period'] ?? ($before['gradingPeriod'] ?? ($after['gradingPeriod'] ?? null));
            return $join($title . ($period ? " ({$period})" : ''), $class($a !== null ? (int) $a['cs_id'] : $scope));
        case 'student':
        case 'student_biometric_profile':
            return isset($lk['student'][$key]) ? $join($lk['student'][$key], $class($scope)) : $fallback();
        case 'enrollment':
            $en = $lk['enrollment'][$key] ?? null;
            return $en !== null ? $join($lk['student'][(int) $en['student_id']] ?? null, $class((int) $en['cs_id'])) : $fallback();
        case 'attendance_session':
            $s = $lk['session'][$key] ?? null;
            return $s !== null ? $join((string) $s['session_code'], $class((int) $s['cs_id'])) : $fallback();
        case 'attendance_record':
            $rec = $lk['record'][$key] ?? null;
            $en = $rec !== null ? ($lk['enrollment'][(int) $rec['enrollment_id']] ?? null) : null;
            return $en !== null ? $join($lk['student'][(int) $en['student_id']] ?? null, $class((int) $en['cs_id']), (string) $rec['session_date']) : $fallback();
        case 'attendance_excused_request':
            $en = isset($lk['xr'][$key]) ? ($lk['enrollment'][$lk['xr'][$key]] ?? null) : null;
            $name = $en !== null ? preg_replace('/ \([^()]*\)$/', '', $lk['student'][(int) $en['student_id']] ?? '') : '';
            return $en !== null && $name !== '' ? $join($name, $class((int) $en['cs_id'])) : $fallback();
        case 'user_account':
            return $lk['user'][$key] ?? $fallback();
        case 'grading_config':
            $c = $after['course']['code'] ?? null;
            return $c !== null ? $join($c, trim(($after['semester'] ?? '') . ' ' . ($after['schoolYear'] ?? ''))) : $fallback();
        case 'faculty_classes':
            return 'All classes';
        case 'academic_term':
            $t = $after ?? $before;
            return isset($t['school_year']) ? $join((string) $t['school_year'], $t['semester'] ?? null) : $fallback();
        case 'security_token':
            if (preg_match('/invitation for (.+?) \(/', (string) $r['description'], $m) === 1) {
                return $m[1];
            }
            return $class($scope) ?? '—';
        case 'session':
        case 'google_identity':
        case '':
            return '—';
        default:
            return $fallback();
    }
}

function audit_who(array $r): array
{
    $code = (string) $r['action_code'];
    $name = trim((string) $r['actor_display_name']);
    $email = (string) ($r['actor_username'] ?? '');
    $role = (string) ($r['actor_role'] ?? '');
    if ($name !== '' || $email !== '') {
        return [[
            'name' => $name !== '' ? $name : $email, 'email' => $email !== '' ? $email : null, 'role' => $role,
            'roleLabel' => ['admin' => 'Dean', 'faculty' => 'Faculty', 'secretary' => 'Secretary', 'student' => 'Student'][$role] ?? ucfirst($role),
        ], null];
    }
    $unknown = $r['actor_user_id'] === null && in_array($code, ['login_failed', 'google_login_denied', 'student_auth_eligibility_denied'], true);
    if (!$unknown) {
        return [null, 'System'];
    }
    $typed = preg_match('/ for (\S+): /', (string) $r['description'], $m) === 1 ? $m[1] : null;
    return [null, $typed !== null ? "Unknown account (typed: {$typed})" : 'Unknown account'];
}

function audit_batch_label(string $code, int $n): string
{
    $many = [
        'student_created' => "Imported {$n} students", 'student_enroll' => "Enrolled {$n} students",
        'student_invited' => "Invited {$n} students", 'secretary_invited' => "Invited {$n} Secretaries",
        'faculty_attendance_change' => "Marked {$n} students Present",
        'biometric_enrollment_expired' => "Deleted {$n} face enrolments", 'biometric_enrollment_revoked_inactive' => "Deleted {$n} face enrolments",
    ];
    return $many[$code] ?? audit_code_info($code)['label'] . " ({$n})";
}

/** One Entry from the rows of one group (newest first). $count is the group's full size after filters. */
function audit_build_entry(array $rows, int $count, array $lk, bool $isDean): array
{
    $head = $rows[0];
    $code = (string) $head['action_code'];
    $info = audit_code_info($code, $head['module_code']);
    $per = static function (array $r) use ($lk): array {
        $before = audit_json($r['before_state_json']);
        $after = audit_json($r['after_state_json']);
        $changes = audit_row_changes($r, $before, $after);
        return [
            'record' => audit_row_record($r, $lk, $before, $after),
            'change' => audit_row_change_text($r, $before, $after, $changes),
            'changes' => $changes, 'before' => $before, 'after' => $after,
        ];
    };
    $h = $per($head);
    [$who, $whoText] = audit_who($head);

    $isBatch = $count > 1 && $head['operation_uuid'] !== null;
    $what = $info['label'];
    $record = $h['record'];
    $change = $h['change'];
    $changes = $h['changes'];
    $batch = null;
    if ($isBatch) {
        $same = count(array_unique(array_column($rows, 'action_code'))) === 1;
        $what = $same ? audit_batch_label($code, $count) : $count . ' changes';
        $scopes = array_unique(array_map(static fn(array $r): string => (string) $r['scope_cs_id'], $rows));
        $record = count($scopes) === 1 && isset($lk['class'][(int) $head['scope_cs_id']]) ? $lk['class'][(int) $head['scope_cs_id']] : $count . ' records';
        if (($head['endpoint'] ?? null) === '/api/faculty/grade-sheet-import') { // grade sheet import (contract G13)
            $what = "Imported grade sheet · {$count} changes" . (str_ends_with($record, ' records') ? '' : " · {$record}");
        }
        $change = $count . ' records';
        $changes = [];
        $batch = ['count' => $count, 'members' => array_map(static function (array $r) use ($per): array {
            $m = $per($r);
            return ['record' => $m['record'], 'change' => $m['change']];
        }, $rows)];
    }
    $status = (string) $head['event_status'];
    $details = [
        'fromWhere' => ['ip' => $head['ip_address'], 'device' => $head['user_agent']],
        'reason' => $head['reason'] ?? ($status !== 'Success' ? ($head['description'] ?: null) : null),
        'changes' => $changes,
    ];
    if ($isDean) {
        $details['technical'] = [
            'actionCode' => $code, 'module' => $head['module_code'], 'operationUuid' => $head['operation_uuid'],
            'before' => $h['before'], 'after' => $h['after'],
        ];
    }

    return [
        'id' => $isBatch ? 'b:' . $head['operation_uuid'] : 'e:' . $head['event_id'],
        'occurredAt' => audit_manila_iso((string) $head['occurred_at']),
        'who' => $who, 'whoText' => $whoText,
        'what' => $what, 'area' => $info['area'], 'record' => $record, 'change' => $change,
        'status' => $status, 'isSignIn' => $info['isSignIn'], 'batch' => $batch, 'details' => $details,
    ];
}
