<?php

declare(strict_types=1);

require_once __DIR__ . '/../../backend/app/validation.php';
require_once __DIR__ . '/../../backend/app/audit_catalogue.php';

function assert_audit_catalogue(bool $condition, string $label): void
{
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$label}\n");
        exit(1);
    }
    echo "PASS: {$label}\n";
}

$row = static fn(array $over = []): array => $over + [
    'event_id' => 1, 'occurred_at' => '2026-10-17 16:00:00', 'actor_user_id' => 2, 'actor_username' => 'f@x.test',
    'actor_role' => 'faculty', 'actor_display_name' => 'Dr. F', 'scope_cs_id' => null, 'module_code' => 'grading',
    'action_code' => 'assessment_scores_saved', 'event_status' => 'Success', 'target_type' => null, 'target_id' => null,
    'description' => '', 'reason' => null, 'ip_address' => '1.2.3.4', 'user_agent' => 'UA', 'operation_uuid' => null,
    'before_state_json' => null, 'after_state_json' => null,
];

// Every code of contract section 5 has a label and area; the stopped and face-check codes are hidden.
$contractCodes = [
    'login_success', 'login_failed', 'logout', 'google_login_success', 'google_login_denied', 'google_link_success',
    'google_link_denied', 'google_profile_link_denied', 'password_changed', 'password_reset_requested', 'password_reset_completed',
    'mfa_enrollment_completed', 'mfa_verification_success', 'mfa_recovery_success', 'mfa_verification_failed',
    'mfa_recovery_codes_regenerated', 'mfa_revoked', 'refresh_reuse_detected', 'profile_updated',
    'google_link_required', 'mfa_enrollment_started', 'first_dean_invited', 'first_dean_invitation_delivery_failed',
    'faculty_invited', 'faculty_invitation_edited', 'faculty_invitation_revoked', 'faculty_invitation_accepted',
    'secretary_activated', 'student_activation_completed', 'student_auth_eligibility_denied', 'student_created',
    'student_update', 'student_enroll', 'student_unenroll', 'student_invited', 'secretary_invited',
    'secretary_invitation_revoked', 'secretary_appointed', 'secretary_appointment_ended', 'class_create', 'class_update',
    'system_settings_updated', 'academic_term_created', 'academic_term_updated', 'academic_term_deleted',
    'academic_terms_copied', 'grading_config_update', 'assessment_created', 'assessment_updated', 'assessment_deleted',
    'assessment_scores_saved', 'grades_recomputed', 'attendance_session_started', 'attendance_session_updated',
    'attendance_session_ended', 'attendance_session_revoked', 'attendance_session_auto_opened',
    'attendance_session_auto_ended', 'biometric_attendance_recorded', 'secretary_attendance_override',
    'faculty_attendance_change', 'excused_requested', 'excused_approved', 'excused_rejected', 'retention_remedial_save',
    'cost_recovery_recorded', 'watchlist_unlock', 'biometric_consent_granted', 'biometric_consent_revoked',
    'biometric_enrollment_started', 'biometric_enrollment_succeeded', 'biometric_enrollment_failed',
    'biometric_enrollment_revoked', 'biometric_enrollment_revoked_by_dean', 'biometric_enrollment_revoked_inactive',
    'biometric_enrollment_expired', 'biometric_verification_failed', 'development_mock_student_session_created',
];
$missing = array_values(array_filter($contractCodes, static fn(string $c): bool => !isset(audit_catalogue()[$c])));
assert_audit_catalogue($missing === [], 'Every contract code is in the catalogue' . ($missing ? ': ' . implode(', ', $missing) : ''));
assert_audit_catalogue(AUDIT_HIDDEN_CODES === ['refresh_rotation', 'biometric_attendance_recorded'], 'Token refreshes and face-check evidence are hidden everywhere');

$dean = array_keys(array_filter(audit_catalogue(), static fn(array $c): bool => $c[2]));
assert_audit_catalogue(
    array_intersect($dean, ['assessment_scores_saved', 'grades_recomputed', 'assessment_deleted', 'grading_config_update', 'attendance_session_started',
        'faculty_attendance_change', 'excused_approved', 'retention_remedial_save', 'watchlist_unlock', 'login_success', 'logout', 'biometric_enrollment_started']) === [],
    'Class work, successful sign-ins and enrolment attempts are not Dean-visible'
);
assert_audit_catalogue(
    array_diff(['login_failed', 'google_login_denied', 'refresh_reuse_detected', 'mfa_verification_failed', 'mfa_revoked', 'password_changed',
        'biometric_consent_granted', 'biometric_enrollment_expired', 'faculty_invited', 'student_update', 'system_settings_updated'], $dean) === [],
    'Security events, consent and deletions, people and settings are Dean-visible'
);
assert_audit_catalogue(audit_code_info('assessment_scores_saved')['area'] === 'Grading' && audit_code_info('profile_updated')['area'] === 'Sign-in & security', "A code's area is the contract section it is listed in");

$unknown = audit_code_info('some_future_code', 'faculty_retention');
assert_audit_catalogue($unknown === ['label' => 'Some future code', 'area' => 'Retention', 'deanVisible' => false, 'isSignIn' => false], "Unknown codes get a humanised label, the module's area, and no Dean visibility");

// Query validation.
$p = audit_read_params([], 'faculty');
assert_audit_catalogue($p['page'] === 1 && $p['pageSize'] === 50 && $p['sort'] === 'DESC' && $p['signins'] === false, 'Audit query defaults');
foreach ([['from' => '2026-13-40'], ['status' => 'Maybe'], ['sort' => 'up'], ['page' => '0'], ['signins' => '2'], ['area' => 'Nope'], ['cls' => 'x'], ['from' => '2026-02-02', 'to' => '2026-02-01']] as $bad) {
    try {
        audit_read_params($bad, 'faculty');
        assert_audit_catalogue(false, 'Rejects ' . json_encode($bad));
    } catch (ValidationException) {
        assert_audit_catalogue(true, 'Rejects ' . json_encode($bad));
    }
}
assert_audit_catalogue(audit_read_params(['role' => 'faculty', 'cls' => '9'], 'admin')['cls'] === '', 'The class filter is Faculty-only');
assert_audit_catalogue(audit_read_params(['role' => 'faculty', 'cls' => '9'], 'faculty')['role'] === '', 'The role filter is Dean-only');
assert_audit_catalogue(audit_read_params(['area' => 'Grading'], 'faculty')['area'] === 'Grading', 'Faculty may filter by Grading');
assert_audit_catalogue(!in_array('Grading', audit_areas_for('admin'), true), "The Dean's areas leave out class work");

// Time and who.
assert_audit_catalogue(audit_manila_iso('2026-10-17 16:00:00.123456') === '2026-10-18T00:00:00+08:00', 'Times are ISO-8601 in Asia/Manila');
[$who, $whoText] = audit_who($row(['action_code' => 'login_failed', 'actor_user_id' => null, 'actor_username' => null, 'actor_role' => null, 'actor_display_name' => null,
    'description' => 'Password sign-in failed for ghost@x.test: wrong password.']));
assert_audit_catalogue($who === null && $whoText === 'Unknown account (typed: ghost@x.test)', 'A failed sign-in with no account shows the typed email');
[, $systemText] = audit_who($row(['action_code' => 'attendance_session_auto_ended', 'actor_user_id' => null, 'actor_username' => null, 'actor_role' => null, 'actor_display_name' => null]));
assert_audit_catalogue($systemText === 'System', 'Automatic jobs show System');

// Record fallbacks (R13) and changes.
$lookups = ['class' => [5 => 'DENT 101-A'], 'assessment' => [], 'student' => [], 'enrollment' => [], 'session' => [], 'record' => [], 'user' => []];
assert_audit_catalogue(audit_row_record($row(['target_type' => 'assessment', 'target_id' => '42']), $lookups, null, null) === 'Assessment #42', 'An old row with a missing target falls back to "<Target type> #<id>"');
assert_audit_catalogue(audit_row_record($row(['target_type' => 'class_section', 'target_id' => '5']), $lookups, null, null) === 'DENT 101-A', 'A class record reads as its name');
assert_audit_catalogue(audit_row_record($row(['action_code' => 'login_success', 'target_type' => 'user_account', 'target_id' => '2']), $lookups, null, null) === '—', 'Sign-in rows have no record');

$scores = $row(['action_code' => 'assessment_scores_saved']);
$after = ['changes' => [['studentId' => '1', 'studentNumber' => '1-1', 'studentName' => 'Ann', 'assessment' => 'Quiz 2', 'field' => 'remarks', 'before' => null, 'after' => 'good']],
    'gradeChanges' => [['studentId' => '1', 'studentNumber' => '1-1', 'studentName' => 'Ann', 'period' => 'Midterm', 'before' => '2.50', 'after' => '2.25']]];
$changes = audit_row_changes($scores, null, $after);
assert_audit_catalogue(
    $changes === [
        ['field' => 'Ann (1-1) · Quiz 2 · Remark', 'before' => '—', 'after' => 'good'],
        ['field' => 'Ann (1-1) · Midterm grade', 'before' => '2.50', 'after' => '2.25'],
    ],
    'Score rows list each changed cell and each moved grade'
);
assert_audit_catalogue(audit_row_change_text($scores, null, $after, $changes) === '1 score or remark changed, 1 grade moved', 'Score rows summarise their change');
assert_audit_catalogue(audit_row_change_text($scores, null, ['savedCount' => 15, 'clearedCount' => 0], []) === '15 saved, 0 cleared', 'Old score rows summarise what they stored');
$deleted = audit_row_changes($row(['action_code' => 'assessment_deleted']), ['title' => 'Quiz 2', 'scoreCount' => 1, 'scores' => [['studentId' => '1', 'studentName' => 'Ann', 'studentNumber' => '1-1', 'score' => '8', 'remarks' => null]]], null);
assert_audit_catalogue(count($deleted) === 2 && $deleted[1]['before'] === '8' && $deleted[1]['after'] === 'Deleted', 'A deletion shows every deleted score');
$generic = audit_row_changes($row(['action_code' => 'student_update']), ['firstName' => 'Ana', 'section' => 'A'], ['firstName' => 'Anna', 'section' => 'A']);
assert_audit_catalogue($generic === [['field' => 'First name', 'before' => 'Ana', 'after' => 'Anna']], 'Other rows list only the fields that differ');
assert_audit_catalogue(audit_row_change_text($row(['action_code' => 'student_update']), ['firstName' => 'Ana'], ['firstName' => 'Anna'], $generic) === 'First name: Ana → Anna', 'One changed field reads Field: before → after');
assert_audit_catalogue(audit_row_change_text($row(['action_code' => 'login_success']), null, null, []) === '—', 'No change reads as a dash');

// Grouping (R12).
$members = [];
foreach ([3, 2, 1] as $n) {
    $members[] = $row(['event_id' => $n, 'action_code' => 'student_enroll', 'module_code' => 'class_management', 'operation_uuid' => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'scope_cs_id' => 5, 'target_type' => 'class_section', 'target_id' => '5']);
}
$entry = audit_build_entry($members, 3, $lookups, true);
assert_audit_catalogue($entry['id'] === 'b:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' && $entry['batch']['count'] === 3 && count($entry['batch']['members']) === 3, 'A batch is one entry with its members');
assert_audit_catalogue($entry['what'] === 'Enrolled 3 students' && $entry['record'] === 'DENT 101-A', 'A batch reads as one action on one class');
assert_audit_catalogue(isset($entry['details']['technical']) && !isset(audit_build_entry($members, 3, $lookups, false)['details']['technical']), 'Technical details are for the Dean only');
$single = audit_build_entry([$members[0]], 1, $lookups, false);
assert_audit_catalogue($single['batch'] === null && $single['id'] === 'e:3', 'A single row is a plain entry');

echo "ALL AUDIT CATALOGUE TESTS PASSED\n";
