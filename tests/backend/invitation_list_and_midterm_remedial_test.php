<?php

declare(strict_types=1);

require_once __DIR__ . '/../../backend/controllers/FacultyController.php';

function ilm_assert(bool $condition, string $label): void
{
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$label}\n");
        exit(1);
    }
    echo "PASS: {$label}\n";
}

$root = dirname(__DIR__, 2);
$invitations = (string) file_get_contents($root . '/backend/controllers/FacultyInvitationController.php');
$faculty = (string) file_get_contents($root . '/backend/controllers/FacultyController.php');

// 4.3: the Dean's invitation list never reads or returns token material.
$start = (int) strpos($invitations, 'function handle_admin_faculty_invitations_list');
$end = (int) strpos($invitations, 'function first_dean_invitation_issue');
$list = substr($invitations, $start, $end - $start);
ilm_assert($list !== '' && $end > $start, 'Invitation list handler located');
ilm_assert(preg_match('/token_hash|raw_token|\'token\'|invitation_link|activate\?token/i', $list) === 0,
    'Invitation list selects and returns no token, token hash or link');
ilm_assert(str_contains($list, "'invitedAt'") && str_contains($list, "'status' => \$status"),
    'Invitation list still returns status and dates');

// 5.3: a midterm-only student has no final grade, so remedial is refused.
ilm_assert(!faculty_remedial_grade_is_eligible(null), 'No final grade (midterm only) is not remedial eligible');
ilm_assert(!faculty_remedial_grade_is_eligible(2.0), 'A passing final grade is not remedial eligible');
ilm_assert(faculty_remedial_grade_is_eligible(2.5), 'A 2.5 final grade is remedial eligible');
ilm_assert(!faculty_remedial_grade_is_eligible(5.0), 'A 5.0 is not remedial eligible');
ilm_assert(str_contains($faculty, "if (\$target['final_gwa'] === null)") && str_contains($faculty, 'REMEDIAL_GRADE_UNRESOLVED'),
    'Attempt handler refuses a student without a final grade (409)');
ilm_assert(str_contains($faculty, 'Remedial records require a completed final grade from 2.5 through 4.9.'),
    'Remedial record save refuses a student without an eligible final grade');

echo "ALL INVITATION LIST AND MIDTERM REMEDIAL TESTS PASSED.\n";
