<?php

declare(strict_types=1);

// Focused PostgreSQL lifecycle tests for the Owner-approved grouped grading
// contract. This file is included at the end of postgres_integration_test.php
// and uses only disposable, dynamically-created course fixtures.
$groupedFixtureSuffix = strtoupper(bin2hex(random_bytes(4)));
$groupedCurrentYear = academic_current_school_year($pdo);
$groupedOwnerStmt = $pdo->prepare("SELECT user_id FROM user_accounts WHERE user_id = ? AND role = 'faculty' AND status = 'Active'");
$groupedOwnerStmt->execute([(int) $userId]);
$groupedOwnerId = (int) $groupedOwnerStmt->fetchColumn();
expect_true($groupedOwnerId > 0, 'The authenticated integration Faculty identity is available for grouped fixtures');

$groupedCreateOffering = static function (string $label, ?string $schoolYear = null) use (
    $pdo,
    $groupedFixtureSuffix,
    $groupedOwnerId,
    $groupedCurrentYear
): array {
    $schoolYear ??= $groupedCurrentYear;
    $courseCode = 'GG' . $label . $groupedFixtureSuffix;
    $courseStmt = $pdo->prepare(
        "INSERT INTO courses (course_code, name, units, semester, grading_config)
         VALUES (?, ?, 3.0, '1ST', '{}'::jsonb)
         RETURNING course_id"
    );
    $courseStmt->execute([$courseCode, 'Grouped Grading ' . $label . ' ' . $groupedFixtureSuffix]);
    $courseId = (int) $courseStmt->fetchColumn();
    $sectionName = 'GG-' . $label . '-' . $groupedFixtureSuffix;
    $sectionStmt = $pdo->prepare(
        "INSERT INTO class_sections (cs_name, course_id, instructor_user_id, semester, school_year, status)
         VALUES (?, ?, ?, '1ST', ?, 'Active')
         RETURNING cs_id"
    );
    $sectionStmt->execute([$sectionName, $courseId, $groupedOwnerId, $schoolYear]);
    return [
        'courseId' => $courseId,
        'courseCode' => $courseCode,
        'classId' => (int) $sectionStmt->fetchColumn(),
        'sectionName' => $sectionName,
        'schoolYear' => $schoolYear,
    ];
};

$groupedCreateStudent = static function (string $label, int $classId) use ($pdo, $groupedFixtureSuffix): array {
    $studentNumber = 'INT-GG-' . $label . '-' . $groupedFixtureSuffix;
    $email = 'grouped.' . strtolower($label) . '.' . strtolower($groupedFixtureSuffix) . '@bicol-u.edu.ph';
    $studentStmt = $pdo->prepare(
        "INSERT INTO students (student_number, first_name, last_name, bu_email, status, admission_date)
         VALUES (?, 'Grouped', ?, ?, 'active', CURRENT_DATE)
         RETURNING student_id"
    );
    $studentStmt->execute([$studentNumber, $label, $email]);
    $studentId = (int) $studentStmt->fetchColumn();
    $enrollmentStmt = $pdo->prepare(
        "INSERT INTO enrollments (student_id, cs_id, status, date_enrolled)
         VALUES (?, ?, 'Active', CURRENT_DATE)
         RETURNING enrollment_id"
    );
    $enrollmentStmt->execute([$studentId, $classId]);
    return ['studentId' => $studentId, 'enrollmentId' => (int) $enrollmentStmt->fetchColumn()];
};

$groupedAttendanceRanges = [
    'midterm' => ['startDate' => '2026-08-15', 'endDate' => '2026-09-30'],
    'final' => ['startDate' => '2026-10-15', 'endDate' => '2026-12-01'],
];
$groupedCategories = static function (?array $ids = null): array {
    $category = static function (string $name, float $weight, int $sortOrder, string $component, ?int $id = null): array {
        $row = ['name' => $name, 'weight' => $weight, 'sortOrder' => $sortOrder, 'component' => $component];
        if ($id !== null) {
            $row['id'] = $id;
        }
        return $row;
    };
    $period = static function (string $key, int $offset) use ($category, $ids): array {
        return [
            $category('Quiz', 50, 1, 'Lecture', $ids[$key]['Lecture']['Quiz'] ?? null),
            $category('Exam', 50, 2, 'Lecture', $ids[$key]['Lecture']['Exam'] ?? null),
            $category('Quiz', 100, 3, 'Laboratory', $ids[$key]['Laboratory']['Quiz'] ?? null),
        ];
    };
    return [
        'midtermCategories' => $period('Midterm', 0),
        'finalCategories' => $period('Final', 0),
    ];
};
$groupedPayload = static function (array $offering, ?array $categoryIds = null) use (
    $groupedCategories,
    $groupedAttendanceRanges
): array {
    return array_merge([
        'courseId' => $offering['courseId'],
        'semester' => '1st',
        'schoolYear' => $offering['schoolYear'],
        'schemaMode' => 'periods',
        'componentMode' => 'lecture_laboratory',
        'componentWeights' => ['lecture' => 60, 'laboratory' => 40],
        'termRatio' => ['midterm' => 30, 'final' => 70],
    ], $groupedCategories($categoryIds), [
        'attendanceDateRanges' => $groupedAttendanceRanges,
    ]);
};
$groupedMembershipRows = static function (int $configId) use ($pdo): array {
    $stmt = $pdo->prepare(
        'SELECT gcp.category_id, gcp.name, gcp.weight, gcp.grading_period, gcp.component, gcp.source_kind
           FROM grading_category_period_memberships gcp
           JOIN grading_categories gc ON gc.category_id = gcp.category_id
          WHERE gc.config_id = ?
          ORDER BY gcp.grading_period, gcp.component, gcp.sort_order, gcp.category_id'
    );
    $stmt->execute([$configId]);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
};
$groupedCategoryIds = static function (array $rows): array {
    $ids = [];
    foreach ($rows as $row) {
        $ids[(string) $row['grading_period']][(string) $row['component']][(string) $row['name']] = (int) $row['category_id'];
    }
    return $ids;
};
$groupedInsertAssessment = static function (
    int $classId,
    int $categoryId,
    string $title,
    string $period,
    float $maxScore = 100.0,
    bool $transmutation = false
) use ($pdo): int {
    $stmt = $pdo->prepare(
        'INSERT INTO assessments
            (cs_id, title, type, grading_category_id, grading_period, max_score, weight, status,
             transmutation_enabled, transmutation_minimum_percentage, transmutation_maximum_percentage)
         VALUES (?, ?, \'Quiz\', ?, ?, ?, 1, \'Active\', ?, 50, 100)
         RETURNING assessment_id'
    );
    $stmt->execute([$classId, $title, $categoryId, $period, $maxScore, $transmutation ? 'true' : 'false']);
    return (int) $stmt->fetchColumn();
};
$groupedInsertUnlinkedAssessment = static function (
    int $classId,
    string $title,
    string $type,
    string $period
) use ($pdo): int {
    $stmt = $pdo->prepare(
        "INSERT INTO assessments (cs_id, title, type, grading_category_id, grading_period, max_score, weight, status)
         VALUES (?, ?, ?, NULL, ?, 100, 1, 'Active')
         RETURNING assessment_id"
    );
    $stmt->execute([$classId, $title, $type, $period]);
    return (int) $stmt->fetchColumn();
};
$groupedInsertScore = static function (int $assessmentId, int $studentId, float $score) use ($pdo): void {
    $pdo->prepare(
        'INSERT INTO assessment_scores (assessment_id, student_id, score, submitted_at, remarks)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP(6), ?)'
    )->execute([$assessmentId, $studentId, $score, 'Grouped grading integration fixture']);
};
$groupedReadGrade = static function (int $enrollmentId) use ($pdo): array {
    $stmt = $pdo->prepare(
        'SELECT final_percentage, final_gwa, grade_components_json::text AS grade_components_json
           FROM enrollments WHERE enrollment_id = ?'
    );
    $stmt->execute([$enrollmentId]);
    return $stmt->fetch(PDO::FETCH_ASSOC) ?: [];
};
$groupedReadAssessmentSnapshot = static function (array $assessmentIds) use ($pdo): array {
    $placeholders = implode(',', array_fill(0, count($assessmentIds), '?'));
    $stmt = $pdo->prepare(
        "SELECT a.assessment_id, a.grading_category_id, a.grading_period, sc.score
           FROM assessments a
           LEFT JOIN assessment_scores sc ON sc.assessment_id = a.assessment_id
          WHERE a.assessment_id IN ({$placeholders})
          ORDER BY a.assessment_id"
    );
    $stmt->execute($assessmentIds);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
};
$groupedAssessmentValues = static function (array $snapshot): array {
    return array_map(static fn(array $row): array => [
        'assessment_id' => (int) $row['assessment_id'],
        'grading_category_id' => $row['grading_category_id'] === null ? null : (int) $row['grading_category_id'],
        'score' => $row['score'] === null ? null : (string) $row['score'],
    ], $snapshot);
};

// A fresh grouped offering exercises the approved 85.4 example, reusable
// category names, transmutation, a real zero, and a missing score.
$groupedOffering = $groupedCreateOffering('CORE');
$groupedStudentA = $groupedCreateStudent('CoreComplete', $groupedOffering['classId']);
$groupedStudentB = $groupedCreateStudent('CoreZero', $groupedOffering['classId']);
$groupedStudentC = $groupedCreateStudent('CoreMissing', $groupedOffering['classId']);
$groupedDefaultsPath = '/api/faculty/grading-config?' . http_build_query([
    'courseId' => $groupedOffering['courseId'],
    'semester' => '1st',
    'schoolYear' => $groupedOffering['schoolYear'],
]);
[$groupedDefaultsStatus, $groupedDefaultsBody] = integration_http_get_json($groupedDefaultsPath, $facultyAccessToken);
expect_same(200, $groupedDefaultsStatus, 'An unconfigured grouped offering exposes its defaults through the server');
expect_same(null, $groupedDefaultsBody['configuration'] ?? null, 'Unconfigured defaults remain unsaved until Faculty saves');
expect_same('lecture_laboratory', $groupedDefaultsBody['defaults']['componentMode'] ?? null, 'Server defaults require the Lecture/Laboratory structure');
expect_same(['lecture' => 60, 'laboratory' => 40], $groupedDefaultsBody['defaults']['componentWeights'] ?? null, 'Server defaults return the approved 60/40 component ratio');
expect_same(['midterm' => 30, 'final' => 70], $groupedDefaultsBody['defaults']['termRatio'] ?? null, 'Server defaults return the approved 30/70 period ratio');
$groupedDefaultCategoryRows = static fn(array $categories): array => array_map(
    static fn(array $category): array => [
        $category['name'] ?? null,
        $category['weight'] ?? null,
        $category['component'] ?? null,
        $category['sourceKind'] ?? null,
    ],
    $categories
);
$groupedExpectedDefaultCategoryRows = [
    ['Term Exam', 50, 'Lecture', 'assessment'],
    ['Quiz', 20, 'Lecture', 'assessment'],
    ['Outputs', 20, 'Lecture', 'assessment'],
    ['Participation', 10, 'Lecture', 'assessment'],
    ['Practical Exam', 50, 'Laboratory', 'assessment'],
    ['Laboratory Exercises', 30, 'Laboratory', 'assessment'],
    ['Quiz', 10, 'Laboratory', 'assessment'],
    ['Recitation', 10, 'Laboratory', 'assessment'],
];
expect_same($groupedExpectedDefaultCategoryRows, $groupedDefaultCategoryRows($groupedDefaultsBody['defaults']['midtermCategories'] ?? []), 'Midterm defaults return the complete ordered syllabus category list');
expect_same($groupedExpectedDefaultCategoryRows, $groupedDefaultCategoryRows($groupedDefaultsBody['defaults']['finalCategories'] ?? []), 'Finals defaults return the same complete ordered syllabus category list');
$groupedInitialPayload = $groupedPayload($groupedOffering);
$groupedMissingModePayload = $groupedInitialPayload;
unset($groupedMissingModePayload['componentMode']);
[$groupedMissingModeStatus, $groupedMissingModeBody] = integration_http_put_json(
    '/api/faculty/grading-config',
    $facultyAccessToken,
    $groupedMissingModePayload
);
expect_same(422, $groupedMissingModeStatus, 'A new period configuration cannot omit componentMode');
expect_same('GRADING_COMPONENT_MODE_REQUIRED', $groupedMissingModeBody['code'] ?? null, 'New period saves use the stable mandatory component-mode error');
$groupedCombinedModePayload = $groupedInitialPayload;
$groupedCombinedModePayload['componentMode'] = 'combined';
[$groupedCombinedModeStatus, $groupedCombinedModeBody] = integration_http_put_json(
    '/api/faculty/grading-config',
    $facultyAccessToken,
    $groupedCombinedModePayload
);
expect_same(422, $groupedCombinedModeStatus, 'A new period configuration cannot choose combined mode');
expect_same('GRADING_COMPONENT_MODE_REQUIRED', $groupedCombinedModeBody['code'] ?? null, 'Combined period saves use the same stable mandatory component-mode error');
[$groupedAfterRejectedSavesStatus, $groupedAfterRejectedSavesBody] = integration_http_get_json($groupedDefaultsPath, $facultyAccessToken);
expect_same(200, $groupedAfterRejectedSavesStatus, 'Rejected new period saves leave the offering readable');
expect_same(null, $groupedAfterRejectedSavesBody['configuration'] ?? null, 'Rejected new period saves do not persist a configuration');
[$groupedCreateStatus, $groupedCreateBody] = integration_http_put_json(
    '/api/faculty/grading-config',
    $facultyAccessToken,
    $groupedInitialPayload
);
expect_same(201, $groupedCreateStatus, 'Faculty can explicitly create a Lecture/Laboratory grouped period configuration');
$groupedConfiguration = $groupedCreateBody['configuration'] ?? [];
$groupedConfigId = (int) ($groupedConfiguration['id'] ?? 0);
$groupedConfigVersion = (int) ($groupedConfiguration['version'] ?? 0);
expect_true($groupedConfigId > 0 && $groupedConfigVersion === 1, 'A grouped offering has its own stable configuration and initial version');
expect_same('lecture_laboratory', $groupedConfiguration['componentMode'] ?? null, 'The grouped mode round-trips through the save response');
expect_same(60.0, (float) ($groupedConfiguration['componentWeights']['lecture'] ?? 0), 'The saved Lecture ratio is independent of the course unit count');
expect_same(40.0, (float) ($groupedConfiguration['componentWeights']['laboratory'] ?? 0), 'The saved Laboratory ratio is independent of the course unit count');
$groupedRows = $groupedMembershipRows($groupedConfigId);
$groupedIds = $groupedCategoryIds($groupedRows);
expect_same(2, count(array_filter(
    $groupedRows,
    static fn(array $row): bool => $row['grading_period'] === 'Midterm' && $row['name'] === 'Quiz'
)), 'PostgreSQL stores the repeated Midterm Quiz name once per component');
expect_same(
    ['Laboratory', 'Lecture'],
    array_values(array_unique(array_map(
        static fn(array $row): string => (string) $row['component'],
        array_values(array_filter($groupedRows, static fn(array $row): bool => $row['grading_period'] === 'Midterm' && $row['name'] === 'Quiz'))
    ))),
    'Repeated category names resolve to distinct Lecture and Laboratory components'
);

$groupedAssessments = [
    'midtermLectureQuiz' => $groupedInsertAssessment(
        $groupedOffering['classId'], $groupedIds['Midterm']['Lecture']['Quiz'], 'Midterm Lecture Quiz', 'Midterm', 100, true
    ),
    'midtermLectureExam' => $groupedInsertAssessment(
        $groupedOffering['classId'], $groupedIds['Midterm']['Lecture']['Exam'], 'Midterm Lecture Exam', 'Midterm'
    ),
    'midtermLaboratoryQuiz' => $groupedInsertAssessment(
        $groupedOffering['classId'], $groupedIds['Midterm']['Laboratory']['Quiz'], 'Midterm Laboratory Quiz', 'Midterm'
    ),
    'finalLectureQuiz' => $groupedInsertAssessment(
        $groupedOffering['classId'], $groupedIds['Final']['Lecture']['Quiz'], 'Final Lecture Quiz', 'Final'
    ),
    'finalLectureExam' => $groupedInsertAssessment(
        $groupedOffering['classId'], $groupedIds['Final']['Lecture']['Exam'], 'Final Lecture Exam', 'Final'
    ),
    'finalLaboratoryQuiz' => $groupedInsertAssessment(
        $groupedOffering['classId'], $groupedIds['Final']['Laboratory']['Quiz'], 'Final Laboratory Quiz', 'Final'
    ),
];
$groupedStudentScores = [
    $groupedStudentA['studentId'] => [
        'midtermLectureQuiz' => 50,
        'midtermLectureExam' => 85,
        'midtermLaboratoryQuiz' => 90,
        'finalLectureQuiz' => 90,
        'finalLectureExam' => 90,
        'finalLaboratoryQuiz' => 80,
    ],
    $groupedStudentB['studentId'] => [
        'midtermLectureQuiz' => 100,
        'midtermLectureExam' => 100,
        'midtermLaboratoryQuiz' => 0,
        'finalLectureQuiz' => 100,
        'finalLectureExam' => 100,
        'finalLaboratoryQuiz' => 0,
    ],
    $groupedStudentC['studentId'] => [
        'midtermLectureQuiz' => 100,
        'midtermLectureExam' => 100,
        'midtermLaboratoryQuiz' => 100,
        'finalLectureQuiz' => 100,
        'finalLectureExam' => 100,
        // No saved score for Final Laboratory Quiz: the positive component and
        // dependent period must remain incomplete.
    ],
];
foreach ($groupedStudentScores as $studentId => $scores) {
    foreach ($scores as $assessmentKey => $score) {
        $groupedInsertScore($groupedAssessments[$assessmentKey], (int) $studentId, (float) $score);
    }
}

// An authorized Faculty cannot recompute another Faculty member's class.
[$groupedForeignComputeStatus] = integration_http_json('/api/faculty/grades/compute', $seedFacultyAccessToken, [
    'classId' => (string) $groupedOffering['classId'],
]);
expect_same(403, $groupedForeignComputeStatus, 'Grouped grade computation enforces Faculty class authorization');

// A stale grouped version must not mutate either the saved configuration or
// the category identifiers already used by assessments.
$groupedStalePayload = $groupedInitialPayload;
$groupedStalePayload['version'] = $groupedConfigVersion + 10;
[$groupedStaleStatus, $groupedStaleBody] = integration_http_put_json(
    '/api/faculty/grading-config',
    $facultyAccessToken,
    $groupedStalePayload
);
expect_same(409, $groupedStaleStatus, 'Grouped configuration rejects a stale version');
expect_same('GRADING_CONFIGURATION_VERSION_CONFLICT', $groupedStaleBody['code'] ?? null, 'Grouped stale-version rejection returns the established conflict error');
$groupedVersionRead = $pdo->prepare('SELECT version FROM grading_configs WHERE config_id = ?');
$groupedVersionRead->execute([$groupedConfigId]);
expect_same('1', (string) $groupedVersionRead->fetchColumn(), 'A stale grouped save leaves the configuration version unchanged');

// Saving a revised grouped configuration preserves the last computed grade.
// This also confirms that a complete result is applied only by the explicit
// compute route below.
$pdo->prepare(
    'UPDATE enrollments
        SET final_percentage = 61.23, final_gwa = 3.40,
            grade_components_json = ?::jsonb, updated_at = CURRENT_TIMESTAMP(6)
      WHERE enrollment_id = ?'
)->execute(['{"calculationMode":"grouped-saved-grade-sentinel","percentage":61.23}', $groupedStudentA['enrollmentId']]);
$groupedSavedGradeBefore = $groupedReadGrade($groupedStudentA['enrollmentId']);
$groupedUpdatePayload = $groupedPayload($groupedOffering, $groupedIds);
$groupedUpdatePayload['version'] = $groupedConfigVersion;
[$groupedUpdateStatus, $groupedUpdateBody] = integration_http_put_json(
    '/api/faculty/grading-config',
    $facultyAccessToken,
    $groupedUpdatePayload
);
expect_same(200, $groupedUpdateStatus, 'An authorized Faculty can save the current grouped version');
$groupedConfigVersion = (int) ($groupedUpdateBody['configuration']['version'] ?? 0);
expect_same(2, $groupedConfigVersion, 'A successful grouped save advances its version exactly once');
expect_same($groupedSavedGradeBefore, $groupedReadGrade($groupedStudentA['enrollmentId']), 'Grouped configuration save preserves the previously saved grade JSON and scalar values');

[$groupedComputeStatus, $groupedComputeBody] = integration_http_json('/api/faculty/grades/compute', $facultyAccessToken, [
    'classId' => (string) $groupedOffering['classId'],
]);
expect_same(200, $groupedComputeStatus, 'Authorized grouped recomputation accepts the complete and incomplete Student rows');
$groupedCompleteResult = integration_find_enrollment_result($groupedComputeBody, $groupedStudentA['enrollmentId']);
expect_same('computed', $groupedCompleteResult['status'] ?? null, 'A complete grouped Student receives a computed result');
expect_same(84.0, (float) ($groupedCompleteResult['periods']['midterm']['percentage'] ?? -1), 'Grouped Midterm computes to 84 from transmuted Lecture and Laboratory results');
expect_same(86.0, (float) ($groupedCompleteResult['periods']['final']['percentage'] ?? -1), 'Grouped Finals compute independently to 86');
expect_same(80.0, (float) ($groupedCompleteResult['periods']['midterm']['components']['lecture']['percentage'] ?? -1), 'Faculty computation exposes the transmuted Lecture result');
expect_same(90.0, (float) ($groupedCompleteResult['periods']['midterm']['components']['laboratory']['percentage'] ?? -1), 'Faculty computation exposes the separate Laboratory result');
expect_same(85.4, (float) ($groupedCompleteResult['percentage'] ?? -1), 'The approved grouped example recomputes to 85.4');
$groupedMidtermLectureCategories = $groupedCompleteResult['periods']['midterm']['components']['lecture']['categories'] ?? [];
$groupedTransmutedQuiz = array_values(array_filter(
    $groupedMidtermLectureCategories,
    static fn(array $category): bool => (string) ($category['categoryId'] ?? '') === (string) $groupedIds['Midterm']['Lecture']['Quiz']
));
expect_same(75.0, (float) ($groupedTransmutedQuiz[0]['earnedPoints'] ?? -1), 'GRD-001 transmutation remains active inside the Lecture component');
$groupedZeroResult = integration_find_enrollment_result($groupedComputeBody, $groupedStudentB['enrollmentId']);
expect_same('computed', $groupedZeroResult['status'] ?? null, 'A Student with recorded zero scores remains computable');
expect_same(0.0, (float) ($groupedZeroResult['periods']['midterm']['components']['laboratory']['percentage'] ?? -1), 'A real zero remains an explicit Laboratory component result');
$groupedMissingResult = integration_find_enrollment_result($groupedComputeBody, $groupedStudentC['enrollmentId']);
expect_same('incomplete_period', $groupedMissingResult['status'] ?? null, 'An absent score keeps its dependent grouped period incomplete');
expect_same('incomplete', $groupedMissingResult['periods']['final']['components']['laboratory']['status'] ?? null, 'A missing score marks only its own positively weighted component incomplete');
expect_same('missing_assessment_score', $groupedMissingResult['periods']['final']['components']['laboratory']['incomplete'][0]['reason'] ?? null, 'Grouped incomplete results name the missing assessment score');
$groupedPersistedA = $groupedReadGrade($groupedStudentA['enrollmentId']);
expect_same('85.40', (string) ($groupedPersistedA['final_percentage'] ?? ''), 'Explicit grouped recomputation persists the 85.40 overall result');

// Grouped retention and informational risk reads must use the same current
// assessment snapshot when read directly or through the batch cache.
$groupedRiskRows = [
    ['enrollment_id' => $groupedStudentA['enrollmentId'], 'student_id' => $groupedStudentA['studentId'], 'cs_id' => $groupedOffering['classId']],
    ['enrollment_id' => $groupedStudentB['enrollmentId'], 'student_id' => $groupedStudentB['studentId'], 'cs_id' => $groupedOffering['classId']],
    ['enrollment_id' => $groupedStudentC['enrollmentId'], 'student_id' => $groupedStudentC['studentId'], 'cs_id' => $groupedOffering['classId']],
];
$groupedRiskCache = [];
faculty_retention_preload($pdo, $groupedRiskRows, $groupedRiskCache);
foreach ($groupedRiskRows as $groupedRiskRow) {
    expect_same(
        faculty_risk_projection($pdo, $groupedRiskRow),
        faculty_risk_projection($pdo, $groupedRiskRow, $groupedRiskCache),
        'Grouped risk projection is unchanged by cached inputs for enrollment ' . $groupedRiskRow['enrollment_id']
    );
}
$groupedWatchlist = faculty_watchlist_midterm($pdo, $groupedRiskRows[0], $groupedRiskCache);
expect_same(true, $groupedWatchlist['complete'] ?? null, 'Grouped watchlist recognizes complete Midterm inputs');
expect_same(84.0, (float) ($groupedWatchlist['percentage'] ?? -1), 'Grouped watchlist uses the same 60/40 Midterm result');
expect_same(80.0, (float) ($groupedWatchlist['components']['lecture']['percentage'] ?? -1), 'Grouped watchlist keeps Lecture separate');
expect_same(90.0, (float) ($groupedWatchlist['components']['laboratory']['percentage'] ?? -1), 'Grouped watchlist keeps Laboratory separate');
$groupedRiskConfiguration = faculty_retention_read_config($pdo, $groupedOffering['classId'], $groupedRiskCache);
$groupedRiskMidterm = faculty_risk_period_inputs($pdo, $groupedRiskRows[0], $groupedRiskConfiguration, 'Midterm', $groupedRiskCache);
expect_same(
    84.0,
    round(faculty_risk_period_percentage($groupedRiskMidterm[0], array_sum($groupedRiskMidterm[1]) / count($groupedRiskMidterm[1]), 0) ?? -1, 2),
    'Grouped risk applies saved component contributions to the complete Midterm category data'
);

// Past-year grouped configuration writes remain server-blocked.
$groupedYearParts = explode('-', $groupedCurrentYear);
$groupedPastYear = ((int) ($groupedYearParts[0] ?? 0) - 1) . '-' . ((int) ($groupedYearParts[1] ?? 0) - 1);
$groupedHistoricalSection = $pdo->prepare(
    "INSERT INTO class_sections (cs_name, course_id, instructor_user_id, semester, school_year, status)
     VALUES (?, ?, ?, '1ST', ?, 'Active')
     RETURNING cs_id"
);
$groupedHistoricalSection->execute([
    $groupedOffering['sectionName'] . ' Historical',
    $groupedOffering['courseId'],
    $groupedOwnerId,
    $groupedPastYear,
]);
$groupedHistoricalClassId = (int) $groupedHistoricalSection->fetchColumn();
$groupedHistoricalOffering = $groupedOffering;
$groupedHistoricalOffering['schoolYear'] = $groupedPastYear;
[$groupedHistoricalSaveStatus] = integration_http_put_json(
    '/api/faculty/grading-config',
    $facultyAccessToken,
    $groupedPayload($groupedHistoricalOffering)
);
expect_same(409, $groupedHistoricalSaveStatus, 'Lecture/Laboratory weights cannot be saved for a historical offering');
expect_same(0, (int) $pdo->query(
    'SELECT COUNT(*) FROM grading_configs WHERE course_id = ' . (int) $groupedOffering['courseId']
        . ' AND school_year = ' . $pdo->quote(strtoupper($groupedPastYear))
)->fetchColumn(), 'Rejected historical grouped save creates no configuration');

// A separate legacy overall offering proves explicit conversion preserves the
// category and assessment IDs, raw scores and saved grade until recomputation.
$conversionOffering = $groupedCreateOffering('CONVERT');
$conversionStudent = $groupedCreateStudent('Convert', $conversionOffering['classId']);
[$conversionOverallStatus, $conversionOverallBody] = integration_http_put_json('/api/faculty/grading-config', $facultyAccessToken, [
    'courseId' => $conversionOffering['courseId'],
    'semester' => '1st',
    'schoolYear' => $conversionOffering['schoolYear'],
    'categories' => [
        ['name' => 'Quiz', 'weight' => 60, 'sortOrder' => 1],
        ['name' => 'Exam', 'weight' => 40, 'sortOrder' => 2],
    ],
]);
expect_same(201, $conversionOverallStatus, 'Conversion fixture starts in the existing overall schema');
$conversionOverallConfig = $conversionOverallBody['configuration'] ?? [];
$conversionConfigId = (int) ($conversionOverallConfig['id'] ?? 0);
$conversionVersion = (int) ($conversionOverallConfig['version'] ?? 0);
$conversionCategoriesByName = [];
foreach (($conversionOverallConfig['categories'] ?? []) as $category) {
    $conversionCategoriesByName[(string) ($category['name'] ?? '')] = (int) ($category['id'] ?? 0);
}
$conversionQuizId = $conversionCategoriesByName['Quiz'] ?? 0;
$conversionExamId = $conversionCategoriesByName['Exam'] ?? 0;
expect_true($conversionConfigId > 0 && $conversionQuizId > 0 && $conversionExamId > 0, 'Overall conversion fixture has stable category IDs');
$conversionAssessments = [
    'midtermQuiz' => $groupedInsertAssessment($conversionOffering['classId'], $conversionQuizId, 'Legacy Midterm Quiz', 'Midterm'),
    'midtermExam' => $groupedInsertAssessment($conversionOffering['classId'], $conversionExamId, 'Legacy Midterm Exam', 'Midterm'),
    'finalQuiz' => $groupedInsertAssessment($conversionOffering['classId'], $conversionQuizId, 'Legacy Final Quiz', 'Final'),
    'finalExam' => $groupedInsertAssessment($conversionOffering['classId'], $conversionExamId, 'Legacy Final Exam', 'Final'),
];
// Overall-mode assessments may not have a stored period yet. Their explicit
// grouped mappings below establish the period and component while reusing IDs.
foreach ($conversionAssessments as $assessmentId) {
    $pdo->prepare('UPDATE assessments SET grading_period = NULL WHERE assessment_id = ?')->execute([$assessmentId]);
}
foreach ([
    'midtermQuiz' => 80,
    'midtermExam' => 90,
    'finalQuiz' => 90,
    'finalExam' => 80,
] as $assessmentKey => $score) {
    $groupedInsertScore($conversionAssessments[$assessmentKey], $conversionStudent['studentId'], (float) $score);
}
[$conversionInitialComputeStatus, $conversionInitialComputeBody] = integration_http_json('/api/faculty/grades/compute', $facultyAccessToken, [
    'classId' => (string) $conversionOffering['classId'],
]);
expect_same(200, $conversionInitialComputeStatus, 'Legacy overall fixture computes before conversion');
$conversionInitialResult = integration_find_enrollment_result($conversionInitialComputeBody, $conversionStudent['enrollmentId']);
expect_same(85.0, (float) ($conversionInitialResult['percentage'] ?? -1), 'Legacy overall scores have a saved 85.00 result before conversion');
$conversionSavedGrade = $groupedReadGrade($conversionStudent['enrollmentId']);
$conversionAssessmentIds = array_values($conversionAssessments);
// Simulate three legacy assessments whose category and period have both been
// lost, while retaining one valid category link whose period is missing. Their
// scores and last saved grade remain until Faculty explicitly chooses periods.
foreach ($conversionAssessmentIds as $conversionAssessmentId) {
    if ($conversionAssessmentId === $conversionAssessments['midtermQuiz']) {
        continue;
    }
    $pdo->prepare('UPDATE assessments SET grading_category_id = NULL, grading_period = NULL WHERE assessment_id = ?')
        ->execute([$conversionAssessmentId]);
}
$conversionScoreSnapshot = $groupedReadAssessmentSnapshot($conversionAssessmentIds);
$conversionAssessmentValueSnapshot = $groupedAssessmentValues($conversionScoreSnapshot);

$conversionGroupedPayload = [
    'courseId' => $conversionOffering['courseId'],
    'semester' => '1st',
    'schoolYear' => $conversionOffering['schoolYear'],
    'schemaMode' => 'periods',
    'componentMode' => 'lecture_laboratory',
    'componentWeights' => ['lecture' => 60, 'laboratory' => 40],
    'termRatio' => ['midterm' => 30, 'final' => 70],
    'midtermCategories' => [
        ['id' => $conversionQuizId, 'name' => 'Quiz', 'weight' => 100, 'sortOrder' => 1, 'component' => 'Lecture'],
        ['id' => $conversionExamId, 'name' => 'Exam', 'weight' => 100, 'sortOrder' => 2, 'component' => 'Laboratory'],
    ],
    'finalCategories' => [
        ['id' => $conversionQuizId, 'name' => 'Quiz', 'weight' => 100, 'sortOrder' => 1, 'component' => 'Lecture'],
        ['id' => $conversionExamId, 'name' => 'Exam', 'weight' => 100, 'sortOrder' => 2, 'component' => 'Laboratory'],
    ],
    'attendanceDateRanges' => $groupedAttendanceRanges,
    'version' => $conversionVersion,
    'convertFromOverall' => true,
    'convertToLectureLaboratory' => true,
];
$conversionExplicitMappings = [
    ['assessmentId' => $conversionAssessments['midtermQuiz'], 'categoryId' => $conversionQuizId, 'gradingPeriod' => 'Midterm', 'component' => 'Lecture'],
    ['assessmentId' => $conversionAssessments['midtermExam'], 'categoryId' => $conversionExamId, 'gradingPeriod' => 'Midterm', 'component' => 'Laboratory'],
    ['assessmentId' => $conversionAssessments['finalQuiz'], 'categoryId' => $conversionQuizId, 'gradingPeriod' => 'Final', 'component' => 'Lecture'],
    ['assessmentId' => $conversionAssessments['finalExam'], 'categoryId' => $conversionExamId, 'gradingPeriod' => 'Final', 'component' => 'Laboratory'],
];
$conversionChangedLinkedCategoryPayload = $conversionGroupedPayload;
$conversionChangedLinkedCategoryPayload['assessmentAssignments'] = $conversionExplicitMappings;
$conversionChangedLinkedCategoryPayload['assessmentAssignments'][0]['categoryId'] = $conversionExamId;
[$conversionChangedLinkedCategoryStatus, $conversionChangedLinkedCategoryBody] = integration_http_put_json(
    '/api/faculty/grading-config',
    $facultyAccessToken,
    $conversionChangedLinkedCategoryPayload
);
expect_same(422, $conversionChangedLinkedCategoryStatus, 'An explicit period mapping cannot replace a linked overall category ID');
expect_same('GRADING_ASSESSMENT_ASSIGNMENT_INVALID', $conversionChangedLinkedCategoryBody['code'] ?? null, 'Changing a linked assessment category ID returns the assignment validation error');
expect_same($conversionScoreSnapshot, $groupedReadAssessmentSnapshot($conversionAssessmentIds), 'A rejected linked-category change preserves all legacy links and raw scores');
$conversionMissingMappingPayload = $conversionGroupedPayload;
$conversionMissingMappingPayload['assessmentAssignments'] = [];
[$conversionMissingMappingStatus, $conversionMissingMappingBody] = integration_http_put_json(
    '/api/faculty/grading-config',
    $facultyAccessToken,
    $conversionMissingMappingPayload
);
expect_same(422, $conversionMissingMappingStatus, 'NULL-period legacy assessments require explicit grouped mappings');
expect_same('GRADING_COMPONENT_MAPPING_REQUIRED', $conversionMissingMappingBody['code'] ?? null, 'Ambiguous grouped conversion returns the mapping-required error');
$conversionNoPeriodFlagPayload = $conversionGroupedPayload;
unset($conversionNoPeriodFlagPayload['convertFromOverall']);
$conversionNoPeriodFlagPayload['assessmentAssignments'] = $conversionExplicitMappings;
[$conversionNoPeriodFlagStatus, $conversionNoPeriodFlagBody] = integration_http_put_json(
    '/api/faculty/grading-config',
    $facultyAccessToken,
    $conversionNoPeriodFlagPayload
);
expect_same(409, $conversionNoPeriodFlagStatus, 'Overall-to-period conversion requires its existing explicit conversion flag');
expect_same('GRADING_PERIOD_CONVERSION_REQUIRED', $conversionNoPeriodFlagBody['code'] ?? null, 'Missing overall-to-period confirmation returns the existing conversion error');
$conversionNoFlagPayload = $conversionGroupedPayload;
unset($conversionNoFlagPayload['convertToLectureLaboratory']);
$conversionNoFlagPayload['assessmentAssignments'] = $conversionExplicitMappings;
[$conversionNoFlagStatus, $conversionNoFlagBody] = integration_http_put_json(
    '/api/faculty/grading-config',
    $facultyAccessToken,
    $conversionNoFlagPayload
);
expect_same(409, $conversionNoFlagStatus, 'Combined-to-grouped conversion requires its explicit conversion flag');
expect_same('GRADING_COMPONENT_CONVERSION_REQUIRED', $conversionNoFlagBody['code'] ?? null, 'Missing grouped conversion flag returns the explicit conversion error');
expect_same($conversionScoreSnapshot, $groupedReadAssessmentSnapshot($conversionAssessmentIds), 'Rejected conversion attempts preserve unlinked references, NULL periods and raw scores');
expect_same($conversionSavedGrade, $groupedReadGrade($conversionStudent['enrollmentId']), 'Rejected conversion attempts preserve saved grade values');

[$conversionGroupedStatus, $conversionGroupedBody] = integration_http_put_json(
    '/api/faculty/grading-config',
    $facultyAccessToken,
    array_merge($conversionGroupedPayload, ['assessmentAssignments' => $conversionExplicitMappings])
);
expect_same(200, $conversionGroupedStatus, 'Explicit grouped conversion maps unlinked assessments and preserves an existing category link');
$conversionGroupedConfiguration = $conversionGroupedBody['configuration'] ?? [];
$conversionVersion = (int) ($conversionGroupedConfiguration['version'] ?? 0);
expect_same(2, $conversionVersion, 'Successful grouped conversion advances the existing configuration version');
expect_same('lecture_laboratory', $conversionGroupedConfiguration['componentMode'] ?? null, 'Converted configuration stores Lecture/Laboratory mode');
$convertedCategoryRows = $groupedMembershipRows($conversionConfigId);
$convertedCategoryIds = array_values(array_unique(array_map(static fn(array $row): int => (int) $row['category_id'], $convertedCategoryRows)));
sort($convertedCategoryIds);
expect_same([$conversionQuizId, $conversionExamId], $convertedCategoryIds, 'Grouped conversion preserves both legacy category IDs');
$convertedAssessmentSnapshot = $groupedReadAssessmentSnapshot($conversionAssessmentIds);
$convertedAssessmentValues = $groupedAssessmentValues($convertedAssessmentSnapshot);
expect_same(
    array_map(static fn(array $row): array => ['assessment_id' => $row['assessment_id'], 'score' => $row['score']], $conversionAssessmentValueSnapshot),
    array_map(static fn(array $row): array => ['assessment_id' => $row['assessment_id'], 'score' => $row['score']], $convertedAssessmentValues),
    'Explicit grouped mapping preserves assessment IDs and raw scores'
);
$convertedAssessmentCategories = [];
foreach ($convertedAssessmentSnapshot as $row) {
    $convertedAssessmentCategories[(int) $row['assessment_id']] = [
        'categoryId' => $row['grading_category_id'] === null ? null : (int) $row['grading_category_id'],
        'gradingPeriod' => $row['grading_period'],
    ];
}
expect_same([
    $conversionAssessments['midtermQuiz'] => ['categoryId' => $conversionQuizId, 'gradingPeriod' => 'Midterm'],
    $conversionAssessments['midtermExam'] => ['categoryId' => $conversionExamId, 'gradingPeriod' => 'Midterm'],
    $conversionAssessments['finalQuiz'] => ['categoryId' => $conversionQuizId, 'gradingPeriod' => 'Final'],
    $conversionAssessments['finalExam'] => ['categoryId' => $conversionExamId, 'gradingPeriod' => 'Final'],
], $convertedAssessmentCategories, 'Explicit component and period mappings link each legacy assessment to its preserved category ID');
$convertedAssessmentValueSnapshot = $convertedAssessmentValues;
$convertedAssessmentPeriods = [];
foreach ($convertedAssessmentSnapshot as $row) {
    $convertedAssessmentPeriods[(int) $row['assessment_id']] = (string) $row['grading_period'];
}
expect_same([
    $conversionAssessments['midtermQuiz'] => 'Midterm',
    $conversionAssessments['midtermExam'] => 'Midterm',
    $conversionAssessments['finalQuiz'] => 'Final',
    $conversionAssessments['finalExam'] => 'Final',
], $convertedAssessmentPeriods, 'Explicit mappings assign each previously NULL legacy assessment to the selected period');
expect_same($conversionSavedGrade, $groupedReadGrade($conversionStudent['enrollmentId']), 'Saving grouped conversion leaves the previously recorded overall grade untouched');

// The approved contract rejects every combined period save, including a
// previously grouped offering. Rejections must preserve the saved grouped
// structure, mapped assessments, scores and last computed grade.
$conversionCombinedPayload = [
    'courseId' => $conversionOffering['courseId'],
    'semester' => '1st',
    'schoolYear' => $conversionOffering['schoolYear'],
    'schemaMode' => 'periods',
    'componentMode' => 'combined',
    'convertToCombined' => true,
    'version' => $conversionVersion,
];
$conversionGroupedMembershipsBeforeReject = $groupedMembershipRows($conversionConfigId);
$conversionGroupedAssessmentsBeforeReject = $groupedReadAssessmentSnapshot($conversionAssessmentIds);
[$conversionCombinedStatus, $conversionCombinedBody] = integration_http_put_json(
    '/api/faculty/grading-config',
    $facultyAccessToken,
    $conversionCombinedPayload
);
expect_same(422, $conversionCombinedStatus, 'A grouped-to-combined save is rejected even with an explicit conversion flag');
expect_same('GRADING_COMPONENT_MODE_REQUIRED', $conversionCombinedBody['code'] ?? null, 'Combined period saves return the mandatory component-mode error');
expect_same('Period grading requires the separate Lecture/Laboratory structure.', $conversionCombinedBody['message'] ?? null, 'Combined period rejection explains the required structure');
$conversionNoModePayload = $conversionCombinedPayload;
unset($conversionNoModePayload['componentMode'], $conversionNoModePayload['convertToCombined']);
[$conversionNoModeStatus, $conversionNoModeBody] = integration_http_put_json(
    '/api/faculty/grading-config',
    $facultyAccessToken,
    $conversionNoModePayload
);
expect_same(422, $conversionNoModeStatus, 'A period save without componentMode is rejected');
expect_same('GRADING_COMPONENT_MODE_REQUIRED', $conversionNoModeBody['code'] ?? null, 'Omitted component mode returns the mandatory component-mode error');
expect_same($conversionGroupedMembershipsBeforeReject, $groupedMembershipRows($conversionConfigId), 'Rejected combined saves preserve all grouped category memberships and weights');
expect_same($conversionGroupedAssessmentsBeforeReject, $groupedReadAssessmentSnapshot($conversionAssessmentIds), 'Rejected combined saves preserve every assessment mapping and raw score');
expect_same($conversionSavedGrade, $groupedReadGrade($conversionStudent['enrollmentId']), 'Rejected combined saves preserve the previously recorded grade');
$conversionConfigVersionStmt = $pdo->prepare('SELECT version FROM grading_configs WHERE config_id = ?');
$conversionConfigVersionStmt->execute([$conversionConfigId]);
expect_same($conversionVersion, (int) $conversionConfigVersionStmt->fetchColumn(), 'Rejected combined saves do not advance the grouped configuration version');
[$conversionRecomputeStatus, $conversionRecomputeBody] = integration_http_json('/api/faculty/grades/compute', $facultyAccessToken, [
    'classId' => (string) $conversionOffering['classId'],
]);
expect_same(200, $conversionRecomputeStatus, 'The grouped offering remains computable after rejected conversion attempts');
$conversionRecomputed = integration_find_enrollment_result($conversionRecomputeBody, $conversionStudent['enrollmentId']);
expect_same(85.4, (float) ($conversionRecomputed['percentage'] ?? -1), 'Recomputation applies the preserved grouped weights to the preserved scores');
expect_same($convertedAssessmentValueSnapshot, $groupedAssessmentValues($groupedReadAssessmentSnapshot($conversionAssessmentIds)), 'Rejected conversion attempts never change mapped category IDs or raw scores');

// One valid authoritative Attendance category keeps the grouped period
// incomplete when its range is missing. An attempted second Attendance source
// in the other component is rejected across the whole period.
$attendanceOffering = $groupedCreateOffering('ATTEND');
$attendanceStudent = $groupedCreateStudent('Attendance', $attendanceOffering['classId']);
$attendanceGroupedPayload = [
    'courseId' => $attendanceOffering['courseId'],
    'semester' => '1st',
    'schoolYear' => $attendanceOffering['schoolYear'],
    'schemaMode' => 'periods',
    'componentMode' => 'lecture_laboratory',
    'componentWeights' => ['lecture' => 60, 'laboratory' => 40],
    'termRatio' => ['midterm' => 30, 'final' => 70],
    'midtermCategories' => [
        ['name' => 'Attendance', 'weight' => 10, 'sortOrder' => 1, 'sourceKind' => 'attendance', 'component' => 'Lecture'],
        ['name' => 'Quiz', 'weight' => 90, 'sortOrder' => 2, 'component' => 'Lecture'],
        ['name' => 'Quiz', 'weight' => 100, 'sortOrder' => 3, 'component' => 'Laboratory'],
    ],
    'finalCategories' => [
        ['name' => 'Quiz', 'weight' => 100, 'sortOrder' => 1, 'component' => 'Lecture'],
        ['name' => 'Quiz', 'weight' => 100, 'sortOrder' => 2, 'component' => 'Laboratory'],
    ],
    'attendanceDateRanges' => [
        'midterm' => ['startDate' => null, 'endDate' => null],
        'final' => $groupedAttendanceRanges['final'],
    ],
];
[$attendanceConfigStatus, $attendanceConfigBody] = integration_http_put_json(
    '/api/faculty/grading-config',
    $facultyAccessToken,
    $attendanceGroupedPayload
);
expect_same(201, $attendanceConfigStatus, 'A single authoritative Attendance source may belong to one grouped component');
$attendanceConfigId = (int) ($attendanceConfigBody['configuration']['id'] ?? 0);
$attendanceConfigVersion = (int) ($attendanceConfigBody['configuration']['version'] ?? 0);
$attendanceIds = $groupedCategoryIds($groupedMembershipRows($attendanceConfigId));
$attendanceSavedPayload = $attendanceGroupedPayload;
foreach ([
    'midtermCategories' => 'Midterm',
    'finalCategories' => 'Final',
] as $attendancePeriodField => $attendancePeriodName) {
    foreach ($attendanceSavedPayload[$attendancePeriodField] as &$attendanceCategory) {
        $attendanceCategory['id'] = $attendanceIds[$attendancePeriodName][$attendanceCategory['component']][$attendanceCategory['name']];
    }
    unset($attendanceCategory);
}
$attendanceSourceRenamePayload = $attendanceSavedPayload;
$attendanceSourceRenamePayload['version'] = $attendanceConfigVersion;
$attendanceSourceRenamePayload['midtermCategories'][0]['name'] = 'Participation';
unset($attendanceSourceRenamePayload['midtermCategories'][0]['sourceKind']);
[$attendanceSourceRenameStatus, $attendanceSourceRenameBody] = integration_http_put_json(
    '/api/faculty/grading-config',
    $facultyAccessToken,
    $attendanceSourceRenamePayload
);
expect_same(200, $attendanceSourceRenameStatus, 'Renaming a saved source category without sourceKind remains valid');
$attendanceConfigVersion = (int) ($attendanceSourceRenameBody['configuration']['version'] ?? 0);
$attendanceSourceRowStmt = $pdo->prepare(
    'SELECT name, source_kind FROM grading_category_period_memberships WHERE category_id = ? AND grading_period = ?'
);
$attendanceSourceRowStmt->execute([$attendanceIds['Midterm']['Lecture']['Attendance'], 'Midterm']);
expect_same(['Participation', 'attendance'], $attendanceSourceRowStmt->fetch(PDO::FETCH_NUM), 'Omitting sourceKind during a rename preserves the saved source and category ID');
$attendanceSourceChangePayload = $attendanceSavedPayload;
$attendanceSourceChangePayload['version'] = $attendanceConfigVersion;
$attendanceSourceChangePayload['midtermCategories'][0]['sourceKind'] = 'assessment';
[$attendanceSourceChangeStatus, $attendanceSourceChangeBody] = integration_http_put_json(
    '/api/faculty/grading-config',
    $facultyAccessToken,
    $attendanceSourceChangePayload
);
expect_same(200, $attendanceSourceChangeStatus, 'Faculty can explicitly change an unused grouped category source');
$attendanceConfigVersion = (int) ($attendanceSourceChangeBody['configuration']['version'] ?? 0);
$attendanceSourceRowStmt = $pdo->prepare(
    'SELECT source_kind FROM grading_category_period_memberships WHERE category_id = ? AND grading_period = ?'
);
$attendanceSourceRowStmt->execute([$attendanceIds['Midterm']['Lecture']['Attendance'], 'Midterm']);
expect_same('assessment', $attendanceSourceRowStmt->fetchColumn(), 'An explicit unused source change persists in the canonical membership');
$attendanceSourceAuditStmt = $pdo->prepare(
    "SELECT before_state_json, after_state_json
       FROM audit_events
      WHERE module_code = 'faculty_grading'
        AND action_code = 'grading_config_update'
        AND target_id = ?
      ORDER BY sequence_number DESC
      LIMIT 1"
);
$attendanceSourceAuditStmt->execute([(string) $attendanceConfigId]);
$attendanceSourceAudit = $attendanceSourceAuditStmt->fetch(PDO::FETCH_ASSOC) ?: [];
$attendanceSourceAuditBefore = json_decode((string) ($attendanceSourceAudit['before_state_json'] ?? ''), true);
$attendanceSourceAuditAfter = json_decode((string) ($attendanceSourceAudit['after_state_json'] ?? ''), true);
$attendanceSourceAuditValue = static function (?array $state, int $categoryId): ?string {
    foreach (($state['categories'] ?? []) as $category) {
        if ((int) ($category['id'] ?? 0) === $categoryId && ($category['gradingPeriod'] ?? null) === 'Midterm') {
            return $category['sourceKind'] ?? null;
        }
    }
    return null;
};
expect_same('attendance', $attendanceSourceAuditValue($attendanceSourceAuditBefore, $attendanceIds['Midterm']['Lecture']['Attendance']), 'The source-change audit retains its previous category source');
expect_same('assessment', $attendanceSourceAuditValue($attendanceSourceAuditAfter, $attendanceIds['Midterm']['Lecture']['Attendance']), 'The source-change audit records the explicitly saved category source');
$attendanceRestoreSourcePayload = $attendanceSavedPayload;
$attendanceRestoreSourcePayload['version'] = $attendanceConfigVersion;
[$attendanceRestoreSourceStatus, $attendanceRestoreSourceBody] = integration_http_put_json(
    '/api/faculty/grading-config',
    $facultyAccessToken,
    $attendanceRestoreSourcePayload
);
expect_same(200, $attendanceRestoreSourceStatus, 'Faculty can explicitly restore an unused grouped Attendance source');
$attendanceConfigVersion = (int) ($attendanceRestoreSourceBody['configuration']['version'] ?? 0);
$attendanceAssessmentIds = [
    $groupedInsertAssessment($attendanceOffering['classId'], $attendanceIds['Midterm']['Lecture']['Quiz'], 'Attendance Fixture Midterm Lecture Quiz', 'Midterm'),
    $groupedInsertAssessment($attendanceOffering['classId'], $attendanceIds['Midterm']['Laboratory']['Quiz'], 'Attendance Fixture Midterm Laboratory Quiz', 'Midterm'),
    $groupedInsertAssessment($attendanceOffering['classId'], $attendanceIds['Final']['Lecture']['Quiz'], 'Attendance Fixture Final Lecture Quiz', 'Final'),
    $groupedInsertAssessment($attendanceOffering['classId'], $attendanceIds['Final']['Laboratory']['Quiz'], 'Attendance Fixture Final Laboratory Quiz', 'Final'),
];
foreach ($attendanceAssessmentIds as $attendanceAssessmentId) {
    $groupedInsertScore($attendanceAssessmentId, $attendanceStudent['studentId'], 100);
}
$attendanceUsedSourcePayload = $attendanceSavedPayload;
$attendanceUsedSourcePayload['version'] = $attendanceConfigVersion;
$attendanceUsedSourcePayload['finalCategories'][0]['sourceKind'] = 'attendance';
[$attendanceUsedSourceStatus, $attendanceUsedSourceBody] = integration_http_put_json(
    '/api/faculty/grading-config',
    $facultyAccessToken,
    $attendanceUsedSourcePayload
);
expect_same(422, $attendanceUsedSourceStatus, 'A linked assessment category cannot be changed to the Attendance source');
expect_same('GRADING_ATTENDANCE_CATEGORY_ASSESSMENT_INVALID', $attendanceUsedSourceBody['code'] ?? null, 'The existing Attendance-to-assessment association validation remains active');
[$attendanceComputeStatus, $attendanceComputeBody] = integration_http_json('/api/faculty/grades/compute', $facultyAccessToken, [
    'classId' => (string) $attendanceOffering['classId'],
]);
expect_same(200, $attendanceComputeStatus, 'Grouped computation returns a structured incomplete result for missing Attendance dates');
$attendanceResult = integration_find_enrollment_result($attendanceComputeBody, $attendanceStudent['enrollmentId']);
expect_same('incomplete_period', $attendanceResult['status'] ?? null, 'Missing authoritative Attendance range blocks the dependent positive-weight period');
expect_same('missing_date_range', $attendanceResult['periods']['midterm']['components']['lecture']['incomplete'][0]['reason'] ?? null, 'Grouped Attendance completeness identifies the missing inclusive range');
$attendanceInvalidDuplicate = $attendanceSavedPayload;
$attendanceInvalidDuplicate['version'] = $attendanceConfigVersion;
$attendanceInvalidDuplicate['midtermCategories'] = [
    ['id' => $attendanceIds['Midterm']['Lecture']['Attendance'], 'name' => 'Attendance', 'weight' => 10, 'sortOrder' => 1, 'sourceKind' => 'attendance', 'component' => 'Lecture'],
    ['id' => $attendanceIds['Midterm']['Lecture']['Quiz'], 'name' => 'Quiz', 'weight' => 90, 'sortOrder' => 2, 'component' => 'Lecture'],
    ['id' => $attendanceIds['Midterm']['Laboratory']['Quiz'], 'name' => 'Attendance', 'weight' => 100, 'sortOrder' => 3, 'sourceKind' => 'attendance', 'component' => 'Laboratory'],
];
[$attendanceDuplicateStatus, $attendanceDuplicateBody] = integration_http_put_json(
    '/api/faculty/grading-config',
    $facultyAccessToken,
    $attendanceInvalidDuplicate
);
expect_same(422, $attendanceDuplicateStatus, 'A period cannot save Attendance sources in both Lecture and Laboratory');
expect_same('GRADING_ATTENDANCE_CATEGORY_DUPLICATE', $attendanceDuplicateBody['code'] ?? null, 'Cross-component Attendance duplication returns its stable validation error');
$attendanceVersionRead = $pdo->prepare('SELECT version FROM grading_configs WHERE config_id = ?');
$attendanceVersionRead->execute([$attendanceConfigId]);
expect_same((string) $attendanceConfigVersion, (string) $attendanceVersionRead->fetchColumn(), 'Rejected duplicate Attendance save leaves its configuration version unchanged');

// The bootstrap CLI may auto-link a unique exact-name grouped category, but
// must leave a repeated Lecture/Laboratory name unresolved for Faculty review.
$bootstrapOffering = $groupedCreateOffering('BOOTSTRAP');
$bootstrapStudent = $groupedCreateStudent('Bootstrap', $bootstrapOffering['classId']);
[$bootstrapConfigStatus, $bootstrapConfigBody] = integration_http_put_json(
    '/api/faculty/grading-config',
    $facultyAccessToken,
    $groupedPayload($bootstrapOffering)
);
expect_same(201, $bootstrapConfigStatus, 'Bootstrap fixture starts with a saved grouped configuration');
$bootstrapConfigId = (int) ($bootstrapConfigBody['configuration']['id'] ?? 0);
$bootstrapCategoryIds = $groupedCategoryIds($groupedMembershipRows($bootstrapConfigId));
$bootstrapQuizAssessmentId = $groupedInsertUnlinkedAssessment(
    $bootstrapOffering['classId'], 'Bootstrap ambiguous Quiz', 'Quiz', 'Midterm'
);
$bootstrapExamAssessmentId = $groupedInsertUnlinkedAssessment(
    $bootstrapOffering['classId'], 'Bootstrap unique Exam', 'Exam', 'Midterm'
);
$groupedInsertScore($bootstrapQuizAssessmentId, $bootstrapStudent['studentId'], 31);
$groupedInsertScore($bootstrapExamAssessmentId, $bootstrapStudent['studentId'], 47);
$bootstrapAssessmentIds = [$bootstrapQuizAssessmentId, $bootstrapExamAssessmentId];
$bootstrapScoresBefore = array_map(
    static fn(array $row): array => ['assessment_id' => (int) $row['assessment_id'], 'score' => (string) $row['score']],
    $groupedReadAssessmentSnapshot($bootstrapAssessmentIds)
);
$priorUnresolvedBootstrapStmt = $pdo->query(
    "SELECT cs.instructor_user_id, cs.semester, cs.school_year, c.course_code, ua.display_name
       FROM class_sections cs
       JOIN courses c ON c.course_id = cs.course_id
       JOIN user_accounts ua ON ua.user_id = cs.instructor_user_id
      WHERE cs.status = 'Active'
        AND NOT EXISTS (
            SELECT 1 FROM grading_configs gc
             WHERE gc.faculty_user_id = cs.instructor_user_id
               AND gc.course_id = cs.course_id
               AND gc.semester = UPPER(cs.semester)
               AND gc.school_year = UPPER(cs.school_year)
        )
      GROUP BY cs.instructor_user_id, cs.semester, cs.school_year, c.course_code, ua.display_name
      ORDER BY cs.school_year, cs.semester, c.course_code, cs.instructor_user_id"
);
$priorUnconfiguredBootstrapLabels = array_map(
    static fn(array $offering): string => sprintf(
        '%s %s %s (%s)',
        $offering['course_code'],
        $offering['semester'],
        $offering['school_year'],
        $offering['display_name']
    ),
    $priorUnresolvedBootstrapStmt->fetchAll(PDO::FETCH_ASSOC)
);
$knownUnresolvedBootstrapStmt = $pdo->query(
    "SELECT c.course_code
       FROM courses c
       JOIN class_sections cs ON cs.course_id = c.course_id
      WHERE c.name = 'Bootstrap Ambiguous Course'
        AND cs.status = 'Active'
        AND NOT EXISTS (
            SELECT 1 FROM grading_configs gc
             WHERE gc.faculty_user_id = cs.instructor_user_id
               AND gc.course_id = cs.course_id
               AND gc.semester = UPPER(cs.semester)
               AND gc.school_year = UPPER(cs.school_year)
        )
      ORDER BY cs.cs_id DESC LIMIT 1"
);
$knownUnresolvedBootstrapCourseCode = $knownUnresolvedBootstrapStmt->fetchColumn();
expect_true($priorUnconfiguredBootstrapLabels !== [], 'Earlier integration runs leave active unconfigured offerings for bootstrap reconciliation');
expect_true(is_string($knownUnresolvedBootstrapCourseCode) && $knownUnresolvedBootstrapCourseCode !== '', 'The preceding PostgreSQL integration fixture leaves its known ambiguous offering available for bootstrap reconciliation');
expect_true(
    count(array_filter($priorUnconfiguredBootstrapLabels, static fn(string $label): bool => str_starts_with($label, $knownUnresolvedBootstrapCourseCode . ' '))) === 1,
    'The known ambiguous offering is part of the prior unresolved set'
);
$bootstrapCommand = escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg(__DIR__ . '/../../backend/bin/bootstrap-grade-weights.php');
$bootstrapOutput = [];
exec($bootstrapCommand . ' 2>&1', $bootstrapOutput, $bootstrapExit);
$bootstrapOutputText = implode("\n", $bootstrapOutput);
expect_same(1, $bootstrapExit, 'Global bootstrap reports the known unresolved offering while processing grouped links');
expect_true(str_contains($bootstrapOutputText, (string) $knownUnresolvedBootstrapCourseCode), 'Global bootstrap identifies the preceding ambiguous offering');
$bootstrapFailureLines = array_values(array_filter(
    $bootstrapOutput,
    static fn(string $line): bool => str_starts_with($line, 'FAILED:')
));
expect_true($bootstrapFailureLines !== [], 'Global bootstrap reports at least one unresolved offering');
$bootstrapFailureLabels = [];
foreach ($bootstrapFailureLines as $bootstrapFailureLine) {
    $failureSeparator = strpos($bootstrapFailureLine, ': ', strlen('FAILED: '));
    expect_true($failureSeparator !== false, 'Global bootstrap failure contains an offering label: ' . $bootstrapFailureLine);
    $bootstrapFailureLabel = substr($bootstrapFailureLine, strlen('FAILED: '), $failureSeparator - strlen('FAILED: '));
    $bootstrapFailureLabels[] = $bootstrapFailureLabel;
    expect_true(
        in_array($bootstrapFailureLabel, $priorUnconfiguredBootstrapLabels, true),
        'Global bootstrap does not introduce a failure for a new offering: ' . $bootstrapFailureLabel
    );
    expect_true(
        str_contains($bootstrapFailureLine, 'Supply an explicit assessment, period, and component mapping'),
        'Every global bootstrap failure is an actionable assessment mapping error: ' . $bootstrapFailureLine
    );
}
expect_true(
    count(array_filter($bootstrapFailureLabels, static fn(string $label): bool => str_starts_with($label, $knownUnresolvedBootstrapCourseCode . ' '))) === 1,
    'Global bootstrap reports the preceding ambiguous offering as an actionable failure'
);
expect_true(str_contains($bootstrapOutputText, 'Bootstrap ambiguous Quiz'), 'Global bootstrap reports the grouped fixture Quiz that needs a component choice');
$bootstrapAssessmentSnapshot = $groupedReadAssessmentSnapshot($bootstrapAssessmentIds);
$bootstrapAssessmentCategoryIds = [];
foreach ($bootstrapAssessmentSnapshot as $row) {
    $bootstrapAssessmentCategoryIds[(int) $row['assessment_id']] = $row['grading_category_id'] === null
        ? null
        : (int) $row['grading_category_id'];
}
expect_same([
    $bootstrapQuizAssessmentId => null,
    $bootstrapExamAssessmentId => $bootstrapCategoryIds['Midterm']['Lecture']['Exam'],
], $bootstrapAssessmentCategoryIds, 'Grouped bootstrap leaves ambiguous Quiz unlinked and maps the unique Exam by exact name');
expect_same($bootstrapScoresBefore, array_map(
    static fn(array $row): array => ['assessment_id' => (int) $row['assessment_id'], 'score' => (string) $row['score']],
    $bootstrapAssessmentSnapshot
), 'Grouped bootstrap linking preserves saved assessment scores');

// Retire the dynamically-created fixtures after the passing assertions. Any
// audited class remains archived so immutable audit scope remains valid.
$pdo->beginTransaction();
$allGroupedAssessmentIds = array_merge(array_values($groupedAssessments), $conversionAssessmentIds, $attendanceAssessmentIds, $bootstrapAssessmentIds);
$allGroupedAssessmentIds = array_values(array_unique(array_map('intval', $allGroupedAssessmentIds)));
$groupedAssessmentPlaceholders = implode(',', array_fill(0, count($allGroupedAssessmentIds), '?'));
$pdo->prepare("DELETE FROM assessment_scores WHERE assessment_id IN ({$groupedAssessmentPlaceholders})")->execute($allGroupedAssessmentIds);
$pdo->prepare("DELETE FROM assessments WHERE assessment_id IN ({$groupedAssessmentPlaceholders})")->execute($allGroupedAssessmentIds);
$allGroupedEnrollmentIds = [
    $groupedStudentA['enrollmentId'], $groupedStudentB['enrollmentId'], $groupedStudentC['enrollmentId'],
    $conversionStudent['enrollmentId'], $attendanceStudent['enrollmentId'], $bootstrapStudent['enrollmentId'],
];
$enrollmentPlaceholders = implode(',', array_fill(0, count($allGroupedEnrollmentIds), '?'));
$pdo->prepare("DELETE FROM attendance_record_corrections WHERE record_id IN (SELECT record_id FROM attendance_records WHERE enrollment_id IN ({$enrollmentPlaceholders}))")
    ->execute($allGroupedEnrollmentIds);
$pdo->prepare("DELETE FROM attendance_records WHERE enrollment_id IN ({$enrollmentPlaceholders})")->execute($allGroupedEnrollmentIds);
$pdo->prepare("DELETE FROM enrollments WHERE enrollment_id IN ({$enrollmentPlaceholders})")->execute($allGroupedEnrollmentIds);
$allGroupedStudentIds = [
    $groupedStudentA['studentId'], $groupedStudentB['studentId'], $groupedStudentC['studentId'],
    $conversionStudent['studentId'], $attendanceStudent['studentId'], $bootstrapStudent['studentId'],
];
$studentPlaceholders = implode(',', array_fill(0, count($allGroupedStudentIds), '?'));
$pdo->prepare("DELETE FROM students WHERE student_id IN ({$studentPlaceholders})")->execute($allGroupedStudentIds);
$allGroupedConfigIds = [$groupedConfigId, $conversionConfigId, $attendanceConfigId, $bootstrapConfigId];
$configPlaceholders = implode(',', array_fill(0, count($allGroupedConfigIds), '?'));
$pdo->prepare("DELETE FROM grading_configs WHERE config_id IN ({$configPlaceholders})")->execute($allGroupedConfigIds);
integration_retire_fixture_classes(
    $pdo,
    [$groupedOffering['classId'], $groupedHistoricalClassId, $conversionOffering['classId'], $attendanceOffering['classId'], $bootstrapOffering['classId']],
    [$groupedOffering['courseId'], $conversionOffering['courseId'], $attendanceOffering['courseId'], $bootstrapOffering['courseId']]
);
$pdo->commit();
echo "PASS: Grouped Lecture/Laboratory PostgreSQL lifecycle coverage completed.\n";
