CREATE TABLE audit_log (
    log_id    INT UNSIGNED NOT NULL AUTO_INCREMENT,
    action    VARCHAR(100) NOT NULL,
    target    VARCHAR(255) NOT NULL,
    logged_at DATETIME(6)  NOT NULL,
    ip_add    VARCHAR(45)  NOT NULL,
    user_id   INT UNSIGNED NOT NULL,
    PRIMARY KEY (log_id),
    INDEX idx_audit_log_user_id (user_id),
    CONSTRAINT fk_audit_log_user_account FOREIGN KEY (user_id)
        REFERENCES user_account (user_id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
