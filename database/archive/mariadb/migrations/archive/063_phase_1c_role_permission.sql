CREATE TABLE role_permission (
    rp_id      INT UNSIGNED NOT NULL AUTO_INCREMENT,
    role_id    INT UNSIGNED NOT NULL,
    perm_id    INT UNSIGNED NOT NULL,
    scope_type VARCHAR(30)  NOT NULL,
    PRIMARY KEY (rp_id),
    INDEX idx_role_permission_role_id (role_id),
    INDEX idx_role_permission_perm_id (perm_id),
    CONSTRAINT uq_role_permission_scope UNIQUE (role_id, perm_id, scope_type),
    CONSTRAINT fk_rp_access_role FOREIGN KEY (role_id)
        REFERENCES access_role (role_id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,
    CONSTRAINT fk_rp_permission FOREIGN KEY (perm_id)
        REFERENCES permission (perm_id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,
    CONSTRAINT chk_role_permission_scope_type CHECK (scope_type IN ('own', 'assigned_class', 'assigned_course', 'aggregate', 'system_wide'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
