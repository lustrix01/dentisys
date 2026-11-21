<?php

declare(strict_types=1);

// GRD-004 grade submission (docs/contracts/grade-submission.md). Slice 1: submit, withdraw, deadlines, Dean list. Slice 2: grade change batches.
require_once __DIR__ . '/FacultyController.php';
require_once __DIR__ . '/AdminController.php';

const GRADE_SUBMISSION_DEADLINE_GRACE_DAYS = 14;

function grade_submission_time(?string $value, string $format = 'c'): ?string
{
    return $value === null ? null : (new DateTimeImmutable($value))->setTimezone(new DateTimeZone('Asia/Manila'))->format($format);
}

/** The term row (academic_terms) of a class, matched on school year and semester like academic_resolve_class_term_dates. */
function grade_submission_term(array $terms, array $class): ?array
{
    $semester = academic_term_semester($class['semester'] ?? null);
    foreach ($terms as $term) {
        if ($term['school_year'] === $class['school_year'] && $term['semester'] === $semester) {
            return $term;
        }
    }
    return null;
}

/** Y-m-d deadline: the term's grade_deadline, else its end date + 14 days (a class without a term row uses its own end date). */
function grade_submission_deadline(?array $term, array $class): ?string
{
    $deadline = $term['grade_deadline'] ?? null;
    if ($deadline !== null) {
        return (string) $deadline;
    }
    $end = $term['end_date'] ?? $class['term_end_date'] ?? null;
    return $end === null ? null : (new DateTimeImmutable((string) $end))->modify('+' . GRADE_SUBMISSION_DEADLINE_GRACE_DAYS . ' days')->format('Y-m-d');
}

/** not_submitted | late | submitted | submitted_late, from the current deadline and the latest submission. */
function grade_submission_deadline_status(?string $deadline, ?string $submittedAt, DateTimeImmutable $now): string
{
    $end = $deadline === null ? null : new DateTimeImmutable($deadline . ' 23:59:59.999999', new DateTimeZone('Asia/Manila'));
    if ($submittedAt !== null) {
        return $end !== null && new DateTimeImmutable($submittedAt) > $end ? 'submitted_late' : 'submitted';
    }
    return $end !== null && $now > $end ? 'late' : 'not_submitted';
}

/** Students with at least one assessment in a weighted category that has no score for them (what the gradebook calls incomplete). */
function grade_submission_missing(PDO $pdo, int $csId): array
{
    $stmt = $pdo->prepare(
        "SELECT s.student_number, TRIM(s.last_name || ', ' || s.first_name) AS name, COUNT(*) AS missing_count
           FROM enrollments e
           JOIN students s ON s.student_id = e.student_id
           JOIN assessments a ON a.cs_id = e.cs_id AND a.grading_category_id IS NOT NULL AND a.status <> 'Archived'
          WHERE e.cs_id = ? AND LOWER(e.status) = 'active'
            AND NOT EXISTS (SELECT 1 FROM assessment_scores sc WHERE sc.assessment_id = a.assessment_id AND sc.student_id = e.student_id)
          GROUP BY s.student_id, s.student_number, s.last_name, s.first_name
          ORDER BY s.last_name, s.first_name, s.student_id"
    );
    $stmt->execute([$csId]);
    return array_map(static fn(array $r): array => ['name' => $r['name'], 'studentNumber' => $r['student_number'], 'missingCount' => (int) $r['missing_count']],
        $stmt->fetchAll(PDO::FETCH_ASSOC));
}

function grade_submission_class_row(PDO $pdo, int $csId, bool $lock = false): array
{
    $stmt = $pdo->prepare(
        'SELECT cs.cs_id, cs.cs_name, cs.school_year, cs.semester, cs.term_start_date, cs.term_end_date, cs.archive_reason,
                cs.grades_submitted_at, cs.grades_grace_until
           FROM class_sections cs WHERE cs.cs_id = ?' . ($lock ? ' FOR UPDATE OF cs' : '')
    );
    $stmt->execute([$csId]);
    return $stmt->fetch(PDO::FETCH_ASSOC);
}

/** The batch of the Faculty object: the open one, or the latest decided one when it was rejected and the class has had no new submission since. */
function grade_change_batch_payload(PDO $pdo, int $csId, ?string $submittedAt): ?array
{
    $stmt = $pdo->prepare('SELECT batch_id, status, reason, sent_at, decided_at, decision_reason FROM grade_change_batches WHERE cs_id = ? ORDER BY batch_id DESC LIMIT 1');
    $stmt->execute([$csId]);
    $batch = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$batch || !(in_array($batch['status'], ['draft', 'pending'], true)
        || ($batch['status'] === 'rejected' && $submittedAt !== null && new DateTimeImmutable($batch['decided_at']) >= new DateTimeImmutable($submittedAt)))) {
        return null;
    }
    return ['batchId' => (int) $batch['batch_id'], 'status' => $batch['status'], 'reason' => $batch['reason'],
        'sentAt' => grade_submission_time($batch['sent_at']), 'decisionReason' => $batch['decision_reason']];
}

/** The Faculty object of the contract API. */
function grade_submission_payload(PDO $pdo, int $csId): array
{
    $class = grade_submission_class_row($pdo, $csId);
    $deadline = grade_submission_deadline(grade_submission_term(academic_terms_read($pdo), $class), $class);
    $submitted = $class['grades_submitted_at'] !== null;
    return [
        'status' => $submitted ? 'submitted' : 'not_submitted',
        'deadlineStatus' => grade_submission_deadline_status($deadline, $class['grades_submitted_at'], attendance_session_now_utc()),
        'deadline' => $deadline,
        'submittedAt' => grade_submission_time($class['grades_submitted_at']),
        'graceUntil' => grade_submission_time($class['grades_grace_until']),
        'missing' => $submitted ? [] : grade_submission_missing($pdo, $csId),
        'batch' => grade_change_batch_payload($pdo, $csId, $class['grades_submitted_at']),
    ];
}

/** GET (read), POST (submit) and POST .../withdraw on one Faculty-owned class. */
function grade_submission_faculty_handle(string $action): void
{
    $pdo = null;
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $authCtx = faculty_verify_auth($pdo, $config);
        if ($action === 'read') {
            $csId = (int) ($_GET['csId'] ?? 0);
        } else {
            $body = request_body();
            if (!$body['has_body']) { safe_error_response('Request body required.', 400); return; }
            $csId = (int) ($body['data']['csId'] ?? 0);
        }
        if ($csId <= 0) { safe_error_response('csId is required.', 400); return; }
        if (faculty_owned_class_id($pdo, (int) $authCtx['user_id'], (string) $csId) <= 0) {
            safe_error_response('Class is not assigned to this faculty member.', 403);
            return;
        }
        if ($action === 'read') {
            json_response(grade_submission_payload($pdo, $csId));
            return;
        }

        $pdo->beginTransaction();
        $class = grade_submission_class_row($pdo, $csId, true);
        $now = attendance_session_now_utc();
        $label = audit_class_label($pdo, $csId);
        if (in_array($action, ['open', 'send', 'pull-back', 'discard'], true)) {
            $error = grade_change_faculty_apply($pdo, $config, $authCtx, $action, $csId, $class, $body['data'], $label, $now);
            if ($error !== null) { $pdo->rollBack(); safe_error_response($error[0], $error[1]); return; }
        } elseif ($action === 'submit') {
            $open = $pdo->prepare("SELECT 1 FROM attendance_sessions WHERE cs_id = ? AND status = 'active' LIMIT 1");
            $open->execute([$csId]);
            $error = $class['archive_reason'] !== null ? academic_view_only_message($pdo, $csId)
                : ($class['grades_submitted_at'] !== null ? 'Grades are already submitted.'
                : ($open->fetchColumn() !== false ? 'End the open attendance session first.' : null));
            if ($error !== null) { $pdo->rollBack(); safe_error_response($error, 409); return; }
            $graceUntil = $now->modify('+24 hours');
            $pdo->prepare('UPDATE class_sections SET grades_submitted_at = ?, grades_grace_until = ?, grades_submitted_by = ? WHERE cs_id = ?')
                ->execute([$now->format('Y-m-d H:i:sO'), $graceUntil->format('Y-m-d H:i:sO'), (int) $authCtx['user_id'], $csId]);
            audit_record_action($pdo, $config, $authCtx, 'grading', 'grades_submitted', 'class_section', (string) $csId,
                "Submitted the grades of {$label}.", ['scope_cs_id' => $csId, 'after' => ['grades_submitted_at' => $now->format('c'), 'grades_grace_until' => $graceUntil->format('c')]]);
        } else {
            if ($class['grades_submitted_at'] === null) { $pdo->rollBack(); safe_error_response('Grades for this class are not submitted.', 409); return; }
            if ($class['grades_grace_until'] === null || new DateTimeImmutable($class['grades_grace_until']) <= $now) {
                $pdo->rollBack();
                safe_error_response('The withdraw period ended at ' . grade_submission_time($class['grades_grace_until'], 'M j, Y, g:i A') . '.', 409);
                return;
            }
            $pdo->prepare('UPDATE class_sections SET grades_submitted_at = NULL, grades_grace_until = NULL, grades_submitted_by = NULL WHERE cs_id = ?')->execute([$csId]);
            audit_record_action($pdo, $config, $authCtx, 'grading', 'grades_withdrawn', 'class_section', (string) $csId,
                "Withdrew the grade submission of {$label}.", ['scope_cs_id' => $csId, 'before' => ['grades_submitted_at' => grade_submission_time($class['grades_submitted_at'])]]);
        }
        $pdo->commit();
        json_response(grade_submission_payload($pdo, $csId));
    } catch (\Throwable $e) {
        if ($pdo instanceof PDO && $pdo->inTransaction()) { $pdo->rollBack(); }
        error_log('Grade submission ' . $action . ' error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

function handle_faculty_grade_submission_get(): void { grade_submission_faculty_handle('read'); }
function handle_faculty_grade_submission_submit(): void { grade_submission_faculty_handle('submit'); }
function handle_faculty_grade_submission_withdraw(): void { grade_submission_faculty_handle('withdraw'); }
function handle_faculty_grade_change_open(): void { grade_submission_faculty_handle('open'); }
function handle_faculty_grade_change_send(): void { grade_submission_faculty_handle('send'); }
function handle_faculty_grade_change_pull_back(): void { grade_submission_faculty_handle('pull-back'); }
function handle_faculty_grade_change_discard(): void { grade_submission_faculty_handle('discard'); }

/** Dean and Superadmin: the term's classes with their submission status. */
function handle_admin_grade_submissions(): void
{
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        admin_verify_auth($pdo, $config, ['admin', 'superadmin']);
        $now = attendance_session_now_utc();
        $today = app_local_date($config, $now);
        $terms = academic_terms_read($pdo);
        $term = null;
        if (isset($_GET['termId']) && $_GET['termId'] !== '') {
            foreach ($terms as $row) { if ((string) $row['id'] === (string) $_GET['termId']) { $term = $row; } }
            if ($term === null) { safe_error_response('Term not found.', 404); return; }
        } else {
            $currentYear = academic_current_school_year($pdo);
            foreach ($terms as $row) { // newest start first within the school year: the term containing today, else the latest started one
                if ($row['school_year'] === $currentYear && $row['start_date'] <= $today && ($term === null || $row['start_date'] > $term['start_date'])) { $term = $row; }
            }
        }
        $classes = [];
        $late = 0;
        $courseId = isset($_GET['courseId']) && ctype_digit((string) $_GET['courseId']) ? (int) $_GET['courseId'] : null;
        $status = is_string($_GET['status'] ?? null) ? $_GET['status'] : '';
        $stmt = $pdo->query(
            "SELECT cs.cs_id, cs.cs_name, cs.school_year, cs.semester, cs.term_end_date, cs.course_id, cs.grades_submitted_at,
                    cs.archive_reason, c.course_code, u.display_name AS faculty_name
               FROM class_sections cs JOIN courses c ON c.course_id = cs.course_id
               LEFT JOIN user_accounts u ON u.user_id = cs.instructor_user_id
              WHERE cs.archive_reason IS NULL OR cs.archive_reason = 'finished'
              ORDER BY c.course_code, cs.cs_name, cs.cs_id"
        );
        $allClasses = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $fallbackYear = null;
        $fallbackSemester = null;
        if ($term === null) {
            $currentYear = academic_current_school_year($pdo);
            $activeClasses = array_values(array_filter($allClasses, static fn(array $c): bool => $c['archive_reason'] === null));
            $candidates = $activeClasses !== [] ? $activeClasses : $allClasses;
            $currentCandidates = array_values(array_filter($candidates, static fn(array $c): bool => $c['school_year'] === $currentYear));
            $source = $currentCandidates !== [] ? $currentCandidates : $candidates;
            if ($source !== []) {
                $semOrder = ['1ST' => 0, '2ND' => 1, 'Summer' => 2];
                usort($source, static function (array $a, array $b) use ($semOrder): int {
                    $yearCmp = strcmp($b['school_year'], $a['school_year']);
                    if ($yearCmp !== 0) { return $yearCmp; }
                    $semA = $semOrder[academic_term_semester($a['semester'] ?? null) ?? ''] ?? -1;
                    $semB = $semOrder[academic_term_semester($b['semester'] ?? null) ?? ''] ?? -1;
                    return $semB <=> $semA;
                });
                $fallbackYear = $source[0]['school_year'];
                $fallbackSemester = academic_term_semester($source[0]['semester'] ?? null) ?? '1ST';
            } else {
                $fallbackYear = $currentYear;
                $fallbackSemester = '1ST';
            }
        }
        foreach ($allClasses as $class) {
            $classTerm = grade_submission_term($terms, $class);
            $deadline = grade_submission_deadline($term !== null ? $classTerm : null, $class);
            $deadlineStatus = grade_submission_deadline_status($deadline, $class['grades_submitted_at'], $now);
            if ($term !== null && $classTerm !== null && $classTerm['start_date'] < $term['start_date'] && $deadlineStatus === 'late') {
                $late++;
            }
            $matchesTerm = $term !== null
                ? ($classTerm !== null && (int) $classTerm['id'] === (int) $term['id'])
                : ($class['school_year'] === $fallbackYear && academic_term_semester($class['semester'] ?? null) === $fallbackSemester);
            if (!$matchesTerm
                || ($courseId !== null && (int) $class['course_id'] !== $courseId) || ($status !== '' && $status !== $deadlineStatus)) {
                continue;
            }
            $classes[] = ['csId' => (int) $class['cs_id'], 'courseCode' => $class['course_code'], 'section' => $class['cs_name'],
                'faculty' => $class['faculty_name'] ?? 'Faculty', 'deadline' => $deadline, 'deadlineStatus' => $deadlineStatus,
                'submittedAt' => grade_submission_time($class['grades_submitted_at'])];
        }
        json_response(['status' => 'ok', 'term' => $term !== null ? ['id' => (int) $term['id'], 'schoolYear' => $term['school_year'], 'semester' => $term['semester']]
            : ['id' => 0, 'schoolYear' => $fallbackYear, 'semester' => $fallbackSemester],
            'classes' => $classes, 'lateFromEarlierTerms' => $late]);
    } catch (\Throwable $e) {
        error_log('Admin grade submissions error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

/** Copy the class's assessments, scores, attendance records and published grades into a new draft batch. */
function grade_change_open(PDO $pdo, int $csId, int $facultyUserId): int
{
    $stmt = $pdo->prepare(
        "INSERT INTO grade_change_batches (cs_id, faculty_user_id, status, snapshot)
         SELECT ?, ?, 'draft', jsonb_build_object(
             'assessments', COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.assessment_id) FROM assessments a WHERE a.cs_id = ?), '[]'::jsonb),
             'scores', COALESCE((SELECT jsonb_agg(to_jsonb(sc) ORDER BY sc.score_id) FROM assessment_scores sc JOIN assessments a ON a.assessment_id = sc.assessment_id WHERE a.cs_id = ?), '[]'::jsonb),
             'attendance', COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.record_id) FROM attendance_records r JOIN enrollments e ON e.enrollment_id = r.enrollment_id WHERE e.cs_id = ?), '[]'::jsonb),
             'grades', COALESCE((SELECT jsonb_object_agg(CAST(e.enrollment_id AS TEXT), jsonb_build_object('percentage', e.final_percentage, 'gwa', e.final_gwa, 'components', e.grade_components_json)) FROM enrollments e WHERE e.cs_id = ?), '{}'::jsonb),
             'correction_max', (SELECT COALESCE(MAX(correction_id), 0) FROM attendance_record_corrections))
         RETURNING batch_id"
    );
    $stmt->execute([$csId, $facultyUserId, $csId, $csId, $csId, $csId]);
    return (int) $stmt->fetchColumn();
}

/** Insert or update the snapshot rows of one table in place (original ids kept). */
function grade_change_restore_table(PDO $pdo, int $batchId, string $table, string $key, array $conflict, array $keep): void
{
    $stmt = $pdo->prepare('SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = ? ORDER BY ordinal_position');
    $stmt->execute([$table]);
    $columns = $stmt->fetchAll(PDO::FETCH_COLUMN);
    $list = implode(', ', $columns);
    $set = implode(', ', array_map(static fn(string $c): string => "{$c} = EXCLUDED.{$c}", array_diff($columns, $conflict, $keep)));
    $pdo->exec(
        "INSERT INTO {$table} ({$list}) SELECT {$list} FROM jsonb_populate_recordset(NULL::{$table}, (SELECT snapshot -> '{$key}' FROM grade_change_batches WHERE batch_id = {$batchId}))
         ON CONFLICT (" . implode(', ', $conflict) . ") DO UPDATE SET {$set}"
    );
}

/**
 * Reject and Discard: put the class's scores, assessments and attendance records back to the snapshot, in place.
 * Rows created in the draft go after their dependents; rows deleted in the draft come back with their original ids.
 * Published grades, remedials and retention were never touched.
 */
function grade_change_restore(PDO $pdo, array $batch): void
{
    $csId = (int) $batch['cs_id'];
    $id = (int) $batch['batch_id'];
    $snapshotIds = static fn(string $key, string $field): string => "SELECT CAST(x ->> '{$field}' AS INTEGER) FROM grade_change_batches b, jsonb_array_elements(b.snapshot -> '{$key}') x WHERE b.batch_id = {$id}";
    $classRecords = "SELECT r.record_id FROM attendance_records r JOIN enrollments e ON e.enrollment_id = r.enrollment_id WHERE e.cs_id = {$csId}";
    $created = "{$classRecords} AND r.record_id NOT IN (" . $snapshotIds('attendance', 'record_id') . ')';
    // History written during the draft goes with it: corrections of the class's records, and the dependents of created records.
    $pdo->exec("DELETE FROM attendance_record_corrections WHERE record_id IN ({$created})
                   OR (record_id IN ({$classRecords}) AND correction_id > (SELECT CAST(snapshot ->> 'correction_max' AS BIGINT) FROM grade_change_batches WHERE batch_id = {$id}))");
    $pdo->exec("DELETE FROM attendance_excused_requests WHERE record_id IN ({$created})");
    $pdo->exec("DELETE FROM attendance_records WHERE record_id IN ({$created})");
    grade_change_restore_table($pdo, $id, 'attendance_records', 'attendance', ['record_id'], []);
    $pdo->exec("DELETE FROM assessment_scores sc USING assessments a WHERE a.assessment_id = sc.assessment_id AND a.cs_id = {$csId}
                   AND NOT EXISTS (SELECT 1 FROM grade_change_batches b, jsonb_array_elements(b.snapshot -> 'scores') x
                                    WHERE b.batch_id = {$id} AND CAST(x ->> 'assessment_id' AS INTEGER) = sc.assessment_id AND CAST(x ->> 'student_id' AS INTEGER) = sc.student_id)");
    $pdo->exec("DELETE FROM assessments WHERE cs_id = {$csId} AND assessment_id NOT IN (" . $snapshotIds('assessments', 'assessment_id') . ')');
    grade_change_restore_table($pdo, $id, 'assessments', 'assessments', ['assessment_id'], []);
    grade_change_restore_table($pdo, $id, 'assessment_scores', 'scores', ['assessment_id', 'student_id'], ['score_id']);
}

/** Display text of a snapshot or live value: numbers with two decimals, empty as null. */
function grade_change_text(mixed $value): ?string
{
    if ($value === null || $value === '') { return null; }
    if (is_bool($value)) { return $value ? 'Yes' : 'No'; }
    return is_numeric($value) ? faculty_grade_text($value) : (string) $value;
}

/**
 * Every student whose scores, attendance or grade differs between the snapshot and the live rows, with old -> new per
 * change (rule 7: listed even when the grade is the same). Assessment changes apply to every enrolled student.
 *
 * @return list<array{studentId:int, name:string, studentNumber:string, oldGrade:?float, newGrade:?float, changes:list<array>}>
 */
function grade_change_diff(PDO $pdo, array $batch): array
{
    $csId = (int) $batch['cs_id'];
    $snapshot = json_decode((string) $batch['snapshot'], true) ?: [];
    $draft = json_decode((string) $batch['draft_results'], true) ?: [];
    $stmt = $pdo->prepare(
        "SELECT e.enrollment_id, e.student_id, e.final_percentage, e.final_gwa, s.student_number, TRIM(s.last_name || ', ' || s.first_name) AS name
           FROM enrollments e JOIN students s ON s.student_id = e.student_id WHERE e.cs_id = ? ORDER BY s.last_name, s.first_name, s.student_id"
    );
    $stmt->execute([$csId]);
    $students = [];
    $studentOf = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $studentOf[(int) $row['enrollment_id']] = (int) $row['student_id'];
        $students[(int) $row['student_id']] = ['studentId' => (int) $row['student_id'], 'name' => $row['name'], 'studentNumber' => $row['student_number'],
            'oldGrade' => $row['final_gwa'] === null ? null : (float) $row['final_gwa'], 'newGrade' => $row['final_gwa'] === null ? null : (float) $row['final_gwa'], 'changes' => []];
        $result = $draft[(string) $row['enrollment_id']] ?? null;
        if ($result !== null) {
            $students[(int) $row['student_id']]['newGrade'] = isset($result['gwa']) ? (float) $result['gwa'] : null;
            if (grade_change_text($result['percentage'] ?? null) !== grade_change_text($row['final_percentage']) || grade_change_text($result['gwa'] ?? null) !== grade_change_text($row['final_gwa'])) {
                $students[(int) $row['student_id']]['gradeMoved'] = true;
            }
        }
    }

    $liveAssessments = [];
    foreach ($pdo->query('SELECT * FROM assessments WHERE cs_id = ' . $csId)->fetchAll(PDO::FETCH_ASSOC) as $row) { $liveAssessments[(int) $row['assessment_id']] = $row; }
    $oldAssessments = [];
    foreach ($snapshot['assessments'] ?? [] as $row) { $oldAssessments[(int) $row['assessment_id']] = $row; }
    $assessmentLabel = static fn(array $a): string => $a['title'] . ($a['grading_period'] ? ' (' . $a['grading_period'] . ')' : '');
    $assessmentChanges = [];
    $columns = ['title' => 'title', 'type' => 'type', 'grading_period' => 'period', 'max_score' => 'max score', 'weight' => 'weight', 'due_date' => 'due date', 'status' => 'status',
        'transmutation_enabled' => 'transmutation', 'transmutation_minimum_percentage' => 'transmutation minimum', 'transmutation_maximum_percentage' => 'transmutation maximum',
        'attendance_session_date' => 'linked session date', 'attendance_session_code' => 'linked session', 'grading_category_id' => 'category'];
    foreach ($oldAssessments + $liveAssessments as $assessmentId => $_) {
        $old = $oldAssessments[$assessmentId] ?? null;
        $new = $liveAssessments[$assessmentId] ?? null;
        if ($old === null || $new === null) {
            $assessmentChanges[] = ['kind' => 'assessment', 'label' => $assessmentLabel($old ?? $new), 'old' => $old === null ? null : 'Existing', 'new' => $new === null ? 'Removed' : 'Added'];
            continue;
        }
        foreach ($columns as $column => $name) {
            if (grade_change_text($old[$column] ?? null) !== grade_change_text($new[$column] ?? null)) {
                $assessmentChanges[] = ['kind' => 'assessment', 'label' => $assessmentLabel($new) . ': ' . $name, 'old' => grade_change_text($old[$column] ?? null), 'new' => grade_change_text($new[$column] ?? null)];
            }
        }
    }

    $oldScores = [];
    foreach ($snapshot['scores'] ?? [] as $row) { $oldScores[$row['assessment_id'] . ':' . $row['student_id']] = $row; }
    $newScores = [];
    foreach ($pdo->query('SELECT sc.assessment_id, sc.student_id, sc.score FROM assessment_scores sc JOIN assessments a ON a.assessment_id = sc.assessment_id WHERE a.cs_id = ' . $csId)->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $newScores[$row['assessment_id'] . ':' . $row['student_id']] = $row;
    }
    foreach ($oldScores + $newScores as $key => $_) {
        $old = $oldScores[$key] ?? null;
        $new = $newScores[$key] ?? null;
        $before = grade_change_text($old['score'] ?? null);
        $after = grade_change_text($new['score'] ?? null);
        $studentId = (int) ($new['student_id'] ?? $old['student_id']);
        if ($before !== $after && isset($students[$studentId])) {
            $assessment = $liveAssessments[(int) ($new['assessment_id'] ?? $old['assessment_id'])] ?? $oldAssessments[(int) ($new['assessment_id'] ?? $old['assessment_id'])];
            $students[$studentId]['changes'][] = ['kind' => 'score', 'label' => $assessmentLabel($assessment), 'old' => $before, 'new' => $after];
        }
    }

    $oldRecords = [];
    foreach ($snapshot['attendance'] ?? [] as $row) { $oldRecords[(int) $row['record_id']] = $row; }
    $newRecords = [];
    $recordStmt = $pdo->prepare('SELECT r.record_id, r.enrollment_id, r.session_date, r.session_code, r.status FROM attendance_records r JOIN enrollments e ON e.enrollment_id = r.enrollment_id WHERE e.cs_id = ?');
    $recordStmt->execute([$csId]);
    foreach ($recordStmt->fetchAll(PDO::FETCH_ASSOC) as $row) { $newRecords[(int) $row['record_id']] = $row; }
    foreach ($oldRecords + $newRecords as $recordId => $_) {
        $old = $oldRecords[$recordId] ?? null;
        $new = $newRecords[$recordId] ?? null;
        $studentId = $studentOf[(int) ($new['enrollment_id'] ?? $old['enrollment_id'])] ?? 0;
        if (($old['status'] ?? null) !== ($new['status'] ?? null) && isset($students[$studentId])) {
            $row = $new ?? $old;
            $students[$studentId]['changes'][] = ['kind' => 'attendance', 'label' => 'Attendance ' . $row['session_date'] . ($row['session_code'] ? ' (' . $row['session_code'] . ')' : ''), 'old' => $old['status'] ?? null, 'new' => $new['status'] ?? null];
        }
    }

    $listed = [];
    foreach ($students as $student) {
        $changes = array_merge($student['changes'], $assessmentChanges);
        if ($changes === [] && !isset($student['gradeMoved'])) { continue; }
        unset($student['gradeMoved']);
        $student['changes'] = $changes;
        $listed[] = $student;
    }
    return $listed;
}

/** Notify Faculty of the Dean's decision: in-app plus an email through the outbox, sent after the commit by the caller. */
function grade_change_notify_decision(PDO $pdo, array $batch, string $className, string $verdict, string $dean, ?string $reason): array
{
    $facultyId = (int) $batch['faculty_user_id'];
    $title = "Grade change {$verdict}";
    $body = "Your grade change for {$className} was {$verdict} by {$dean}." . ($reason !== null ? " Reason: {$reason}" : '');
    notification_create_idempotent($pdo, $facultyId, 'grade_change_decision', $title, $body, 'class_section', (string) $batch['cs_id'], 'grade-change-decision:' . $batch['batch_id']);
    $stmt = $pdo->prepare('SELECT login_email, display_name FROM user_accounts WHERE user_id = ?');
    $stmt->execute([$facultyId]);
    $faculty = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$faculty || trim((string) $faculty['login_email']) === '') { return []; }
    $html = email_class_faculty_changed_html((string) $faculty['display_name'], $title, [email_escape($body)]);
    $outbox = $pdo->prepare("INSERT INTO email_outbox (sender_user_id, recipient_email, recipient_name, subject, email_type, message_body, status, operation_uuid, action_uuid)
        VALUES (?, ?, ?, ?, 'Class', ?, 'Pending', ?, ?) RETURNING email_id");
    $outbox->execute([$batch['decided_by_user_id'], $faculty['login_email'], $faculty['display_name'], $title, $html, uuid_v4_string(), uuid_v4_string()]);
    return [[(int) $outbox->fetchColumn(), (string) $faculty['login_email'], $title, $html]];
}

/** Faculty open / send / pull-back / discard on a locked class row. Returns [message, status] on refusal, null on success. */
function grade_change_faculty_apply(PDO $pdo, array $config, array $authCtx, string $action, int $csId, array $class, array $data, string $label, DateTimeImmutable $now): ?array
{
    $batch = grade_change_open_batch($pdo, $csId, true);
    $facultyId = (int) $authCtx['user_id'];
    if ($action === 'open') {
        if ($class['grades_submitted_at'] === null) { return ['Grades for this class are not submitted.', 409]; }
        if ($class['archive_reason'] !== null) { return [academic_view_only_message($pdo, $csId), 409]; }
        if ($batch !== null) { return ['This class already has an open grade change.', 409]; }
        if ($class['grades_grace_until'] !== null && new DateTimeImmutable($class['grades_grace_until']) > $now) {
            return ['You can still withdraw until ' . grade_submission_time($class['grades_grace_until'], 'M j, Y, g:i A') . '.', 409];
        }
        grade_change_open($pdo, $csId, $facultyId);
        return null;
    }
    if ($batch === null) { return ['This class has no open grade change.', 409]; }
    if ($action === 'send') {
        $reason = is_string($data['reason'] ?? null) ? trim($data['reason']) : '';
        if (mb_strlen($reason) < 8) { return ['Give a reason of at least 8 characters.', 422]; }
        if ($batch['status'] !== 'draft') { return ['This grade change is already sent.', 409]; }
        $pdo->prepare("UPDATE grade_change_batches SET status = 'pending', reason = ?, sent_at = ? WHERE batch_id = ?")->execute([$reason, $now->format('Y-m-d H:i:sO'), $batch['batch_id']]);
        $deans = $pdo->query("SELECT user_id FROM user_accounts WHERE role = 'admin' AND status = 'Active'")->fetchAll(PDO::FETCH_COLUMN);
        foreach ($deans as $deanId) {
            notification_create_idempotent($pdo, (int) $deanId, 'grade_change_request', 'Grade change awaiting approval', "{$authCtx['display_name']} sent a grade change for {$label} for your approval.",
                'grade_change_batch', (string) $batch['batch_id'], 'grade-change-sent:' . $batch['batch_id'] . ':' . $now->format('YmdHisu') . ':' . $deanId);
        }
        audit_record_action($pdo, $config, $authCtx, 'grading', 'grade_change_sent', 'class_section', (string) $csId, "Sent a grade change of {$label} for Dean approval.",
            ['scope_cs_id' => $csId, 'reason' => $reason, 'after' => ['batchId' => (int) $batch['batch_id']]]);
    } elseif ($action === 'pull-back') {
        if ($batch['status'] !== 'pending') { return ['Only a sent grade change can be pulled back.', 409]; }
        $pdo->prepare("UPDATE grade_change_batches SET status = 'draft', sent_at = NULL WHERE batch_id = ?")->execute([$batch['batch_id']]);
        audit_record_action($pdo, $config, $authCtx, 'grading', 'grade_change_pulled_back', 'class_section', (string) $csId, "Pulled back the grade change of {$label}.",
            ['scope_cs_id' => $csId, 'after' => ['batchId' => (int) $batch['batch_id']]]);
    } else {
        grade_change_restore($pdo, $batch);
        $pdo->prepare("UPDATE grade_change_batches SET status = 'discarded', decided_at = ?, decided_by_user_id = ?, snapshot = NULL, draft_results = NULL WHERE batch_id = ?")
            ->execute([$now->format('Y-m-d H:i:sO'), $facultyId, $batch['batch_id']]);
        audit_record_action($pdo, $config, $authCtx, 'grading', 'grade_change_discarded', 'class_section', (string) $csId, "Discarded the grade change of {$label}.",
            ['scope_cs_id' => $csId, 'after' => ['batchId' => (int) $batch['batch_id']]]);
    }
    return null;
}

function grade_change_request_json(array $row, ?int $studentCount): array
{
    return ['batchId' => (int) $row['batch_id'], 'csId' => (int) $row['cs_id'], 'courseCode' => $row['course_code'], 'section' => $row['cs_name'],
        'faculty' => $row['faculty_name'] ?? 'Faculty', 'reason' => $row['reason'], 'sentAt' => grade_submission_time($row['sent_at']), 'status' => $row['status'],
        'studentCount' => $studentCount, 'decidedAt' => grade_submission_time($row['decided_at']), 'decisionReason' => $row['decision_reason']];
}

function grade_change_request_row(PDO $pdo, int $batchId, bool $lock = false): ?array
{
    $stmt = $pdo->prepare(
        'SELECT b.*, cs.cs_name, c.course_code, u.display_name AS faculty_name
           FROM grade_change_batches b JOIN class_sections cs ON cs.cs_id = b.cs_id JOIN courses c ON c.course_id = cs.course_id
           LEFT JOIN user_accounts u ON u.user_id = b.faculty_user_id
          WHERE b.batch_id = ?' . ($lock ? ' FOR UPDATE OF b' : '')
    );
    $stmt->execute([$batchId]);
    return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
}

/** Dean and Superadmin GETs (list, detail) and the Dean's approve / reject. */
function grade_change_admin_handle(string $action): void
{
    $pdo = null;
    try {
        $config = app_config();
        $pdo = create_pdo($config);
        $readOnly = in_array($action, ['list', 'detail'], true);
        $authCtx = admin_verify_auth($pdo, $config, $readOnly ? ['admin', 'superadmin'] : ['admin']);
        if ($action === 'list') {
            $decided = ($_GET['state'] ?? 'pending') === 'decided';
            $stmt = $pdo->query(
                "SELECT b.*, cs.cs_name, c.course_code, u.display_name AS faculty_name
                   FROM grade_change_batches b JOIN class_sections cs ON cs.cs_id = b.cs_id JOIN courses c ON c.course_id = cs.course_id
                   LEFT JOIN user_accounts u ON u.user_id = b.faculty_user_id
                  WHERE b.status " . ($decided ? "IN ('approved', 'rejected') ORDER BY b.decided_at DESC, b.batch_id DESC" : "= 'pending' ORDER BY b.sent_at, b.batch_id")
            );
            $requests = array_map(static fn(array $row): array => grade_change_request_json($row,
                $row['status'] === 'pending' ? count(grade_change_diff($pdo, $row)) : count(json_decode((string) $row['changes'], true) ?: [])), $stmt->fetchAll(PDO::FETCH_ASSOC));
            $pending = (int) $pdo->query("SELECT COUNT(*) FROM grade_change_batches WHERE status = 'pending'")->fetchColumn();
            json_response(['status' => 'ok', 'requests' => $requests, 'pendingCount' => $pending]);
            return;
        }
        $body = $readOnly ? ['data' => ['batchId' => $_GET['batchId'] ?? 0]] : request_body();
        if (!$readOnly && !$body['has_body']) { safe_error_response('Request body required.', 400); return; }
        $batchId = (int) ($body['data']['batchId'] ?? 0);
        if ($batchId <= 0) { safe_error_response('batchId is required.', 400); return; }
        if ($action === 'detail') {
            $row = grade_change_request_row($pdo, $batchId);
            if ($row === null) { safe_error_response('Request not found.', 404); return; }
            if (in_array($row['status'], ['draft', 'discarded'], true)) { safe_error_response('This request was pulled back by the Faculty.', 409); return; }
            $students = $row['status'] === 'pending' ? grade_change_diff($pdo, $row) : (json_decode((string) $row['changes'], true) ?: []);
            json_response(['status' => 'ok', 'request' => grade_change_request_json($row, count($students)), 'students' => $students]);
            return;
        }

        $pdo->beginTransaction();
        $row = grade_change_request_row($pdo, $batchId, true);
        if ($row === null) { $pdo->rollBack(); safe_error_response('Request not found.', 404); return; }
        $error = in_array($row['status'], ['draft', 'discarded'], true) ? 'This request was pulled back by the Faculty.' : ($row['status'] !== 'pending' ? 'Only a pending request can be decided.' : null);
        $reason = is_string($body['data']['reason'] ?? null) ? trim($body['data']['reason']) : '';
        if ($error !== null) { $pdo->rollBack(); safe_error_response($error, 409); return; }
        if ($action === 'reject' && mb_strlen($reason) < 8) { $pdo->rollBack(); safe_error_response('Give a reason of at least 8 characters.', 422); return; }

        $csId = (int) $row['cs_id'];
        grade_submission_class_row($pdo, $csId, true);
        $students = grade_change_diff($pdo, $row);
        $now = attendance_session_now_utc();
        $label = $row['course_code'] . ' (' . $row['cs_name'] . ')';
        $approve = $action === 'approve';
        if ($approve) {
            foreach (json_decode((string) $row['draft_results'], true) ?: [] as $enrollmentId => $result) {
                faculty_save_computed_grade($pdo, (float) $result['percentage'], (float) $result['gwa'], (string) $result['retention'], (array) $result['components'], (int) $enrollmentId, false, true);
            }
            $pdo->prepare('UPDATE class_sections SET grades_grace_until = NULL WHERE cs_id = ?')->execute([$csId]);
        } else {
            grade_change_restore($pdo, $row);
        }
        $pdo->prepare('UPDATE grade_change_batches SET status = ?, decided_at = ?, decided_by_user_id = ?, decision_reason = ?, changes = CAST(? AS JSONB), snapshot = NULL, draft_results = NULL WHERE batch_id = ?')
            ->execute([$approve ? 'approved' : 'rejected', $now->format('Y-m-d H:i:sO'), (int) $authCtx['user_id'], $approve ? null : $reason, json_encode($students, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $batchId]);
        $row['decided_by_user_id'] = (int) $authCtx['user_id'];
        $mails = grade_change_notify_decision($pdo, $row, $label, $approve ? 'approved' : 'rejected', (string) $authCtx['display_name'], $approve ? null : $reason);
        audit_record_action($pdo, $config, $authCtx, 'grading', $approve ? 'grade_change_approved' : 'grade_change_rejected', 'class_section', (string) $csId,
            ($approve ? 'Approved' : 'Rejected') . " the grade change of {$label}.",
            ['scope_cs_id' => $csId] + ($approve ? [] : ['reason' => $reason]) + ['after' => ['batchId' => $batchId, 'students' => count($students)]]);
        $pdo->commit();
        foreach ($mails as [$emailId, $email, $subject, $html]) {
            try {
                if (!student_invitation_outbox_send($pdo, $config, $emailId, $email, $subject, $html)) { error_log('Grade change: the decision email was not delivered.'); }
            } catch (\Throwable $mailError) {
                error_log('Grade change mail error: ' . sanitize_for_log($mailError));
            }
        }
        json_response(['status' => 'ok', 'message' => 'Grade change ' . ($approve ? 'approved' : 'rejected') . '.']);
    } catch (\Throwable $e) {
        if ($pdo instanceof PDO && $pdo->inTransaction()) { $pdo->rollBack(); }
        error_log('Grade change ' . $action . ' error: ' . sanitize_for_log($e));
        safe_error_response('Internal server error.', 500);
    }
}

function handle_admin_grade_change_requests(): void { grade_change_admin_handle('list'); }
function handle_admin_grade_change_request_detail(): void { grade_change_admin_handle('detail'); }
function handle_admin_grade_change_approve(): void { grade_change_admin_handle('approve'); }
function handle_admin_grade_change_reject(): void { grade_change_admin_handle('reject'); }
