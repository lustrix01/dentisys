<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/app/bootstrap.php';

$routes = require dirname(__DIR__) . '/routes/api.php';

route_request($routes, request_method(), request_path());
