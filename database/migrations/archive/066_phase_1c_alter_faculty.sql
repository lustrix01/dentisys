DELIMITER $$

CREATE PROCEDURE __preflight_066()
BEGIN
    DECLARE c INT;

    SELECT COUNT(*) INTO c FROM (
        SELECT user_id FROM faculty GROUP BY user_id HAVING COUNT(*) > 1
    ) t;
    IF c > 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Migration 066: duplicate faculty.user_id found';
    END IF;

    SELECT COUNT(*) INTO c
    FROM faculty f
    JOIN user_account u ON f.user_id = u.user_id
    WHERE f.is_admin = 1
      AND u.role_id <> (SELECT role_id FROM access_role WHERE role_name = 'admin');

    IF c > 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Migration 066: faculty is_admin=1 but user role is not admin';
    END IF;
END$$

DELIMITER ;

CALL __preflight_066();
DROP PROCEDURE __preflight_066;

ALTER TABLE faculty
    ADD CONSTRAINT uq_faculty_user_id UNIQUE (user_id);
