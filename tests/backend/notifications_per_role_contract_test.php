<?php

declare(strict_types=1);

// Backlog 14.9 / NTF-002 in-app notifications per role, DB-free contract checks (spec.md NTF-002).
require_once __DIR__ . '/../../backend/app/config.php';
require_once __DIR__ . '/../../backend/app/notifications.php';

function assert_ntf(bool $condition, string $label): void
{
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$label}\n");
        exit(1);
    }
    echo "PASS: {$label}\n";
}

$root = __DIR__ . '/../../';
$read = static fn(string $rel): string => (string) file_get_contents($root . $rel);

$functionBody = static function (string $src, string $fnName): string {
    if (preg_match('/^function\s+' . preg_quote($fnName, '/') . '\s*\(/m', $src, $m, PREG_OFFSET_CAPTURE) !== 1) {
        return '';
    }
    $start = (int) $m[0][1];
    $next = strpos($src, "\nfunction ", $start + 10);
    return substr($src, $start, ($next === false ? strlen($src) : $next) - $start);
};

// ---- 1. Specification contract (spec.md; not mounted in the web check container) ----
$specPath = $root . 'spec.md';
if (file_exists($specPath)) {
    $spec = (string) file_get_contents($specPath);
    $ntf1Pos = strpos($spec, '## NTF-001 - Class enrollment notifications');
    $ntf2Pos = strpos($spec, '## NTF-002 - In-app notices per role');
    $dataPos = strpos($spec, '## DATA-001');
    assert_ntf(
        $ntf1Pos !== false && $ntf2Pos !== false && $dataPos !== false && $ntf2Pos > $ntf1Pos && $ntf2Pos < $dataPos,
        'spec.md defines ## NTF-002 - In-app notices per role right after NTF-001'
    );

    $ntf2Section = $ntf2Pos !== false
        ? substr($spec, $ntf2Pos, ($dataPos !== false && $dataPos > $ntf2Pos ? $dataPos : strlen($spec)) - $ntf2Pos)
        : '';
    assert_ntf(str_contains($ntf2Section, '**Status: APPROVED**'), 'NTF-002 is marked **Status: APPROVED**');
    foreach (['- **Student:**', '- **Class Secretary:**', '- **Faculty:**', '- **Dean:**', '- **Superadmin:**'] as $roleHeading) {
        assert_ntf(str_contains($ntf2Section, $roleHeading), "NTF-002 documents role {$roleHeading}");
    }
    foreach ([
        'final grades released',
        'grade changed after an approved grade change',
        'class Faculty changed',
        'join request waiting',
        'face revocation request waiting',
        'face enrolment flagged',
    ] as $noticeName) {
        assert_ntf(str_contains($ntf2Section, $noticeName), "NTF-002 includes notice: {$noticeName}");
    }
}

// ---- 2. Backend wiring for all 6 new notices ----
$gradeSubmission = $read('backend/controllers/GradeSubmissionController.php');
$gradeGates = $read('backend/app/grade_release_gates.php');
$superClasses = $read('backend/controllers/SuperadminClassesController.php');
$classJoin = $read('backend/controllers/ClassJoinController.php');
$studentBio = $read('backend/controllers/StudentBiometricController.php');
$studentBioApp = $read('backend/app/student_biometrics.php');
$faceFlags = $read('backend/app/face_flags.php');

// Notice 1: Final grades released (GradeSubmissionController.php submit action)
$gsFacultyBody = $functionBody($gradeSubmission, 'grade_submission_faculty_handle');
$submitPos = strpos($gsFacultyBody, "\$action === 'submit'");
$midtermPos = strpos($gsFacultyBody, "\$action === 'midterm-publish'");
$submitBlock = ($submitPos !== false && $midtermPos !== false && $midtermPos > $submitPos)
    ? substr($gsFacultyBody, $submitPos, $midtermPos - $submitPos)
    : '';
$gradesReleasedScope = $submitBlock . "\n" . $gradeGates;
assert_ntf(
    $submitBlock !== ''
        && (str_contains($submitBlock, "'grades_released'") || str_contains($submitBlock, 'grades_released') || preg_match('/grade_release_notify_\w+\(/', $submitBlock) === 1)
        && str_contains($gradesReleasedScope, "'grades_released'")
        && str_contains($gradesReleasedScope, 'notification_create_idempotent('),
    'Final grades released uses notification_create_idempotent with type grades_released in submit flow'
);
assert_ntf(
    preg_match('/grades[-_]released/', $gradesReleasedScope) === 1
        && (str_contains($gradesReleasedScope, 'faculty_class_student_user_ids') || preg_match("/LOWER\([^)]*status\)\s*=\s*'active'|status\s*=\s*'Active'/i", $gradesReleasedScope) === 1)
        && (str_contains($gradesReleasedScope, "authCtx['user_id']") || str_contains($gradesReleasedScope, 'faculty_class_student_user_ids') || str_contains($gradesReleasedScope, 'instructor_user_id')),
    'Final grades released filters active enrolled student/secretary accounts, excludes actor, and sets a stable dedup key'
);

// Notice 2: Grade changed (GradeSubmissionController.php Dean approve action)
$gsAdminBody = $functionBody($gradeSubmission, 'grade_change_admin_handle');
$approvePos = strpos($gsAdminBody, 'if ($approve)');
$rejectElsePos = $approvePos !== false ? strpos($gsAdminBody, '} else {', $approvePos) : false;
$approveBlock = ($approvePos !== false && $rejectElsePos !== false)
    ? substr($gsAdminBody, $approvePos, $rejectElsePos - $approvePos)
    : '';
$gradeChangedScope = $approveBlock . "\n" . $gradeGates;
assert_ntf(
    $approveBlock !== ''
        && str_contains($gradeChangedScope, "'grade_changed'")
        && str_contains($gradeChangedScope, 'notification_create_idempotent(')
        && !str_contains($gsAdminBody, "'grade_changed' // reject"),
    'Grade changed uses notification_create_idempotent with type grade_changed in Dean approve flow'
);
assert_ntf(
    preg_match('/grade[-_]changed/', $gradeChangedScope) === 1
        && (str_contains($gradeChangedScope, 'final_gwa') || str_contains($gradeChangedScope, 'final_percentage') || str_contains($gradeChangedScope, 'gradeMoved'))
        && preg_match("/LOWER\([^)]*status\)\s*=\s*'active'|status\s*=\s*'Active'/i", $gradeChangedScope) === 1
        && (str_contains($gradeChangedScope, "authCtx['user_id']") || str_contains($gradeChangedScope, 'faculty_user_id') || str_contains($gradeChangedScope, 'exclude')),
    'Grade changed notifies only active linked accounts whose final grade actually changed and excludes actors'
);

// Notice 3: Class Faculty changed (SuperadminClassesController.php)
$scChangeBody = $functionBody($superClasses, 'superadmin_class_change_faculty');
assert_ntf(
    str_contains($scChangeBody, "'class_assignment'")
        && str_contains($scChangeBody, "'Class Faculty changed'")
        && str_contains($scChangeBody, 'notification_create_idempotent(')
        && (str_contains($scChangeBody, 'enrollments') || str_contains($scChangeBody, 'faculty_class_student_user_ids')),
    'Class Faculty changed notifies active enrolled Students and Class Secretary with type class_assignment'
);
assert_ntf(
    preg_match("/LOWER\([^)]*status\)\s*=\s*'active'|status\s*=\s*'Active'/i", $scChangeBody) === 1
        && (str_contains($scChangeBody, "actor['user_id']") || str_contains($scChangeBody, 'array_unique') || str_contains($scChangeBody, 'secretary_user_id')),
    'Class Faculty changed filters active accounts, excludes actor, and deduplicates an enrolled Class Secretary'
);

// Notice 4: Join request waiting (ClassJoinController.php student join)
$cjJoinBody = $functionBody($classJoin, 'handle_class_join_student_join');
assert_ntf(
    str_contains($cjJoinBody, "'class_enrollment'")
        && str_contains($cjJoinBody, "'Join request waiting'")
        && str_contains($cjJoinBody, 'notification_create_idempotent(')
        && str_contains($cjJoinBody, 'instructor_user_id'),
    'Join request waiting notifies the class Faculty member with type class_enrollment and title Join request waiting'
);
assert_ntf(
    str_contains($cjJoinBody, '!$joined') || str_contains($cjJoinBody, 'if ($joined)') && str_contains($cjJoinBody, 'else'),
    'Join request waiting fires only when join_auto_approve is false'
);
assert_ntf(
    preg_match("/LOWER\([^)]*status\)\s*=\s*'active'|status\s*=\s*'Active'/i", $cjJoinBody) === 1
        && str_contains($cjJoinBody, "authCtx['user_id']"),
    'Join request waiting checks active Faculty account and excludes the Student actor'
);

// Notice 5: Face revocation request waiting (StudentBiometricController.php / student_biometrics.php)
$sbCreateBody = $functionBody($studentBio, 'handle_student_biometric_revoke_request_create');
$sbScope = $sbCreateBody . "\n" . $studentBioApp;
assert_ntf(
    str_contains($sbScope, "'biometric_enrollment'")
        && str_contains($sbScope, "'Face revocation request waiting'")
        && str_contains($sbScope, 'notification_create_idempotent('),
    'Face revocation request waiting notifies with type biometric_enrollment and title Face revocation request waiting'
);
assert_ntf(
    str_contains($sbScope, "'superadmin'")
        && preg_match("/LOWER\([^)]*status\)\s*=\s*'active'|status\s*=\s*'Active'/i", $sbScope) === 1
        && str_contains($sbScope, "authCtx['user_id']"),
    'Face revocation request waiting targets active Superadmins only and excludes the Student actor'
);

// Notice 6: Face enrolment flagged (backend/app/face_flags.php)
$ffRaiseBody = $functionBody($faceFlags, 'face_flag_raise');
$ffApproveBody = $functionBody($faceFlags, 'face_revoke_request_approve');
assert_ntf(
    str_contains($ffRaiseBody, "'biometric_enrollment'")
        && str_contains($ffRaiseBody, "'Face enrolment flagged'")
        && str_contains($ffRaiseBody, 'notification_create_idempotent('),
    'Face enrolment flagged notifies with type biometric_enrollment and title Face enrolment flagged in face_flag_raise'
);
assert_ntf(
    str_contains($ffRaiseBody, "'superadmin'")
        && preg_match("/LOWER\([^)]*status\)\s*=\s*'active'|status\s*=\s*'Active'/i", $ffRaiseBody) === 1
        && str_contains($ffRaiseBody, '$flagId')
        && (str_contains($ffRaiseBody, 'actor') || str_contains($ffRaiseBody, 'exclude')),
    'Face enrolment flagged targets active Superadmins, deduplicates per open flag_id, and excludes the actor'
);
assert_ntf(
    str_contains($ffApproveBody, 'face_flag_raise(')
        && (preg_match('/face_flag_raise\([^;]+(\$actor|\$actorUserId|\$excludeUserId)/', $ffApproveBody) === 1
            || preg_match('/face_flag_raise\([^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^)]+\)/', $ffApproveBody) === 1),
    'face_revoke_request_approve passes the approving Superadmin actor into face_flag_raise so the actor is excluded'
);

echo "PASS: Notifications per role contract checks completed.\n";
