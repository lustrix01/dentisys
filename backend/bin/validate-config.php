<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/app/config.php';

$rawEnvironment = getenv('APP_ENV');
if ($rawEnvironment === false || trim($rawEnvironment) === '') {
    throw new RuntimeException('Configuration value "APP_ENV" must be set explicitly before the backend starts.');
}

app_config();
fwrite(STDOUT, "DentiSys runtime configuration is valid.\n");
