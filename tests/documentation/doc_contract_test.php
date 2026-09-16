<?php

declare(strict_types=1);

function require_document(string $path, string $needle): void
{
    if (!is_file($path)) {
        fwrite(STDERR, "FAIL: Missing documentation file: {$path}\n");
        exit(1);
    }
    $content = file_get_contents($path);
    if ($content === false || !str_contains($content, $needle)) {
        fwrite(STDERR, "FAIL: Documentation contract not met by {$path}\n");
        exit(1);
    }
}

$root = dirname(__DIR__, 2);

require_document("{$root}/README.md", 'Docker-first');
require_document("{$root}/AGENTS.md", 'Docker Compose only');
require_document("{$root}/docs/README.md", 'Documentation');
require_document("{$root}/docs/development-environment.md", 'pgAdmin');
require_document("{$root}/docs/single-server.md", 'Same-Host');
require_document("{$root}/docs/roadmap.md", 'Google-only sign-in');
require_document("{$root}/docs/database/phase-2-migration-mapping.md", '006_remove_email_code_2fa.sql');
require_document("{$root}/docs/database/security-data-dictionary.md", 'student_account_user_id');
require_document("{$root}/docs/ias/module-a-identity-access.md", 'auth_assert_student_eligible');
require_document("{$root}/docs/requirements-traceability.md", 'P03 Student Identity and Authentication');

$migration = file_get_contents("{$root}/database/migrations/005_student_identity_authentication.sql");
if ($migration === false
    || preg_match('/UPDATE\s+students\s+SET\s+student_account_user_id\s*=\s*.*user_id/i', $migration)
    || !str_contains($migration, "CHECK (role IN ('admin', 'faculty', 'secretary', 'student'))")
    || !str_contains($migration, "'student_activation'")) {
    fwrite(STDERR, "FAIL: P03 migration contract is incomplete.\n");
    exit(1);
}

$migrations = glob("{$root}/database/migrations/*.sql") ?: [];
if (count($migrations) !== 5) {
    fwrite(STDERR, 'FAIL: Expected 5 active PostgreSQL migrations, found ' . count($migrations) . "\n");
    exit(1);
}
if (!in_array('005_student_identity_authentication.sql', array_map('basename', $migrations), true)) {
    fwrite(STDERR, "FAIL: P03 migration is not present.\n");
    exit(1);
}

echo "PASS: current documentation and migration contracts are present.\n";
