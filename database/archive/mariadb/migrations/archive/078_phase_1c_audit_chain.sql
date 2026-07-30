CREATE TABLE audit_chain (
    chain_id          INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    chain_code        VARCHAR(100)  NOT NULL,
    current_sequence  INT UNSIGNED  NOT NULL DEFAULT 0,
    current_event_mac BINARY(32)    NULL,
    mac_key_version   TINYINT UNSIGNED NOT NULL DEFAULT 1,
    PRIMARY KEY (chain_id),
    CONSTRAINT uq_audit_chain_code UNIQUE (chain_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
