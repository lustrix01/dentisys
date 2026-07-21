DELIMITER $$

CREATE PROCEDURE __preflight_065()
BEGIN
    DECLARE c INT;

    SELECT COUNT(*) INTO c FROM user_account WHERE username NOT LIKE '%@%';
    IF c > 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Migration 065: usernames without @ found -- cannot derive login_email';
    END IF;

    SELECT COUNT(*) INTO c FROM (
        SELECT TRIM(LOWER(username)) AS norm
        FROM user_account
        GROUP BY norm
        HAVING COUNT(*) > 1
    ) t;
    IF c > 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Migration 065: duplicate normalized login_email values found';
    END IF;

    SELECT COUNT(*) INTO c FROM user_account WHERE TRIM(username) = '' OR username IS NULL;
    IF c > 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Migration 065: empty or NULL username found';
    END IF;

    SELECT COUNT(*) INTO c FROM user_account
    WHERE role NOT IN (SELECT role_name FROM access_role);
    IF c > 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Migration 065: unknown role value found in user_account';
    END IF;
END$$

DELIMITER ;

CALL __preflight_065();
DROP PROCEDURE __preflight_065;

ALTER TABLE user_account
    ADD COLUMN login_email   VARCHAR(255) NULL,
    ADD COLUMN role_id       INT UNSIGNED NULL,
    ADD COLUMN token_version INT UNSIGNED NOT NULL DEFAULT 0,
    ADD COLUMN created_at    DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    ADD COLUMN updated_at    DATETIME(6)  NULL ON UPDATE CURRENT_TIMESTAMP(6);

UPDATE user_account
SET login_email = TRIM(LOWER(username));

ALTER TABLE user_account
    MODIFY login_email VARCHAR(255) NOT NULL,
    ADD INDEX idx_user_account_login_email (login_email),
    ADD CONSTRAINT uq_user_account_login_email UNIQUE (login_email);

UPDATE user_account
SET role_id = (
    SELECT role_id FROM access_role WHERE role_name = user_account.role
);

ALTER TABLE user_account
    MODIFY role_id INT UNSIGNED NOT NULL,
    ADD INDEX idx_user_account_role_id (role_id),
    ADD CONSTRAINT fk_user_account_access_role FOREIGN KEY (role_id)
        REFERENCES access_role (role_id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT;
