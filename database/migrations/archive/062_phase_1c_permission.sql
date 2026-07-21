CREATE TABLE permission (
    perm_id     INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    perm_code   VARCHAR(100)  NOT NULL,
    resource    VARCHAR(100)  NOT NULL,
    action      VARCHAR(50)   NOT NULL,
    description VARCHAR(255)  NULL,
    PRIMARY KEY (perm_id),
    CONSTRAINT uq_permission_code UNIQUE (perm_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
