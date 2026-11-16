<?php

declare(strict_types=1);
require_once __DIR__ . '/../../backend/app/request.php';
// Included by the full disposable PostgreSQL suite after Faculty/Admin login.
expect_true((bool) $pdo->query("SELECT has_table_privilege(current_user, 'academic_terms', 'SELECT,INSERT,UPDATE,DELETE')")->fetchColumn(), 'Migration grants academic_terms to the application role');
expect_true((bool) $pdo->query("SELECT has_sequence_privilege(current_user, pg_get_serial_sequence('academic_terms', 'id'), 'USAGE')")->fetchColumn(), 'Migration grants the academic-term identity sequence');
[$termForbidden] = integration_http_get_json('/api/admin/academic-terms', $seedFacultyAccessToken);
expect_same(403, $termForbidden, 'Faculty cannot manage Dean terms');
[$termAnonymous] = integration_http_get_json('/api/admin/academic-terms', '');
expect_same(401, $termAnonymous, 'Academic terms require authentication');
[$termListStatus, $termList] = integration_http_get_json('/api/admin/academic-terms', $adminAccessToken);
expect_same(200, $termListStatus, 'Dean term list returns authoritative current year and class counts');
expect_true(count($termList['terms'] ?? []) > 0, 'Term list includes seeded classes and defined terms');
$termFixtureYear = '2087-2088';
$termPayload = ['schoolYear' => $termFixtureYear, 'semester' => '1ST', 'startDate' => '2087-08-01', 'endDate' => '2087-12-31'];
[$termCreateStatus, $termCreate] = integration_http_json('/api/admin/academic-terms', $adminAccessToken, $termPayload);
expect_same(200, $termCreateStatus, 'Dean can create an unused term');
$termId = (int) ($termCreate['id'] ?? 0);
expect_true($termId > 0, 'Created term has a database identity');
[$termDuplicateStatus] = integration_http_json('/api/admin/academic-terms', $adminAccessToken, $termPayload);
expect_same(422, $termDuplicateStatus, 'Duplicate term identity has a field error');
[$termOrderStatus] = integration_http_json('/api/admin/academic-terms', $adminAccessToken, array_merge($termPayload, ['semester' => '2ND', 'endDate' => '2087-08-01']));
expect_same(422, $termOrderStatus, 'Date order is validated server-side');
[$termOverlapStatus] = integration_http_json('/api/admin/academic-terms', $adminAccessToken, array_merge($termPayload, ['semester' => '2ND', 'startDate' => '2087-12-31', 'endDate' => '2088-02-01']));
expect_same(422, $termOverlapStatus, 'Sharing an end calendar day counts as overlap');
foreach ([['2087-08-01', '2087-08-01'], ['2087-09-01', '2087-12-31']] as $dates) {
    try {
        $pdo->prepare("INSERT INTO academic_terms(school_year, semester, start_date, end_date) VALUES (?, '1ST', ?, ?)")->execute([$termFixtureYear, ...$dates]);
        expect_true(false, 'Migration rejects invalid dates or duplicate identity');
    } catch (PDOException $e) { expect_true(in_array($e->getCode(), ['23514', '23505'], true), 'Migration independently enforces order and uniqueness'); }
}
// Isolated Student/classes: test fallback, canonical Summer, active membership,
// source attribution and date propagation without altering the demo profiles.
$termStudentInsert = $pdo->prepare("INSERT INTO students(student_number, first_name, last_name, status) VALUES (?, 'Term', 'Fixture', 'active') RETURNING student_id");
$termStudentInsert->execute(['TERM-' . strtoupper(bin2hex(random_bytes(4)))]);
$termStudentId = (int) $termStudentInsert->fetchColumn();
$termFacultyId = (int) $pdo->query("SELECT user_id FROM user_accounts WHERE login_email = 'faculty@bicol-u.edu.ph'")->fetchColumn();
$termClassInsert = $pdo->prepare("INSERT INTO class_sections(cs_name, course_id, instructor_user_id, semester, school_year, status, term_start_date, term_end_date)
    VALUES (?, 1, ?, ?, ?, 'Active', ?, ?) RETURNING cs_id");
$termClassInsert->execute(['TERM-FIRST', $termFacultyId, '1ST', $termFixtureYear, '2087-01-01', '2087-10-01']);
$termClassId = (int) $termClassInsert->fetchColumn();
$termClassInsert->execute(['TERM-SUMMER', $termFacultyId, 'SUMMER', $termFixtureYear, '2088-05-01', '2088-07-31']);
$termSummerClassId = (int) $termClassInsert->fetchColumn();
$termEnrollment = $pdo->prepare("INSERT INTO enrollments(student_id, cs_id, status) VALUES (?, ?, 'Active')");
$termEnrollment->execute([$termStudentId, $termClassId]);
expect_same('2087-12-31', student_biometric_reference_expiry($pdo, $termStudentId), 'Dean end overrides a different stored class end');
$termEnrollment->execute([$termStudentId, $termSummerClassId]);
expect_same('2088-07-31', student_biometric_reference_expiry($pdo, $termStudentId), 'Latest active fallback class supplies expiry when Summer has no Dean term');
$pdo->prepare("UPDATE enrollments SET status = 'Archived' WHERE student_id = ? AND cs_id = ?")->execute([$termStudentId, $termSummerClassId]);
expect_same('2087-12-31', student_biometric_reference_expiry($pdo, $termStudentId), 'Archived enrollments do not contribute to expiry');
[$termDeleteUsedStatus] = integration_http_json('/api/admin/academic-terms/delete', $adminAccessToken, ['id' => $termId]);
expect_same(422, $termDeleteUsedStatus, 'A term with any class cannot be deleted');
$pdo->prepare("INSERT INTO biometric_profiles(student_id, consent_status, enrollment_status, face_enrolled, protected_object_reference, reference_expires_on, reference_term_id, reference_cs_id, usable_sample_count, enrolled_at)
    VALUES (?, 'approved', 'active', 1, 'term-fixture-protected-object', '2087-12-31', ?, ?, 20, CURRENT_TIMESTAMP(6))")->execute([$termStudentId, $termId, $termClassId]);
$readTermProfile = static function () use ($pdo, $termStudentId): array {
    $stmt = $pdo->prepare('SELECT enrollment_status, protected_object_reference, reference_expires_on, reference_term_id, reference_cs_id FROM biometric_profiles WHERE student_id = ?');
    $stmt->execute([$termStudentId]); return $stmt->fetch(PDO::FETCH_ASSOC);
};
[$termExtendStatus] = integration_http_json('/api/admin/academic-terms', $adminAccessToken, array_merge($termPayload, ['id' => $termId, 'endDate' => '2088-01-31']));
expect_same(200, $termExtendStatus, 'Dean end-date change succeeds');
expect_same('2088-01-31', $readTermProfile()['reference_expires_on'], 'Stored unexpired expiry propagates in the Dean save transaction');
$pdo->prepare('UPDATE biometric_profiles SET reference_term_id = NULL, reference_cs_id = NULL WHERE student_id = ?')->execute([$termStudentId]);
[$termLegacyStatus] = integration_http_json('/api/admin/academic-terms', $adminAccessToken, $termPayload + ['id' => $termId]);
expect_same(200, $termLegacyStatus, 'Legacy expiry provenance is inferred safely');
expect_same('2087-12-31', $readTermProfile()['reference_expires_on'], 'Legacy unexpired enrollment follows the term change');
expect_same((string) $termId, (string) $readTermProfile()['reference_term_id'], 'Legacy enrollment now records its source term');
// Same transaction rollback includes date propagation and audit state.
$termActor = ['user_id' => (int) $pdo->query("SELECT user_id FROM user_accounts WHERE login_email = 'admin@bicol-u.edu.ph'")->fetchColumn(), 'role' => 'admin'];
$pdo->beginTransaction();
academic_terms_lock($pdo);
academic_term_save($pdo, app_config(), $termActor, array_merge($termPayload, ['id' => $termId, 'endDate' => '2088-02-01']));
$pdo->rollBack();
expect_same('2087-12-31', $readTermProfile()['reference_expires_on'], 'Rollback restores the propagated expiry');
$todayTerm = app_local_date(app_config(), attendance_session_now_utc());
$pastTermEnd = (new DateTimeImmutable($todayTerm))->modify('-1 day')->format('Y-m-d');
$pastTermStart = (new DateTimeImmutable($todayTerm))->modify('-90 days')->format('Y-m-d');
$todayPayload = array_merge($termPayload, ['id' => $termId, 'startDate' => $pastTermStart, 'endDate' => $todayTerm]);
[$termTodayPreviewStatus, $termTodayPreview] = integration_http_json('/api/admin/academic-terms/preview', $adminAccessToken, $todayPayload);
expect_same(200, $termTodayPreviewStatus, 'Dean can preview an end date of today');
expect_same(false, $termTodayPreview['confirmationRequired'] ?? null, 'End date today requires no confirmation');
expect_same(0, $termTodayPreview['expiringEnrollments'] ?? null, 'End date today counts zero expired enrollments');
[$termTodaySaveStatus, $termTodaySave] = integration_http_json('/api/admin/academic-terms', $adminAccessToken, $todayPayload);
expect_same(200, $termTodaySaveStatus, 'End date today saves without a confirmation count');
expect_same(false, $termTodaySave['confirmationRequired'] ?? null, 'Same-day save proceeds immediately');
expect_same($todayTerm, $readTermProfile()['reference_expires_on'], 'Same-day save propagates the calendar date');
expect_true(!student_biometric_expiry_due($pdo, $termStudentId, $todayTerm, $todayTerm), 'Reference remains valid through today');
expect_same('term-fixture-protected-object', $readTermProfile()['protected_object_reference'], 'Same-day save preserves biometric material');
[$termTodayRestoreStatus] = integration_http_json('/api/admin/academic-terms', $adminAccessToken, $termPayload + ['id' => $termId]);
expect_same(200, $termTodayRestoreStatus, 'Restore the unexpired fixture after the same-day boundary check');
$shortenPayload = array_merge($termPayload, ['id' => $termId, 'startDate' => $pastTermStart, 'endDate' => $pastTermEnd]);
[$termPreviewStatus, $termPreview] = integration_http_json('/api/admin/academic-terms/preview', $adminAccessToken, $shortenPayload);
expect_same(200, $termPreviewStatus, 'Dean can preview an expired end-date change');
expect_same(1, $termPreview['expiringEnrollments'] ?? null, 'Preview gives the exact number of unexpired enrollments affected');
expect_same('2087-12-31', $readTermProfile()['reference_expires_on'], 'Preview never mutates an expiry');
[$termUnconfirmedStatus, $termUnconfirmed] = integration_http_json('/api/admin/academic-terms', $adminAccessToken, $shortenPayload);
expect_same(true, $termUnconfirmed['confirmationRequired'] ?? null, 'Server refuses to save an unconfirmed expired end');
expect_same('2087-12-31', $readTermProfile()['reference_expires_on'], 'Unconfirmed save leaves the profile intact');
[$termShortenedStatus] = integration_http_json('/api/admin/academic-terms', $adminAccessToken, $shortenPayload + ['confirmedExpiringEnrollments' => 1]);
expect_same(200, $termShortenedStatus, 'Confirmed shortening saves');
expect_same($pastTermEnd, $readTermProfile()['reference_expires_on'], 'Confirmed shortening propagates the past date');
expect_same('active', $readTermProfile()['enrollment_status'], 'Dean request leaves enrollment status for the expiry run');
expect_same('term-fixture-protected-object', $readTermProfile()['protected_object_reference'], 'Dean request preserves protected material for the expiry run');
expect_true(student_biometric_expiry_due($pdo, $termStudentId, $pastTermEnd, $todayTerm), 'Shared sweep decision expires the shortened reference');
try { student_biometric_reference_expiry($pdo, $termStudentId); expect_true(false, 'Ended term must refuse enrollment'); }
catch (StudentBiometricException $e) { expect_same('This term has ended.', $e->getMessage(), 'Ended-term enrollment error is clear'); }
// The executable sweep resolves legacy active classes even when a stored date
// is stale. No provider object was created for this synthetic profile.
$pdo->prepare("UPDATE biometric_profiles SET enrollment_status = 'enrolling', face_enrolled = 0, protected_object_reference = NULL, reference_expires_on = '2099-12-31', reference_term_id = NULL, reference_cs_id = NULL WHERE student_id = ?")->execute([$termStudentId]);
$termSweepCommand = escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg(__DIR__ . '/../../backend/bin/expire-biometrics.php');
exec($termSweepCommand . ' --dry-run 2>&1', $termDrySweepOutput, $termDrySweepExit);
expect_same(0, $termDrySweepExit, 'Expiry dry-run executes successfully: ' . implode(' | ', $termDrySweepOutput));
expect_true(str_contains(implode(' | ', $termDrySweepOutput), 'student #' . $termStudentId), 'Dry-run finds an ended Dean term through shared resolution');
expect_same('enrolling', $readTermProfile()['enrollment_status'], 'Dry-run preserves enrollment state');
exec($termSweepCommand . ' 2>&1', $termSweepOutput, $termSweepExit);
expect_same(0, $termSweepExit, 'Expiry sweep executes successfully: ' . implode(' | ', $termSweepOutput));
expect_same('expired', $readTermProfile()['enrollment_status'], 'Sweep expires a legacy enrollment using the Dean date');
// Restore the isolated term, retire the synthetic reference, and verify Summer
// canonical linkage without calling a disabled real biometric provider.
integration_http_json('/api/admin/academic-terms', $adminAccessToken, $termPayload + ['id' => $termId]);
$pdo->prepare("UPDATE biometric_profiles SET enrollment_status = 'expired', face_enrolled = 0, protected_object_reference = NULL, reference_expires_on = NULL, usable_sample_count = NULL WHERE student_id = ?")->execute([$termStudentId]);
[$termSummerStatus, $termSummer] = integration_http_json('/api/admin/academic-terms', $adminAccessToken, ['schoolYear' => $termFixtureYear, 'semester' => 'Summer', 'startDate' => '2088-05-01', 'endDate' => '2088-08-31']);
expect_same(200, $termSummerStatus, 'Canonical Dean Summer term is accepted');
$summerResolved = academic_resolve_class_term_dates(['school_year' => $termFixtureYear, 'semester' => 'SUMMER'], academic_terms_read($pdo));
expect_same('2088-08-31', $summerResolved['endDate'], 'Uppercase class Summer resolves to canonical Dean Summer');
// The Student joins Summer after enrolling against 1ST. Joining alone must not
// extend the stored expiry; a Dean Summer edit must recompute it even though
// Summer was not its original source.
$pdo->prepare("UPDATE biometric_profiles SET enrollment_status = 'active', face_enrolled = 1, protected_object_reference = 'term-fixture-protected-object',
    reference_expires_on = '2087-12-31', reference_term_id = ?, reference_cs_id = ?, usable_sample_count = 20, enrolled_at = CURRENT_TIMESTAMP(6), revoked_at = NULL WHERE student_id = ?")
    ->execute([$termId, $termClassId, $termStudentId]);
$pdo->prepare("UPDATE enrollments SET status = 'Active' WHERE student_id = ? AND cs_id = ?")->execute([$termStudentId, $termSummerClassId]);
expect_same('2087-12-31', $readTermProfile()['reference_expires_on'], 'Joining Summer alone keeps the existing expiry');
$summerEditPayload = ['id' => (int) $termSummer['id'], 'schoolYear' => $termFixtureYear, 'semester' => 'Summer', 'startDate' => '2088-05-01', 'endDate' => '2088-09-30'];
$pdo->beginTransaction();
academic_terms_lock($pdo);
academic_term_save($pdo, app_config(), $termActor, $summerEditPayload);
expect_same('2088-09-30', $readTermProfile()['reference_expires_on'], 'Editing another active-class term recomputes expiry inside its transaction');
$pdo->rollBack();
expect_same('2087-12-31', $readTermProfile()['reference_expires_on'], 'Rollback restores the expiry from before the other-term edit');
expect_same((string) $termId, (string) $readTermProfile()['reference_term_id'], 'Rollback restores the original source term');
[$termOtherExtendStatus] = integration_http_json('/api/admin/academic-terms', $adminAccessToken, $summerEditPayload);
expect_same(200, $termOtherExtendStatus, 'Dean can extend an active term that was not the enrollment source');
expect_same('2088-09-30', $readTermProfile()['reference_expires_on'], 'Other-term extension replaces the earlier stored expiry');
expect_same((string) $termSummer['id'], (string) $readTermProfile()['reference_term_id'], 'Other-term extension records Summer as the new source');
expect_same((string) $termSummerClassId, (string) $readTermProfile()['reference_cs_id'], 'Other-term extension records the supplying class');
expect_true(!student_biometric_expiry_due($pdo, $termStudentId, $readTermProfile()['reference_expires_on'], '2088-01-01'), 'Other-term extension prevents deletion after the former 1ST expiry');
expect_same('active', $readTermProfile()['enrollment_status'], 'Other-term extension keeps the enrollment active');
expect_same('term-fixture-protected-object', $readTermProfile()['protected_object_reference'], 'Other-term extension preserves biometric material');
// Shorten Summer while another active term ends later: the latter supplies both
// the expiry and its provenance, regardless of the earlier stored source.
[$termLaterCreateStatus, $termLater] = integration_http_json('/api/admin/academic-terms', $adminAccessToken,
    ['schoolYear' => '2088-2089', 'semester' => '1ST', 'startDate' => '2088-10-01', 'endDate' => '2089-02-28']);
expect_same(200, $termLaterCreateStatus, 'Later active-term fixture can be defined');
$termClassInsert->execute(['TERM-LATER-FIRST', $termFacultyId, '1ST', '2088-2089', null, null]);
$termLaterClassId = (int) $termClassInsert->fetchColumn();
$termEnrollment->execute([$termStudentId, $termLaterClassId]);
expect_same('2088-09-30', $readTermProfile()['reference_expires_on'], 'Joining the later class alone keeps the Summer expiry');
[$termShortenLaterStatus] = integration_http_json('/api/admin/academic-terms', $adminAccessToken, array_merge($summerEditPayload, ['endDate' => '2088-08-31']));
expect_same(200, $termShortenLaterStatus, 'Dean can shorten the source while a later active term exists');
expect_same('2089-02-28', $readTermProfile()['reference_expires_on'], 'Shortening the source keeps the latest other active-class end');
expect_same((string) $termLater['id'], (string) $readTermProfile()['reference_term_id'], 'Shortening moves provenance to the latest remaining term');
expect_same((string) $termLaterClassId, (string) $readTermProfile()['reference_cs_id'], 'Shortening records the latest remaining class');
expect_same('active', $readTermProfile()['enrollment_status'], 'Shortening with a later term keeps the enrollment active');
expect_same('term-fixture-protected-object', $readTermProfile()['protected_object_reference'], 'Shortening with a later term preserves biometric material');
$pdo->prepare("UPDATE biometric_profiles SET enrollment_status = 'expired', face_enrolled = 0, protected_object_reference = NULL, reference_expires_on = NULL, usable_sample_count = NULL WHERE student_id = ?")->execute([$termStudentId]);
[$termClassHistoricalStatus] = integration_http_json('/api/faculty/classes', $seedFacultyAccessToken, ['csName' => 'TERM-REJECT', 'courseId' => 1, 'academicTermId' => $termId]);
expect_same(422, $termClassHistoricalStatus, 'Class creation rejects a Dean term outside the configured current school year');
[$termMissingCreateStatus] = integration_http_json('/api/faculty/classes', $seedFacultyAccessToken, ['csName' => 'TERM-NOT-DEFINED', 'courseId' => 1, 'schoolYear' => academic_current_school_year($pdo), 'semester' => 'Third Term']);
expect_same(422, $termMissingCreateStatus, 'Class creation rejects identity without a Dean term');
$firstDeanTerm = array_values(array_filter(academic_terms_read($pdo), static fn(array $term): bool => $term['school_year'] === academic_current_school_year($pdo) && $term['semester'] === '1ST'))[0];
[$termChosenClassStatus, $termChosenClass] = integration_http_json('/api/faculty/classes', $seedFacultyAccessToken, ['csName' => 'TERM-CHOSEN', 'courseId' => 1, 'academicTermId' => (int) $firstDeanTerm['id'], 'schoolYear' => '1900-1901', 'semester' => 'Summer']);
expect_same(201, $termChosenClassStatus, 'Class derives identity from selected Dean term instead of client fields');
$chosenTermRow = $pdo->query('SELECT school_year, semester FROM class_sections WHERE cs_id = ' . (int) $termChosenClass['csId'])->fetch(PDO::FETCH_ASSOC);
expect_same([academic_current_school_year($pdo), '1ST'], [$chosenTermRow['school_year'], $chosenTermRow['semester']], 'Chosen Dean identity is persisted');
// Copy latest school year, including February 29. The source is isolated and
// newer than the other fixture years, so existing academic data remains intact.
[$termLeapStatus, $termLeap] = integration_http_json('/api/admin/academic-terms', $adminAccessToken, ['schoolYear' => '2091-2092', 'semester' => '1ST', 'startDate' => '2091-08-01', 'endDate' => '2092-02-29']);
expect_same(200, $termLeapStatus, 'Leap-day source term can be created');
[$termCopyStatus, $termCopy] = integration_http_json('/api/admin/academic-terms/copy', $adminAccessToken, []);
expect_same(200, $termCopyStatus, 'Copy-year operation succeeds');
expect_same('2092-2093', $termCopy['schoolYear'] ?? null, 'Copy targets the next school year');
$copiedTerm = $pdo->query("SELECT * FROM academic_terms WHERE school_year = '2092-2093' AND semester = '1ST'")->fetch(PDO::FETCH_ASSOC);
expect_same('2093-02-28', $copiedTerm['end_date'], 'PostgreSQL copy persists the approved leap-day clamp');
foreach ([(int) $copiedTerm['id'], (int) $termLeap['id']] as $unusedTermId) {
    [$unusedTermDeleteStatus] = integration_http_json('/api/admin/academic-terms/delete', $adminAccessToken, ['id' => $unusedTermId]);
    expect_same(200, $unusedTermDeleteStatus, 'Unused copied/source term can be deleted');
}
$termAuditActions = $pdo->query("SELECT DISTINCT action_code FROM audit_events WHERE module_code = 'settings' AND action_code LIKE 'academic_term%'")->fetchAll(PDO::FETCH_COLUMN);
foreach (['academic_term_created', 'academic_term_updated', 'academic_term_deleted', 'academic_terms_copied'] as $termAction) expect_true(in_array($termAction, $termAuditActions, true), $termAction . ' is audited');
$pdo->prepare("UPDATE class_sections SET status = 'Archived' WHERE cs_id IN (?, ?, ?, ?)")->execute([$termClassId, $termSummerClassId, $termLaterClassId, (int) $termChosenClass['csId']]);
