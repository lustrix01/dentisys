<?php

declare(strict_types=1);

function assert_contains(string $needle, string $haystack, string $label): void
{
    if (!str_contains($haystack, $needle)) {
        fwrite(STDERR, "FAIL: $label - missing: $needle\n");
        exit(1);
    }
    echo "PASS: $label\n";
}

function assert_not_contains(string $needle, string $haystack, string $label): void
{
    if (str_contains($haystack, $needle)) {
        fwrite(STDERR, "FAIL: $label - found prohibited: $needle\n");
        exit(1);
    }
    echo "PASS: $label\n";
}

function assert_same(mixed $expected, mixed $actual, string $label): void
{
    if ($expected !== $actual) {
        fwrite(STDERR, "FAIL: $label\nExpected: " . var_export($expected, true) . "\nActual: " . var_export($actual, true) . "\n");
        exit(1);
    }
    echo "PASS: $label\n";
}

function assert_present(string $path, string $label): string
{
    if (!file_exists($path)) {
        fwrite(STDERR, "FAIL: $label - file not found: $path\n");
        exit(1);
    }
    $content = file_get_contents($path);
    if ($content === false) {
        fwrite(STDERR, "FAIL: $label - cannot read: $path\n");
        exit(1);
    }
    echo "PASS: $label - file exists\n";
    return $content;
}

echo "=== DentiSys Phase 2 Documentation Contract Test ===\n\n";
$repo_root = dirname(__DIR__, 2);

echo "--- Baseline migration count ---\n";
$migrationDir = "$repo_root/database/migrations";
$activeFiles = glob("$migrationDir/*.sql");
$archiveFiles = glob("$migrationDir/archive/*.sql");
$activeCount = count($activeFiles);
$archiveCount = count($archiveFiles);
echo "Active SQL files: $activeCount\n";
echo "Archived SQL files: $archiveCount\n";
if ($activeCount !== 3) { fwrite(STDERR, "FAIL: expected 3 active migration files, found $activeCount\n"); exit(1); }
if ($archiveCount !== 80) { fwrite(STDERR, "FAIL: expected 80 archived migration files, found $archiveCount\n"); exit(1); }
echo "PASS: 3 active + 80 archived = 83 total SQL files\n";

echo "\n--- Phase 2 migration mapping ---\n";
$phase2 = assert_present("$repo_root/docs/database/phase-2-migration-mapping.md", 'Phase 2 mapping document');
assert_contains('15 application tables', $phase2, 'Phase 2 document states 15 application tables');
assert_contains('16 total physical tables', $phase2, 'Phase 2 document states 16 total physical tables');

echo "\n--- ERD document ---\n";
$erd = assert_present("$repo_root/docs/database/erd-target-integrated.md", 'ERD document');
assert_contains('15 application tables', $erd, 'ERD states 15 application tables');

echo "\n--- Security data dictionary ---\n";
$dict = assert_present("$repo_root/docs/database/security-data-dictionary.md", 'Security data dictionary');
assert_contains('security_tokens', $dict, 'Dictionary covers security_tokens');
assert_contains('audit_events', $dict, 'Dictionary covers audit_events');
assert_contains('before_state_json', $dict, 'Dictionary covers before_state_json');

echo "\n--- IAS Module A ---\n";
$module_a = assert_present("$repo_root/docs/ias/module-a-identity-access.md", 'Module A document');
assert_contains('# IAS Module A', $module_a, 'Module A heading');
assert_contains('## TOTP', $module_a, 'TOTP flow section');
assert_contains('## Complete RBAC', $module_a, 'RBAC matrix section');
assert_contains('125', $module_a, '125 RBAC rows');
assert_contains('challenge', $module_a, 'Challenge token section');
assert_contains('5-minute', $module_a, 'Challenge 5-minute lifetime');

echo "\n--- IAS Module C ---\n";
$module_c = assert_present("$repo_root/docs/ias/module-c-perimeter-defense.md", 'Module C document');
assert_contains('# IAS Module C', $module_c, 'Module C heading');
assert_contains('## Endpoint', $module_c, 'Endpoint control section');
assert_contains('## Extended ACL', $module_c, 'ACL rules section');
assert_contains('## OWASP', $module_c, 'OWASP rationale section');
assert_contains('deny ip any any log', $module_c, 'Final deny rule');
assert_contains('host', $module_c, 'Cisco host keyword');

echo "\n--- Moving average for historical integrity ---\n";
$all_migration_files = glob("$migrationDir/archive/0*.sql") ?: [];
assert_same(80, count($all_migration_files), '80 historical migration files still present in archive');

echo "\n--- Requirements traceability ---\n";
$rtm = assert_present("$repo_root/docs/requirements-traceability.md", 'RTM document');
assert_contains('16 total physical tables', $rtm, 'RTM states 16 total physical tables');
assert_contains('15 application tables', $rtm, 'RTM states 15 application tables');
assert_contains('125', $rtm, 'RTM references 125 RBAC rows');

echo "\n--- Secret safety (docs) ---\n";
$ias_dir = "$repo_root/docs/ias";
$ias_files = glob("$ias_dir/*.md");
$doc_files = array_merge(
    glob("$repo_root/docs/database/*.md") ?: [],
    $ias_files ?: [],
    ["$repo_root/docs/architecture.md", "$repo_root/docs/phase-0-roadmap.md"]
);

$prohibited_patterns = [
    '/password\s*[=:]\s*[\'"][^\'"]{3,}[\'"]/i',
    '/secret\s*[=:]\s*[\'"][a-zA-Z0-9]{8,}[\'"]/i',
    '/token\s*[=:]\s*[\'"][a-zA-Z0-9]{8,}[\'"]/i',
    '/api[_]?key\s*[=:]\s*[\'"][^\'"]{3,}[\'"]/i',
    '/private[_]?key/i',
];

foreach ($doc_files as $doc_file) {
    if (!file_exists($doc_file)) continue;
    $content = file_get_contents($doc_file);
    foreach ($prohibited_patterns as $pattern) {
        if (preg_match($pattern, $content)) {
            fwrite(STDERR, "FAIL: Secret-like pattern found in " . basename($doc_file) . "\n");
            exit(1);
        }
    }
}
echo "PASS: No raw secret examples in documentation\n";

echo "\n=== ALL PHASE 2 DOCUMENTATION CONTRACT TESTS PASSED ===\n";
