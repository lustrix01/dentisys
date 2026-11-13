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

function contract_fail(string $message): void
{
    fwrite(STDERR, "FAIL: {$message}\n");
}

/** @return list<string> repo-relative paths (forward slashes) under $dir matching $pattern */
function contract_files(string $root, string $dir, string $pattern, array $skipDirs = []): array
{
    $found = [];
    $base = "{$root}/{$dir}";
    if (!is_dir($base)) {
        return $found;
    }
    $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($base, FilesystemIterator::SKIP_DOTS));
    foreach ($iterator as $file) {
        $relative = str_replace('\\', '/', substr($file->getPathname(), strlen($root) + 1));
        foreach ($skipDirs as $skip) {
            if (str_starts_with($relative, $skip)) {
                continue 2;
            }
        }
        if ($file->isFile() && preg_match($pattern, $relative)) {
            $found[] = $relative;
        }
    }
    sort($found);
    return $found;
}

$problems = 0;

// Check 1: every environment variable the code reads is documented in .env.example.
// A variable counts as documented when an active or commented `NAME=` line exists in any .env*.example file
// (.env.vps.example and .env.single-server.example hold the VPS-only and single-server-only settings).
// Allowlist: variables that are legitimately not set by the user in .env.
$envAllowlist = [
    'BIOMETRIC_SIDECAR_URL' => 'set by docker-compose.web.yml to the fixed http://biometric:8000',
    'BIOMETRIC_STORAGE_DIR' => 'set by compose to the fixed sidecar volume path',
    'BIOMETRIC_YUNET_MODEL_PATH' => 'set by compose to the model baked into the sidecar image',
    'BIOMETRIC_SFACE_MODEL_PATH' => 'set by compose to the model baked into the sidecar image',
    'MEDIAPIPE_FACE_LANDMARKER_MODEL_PATH' => 'set by compose to the model baked into the sidecar image',
    'BIOMETRIC_MAX_REQUEST_BYTES' => 'optional sidecar-internal tuning with a code default; compose does not forward it',
];

$exampleVars = [];
foreach (['.env.example', '.env.vps.example', '.env.single-server.example'] as $exampleFile) {
    require_nonempty_file("{$root}/{$exampleFile}");
    preg_match_all('/^#?\s*([A-Z][A-Z0-9_]*)=/m', (string) file_get_contents("{$root}/{$exampleFile}"), $exampleMatches);
    foreach ($exampleMatches[1] as $name) {
        $exampleVars[$name] = true;
    }
}

$codePatterns = [
    '/getenv\(\s*[\'"]([A-Z][A-Z0-9_]*)[\'"]/',
    '/config_value\(\s*[\'"]([A-Z][A-Z0-9_]*)[\'"]/',
    '/\$_ENV\[\s*[\'"]([A-Z][A-Z0-9_]*)[\'"]/',
    '/os\.environ(?:\.get)?[\[(]\s*[\'"]([A-Z][A-Z0-9_]*)[\'"]/',
    '/import\.meta\.env\.(VITE_[A-Z0-9_]+)/',
];
$envSources = array_merge(
    contract_files($root, 'backend', '/\.php$/', ['backend/vendor/']),
    contract_files($root, 'frontend/src', '/\.(ts|tsx|js|jsx)$/'),
    contract_files($root, 'biometric-sidecar', '/\.py$/'),
    array_map(static fn (string $path): string => basename($path), glob("{$root}/docker-compose*.yml") ?: []),
);
$envUsedIn = [];
foreach ($envSources as $relative) {
    $text = (string) file_get_contents("{$root}/{$relative}");
    $patterns = $codePatterns;
    if (str_ends_with($relative, '.yml')) {
        $patterns = ['/\$\{([A-Z][A-Z0-9_]*)[^}]*\}/']; // compose interpolation
    } elseif (str_ends_with($relative, '.py')) {
        // required_float("X"...), required_sha256("X"), checked_model_path("PATH_VAR", "SHA_VAR", ...)
        $patterns[] = '/(?:required_\w+|checked_model_path)\(\s*"([A-Z][A-Z0-9_]*)"/';
        $patterns[] = '/checked_model_path\(\s*"[A-Z][A-Z0-9_]*"\s*,\s*"([A-Z][A-Z0-9_]*)"/';
    }
    foreach ($patterns as $pattern) {
        if (preg_match_all($pattern, $text, $matches)) {
            foreach ($matches[1] as $name) {
                $envUsedIn[$name][$relative] = true;
            }
        }
    }
}
ksort($envUsedIn);
foreach ($envUsedIn as $name => $files) {
    if (isset($exampleVars[$name]) || isset($envAllowlist[$name])) {
        continue;
    }
    contract_fail(sprintf(
        '%s is read in %s but missing from the .env*.example files: add "# %s=" to .env.example (or add it to the allowlist in this test with a reason).',
        $name,
        implode(', ', array_keys($files)),
        $name,
    ));
    $problems++;
}

// Check 2: relative markdown links in current docs must resolve (file and #anchor).
function contract_slug(string $heading): string
{
    $heading = (string) preg_replace('/\[([^\]]*)\]\([^)]*\)/', '$1', $heading);
    $heading = strtolower(str_replace(['`', '*'], '', trim($heading)));
    $heading = (string) preg_replace('/[^\p{L}\p{N}\s_-]/u', '', $heading);
    return str_replace(' ', '-', $heading);
}

/** @return array<string,true> */
function contract_anchors(string $path): array
{
    static $cache = [];
    if (isset($cache[$path])) {
        return $cache[$path];
    }
    $anchors = [];
    $seen = [];
    $fenced = false;
    foreach (preg_split('/\R/', (string) file_get_contents($path)) ?: [] as $line) {
        if (preg_match('/^\s*(```|~~~)/', $line)) {
            $fenced = !$fenced;
            continue;
        }
        if (!$fenced && preg_match('/^#{1,6}\s+(.*?)\s*#*\s*$/', $line, $match)) {
            $slug = contract_slug($match[1]);
            $count = $seen[$slug] ?? 0;
            $seen[$slug] = $count + 1;
            $anchors[$count === 0 ? $slug : "{$slug}-{$count}"] = true;
        }
    }
    return $cache[$path] = $anchors;
}

$linkFiles = array_merge(
    ['README.md', 'AGENTS.md', 'CLAUDE.md', 'spec.md', 'database/README.md'],
    contract_files($root, 'docs', '/\.md$/', ['docs/archive/']),
);
foreach ($linkFiles as $relative) {
    if (!is_file("{$root}/{$relative}")) {
        continue;
    }
    $fenced = false;
    foreach (preg_split('/\R/', (string) file_get_contents("{$root}/{$relative}")) ?: [] as $number => $line) {
        if (preg_match('/^\s*(```|~~~)/', $line)) {
            $fenced = !$fenced;
            continue;
        }
        if ($fenced) {
            continue;
        }
        $line = (string) preg_replace('/`[^`]*`/', '', $line);
        if (!preg_match_all('/\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/', $line, $matches)) {
            continue;
        }
        foreach ($matches[1] as $target) {
            if (preg_match('#^([a-z][a-z0-9+.-]*:|//)#i', $target)) {
                continue; // http(s), mailto, etc.
            }
            [$linkPath, $anchor] = array_pad(explode('#', $target, 2), 2, '');
            $resolved = $linkPath === ''
                ? "{$root}/{$relative}"
                : (str_starts_with($linkPath, '/') ? $root : dirname("{$root}/{$relative}")) . '/' . rawurldecode($linkPath);
            $where = $relative . ':' . ($number + 1);
            if (!file_exists($resolved)) {
                contract_fail("{$where} links to missing file \"{$target}\": fix the path or remove the link.");
                $problems++;
            } elseif ($anchor !== '' && is_file($resolved) && str_ends_with($resolved, '.md')
                && !isset(contract_anchors($resolved)[strtolower(rawurldecode($anchor))])) {
                contract_fail("{$where} links to missing heading \"{$target}\": fix the anchor or the heading.");
                $problems++;
            }
        }
    }
}

// Check 3: dated or handoff-style docs belong in docs/archive/.
foreach (contract_files($root, 'docs', '/\.md$/', ['docs/archive/']) as $relative) {
    $name = basename($relative);
    if (preg_match('/\d{4}-\d{2}/', $name) || preg_match('/^(HANDOFF_|FIX_PLAN_)/', $name)) {
        contract_fail("{$relative} is a dated/handoff doc outside the archive: move to docs/archive/ (or rename without the date).");
        $problems++;
    }
}

if ($problems > 0) {
    fwrite(STDERR, "FAIL: {$problems} documentation contract problem(s).\n");
    exit(1);
}

echo "PASS: current documentation entry points and migration conventions are present.\n";

require_once __DIR__ . '/../backend/invitation_onboarding_contract_test.php';
