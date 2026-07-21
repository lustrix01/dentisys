<?php

declare(strict_types=1);

require_once __DIR__ . '/../../backend/app/bootstrap.php';

echo "=== Database Auth Integration Tests ===\n\n";

try {
    $config = app_config();
    $pdo = create_pdo($config);

    echo "--- Database Connection ---\n";
    $stmt = $pdo->query("SELECT VERSION()");
    $ver = $stmt->fetchColumn();
    if (!$ver) {
        fwrite(STDERR, "FAIL: Could not query database version.\n");
        exit(1);
    }
    echo "PASS: Connected to MySQL/MariaDB version $ver\n";

    echo "\n--- User Registration & Uniqueness ---\n";
    $testEmail = 'unit.test.' . time() . '@dentisys.edu';
    $password = 'TestPassword123!';
    $name = 'Unit Test User';
    $role = 'faculty';
    $status = 'Pending Approval';
    $hash = password_hash($password, PASSWORD_DEFAULT);

    $stmt = $pdo->prepare(
        "INSERT INTO user_accounts (login_email, password_hash, role, display_name, status, token_version)
         VALUES (?, ?, ?, ?, ?, 1)"
    );
    $stmt->execute([$testEmail, $hash, $role, $name, $status]);
    $userId = (int) $pdo->lastInsertId();

    if ($userId <= 0) {
        fwrite(STDERR, "FAIL: User insertion failed to return a valid ID.\n");
        exit(1);
    }
    echo "PASS: User created successfully with ID $userId\n";

    // Test password verification
    $stmt = $pdo->prepare("SELECT user_id, password_hash, role, status FROM user_accounts WHERE login_email = ?");
    $stmt->execute([$testEmail]);
    $user = $stmt->fetch();

    if (!$user) {
        fwrite(STDERR, "FAIL: Created user not found by email.\n");
        exit(1);
    }
    if (!password_verify($password, $user['password_hash'])) {
        fwrite(STDERR, "FAIL: Password verification failed for created user.\n");
        exit(1);
    }
    echo "PASS: Password verification succeeded\n";

    // Test duplicate email constraint
    try {
        $stmt = $pdo->prepare(
            "INSERT INTO user_accounts (login_email, password_hash, role, display_name, status, token_version)
             VALUES (?, ?, ?, ?, ?, 1)"
        );
        $stmt->execute([$testEmail, $hash, $role, $name, $status]);
        fwrite(STDERR, "FAIL: Duplicate email was accepted without error.\n");
        exit(1);
    } catch (\PDOException $e) {
        echo "PASS: Duplicate email correctly rejected by database unique constraint\n";
    }

    // Cleanup test user
    $pdo->exec("DELETE FROM user_accounts WHERE user_id = $userId");
    echo "PASS: Test user cleaned up successfully\n";

    echo "\n=== ALL DATABASE AUTH TESTS PASSED ===\n";
} catch (\Throwable $e) {
    fwrite(STDERR, "FAIL: Database test exception: " . $e->getMessage() . "\n");
    exit(1);
}
