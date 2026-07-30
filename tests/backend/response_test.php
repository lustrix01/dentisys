<?php

declare(strict_types=1);

require_once __DIR__ . '/../../backend/app/response.php';

ob_start();
json_response(['status' => 'ok', 'message' => 'Ready']);
$output = ob_get_clean();

if ($output !== '{"status":"ok","message":"Ready"}') {
    fwrite(STDERR, "FAIL: JSON response output was unexpected.\nActual: $output\n");
    exit(1);
}

ob_start();
safe_error_response('Database connectivity check failed.', 503);
$output = ob_get_clean();

if (str_contains($output, 'local-development-password') || str_contains($output, 'pgsql:')) {
    fwrite(STDERR, "FAIL: safe error response exposed credentials or DSN details.\n");
    exit(1);
}

echo "PASS: response helpers format JSON and keep safe errors generic.\n";
