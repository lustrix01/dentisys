<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

require __DIR__ . "/db.php";

try {
    $stmt = $pdo->query("SELECT 1");
    $db_ok = $stmt !== false;

    http_response_code(200);
    echo json_encode([
        "status"    => "ok",
        "app"       => "DentiSys API",
        "database"  => $db_ok ? "connected" : "disconnected",
        "timestamp" => gmdate("c")
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        "status"    => "error",
        "app"       => "DentiSys API",
        "database"  => "disconnected",
        "timestamp" => gmdate("c")
    ]);
}
