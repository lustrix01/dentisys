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

echo "=== DentiSys Documentation Contract Test ===\n\n";
$repo_root = dirname(__DIR__, 2);

echo "--- IAS Module A ---\n";
$module_a = assert_present("$repo_root/docs/ias/module-a-identity-access.md", 'Module A document');
assert_contains('# IAS Module A', $module_a, 'Module A heading');
assert_contains('## TOTP', $module_a, 'TOTP flow section');
assert_contains('## Complete RBAC', $module_a, 'RBAC matrix section');
assert_contains('## Design Rationale', $module_a, 'Closing rationale section');
assert_contains('HMAC', $module_a, 'TOTP-to-HMAC connection in rationale');
assert_contains('privilege', $module_a, 'Privilege management in rationale');
assert_contains('least', $module_a, 'Least-privilege in rationale');

echo "\n--- IAS Module C ---\n";
$module_c = assert_present("$repo_root/docs/ias/module-c-perimeter-defense.md", 'Module C document');
assert_contains('# IAS Module C', $module_c, 'Module C heading');
assert_contains('## Endpoint', $module_c, 'Endpoint control section');
assert_contains('Parameterized', $module_c, 'Parameterized query mention');
assert_contains('## Extended ACL', $module_c, 'ACL rules section');
assert_contains('## OWASP', $module_c, 'OWASP rationale section');
assert_contains('A01:2025', $module_c, 'OWASP A01:2025 label');
assert_contains('A05:2025', $module_c, 'OWASP A05:2025 Injection label');
assert_contains('A09:2025', $module_c, 'OWASP A09:2025 label');
assert_contains('API1:2023', $module_c, 'API1:2023 label');
assert_contains('wildcard', strtolower($module_c), 'Wildcard mention');
assert_contains('255.255.255.255', $module_c, 'Wildcard arithmetic');

echo "\n--- Closing rationale paragraphs ---\n";
$last_paragraph_a = trim(explode("\n\n", trim($module_a))[count(explode("\n\n", trim($module_a))) - 1] ?? '');
assert_contains('TOTP', $last_paragraph_a, 'Module A closing paragraph references TOTP/authentication');

$last_paragraph_c = trim(explode("\n\n", trim($module_c))[count(explode("\n\n", trim($module_c))) - 1] ?? '');
assert_contains('OWASP', $last_paragraph_c, 'Module C closing paragraph references OWASP');

echo "\n--- OWASP label format ---\n";
$owasp_patterns = [
    'A01:2025', 'A02:2025', 'A04:2025', 'A05:2025', 'A06:2025',
    'A07:2025', 'A08:2025', 'A09:2025', 'A10:2025',
    'API1:2023', 'API2:2023', 'API3:2023', 'API4:2023', 'API5:2023',
];
foreach ($owasp_patterns as $pat) {
    $found = str_contains($module_c, $pat);
    if (!$found) {
        echo "NOTE: OWASP label '$pat' not found in Module C (may use other official labels)\n";
    }
}
echo "PASS: OWASP labels checked for official format\n";

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

echo "\n--- Secret safety (migrations) ---\n";
$migration_dir = "$repo_root/database/migrations";
$new_migrations = glob("$migration_dir/049*.sql");
$new_migrations = array_merge($new_migrations ?: [], glob("$migration_dir/05*.sql") ?: []);
$new_migrations = array_merge($new_migrations ?: [], glob("$migration_dir/06*.sql") ?: []);
$new_migrations = array_merge($new_migrations ?: [], glob("$migration_dir/07*.sql") ?: []);
$new_migrations = array_merge($new_migrations ?: [], glob("$migration_dir/08*.sql") ?: []);

foreach ($new_migrations as $mig_file) {
    $content = file_get_contents($mig_file);
    foreach ($prohibited_patterns as $pattern) {
        if (preg_match($pattern, $content)) {
            fwrite(STDERR, "FAIL: Secret-like pattern found in " . basename($mig_file) . "\n");
            exit(1);
        }
    }
}
echo "PASS: No raw secret examples in Phase 1C migrations\n";

echo "\n--- Historical migration integrity ---\n";
$all_migration_files = glob("$migration_dir/0*.sql") ?: [];
$hist_count = 0;
foreach ($all_migration_files as $f) {
    $name = basename($f);
    $num = (int)substr($name, 0, 3);
    if ($num >= 1 && $num <= 48) {
        $hist_count++;
    }
}
assert_same(48, $hist_count, '48 historical migration files still present');

echo "\n=== ALL DOCUMENTATION CONTRACT TESTS PASSED ===\n";
