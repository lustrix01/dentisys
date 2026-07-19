<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/controllers/HealthController.php';

return [
    [
        'method' => 'GET',
        'path' => '/api/health',
        'handler' => 'handle_health_check',
    ],
];
