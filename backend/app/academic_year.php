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
