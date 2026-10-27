<?php

declare(strict_types=1);

// PostgreSQL lifecycle tests for lecture-only courses (docs/contracts/lecture-only-grading.md).
// Included right after grouped_grading_integration.php: it reuses that file's fixtures and helpers.
$loCourseSql = $pdo->prepare(
    "INSERT INTO courses (course_code, name, units, lecture_units, lab_units, semester, grading_config, created_by_user_id)
     VALUES (?, ?, 3.0, ?, ?, '1ST', '{}'::jsonb, ?) RETURNING course_id"
);
$loSectionSql = $pdo->prepare(
    "INSERT INTO class_sections (cs_name, course_id, instructor_user_id, semester, school_year, status)
     VALUES (?, ?, ?, '1ST', ?, 'Active') RETURNING cs_id"
);
$loCreate = static function (string $label, float $lec, float $lab) use ($loCourseSql, $loSectionSql, $groupedFixtureSuffix, $groupedOwnerId, $groupedCurrentYear): array {
    $loCourseSql->execute(['LO' . $label . $groupedFixtureSuffix, 'Lecture Only ' . $label, $lec, $lab, $groupedOwnerId]);
    $courseId = (int) $loCourseSql->fetchColumn();
    $section = 'LO-' . $label . '-' . $groupedFixtureSuffix;
    $loSectionSql->execute([$section, $courseId, $groupedOwnerId, $groupedCurrentYear]);
    return ['courseId' => $courseId, 'classId' => (int) $loSectionSql->fetchColumn(), 'sectionName' => $section, 'schoolYear' => $groupedCurrentYear];
};
$loConfigPath = static fn(array $o): string => '/api/faculty/grading-config?' . http_build_query([
    'courseId' => $o['courseId'], 'semester' => '1st', 'schoolYear' => $o['schoolYear'],
]);

// 1. A lecture-only course reports its structure and the four-category default.
$loOnly = $loCreate('ONLY', 3.0, 0.0);
[$loGetStatus, $loGet] = integration_http_get_json($loConfigPath($loOnly), $facultyAccessToken);
expect_same(200, $loGetStatus, 'Grade Weights opens for a lecture-only course');
expect_same('lecture', $loGet['courseStructure'] ?? null, 'Units 3/0 report the lecture structure');
expect_same(['lecture' => 3, 'laboratory' => 0], $loGet['courseUnits'] ?? null, 'The units are returned with the structure');
expect_same('lecture', $loGet['defaults']['componentMode'] ?? null, 'The lecture-only default uses componentMode lecture');
expect_true(!array_key_exists('componentWeights', $loGet['defaults'] ?? []), 'The lecture-only default has no componentWeights');
expect_same(4, count($loGet['defaults']['midtermCategories'] ?? []), 'The lecture-only default has four Midterm categories');

// 2. Save validation.
// A saved 30/70 split (the default is 50/50) keeps the worked example in section 4 non-integer: 89.6 -> 90.
$loPayload = ['termRatio' => ['midterm' => 30, 'final' => 70]] + $loGet['defaults'] + [
    'courseId' => $loOnly['courseId'], 'semester' => '1st', 'schoolYear' => $loOnly['schoolYear'],
];
$loMismatch = $loPayload;
$loMismatch['componentMode'] = 'lecture_laboratory';
$loMismatch['componentWeights'] = ['lecture' => 60, 'laboratory' => 40];
[$loMismatchStatus, $loMismatchBody] = integration_http_put_json('/api/faculty/grading-config', $facultyAccessToken, $loMismatch);
expect_same(422, $loMismatchStatus, 'A lecture-only course cannot save Lecture + Laboratory');
expect_same('GRADING_STRUCTURE_MISMATCH', $loMismatchBody['code'] ?? null, 'The structure mismatch code is stable');
expect_same('This course is Lecture only. Save it without a Laboratory part.', $loMismatchBody['message'] ?? null, 'The lecture-only mismatch message matches the contract');
$loWithLab = $loPayload;
$loWithLab['midtermCategories'][] = ['name' => 'Practical', 'weight' => 100, 'sortOrder' => 5, 'sourceKind' => 'assessment', 'component' => 'Laboratory'];
[$loWithLabStatus] = integration_http_put_json('/api/faculty/grading-config', $facultyAccessToken, $loWithLab);
expect_same(422, $loWithLabStatus, 'A lecture-only save refuses a Laboratory category');
[$loCreateStatus, $loCreateBody] = integration_http_put_json('/api/faculty/grading-config', $facultyAccessToken, $loPayload);
expect_same(201, $loCreateStatus, 'A lecture-only course saves its Lecture categories');
$loConfig = $loCreateBody['configuration'] ?? [];
$loConfigId = (int) ($loConfig['id'] ?? 0);
expect_same('lecture', $loConfig['componentMode'] ?? null, 'The saved snapshot keeps componentMode lecture');
expect_true(!array_key_exists('componentWeights', $loConfig), 'The saved lecture-only snapshot has no componentWeights');
$loRow = $pdo->prepare('SELECT component_mode, component_lecture_weight, component_laboratory_weight FROM grading_configs WHERE config_id = ?');
$loRow->execute([$loConfigId]);
$loRowValues = $loRow->fetch(PDO::FETCH_ASSOC);
expect_same('lecture', $loRowValues['component_mode'] ?? null, 'The row stores component_mode lecture');
expect_same(100.0, (float) ($loRowValues['component_lecture_weight'] ?? 0), 'The row stores Lecture weight 100');
expect_true(array_key_exists('component_laboratory_weight', $loRowValues) && $loRowValues['component_laboratory_weight'] === null, 'The row leaves the Laboratory weight empty');
[, $loSaved] = integration_http_get_json($loConfigPath($loOnly), $facultyAccessToken);
expect_same('lecture', $loSaved['courseStructure'] ?? null, 'The saved configuration also reports the structure');

// 3. The migration constraint refuses a Laboratory share on a lecture configuration.
foreach (['component_laboratory_weight = 40', 'component_lecture_weight = 60', "schema_mode = 'overall'"] as $loBad) {
    $loRejected = false;
    try {
        $pdo->prepare("UPDATE grading_configs SET {$loBad} WHERE config_id = ?")->execute([$loConfigId]);
    } catch (PDOException $e) {
        $loRejected = str_contains($e->getMessage(), 'ck_grading_configs_component_weights');
    }
    expect_true($loRejected, "ck_grading_configs_component_weights refuses a lecture configuration with {$loBad}");
}

// 4. Worked example: Midterm 84 and Final 92 give 89.6 -> 90 -> 1.9 (one rounding).
$loStudent = $groupedCreateStudent('LoOnly', $loOnly['classId']);
$loAssessmentIds = [];
foreach (['midtermCategories' => ['Midterm', 84.0], 'finalCategories' => ['Final', 92.0]] as $loKey => [$loPeriod, $loScore]) {
    foreach ($loConfig[$loKey] as $loCategory) {
        $loAssessmentId = $groupedInsertAssessment($loOnly['classId'], (int) $loCategory['id'], $loCategory['name'] . ' ' . $loPeriod, $loPeriod);
        $groupedInsertScore($loAssessmentId, $loStudent['studentId'], $loScore);
        $loAssessmentIds[] = $loAssessmentId;
    }
}
[$loComputeStatus, $loComputeBody] = integration_http_json('/api/faculty/grades/compute', $facultyAccessToken, ['classId' => (string) $loOnly['classId']]);
expect_same(200, $loComputeStatus, 'A lecture-only class recomputes');
$loResult = integration_find_enrollment_result($loComputeBody, $loStudent['enrollmentId']);
expect_same('computed', $loResult['status'] ?? null, 'The lecture-only Student is computed');
expect_same(84.0, (float) ($loResult['periods']['midterm']['percentage'] ?? -1), 'The Midterm period grade is the Lecture grade');
expect_same(92.0, (float) ($loResult['periods']['final']['percentage'] ?? -1), 'The Final period grade is the Lecture grade');
expect_same(90.0, (float) ($loResult['percentage'] ?? -1), 'The course grade rounds once: 89.6 -> 90');
expect_same(1.9, (float) ($loResult['gwa'] ?? -1), 'The lecture-only course grade converts to 1.9');
expect_true(!str_contains(json_encode($loResult['breakdown'] ?? []), 'Laboratory'), 'The stored breakdown has no Laboratory values');
expect_same('90.00', (string) ($groupedReadGrade($loStudent['enrollmentId'])['final_percentage'] ?? ''), 'The recomputed course percentage is stored');

// 5. The Laboratory removal flow on a Lecture + Laboratory course.
$loBoth = $loCreate('BOTH', 2.0, 1.0);
[$loBothGetStatus, $loBothGet] = integration_http_get_json($loConfigPath($loBoth), $facultyAccessToken);
expect_same('lecture_laboratory', $loBothGet['courseStructure'] ?? null, 'Units 2/1 report Lecture + Laboratory');
$loBothSave = $groupedPayload($loBoth);
$loBothSave['componentMode'] = 'lecture';
unset($loBothSave['componentWeights']);
[$loBothMismatchStatus, $loBothMismatch] = integration_http_put_json('/api/faculty/grading-config', $facultyAccessToken, $loBothSave);
expect_same(422, $loBothMismatchStatus, 'A Lecture + Laboratory course cannot save lecture-only');
expect_same('This course has Laboratory units. Add the Laboratory part before saving.', $loBothMismatch['message'] ?? null, 'The Laboratory-units mismatch message matches the contract');
[$loBothCreateStatus, $loBothCreate] = integration_http_put_json('/api/faculty/grading-config', $facultyAccessToken, $groupedPayload($loBoth));
expect_same(201, $loBothCreateStatus, 'A Lecture + Laboratory course still saves as before');
$loBothConfigId = (int) ($loBothCreate['configuration']['id'] ?? 0);
$loBothIds = $groupedCategoryIds($groupedMembershipRows($loBothConfigId));
$loLabAssessment = $groupedInsertAssessment($loBoth['classId'], $loBothIds['Midterm']['Laboratory']['Quiz'], 'Lab quiz', 'Midterm');

// 5a. Units removed behind the guard's back: saving lecture-only is refused while Laboratory assessments exist.
$pdo->prepare('UPDATE courses SET lab_units = 0 WHERE course_id = ?')->execute([$loBoth['courseId']]);
$loLectureSave = static function (array $ids, int $version) use ($loBoth): array {
    $category = static fn(string $name, int $weight, int $order, int $id): array => [
        'id' => $id, 'name' => $name, 'weight' => $weight, 'sortOrder' => $order, 'component' => 'Lecture',
    ];
    return [
        'courseId' => $loBoth['courseId'], 'semester' => '1st', 'schoolYear' => $loBoth['schoolYear'],
        'schemaMode' => 'periods', 'componentMode' => 'lecture', 'version' => $version,
        'termRatio' => ['midterm' => 30, 'final' => 70],
        'midtermCategories' => [$category('Quiz', 50, 1, $ids['Midterm']['Lecture']['Quiz']), $category('Exam', 50, 2, $ids['Midterm']['Lecture']['Exam'])],
        'finalCategories' => [$category('Quiz', 50, 1, $ids['Final']['Lecture']['Quiz']), $category('Exam', 50, 2, $ids['Final']['Lecture']['Exam'])],
    ];
};
[$loLabBlockedStatus, $loLabBlocked] = integration_http_put_json('/api/faculty/grading-config', $facultyAccessToken, $loLectureSave($loBothIds, 1));
expect_same(422, $loLabBlockedStatus, 'Saving lecture-only over Laboratory assessments is refused');
expect_same('GRADING_LABORATORY_ASSESSMENTS_EXIST', $loLabBlocked['code'] ?? null, 'The Laboratory assessments code is stable');

// 5b. The class-edit guard refuses removing Laboratory units while a Laboratory assessment exists.
$pdo->prepare('UPDATE courses SET lab_units = 1 WHERE course_id = ?')->execute([$loBoth['courseId']]);
$loUnitsEdit = ['csId' => (string) $loBoth['classId'], 'lectureUnits' => 2, 'labUnits' => 0];
[$loGuardStatus, $loGuardBody] = integration_http_json('/api/faculty/classes/update', $facultyAccessToken, $loUnitsEdit);
expect_same(409, $loGuardStatus, 'Removing Laboratory units is blocked by a Laboratory assessment');
expect_same('COURSE_LABORATORY_ASSESSMENTS_EXIST', $loGuardBody['code'] ?? null, 'The unit guard code is stable');
expect_true(
    str_starts_with((string) ($loGuardBody['message'] ?? ''), $loBoth['sectionName'] . ' (')
        && str_ends_with((string) ($loGuardBody['message'] ?? ''), ') has Laboratory assessments. Delete them in Grade Computation before removing Laboratory units.'),
    'The unit guard message names the offering and its Faculty'
);
$loUnitsRow = $pdo->prepare('SELECT lab_units FROM courses WHERE course_id = ?');
$loUnitsRow->execute([$loBoth['courseId']]);
expect_same(1.0, (float) $loUnitsRow->fetchColumn(), 'A blocked unit change saves nothing');

// 5c. Once the Laboratory assessment is gone, the units change and the next save switches to lecture-only.
$pdo->prepare('DELETE FROM assessments WHERE assessment_id = ?')->execute([$loLabAssessment]);
[$loUnitsOkStatus] = integration_http_json('/api/faculty/classes/update', $facultyAccessToken, $loUnitsEdit);
expect_same(200, $loUnitsOkStatus, 'Laboratory units can be removed once no Laboratory assessment remains');
[$loSwitchStatus, $loSwitch] = integration_http_put_json('/api/faculty/grading-config', $facultyAccessToken, $loLectureSave($loBothIds, 1));
expect_same(200, $loSwitchStatus, 'The next save switches the configuration to lecture-only');
expect_same('lecture', $loSwitch['configuration']['componentMode'] ?? null, 'The switched configuration is lecture-only');
$loLabMembers = $pdo->prepare("SELECT COUNT(*) FROM grading_category_period_memberships gcp JOIN grading_categories gc ON gc.category_id = gcp.category_id WHERE gc.config_id = ? AND gcp.component = 'Laboratory'");
$loLabMembers->execute([$loBothConfigId]);
expect_same(0, (int) $loLabMembers->fetchColumn(), 'No Laboratory category remains after the switch');

// Retire the fixtures. Audited classes stay archived so immutable audit scope remains valid.
$pdo->beginTransaction();
$loAll = array_map('intval', $loAssessmentIds);
$loPlaceholders = implode(',', array_fill(0, count($loAll), '?'));
$pdo->prepare("DELETE FROM assessment_scores WHERE assessment_id IN ({$loPlaceholders})")->execute($loAll);
$pdo->prepare("DELETE FROM assessments WHERE assessment_id IN ({$loPlaceholders})")->execute($loAll);
$pdo->prepare('DELETE FROM enrollments WHERE enrollment_id = ?')->execute([$loStudent['enrollmentId']]);
$pdo->prepare('DELETE FROM students WHERE student_id = ?')->execute([$loStudent['studentId']]);
$pdo->prepare('DELETE FROM grading_configs WHERE config_id IN (?, ?)')->execute([$loConfigId, $loBothConfigId]);
integration_retire_fixture_classes($pdo, [$loOnly['classId'], $loBoth['classId']], [$loOnly['courseId'], $loBoth['courseId']]);
$pdo->commit();
echo "PASS: Lecture-only PostgreSQL lifecycle coverage completed.\n";
