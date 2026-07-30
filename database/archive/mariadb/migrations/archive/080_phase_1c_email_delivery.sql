CREATE TABLE email_delivery (
    email_id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    sender_user_id        INT UNSIGNED  NULL,
    recipient_email       VARCHAR(255)  NOT NULL,
    recipient_name        VARCHAR(200)  NULL,
    subject               VARCHAR(500)  NOT NULL,
    email_type            VARCHAR(50)   NOT NULL,
    message_body          TEXT          NULL,
    status                VARCHAR(10)   NOT NULL DEFAULT 'Pending',
    attempted_at          DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    sent_at               DATETIME(6)   NULL,
    failure_reason        VARCHAR(500)  NULL,
    provider_message_id   VARCHAR(255)  NULL,
    operation_uuid        CHAR(36)      NOT NULL,
    sender_name_snapshot  VARCHAR(200)  NULL,
    PRIMARY KEY (email_id),
    INDEX idx_email_delivery_sender (sender_user_id),
    INDEX idx_email_delivery_status (status),
    CONSTRAINT uq_email_delivery_operation_uuid UNIQUE (operation_uuid),
    CONSTRAINT fk_email_delivery_sender FOREIGN KEY (sender_user_id)
        REFERENCES user_account (user_id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,
    CONSTRAINT chk_email_delivery_status CHECK (status IN ('Pending', 'Sent', 'Failed')),
    CONSTRAINT chk_email_delivery_type CHECK (email_type IN ('Privacy Consent', 'At-Risk Notification', 'Secretary Invitation', 'Faculty Approval', 'Faculty Rejection'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$

CREATE TRIGGER trg_email_delivery_no_update_completed
BEFORE UPDATE ON email_delivery
FOR EACH ROW
BEGIN
    IF OLD.status IN ('Sent', 'Failed') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Completed email_delivery is immutable';
    END IF;
END$$

CREATE TRIGGER trg_email_delivery_no_delete
BEFORE DELETE ON email_delivery
FOR EACH ROW
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'email_delivery rows cannot be deleted'$$

DELIMITER ;
