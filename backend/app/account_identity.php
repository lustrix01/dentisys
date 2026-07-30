<?php

declare(strict_types=1);

/**
 * Updates the canonical account identity. The helper joins an existing
 * transaction so role-specific profile data can be updated atomically.
 */
function update_account_identity(PDO $pdo, int $userId, string $displayName, string $loginEmail): bool
{
    $ownsTransaction = !$pdo->inTransaction();
    if ($ownsTransaction) {
        $pdo->beginTransaction();
    }

    try {
        $currentStmt = $pdo->prepare('SELECT login_email FROM user_accounts WHERE user_id = ? FOR UPDATE');
        $currentStmt->execute([$userId]);
        $currentEmail = $currentStmt->fetchColumn();
        if ($currentEmail === false) {
            throw new ChallengeException('Account was not found.');
        }

        $emailChanged = !hash_equals(mb_strtolower((string) $currentEmail), mb_strtolower($loginEmail));
        $update = $pdo->prepare(
            'UPDATE user_accounts SET display_name = ?, login_email = ? WHERE user_id = ?'
        );
        $update->execute([$displayName, $loginEmail, $userId]);

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
