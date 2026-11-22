<?php

declare(strict_types=1);

// Grade release gates (Backlog 12.12 + 12.13, docs/contracts/grade-release-gates.md, spec GRD-004 / UI-003).
// Included by postgres_integration_test.php after grade_change_integration.php; reuses $pdo, $saAccount, $saPass,
// $groupedPayload, $groupedMembershipRows, $groupedCategoryIds, $groupedInsertAssessment, $groupedInsertScore,
// $adminAccessToken, $superAccessToken, $gsOne, $gsRows, $gsLogin, $gsEmail, $gsMessage, $gsAuditCount,
// $gsFacultyGet, $gsSubmit, $gsWithdraw, and $gsYear.

$grgTag = 'grg' . strtolower(bin2hex(random_bytes(3)));
$grgLetters = strtr($grgTag, '0123456789', 'abcdefghij');
$grgFa = $saAccount("grg-fa-{$grgTag}@bicol-u.edu.ph", 'faculty', "Grg Alpha {$grgLetters}");
$grgFb = $saAccount("grg-fb-{$grgTag}@bicol-u.edu.ph", 'faculty', "Grg Bravo {$grgLetters}");
$grgTokenFa = $gsLogin($gsEmail($grgFa));
$grgTokenFb = $gsLogin($gsEmail($grgFb));
expect_true($grgTokenFa !== '' && $grgTokenFb !== '', 'Grade release gates setup: both Faculty accounts sign in');

// ---- 1. Migration 073 & Audit Catalogue ----
foreach (['midterm_published_at', 'midterm_published_by', 'midterm_published_snapshot'] as $grgCol) {
    expect_same(
        1,
        (int) $gsOne("SELECT count(*) FROM information_schema.columns WHERE table_name = 'class_sections' AND column_name = ?", [$grgCol]),
        "Migration 073: class_sections.{$grgCol} exists"
    );
}
$grgCatalogue = audit_catalogue();
foreach (['midterm_advisory_published', 'midterm_advisory_updated', 'midterm_advisory_unpublished'] as $grgAuditCode) {
    expect_true(isset($grgCatalogue[$grgAuditCode]), "Audit catalogue registers {$grgAuditCode}");
    expect_same(AUDIT_AREA_GRADING, $grgCatalogue[$grgAuditCode][1] ?? null, "Audit catalogue places {$grgAuditCode} in Grading");
}

// ---- 2. Helpers ----
$grgPublishPath = '/api/faculty/classes/midterm-advisory/publish';
$grgUnpublishPath = '/api/faculty/classes/midterm-advisory/unpublish';
$grgPublish = static fn(int $csId, string $token): array => integration_http_json($grgPublishPath, $token, ['csId' => $csId]);
$grgUnpublish = static fn(int $csId, string $token): array => integration_http_json($grgUnpublishPath, $token, ['csId' => $csId]);
$grgSaveScores = static fn(array $batches, string $token): array => integration_http_json('/api/faculty/scores', $token, ['batches' => $batches]);
$grgRemedialSave = static fn(int $enrollmentId, array $payload, string $token): array => integration_http_json(
    '/api/faculty/retention/remedial',
    $token,
    array_merge(['enrollmentId' => (string) $enrollmentId], $payload)
);
$grgNotifRows = static fn(int $userId, string $type, int $enrollmentId): array => $gsRows(
    "SELECT notification_id, title, body, deduplication_key
       FROM notifications
      WHERE recipient_user_id = ?
        AND notification_type = ?
        AND entity_type = 'enrollment'
        AND entity_id = ?
      ORDER BY notification_id ASC",
    [$userId, $type, (string) $enrollmentId]
);
$grgFindStudentRow = static function (array $rows, int|string $enrollmentId, string $key = 'enrollmentId'): ?array {
    foreach ($rows as $row) {
        if (is_array($row) && (string) ($row[$key] ?? '') === (string) $enrollmentId) {
            return $row;
        }
    }
    return null;
};
$grgFindAdminReportSubject = static function (array $reportBody, int $studentId, int $enrollmentId): ?array {
    foreach ($reportBody['reports']['students'] ?? [] as $student) {
        if ((string) ($student['id'] ?? '') !== (string) $studentId) {
            continue;
        }
        foreach ($student['enrolledSubjects'] ?? [] as $subject) {
            if ((string) ($subject['enrollmentId'] ?? '') === (string) $enrollmentId) {
                return $subject;
            }
        }
    }
    return null;
};
$grgFindFacultyReportStudent = static function (array $reportBody, int $studentId): ?array {
    foreach ($reportBody['reports']['students'] ?? [] as $student) {
        if ((string) ($student['id'] ?? '') === (string) $studentId) {
            return $student;
        }
    }
    return null;
};

// ---- 3. Fixtures: courses, classes, weights, students ----
$grgCourseInsert = $pdo->prepare("INSERT INTO courses (course_code, name, units, semester, grading_config) VALUES (?, ?, 3.0, '1ST', '{}'::jsonb) RETURNING course_id");
$grgCourseInsert->execute(["GRG{$grgTag}", "Grg Periods Course {$grgTag}"]);
$grgCourse = (int) $grgCourseInsert->fetchColumn();
$grgCourseInsert->execute(["GRO{$grgTag}", "Grg Overall Course {$grgTag}"]);
$grgOverallCourse = (int) $grgCourseInsert->fetchColumn();
$grgCourseInsert->execute(["GRZ{$grgTag}", "Grg ZeroRisk Course {$grgTag}"]);
$grgZeroCourse = (int) $grgCourseInsert->fetchColumn();
$grgCourseInsert->execute(["GRA{$grgTag}", "Grg Approve Course {$grgTag}"]);
$grgApproveCourse = (int) $grgCourseInsert->fetchColumn();

$grgClassInsert = $pdo->prepare("INSERT INTO class_sections (cs_name, course_id, instructor_user_id, semester, school_year, status) VALUES (?, ?, ?, '1ST', ?, 'Active') RETURNING cs_id");
$grgClassInsert->execute(["GRG-MAIN-{$grgTag}", $grgCourse, $grgFa, $gsYear]);
$grgCs = (int) $grgClassInsert->fetchColumn();
$grgClassInsert->execute(["GRG-EMPTY-{$grgTag}", $grgCourse, $grgFa, $gsYear]);
$grgEmptyCs = (int) $grgClassInsert->fetchColumn();
$grgClassInsert->execute(["GRG-OVR-{$grgTag}", $grgOverallCourse, $grgFa, $gsYear]);
$grgOverallCs = (int) $grgClassInsert->fetchColumn();
$grgClassInsert->execute(["GRG-ZERO-{$grgTag}", $grgZeroCourse, $grgFa, $gsYear]);
$grgZeroRiskCs = (int) $grgClassInsert->fetchColumn();
$grgClassInsert->execute(["GRG-APPR-{$grgTag}", $grgApproveCourse, $grgFa, $gsYear]);
$grgApproveCs = (int) $grgClassInsert->fetchColumn();

$grgSetupPeriodsConfig = static function (int $courseId) use ($gsYear, $grgTokenFa, $groupedPayload, $groupedMembershipRows, $groupedCategoryIds): array {
    $offering = ['courseId' => $courseId, 'schoolYear' => $gsYear];
    [$cfgStatus, $cfgBody] = integration_http_put_json('/api/faculty/grading-config', $grgTokenFa, $groupedPayload($offering));
    expect_same(201, $cfgStatus, "Grade release gates setup: periods weights saved for course {$courseId}");
    $configId = (int) ($cfgBody['configuration']['id'] ?? 0);
    return $groupedCategoryIds($groupedMembershipRows($configId));
};
$grgCats = $grgSetupPeriodsConfig($grgCourse);
$grgZeroCats = $grgSetupPeriodsConfig($grgZeroCourse);
$grgApproveCats = $grgSetupPeriodsConfig($grgApproveCourse);

// Overall-mode configuration on $grgOverallCourse.
[$grgOvrCfgStatus] = integration_http_put_json('/api/faculty/grading-config', $grgTokenFa, [
    'courseId' => $grgOverallCourse,
    'semester' => '1st',
    'schoolYear' => $gsYear,
    'schemaMode' => 'overall',
    'categories' => [['name' => 'Quiz', 'weight' => 100, 'sortOrder' => 1]],
]);
expect_same(201, $grgOvrCfgStatus, 'Grade release gates setup: overall weights saved');

$grgMakeStudent = static function (string $label, int $csId) use ($pdo, $saAccount, $gsLogin, $gsEmail, $grgTag, $grgLetters): array {
    $number = "GRG-{$grgTag}-{$label}";
    $email = 'grg.stu.' . strtolower($label) . ".{$grgTag}@bicol-u.edu.ph";
    $userId = $saAccount($email, 'student', "Grg {$label} {$grgLetters}", $number);
    $studentId = (int) $pdo->query('SELECT student_id FROM students WHERE student_number = ' . $pdo->quote($number))->fetchColumn();
    $enroll = $pdo->prepare("INSERT INTO enrollments (student_id, cs_id, status, date_enrolled) VALUES (?, ?, 'Active', CURRENT_DATE) RETURNING enrollment_id");
    $enroll->execute([$studentId, $csId]);
    $enrollmentId = (int) $enroll->fetchColumn();
    $token = $gsLogin($gsEmail($userId));
    expect_true($token !== '', "Grade release gates setup: student {$label} signs in");
    return [
        'studentId' => $studentId,
        'enrollmentId' => $enrollmentId,
        'userId' => $userId,
        'number' => $number,
        'token' => $token,
    ];
};

$grgJuan = $grgMakeStudent('Juan', $grgCs);
$grgMaria = $grgMakeStudent('Maria', $grgCs);
$grgPedro = $grgMakeStudent('Pedro', $grgCs);
$grgAna = $grgMakeStudent('Ana', $grgCs);
$grgZeroStu = $grgMakeStudent('Zero', $grgZeroRiskCs);
$grgOvrStu = $grgMakeStudent('Overall', $grgOverallCs);

$grgCreatePeriodAssessments = static function (int $csId, array $cats, string $prefix) use ($groupedInsertAssessment): array {
    $out = [];
    foreach (['Midterm', 'Final'] as $period) {
        foreach ([['Lecture', 'Quiz'], ['Lecture', 'Exam'], ['Laboratory', 'Quiz']] as [$component, $category]) {
            $out["{$period}.{$component}.{$category}"] = $groupedInsertAssessment(
                $csId,
                $cats[$period][$component][$category],
                "{$prefix} {$period} {$component} {$category}",
                $period
            );
        }
    }
    return $out;
};

$grgAss = $grgCreatePeriodAssessments($grgCs, $grgCats, "GrgMain {$grgTag}");
$grgZeroAss = $grgCreatePeriodAssessments($grgZeroRiskCs, $grgZeroCats, "GrgZero {$grgTag}");
$grgApproveAss = $grgCreatePeriodAssessments($grgApproveCs, $grgApproveCats, "GrgAppr {$grgTag}");

// Overall-mode assessment + score so $grgOverallCs has scores ready, yet stays ineligible for Midterm advisory.
$grgOvrCatId = (int) $gsOne(
    "SELECT gc.category_id FROM grading_categories gc
       JOIN grading_configs cfg ON cfg.config_id = gc.config_id
      WHERE cfg.course_id = ? AND cfg.faculty_user_id = ? LIMIT 1",
    [$grgOverallCourse, $grgFa]
);
$grgOvrAss = $groupedInsertAssessment($grgOverallCs, $grgOvrCatId, "GrgOvr Quiz {$grgTag}", 'Midterm');
$groupedInsertScore($grgOvrAss, $grgOvrStu['studentId'], 80.0);

// Baseline Dean KPIs before $grgCs scores are saved.
[$grgDeanBaseStatus, $grgDeanBase] = integration_http_get_json('/api/admin/dashboard/kpis?schoolYear=current', $adminAccessToken);
expect_same(200, $grgDeanBaseStatus, 'Q1/Q2 baseline: Dean dashboard KPIs load');

// ---- 4. Q1 & Q2: Score auto-save computes DB/Faculty live view, sends 0 notices, hides external views ----
$grgScoreBatches = [];
foreach (['Midterm.Lecture.Quiz', 'Midterm.Lecture.Exam', 'Midterm.Laboratory.Quiz'] as $k) {
    $scores = [
        ['studentId' => (string) $grgJuan['studentId'], 'score' => 82.0],
        ['studentId' => (string) $grgMaria['studentId'], 'score' => 82.0],
        ['studentId' => (string) $grgPedro['studentId'], 'score' => 90.0],
    ];
    if ($k !== 'Midterm.Lecture.Exam') {
        // Ana leaves Midterm.Lecture.Exam blank so she appears in midterm.missing.
        $scores[] = ['studentId' => (string) $grgAna['studentId'], 'score' => 90.0];
    }
    $grgScoreBatches[] = ['assessmentId' => (string) $grgAss[$k], 'scores' => $scores];
}
foreach (['Final.Lecture.Quiz', 'Final.Lecture.Exam', 'Final.Laboratory.Quiz'] as $k) {
    $grgScoreBatches[] = [
        'assessmentId' => (string) $grgAss[$k],
        'scores' => [
            ['studentId' => (string) $grgJuan['studentId'], 'score' => 82.0],  // Overall 82 -> 2.6 Remedial
            ['studentId' => (string) $grgMaria['studentId'], 'score' => 82.0], // Overall 82 -> 2.6 Remedial
            ['studentId' => (string) $grgPedro['studentId'], 'score' => 60.0], // 0.3*90 + 0.7*60 = 69 -> 5.0 Irregular
        ],
    ];
}
[$grgSaveStatus] = $grgSaveScores($grgScoreBatches, $grgTokenFa);
expect_same(200, $grgSaveStatus, 'Q1/Q2: auto-saving Midterm and Final scores succeeds');

// Faculty live Grade Computation (enrollments DB + /api/faculty/students) shows live computed grades & retention preview.
$grgJuanDb = $gsRows('SELECT final_gwa::text AS gwa, retention_state FROM enrollments WHERE enrollment_id = ?', [$grgJuan['enrollmentId']])[0];
expect_same('2.60', $grgJuanDb['gwa'], 'Q1: auto-save persists live enrollments.final_gwa for Faculty Grade Computation');
expect_same('remedial', $grgJuanDb['retention_state'], 'Q1: auto-save persists live enrollments.retention_state for Faculty Grade Computation');

[, $grgFacStudents] = integration_http_get_json('/api/faculty/students', $grgTokenFa);
$grgFacJuan = $grgFindStudentRow(array_is_list($grgFacStudents) ? $grgFacStudents : ($grgFacStudents['students'] ?? []), $grgJuan['number'], 'studentId');
$grgFacJuanSubject = null;
foreach ($grgFacJuan['enrolledSubjects'] ?? [] as $subj) {
    if ((string) ($subj['classId'] ?? '') === (string) $grgCs) {
        $grgFacJuanSubject = $subj;
    }
}
expect_same(2.6, isset($grgFacJuanSubject['grade']) ? (float) $grgFacJuanSubject['grade'] : null, 'Q1: Faculty live Grade Computation (/api/faculty/students) shows Juan 2.6');

// Zero remedial_assignment and zero midterm_advisory notifications on auto-save.
foreach ([$grgJuan, $grgMaria, $grgPedro, $grgAna] as $stu) {
    expect_same([], $grgNotifRows($stu['userId'], 'remedial_assignment', $stu['enrollmentId']), "Q5: auto-save sends 0 remedial_assignment notices to {$stu['number']}");
    expect_same([], $grgNotifRows($stu['userId'], 'midterm_advisory', $stu['enrollmentId']), "Q4: auto-save sends 0 midterm_advisory notices to {$stu['number']}");
}

// Student surfaces hide both Midterm % / At-Risk (unpublished) and Final Grade / Retention Status (unsubmitted).
foreach ([$grgJuan, $grgMaria, $grgPedro] as $stu) {
    [, $stuClasses] = integration_http_get_json('/api/student/classes', $stu['token']);
    $clsRow = $grgFindStudentRow($stuClasses['classes'] ?? [], $stu['enrollmentId']);
    expect_true($clsRow !== null, "Q1/Q2: Student {$stu['number']} sees enrolled class");
    expect_same(null, array_key_exists('grade', $clsRow) ? $clsRow['grade'] : 'missing', "Q1: Student {$stu['number']} sees null Final grade before Submit");
    expect_same(null, array_key_exists('percentage', $clsRow) ? $clsRow['percentage'] : 'missing', "Q1: Student {$stu['number']} sees null Final percentage before Submit");
    expect_same('active', $clsRow['retentionState'] ?? null, "Q1: Student {$stu['number']} sees neutral active retentionState before Submit");
    expect_same('none', $clsRow['remedialProgression']['stage'] ?? null, "Q1: Student {$stu['number']} sees empty remedialProgression before Submit");
    expect_same(false, $clsRow['midtermEvaluation']['published'] ?? null, "Q2: Student {$stu['number']} sees midtermEvaluation.published=false before Publish");
    expect_same(false, $clsRow['midtermEvaluation']['complete'] ?? null, "Q2: Student {$stu['number']} sees midtermEvaluation.complete=false before Publish");
    expect_same(null, is_array($clsRow['midtermEvaluation'] ?? null) && array_key_exists('percentage', $clsRow['midtermEvaluation']) ? $clsRow['midtermEvaluation']['percentage'] : 'missing', "Q2: Student {$stu['number']} sees null Midterm percentage before Publish");
    expect_same(false, $clsRow['midtermEvaluation']['isAtRisk'] ?? null, "Q2: Student {$stu['number']} sees isAtRisk=false before Publish");

    [, $stuDash] = integration_http_get_json('/api/student/dashboard', $stu['token']);
    expect_same(null, is_array($stuDash['summary'] ?? null) && array_key_exists('gwa', $stuDash['summary']) ? $stuDash['summary']['gwa'] : 'missing', "Q1: Student {$stu['number']} dashboard GWA excludes unsubmitted class");
    expect_same(0, (int) ($stuDash['summary']['retentionAlerts'] ?? -1), "Q1: Student {$stu['number']} dashboard retentionAlerts excludes unsubmitted class");
}

// Dean Dashboard & Reports gate unsubmitted Final grades and unpublished Midterm At-Risk.
[, $grgDeanBeforePub] = integration_http_get_json('/api/admin/dashboard/kpis?schoolYear=current', $adminAccessToken);
expect_same($grgDeanBase['kpis']['atRisk'] ?? null, $grgDeanBeforePub['kpis']['atRisk'] ?? null, 'Q2: Dean dashboard atRisk count excludes unpublished Midterm classes');
expect_same($grgDeanBase['kpis']['remedialCount'] ?? null, $grgDeanBeforePub['kpis']['remedialCount'] ?? null, 'Q1: Dean dashboard remedialCount excludes unsubmitted classes');
expect_same($grgDeanBase['kpis']['irregularReenrollmentCount'] ?? null, $grgDeanBeforePub['kpis']['irregularReenrollmentCount'] ?? null, 'Q1: Dean dashboard irregularReenrollmentCount excludes unsubmitted classes');
expect_same($grgDeanBase['kpis']['goodStanding'] ?? null, $grgDeanBeforePub['kpis']['goodStanding'] ?? null, 'Q1: Dean dashboard goodStanding does not count unsubmitted classes');

[, $grgDeanReportsPre] = integration_http_get_json('/api/admin/reports/summary?schoolYear=current', $adminAccessToken);
$grgDeanRepJuanPre = $grgFindAdminReportSubject($grgDeanReportsPre, $grgJuan['studentId'], $grgJuan['enrollmentId']);
expect_true($grgDeanRepJuanPre !== null, 'Q1: Dean reports lists Juan enrolled subject');
expect_same(null, is_array($grgDeanRepJuanPre) && array_key_exists('grade', $grgDeanRepJuanPre) ? $grgDeanRepJuanPre['grade'] : 'missing', 'Q1: Dean reports hides Juan unsubmitted final grade');
expect_same('active', $grgDeanRepJuanPre['retentionState'] ?? null, 'Q1: Dean reports hides Juan unsubmitted remedial retentionState');
expect_same(false, $grgDeanRepJuanPre['hasRemedial'] ?? null, 'Q1: Dean reports hides Juan hasRemedial before Submit');

// Faculty Retention Monitoring, Dashboard KPIs, and Reports gate unsubmitted Finals & unpublished Midterms.
[, $grgFacRetPre] = integration_http_get_json('/api/faculty/retention', $grgTokenFa);
expect_true((int) ($grgFacRetPre['unpublishedMidtermClassCount'] ?? 0) >= 1, 'Q2: Faculty retention reports unpublishedMidtermClassCount >= 1');
expect_true((int) ($grgFacRetPre['unsubmittedFinalClassCount'] ?? 0) >= 1, 'Q1: Faculty retention reports unsubmittedFinalClassCount >= 1');
$grgFacRetJuanPre = $grgFindStudentRow($grgFacRetPre['retention'] ?? [], $grgJuan['enrollmentId']);
expect_same(false, $grgFacRetJuanPre['gradesSubmitted'] ?? null, 'Q1: Faculty retention marks Juan gradesSubmitted=false');
expect_same(null, is_array($grgFacRetJuanPre) && array_key_exists('gwa', $grgFacRetJuanPre) ? $grgFacRetJuanPre['gwa'] : 'missing', 'Q1: Faculty retention hides Juan unsubmitted gwa');
expect_same('active', $grgFacRetJuanPre['state'] ?? null, 'Q1: Faculty retention hides Juan unsubmitted remedial state');
expect_same(false, $grgFacRetJuanPre['remedialEligible'] ?? null, 'Q1: Faculty retention marks Juan remedialEligible=false before Submit');
expect_same(false, $grgFacRetJuanPre['midtermAtRisk'] ?? null, 'Q2: Faculty retention marks Juan midtermAtRisk=false before Midterm Publish');
expect_same(false, $grgFacRetJuanPre['midtermPublished'] ?? null, 'Q2: Faculty retention marks Juan midtermPublished=false before Midterm Publish');

[, $grgFacKpisPre] = integration_http_get_json('/api/faculty/dashboard/kpis', $grgTokenFa);
expect_same(0, (int) ($grgFacKpisPre['kpis']['goodStanding'] ?? -1), 'Q1: Faculty dashboard goodStanding is 0 before Submit');
expect_same(0, (int) ($grgFacKpisPre['kpis']['remedialCount'] ?? -1), 'Q1: Faculty dashboard remedialCount is 0 before Submit');
expect_same(0, (int) ($grgFacKpisPre['kpis']['irregularReenrollmentCount'] ?? -1), 'Q1: Faculty dashboard irregularReenrollmentCount is 0 before Submit');
expect_same(0, (int) ($grgFacKpisPre['kpis']['retentionAlerts'] ?? -1), 'Q2: Faculty dashboard retentionAlerts (Midterm At-Risk) is 0 before Publish');

[, $grgFacRepPre] = integration_http_get_json('/api/faculty/reports/summary', $grgTokenFa);
$grgFacRepJuanPre = $grgFindFacultyReportStudent($grgFacRepPre, $grgJuan['studentId']);
expect_same(null, is_array($grgFacRepJuanPre) && array_key_exists('overallGWA', $grgFacRepJuanPre) ? $grgFacRepJuanPre['overallGWA'] : 'missing', 'Q7: Faculty reports hides overallGWA before Submit');
expect_same('active', $grgFacRepJuanPre['status'] ?? null, 'Q7: Faculty reports hides remedial status before Submit');
expect_same(0, (int) ($grgFacRepPre['reports']['summary']['atRiskCount'] ?? -1), 'Q7: Faculty reports summary atRiskCount is 0 before Submit');

// ---- 5. Q3 & Q4: Midterm Publish Guards, Zero-Risk Publish, Snapshot Isolation, Dirty Diff, Update, Unpublish ----
expect_same(403, $grgPublish($grgCs, $grgTokenFb)[0], 'Q3: non-owner Faculty gets 403 on Midterm publish');
expect_same(403, $grgUnpublish($grgCs, $grgTokenFb)[0], 'Q3: non-owner Faculty gets 403 on Midterm unpublish');

[$grgOvrPubStatus, $grgOvrPubBody] = $grgPublish($grgOverallCs, $grgTokenFa);
expect_same(409, $grgOvrPubStatus, 'Q3: overall-mode class returns 409 on Midterm publish');
expect_same('Midterm advisory applies only to classes using Midterm and Final periods.', $gsMessage($grgOvrPubBody), 'Q3: overall-mode publish error matches contract');

[$grgEmptyPubStatus, $grgEmptyPubBody] = $grgPublish($grgEmptyCs, $grgTokenFa);
expect_same(409, $grgEmptyPubStatus, 'Q3: periods-mode class with 0 ready Midterm students returns 409');
expect_same('Enter complete Midterm scores for at least one student before publishing.', $gsMessage($grgEmptyPubBody), 'Q3: empty-Midterm publish error matches contract');

[$grgUnpubEarlyStatus, $grgUnpubEarlyBody] = $grgUnpublish($grgCs, $grgTokenFa);
expect_same(409, $grgUnpubEarlyStatus, 'Q4: unpublishing an unpublished Midterm returns 409');
expect_same('Midterm advisory is not published for this class.', $gsMessage($grgUnpubEarlyBody), 'Q4: unpublished error matches contract');

// Email Management -> Midterm Advisory refuses (409) when unpublished.
[$grgEmailPrePubStatus, $grgEmailPrePubBody] = integration_http_json('/api/faculty/send-email', $grgTokenFa, [
    'emailType' => 'Midterm Advisory',
    'enrollmentIds' => [$grgJuan['enrollmentId']],
]);
expect_same(409, $grgEmailPrePubStatus, 'Q4: Email Management Midterm Advisory refuses (409) before Publish');
expect_same('Publish the Midterm advisory before sending Midterm advisory emails.', $gsMessage($grgEmailPrePubBody), 'Q4: Email Management unpublished error matches contract');

// Publish with 0 At-Risk students ($grgZeroRiskCs) succeeds (Q3).
$grgZeroScoreBatches = [];
foreach (['Midterm.Lecture.Quiz', 'Midterm.Lecture.Exam', 'Midterm.Laboratory.Quiz'] as $k) {
    $grgZeroScoreBatches[] = ['assessmentId' => (string) $grgZeroAss[$k], 'scores' => [['studentId' => (string) $grgZeroStu['studentId'], 'score' => 90.0]]];
}
expect_same(200, $grgSaveScores($grgZeroScoreBatches, $grgTokenFa)[0], 'Q3 zero-risk setup: passing Midterm scores saved');
[$grgZeroPubStatus, $grgZeroPubBody] = $grgPublish($grgZeroRiskCs, $grgTokenFa);
expect_same(200, $grgZeroPubStatus, 'Q3: publishing with >=1 ready student and 0 At-Risk students succeeds');
expect_same(true, $grgZeroPubBody['midterm']['published'] ?? null, 'Q3: zero-risk class marks midterm.published=true');
expect_same([], $grgZeroPubBody['midterm']['atRisk'] ?? null, 'Q3: zero-risk class returns empty midterm.atRisk');
expect_same(1, $gsAuditCount('midterm_advisory_published', $grgZeroRiskCs), 'Q3: zero-risk publish records midterm_advisory_published audit row');
expect_same([], $grgNotifRows($grgZeroStu['userId'], 'midterm_advisory', $grgZeroStu['enrollmentId']), 'Q4: zero-risk publish sends 0 midterm_advisory notifications');

// Publish main class $grgCs (2 At-Risk: Juan & Maria; 1 passing: Pedro; 1 missing: Ana).
$grgPubAuditBefore = $gsAuditCount('midterm_advisory_published', $grgCs);
[$grgPubStatus, $grgPubBody] = $grgPublish($grgCs, $grgTokenFa);
expect_same(200, $grgPubStatus, 'Q3: Midterm publish succeeds on $grgCs (' . json_encode($grgPubBody) . ')');
expect_same(true, $grgPubBody['midterm']['published'] ?? null, 'Q3: midterm.published is true');
expect_same(false, $grgPubBody['midterm']['dirty'] ?? null, 'Q3: midterm.dirty is false immediately after publish');
expect_same(3, (int) ($grgPubBody['midterm']['readyCount'] ?? -1), 'Q3: midterm.readyCount is 3 (Juan, Maria, Pedro)');
$grgPubAtRiskNumbers = array_column($grgPubBody['midterm']['atRisk'] ?? [], 'studentNumber');
sort($grgPubAtRiskNumbers);
$grgExpectedAtRisk = [$grgJuan['number'], $grgMaria['number']];
sort($grgExpectedAtRisk);
expect_same($grgExpectedAtRisk, $grgPubAtRiskNumbers, 'Q3: midterm.atRisk lists Juan and Maria only');
expect_same([$grgAna['number']], array_column($grgPubBody['midterm']['missing'] ?? [], 'studentNumber'), 'Q3: midterm.missing lists Ana only');
expect_same($grgPubAuditBefore + 1, $gsAuditCount('midterm_advisory_published', $grgCs), 'Q4: Publish records midterm_advisory_published audit row');

// Verify persisted DB snapshot & columns.
$grgPubRow = $gsRows('SELECT midterm_published_at, midterm_published_by, midterm_published_snapshot::text AS snap FROM class_sections WHERE cs_id = ?', [$grgCs])[0];
expect_true($grgPubRow['midterm_published_at'] !== null && (int) $grgPubRow['midterm_published_by'] === $grgFa, 'Q3: class_sections persists midterm_published_at and midterm_published_by');
$grgSnap = json_decode((string) $grgPubRow['snap'], true);
expect_true(isset($grgSnap['entries'][(string) $grgJuan['enrollmentId']], $grgSnap['entries'][(string) $grgMaria['enrollmentId']], $grgSnap['entries'][(string) $grgPedro['enrollmentId']]) && !isset($grgSnap['entries'][(string) $grgAna['enrollmentId']]), 'Q3: published snapshot stores ready students only');

// Verify notifications after initial Publish: ONLY At-Risk students (Juan, Maria) get midterm_advisory.
$grgJuanMidNotifs = $grgNotifRows($grgJuan['userId'], 'midterm_advisory', $grgJuan['enrollmentId']);
$grgMariaMidNotifs = $grgNotifRows($grgMaria['userId'], 'midterm_advisory', $grgMaria['enrollmentId']);
expect_same(1, count($grgJuanMidNotifs), 'Q4: Juan receives 1 midterm_advisory notice on Publish');
expect_true(str_starts_with($grgJuanMidNotifs[0]['title'], 'Midterm advisory in '), 'Q4: Juan notice title starts with Midterm advisory in');
expect_same(1, count($grgMariaMidNotifs), 'Q4: Maria receives 1 midterm_advisory notice on Publish');
expect_same([], $grgNotifRows($grgPedro['userId'], 'midterm_advisory', $grgPedro['enrollmentId']), 'Q4: passing Pedro receives 0 midterm_advisory notices');
expect_same([], $grgNotifRows($grgAna['userId'], 'midterm_advisory', $grgAna['enrollmentId']), 'Q4: missing-score Ana receives 0 midterm_advisory notices');

// Student views after Publish: Midterm visible, Finals still hidden.
foreach ([
    [$grgJuan, true, true, 82.0, 2.6, true],
    [$grgMaria, true, true, 82.0, 2.6, true],
    [$grgPedro, true, true, 90.0, 1.9, false],
    [$grgAna, true, false, null, null, false],
] as [$stu, $expPub, $expComp, $expPct, $expGrade, $expRisk]) {
    [, $stuClasses] = integration_http_get_json('/api/student/classes', $stu['token']);
    $clsRow = $grgFindStudentRow($stuClasses['classes'] ?? [], $stu['enrollmentId']);
    expect_same($expPub, $clsRow['midtermEvaluation']['published'] ?? null, "Q3: Student {$stu['number']} midterm published={$expPub}");
    expect_same($expComp, $clsRow['midtermEvaluation']['complete'] ?? null, "Q3: Student {$stu['number']} midterm complete=" . var_export($expComp, true));
    expect_same($expPct, isset($clsRow['midtermEvaluation']['percentage']) && $clsRow['midtermEvaluation']['percentage'] !== null ? (float) $clsRow['midtermEvaluation']['percentage'] : (is_array($clsRow['midtermEvaluation'] ?? null) && array_key_exists('percentage', $clsRow['midtermEvaluation']) ? null : 'missing'), "Q3: Student {$stu['number']} midterm percentage matches snapshot");
    expect_same($expGrade, isset($clsRow['midtermEvaluation']['grade']) && $clsRow['midtermEvaluation']['grade'] !== null ? (float) $clsRow['midtermEvaluation']['grade'] : (is_array($clsRow['midtermEvaluation'] ?? null) && array_key_exists('grade', $clsRow['midtermEvaluation']) ? null : 'missing'), "Q3: Student {$stu['number']} midterm grade matches snapshot");
    expect_same($expRisk, $clsRow['midtermEvaluation']['isAtRisk'] ?? null, "Q3: Student {$stu['number']} midterm isAtRisk matches snapshot");
    expect_same(null, array_key_exists('grade', $clsRow) ? $clsRow['grade'] : 'missing', "Q1: Student {$stu['number']} Final grade remains hidden after Midterm Publish");
}

// Faculty classes list, Retention Monitoring, Faculty KPIs, Dean KPIs, and Email Management after Publish.
[, $grgFacClasses] = integration_http_get_json('/api/faculty/classes', $grgTokenFa);
$grgFacMainCls = $grgFindStudentRow($grgFacClasses['classes'] ?? [], $grgCs, 'csId');
expect_same(true, $grgFacMainCls['midtermPublished'] ?? null, 'Q3: /api/faculty/classes reports midtermPublished=true');
expect_same(false, $grgFacMainCls['midtermAdvisoryDirty'] ?? null, 'Q3: /api/faculty/classes reports midtermAdvisoryDirty=false');
expect_same(2, (int) ($grgFacMainCls['midtermAtRiskCount'] ?? -1), 'Q3: /api/faculty/classes reports midtermAtRiskCount=2');

[, $grgFacRetPub] = integration_http_get_json('/api/faculty/retention', $grgTokenFa);
expect_same(true, $grgFindStudentRow($grgFacRetPub['retention'] ?? [], $grgJuan['enrollmentId'])['midtermAtRisk'] ?? null, 'Q3: Faculty retention shows Juan midtermAtRisk=true');
expect_same(false, $grgFindStudentRow($grgFacRetPub['retention'] ?? [], $grgPedro['enrollmentId'])['midtermAtRisk'] ?? null, 'Q3: Faculty retention shows Pedro midtermAtRisk=false');
[, $grgFacKpisPub] = integration_http_get_json('/api/faculty/dashboard/kpis', $grgTokenFa);
expect_same(2, (int) ($grgFacKpisPub['kpis']['retentionAlerts'] ?? -1), 'Q3: Faculty dashboard retentionAlerts counts 2 published At-Risk students');
[, $grgDeanPub] = integration_http_get_json('/api/admin/dashboard/kpis?schoolYear=current', $adminAccessToken);
expect_same(((int) $grgDeanBase['kpis']['atRisk']) + 2, (int) ($grgDeanPub['kpis']['atRisk'] ?? -1), 'Q3: Dean dashboard atRisk includes the 2 published Midterm At-Risk students');

[$grgEmailPubStatus] = integration_http_json('/api/faculty/send-email', $grgTokenFa, [
    'emailType' => 'Midterm Advisory',
    'enrollmentIds' => [$grgJuan['enrollmentId']],
]);
expect_same(200, $grgEmailPubStatus, 'Q4: Email Management Midterm Advisory succeeds when published');

// ---- 6. Snapshot Isolation, Dirty Diff, Early Finals Protection, Update Advisory ----
// Edit Maria Midterm 82 -> 90 (cleared) and complete Ana Midterm Exam 82 (newly At-Risk).
// Also edit Juan Final Quiz -> 98 (early Finals entry while unsubmitted must NOT clear published Midterm At-Risk!).
$grgEditBatches = [];
foreach (['Midterm.Lecture.Quiz', 'Midterm.Lecture.Exam', 'Midterm.Laboratory.Quiz'] as $k) {
    $scores = [['studentId' => (string) $grgMaria['studentId'], 'score' => 90.0]];
    if ($k === 'Midterm.Lecture.Exam') {
        $scores[] = ['studentId' => (string) $grgAna['studentId'], 'score' => 82.0];
    } elseif ($k === 'Midterm.Lecture.Quiz' || $k === 'Midterm.Laboratory.Quiz') {
        $scores[] = ['studentId' => (string) $grgAna['studentId'], 'score' => 82.0];
    }
    $grgEditBatches[] = ['assessmentId' => (string) $grgAss[$k], 'scores' => $scores];
}
$grgEditBatches[] = [
    'assessmentId' => (string) $grgAss['Final.Lecture.Quiz'],
    'scores' => [['studentId' => (string) $grgJuan['studentId'], 'score' => 98.0]],
];
expect_same(200, $grgSaveScores($grgEditBatches, $grgTokenFa)[0], 'Q4 dirty setup: Midterm edits and early Finals quiz saved');

// Published snapshot in DB is unchanged; auto-save sends 0 new notifications.
expect_same($grgPubRow['snap'], $gsOne('SELECT midterm_published_snapshot::text FROM class_sections WHERE cs_id = ?', [$grgCs]), 'Q4: editing scores after Publish leaves published snapshot untouched');
expect_same(1, count($grgNotifRows($grgJuan['userId'], 'midterm_advisory', $grgJuan['enrollmentId'])), 'Q4: auto-save sends 0 midterm notices to Juan');
expect_same(1, count($grgNotifRows($grgMaria['userId'], 'midterm_advisory', $grgMaria['enrollmentId'])), 'Q4: auto-save sends 0 midterm notices to Maria');
expect_same([], $grgNotifRows($grgAna['userId'], 'midterm_advisory', $grgAna['enrollmentId']), 'Q4: auto-save sends 0 midterm notices to Ana');

// Early Finals quiz on Juan does NOT clear published Midterm At-Risk!
[, $grgJuanClassesAfterFinals] = integration_http_get_json('/api/student/classes', $grgJuan['token']);
$grgJuanClsAfterFinals = $grgFindStudentRow($grgJuanClassesAfterFinals['classes'] ?? [], $grgJuan['enrollmentId']);
expect_same(true, $grgJuanClsAfterFinals['midtermEvaluation']['isAtRisk'] ?? null, 'Q4/UI-003: entering early Finals scores while unsubmitted does NOT clear Juan Midterm At-Risk');
[, $grgMariaClassesDirty] = integration_http_get_json('/api/student/classes', $grgMaria['token']);
$grgMariaClsDirty = $grgFindStudentRow($grgMariaClassesDirty['classes'] ?? [], $grgMaria['enrollmentId']);
expect_same(82.0, isset($grgMariaClsDirty['midtermEvaluation']['percentage']) ? (float) $grgMariaClsDirty['midtermEvaluation']['percentage'] : null, 'Q4: Student Maria still sees published snapshot percentage (82) while dirty');
expect_same(true, $grgMariaClsDirty['midtermEvaluation']['isAtRisk'] ?? null, 'Q4: Student Maria still sees published At-Risk while dirty');

// Grade-submission preview reports dirty=true and diff.added / diff.removed.
[, $grgDirtyState] = $gsFacultyGet($grgCs, $grgTokenFa);
expect_same(true, $grgDirtyState['midterm']['published'] ?? null, 'Q4: grade-submission reports midterm.published=true');
expect_same(true, $grgDirtyState['midterm']['dirty'] ?? null, 'Q4: grade-submission reports midterm.dirty=true after Midterm edits');
expect_same([$grgAna['number']], array_column($grgDirtyState['midterm']['diff']['added'] ?? [], 'studentNumber'), 'Q4: midterm.diff.added lists newly At-Risk Ana');
expect_same([$grgMaria['number']], array_column($grgDirtyState['midterm']['diff']['removed'] ?? [], 'studentNumber'), 'Q4: midterm.diff.removed lists cleared Maria');

// Update advisory (clicking Publish again).
$grgUpdAuditBefore = $gsAuditCount('midterm_advisory_updated', $grgCs);
[$grgUpdStatus, $grgUpdBody] = $grgPublish($grgCs, $grgTokenFa);
expect_same(200, $grgUpdStatus, 'Q4: Update advisory succeeds');
expect_same(false, $grgUpdBody['midterm']['dirty'] ?? null, 'Q4: Update advisory clears dirty flag');
expect_same(['added' => [], 'removed' => []], $grgUpdBody['midterm']['diff'] ?? null, 'Q4: Update advisory clears diff');
expect_same($grgUpdAuditBefore + 1, $gsAuditCount('midterm_advisory_updated', $grgCs), 'Q4: Update advisory records midterm_advisory_updated audit row');
expect_same($grgPubAuditBefore + 1, $gsAuditCount('midterm_advisory_published', $grgCs), 'Q4: Update advisory does not record a second published audit row');

// Notifications after Update: Juan NO duplicate, Maria cleared, Ana newly At-Risk!
expect_same(1, count($grgNotifRows($grgJuan['userId'], 'midterm_advisory', $grgJuan['enrollmentId'])), 'Q4: unchanged At-Risk Juan receives NO duplicate midterm_advisory notice on Update');
$grgMariaAfterUpd = $grgNotifRows($grgMaria['userId'], 'midterm_advisory', $grgMaria['enrollmentId']);
expect_same(2, count($grgMariaAfterUpd), 'Q4: cleared Maria receives 1 cleared notice (2 total)');
expect_true(str_starts_with($grgMariaAfterUpd[1]['title'], 'Midterm advisory cleared'), 'Q4: Maria second notice title starts with Midterm advisory cleared');
$grgAnaAfterUpd = $grgNotifRows($grgAna['userId'], 'midterm_advisory', $grgAna['enrollmentId']);
expect_same(1, count($grgAnaAfterUpd), 'Q4: newly At-Risk Ana receives 1 midterm_advisory notice on Update');
expect_true(str_starts_with($grgAnaAfterUpd[0]['title'], 'Midterm advisory in '), 'Q4: Ana notice title starts with Midterm advisory in');
expect_same([], $grgNotifRows($grgPedro['userId'], 'midterm_advisory', $grgPedro['enrollmentId']), 'Q4: Pedro still has 0 midterm notices');

// ---- 7. Unpublish ----
$grgUnpubAuditBefore = $gsAuditCount('midterm_advisory_unpublished', $grgCs);
[$grgUnpubStatus, $grgUnpubBody] = $grgUnpublish($grgCs, $grgTokenFa);
expect_same(200, $grgUnpubStatus, 'Q4: Unpublish Midterm advisory succeeds');
expect_same(false, $grgUnpubBody['midterm']['published'] ?? null, 'Q4: Unpublish sets midterm.published=false');
$grgUnpubDb = $gsRows('SELECT midterm_published_at, midterm_published_by, midterm_published_snapshot FROM class_sections WHERE cs_id = ?', [$grgCs])[0];
expect_same([null, null, null], [$grgUnpubDb['midterm_published_at'], $grgUnpubDb['midterm_published_by'], $grgUnpubDb['midterm_published_snapshot']], 'Q4: Unpublish clears published columns and snapshot in DB');
expect_same($grgUnpubAuditBefore + 1, $gsAuditCount('midterm_advisory_unpublished', $grgCs), 'Q4: Unpublish records midterm_advisory_unpublished audit row');
expect_same(1, count($grgNotifRows($grgJuan['userId'], 'midterm_advisory', $grgJuan['enrollmentId'])), 'Q4: Unpublish sends 0 notifications (Juan)');
expect_same(2, count($grgNotifRows($grgMaria['userId'], 'midterm_advisory', $grgMaria['enrollmentId'])), 'Q4: Unpublish sends 0 notifications (Maria)');
expect_same(1, count($grgNotifRows($grgAna['userId'], 'midterm_advisory', $grgAna['enrollmentId'])), 'Q4: Unpublish sends 0 notifications (Ana)');

[, $grgJuanAfterUnpub] = integration_http_get_json('/api/student/classes', $grgJuan['token']);
$grgJuanClsUnpub = $grgFindStudentRow($grgJuanAfterUnpub['classes'] ?? [], $grgJuan['enrollmentId']);
expect_same(false, $grgJuanClsUnpub['midtermEvaluation']['published'] ?? null, 'Q4: Student Juan midtermEvaluation.published=false after Unpublish');
expect_same(false, $grgJuanClsUnpub['midtermEvaluation']['isAtRisk'] ?? null, 'Q4: Student Juan midtermEvaluation.isAtRisk=false after Unpublish');
[, $grgFacKpisUnpub] = integration_http_get_json('/api/faculty/dashboard/kpis', $grgTokenFa);
expect_same(0, (int) ($grgFacKpisUnpub['kpis']['retentionAlerts'] ?? -1), 'Q4: Faculty dashboard retentionAlerts drops to 0 after Unpublish');
[, $grgDeanUnpub] = integration_http_get_json('/api/admin/dashboard/kpis?schoolYear=current', $adminAccessToken);
expect_same($grgDeanBase['kpis']['atRisk'] ?? null, $grgDeanUnpub['kpis']['atRisk'] ?? null, 'Q4: Dean dashboard atRisk returns to baseline after Unpublish');
expect_same(409, integration_http_json('/api/faculty/send-email', $grgTokenFa, [
    'emailType' => 'Midterm Advisory',
    'enrollmentIds' => [$grgJuan['enrollmentId']],
])[0], 'Q4: Email Management Midterm Advisory refuses (409) after Unpublish');

// Re-publish $grgCs before Final Submit so we also verify Final Submit retires Midterm Advisory!
expect_same(200, $grgPublish($grgCs, $grgTokenFa)[0], 'Q4/Q5 setup: re-publish Midterm advisory before Final Submit');

// ---- 8. Q5 & Q6: Final Submit, Fresh Recompute, Withdraw + Preserved Remedials ----
// Set final scores so:
// - Juan: Midterm 82, Final 82 -> 82 (2.6, Remedial) [revert Juan Final.Lecture.Quiz from 98 -> 82]
// - Maria: Midterm 90, Final 78 -> 0.3*90 + 0.7*78 = 27 + 54.6 = 81.6 -> 2.6 (Remedial)
// - Pedro: Midterm 90, Final 60 -> 69 (5.0, Irregular reenrollment)
// - Ana: Midterm 82, Final 94 -> 0.3*82 + 0.7*94 = 24.6 + 65.8 = 90.4 -> 1.9 (Passing)
$grgFinalBatches = [];
foreach (['Final.Lecture.Quiz', 'Final.Lecture.Exam', 'Final.Laboratory.Quiz'] as $k) {
    $grgFinalBatches[] = [
        'assessmentId' => (string) $grgAss[$k],
        'scores' => [
            ['studentId' => (string) $grgJuan['studentId'], 'score' => 82.0],
            ['studentId' => (string) $grgMaria['studentId'], 'score' => 78.0],
            ['studentId' => (string) $grgPedro['studentId'], 'score' => 60.0],
            ['studentId' => (string) $grgAna['studentId'], 'score' => 94.0],
        ],
    ];
}
expect_same(200, $grgSaveScores($grgFinalBatches, $grgTokenFa)[0], 'Q5 setup: Final scores saved');

// Verify retentionImpact on GET /api/faculty/classes/grade-submission.
[, $grgPreSubmitPayload] = $gsFacultyGet($grgCs, $grgTokenFa);
$grgImpactByNum = [];
foreach ($grgPreSubmitPayload['retentionImpact'] ?? [] as $imp) {
    $grgImpactByNum[$imp['studentNumber']] = $imp['outcome'];
}
expect_same(
    [
        $grgJuan['number'] => 'remedial',
        $grgMaria['number'] => 'remedial',
        $grgPedro['number'] => 'irregular_reenrollment',
    ],
    $grgImpactByNum,
    'Q5: retentionImpact lists Remedial (2.5-4.9) and Irregular reenrollment (5.0) students and excludes passing Ana'
);

// Q6: Remedial save & Remedial Notice email BEFORE Submit fail with 409.
[$grgRemEarlyStatus, $grgRemEarlyBody] = $grgRemedialSave($grgJuan['enrollmentId'], ['attemptNumber' => 1, 'percentage' => 80.0], $grgTokenFa);
expect_same(409, $grgRemEarlyStatus, 'Q6: recording remedial attempt before Submit fails with 409');
expect_same('Submit the class grades before recording a remedial result.', $gsMessage($grgRemEarlyBody), 'Q6: pre-submit remedial save message matches contract');

[$grgRemEmailEarlyStatus, $grgRemEmailEarlyBody] = integration_http_json('/api/faculty/send-email', $grgTokenFa, [
    'emailType' => 'Remedial Notice',
    'enrollmentIds' => [$grgJuan['enrollmentId']],
]);
expect_same(409, $grgRemEmailEarlyStatus, 'Q6: sending Remedial Notice before Submit fails with 409');
expect_same('Submit the class grades before sending remedial notices.', $gsMessage($grgRemEmailEarlyBody), 'Q6: pre-submit remedial email message matches contract');

// Fresh recompute proof: tweak Juan's Final.Lecture.Quiz raw score in DB directly from 82 -> 76 without calling /compute,
// then call Submit (Final Lecture = 79, Final = 80, Course = 25 + 56 = 81 -> percentage changes from 82.00 to 81.00, GWA stays 2.6).
$pdo->prepare('UPDATE assessment_scores SET score = 76.0 WHERE assessment_id = ? AND student_id = ?')
    ->execute([$grgAss['Final.Lecture.Quiz'], $grgJuan['studentId']]);

[$grgSubStatus, $grgSubBody] = $gsSubmit($grgCs, $grgTokenFa);
expect_same(200, $grgSubStatus, 'Q5: Final Submit succeeds');
expect_same('submitted', $grgSubBody['status'] ?? null, 'Q5: Submit returns submitted status');
expect_same(false, $grgSubBody['midterm']['published'] ?? null, 'Q5: Submit retires Midterm Advisory for this class');

// Fresh recompute verified on enrollments.final_percentage for Juan.
$grgJuanPctAfterSub = (float) $gsOne('SELECT final_percentage FROM enrollments WHERE enrollment_id = ?', [$grgJuan['enrollmentId']]);
expect_same(81.0, $grgJuanPctAfterSub, "Q5: Submit recomputed fresh percentage inside transaction ({$grgJuanPctAfterSub})");

// Restore raw score 82 so calculations stay clean for the rest of the scenario? No need—81.58 is GWA 2.6!

// Notifications after Final Submit: Remedial required ONLY to 2.5-4.9 (Juan, Maria), NOT 5.0 (Pedro) or 1.9 (Ana).
$grgJuanRemNotifs = $grgNotifRows($grgJuan['userId'], 'remedial_assignment', $grgJuan['enrollmentId']);
$grgMariaRemNotifs = $grgNotifRows($grgMaria['userId'], 'remedial_assignment', $grgMaria['enrollmentId']);
expect_same(1, count($grgJuanRemNotifs), 'Q5: Juan receives 1 Remedial required notice on Submit');
expect_true(str_starts_with($grgJuanRemNotifs[0]['title'], 'Remedial required in '), 'Q5: Juan notice title starts with Remedial required in');
expect_same(1, count($grgMariaRemNotifs), 'Q5: Maria receives 1 Remedial required notice on Submit');
expect_true(str_starts_with($grgMariaRemNotifs[0]['title'], 'Remedial required in '), 'Q5: Maria notice title starts with Remedial required in');
expect_same([], $grgNotifRows($grgPedro['userId'], 'remedial_assignment', $grgPedro['enrollmentId']), 'Q5: 5.0 student Pedro receives 0 remedial_assignment notices on Submit');
expect_same([], $grgNotifRows($grgAna['userId'], 'remedial_assignment', $grgAna['enrollmentId']), 'Q5: passing student Ana receives 0 remedial_assignment notices on Submit');

// External visibility activated across Student, Dean, Faculty Retention, Faculty Dashboard KPIs, Faculty Reports; Midterm Advisory retired.
[, $grgJuanClassesSub] = integration_http_get_json('/api/student/classes', $grgJuan['token']);
$grgJuanClsSub = $grgFindStudentRow($grgJuanClassesSub['classes'] ?? [], $grgJuan['enrollmentId']);
expect_same(2.7, (float) ($grgJuanClsSub['grade'] ?? 0), 'Q1: Student Juan sees Final grade 2.7 after Submit');
expect_same('remedial', $grgJuanClsSub['retentionState'] ?? null, 'Q1: Student Juan sees remedial retentionState after Submit');
expect_same(false, $grgJuanClsSub['midtermEvaluation']['published'] ?? null, 'Q2: Student Juan Midterm Advisory retired after Submit');
expect_same(false, $grgJuanClsSub['midtermEvaluation']['isAtRisk'] ?? null, 'Q2: Student Juan midtermEvaluation.isAtRisk=false after Submit');

[, $grgPedroClassesSub] = integration_http_get_json('/api/student/classes', $grgPedro['token']);
$grgPedroClsSub = $grgFindStudentRow($grgPedroClassesSub['classes'] ?? [], $grgPedro['enrollmentId']);
expect_same(5.0, (float) ($grgPedroClsSub['grade'] ?? 0), 'Q1: Student Pedro sees Final grade 5.0 after Submit');
expect_same('irregular_reenrollment', $grgPedroClsSub['retentionState'] ?? null, 'Q1: Student Pedro sees irregular_reenrollment after Submit');

[, $grgDeanAfterSub] = integration_http_get_json('/api/admin/dashboard/kpis?schoolYear=current', $adminAccessToken);
expect_same(((int) $grgDeanBase['kpis']['remedialCount']) + 2, (int) ($grgDeanAfterSub['kpis']['remedialCount'] ?? -1), 'Q1: Dean dashboard remedialCount includes Juan and Maria after Submit');
expect_same(((int) $grgDeanBase['kpis']['irregularReenrollmentCount']) + 1, (int) ($grgDeanAfterSub['kpis']['irregularReenrollmentCount'] ?? -1), 'Q1: Dean dashboard irregularReenrollmentCount includes Pedro after Submit');
expect_same(((int) $grgDeanBase['kpis']['goodStanding']) + 1, (int) ($grgDeanAfterSub['kpis']['goodStanding'] ?? -1), 'Q1: Dean dashboard goodStanding includes Ana after Submit');

[, $grgDeanRepSub] = integration_http_get_json('/api/admin/reports/summary?schoolYear=current', $adminAccessToken);
$grgDeanRepJuanSub = $grgFindAdminReportSubject($grgDeanRepSub, $grgJuan['studentId'], $grgJuan['enrollmentId']);
expect_same(2.7, (float) ($grgDeanRepJuanSub['grade'] ?? 0), 'Q1: Dean reports shows Juan Final grade 2.7 after Submit');
expect_same('remedial', $grgDeanRepJuanSub['retentionState'] ?? null, 'Q1: Dean reports shows Juan remedial retentionState after Submit');

[, $grgFacKpisSub] = integration_http_get_json('/api/faculty/dashboard/kpis', $grgTokenFa);
expect_same(2, (int) ($grgFacKpisSub['kpis']['remedialCount'] ?? -1), 'Q1: Faculty dashboard remedialCount is 2 after Submit');
expect_same(1, (int) ($grgFacKpisSub['kpis']['irregularReenrollmentCount'] ?? -1), 'Q1: Faculty dashboard irregularReenrollmentCount is 1 after Submit');
expect_same(0, (int) ($grgFacKpisSub['kpis']['retentionAlerts'] ?? -1), 'Q2: Faculty dashboard Midterm retentionAlerts is 0 after Submit');

[, $grgFacRepSub] = integration_http_get_json('/api/faculty/reports/summary', $grgTokenFa);
$grgFacRepJuanSub = $grgFindFacultyReportStudent($grgFacRepSub, $grgJuan['studentId']);
expect_same(2.7, (float) ($grgFacRepJuanSub['overallGWA'] ?? 0), 'Q7: Faculty reports shows Juan overallGWA 2.7 after Submit');
expect_same('remedial', $grgFacRepJuanSub['status'] ?? null, 'Q7: Faculty reports shows Juan remedial status after Submit');

// ---- 9. Q6: Record Remedial for Juan -> Withdraw -> Preserved -> Fix Maria -> Re-submit ----
[$grgJuanRemSaveStatus, $grgJuanRemSaveBody] = $grgRemedialSave($grgJuan['enrollmentId'], ['attemptNumber' => 1, 'percentage' => 80.0], $grgTokenFa);
expect_same(200, $grgJuanRemSaveStatus, 'Q6: recording passing remedial attempt for Juan succeeds after Submit');
expect_same('passed', $grgJuanRemSaveBody['progression']['stage'] ?? null, 'Q6: Juan remedial progression is passed');

// Withdraw within 24h SUCCEEDS even though Juan has a recorded remedial attempt!
[$grgWdStatus, $grgWdBody] = $gsWithdraw($grgCs, $grgTokenFa);
expect_same(200, $grgWdStatus, 'Q6: Withdraw within 24h succeeds even after remedial attempt was recorded');
expect_same('not_submitted', $grgWdBody['status'] ?? null, 'Q6: Withdraw sets status back to not_submitted');

// Juan's remedial attempt row is NEVER deleted in DB.
expect_same(1, (int) $gsOne('SELECT count(*) FROM enrollment_remedial_attempts WHERE enrollment_id = ?', [$grgJuan['enrollmentId']]), 'Q6: Withdraw preserves Juan remedial attempt in DB');

// While withdrawn, Faculty retention keeps saved attempts readable read-only, hides active retention, and refuses new remedial saves (409).
[, $grgFacRetWd] = integration_http_get_json('/api/faculty/retention', $grgTokenFa);
$grgFacRetJuanWd = $grgFindStudentRow($grgFacRetWd['retention'] ?? [], $grgJuan['enrollmentId']);
expect_same(false, $grgFacRetJuanWd['gradesSubmitted'] ?? null, 'Q6: while withdrawn, gradesSubmitted=false');
expect_same('active', $grgFacRetJuanWd['state'] ?? null, 'Q6: while withdrawn, active retention state is gated off');
expect_same('passed', $grgFacRetJuanWd['remedialProgression']['stage'] ?? null, 'Q6: while withdrawn, saved remedial attempt remains visible read-only');
expect_same(409, $grgRemedialSave($grgMaria['enrollmentId'], ['attemptNumber' => 1, 'percentage' => 80.0], $grgTokenFa)[0], 'Q6: recording new remedial attempt while withdrawn is refused with 409');
expect_same(409, integration_http_json('/api/faculty/send-email', $grgTokenFa, [
    'emailType' => 'Remedial Notice',
    'enrollmentIds' => [$grgMaria['enrollmentId']],
])[0], 'Q6: sending Remedial Notice while withdrawn is refused with 409');

// Fix Maria's Final scores so her overall course grade improves from 2.6 -> 2.2 (passing: 0.3*90 + 0.7*86 = 87.2 -> 2.2).
$grgMariaFixBatches = [];
foreach (['Final.Lecture.Quiz', 'Final.Lecture.Exam', 'Final.Laboratory.Quiz'] as $k) {
    $grgMariaFixBatches[] = [
        'assessmentId' => (string) $grgAss[$k],
        'scores' => [['studentId' => (string) $grgMaria['studentId'], 'score' => 86.0]],
    ];
}
expect_same(200, $grgSaveScores($grgMariaFixBatches, $grgTokenFa)[0], 'Q6: fixing Maria Final scores while withdrawn succeeds');
expect_same(1, count($grgNotifRows($grgMaria['userId'], 'remedial_assignment', $grgMaria['enrollmentId'])), 'Q5: score auto-save after Withdraw sends 0 remedial_assignment notices');

// Re-submit $grgCs.
[$grgReSubStatus] = $gsSubmit($grgCs, $grgTokenFa);
expect_same(200, $grgReSubStatus, 'Q6: Re-submit after Withdraw succeeds');

// Maria receives "Remedial no longer required", Juan receives NO duplicate "Remedial required", and Juan automatically restores as Cleared!
$grgMariaRemAfterReSub = $grgNotifRows($grgMaria['userId'], 'remedial_assignment', $grgMaria['enrollmentId']);
expect_same(2, count($grgMariaRemAfterReSub), 'Q5/Q6: Maria receives Remedial no longer required on Re-submit');
expect_true(str_starts_with($grgMariaRemAfterReSub[1]['title'], 'Remedial no longer required'), 'Q5/Q6: Maria second notice starts with Remedial no longer required');
$grgJuanRemAfterReSub = $grgNotifRows($grgJuan['userId'], 'remedial_assignment', $grgJuan['enrollmentId']);
$grgJuanGradeNotifsAfterReSub = array_values(array_filter(
    $grgJuanRemAfterReSub,
    static fn(array $row): bool => str_starts_with($row['title'], 'Remedial required')
        || str_starts_with($row['title'], 'Remedial no longer required')
));
expect_same(1, count($grgJuanGradeNotifsAfterReSub), 'Q5/Q6: Juan receives NO duplicate or false grade-trigger remedial notice on Re-submit');
expect_true(str_starts_with($grgJuanGradeNotifsAfterReSub[0]['title'], 'Remedial required in '), 'Q5/Q6: Juan keeps original Remedial required notice only');

[, $grgFacRetReSub] = integration_http_get_json('/api/faculty/retention', $grgTokenFa);
$grgFacRetJuanReSub = $grgFindStudentRow($grgFacRetReSub['retention'] ?? [], $grgJuan['enrollmentId']);
expect_same('cleared', $grgFacRetJuanReSub['state'] ?? null, 'Q6: Juan saved remedial attempt automatically restores as cleared on Re-submit');
[, $grgJuanRetReSub] = integration_http_get_json('/api/student/retention', $grgJuan['token']);
$grgStuJuanReSub = $grgFindStudentRow($grgJuanRetReSub['retention']['records'] ?? [], $grgJuan['enrollmentId']);
expect_same('cleared', $grgStuJuanReSub['retentionState'] ?? null, 'Q6: Student Juan sees restored cleared state after Re-submit');

// ---- 10. Q5 & Q6: Open Draft Guard & Dean Approve Grade Change Notices ----
$grgApprS1 = $grgMakeStudent('ApprOne', $grgApproveCs);   // 1.9 -> 2.6 (enters Remedial)
$grgApprS2 = $grgMakeStudent('ApprTwo', $grgApproveCs);   // 2.6 -> 1.9 (leaves Remedial)
$grgApprS3 = $grgMakeStudent('ApprThree', $grgApproveCs); // 1.9 -> 1.7 (normal passing change: silent)

$grgApprInitBatches = [];
foreach (array_keys($grgApproveAss) as $k) {
    $grgApprInitBatches[] = [
        'assessmentId' => (string) $grgApproveAss[$k],
        'scores' => [
            ['studentId' => (string) $grgApprS1['studentId'], 'score' => 90.0],
            ['studentId' => (string) $grgApprS2['studentId'], 'score' => 82.0],
            ['studentId' => (string) $grgApprS3['studentId'], 'score' => 90.0],
        ],
    ];
}
expect_same(200, $grgSaveScores($grgApprInitBatches, $grgTokenFa)[0], 'Dean Approve setup: initial scores saved');
expect_same(200, $gsSubmit($grgApproveCs, $grgTokenFa)[0], 'Dean Approve setup: class submitted');
expect_same([], $grgNotifRows($grgApprS1['userId'], 'remedial_assignment', $grgApprS1['enrollmentId']), 'Dean Approve setup: passing S1 has 0 remedial notices');
expect_same(1, count($grgNotifRows($grgApprS2['userId'], 'remedial_assignment', $grgApprS2['enrollmentId'])), 'Dean Approve setup: remedial S2 has 1 Remedial required notice');
expect_same([], $grgNotifRows($grgApprS3['userId'], 'remedial_assignment', $grgApprS3['enrollmentId']), 'Dean Approve setup: passing S3 has 0 remedial notices');

// Schedule attempt 1 for S2 while submitted & no open draft (to verify Email Management guard during open batch).
expect_same(200, $grgRemedialSave($grgApprS2['enrollmentId'], ['attemptNumber' => 1, 'scheduledDate' => '2027-02-20'], $grgTokenFa)[0], 'Dean Approve setup: S2 attempt 1 scheduled');

// Expire grace and open a Dean grade-change draft.
$pdo->prepare("UPDATE class_sections SET grades_grace_until = CURRENT_TIMESTAMP - INTERVAL '1 hour' WHERE cs_id = ?")->execute([$grgApproveCs]);
[$grgOpenBatchStatus, $grgOpenBatchBody] = integration_http_json('/api/faculty/classes/grade-change', $grgTokenFa, ['csId' => $grgApproveCs]);
expect_same(200, $grgOpenBatchStatus, 'Q6: opening grade-change draft succeeds after grace');
$grgApproveBatchId = (int) ($grgOpenBatchBody['batch']['batchId'] ?? 0);

// During open draft: recording a remedial attempt fails with 409, and sending Remedial Notice fails with 409.
[$grgDraftRemStatus, $grgDraftRemBody] = $grgRemedialSave($grgApprS2['enrollmentId'], ['attemptNumber' => 1, 'percentage' => 80.0], $grgTokenFa);
expect_same(409, $grgDraftRemStatus, 'Q6: recording remedial attempt during open draft batch fails with 409');
expect_same('Finish or discard the open grade change before recording a remedial result.', $gsMessage($grgDraftRemBody), 'Q6: open-draft remedial refusal matches contract');
expect_same(409, integration_http_json('/api/faculty/send-email', $grgTokenFa, [
    'emailType' => 'Remedial Notice',
    'enrollmentIds' => [$grgApprS2['enrollmentId']],
])[0], 'Q6: sending Remedial Notice during open draft batch fails with 409');

// Edit scores in the draft: S1 90->82 (1.9->2.6), S2 82->90 (2.6->1.9), S3 90->92 (1.9->1.7).
$grgApprEditBatches = [];
foreach (array_keys($grgApproveAss) as $k) {
    $grgApprEditBatches[] = [
        'assessmentId' => (string) $grgApproveAss[$k],
        'scores' => [
            ['studentId' => (string) $grgApprS1['studentId'], 'score' => 82.0],
            ['studentId' => (string) $grgApprS2['studentId'], 'score' => 90.0],
            ['studentId' => (string) $grgApprS3['studentId'], 'score' => 92.0],
        ],
    ];
}
expect_same(200, $grgSaveScores($grgApprEditBatches, $grgTokenFa)[0], 'Q5: draft score edits succeed');
expect_same(200, integration_http_json('/api/faculty/classes/grade-change/send', $grgTokenFa, [
    'csId' => $grgApproveCs,
    'reason' => 'Corrected grading sheets for all three students.',
])[0], 'Q6: sending grade change batch succeeds');

// During pending batch: recording a remedial attempt also fails with 409.
[$grgPendRemStatus, $grgPendRemBody] = $grgRemedialSave($grgApprS2['enrollmentId'], ['attemptNumber' => 1, 'percentage' => 80.0], $grgTokenFa);
expect_same(409, $grgPendRemStatus, 'Q6: recording remedial attempt during pending batch fails with 409');
expect_same('Finish or discard the open grade change before recording a remedial result.', $gsMessage($grgPendRemBody), 'Q6: pending-batch remedial refusal matches contract');

// Dean approves the grade change.
[$grgDecideStatus] = integration_http_json('/api/admin/grade-change-requests/approve', $adminAccessToken, ['batchId' => $grgApproveBatchId]);
expect_same(200, $grgDecideStatus, 'Q5: Dean approves grade change batch');

$grgS1NotifsAfterAppr = $grgNotifRows($grgApprS1['userId'], 'remedial_assignment', $grgApprS1['enrollmentId']);
expect_same(1, count($grgS1NotifsAfterAppr), 'Q5: Dean Approve moving S1 into Remedial sends 1 Remedial required notice');
expect_true(str_starts_with($grgS1NotifsAfterAppr[0]['title'], 'Remedial required in '), 'Q5: S1 notice title starts with Remedial required in');

$grgS2NotifsAfterAppr = $grgNotifRows($grgApprS2['userId'], 'remedial_assignment', $grgApprS2['enrollmentId']);
$grgS2GradeNotifsAfterAppr = array_values(array_filter(
    $grgS2NotifsAfterAppr,
    static fn(array $row): bool => str_starts_with($row['title'], 'Remedial required')
        || str_starts_with($row['title'], 'Remedial no longer required')
));
expect_same(3, count($grgS2NotifsAfterAppr), 'Q5: S2 has required + scheduled + cleared remedial_assignment notices');
expect_same(2, count($grgS2GradeNotifsAfterAppr), 'Q5: Dean Approve moving S2 out of Remedial sends Remedial no longer required notice');
expect_true(str_starts_with($grgS2GradeNotifsAfterAppr[1]['title'], 'Remedial no longer required'), 'Q5: S2 second grade-trigger notice title starts with Remedial no longer required');

expect_same([], $grgNotifRows($grgApprS3['userId'], 'remedial_assignment', $grgApprS3['enrollmentId']), 'Q5: Dean Approve on normal passing change (1.9 -> 1.7) sends 0 student notices');

// Retire disposable fixture classes so later suites stay isolated (clear dependents on unaudited classes before DELETE).
$grgCheckAudit = $pdo->prepare('SELECT 1 FROM audit_events WHERE scope_cs_id = ? LIMIT 1');
foreach ([$grgCs, $grgEmptyCs, $grgOverallCs, $grgZeroRiskCs, $grgApproveCs] as $grgCleanupCs) {
    $grgCheckAudit->execute([$grgCleanupCs]);
    if ($grgCheckAudit->fetchColumn() === false) {
        $pdo->prepare('DELETE FROM assessment_scores WHERE assessment_id IN (SELECT assessment_id FROM assessments WHERE cs_id = ?)')->execute([$grgCleanupCs]);
        $pdo->prepare('DELETE FROM assessments WHERE cs_id = ?')->execute([$grgCleanupCs]);
        $pdo->prepare('DELETE FROM enrollment_remedial_attempts WHERE enrollment_id IN (SELECT enrollment_id FROM enrollments WHERE cs_id = ?)')->execute([$grgCleanupCs]);
        $pdo->prepare('DELETE FROM enrollments WHERE cs_id = ?')->execute([$grgCleanupCs]);
    }
}
integration_retire_fixture_classes(
    $pdo,
    [$grgCs, $grgEmptyCs, $grgOverallCs, $grgZeroRiskCs, $grgApproveCs],
    []
);
echo "PASS: Grade release gates (12.12 + 12.13) PostgreSQL integration coverage completed.\n";
