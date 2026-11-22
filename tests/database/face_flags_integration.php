<?php

declare(strict_types=1);

// Backlog 12.2 & 12.9 face enrolment flags and revocation approval (docs/contracts/face-reenrolment.md, docs/contracts/face-revoke-approval.md).
// Included by the full disposable PostgreSQL suite after superadmin_integration.php.
// Uses an ephemeral local mock sidecar + sidecar-enabled PHP test server for endpoints that talk to the sidecar,
// while exercising all non-sidecar HTTP routes directly against Apache as well. Every row carries $ffTag.
$ffTag = 'ff' . strtolower(bin2hex(random_bytes(3)));
$ffLetters = strtr($ffTag, '0123456789', 'abcdefghij');
$ffConfig = app_config();
$ffContext = ['request_id' => 'ff-' . $ffTag, 'ip_address' => null, 'user_agent' => 'face_flags_integration', 'http_method' => 'POST', 'endpoint' => '/test'];
$ffStudentActor = ['user_id' => null, 'login_email' => null, 'role' => 'student', 'display_name' => 'Ff Student', 'session_id' => null];

$ffNew = static function (string $label) use ($pdo, $ffTag): int {
    $stmt = $pdo->prepare("INSERT INTO students (student_number, first_name, last_name, bu_email, status) VALUES (?, 'Ff', ?, ?, 'active') RETURNING student_id");
    $stmt->execute(["FF-{$ffTag}-{$label}", "{$label}{$ffTag}", "ff-{$ffTag}-" . strtolower($label) . '@bicol-u.edu.ph']);
    $id = (int) $stmt->fetchColumn();
    $pdo->prepare("INSERT INTO biometric_profiles (student_id, consent_status, face_enrolled, enrollment_status) VALUES (?, 'approved', 0, 'not_enrolled')")->execute([$id]);
    return $id;
};
$ffAudit = static function (int $studentId, string $code) use ($pdo, $ffConfig, $ffContext, $ffStudentActor): void {
    $pdo->beginTransaction();
    student_biometric_record_audit($pdo, $ffConfig, $ffStudentActor, $ffContext, $code, $studentId, 'Fixture.', null, null, null);
    $pdo->commit();
};
$ffEnrol = static function (int $studentId, bool $hadFace, bool $everEnrolled, ?bool $matches, ?DateTimeImmutable $now = null) use ($pdo, $ffConfig, $ffContext): void {
    $before = ['protected_object_reference' => $hadFace ? 'sface/' . str_repeat('a', 32) : null, 'enrolled_at' => $everEnrolled ? '2026-01-01 00:00:00' : null];
    $pdo->beginTransaction();
    face_flags_after_enrolment($pdo, $ffConfig, $ffContext, $studentId, $before, $matches, $now ?? new DateTimeImmutable('now', new DateTimeZone('UTC')));
    $pdo->commit();
};
$ffFlags = static function (int $studentId) use ($pdo): array {
    $stmt = $pdo->prepare('SELECT flag_id, kind, status, detail::text AS detail FROM face_enrolment_flags WHERE student_id = ? ORDER BY flag_id');
    $stmt->execute([$studentId]);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
};
$ffRaised = static function (int $studentId) use ($pdo): int {
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM audit_events WHERE action_code = 'face_flag_raised' AND target_id = ?");
    $stmt->execute([(string) $studentId]);
    return (int) $stmt->fetchColumn();
};

// Migration 072 schema & privileges.
expect_true((bool) $pdo->query("SELECT has_table_privilege(current_user, 'face_revoke_requests', 'SELECT,INSERT,UPDATE,DELETE')")->fetchColumn(), 'Migration 072 grants face_revoke_requests to the application role');
expect_true(str_contains((string) $pdo->query("SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'face_enrolment_flags_kind_check'")->fetchColumn(), "'F3'"), 'Migration 072 allows F3 in face_enrolment_flags');

// F2 direct flag step + retired F1 creation.
$ffMatch = $ffNew('Match');
$ffMismatch = $ffNew('Mismatch');
$ffEnrol($ffMatch, true, true, true);
expect_same([], $ffFlags($ffMatch), 'A matching update raises no flag');
$ffEnrol($ffMatch, true, true, null);
expect_same([], $ffFlags($ffMatch), 'An unreadable previous face (matchesPrevious null) raises no flag');
$ffEnrol($ffMismatch, true, true, false);
$ffRows = $ffFlags($ffMismatch);
expect_true(count($ffRows) === 1 && $ffRows[0]['kind'] === 'F2' && $ffRows[0]['status'] === 'open', 'A non-matching update raises one open F2');
expect_same(['attemptedAt'], array_keys(json_decode($ffRows[0]['detail'], true)), 'F2 detail holds attemptedAt only, no score');
$ffEnrol($ffMismatch, true, true, false);
expect_same(1, count($ffFlags($ffMismatch)), 'A second non-matching update refreshes the open F2 instead of adding one');
expect_same(2, $ffRaised($ffMismatch), 'Each raise or refresh is audited as face_flag_raised');

// F1 is retired for new enrolments (historical F1 rows stay queryable below).
$ffWithdrew = $ffNew('Withdrew');
$ffAudit($ffWithdrew, 'biometric_consent_revoked');
$ffEnrol($ffWithdrew, false, true, null);
expect_same([], $ffFlags($ffWithdrew), 'F1 is retired: enrolling again after self-withdrawal raises no new F1');

// Flags never block: a failing flag step is swallowed and the transaction stays usable.
$pdo->beginTransaction();
face_flags_after_enrolment($pdo, $ffConfig, $ffContext, 2147483000, ['protected_object_reference' => 'sface/' . str_repeat('a', 32), 'enrolled_at' => null], false, new DateTimeImmutable('now', new DateTimeZone('UTC')));
expect_same(1, (int) $pdo->query('SELECT 1')->fetchColumn(), 'A failing flag step (unknown Student) leaves the enrolment transaction usable');
$pdo->commit();

// Insert one historical F1 row to prove legacy F1 rows remain queryable.
$pdo->prepare("INSERT INTO face_enrolment_flags (student_id, kind, status, detail) VALUES (?, 'F1', 'open', ?::jsonb)")
    ->execute([$ffWithdrew, json_encode(['withdrawnAt' => '2026-10-01T09:00:00+08:00', 'enrolledAt' => '2026-10-05T10:00:00+08:00'], JSON_THROW_ON_ERROR)]);

// Ephemeral mock biometric sidecar + sidecar-enabled PHP server for real HTTP testing of enrollment mismatch, attendance verify, and physical .sface revoke.
$ffTmpDir = sys_get_temp_dir() . '/dentisys_ff_' . $ffTag;
mkdir($ffTmpDir, 0700, true);
$ffSidecarLog = $ffTmpDir . '/sidecar_calls.jsonl';
$ffSidecarScript = $ffTmpDir . '/sidecar.php';
$ffSidecarSecret = 'ff-sidecar-secret-' . $ffTag;
$ffMockNewRef = 'sface/mismatchnew' . $ffTag;
file_put_contents($ffSidecarScript, strtr(<<<'PHP'
<?php
$logFile = __LOG_FILE__;
$secret = __SECRET__;
$newRef = __NEW_REF__;
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$hdr = $_SERVER['HTTP_X_DENTISYS_SIDECAR_SECRET'] ?? '';
if ($hdr !== $secret) {
    http_response_code(401);
    header('Content-Type: application/json');
    echo json_encode(['ok' => false, 'code' => 'unauthorized']);
    exit;
}
$raw = file_get_contents('php://input');
$json = is_string($raw) ? json_decode($raw, true) : null;
file_put_contents($logFile, json_encode(['path' => $path, 'post' => $_POST, 'json' => $json]) . "\n", FILE_APPEND);
header('Content-Type: application/json');
if ($path === '/v1/enrollment') {
    echo json_encode(['ok' => true, 'protectedObjectReference' => $newRef, 'usableSampleCount' => 25, 'matchesPrevious' => false]);
    exit;
}
if ($path === '/v1/verify') {
    echo json_encode(['ok' => true, 'verified' => true]);
    exit;
}
if ($path === '/v1/reference/revoke') {
    echo json_encode(['ok' => true, 'revoked' => true]);
    exit;
}
http_response_code(404);
echo json_encode(['ok' => false, 'code' => 'not_found']);
PHP, [
    '__LOG_FILE__' => var_export($ffSidecarLog, true),
    '__SECRET__' => var_export($ffSidecarSecret, true),
    '__NEW_REF__' => var_export($ffMockNewRef, true),
]));

$ffPickPort = static function (): int {
    $sock = stream_socket_server('tcp://127.0.0.1:0', $errno, $errstr);
    if (!is_resource($sock)) {
        throw new RuntimeException("Unable to bind ephemeral port: {$errstr}");
    }
    $name = stream_socket_get_name($sock, false);
    fclose($sock);
    return (int) substr((string) $name, strrpos((string) $name, ':') + 1);
};
$ffSidecarPort = $ffPickPort();
$ffAppPort = $ffPickPort();
$ffProcs = [];
$ffWaitPort = static function (int $port): void {
    $deadline = microtime(true) + 5.0;
    while (microtime(true) < $deadline) {
        $conn = @fsockopen('127.0.0.1', $port, $errno, $errstr, 0.2);
        if (is_resource($conn)) {
            fclose($conn);
            return;
        }
        usleep(50_000);
    }
    throw new RuntimeException("Ephemeral server on port {$port} did not become ready.");
};
$ffSidecarProc = proc_open(
    [PHP_BINARY, '-S', "127.0.0.1:{$ffSidecarPort}", $ffSidecarScript],
    [['pipe', 'r'], ['file', '/dev/null', 'w'], ['file', '/dev/null', 'w']],
    $ffSidecarPipes
);
if (!is_resource($ffSidecarProc)) {
    throw new RuntimeException('Failed to start mock sidecar server.');
}
$ffProcs[] = $ffSidecarProc;
$ffWaitPort($ffSidecarPort);

$ffAppEnv = array_merge(getenv(), [
    'APP_ENV' => 'development',
    'BIOMETRIC_SIDECAR_URL' => "http://127.0.0.1:{$ffSidecarPort}",
    'BIOMETRIC_SIDECAR_SHARED_SECRET' => $ffSidecarSecret,
    'BIOMETRIC_CHALLENGE_TTL_SECONDS' => '120',
    'DB_HOST' => $host,
    'DB_PORT' => (string) $port,
    'DB_NAME' => $name,
    'DB_USER' => $user,
    'DB_PASS' => $pass,
]);
$ffChildEnv = [];
foreach ($ffAppEnv as $ek => $ev) {
    if (is_string($ek) && is_scalar($ev)) {
        $ffChildEnv[$ek] = (string) $ev;
    }
}
$ffAppRouterScript = $ffTmpDir . '/app_router.php';
file_put_contents($ffAppRouterScript, "<?php\n\$_SERVER['SCRIPT_NAME'] = '/index.php';\nrequire " . var_export(dirname(__DIR__, 2) . '/backend/public/index.php', true) . ";\n");
$ffAppProc = proc_open(
    [PHP_BINARY, '-S', "127.0.0.1:{$ffAppPort}", '-t', dirname(__DIR__, 2) . '/backend/public', $ffAppRouterScript],
    [['pipe', 'r'], ['file', '/dev/null', 'w'], ['file', '/dev/null', 'w']],
    $ffAppPipes,
    null,
    $ffChildEnv
);
if (!is_resource($ffAppProc)) {
    throw new RuntimeException('Failed to start sidecar-enabled test app server.');
}
$ffProcs[] = $ffAppProc;
$ffWaitPort($ffAppPort);

register_shutdown_function(static function () use (&$ffProcs, $ffTmpDir): void {
    foreach ($ffProcs as $proc) {
        if (is_resource($proc)) {
            @proc_terminate($proc);
            @proc_close($proc);
        }
    }
    foreach (glob($ffTmpDir . '/*') ?: [] as $f) {
        @unlink($f);
    }
    @rmdir($ffTmpDir);
});

$ffSidecarHttpJson = static function (string $method, string $path, string $token, ?array $payload = null) use ($ffAppPort): array {
    $headers = "Accept: application/json\r\n";
    if ($token !== '') {
        $headers .= "Authorization: Bearer {$token}\r\n";
    }
    $content = '';
    if ($payload !== null) {
        $headers .= "Content-Type: application/json\r\n";
        $content = json_encode($payload, JSON_THROW_ON_ERROR);
    }
    $ctx = stream_context_create([
        'http' => [
            'method' => $method,
            'header' => $headers,
            'content' => $content,
            'ignore_errors' => true,
            'timeout' => 10,
        ],
    ]);
    $body = @file_get_contents("http://127.0.0.1:{$ffAppPort}{$path}", false, $ctx);
    $status = 0;
    foreach ($http_response_header ?? [] as $line) {
        if (preg_match('/^HTTP\/\S+\s+(\d{3})/', $line, $m)) {
            $status = (int) $m[1];
            break;
        }
    }
    return [$status, is_string($body) ? (json_decode($body, true) ?: []) : []];
};
$ffSidecarMultipart = static function (string $path, string $token, array $fields, int $frameCount) use ($ffAppPort): array {
    $boundary = '----FfBoundary' . bin2hex(random_bytes(8));
    $body = '';
    foreach ($fields as $k => $v) {
        $body .= "--{$boundary}\r\nContent-Disposition: form-data; name=\"{$k}\"\r\n\r\n{$v}\r\n";
    }
    $dummyFrame = "\xFF\xD8\xFF\xE0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xFF\xD9";
    for ($i = 0; $i < $frameCount; $i++) {
        $body .= "--{$boundary}\r\nContent-Disposition: form-data; name=\"frames[]\"; filename=\"f{$i}.jpg\"\r\nContent-Type: image/jpeg\r\n\r\n{$dummyFrame}\r\n";
    }
    $body .= "--{$boundary}--\r\n";
    $ctx = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => "Accept: application/json\r\nAuthorization: Bearer {$token}\r\nContent-Type: multipart/form-data; boundary={$boundary}\r\nContent-Length: " . strlen($body) . "\r\n",
            'content' => $body,
            'ignore_errors' => true,
            'timeout' => 10,
        ],
    ]);
    $raw = @file_get_contents("http://127.0.0.1:{$ffAppPort}{$path}", false, $ctx);
    $status = 0;
    foreach ($http_response_header ?? [] as $line) {
        if (preg_match('/^HTTP\/\S+\s+(\d{3})/', $line, $m)) {
            $status = (int) $m[1];
            break;
        }
    }
    return [$status, is_string($raw) ? (json_decode($raw, true) ?: []) : []];
};
$ffReadSidecarLog = static function () use ($ffSidecarLog): array {
    if (!is_file($ffSidecarLog)) {
        return [];
    }
    $lines = file($ffSidecarLog, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [];
    return array_values(array_filter(array_map(static fn(string $l): ?array => json_decode($l, true) ?: null, $lines)));
};

// Create an active Student with an active biometric profile + enrollment in $studentClassId.
$ffStuEmail = "ff-stu-{$ffTag}@bicol-u.edu.ph";
$ffStuUserId = $saAccount($ffStuEmail, 'student', "Ff Student {$ffLetters}", "FF-{$ffTag}-STU");
$ffStuId = (int) $pdo->query("SELECT student_id FROM students WHERE student_account_user_id = {$ffStuUserId}")->fetchColumn();
$pdo->prepare("INSERT INTO enrollments (student_id, cs_id, status) VALUES (?, ?, 'Active')")->execute([$ffStuId, $studentClassId]);
$ffOriginalRef = 'sface/orig' . bin2hex(random_bytes(12));
$pdo->prepare(
    "INSERT INTO biometric_profiles
        (student_id, consent_status, face_enrolled, consent_disclosure_version, enrollment_status, protected_object_reference, reference_expires_on, usable_sample_count, enrolled_at)
     VALUES (?, 'approved', 1, 'v1.1-2026-09', 'active', ?, '2099-12-31', 25, CURRENT_TIMESTAMP(6))"
)->execute([$ffStuId, $ffOriginalRef]);
[$ffStuLoginStatus, $ffStuLogin] = integration_http_json('/api/auth/login', '', ['email' => $ffStuEmail, 'password' => $saPass]);
expect_same(200, $ffStuLoginStatus, 'Test Student signs in for 12.9 HTTP integration');
$ffStuToken = (string) ($ffStuLogin['access_token'] ?? '');

// (a) Legacy DELETE /api/student/biometrics & /api/student/biometric/profile return 409 revocation_approval_required and keep .sface active.
foreach (['/api/student/biometrics', '/api/student/biometric/profile'] as $ffDelPath) {
    [$ffDelStatus, $ffDelBody] = integration_http_method_json('DELETE', $ffDelPath, $ffStuToken, []);
    expect_same(409, $ffDelStatus, "Legacy DELETE {$ffDelPath} is blocked with 409");
    expect_same('revocation_approval_required', $ffDelBody['code'] ?? null, "Legacy DELETE {$ffDelPath} returns revocation_approval_required");
}
$ffProfileRow = $pdo->prepare('SELECT enrollment_status, consent_status, protected_object_reference FROM biometric_profiles WHERE student_id = ?');
$ffProfileRow->execute([$ffStuId]);
$ffProfState = $ffProfileRow->fetch(PDO::FETCH_ASSOC);
expect_same(['active', 'approved', $ffOriginalRef], [$ffProfState['enrollment_status'], $ffProfState['consent_status'], $ffProfState['protected_object_reference']], 'Legacy DELETE keeps profile active and .sface untouched');

// (a2) Backlog 12.10: PUT /api/student/biometric/consent { granted: false } cannot bypass revocation approval for enrolled Students.
$ffLogBeforeConsent = count($ffReadSidecarLog());
$ffConsentAuditCount = static function (int $sid, string $action) use ($pdo): int {
    $st = $pdo->prepare('SELECT COUNT(*) FROM audit_events WHERE target_type = ? AND target_id = ? AND action_code = ?');
    $st->execute(['student_biometric_profile', (string) $sid, $action]);
    return (int) $st->fetchColumn();
};
$ffRevokedAuditBefore = $ffConsentAuditCount($ffStuId, 'biometric_consent_revoked');
[$ffConsentDenyStatus, $ffConsentDenyBody] = $ffSidecarHttpJson('PUT', '/api/student/biometric/consent', $ffStuToken, [
    'granted' => false,
    'disclosureVersion' => 'v1.1-2026-09',
]);
expect_same(409, $ffConsentDenyStatus, 'PUT /api/student/biometric/consent { granted: false } is blocked with 409 for active enrollment (12.10)');
expect_same('revocation_approval_required', $ffConsentDenyBody['code'] ?? null, 'Blocked consent withdrawal returns revocation_approval_required (12.10)');
expect_same($ffLogBeforeConsent, count($ffReadSidecarLog()), 'Blocked consent withdrawal makes zero sidecar revoke calls (12.10)');
$ffProfileRow->execute([$ffStuId]);
$ffProfAfterConsentDeny = $ffProfileRow->fetch(PDO::FETCH_ASSOC);
expect_same(['active', 'approved', $ffOriginalRef], [$ffProfAfterConsentDeny['enrollment_status'], $ffProfAfterConsentDeny['consent_status'], $ffProfAfterConsentDeny['protected_object_reference']], 'Blocked consent withdrawal leaves profile active and .sface untouched (12.10)');
expect_same($ffRevokedAuditBefore, $ffConsentAuditCount($ffStuId, 'biometric_consent_revoked'), 'Blocked consent withdrawal writes no biometric_consent_revoked audit row (12.10)');

// Pre-enrollment decline, idempotency, enrolling guard, stale enrolling recovery, and expired-active decline (12.10).
$ffPreEmail = "ff-pre-{$ffTag}@bicol-u.edu.ph";
$ffPreUserId = $saAccount($ffPreEmail, 'student', "Ff Pre {$ffLetters}", "FF-{$ffTag}-PRE");
$ffPreId = (int) $pdo->query("SELECT student_id FROM students WHERE student_account_user_id = {$ffPreUserId}")->fetchColumn();
[, $ffPreLogin] = integration_http_json('/api/auth/login', '', ['email' => $ffPreEmail, 'password' => $saPass]);
$ffPreToken = (string) ($ffPreLogin['access_token'] ?? '');

// 1) Never enrolled (no row) -> 200, consent declined, enrollment_status stays not_enrolled, audited once.
$ffLogBeforePre = count($ffReadSidecarLog());
[$ffPreDecline1Status, $ffPreDecline1Body] = $ffSidecarHttpJson('PUT', '/api/student/biometric/consent', $ffPreToken, [
    'granted' => false,
    'disclosureVersion' => 'v1.1-2026-09',
]);
expect_same(200, $ffPreDecline1Status, 'Pre-enrollment consent decline succeeds with 200 (12.10)');
expect_same(false, $ffPreDecline1Body['consentGranted'] ?? null, 'Pre-enrollment decline sets consentGranted false (12.10)');
expect_same('not_enrolled', $ffPreDecline1Body['enrollmentStatus'] ?? null, 'Pre-enrollment decline keeps enrollmentStatus not_enrolled instead of revoked (12.10)');
expect_same(1, $ffConsentAuditCount($ffPreId, 'biometric_consent_revoked'), 'Pre-enrollment decline records biometric_consent_revoked audit row (12.10)');
expect_same($ffLogBeforePre, count($ffReadSidecarLog()), 'Pre-enrollment decline makes zero sidecar calls (12.10)');

// 2) Repeat decline -> 200, no duplicate audit row (R3).
[$ffPreDecline2Status] = $ffSidecarHttpJson('PUT', '/api/student/biometric/consent', $ffPreToken, [
    'granted' => false,
    'disclosureVersion' => 'v1.1-2026-09',
]);
expect_same(200, $ffPreDecline2Status, 'Repeated pre-enrollment decline is idempotent (12.10)');
expect_same(1, $ffConsentAuditCount($ffPreId, 'biometric_consent_revoked'), 'Repeated pre-enrollment decline writes no duplicate audit row (12.10)');

// 3) Grant consent -> approved + not_enrolled, then decline again -> declined + not_enrolled.
[$ffPreGrantStatus, $ffPreGrantBody] = $ffSidecarHttpJson('PUT', '/api/student/biometric/consent', $ffPreToken, [
    'granted' => true,
    'disclosureVersion' => 'v1.1-2026-09',
]);
expect_same(200, $ffPreGrantStatus, 'Pre-enrollment consent grant succeeds (12.10)');
expect_same(true, $ffPreGrantBody['consentGranted'] ?? null, 'Pre-enrollment grant sets consentGranted true (12.10)');
expect_same(1, $ffConsentAuditCount($ffPreId, 'biometric_consent_granted'), 'Pre-enrollment grant writes biometric_consent_granted audit row (12.10)');

[$ffPreDecline3Status, $ffPreDecline3Body] = $ffSidecarHttpJson('PUT', '/api/student/biometric/consent', $ffPreToken, [
    'granted' => false,
    'disclosureVersion' => 'v1.1-2026-09',
]);
expect_same(200, $ffPreDecline3Status, 'Withdrawing pre-enrollment consent before capture succeeds (12.10)');
expect_same('not_enrolled', $ffPreDecline3Body['enrollmentStatus'] ?? null, 'Withdrawing pre-enrollment consent keeps enrollmentStatus not_enrolled (12.10)');
expect_same(2, $ffConsentAuditCount($ffPreId, 'biometric_consent_revoked'), 'Withdrawing pre-enrollment consent after grant writes second biometric_consent_revoked audit row (12.10)');

// 4) Fresh enrolling -> 409 biometric_enrollment_in_progress, zero sidecar calls, profile & audit untouched.
$pdo->prepare("UPDATE biometric_profiles SET consent_status = 'approved', face_enrolled = 0, enrollment_status = 'enrolling', protected_object_reference = NULL, usable_sample_count = NULL, revoked_at = NULL, updated_at = CURRENT_TIMESTAMP(6) WHERE student_id = ?")->execute([$ffPreId]);
$ffLogBeforeEnrolling = count($ffReadSidecarLog());
$ffRevokedBeforeEnrolling = $ffConsentAuditCount($ffPreId, 'biometric_consent_revoked');
[$ffEnrollingStatus, $ffEnrollingBody] = $ffSidecarHttpJson('PUT', '/api/student/biometric/consent', $ffPreToken, [
    'granted' => false,
    'disclosureVersion' => 'v1.1-2026-09',
]);
expect_same(409, $ffEnrollingStatus, 'Consent withdrawal during active enrolling returns 409 (12.10)');
expect_same('biometric_enrollment_in_progress', $ffEnrollingBody['code'] ?? null, 'Consent withdrawal during active enrolling returns biometric_enrollment_in_progress (12.10)');
expect_same($ffLogBeforeEnrolling, count($ffReadSidecarLog()), 'Consent withdrawal during active enrolling makes zero sidecar calls (12.10)');
$ffProfileRow->execute([$ffPreId]);
$ffProfAfterEnrolling = $ffProfileRow->fetch(PDO::FETCH_ASSOC);
expect_same(['enrolling', 'approved', null], [$ffProfAfterEnrolling['enrollment_status'], $ffProfAfterEnrolling['consent_status'], $ffProfAfterEnrolling['protected_object_reference']], 'Consent withdrawal during active enrolling leaves profile untouched (12.10)');
expect_same($ffRevokedBeforeEnrolling, $ffConsentAuditCount($ffPreId, 'biometric_consent_revoked'), 'Consent withdrawal during active enrolling writes no biometric_consent_revoked audit row (12.10)');

// 5) Stale enrolling with non-expired protected_object_reference -> recovers to active and returns 409 revocation_approval_required.
$ffStaleRef = 'sface/stale' . bin2hex(random_bytes(8));
$pdo->prepare(
    "UPDATE biometric_profiles
        SET consent_status = 'approved', face_enrolled = 1, enrollment_status = 'enrolling',
            protected_object_reference = ?, reference_expires_on = '2099-12-31', usable_sample_count = 25,
            enrolled_at = CURRENT_TIMESTAMP(6), revoked_at = NULL,
            updated_at = CURRENT_TIMESTAMP(6) - INTERVAL '10 minutes'
      WHERE student_id = ?"
)->execute([$ffStaleRef, $ffPreId]);
$ffLogBeforeStaleActive = count($ffReadSidecarLog());
$ffRevokedBeforeStaleActive = $ffConsentAuditCount($ffPreId, 'biometric_consent_revoked');
[$ffStaleActiveStatus, $ffStaleActiveBody] = $ffSidecarHttpJson('PUT', '/api/student/biometric/consent', $ffPreToken, [
    'granted' => false,
    'disclosureVersion' => 'v1.1-2026-09',
]);
expect_same(409, $ffStaleActiveStatus, 'Stale enrolling with existing .sface returns 409 (12.10)');
expect_same('revocation_approval_required', $ffStaleActiveBody['code'] ?? null, 'Stale enrolling with existing .sface requires revocation approval (12.10)');
expect_same($ffLogBeforeStaleActive, count($ffReadSidecarLog()), 'Stale enrolling with existing .sface makes zero sidecar calls (12.10)');
$ffProfileRow->execute([$ffPreId]);
$ffProfAfterStaleActive = $ffProfileRow->fetch(PDO::FETCH_ASSOC);
expect_same(['active', 'approved', $ffStaleRef], [$ffProfAfterStaleActive['enrollment_status'], $ffProfAfterStaleActive['consent_status'], $ffProfAfterStaleActive['protected_object_reference']], 'Stale enrolling with existing .sface recovers enrollment_status to active and preserves reference/consent (12.10)');
expect_same($ffRevokedBeforeStaleActive, $ffConsentAuditCount($ffPreId, 'biometric_consent_revoked'), 'Stale enrolling with existing .sface writes no biometric_consent_revoked audit row (12.10)');

// 5b) Stale enrolling with past-expiry reference_expires_on -> recovers to active, auto-expires via sidecar, and declines (200).
$ffStaleExpRef = 'sface/staleexp' . bin2hex(random_bytes(8));
$pdo->prepare(
    "UPDATE biometric_profiles
        SET consent_status = 'approved', face_enrolled = 1, enrollment_status = 'enrolling',
            protected_object_reference = ?, reference_expires_on = '2020-12-31', usable_sample_count = 25,
            enrolled_at = CURRENT_TIMESTAMP(6), revoked_at = NULL,
            updated_at = CURRENT_TIMESTAMP(6) - INTERVAL '10 minutes'
      WHERE student_id = ?"
)->execute([$ffStaleExpRef, $ffPreId]);
$ffLogBeforeStaleExp = count($ffReadSidecarLog());
$ffRevokedBeforeStaleExp = $ffConsentAuditCount($ffPreId, 'biometric_consent_revoked');
[$ffStaleExpStatus, $ffStaleExpBody] = $ffSidecarHttpJson('PUT', '/api/student/biometric/consent', $ffPreToken, [
    'granted' => false,
    'disclosureVersion' => 'v1.1-2026-09',
]);
expect_same(200, $ffStaleExpStatus, 'Stale enrolling with past-expiry .sface auto-expires and returns 200 (12.10)');
expect_same(false, $ffStaleExpBody['consentGranted'] ?? null, 'Stale enrolling past-expiry decline sets consentGranted false (12.10)');
expect_same('expired', $ffStaleExpBody['enrollmentStatus'] ?? null, 'Stale enrolling past-expiry decline sets enrollmentStatus expired (12.10)');
$ffLogAfterStaleExp = array_slice($ffReadSidecarLog(), $ffLogBeforeStaleExp);
expect_true(count(array_filter($ffLogAfterStaleExp, static fn(array $e): bool => ($e['path'] ?? '') === '/v1/reference/revoke' && ($e['json']['protectedObjectReference'] ?? '') === $ffStaleExpRef)) === 1, 'Stale enrolling past-expiry decline revokes expired sidecar reference (12.10)');
$ffProfileRow->execute([$ffPreId]);
$ffProfAfterStaleExp = $ffProfileRow->fetch(PDO::FETCH_ASSOC);
expect_same(['expired', 'declined', null], [$ffProfAfterStaleExp['enrollment_status'], $ffProfAfterStaleExp['consent_status'], $ffProfAfterStaleExp['protected_object_reference']], 'Stale enrolling past-expiry decline persists expired/declined and clears reference (12.10)');
expect_same($ffRevokedBeforeStaleExp + 1, $ffConsentAuditCount($ffPreId, 'biometric_consent_revoked'), 'Stale enrolling past-expiry decline records biometric_consent_revoked once (12.10)');

// 6) Stale enrolling without a protected_object_reference -> recovers to not_enrolled and declines (200).
$pdo->prepare("UPDATE biometric_profiles SET consent_status = 'approved', face_enrolled = 0, enrollment_status = 'enrolling', protected_object_reference = NULL, reference_expires_on = NULL, usable_sample_count = NULL, enrolled_at = NULL, revoked_at = NULL, updated_at = CURRENT_TIMESTAMP(6) - INTERVAL '10 minutes' WHERE student_id = ?")->execute([$ffPreId]);
[$ffStaleNoneStatus, $ffStaleNoneBody] = $ffSidecarHttpJson('PUT', '/api/student/biometric/consent', $ffPreToken, [
    'granted' => false,
    'disclosureVersion' => 'v1.1-2026-09',
]);
expect_same(200, $ffStaleNoneStatus, 'Stale enrolling without .sface recovers and allows consent decline (12.10)');
expect_same('not_enrolled', $ffStaleNoneBody['enrollmentStatus'] ?? null, 'Stale enrolling recovery sets enrollmentStatus not_enrolled (12.10)');

// 7) Active enrollment past reference_expires_on -> auto-expires first, then allows consent decline while preserving expired status.
$ffExpiredRef = 'sface/exp' . bin2hex(random_bytes(8));
$pdo->prepare("UPDATE biometric_profiles SET consent_status = 'approved', face_enrolled = 1, enrollment_status = 'active', protected_object_reference = ?, reference_expires_on = '2020-12-31', usable_sample_count = 25, enrolled_at = CURRENT_TIMESTAMP(6), revoked_at = NULL WHERE student_id = ?")->execute([$ffExpiredRef, $ffPreId]);
$ffLogBeforeExp = count($ffReadSidecarLog());
[$ffExpDeclineStatus, $ffExpDeclineBody] = $ffSidecarHttpJson('PUT', '/api/student/biometric/consent', $ffPreToken, [
    'granted' => false,
    'disclosureVersion' => 'v1.1-2026-09',
]);
expect_same(200, $ffExpDeclineStatus, 'Consent decline on past-expiry active profile auto-expires cleanly and returns 200 (12.10)');
expect_same(false, $ffExpDeclineBody['consentGranted'] ?? null, 'Past-expiry consent decline sets consentGranted false (12.10)');
expect_same('expired', $ffExpDeclineBody['enrollmentStatus'] ?? null, 'Past-expiry consent decline preserves enrollmentStatus expired (12.10)');
$ffLogAfterExp = array_slice($ffReadSidecarLog(), $ffLogBeforeExp);
expect_true(count(array_filter($ffLogAfterExp, static fn(array $e): bool => ($e['path'] ?? '') === '/v1/reference/revoke' && ($e['json']['protectedObjectReference'] ?? '') === $ffExpiredRef)) === 1, 'Past-expiry consent decline revokes only the expired sidecar reference via expiry path (12.10)');

// 8) Revoked profile with approved consent (post-Superadmin direct revoke state) + granted: false -> 200, preserves revoked, audited once, R3 repeat no-op.
$pdo->prepare(
    "UPDATE biometric_profiles
        SET consent_status = 'approved', face_enrolled = 0, enrollment_status = 'revoked',
            protected_object_reference = NULL, reference_expires_on = NULL, usable_sample_count = NULL,
            revoked_at = CURRENT_TIMESTAMP(6), updated_at = CURRENT_TIMESTAMP(6)
      WHERE student_id = ?"
)->execute([$ffPreId]);
$ffLogBeforeRevDecline = count($ffReadSidecarLog());
$ffRevokedBefore8 = $ffConsentAuditCount($ffPreId, 'biometric_consent_revoked');
[$ffRevDecline1Status, $ffRevDecline1Body] = $ffSidecarHttpJson('PUT', '/api/student/biometric/consent', $ffPreToken, [
    'granted' => false,
    'disclosureVersion' => 'v1.1-2026-09',
]);
expect_same(200, $ffRevDecline1Status, 'Consent decline on revoked+approved profile succeeds with 200 (12.10)');
expect_same(false, $ffRevDecline1Body['consentGranted'] ?? null, 'Revoked+approved decline sets consentGranted false (12.10)');
expect_same('revoked', $ffRevDecline1Body['enrollmentStatus'] ?? null, 'Revoked+approved decline preserves enrollmentStatus revoked (12.10)');
expect_same($ffRevokedBefore8 + 1, $ffConsentAuditCount($ffPreId, 'biometric_consent_revoked'), 'Revoked+approved decline records biometric_consent_revoked once (12.10)');
expect_same($ffLogBeforeRevDecline, count($ffReadSidecarLog()), 'Revoked+approved decline makes zero sidecar calls (12.10)');
[$ffRevDecline2Status, $ffRevDecline2Body] = $ffSidecarHttpJson('PUT', '/api/student/biometric/consent', $ffPreToken, [
    'granted' => false,
    'disclosureVersion' => 'v1.1-2026-09',
]);
expect_same(200, $ffRevDecline2Status, 'Repeat consent decline on revoked+declined profile returns 200 (12.10)');
expect_same('revoked', $ffRevDecline2Body['enrollmentStatus'] ?? null, 'Repeat consent decline on revoked profile preserves enrollmentStatus revoked (12.10)');
expect_same($ffRevokedBefore8 + 1, $ffConsentAuditCount($ffPreId, 'biometric_consent_revoked'), 'Repeat consent decline on revoked profile writes no duplicate audit row (12.10)');
expect_same($ffLogBeforeRevDecline, count($ffReadSidecarLog()), 'Repeat consent decline on revoked profile makes zero sidecar calls (12.10)');

// 9) Already expired profile with approved consent + granted: false -> 200, preserves expired, audited once, R3 repeat no-op.
$pdo->prepare(
    "UPDATE biometric_profiles
        SET consent_status = 'approved', face_enrolled = 0, enrollment_status = 'expired',
            protected_object_reference = NULL, reference_expires_on = '2020-12-31', usable_sample_count = NULL,
            revoked_at = NULL, updated_at = CURRENT_TIMESTAMP(6)
      WHERE student_id = ?"
)->execute([$ffPreId]);
$ffLogBeforeAlreadyExp = count($ffReadSidecarLog());
$ffRevokedBefore9 = $ffConsentAuditCount($ffPreId, 'biometric_consent_revoked');
[$ffAlreadyExp1Status, $ffAlreadyExp1Body] = $ffSidecarHttpJson('PUT', '/api/student/biometric/consent', $ffPreToken, [
    'granted' => false,
    'disclosureVersion' => 'v1.1-2026-09',
]);
expect_same(200, $ffAlreadyExp1Status, 'Consent decline on already-expired+approved profile succeeds with 200 (12.10)');
expect_same(false, $ffAlreadyExp1Body['consentGranted'] ?? null, 'Already-expired decline sets consentGranted false (12.10)');
expect_same('expired', $ffAlreadyExp1Body['enrollmentStatus'] ?? null, 'Already-expired decline preserves enrollmentStatus expired (12.10)');
expect_same($ffRevokedBefore9 + 1, $ffConsentAuditCount($ffPreId, 'biometric_consent_revoked'), 'Already-expired decline records biometric_consent_revoked once (12.10)');
expect_same($ffLogBeforeAlreadyExp, count($ffReadSidecarLog()), 'Already-expired decline makes zero sidecar calls (12.10)');
[$ffAlreadyExp2Status, $ffAlreadyExp2Body] = $ffSidecarHttpJson('PUT', '/api/student/biometric/consent', $ffPreToken, [
    'granted' => false,
    'disclosureVersion' => 'v1.1-2026-09',
]);
expect_same(200, $ffAlreadyExp2Status, 'Repeat consent decline on expired+declined profile returns 200 (12.10)');
expect_same('expired', $ffAlreadyExp2Body['enrollmentStatus'] ?? null, 'Repeat consent decline on expired profile preserves enrollmentStatus expired (12.10)');
expect_same($ffRevokedBefore9 + 1, $ffConsentAuditCount($ffPreId, 'biometric_consent_revoked'), 'Repeat consent decline on expired profile writes no duplicate audit row (12.10)');
expect_same($ffLogBeforeAlreadyExp, count($ffReadSidecarLog()), 'Repeat consent decline on expired profile makes zero sidecar calls (12.10)');

// 11) granted: true regression checks on revoked, expired, and active profiles (including R3 repeat-grant check).
$pdo->prepare(
    "UPDATE biometric_profiles
        SET consent_status = 'declined', face_enrolled = 0, enrollment_status = 'revoked',
            protected_object_reference = NULL, reference_expires_on = NULL, usable_sample_count = NULL,
            revoked_at = CURRENT_TIMESTAMP(6), updated_at = CURRENT_TIMESTAMP(6)
      WHERE student_id = ?"
)->execute([$ffPreId]);
$ffLogBeforeGrantRev = count($ffReadSidecarLog());
$ffGrantedBefore11a = $ffConsentAuditCount($ffPreId, 'biometric_consent_granted');
[$ffGrantRevStatus, $ffGrantRevBody] = $ffSidecarHttpJson('PUT', '/api/student/biometric/consent', $ffPreToken, [
    'granted' => true,
    'disclosureVersion' => 'v1.1-2026-09',
]);
expect_same(200, $ffGrantRevStatus, 'Consent grant on revoked profile succeeds with 200 (12.10)');
expect_same(true, $ffGrantRevBody['consentGranted'] ?? null, 'Consent grant on revoked profile sets consentGranted true (12.10)');
expect_same('not_enrolled', $ffGrantRevBody['enrollmentStatus'] ?? null, 'Consent grant on revoked profile resets enrollmentStatus to not_enrolled (12.10)');
expect_same($ffGrantedBefore11a + 1, $ffConsentAuditCount($ffPreId, 'biometric_consent_granted'), 'Consent grant on revoked profile records biometric_consent_granted (12.10)');
expect_same($ffLogBeforeGrantRev, count($ffReadSidecarLog()), 'Consent grant on revoked profile makes zero sidecar calls (12.10)');

$pdo->prepare(
    "UPDATE biometric_profiles
        SET consent_status = 'declined', face_enrolled = 0, enrollment_status = 'expired',
            protected_object_reference = NULL, reference_expires_on = '2020-12-31', usable_sample_count = NULL,
            revoked_at = NULL, updated_at = CURRENT_TIMESTAMP(6)
      WHERE student_id = ?"
)->execute([$ffPreId]);
$ffLogBeforeGrantExp = count($ffReadSidecarLog());
$ffGrantedBefore11b = $ffConsentAuditCount($ffPreId, 'biometric_consent_granted');
[$ffGrantExpStatus, $ffGrantExpBody] = $ffSidecarHttpJson('PUT', '/api/student/biometric/consent', $ffPreToken, [
    'granted' => true,
    'disclosureVersion' => 'v1.1-2026-09',
]);
expect_same(200, $ffGrantExpStatus, 'Consent grant on expired profile succeeds with 200 (12.10)');
expect_same(true, $ffGrantExpBody['consentGranted'] ?? null, 'Consent grant on expired profile sets consentGranted true (12.10)');
expect_same('not_enrolled', $ffGrantExpBody['enrollmentStatus'] ?? null, 'Consent grant on expired profile resets enrollmentStatus to not_enrolled (12.10)');
expect_same($ffGrantedBefore11b + 1, $ffConsentAuditCount($ffPreId, 'biometric_consent_granted'), 'Consent grant on expired profile records biometric_consent_granted (12.10)');
expect_same($ffLogBeforeGrantExp, count($ffReadSidecarLog()), 'Consent grant on expired profile makes zero sidecar calls (12.10)');

$ffLogBeforeStuGrant = count($ffReadSidecarLog());
$ffStuGrantedBefore = $ffConsentAuditCount($ffStuId, 'biometric_consent_granted');
[$ffStuGrantStatus, $ffStuGrantBody] = $ffSidecarHttpJson('PUT', '/api/student/biometric/consent', $ffStuToken, [
    'granted' => true,
    'disclosureVersion' => 'v1.1-2026-09',
]);
expect_same(200, $ffStuGrantStatus, 'Consent grant on active+approved profile succeeds with 200 (12.10)');
expect_same(true, $ffStuGrantBody['consentGranted'] ?? null, 'Consent grant on active+approved profile keeps consentGranted true (12.10)');
expect_same('active', $ffStuGrantBody['enrollmentStatus'] ?? null, 'Consent grant on active+approved profile preserves enrollmentStatus active (12.10)');
$ffProfileRow->execute([$ffStuId]);
$ffProfAfterStuGrant = $ffProfileRow->fetch(PDO::FETCH_ASSOC);
expect_same(['active', 'approved', $ffOriginalRef], [$ffProfAfterStuGrant['enrollment_status'], $ffProfAfterStuGrant['consent_status'], $ffProfAfterStuGrant['protected_object_reference']], 'Consent grant on active+approved profile keeps .sface active (12.10)');
expect_same($ffStuGrantedBefore, $ffConsentAuditCount($ffStuId, 'biometric_consent_granted'), 'Consent grant on already-approved active profile writes no duplicate biometric_consent_granted audit row (12.10)');
expect_same($ffLogBeforeStuGrant, count($ffReadSidecarLog()), 'Consent grant on active+approved profile makes zero sidecar calls (12.10)');

// (b) POST /api/student/biometrics/revoke-request validation, creation, duplicate 409, GET profile state, attendance while pending, DELETE cancel + 404.
[$ffShortReqStatus] = integration_http_json('/api/student/biometrics/revoke-request', $ffStuToken, ['reason' => 'Too']);
expect_same(422, $ffShortReqStatus, 'Revoke request rejects reason shorter than 8 characters');
[$ffLongReqStatus] = integration_http_json('/api/student/biometrics/revoke-request', $ffStuToken, ['reason' => str_repeat('a', 241)]);
expect_same(422, $ffLongReqStatus, 'Revoke request rejects reason longer than 240 characters');

$ffReqReason = 'Changed my phone and need to re-register my face.';
[$ffCreateReqStatus, $ffCreateReqBody] = integration_http_json('/api/student/biometrics/revoke-request', $ffStuToken, ['reason' => $ffReqReason]);
expect_same(201, $ffCreateReqStatus, 'Student submits face revocation request (201)');
expect_same('pending', $ffCreateReqBody['request']['status'] ?? null, 'Created revocation request starts pending');
expect_same($ffReqReason, $ffCreateReqBody['biometric']['pendingRevokeRequest']['reason'] ?? null, 'Created response includes pendingRevokeRequest');
$ffReqId1 = (int) ($ffCreateReqBody['request']['requestId'] ?? 0);
expect_true($ffReqId1 > 0, 'Created revocation request returns requestId');

[$ffDupReqStatus, $ffDupReqBody] = integration_http_json('/api/student/biometrics/revoke-request', $ffStuToken, ['reason' => 'Another reason for duplicate check']);
expect_same(409, $ffDupReqStatus, 'Duplicate pending revocation request returns 409');
expect_same('revoke_request_pending', $ffDupReqBody['code'] ?? null, 'Duplicate pending returns revoke_request_pending');

[$ffGetBioStatus, $ffGetBioBody] = integration_http_get_json('/api/student/biometrics', $ffStuToken);
expect_true($ffGetBioStatus === 200 && ($ffGetBioBody['pendingRevokeRequest']['requestId'] ?? null) === $ffReqId1 && array_key_exists('latestRejectedRevokeRequest', $ffGetBioBody) && $ffGetBioBody['latestRejectedRevokeRequest'] === null, 'GET /api/student/biometrics exposes pendingRevokeRequest');

// 10) Active profile with pending revoke request + consent granted: false -> 409 revocation_approval_required, zero sidecar calls, profile & pending request untouched.
$ffLogBeforePendingDeny = count($ffReadSidecarLog());
$ffRevokedBeforePendingDeny = $ffConsentAuditCount($ffStuId, 'biometric_consent_revoked');
[$ffPendingDenyStatus, $ffPendingDenyBody] = $ffSidecarHttpJson('PUT', '/api/student/biometric/consent', $ffStuToken, [
    'granted' => false,
    'disclosureVersion' => 'v1.1-2026-09',
]);
expect_same(409, $ffPendingDenyStatus, 'Consent withdrawal while revoke request is pending returns 409 (12.10)');
expect_same('revocation_approval_required', $ffPendingDenyBody['code'] ?? null, 'Consent withdrawal while revoke request is pending returns revocation_approval_required (12.10)');
expect_same($ffLogBeforePendingDeny, count($ffReadSidecarLog()), 'Consent withdrawal while revoke request is pending makes zero sidecar calls (12.10)');
expect_same($ffRevokedBeforePendingDeny, $ffConsentAuditCount($ffStuId, 'biometric_consent_revoked'), 'Consent withdrawal while revoke request is pending writes no biometric_consent_revoked audit row (12.10)');
$ffProfileRow->execute([$ffStuId]);
$ffProfAfterPendingDeny = $ffProfileRow->fetch(PDO::FETCH_ASSOC);
expect_same(['active', 'approved', $ffOriginalRef], [$ffProfAfterPendingDeny['enrollment_status'], $ffProfAfterPendingDeny['consent_status'], $ffProfAfterPendingDeny['protected_object_reference']], 'Consent withdrawal while revoke request is pending keeps profile active/approved (12.10)');
$ffPendingReqStmt = $pdo->prepare('SELECT status FROM face_revoke_requests WHERE request_id = ?');
$ffPendingReqStmt->execute([$ffReqId1]);
expect_same('pending', $ffPendingReqStmt->fetchColumn(), 'Consent withdrawal while revoke request is pending leaves pending request untouched (12.10)');

// Verify Student can still check in for attendance while revocation request is pending.
$ffTodayManila = (new DateTimeImmutable('now', new DateTimeZone('Asia/Manila')))->format('Y-m-d');
$ffSessStmt = $pdo->prepare(
    "INSERT INTO attendance_sessions
        (cs_id, secretary_user_id, owner_user_id, session_date, session_code, room, started_at, status, geofence_enabled, biometric_required, opening_time, present_cutoff_time, late_cutoff_time, class_end_time)
     VALUES (?, ?, ?, ?, ?, 'Room 101', CURRENT_TIMESTAMP(6), 'active', FALSE, TRUE, '00:00:00', '23:50:00', '23:55:00', '23:59:00')
     RETURNING session_id"
);
$ffSessStmt->execute([$studentClassId, (int) $readFaculty['user_id'], (int) $readFaculty['user_id'], $ffTodayManila, 'FF-SESS-' . $ffTag]);
$ffSessId = (int) $ffSessStmt->fetchColumn();
[$ffAttChalStatus, $ffAttChal] = $ffSidecarHttpJson('POST', '/api/student/biometric/liveness/challenge', $ffStuToken, ['purpose' => 'attendance', 'attendanceSessionId' => $ffSessId]);
expect_same(201, $ffAttChalStatus, 'Attendance liveness challenge succeeds while revoke request is pending');
[$ffAttStatus, $ffAttBody] = $ffSidecarMultipart('/api/student/attendance/biometric', $ffStuToken, [
    'attendanceSessionId' => (string) $ffSessId,
    'challengeId' => (string) ($ffAttChal['challengeId'] ?? ''),
    'challengeToken' => (string) ($ffAttChal['challengeToken'] ?? ''),
    'idempotencyKey' => 'ff-att-' . $ffTag,
], 1);
expect_same(201, $ffAttStatus, 'Student biometric attendance check-in succeeds while revoke request is pending');
expect_same('present', $ffAttBody['status'] ?? null, 'Attendance recorded as present while revoke request is pending');
$pdo->prepare("UPDATE attendance_sessions SET status = 'ended', ended_at = CURRENT_TIMESTAMP(6) WHERE session_id = ?")->execute([$ffSessId]);

// Cancel pending request and confirm second cancel returns 404.
[$ffCancelStatus, $ffCancelBody] = integration_http_method_json('DELETE', '/api/student/biometrics/revoke-request', $ffStuToken, []);
expect_same(200, $ffCancelStatus, 'DELETE /api/student/biometrics/revoke-request cancels pending request');
expect_true(array_key_exists('pendingRevokeRequest', $ffCancelBody) && $ffCancelBody['pendingRevokeRequest'] === null, 'Cancelled response clears pendingRevokeRequest');
[$ffCancel2Status, $ffCancel2Body] = integration_http_method_json('DELETE', '/api/student/biometrics/revoke-request', $ffStuToken, []);
expect_same(404, $ffCancel2Status, 'Second cancel returns 404');
expect_same('no_pending_revoke_request', $ffCancel2Body['code'] ?? null, 'Second cancel returns no_pending_revoke_request');

// (c) Update my face with mismatching face returns 409 face_update_mismatch, leaves existing .sface intact, deletes new reference, and raises F2.
[$ffEnrChalStatus, $ffEnrChal] = $ffSidecarHttpJson('POST', '/api/student/biometric/liveness/challenge', $ffStuToken, ['purpose' => 'enrollment']);
expect_same(201, $ffEnrChalStatus, 'Enrollment liveness challenge succeeds for Update my face');
$ffSidecarCallsBefore = count($ffReadSidecarLog());
[$ffMismatchHttpStatus, $ffMismatchHttpBody] = $ffSidecarMultipart('/api/student/biometrics/enrollment', $ffStuToken, [
    'challengeId' => (string) ($ffEnrChal['challengeId'] ?? ''),
    'challengeToken' => (string) ($ffEnrChal['challengeToken'] ?? ''),
    'idempotencyKey' => 'ff-upd-' . $ffTag,
], 20);
expect_same(409, $ffMismatchHttpStatus, 'Mismatched Update my face returns HTTP 409');
expect_same('face_update_mismatch', $ffMismatchHttpBody['code'] ?? null, 'Mismatched Update my face returns code face_update_mismatch');
expect_same(
    'Your face could not be matched to your current registration. If this is you, please request a revocation instead.',
    $ffMismatchHttpBody['message'] ?? null,
    'Mismatched Update my face returns exact contract message'
);
$ffProfileRow->execute([$ffStuId]);
$ffAfterMismatch = $ffProfileRow->fetch(PDO::FETCH_ASSOC);
expect_same(['active', $ffOriginalRef], [$ffAfterMismatch['enrollment_status'], $ffAfterMismatch['protected_object_reference']], 'Mismatched Update my face keeps existing profile active and original .sface intact');
$ffSidecarNewCalls = array_slice($ffReadSidecarLog(), $ffSidecarCallsBefore);
$ffRevokedNewRef = false;
foreach ($ffSidecarNewCalls as $call) {
    if (($call['path'] ?? '') === '/v1/reference/revoke' && ($call['json']['protectedObjectReference'] ?? '') === $ffMockNewRef) {
        $ffRevokedNewRef = true;
    }
}
expect_true($ffRevokedNewRef, 'Mismatched Update my face immediately revokes the newly created .sface reference in sidecar');
$ffStuF2Rows = $ffFlags($ffStuId);
expect_true(count($ffStuF2Rows) === 1 && $ffStuF2Rows[0]['kind'] === 'F2' && $ffStuF2Rows[0]['status'] === 'open', 'Mismatched Update my face raises open F2 flag');
expect_same(['attemptedAt'], array_keys(json_decode($ffStuF2Rows[0]['detail'], true)), 'HTTP mismatch F2 detail records attemptedAt only');

// Superadmin-only route authorization checks for face-flags and face-revoke-requests.
foreach ([
    ['GET', '/api/admin/face-flags'],
    ['POST', '/api/admin/face-flags/dismiss'],
    ['GET', '/api/admin/face-revoke-requests'],
    ['POST', '/api/admin/face-revoke-requests/approve'],
    ['POST', '/api/admin/face-revoke-requests/reject'],
] as [$ffMethod, $ffPath]) {
    foreach ([['Faculty', $seedFacultyAccessToken, 403], ['Dean', $adminAccessToken, 403], ['Secretary', $secretaryAccessToken, 403], ['Student', $ffStuToken, 403], ['anonymous', '', 401]] as [$ffWho, $ffToken, $ffWant]) {
        [$ffStatus] = $ffMethod === 'GET'
            ? integration_http_get_json($ffPath, $ffToken)
            : integration_http_json($ffPath, $ffToken, ['flagId' => 1, 'requestId' => 1, 'note' => 'Long enough note']);
        expect_same($ffWant, $ffStatus, "{$ffWho} gets {$ffWant} on {$ffMethod} {$ffPath}");
    }
}

// Legacy face-flags list & F1/F2/F3 filters.
[$ffListStatus, $ffList] = integration_http_get_json('/api/admin/face-flags?q=' . rawurlencode($ffTag), $superAccessToken);
expect_true($ffListStatus === 200 && ($ffList['status'] ?? '') === 'ok' && $ffList['total'] === 3 && $ffList['pageSize'] === 50 && $ffList['page'] === 1, 'The Superadmin lists the open flags of this run');
expect_same((int) $pdo->query("SELECT COUNT(*) FROM face_enrolment_flags WHERE status = 'open'")->fetchColumn(), $ffList['openCount'] ?? null, 'GET /api/admin/face-flags returns openCount');
$ffF2 = null;
foreach ($ffList['flags'] as $ffRow) {
    if ($ffRow['student']['studentId'] === $ffMismatch) {
        $ffF2 = $ffRow;
    }
}
expect_true(
    $ffF2 !== null && $ffF2['kind'] === 'F2' && $ffF2['status'] === 'open' && is_array($ffF2['classes']) && $ffF2['closedBy'] === null && $ffF2['closedNote'] === null
    && $ffF2['student']['studentNo'] === "FF-{$ffTag}-Mismatch" && preg_match('/^\d{4}-\d\d-\d\dT[\d:]+\+08:00$/', (string) $ffF2['updatedAt']) === 1 && isset($ffF2['detail']['attemptedAt']),
    'A flag row has the contracted shape with Manila dates and attemptedAt'
);
expect_true(!str_contains(json_encode($ffList), 'score'), 'The list never carries a score');
[, $ffOnlyF1] = integration_http_get_json('/api/admin/face-flags?kind=F1&q=' . rawurlencode($ffTag), $superAccessToken);
expect_same([1, ['F1']], [$ffOnlyF1['total'], array_unique(array_column($ffOnlyF1['flags'], 'kind'))], 'Historical F1 rows remain queryable by kind=F1');
[$ffCheckF3FilterStatus] = integration_http_get_json('/api/admin/face-flags?kind=F3&status=revoked', $superAccessToken);
expect_same(200, $ffCheckF3FilterStatus, 'GET /api/admin/face-flags accepts kind=F3 and status=revoked');
foreach (['status=sometimes', 'kind=F4', 'page=0', 'classId=2147480000'] as $ffBad) {
    [$ffBadStatus] = integration_http_get_json('/api/admin/face-flags?' . $ffBad, $superAccessToken);
    expect_same(422, $ffBadStatus, "An unknown filter value is a validation error ({$ffBad})");
}

// Dismiss F2 flag checks (carried from 12.2).
$ffMismatchFlag = (int) $ffF2['flagId'];
[$ffShortStatus] = integration_http_json('/api/admin/face-flags/dismiss', $superAccessToken, ['flagId' => $ffMismatchFlag, 'note' => 'short']);
expect_same(422, $ffShortStatus, 'A dismissal note under 8 characters is refused');
[$ffMissingStatus, $ffMissing] = integration_http_json('/api/admin/face-flags/dismiss', $superAccessToken, ['flagId' => 2147480000, 'note' => 'Saw the Student in person']);
expect_true($ffMissingStatus === 404 && ($ffMissing['code'] ?? '') === 'flag_not_found', 'Dismissing an unknown flag is 404 flag_not_found');
[$ffDismissStatus, $ffDismissed] = integration_http_json('/api/admin/face-flags/dismiss', $superAccessToken, ['flagId' => $ffMismatchFlag, 'note' => 'New phone, saw them in person']);
expect_true(
    $ffDismissStatus === 200 && ($ffDismissed['flag']['status'] ?? '') === 'dismissed' && ($ffDismissed['flag']['closedNote'] ?? '') === 'New phone, saw them in person'
    && is_string($ffDismissed['flag']['closedAt'] ?? null) && is_string($ffDismissed['flag']['closedBy']['name'] ?? null),
    'The Superadmin dismisses an open flag with a note'
);
[$ffAgainStatus, $ffAgain] = integration_http_json('/api/admin/face-flags/dismiss', $superAccessToken, ['flagId' => $ffMismatchFlag, 'note' => 'New phone, saw them in person']);
expect_true($ffAgainStatus === 409 && ($ffAgain['code'] ?? '') === 'flag_closed' && ($ffAgain['message'] ?? '') === 'This flag is already closed.', 'A closed flag cannot be dismissed again (409 flag_closed)');
$ffDismissAudit = $pdo->prepare("SELECT reason FROM audit_events WHERE action_code = 'face_flag_dismissed' AND target_id = ?");
$ffDismissAudit->execute([(string) $ffMismatch]);
expect_same('New phone, saw them in person', $ffDismissAudit->fetchColumn(), 'The dismissal is audited with the note');
[, $ffDismissedList] = integration_http_get_json('/api/admin/face-flags?status=dismissed&q=' . rawurlencode($ffTag), $superAccessToken);
[, $ffAllList] = integration_http_get_json('/api/admin/face-flags?status=all&q=' . rawurlencode($ffTag), $superAccessToken);
expect_same([1, 3], [$ffDismissedList['total'], $ffAllList['total']], 'The status filter separates dismissed from all');

// (d) & (h) Student submits request -> overview counts pending -> Superadmin Reject -> Student sees rejection + can submit again.
[$ffReq2Status, $ffReq2Body] = integration_http_json('/api/student/biometrics/revoke-request', $ffStuToken, ['reason' => 'Switching to a new device for check-ins']);
expect_same(201, $ffReq2Status, 'Student submits revocation request after cancelling previous one');
$ffReqId2 = (int) ($ffReq2Body['request']['requestId'] ?? 0);

[$ffOverviewStatus, $ffOverview] = integration_http_get_json('/api/admin/overview', $superAccessToken);
expect_same(200, $ffOverviewStatus, 'GET /api/admin/overview succeeds');
$ffExpectedPending = (int) $pdo->query("SELECT COUNT(*) FROM face_revoke_requests WHERE status = 'pending'")->fetchColumn();
$ffExpectedOpenFlags = (int) $pdo->query("SELECT COUNT(*) FROM face_enrolment_flags WHERE status = 'open'")->fetchColumn();
expect_same($ffExpectedOpenFlags, $ffOverview['faceFlagsOpen'] ?? null, 'Overview returns faceFlagsOpen');
expect_same($ffExpectedPending, $ffOverview['faceRevokeRequestsPending'] ?? null, 'Overview returns faceRevokeRequestsPending');
expect_same($ffExpectedPending, $ffOverview['attention']['faceRevokeRequestsPending'] ?? null, 'Overview attention returns faceRevokeRequestsPending');
expect_true($ffExpectedPending >= 1, 'Overview pending revoke count reflects pending request');

[$ffReqListStatus, $ffReqList] = integration_http_get_json('/api/admin/face-revoke-requests?status=pending&q=' . rawurlencode($ffTag), $superAccessToken);
expect_true(
    $ffReqListStatus === 200 && ($ffReqList['total'] ?? 0) === 1 && ($ffReqList['requests'][0]['requestId'] ?? 0) === $ffReqId2
    && ($ffReqList['requests'][0]['approvedThisTermCount'] ?? -1) === 0,
    'Superadmin lists pending revocation request with approvedThisTermCount'
);

[$ffRejShortStatus] = integration_http_json('/api/admin/face-revoke-requests/reject', $superAccessToken, ['requestId' => $ffReqId2, 'note' => 'short']);
expect_same(422, $ffRejShortStatus, 'Superadmin reject refuses note under 8 characters');
$ffRejectNote = 'Please verify your ID at the Dental Office first.';
[$ffRejStatus, $ffRejBody] = integration_http_json('/api/admin/face-revoke-requests/reject', $superAccessToken, ['requestId' => $ffReqId2, 'note' => $ffRejectNote]);
expect_same(200, $ffRejStatus, 'Superadmin rejects revocation request with valid note');
expect_same('rejected', $ffRejBody['request']['status'] ?? null, 'Rejected request status becomes rejected');
$ffProfileRow->execute([$ffStuId]);
$ffAfterReject = $ffProfileRow->fetch(PDO::FETCH_ASSOC);
expect_same(['active', $ffOriginalRef], [$ffAfterReject['enrollment_status'], $ffAfterReject['protected_object_reference']], 'Rejecting revocation request leaves face active');

$ffNotifStmt = $pdo->prepare("SELECT title, body FROM notifications WHERE recipient_user_id = ? AND notification_type = 'biometric_enrollment' ORDER BY notification_id DESC LIMIT 1");
$ffNotifStmt->execute([$ffStuUserId]);
$ffRejNotif = $ffNotifStmt->fetch(PDO::FETCH_ASSOC);
expect_true(is_array($ffRejNotif) && $ffRejNotif['title'] === 'Face revocation request rejected' && str_contains($ffRejNotif['body'], $ffRejectNote), 'Reject sends in-app notification with Superadmin reason');

[, $ffBioAfterRej] = integration_http_get_json('/api/student/biometrics', $ffStuToken);
expect_true(
    array_key_exists('pendingRevokeRequest', $ffBioAfterRej)
    && $ffBioAfterRej['pendingRevokeRequest'] === null
    && ($ffBioAfterRej['latestRejectedRevokeRequest']['requestId'] ?? 0) === $ffReqId2
    && ($ffBioAfterRej['latestRejectedRevokeRequest']['reviewNote'] ?? '') === $ffRejectNote,
    'GET /api/student/biometrics surfaces latestRejectedRevokeRequest'
);

// Student can immediately submit a new revocation request after rejection.
[$ffReq3Status, $ffReq3Body] = integration_http_json('/api/student/biometrics/revoke-request', $ffStuToken, ['reason' => 'Verified ID at clinic office, retrying revocation']);
expect_same(201, $ffReq3Status, 'Student can immediately submit a new revoke request after rejection');
$ffApproveReq1Id = (int) ($ffReq3Body['request']['requestId'] ?? 0);

// (e) Superadmin Approve #1 (using sidecar-enabled server to verify physical .sface deletion) -> closes F2 as revoked, no F3 yet.
[$ffAppShortStatus] = $ffSidecarHttpJson('POST', '/api/admin/face-revoke-requests/approve', $superAccessToken, ['requestId' => $ffApproveReq1Id, 'note' => 'short']);
expect_same(422, $ffAppShortStatus, 'Superadmin approve rejects non-empty note shorter than 8 characters');
$ffSidecarCallsBeforeApp1 = count($ffReadSidecarLog());
[$ffApp1Status, $ffApp1Body] = $ffSidecarHttpJson('POST', '/api/admin/face-revoke-requests/approve', $superAccessToken, [
    'requestId' => $ffApproveReq1Id,
    'note' => 'Approved after clinic ID check.',
]);
expect_same(200, $ffApp1Status, 'Superadmin approves revocation request #1');
expect_same(false, $ffApp1Body['flagged'] ?? null, 'Approval #1 does not raise F3');
expect_same('approved', $ffApp1Body['request']['status'] ?? null, 'Approved request #1 has status approved');
$ffSidecarNewCallsApp1 = array_slice($ffReadSidecarLog(), $ffSidecarCallsBeforeApp1);
$ffRevokedOrigRef = false;
foreach ($ffSidecarNewCallsApp1 as $call) {
    if (($call['path'] ?? '') === '/v1/reference/revoke' && ($call['json']['protectedObjectReference'] ?? '') === $ffOriginalRef) {
        $ffRevokedOrigRef = true;
    }
}
expect_true($ffRevokedOrigRef, 'Superadmin approve physically deletes .sface via sidecar /v1/reference/revoke');
$ffProfileRow->execute([$ffStuId]);
$ffAfterApp1 = $ffProfileRow->fetch(PDO::FETCH_ASSOC);
expect_same(['revoked', 'declined', null], [$ffAfterApp1['enrollment_status'], $ffAfterApp1['consent_status'], $ffAfterApp1['protected_object_reference']], 'Approve sets enrollment_status revoked, consent_status declined, and clears reference');
$ffStuF2AfterApp1 = $ffFlags($ffStuId);
expect_same(['revoked'], array_column($ffStuF2AfterApp1, 'status'), 'Approve auto-closes open F2 flag as revoked');
$ffNotifStmt->execute([$ffStuUserId]);
$ffAppNotif = $ffNotifStmt->fetch(PDO::FETCH_ASSOC);
expect_true(is_array($ffAppNotif) && $ffAppNotif['title'] === 'Face revocation request approved' && str_contains($ffAppNotif['body'], 'Approved after clinic ID check.'), 'Approve sends in-app notification confirming deletion');
[$ffAppAgainStatus, $ffAppAgainBody] = integration_http_json('/api/admin/face-revoke-requests/approve', $superAccessToken, ['requestId' => $ffApproveReq1Id]);
expect_same(409, $ffAppAgainStatus, 'Approving an already approved request returns 409');
expect_same('request_not_pending', $ffAppAgainBody['code'] ?? null, 'Approving non-pending request returns request_not_pending');

// (f) Approval #2 -> no F3; Approval #3 -> raises F3 (approvedCount: 3); dismiss F3 -> Approval #4 -> new open F3 (approvedCount: 4).
$ffReActivate = static function (string $refTag) use ($pdo, $ffStuId): string {
    $ref = "sface/reenroll_{$refTag}_" . bin2hex(random_bytes(4));
    $pdo->prepare(
        "UPDATE biometric_profiles
            SET consent_status = 'approved', enrollment_status = 'active', face_enrolled = 1,
                protected_object_reference = ?, reference_expires_on = '2099-12-31', usable_sample_count = 25,
                enrolled_at = CURRENT_TIMESTAMP(6), revoked_at = NULL, revoked_by_user_id = NULL
          WHERE student_id = ?"
    )->execute([$ref, $ffStuId]);
    return $ref;
};

// Approval #2
$ffReActivate('r2');
[, $ffReq4] = integration_http_json('/api/student/biometrics/revoke-request', $ffStuToken, ['reason' => 'Re-enrolled on spare device, revoking #2']);
[$ffApp2Status, $ffApp2Body] = $ffSidecarHttpJson('POST', '/api/admin/face-revoke-requests/approve', $superAccessToken, ['requestId' => (int) $ffReq4['request']['requestId']]);
expect_same(200, $ffApp2Status, 'Superadmin approves revocation request #2');
expect_same(false, $ffApp2Body['flagged'] ?? null, 'Approval #2 does not raise F3');
expect_same(0, count(array_filter($ffFlags($ffStuId), static fn(array $r): bool => $r['kind'] === 'F3')), 'No F3 flag exists after 2 approved revocations');

// Approval #3 -> F3 raised (approvedCount: 3)
$ffReActivate('r3');
[, $ffReq5] = integration_http_json('/api/student/biometrics/revoke-request', $ffStuToken, ['reason' => 'Third device change in the same semester']);
[$ffApp3Status, $ffApp3Body] = $ffSidecarHttpJson('POST', '/api/admin/face-revoke-requests/approve', $superAccessToken, ['requestId' => (int) $ffReq5['request']['requestId']]);
expect_same(200, $ffApp3Status, 'Superadmin approves revocation request #3');
expect_same(true, $ffApp3Body['flagged'] ?? null, 'Approval #3 in the same term raises F3 (flagged: true)');
$ffF3RowsAfter3 = array_values(array_filter($ffFlags($ffStuId), static fn(array $r): bool => $r['kind'] === 'F3'));
expect_true(count($ffF3RowsAfter3) === 1 && $ffF3RowsAfter3[0]['status'] === 'open', '3rd approved revoke raises one open F3');
$ffF3Detail3 = json_decode($ffF3RowsAfter3[0]['detail'], true);
expect_same(3, $ffF3Detail3['approvedCount'] ?? null, 'F3 detail records approvedCount 3');

// Dismiss F3, then Approval #4 -> new open F3 (approvedCount: 4)
[$ffDismissF3Status] = integration_http_json('/api/admin/face-flags/dismiss', $superAccessToken, [
    'flagId' => (int) $ffF3RowsAfter3[0]['flag_id'],
    'note' => 'Met with Student to discuss device changes',
]);
expect_same(200, $ffDismissF3Status, 'Superadmin dismisses F3 flag');

$ffReActivate('r4');
[, $ffReq6] = integration_http_json('/api/student/biometrics/revoke-request', $ffStuToken, ['reason' => 'Fourth revocation request after F3 dismissal']);
[$ffApp4Status, $ffApp4Body] = $ffSidecarHttpJson('POST', '/api/admin/face-revoke-requests/approve', $superAccessToken, ['requestId' => (int) $ffReq6['request']['requestId']]);
expect_same(200, $ffApp4Status, 'Superadmin approves revocation request #4');
expect_same(true, $ffApp4Body['flagged'] ?? null, 'Approval #4 raises F3 again');
$ffF3RowsAfter4 = array_values(array_filter($ffFlags($ffStuId), static fn(array $r): bool => $r['kind'] === 'F3'));
expect_same(['dismissed', 'open'], array_column($ffF3RowsAfter4, 'status'), 'Dismissing F3 and approving a 4th raises a new open F3');
expect_same(4, json_decode($ffF3RowsAfter4[1]['detail'], true)['approvedCount'] ?? null, 'New open F3 records approvedCount 4');

// (g) Superadmin direct revoke while a Student revoke request is pending auto-cancels the pending request and does not count toward F3.
$ffReActivate('r5');
[, $ffReq7] = integration_http_json('/api/student/biometrics/revoke-request', $ffStuToken, ['reason' => 'Pending request before Superadmin direct revoke']);
$ffPendingDirectId = (int) ($ffReq7['request']['requestId'] ?? 0);
[$ffDirectRevokeStatus] = $ffSidecarHttpJson('POST', '/api/admin/biometrics/revoke', $superAccessToken, [
    'studentId' => $ffStuId,
    'reason' => 'Direct Superadmin revocation from People & Accounts',
]);
expect_same(200, $ffDirectRevokeStatus, 'Superadmin direct revoke succeeds while a Student request is pending');
$ffReqStatusStmt = $pdo->prepare('SELECT status, cancelled_at FROM face_revoke_requests WHERE request_id = ?');
$ffReqStatusStmt->execute([$ffPendingDirectId]);
$ffDirectCancelledRow = $ffReqStatusStmt->fetch(PDO::FETCH_ASSOC);
expect_true($ffDirectCancelledRow['status'] === 'cancelled' && $ffDirectCancelledRow['cancelled_at'] !== null, 'Direct Superadmin revoke auto-cancels pending Student request');
$ffF3RowsAfterDirect = array_values(array_filter($ffFlags($ffStuId), static fn(array $r): bool => $r['kind'] === 'F3'));
expect_same(['dismissed', 'revoked'], array_column($ffF3RowsAfterDirect, 'status'), 'Direct Superadmin revoke closes open F3 as revoked and does not count toward F3');

// Term-end sweep & inactivity auto-cancel pending revoke requests.
$ffReActivate('r6');
[, $ffReq8] = integration_http_json('/api/student/biometrics/revoke-request', $ffStuToken, ['reason' => 'Pending request before Faculty marks inactive']);
$ffPendingInactiveId = (int) ($ffReq8['request']['requestId'] ?? 0);
[$ffInactStatus] = $ffSidecarHttpJson('PUT', '/api/faculty/students/' . $ffStuId, $seedFacultyAccessToken, ['status' => 'disabled']);
expect_same(200, $ffInactStatus, 'Faculty sets Student inactive');
$ffReqStatusStmt->execute([$ffPendingInactiveId]);
expect_same('cancelled', $ffReqStatusStmt->fetchColumn(), 'Setting Student inactive auto-cancels pending revoke request');

// Legacy sweep test on a separate fixture student + pending request.
$ffSweep = $ffNew('Sweep');
$pdo->prepare("UPDATE biometric_profiles SET enrollment_status = 'enrolling', reference_expires_on = '2020-12-31' WHERE student_id = ?")->execute([$ffSweep]);
$pdo->prepare(
    "INSERT INTO face_revoke_requests (student_id, school_year, semester, reason, status, requested_by_user_id)
     VALUES (?, ?, '1ST', 'Pending request before term-end expiry', 'pending', ?)"
)->execute([$ffSweep, academic_current_school_year($pdo), $ffStuUserId]);
exec(escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg(__DIR__ . '/../../backend/bin/expire-biometrics.php') . ' 2>&1', $ffSweepOutput);
$ffStatusStmt = $pdo->prepare('SELECT enrollment_status FROM biometric_profiles WHERE student_id = ?');
$ffStatusStmt->execute([$ffSweep]);
expect_same('expired', $ffStatusStmt->fetchColumn(), 'The sweep expires an enrollment with an old expiry date: ' . implode(' | ', array_slice($ffSweepOutput, -2)));
$ffSweepReqStmt = $pdo->prepare("SELECT status FROM face_revoke_requests WHERE student_id = ?");
$ffSweepReqStmt->execute([$ffSweep]);
expect_same('cancelled', $ffSweepReqStmt->fetchColumn(), 'The sweep auto-cancels a pending revoke request on term expiry');
