<?php

declare(strict_types=1);

// Static guard: every plain function call and every route handler in the
// backend must resolve to a function defined in the backend or by PHP /
// Composer. (A missing attendance_session_code() once made Faculty
// attendance sessions fail with a server error.)

$backend = realpath(__DIR__ . '/../../backend');
if (is_file($backend . '/vendor/autoload.php')) {
    require_once $backend . '/vendor/autoload.php';
}

$files = array_merge(
    glob($backend . '/app/*.php') ?: [],
    glob($backend . '/controllers/*.php') ?: [],
    glob($backend . '/routes/*.php') ?: [],
    glob($backend . '/public/*.php') ?: [],
    glob($backend . '/bin/*.php') ?: []
);

$defined = [];
$calls = [];
$skipBefore = [T_FUNCTION, T_OBJECT_OPERATOR, T_NULLSAFE_OBJECT_OPERATOR, T_DOUBLE_COLON, T_NEW];
foreach ($files as $file) {
    $tokens = token_get_all((string) file_get_contents($file));
    $count = count($tokens);
    for ($i = 0; $i < $count; $i++) {
        $token = $tokens[$i];
        if (!is_array($token)) {
            continue;
        }
        if ($token[0] === T_FUNCTION) {
            for ($j = $i + 1; $j < min($count, $i + 5); $j++) {
                if (is_array($tokens[$j]) && $tokens[$j][0] === T_STRING) {
                    $defined[strtolower($tokens[$j][1])] = true;
                    break;
                }
            }
            continue;
        }
        if ($token[0] !== T_STRING) {
            continue;
        }
        $next = $i + 1;
        while (is_array($tokens[$next] ?? null) && $tokens[$next][0] === T_WHITESPACE) {
            $next++;
        }
        if (($tokens[$next] ?? null) !== '(') {
            continue;
        }
        $prev = $i - 1;
        while (is_array($tokens[$prev] ?? null) && $tokens[$prev][0] === T_WHITESPACE) {
            $prev--;
        }
        if (is_array($tokens[$prev] ?? null) && in_array($tokens[$prev][0], $skipBefore, true)) {
            continue;
        }
        $calls[strtolower($token[1])][] = basename(dirname($file)) . '/' . basename($file) . ':' . $token[2];
    }
}

preg_match_all("/'handler'\\s*=>\\s*'([A-Za-z0-9_]+)'/", (string) file_get_contents($backend . '/routes/api.php'), $matches);
foreach ($matches[1] as $handler) {
    $calls[strtolower($handler)][] = 'routes/api.php (route handler)';
}

$missing = [];
foreach ($calls as $name => $where) {
    if (!isset($defined[$name]) && !function_exists($name)) {
        $missing[] = $name . ' (' . $where[0] . ')';
    }
}

if ($missing !== []) {
    fwrite(STDERR, 'FAIL: Undefined backend functions: ' . implode(', ', $missing) . "\n");
    exit(1);
}
echo 'PASS: All ' . count($calls) . " called backend functions and route handlers are defined\n";
