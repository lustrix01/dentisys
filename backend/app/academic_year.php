<?php

declare(strict_types=1);

/**
 * Read the server-authoritative school year used by class eligibility rules.
 * The browser clock and request payload are never used as a substitute.
 */
function academic_current_school_year(PDO $pdo): string
{
    $stmt = $pdo->query(
        "SELECT setting_value
           FROM system_settings
          WHERE setting_key = 'academic.current_school_year'
          LIMIT 1"
    );
    $raw = $stmt->fetchColumn();
    $value = json_decode((string) $raw, true);
    if (is_array($value)) {
        $value = $value['schoolYear'] ?? $value['school_year'] ?? null;
    }
    $schoolYear = is_string($value) ? trim($value) : '';
    if ($schoolYear === '') {
        throw new RuntimeException('Authoritative current school year is not configured.');
    }

    return $schoolYear;
}

function academic_school_year_is_current(PDO $pdo, string $schoolYear): bool
{
    return strcasecmp(trim($schoolYear), academic_current_school_year($pdo)) === 0;
}

/**
 * School years use the fixed "YYYY-YYYY" format, so string order is year order.
 */
function academic_school_year_is_past(PDO $pdo, string $schoolYear): bool
{
    return strcmp(trim($schoolYear), academic_current_school_year($pdo)) < 0;
}

/**
 * Past school-year class sections are view-only; mutations must check this.
 */
function academic_class_section_is_past(PDO $pdo, int $csId): bool
{
    $stmt = $pdo->prepare('SELECT school_year FROM class_sections WHERE cs_id = ?');
    $stmt->execute([$csId]);
    $schoolYear = $stmt->fetchColumn();

    return is_string($schoolYear) && academic_school_year_is_past($pdo, $schoolYear);
}

function academic_require_current_school_year(PDO $pdo, string $schoolYear, string $field = 'schoolYear'): void
{
    if (!academic_school_year_is_current($pdo, $schoolYear)) {
        throw new ValidationException([
            [
                'field' => $field,
                'message' => 'Classes may be created only for the current school year.',
            ],
        ]);
    }
}

/**
 * Resolve a dashboard school-year filter from the query string.
 * Missing value => null (all school years; keeps older callers unchanged).
 * "current" => the server-authoritative current school year.
 * "all" => null. "YYYY-YYYY" => that school year.
 */
function academic_resolve_school_year_filter(PDO $pdo, mixed $raw): ?string
{
    $value = is_string($raw) ? trim($raw) : '';
    if ($value === '' || strtolower($value) === 'all') {
        return null;
    }
    if (strtolower($value) === 'current') {
        return academic_current_school_year($pdo);
    }
    if (preg_match('/^\d{4}-\d{4}$/', $value) !== 1) {
        throw new ValidationException([[
            'field' => 'schoolYear',
            'message' => 'School year must be "current", "all", or look like 2026-2027.',
        ]]);
    }
    return $value;
}

/** Sorted (newest first) unique school years for a filter dropdown, always including the current one. */
function academic_school_year_options(array $years, string $currentSchoolYear): array
{
    $clean = [];
    foreach ($years as $year) {
        $year = trim((string) $year);
        if ($year !== '' && !in_array($year, $clean, true)) {
            $clean[] = $year;
        }
    }
    if (!in_array($currentSchoolYear, $clean, true)) {
        $clean[] = $currentSchoolYear;
    }
    rsort($clean, SORT_STRING);
    return $clean;
}

/** Canonical Dean/catalog semester; class sections retain their uppercase code. */
function academic_term_semester(?string $value): ?string
{
    $value = strtoupper(trim($value ?? ''));
    if (str_contains($value, '1ST') || str_contains($value, 'FIRST')) return '1ST';
    if (str_contains($value, '2ND') || str_contains($value, 'SECOND')) return '2ND';
    return str_contains($value, 'SUMMER') ? 'Summer' : null;
}

/** Serialize term edits, class creation and enrollment finalization in PostgreSQL. */
function academic_terms_lock(PDO $pdo): void
{
    $pdo->query('SELECT pg_advisory_xact_lock(20261010, 2)');
}

function academic_terms_read(PDO $pdo): array
{
    return $pdo->query('SELECT * FROM academic_terms ORDER BY school_year DESC, start_date, id')->fetchAll(PDO::FETCH_ASSOC);
}

/** The single resolution rule: Dean dates replace both dates, never just one. */
function academic_resolve_class_term_dates(array $class, array $terms): array
{
    $semester = academic_term_semester($class['semester'] ?? null);
    foreach ($terms as $term) {
        if ($term['school_year'] === $class['school_year'] && $term['semester'] === $semester) {
            return ['termId' => (int) $term['id'], 'startDate' => $term['start_date'], 'endDate' => $term['end_date']];
        }
    }
    return ['termId' => null, 'startDate' => $class['term_start_date'] ?? null, 'endDate' => $class['term_end_date'] ?? null];
}

function academic_student_term_dates(PDO $pdo, int $studentId, ?array $terms = null): array
{
    $stmt = $pdo->prepare("SELECT cs.cs_id, cs.school_year, cs.semester, cs.term_start_date, cs.term_end_date
        FROM enrollments e JOIN class_sections cs ON cs.cs_id = e.cs_id
        WHERE e.student_id = ? AND LOWER(e.status) = 'active' AND LOWER(cs.status) = 'active'
        ORDER BY cs.school_year DESC, cs.semester, cs.cs_id");
    $stmt->execute([$studentId]);
    $terms ??= academic_terms_read($pdo);
    return array_map(static fn(array $class): array => $class + academic_resolve_class_term_dates($class, $terms), $stmt->fetchAll(PDO::FETCH_ASSOC));
}

function academic_latest_term_end(array $classes): ?array
{
    $latest = null;
    foreach ($classes as $class) {
        if ($class['endDate'] !== null && ($latest === null || $class['endDate'] > $latest['endDate'])) $latest = $class;
    }
    return $latest;
}

function academic_term_validate(array $data, array $terms, ?int $id = null): array
{
    $errors = [];
    $year = is_string($data['schoolYear'] ?? null) ? trim($data['schoolYear']) : '';
    $semester = $data['semester'] ?? null;
    if (!preg_match('/^([0-9]{4})-([0-9]{4})$/', $year, $parts) || (int) $parts[2] !== (int) $parts[1] + 1) {
        $errors[] = ['field' => 'schoolYear', 'message' => 'Use consecutive years, for example 2026-2027.'];
    }
    if (!in_array($semester, ['1ST', '2ND', 'Summer'], true)) $errors[] = ['field' => 'semester', 'message' => 'Choose 1ST, 2ND, or Summer.'];
    $dates = [];
    foreach (['startDate', 'endDate'] as $field) {
        $value = is_string($data[$field] ?? null) ? $data[$field] : '';
        $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value, new DateTimeZone('Asia/Manila'));
        if (!$date || $date->format('Y-m-d') !== $value) $errors[] = ['field' => $field, 'message' => 'Enter a valid calendar date.'];
        $dates[$field] = $value;
    }
    if ($errors === [] && $dates['endDate'] <= $dates['startDate']) $errors[] = ['field' => 'endDate', 'message' => 'End date must be after start date.'];
    if ($errors === []) {
        foreach ($terms as $term) {
            if ((int) $term['id'] === $id || $term['school_year'] !== $year) continue;
            if ($term['semester'] === $semester) $errors[] = ['field' => 'semester', 'message' => 'This school year and semester already has dates.'];
            if ($dates['startDate'] <= $term['end_date'] && $dates['endDate'] >= $term['start_date']) {
                $errors[] = ['field' => 'startDate', 'message' => 'Dates overlap another term in this school year.'];
            }
        }
    }
    if ($errors !== []) throw new ValidationException($errors);
    return ['school_year' => $year, 'semester' => $semester, 'start_date' => $dates['startDate'], 'end_date' => $dates['endDate']];
}

function academic_term_shift_year(string $date): string
{
    [$year, $month, $day] = array_map('intval', explode('-', $date));
    $year++;
    if (!checkdate($month, $day, $year)) $day = 28; // Owner: Feb 29 becomes Feb 28.
    return sprintf('%04d-%02d-%02d', $year, $month, $day);
}

function academic_term_class_count(PDO $pdo, array $term): int
{
    $stmt = $pdo->prepare('SELECT semester FROM class_sections WHERE school_year = ?');
    $stmt->execute([$term['school_year']]);
    return count(array_filter($stmt->fetchAll(PDO::FETCH_COLUMN), static fn(string $semester): bool => academic_term_semester($semester) === $term['semester']));
}

function academic_terms_list(PDO $pdo): array
{
    $terms = academic_terms_read($pdo);
    $rows = [];
    foreach ($terms as $term) {
        $key = $term['school_year'] . ':' . $term['semester'];
        $rows[$key] = ['id' => (int) $term['id'], 'schoolYear' => $term['school_year'], 'semester' => $term['semester'],
            'startDate' => $term['start_date'], 'endDate' => $term['end_date'], 'classCount' => 0];
    }
    foreach ($pdo->query('SELECT school_year, semester FROM class_sections')->fetchAll(PDO::FETCH_ASSOC) as $class) {
        $semester = academic_term_semester($class['semester']);
        if ($semester === null) continue;
        $key = $class['school_year'] . ':' . $semester;
        $rows[$key] ??= ['id' => null, 'schoolYear' => $class['school_year'], 'semester' => $semester,
            'startDate' => null, 'endDate' => null, 'classCount' => 0];
        $rows[$key]['classCount']++;
    }
    $rows = array_values($rows);
    $order = ['1ST' => 0, '2ND' => 1, 'Summer' => 2];
    usort($rows, static fn(array $a, array $b): int => strcmp($b['schoolYear'], $a['schoolYear']) ?: $order[$a['semester']] <=> $order[$b['semester']]);
    return $rows;
}

/** Find unexpired enrollments for Students with an active class in this term.
 * Keep the original source association after class membership changes too.
 * No class rows or biometric material are rewritten.
 */
function academic_term_affected_profiles(PDO $pdo, array $term, array $terms, string $today): array
{
    $stmt = $pdo->prepare("SELECT * FROM biometric_profiles WHERE enrollment_status IN ('active', 'enrolling')
        AND reference_expires_on >= ? ORDER BY profile_id FOR UPDATE");
    $stmt->execute([$today]);
    $profiles = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $profile) {
        $matches = isset($term['id']) && (int) ($profile['reference_term_id'] ?? 0) === (int) $term['id'];
        $classes = academic_student_term_dates($pdo, (int) $profile['student_id'], $terms);
        foreach ($classes as $class) {
            if ($class['school_year'] === $term['school_year'] && academic_term_semester($class['semester']) === $term['semester']) $matches = true;
        }
        if ($matches) $profiles[] = $profile;
    }
    return $profiles;
}

/** Call inside a transaction after taking academic_terms_lock. */
function academic_term_save(PDO $pdo, array $config, array $actor, array $data, bool $preview = false): array
{
    $terms = academic_terms_read($pdo);
    $id = isset($data['id']) ? (int) $data['id'] : null;
    $old = null;
    foreach ($terms as $term) if ((int) $term['id'] === $id) $old = $term;
    if ($id !== null && $old === null) throw new ValidationException([['field' => 'id', 'message' => 'Academic term no longer exists. Reload Settings.']]);
    if ($old !== null && (($data['schoolYear'] ?? '') !== $old['school_year'] || ($data['semester'] ?? '') !== $old['semester'])) {
        throw new ValidationException([['field' => 'semester', 'message' => 'A term identity cannot be changed. Edit its dates instead.']]);
    }
    $term = academic_term_validate($data, $terms, $id);
    $today = app_local_date($config, attendance_session_now_utc());
    $profiles = ($old === null || $old['start_date'] !== $term['start_date'] || $old['end_date'] !== $term['end_date'])
        ? academic_term_affected_profiles($pdo, $old ?? $term, $terms, $today) : [];
    $prospectiveTerms = array_values(array_filter($terms, static fn(array $row): bool => (int) $row['id'] !== $id));
    $prospectiveTerms[] = $term + ['id' => $id ?? 0];
    $expiring = 0;
    foreach ($profiles as $profile) {
        $latest = academic_latest_term_end(academic_student_term_dates($pdo, (int) $profile['student_id'], $prospectiveTerms));
        if (($latest['endDate'] ?? $term['end_date']) < $today) $expiring++;
    }
    $confirmationRequired = ($old !== null || $profiles !== []) && ($old === null || $old['end_date'] !== $term['end_date']) && $term['end_date'] < $today;
    if ($preview) return ['confirmationRequired' => $confirmationRequired, 'expiringEnrollments' => $expiring];
    if ($confirmationRequired && ($data['confirmedExpiringEnrollments'] ?? null) !== $expiring) {
        return ['confirmationRequired' => true, 'expiringEnrollments' => $expiring];
    }
    if ($old === null) {
        $stmt = $pdo->prepare('INSERT INTO academic_terms (school_year, semester, start_date, end_date, created_by_user_id, updated_by_user_id) VALUES (?, ?, ?, ?, ?, ?) RETURNING id');
        $stmt->execute([$term['school_year'], $term['semester'], $term['start_date'], $term['end_date'], $actor['user_id'], $actor['user_id']]);
        $id = (int) $stmt->fetchColumn();
    } else {
        $stmt = $pdo->prepare('UPDATE academic_terms SET start_date = ?, end_date = ?, updated_by_user_id = ?, updated_at = CURRENT_TIMESTAMP(6) WHERE id = ?');
        $stmt->execute([$term['start_date'], $term['end_date'], $actor['user_id'], $id]);
    }
    $newTerms = academic_terms_read($pdo);
    foreach ($profiles as $profile) {
        $latest = academic_latest_term_end(academic_student_term_dates($pdo, (int) $profile['student_id'], $newTerms));
        $update = $pdo->prepare('UPDATE biometric_profiles SET reference_expires_on = ?, reference_term_id = ?, reference_cs_id = ?, updated_at = CURRENT_TIMESTAMP(6) WHERE profile_id = ?');
        $update->execute([$latest['endDate'] ?? $term['end_date'], $latest !== null ? $latest['termId'] : $id, $latest['cs_id'] ?? $profile['reference_cs_id'], $profile['profile_id']]);
    }
    audit_record_action($pdo, $config, $actor, 'settings', $old === null ? 'academic_term_created' : 'academic_term_updated', 'academic_term', (string) $id,
        'Set dates for ' . $term['semester'] . ' ' . $term['school_year'] . '.', ['before' => $old, 'after' => $term + ['id' => $id, 'updatedEnrollments' => count($profiles)]]);
    return ['id' => $id, 'updatedEnrollments' => count($profiles), 'confirmationRequired' => false];
}

function academic_term_delete(PDO $pdo, array $config, array $actor, int $id): void
{
    $stmt = $pdo->prepare('SELECT * FROM academic_terms WHERE id = ?');
    $stmt->execute([$id]);
    $term = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$term) throw new ValidationException([['field' => 'id', 'message' => 'Academic term no longer exists.']]);
    if (academic_term_class_count($pdo, $term) > 0) throw new ValidationException([['field' => 'id', 'message' => 'A term used by a class cannot be deleted.']]);
    $pdo->prepare('DELETE FROM academic_terms WHERE id = ?')->execute([$id]);
    audit_record_action($pdo, $config, $actor, 'settings', 'academic_term_deleted', 'academic_term', (string) $id,
        'Deleted unused term ' . $term['semester'] . ' ' . $term['school_year'] . '.', ['before' => $term]);
}

function academic_terms_copy_year(PDO $pdo, array $config, array $actor): array
{
    $terms = academic_terms_read($pdo);
    if ($terms === []) throw new ValidationException([['field' => 'schoolYear', 'message' => 'Add a school year before copying its terms.']]);
    $sourceYear = $terms[0]['school_year'];
    [$first, $second] = array_map('intval', explode('-', $sourceYear));
    $nextYear = ($first + 1) . '-' . ($second + 1);
    $created = 0;
    foreach ($terms as $term) {
        if ($term['school_year'] !== $sourceYear) continue;
        $exists = array_filter($terms, static fn(array $row): bool => $row['school_year'] === $nextYear && $row['semester'] === $term['semester']);
        if ($exists !== []) continue;
        $saved = academic_term_save($pdo, $config, $actor, ['schoolYear' => $nextYear, 'semester' => $term['semester'],
            'startDate' => academic_term_shift_year($term['start_date']), 'endDate' => academic_term_shift_year($term['end_date'])]);
        if ($saved['confirmationRequired']) {
            throw new ValidationException([['field' => 'endDate', 'message' => 'Copied dates would expire enrollments. Set this term individually to review and confirm its dates.']]);
        }
        $created++;
    }
    audit_record_action($pdo, $config, $actor, 'settings', 'academic_terms_copied', 'academic_term', null,
        'Copied terms from ' . $sourceYear . ' to ' . $nextYear . '.', ['after' => ['schoolYear' => $nextYear, 'created' => $created]]);
    return ['schoolYear' => $nextYear, 'created' => $created];
}

function academic_next_term_reminder(array $terms, string $today): ?array
{
    foreach ($terms as $term) {
        if ($term['start_date'] > $today || $term['end_date'] < $today || $term['end_date'] > (new DateTimeImmutable($today))->modify('+14 days')->format('Y-m-d')) continue;
        $year = $term['school_year'];
        $semester = match ($term['semester']) { '1ST' => '2ND', '2ND' => 'Summer', default => '1ST' };
        if ($term['semester'] === 'Summer') {
            [$first, $second] = array_map('intval', explode('-', $year));
            $year = ($first + 1) . '-' . ($second + 1);
        }
        foreach ($terms as $next) if ($next['school_year'] === $year && $next['semester'] === $semester) continue 2;
        return ['semester' => $semester, 'schoolYear' => $year, 'endDate' => $term['end_date']];
    }
    return null;
}

function academic_term_for_class_create(PDO $pdo, array $data): array
{
    $terms = academic_terms_read($pdo);
    foreach ($terms as $term) {
        $matches = isset($data['academicTermId'])
            ? (int) $data['academicTermId'] === (int) $term['id']
            : ($data['schoolYear'] ?? '') === $term['school_year'] && academic_term_semester($data['semester'] ?? null) === $term['semester'];
        if ($matches) {
            academic_require_current_school_year($pdo, $term['school_year']);
            return $term;
        }
    }
    throw new ValidationException([['field' => 'academicTermId', 'message' => 'Choose a Dean-defined term for the current school year. Ask the Dean to set its dates.']]);
}
