DELIMITER $$

CREATE PROCEDURE __preflight_052()
BEGIN
    DECLARE c INT;

    SELECT COUNT(*) INTO c
    FROM class_section
    WHERE cs_semester IS NOT NULL AND cs_semester <> ''
      AND LOWER(TRIM(cs_semester)) NOT IN ('1st', '2nd', 'summer', 'first', 'second', 'first semester', 'second semester');

    IF c > 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Migration 052: invalid cs_semester value found';
    END IF;

    SELECT COUNT(*) INTO c
    FROM class_section
    WHERE cs_school_year IS NOT NULL AND cs_school_year <> ''
      AND cs_school_year NOT REGEXP '^[0-9]{4}-[0-9]{4}$';

    IF c > 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Migration 052: invalid cs_school_year format (expected YYYY-YYYY)';
    END IF;
END$$

DELIMITER ;

CALL __preflight_052();
DROP PROCEDURE __preflight_052;

INSERT INTO academic_term (term_code, school_year, semester)
SELECT DISTINCT
    CONCAT(cs_school_year, '-', cs_semester) AS term_code,
    cs_school_year,
    cs_semester
FROM class_section
WHERE cs_school_year IS NOT NULL AND cs_school_year <> ''
  AND cs_semester IS NOT NULL AND cs_semester <> '';

ALTER TABLE class_section
    ADD COLUMN term_id INT UNSIGNED NULL AFTER status,
    ADD INDEX idx_class_section_term_id (term_id);

UPDATE class_section cs
SET cs.term_id = (
    SELECT at2.term_id
    FROM academic_term at2
    WHERE at2.school_year = cs.cs_school_year
      AND at2.semester   = cs.cs_semester
    LIMIT 1
);

ALTER TABLE class_section
    MODIFY term_id INT UNSIGNED NOT NULL,
    ADD CONSTRAINT fk_class_section_academic_term FOREIGN KEY (term_id)
        REFERENCES academic_term (term_id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT;
