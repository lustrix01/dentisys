<?php

declare(strict_types=1);

/**
 * Updates the canonical account identity. The helper joins an existing
 * transaction so role-specific profile data can be updated atomically.
 */
function account_identity_name_parts(array $data): ?array
{
    if (!array_intersect(['prefix', 'firstName', 'middleName', 'lastName', 'suffix'], array_keys($data))) return null;
    return [
        'prefix' => validate_optional_name_affix($data, 'prefix'),
        'firstName' => validate_person_name($data, 'firstName', 2, 100),
        // A middle initial ("M" or "M.") is allowed.
        'middleName' => validate_optional_person_name($data, 'middleName', 1, 100),
        'lastName' => validate_person_name($data, 'lastName', 2, 100),
        'suffix' => validate_optional_name_affix($data, 'suffix'),
    ];
}

function account_identity_composed_name(array $parts): string
{
    return implode(' ', array_filter([$parts['prefix'], $parts['firstName'], $parts['middleName'], $parts['lastName'], $parts['suffix']], static fn($part) => $part !== null && $part !== ''));
}

function account_identity_profile_parts(array $row): array
{
    // Callers that join person_identities expose canonical_* aliases. Keep
    // the role-table fallback for callers that have not yet been migrated.
    return [
        'prefix' => $row['canonical_name_prefix'] ?? $row['name_prefix'] ?? '',
        'firstName' => $row['canonical_first_name'] ?? $row['first_name'] ?? '',
        'middleName' => $row['canonical_middle_name'] ?? $row['middle_name'] ?? '',
        'lastName' => $row['canonical_last_name'] ?? $row['last_name'] ?? '',
        'suffix' => $row['canonical_name_suffix'] ?? $row['name_suffix'] ?? '',
    ];
}

function account_identity_display_name(array $row): string
{
    $parts = account_identity_profile_parts($row);
    $composed = account_identity_composed_name($parts);
    if ($composed !== '') {
        return $composed;
    }

    // Legacy unsplit names are shown as stored; re-casing breaks degrees such as "DMD, PhD".
    return trim((string) (preg_replace('/\s+/u', ' ', (string) ($row['display_name'] ?? '')) ?? ''));
}

function account_identity_fetch(PDO $pdo, int $userId, bool $forUpdate = false): ?array
{
    $sql =
        'SELECT ua.user_id, ua.person_id, ua.login_email, ua.display_name, ua.role, ua.status,
                ua.title, ua.theme,
                pi.name_prefix AS canonical_name_prefix,
                pi.first_name AS canonical_first_name,
                pi.middle_name AS canonical_middle_name,
                pi.last_name AS canonical_last_name,
                pi.name_suffix AS canonical_name_suffix
           FROM user_accounts ua
           JOIN person_identities pi ON pi.person_id = ua.person_id
          WHERE ua.user_id = ?';
    if ($forUpdate) {
        $sql .= ' FOR UPDATE OF ua, pi';
    }
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$userId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row === false ? null : $row;
}

function account_identity_require_same_person(
    ?int $accountPersonId,
    ?int $recordPersonId,
    string $message = 'The account and canonical record do not share the same person identity.'
): void {
    if ($accountPersonId === null || $recordPersonId === null || $accountPersonId !== $recordPersonId) {
        throw new DomainException($message);
    }
}

function account_identity_parts_match(mixed $actual, mixed $expected): bool
{
    $actualValue = $actual === null ? '' : trim((string) $actual);
    $expectedValue = $expected === null ? '' : trim((string) $expected);
    return $actualValue === $expectedValue;
}

/**
 * Persist a composed structured name on person_identities and refresh the
 * role-table compatibility copies only after every linked copy is consistent.
 * A conflicting legacy copy is left untouched and requires reconciliation.
 */
function account_identity_sync_canonical_person(PDO $pdo, int $personId, array $parts): void
{
    $canonicalStmt = $pdo->prepare(
        'SELECT name_prefix, first_name, middle_name, last_name, name_suffix
           FROM person_identities
          WHERE person_id = ?
          FOR UPDATE'
    );
    $canonicalStmt->execute([$personId]);
    $canonical = $canonicalStmt->fetch(PDO::FETCH_ASSOC);
    if (!is_array($canonical)) {
        throw new DomainException('Canonical person identity is unavailable.');
    }

    $fields = [
        'name_prefix' => $parts['prefix'] ?? null,
        'first_name' => $parts['firstName'] ?? null,
        'middle_name' => $parts['middleName'] ?? null,
        'last_name' => $parts['lastName'] ?? null,
        'name_suffix' => $parts['suffix'] ?? null,
    ];
    $legacyQueries = [
        'SELECT user_id AS record_id, name_prefix, first_name, middle_name, last_name, name_suffix
           FROM user_accounts
          WHERE person_id = ?
          FOR UPDATE',
        'SELECT student_id AS record_id, name_prefix, first_name, middle_name, last_name, name_suffix
           FROM students
          WHERE person_id = ?
          FOR UPDATE',
    ];
    foreach ($legacyQueries as $query) {
        $stmt = $pdo->prepare($query);
        $stmt->execute([$personId]);
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $legacy) {
            foreach ($fields as $field => $expected) {
                $legacyValue = $legacy[$field] ?? null;
                if ($legacyValue !== null
                    && trim((string) $legacyValue) !== ''
                    && !account_identity_parts_match($legacyValue, $canonical[$field] ?? null)) {
                    throw new DomainException(
                        'A preserved role identity conflicts with the canonical person; manual reconciliation is required.'
                    );
                }
            }
        }
    }

    $updatePerson = $pdo->prepare(
        'UPDATE person_identities
            SET name_prefix = ?, first_name = ?, middle_name = ?, last_name = ?, name_suffix = ?,
                updated_at = CURRENT_TIMESTAMP(6)
          WHERE person_id = ?'
    );
    $updatePerson->execute([
        $fields['name_prefix'], $fields['first_name'], $fields['middle_name'],
        $fields['last_name'], $fields['name_suffix'], $personId,
    ]);

    $updateAccounts = $pdo->prepare(
        'UPDATE user_accounts
            SET display_name = ?, name_prefix = ?, first_name = ?, middle_name = ?, last_name = ?, name_suffix = ?,
                updated_at = CURRENT_TIMESTAMP(6)
          WHERE person_id = ?'
    );
    $updateAccounts->execute([
        account_identity_composed_name($parts), $fields['name_prefix'], $fields['first_name'],
        $fields['middle_name'], $fields['last_name'], $fields['name_suffix'], $personId,
    ]);

    $updateStudents = $pdo->prepare(
        'UPDATE students
            SET name_prefix = ?, first_name = ?, middle_name = ?, last_name = ?, name_suffix = ?,
                updated_at = CURRENT_TIMESTAMP(6)
          WHERE person_id = ?'
    );
    $updateStudents->execute([
        $fields['name_prefix'], $fields['first_name'], $fields['middle_name'],
        $fields['last_name'], $fields['name_suffix'], $personId,
    ]);
}

/**
 * Update a user's own name. The login email is permanent after activation
 * (REG-009): pass null to keep it; a different email is rejected.
 */
function update_account_identity(PDO $pdo, int $userId, string $displayName, ?string $loginEmail, ?array $nameParts = null): bool
{
    $ownsTransaction = !$pdo->inTransaction();
    if ($ownsTransaction) {
        $pdo->beginTransaction();
    }

    try {
        $currentStmt = $pdo->prepare(
            'SELECT ua.login_email, ua.display_name, ua.name_prefix, ua.first_name,
                    ua.middle_name, ua.last_name, ua.name_suffix, ua.person_id,
                    pi.name_prefix AS canonical_name_prefix,
                    pi.first_name AS canonical_first_name,
                    pi.middle_name AS canonical_middle_name,
                    pi.last_name AS canonical_last_name,
                    pi.name_suffix AS canonical_name_suffix
               FROM user_accounts ua
               JOIN person_identities pi ON pi.person_id = ua.person_id
              WHERE ua.user_id = ?
              FOR UPDATE'
        );
        $currentStmt->execute([$userId]);
        $current = $currentStmt->fetch(PDO::FETCH_ASSOC);
        if ($current === false) {
            throw new ChallengeException('Account was not found.');
        }
        $currentEmail = $current['login_email'];
        if ($nameParts === null && $displayName !== account_identity_display_name($current)) {
            throw new ValidationException([['field' => 'firstName', 'message' => 'Use the separate name fields to change your name.']]);
        }

        $loginEmail ??= (string) $currentEmail;
        if (!hash_equals(mb_strtolower((string) $currentEmail), mb_strtolower($loginEmail))) {
            throw new ValidationException([[
                'field' => 'email',
                'message' => 'Your login email cannot be changed. Contact the Dean if it is wrong.',
            ]]);
        }
        $emailChanged = false;
        if ($nameParts !== null) {
            account_identity_sync_canonical_person($pdo, (int) ($current['person_id'] ?? 0), $nameParts);
            $displayName = account_identity_composed_name($nameParts);
        }
        $update = $pdo->prepare(
            'UPDATE user_accounts SET display_name = ? WHERE user_id = ?'
        );
        $update->execute([$displayName, $userId]);

        if ($ownsTransaction) {
            $pdo->commit();
        }
        return $emailChanged;
    } catch (Throwable $e) {
        if ($ownsTransaction && $pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }
}

/** Human label for an account role in role-conflict messages. */
function account_identity_role_label(string $role): string
{
    return match ($role) {
        'admin' => 'Dean (Administrator)',
        'faculty' => 'Faculty',
        'secretary' => 'Class Secretary',
        'student' => 'Student',
        default => ucfirst($role),
    };
}

/**
 * One person keeps one kind of DentiSys identity: a Student (who may also be
 * appointed Class Secretary) or a staff member (Faculty or the Dean). Returns
 * a message when $email already belongs to an identity that cannot take the
 * $intendedRole, or null when it is allowed.
 *
 *  - 'student'   : the email must not belong to a Faculty or Dean account.
 *  - 'secretary' : same as student (a Class Secretary is an appointed Student).
 *  - 'faculty'   : the email must not belong to a Student record, a Student or
 *                  Class Secretary account, or the Dean.
 */
function account_identity_email_role_conflict(PDO $pdo, string $email, string $intendedRole, ?int $ignoreUserId = null): ?string
{
    $email = trim($email);
    if ($email === '') {
        return null;
    }
    $accountStmt = $pdo->prepare(
        'SELECT user_id, role FROM user_accounts WHERE lower(login_email) = lower(?) ORDER BY user_id'
    );
    $accountStmt->execute([$email]);
    $staffRoles = ['admin', 'faculty'];
    foreach ($accountStmt->fetchAll(PDO::FETCH_ASSOC) as $account) {
        if ($ignoreUserId !== null && (int) $account['user_id'] === $ignoreUserId) {
            continue;
        }
        $role = (string) $account['role'];
        if (in_array($intendedRole, ['student', 'secretary'], true) && in_array($role, $staffRoles, true)) {
            return sprintf(
                '%s belongs to a %s account and cannot be used for a Student or Class Secretary.',
                $email,
                account_identity_role_label($role)
            );
        }
        if ($intendedRole === 'faculty' && $role !== 'faculty') {
            return sprintf(
                '%s belongs to a %s account and cannot be invited as Faculty.',
                $email,
                account_identity_role_label($role)
            );
        }
    }
    if ($intendedRole === 'faculty') {
        $studentStmt = $pdo->prepare('SELECT 1 FROM students WHERE lower(bu_email) = lower(?) LIMIT 1');
        $studentStmt->execute([$email]);
        if ($studentStmt->fetchColumn() !== false) {
            return sprintf('%s belongs to a Student and cannot be invited as Faculty.', $email);
        }
    }
    return null;
}
