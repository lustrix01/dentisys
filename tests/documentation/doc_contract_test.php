<?php

declare(strict_types=1);

function require_nonempty_file(string $path): void
{
    if (!is_file($path)) {
        fwrite(STDERR, "FAIL: Missing required file: {$path}\n");
        exit(1);
    }
    $content = file_get_contents($path);
    if ($content === false || trim($content) === '') {
        fwrite(STDERR, "FAIL: Required file is empty: {$path}\n");
        exit(1);
    }
}

$root = dirname(__DIR__, 2);

foreach ([
    "{$root}/README.md",
    "{$root}/AGENTS.md",
    "{$root}/spec.md",
    "{$root}/docs/README.md",
    "{$root}/docs/features.md",
    "{$root}/docs/roadmap.md",
    "{$root}/database/README.md",
] as $path) {
    require_nonempty_file($path);
}

$migrations = glob("{$root}/database/migrations/*.sql") ?: [];
if ($migrations === []) {
    fwrite(STDERR, "FAIL: No active PostgreSQL migrations found.\n");
    exit(1);
}

$prefixes = [];
foreach ($migrations as $migration) {
    $name = basename($migration);
    if (!preg_match('/^(\d{3})_[a-z0-9_]+\.sql$/', $name, $matches)) {
        fwrite(STDERR, "FAIL: Invalid active migration filename: {$name}\n");
        exit(1);
    }
    if (isset($prefixes[$matches[1]])) {
        fwrite(STDERR, "FAIL: Duplicate active migration prefix: {$matches[1]}\n");
        exit(1);
    }
    $prefixes[$matches[1]] = true;
}

echo "PASS: current documentation entry points and migration conventions are present.\n";
