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

$migrations = glob("{$root}/database/migrations/*.sql") ?: [];
if (count($migrations) !== 4) {
    fwrite(STDERR, 'FAIL: Expected 4 active PostgreSQL migrations, found ' . count($migrations) . "\n");
    exit(1);
}

echo "PASS: current documentation and migration contracts are present.\n";
