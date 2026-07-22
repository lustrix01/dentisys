<?php

declare(strict_types=1);

if (!function_exists('sanitize_for_log')) {
    function sanitize_for_log(\Throwable $e): string
    {
        return get_class($e) . ' [' . ($e->getCode() > 0 ? $e->getCode() : 0) . ']';
    }
}

/**
 * Admin action to send Data Privacy Consent Forms to students with pending consent status.
 */
function handle_admin_send_consent_forms(): void
{
    $context = [
        'request_id' => request_id(),
        'ip_address' => request_ip(),
        'user_agent' => request_user_agent(),
        'http_method' => request_method(),
        'endpoint' => request_path(),
        'auth_header' => request_header('Authorization') ?? '',
    ];

    try {
        $config = app_config();
        $pdo = create_pdo($config);

        // Require admin privileges
        $token = auth_extract_bearer_token($context['auth_header']);
        $jwtKey = config_key_bytes_at_least($config['jwt']['signing_key_b64'], 32, 'JWT_SIGNING_KEY');
        $authCtx = auth_verify_access_token($pdo, $token, $jwtKey);

        if ($authCtx['role'] !== 'admin') {
            safe_error_response('Administrator privileges required.', 403);
            return;
        }

        // Fetch students with consent_status = 'pending' (or missing biometric_profile entry)
        $stmt = $pdo->query("
            SELECT s.student_id, s.student_number, s.first_name, s.last_name, s.bu_email,
                   COALESCE(b.consent_status, 'pending') AS consent_status
            FROM students s
            LEFT JOIN biometric_profiles b ON s.student_id = b.student_id
            WHERE s.status = 'active'
              AND (b.consent_status IS NULL OR LOWER(b.consent_status) = 'pending')
        ");
        $students = $stmt ? $stmt->fetchAll(PDO::FETCH_ASSOC) : [];

        if (empty($students)) {
            json_response([
                'status' => 'ok',
                'message' => 'No active students with pending consent status found.',
                'sent_count' => 0,
            ], 200);
            return;
        }

        $sentCount = 0;
        $failedCount = 0;

        foreach ($students as $stu) {
            $studentId = (int) $stu['student_id'];
            $studentEmail = $stu['bu_email'];
            $studentName = trim($stu['first_name'] . ' ' . $stu['last_name']);

            if (empty($studentEmail) || !filter_var($studentEmail, FILTER_VALIDATE_EMAIL)) {
                $failedCount++;
                continue;
            }

            // Ensure biometric profile exists
            $ensProf = $pdo->prepare("
                INSERT INTO biometric_profiles (student_id, consent_status, face_enrolled)
                VALUES (?, 'pending', 0)
                ON DUPLICATE KEY UPDATE updated_at = NOW(6)
            ");
            $ensProf->execute([$studentId]);

            // Generate secure consent token (valid for 30 days)
            $rawToken = bin2hex(random_bytes(16));
            $tokenHash = hash('sha256', $rawToken);

            $now = new DateTimeImmutable('now', new DateTimeZone('UTC'));
            $nowSql = $now->format('Y-m-d H:i:s.u');
            $expiresSql = $now->add(new DateInterval('P30D'))->format('Y-m-d H:i:s.u');

            $metaJson = json_encode([
                'student_id' => $studentId,
                'student_number' => $stu['student_number'],
                'student_email' => $studentEmail,
            ]);

            $pdo->beginTransaction();
            try {
                $macKey = config_key_bytes_at_least($config['audit']['mac_key_b64'], 32, 'AUDIT_MAC_KEY');
                $auditCtx = audit_begin_operation($pdo);

                $insToken = $pdo->prepare(
                    "INSERT INTO security_tokens (purpose, related_student_id, secret_hash, issued_at, expires_at, metadata_json)
                     VALUES ('privacy_consent', ?, ?, ?, ?, ?)"
                );
                $insToken->execute([$studentId, $tokenHash, $nowSql, $expiresSql, $metaJson]);
                $stId = (int) $pdo->lastInsertId();

                $consentLink = "http://localhost:5173/consent?token={$rawToken}";
                $subject = "DentiSys Biometric Data Privacy Consent Form";

                $htmlBody = "
                    <h2>DentiSys - Biometric Data Privacy Notice & Consent Form</h2>
                    <p>Dear <strong>" . htmlspecialchars($studentName) . "</strong>,</p>
                    <p>Bicol University College of Dentistry utilizes facial recognition biometrics for automated attendance recording during clinical laboratory sessions.</p>
                    <p>In accordance with Republic Act No. 10173 (Data Privacy Act of 2012), your explicit consent is required prior to collecting and processing your facial biometric templates.</p>
                    <p>Please click the button below to review the full privacy policy and submit your consent decision:</p>
                    <p><a href='" . htmlspecialchars($consentLink) . "' style='padding:12px 20px; background-color:#0d9488; color:#ffffff; text-decoration:none; border-radius:4px; font-weight:bold;'>Review & Submit Consent Form</a></p>
                    <p>Direct Link: <code>" . htmlspecialchars($consentLink) . "</code></p>
                    <p><em>Note: If you choose to decline, alternative manual attendance tracking will be provided without academic penalty.</em></p>
                ";

                $textBody = "DentiSys Data Privacy Consent Form\n\nDear {$studentName},\n\nPlease review and complete your Biometric Data Privacy Consent Form:\n{$consentLink}";

                $emailRes = send_system_email(
                    $pdo,
                    $studentEmail,
                    $studentName,
                    $subject,
                    $htmlBody,
                    $textBody,
                    'Privacy Consent',
                    true
                );

                audit_finish_operation($pdo, $auditCtx, [
                    'module_code' => 'consent',
                    'action_code' => 'consent_form_dispatched',
                    'event_status' => 'Success',
                    'actor_user_id' => $authCtx['user_id'],
                    'actor_username' => $authCtx['login_email'],
                    'actor_role' => $authCtx['role'],
                    'actor_display_name' => $authCtx['display_name'],
                    'session_id' => $authCtx['session_id'],
                    'target_type' => 'security_token',
                    'target_id' => (string) $stId,
                    'description' => "Dispatched privacy consent form email to student #{$studentId} ({$studentEmail}).",
                    'reason' => null,
                    'http_method' => $context['http_method'],
                    'endpoint' => $context['endpoint'],
                    'request_id' => $context['request_id'],
                    'ip_address' => $context['ip_address'],
                    'user_agent' => $context['user_agent'],
                ], $macKey);

                $pdo->commit();
                $sentCount++;
            } catch (\Throwable $e) {
                if ($pdo->inTransaction()) { $pdo->rollBack(); }
                error_log("Consent send error for student #{$studentId}: " . sanitize_for_log($e));
                $failedCount++;
            }
        }

        json_response([
            'status' => 'ok',
            'message' => "Consent forms processed. Sent: {$sentCount}, Failed/Skipped: {$failedCount}.",
            'sent_count' => $sentCount,
            'failed_count' => $failedCount,
        ], 200);
    } catch (\Throwable $e) {
        error_log('Admin send consent forms error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

/**
 * Endpoint to verify consent token when accessed by student.
 */
function handle_verify_consent_token(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);

        $token = $_GET['token'] ?? '';
        if ($token === '' || !preg_match('/^[a-f0-9]{32}$/', $token)) {
            safe_error_response('Invalid or missing consent token.', 400);
            return;
        }

        $tokenHash = hash('sha256', $token);
        $stmt = $pdo->prepare("
            SELECT st.token_id, st.related_student_id, st.expires_at, st.used_at, st.revoked_at,
                   s.student_number, s.first_name, s.last_name, s.bu_email,
                   COALESCE(b.consent_status, 'pending') AS consent_status
            FROM security_tokens st
            LEFT JOIN students s ON st.related_student_id = s.student_id
            LEFT JOIN biometric_profiles b ON s.student_id = b.student_id
            WHERE st.purpose = 'privacy_consent' AND st.secret_hash = ?
        ");
        $stmt->execute([$tokenHash]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($row === false) {
            safe_error_response('Consent token not found or invalid.', 404);
            return;
        }

        if ($row['revoked_at'] !== null || $row['used_at'] !== null) {
            safe_error_response('This consent link has already been used or expired.', 400);
            return;
        }

        $expiresAt = new DateTimeImmutable($row['expires_at'], new DateTimeZone('UTC'));
        if ($expiresAt <= new DateTimeImmutable('now', new DateTimeZone('UTC'))) {
            safe_error_response('Consent link has expired.', 400);
            return;
        }

        json_response([
            'status' => 'ok',
            'token' => $token,
            'student' => [
                'student_id' => (int) $row['related_student_id'],
                'student_number' => $row['student_number'],
                'name' => trim($row['first_name'] . ' ' . $row['last_name']),
                'email' => $row['bu_email'],
                'current_consent_status' => $row['consent_status'],
            ],
            'privacy_notice' => [
                'title' => 'Bicol University College of Dentistry - Biometric Data Privacy Notice',
                'effective_date' => '2026-01-01',
                'compliance' => 'RA 10173 (Data Privacy Act of 2012)',
                'summary' => 'DentiSys collects facial biometric data solely for recording laboratory class attendance. Data is encrypted and strictly stored within university servers. If you decline consent, alternative manual attendance tracking will be used.',
            ]
        ], 200);
    } catch (\Throwable $e) {
        error_log('Verify consent token error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

/**
 * Endpoint for student to submit consent decision ('approved' or 'declined').
 */
function handle_submit_consent(): void
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

        $body = request_body();
        if (!$body['has_body']) {
            safe_error_response('Request body required.', 400);
            return;
        }

        $data = $body['data'];
        $token = $data['token'] ?? '';
        $decision = strtolower(trim($data['decision'] ?? '')); // 'approved' or 'declined'

        if ($token === '' || !preg_match('/^[a-f0-9]{32}$/', $token)) {
            safe_error_response('Invalid or missing consent token.', 400);
            return;
        }

        if (!in_array($decision, ['approved', 'declined'], true)) {
            safe_error_response("Decision must be either 'approved' or 'declined'.", 400);
            return;
        }

        $tokenHash = hash('sha256', $token);
        $stmt = $pdo->prepare("
            SELECT st.token_id, st.related_student_id, st.expires_at, st.used_at, st.revoked_at,
                   s.student_number, s.first_name, s.last_name, s.bu_email,
                   COALESCE(b.consent_status, 'pending') AS consent_status
            FROM security_tokens st
            LEFT JOIN students s ON st.related_student_id = s.student_id
            LEFT JOIN biometric_profiles b ON s.student_id = b.student_id
            WHERE st.purpose = 'privacy_consent' AND st.secret_hash = ?
        ");
        $stmt->execute([$tokenHash]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($row === false || $row['revoked_at'] !== null || $row['used_at'] !== null) {
            safe_error_response('Invalid or already used consent token.', 400);
            return;
        }

        $expiresAt = new DateTimeImmutable($row['expires_at'], new DateTimeZone('UTC'));
        if ($expiresAt <= new DateTimeImmutable('now', new DateTimeZone('UTC'))) {
            safe_error_response('Consent token has expired.', 400);
            return;
        }

        $studentId = (int) $row['related_student_id'];
        $studentName = trim($row['first_name'] . ' ' . $row['last_name']);
        $nowSql = (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d H:i:s.u');

        $pdo->beginTransaction();
        try {
            $macKey = config_key_bytes_at_least($config['audit']['mac_key_b64'], 32, 'AUDIT_MAC_KEY');
            $auditCtx = audit_begin_operation($pdo);

            // Mark token as used
            $markUsed = $pdo->prepare("UPDATE security_tokens SET used_at = ? WHERE token_id = ?");
            $markUsed->execute([$nowSql, $row['token_id']]);

            // Update biometric_profile & enable/disable biometric attendance
            if ($decision === 'approved') {
                $updBio = $pdo->prepare("
                    INSERT INTO biometric_profiles (student_id, consent_status, face_enrolled, consent_responded_at, consent_ip, consent_version)
                    VALUES (?, 'approved', 1, ?, ?, '1.0')
                    ON DUPLICATE KEY UPDATE
                        consent_status = 'approved',
                        face_enrolled = 1,
                        consent_responded_at = ?,
                        consent_ip = ?,
                        consent_version = '1.0'
                ");
                $updBio->execute([$studentId, $nowSql, $context['ip_address'], $nowSql, $context['ip_address']]);
                $msg = 'Consent approved. Biometric attendance has been enabled for your account.';
            } else {
                $updBio = $pdo->prepare("
                    INSERT INTO biometric_profiles (student_id, consent_status, face_enrolled, template_reference, image_references, consent_responded_at, consent_ip, consent_version)
                    VALUES (?, 'declined', 0, NULL, NULL, ?, ?, '1.0')
                    ON DUPLICATE KEY UPDATE
                        consent_status = 'declined',
                        face_enrolled = 0,
                        template_reference = NULL,
                        image_references = NULL,
                        consent_responded_at = ?,
                        consent_ip = ?,
                        consent_version = '1.0'
                ");
                $updBio->execute([$studentId, $nowSql, $context['ip_address'], $nowSql, $context['ip_address']]);
                $msg = 'Consent declined. Biometric attendance disabled; manual attendance will be required.';
            }

            audit_finish_operation($pdo, $auditCtx, [
                'module_code' => 'consent',
                'action_code' => 'consent_submitted',
                'event_status' => 'Success',
                'actor_user_id' => null,
                'actor_username' => $row['bu_email'],
                'actor_role' => 'student',
                'actor_display_name' => $studentName,
                'session_id' => null,
                'target_type' => 'student',
                'target_id' => (string) $studentId,
                'description' => "Student {$studentName} submitted consent decision: {$decision}.",
                'reason' => null,
                'http_method' => $context['http_method'],
                'endpoint' => $context['endpoint'],
                'request_id' => $context['request_id'],
                'ip_address' => $context['ip_address'],
                'user_agent' => $context['user_agent'],
            ], $macKey);

            $pdo->commit();

            json_response([
                'status' => 'ok',
                'decision' => $decision,
                'message' => $msg,
            ], 200);
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) { $pdo->rollBack(); }
            throw $e;
        }
    } catch (\Throwable $e) {
        error_log('Submit consent error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}
