CREATE TABLE user_preference (
    pref_id    INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id    INT UNSIGNED NOT NULL,
    theme      VARCHAR(10)  NOT NULL DEFAULT 'light',
    updated_at DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (pref_id),
    CONSTRAINT uq_user_preference_user_id UNIQUE (user_id),
    CONSTRAINT fk_user_preference_user_account FOREIGN KEY (user_id)
        REFERENCES user_account (user_id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,
    CONSTRAINT chk_user_preference_theme CHECK (theme IN ('light', 'dark'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
