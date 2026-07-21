CREATE TABLE audit_event (
    event_id                    INT UNSIGNED   NOT NULL AUTO_INCREMENT,
    event_uuid                  CHAR(36)       NOT NULL,
    chain_id                    INT UNSIGNED   NOT NULL,
    sequence_number             INT UNSIGNED   NOT NULL,
    occurred_at                 DATETIME(6)    NOT NULL,
    actor_type                  VARCHAR(10)    NOT NULL,
    actor_user_id               INT UNSIGNED   NULL,
    actor_username              VARCHAR(100)   NULL,
    actor_role                  VARCHAR(50)    NULL,
    actor_display_name_snapshot VARCHAR(200)   NULL,
    session_id                  INT UNSIGNED   NULL,
    device_id                   INT UNSIGNED   NULL,
    device_name_snapshot        VARCHAR(100)   NULL,
    device_type_snapshot        VARCHAR(50)    NULL,
    module_code                 VARCHAR(100)   NOT NULL,
    action_code                 VARCHAR(100)   NOT NULL,
    event_status                VARCHAR(10)    NOT NULL,
    target_type                 VARCHAR(50)    NULL,
    target_id                   VARCHAR(100)   NULL,
    description                 VARCHAR(1000)  NULL,
    reason                      VARCHAR(500)   NULL,
    http_method                 VARCHAR(10)    NULL,
    endpoint                    VARCHAR(255)   NULL,
    request_id                  VARCHAR(64)    NULL,
    correlation_id              VARCHAR(64)    NULL,
    operation_uuid              CHAR(36)       NULL,
    ip_address                  VARCHAR(45)    NULL,
    user_agent                  VARCHAR(500)   NULL,
    before_state                LONGTEXT       NULL,
    after_state                 LONGTEXT       NULL,
    previous_event_mac          BINARY(32)     NOT NULL,
    event_mac                   BINARY(32)     NOT NULL,
    mac_key_version             TINYINT UNSIGNED NOT NULL,
    canonical_schema_version    VARCHAR(10)    NOT NULL DEFAULT '1.0',
    PRIMARY KEY (event_id),
    INDEX idx_audit_event_chain_id (chain_id),
    INDEX idx_audit_event_actor_user_id (actor_user_id),
    INDEX idx_audit_event_session_id (session_id),
    INDEX idx_audit_event_device_id (device_id),
    INDEX idx_audit_event_occurred_at (occurred_at),
    INDEX idx_audit_event_module_code (module_code),
    INDEX idx_audit_event_event_status (event_status),
    INDEX idx_audit_event_operation_uuid (operation_uuid),
    CONSTRAINT uq_audit_event_uuid UNIQUE (event_uuid),
    CONSTRAINT uq_audit_event_chain_seq UNIQUE (chain_id, sequence_number),
    CONSTRAINT fk_audit_event_chain FOREIGN KEY (chain_id)
        REFERENCES audit_chain (chain_id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,
    CONSTRAINT fk_audit_event_actor FOREIGN KEY (actor_user_id)
        REFERENCES user_account (user_id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,
    CONSTRAINT fk_audit_event_session FOREIGN KEY (session_id)
        REFERENCES auth_session (session_id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,
    CONSTRAINT fk_audit_event_device FOREIGN KEY (device_id)
        REFERENCES device (device_id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,
    CONSTRAINT chk_audit_event_actor_type CHECK (actor_type IN ('user', 'system', 'anonymous')),
    CONSTRAINT chk_audit_event_status CHECK (event_status IN ('Success', 'Failed', 'Warning'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$

CREATE TRIGGER trg_audit_event_no_update
BEFORE UPDATE ON audit_event
FOR EACH ROW
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_event is immutable'$$

CREATE TRIGGER trg_audit_event_no_delete
BEFORE DELETE ON audit_event
FOR EACH ROW
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_event rows cannot be deleted'$$

DELIMITER ;
