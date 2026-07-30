CREATE TABLE device (
    device_id    INT UNSIGNED NOT NULL AUTO_INCREMENT,
    device_name  VARCHAR(100) NOT NULL,
    ip_add       VARCHAR(45)  NOT NULL,
    location     VARCHAR(255) NOT NULL,
    status       VARCHAR(50)  NOT NULL,
    PRIMARY KEY (device_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
