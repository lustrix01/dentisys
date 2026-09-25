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
