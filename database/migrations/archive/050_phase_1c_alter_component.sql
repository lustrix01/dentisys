DELIMITER $$

CREATE PROCEDURE __preflight_050()
BEGIN
    DECLARE c INT;

    SELECT COUNT(*) INTO c
    FROM component
    WHERE LOWER(TRIM(comp_name)) NOT IN (
        'quiz', 'lecture quiz', 'lec quiz',
        'term exam', 'examination', 'midterm exam', 'final exam', 'midterm', 'final',
        'recitation', 'recit',
        'output', 'project',
        'practical', 'practical examination', 'prac exam',
        'lab exercise', 'laboratory exercise', 'exercise',
        'lab quiz', 'laboratory quiz',
        'performance', 'lab performance', 'laboratory performance', 'attitude'
    );

    IF c > 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Migration 050: unmapped component.comp_name found';
    END IF;
END$$

DELIMITER ;

CALL __preflight_050();
DROP PROCEDURE __preflight_050;

ALTER TABLE component
    ADD COLUMN ct_id INT UNSIGNED NULL AFTER weight,
    ADD INDEX idx_component_ct_id (ct_id);

UPDATE component
SET ct_id = (
    SELECT ct_id FROM component_type
    WHERE
        (LOWER(TRIM(component.comp_name)) IN ('quiz', 'lecture quiz', 'lec quiz') AND component_type.ct_code = 'LEC_QUIZ')
        OR (LOWER(TRIM(component.comp_name)) IN ('term exam', 'examination', 'midterm exam', 'final exam', 'midterm', 'final') AND component_type.ct_code = 'TERM_EXAM')
        OR (LOWER(TRIM(component.comp_name)) IN ('recitation', 'recit') AND component_type.ct_code = 'RECIT')
        OR (LOWER(TRIM(component.comp_name)) IN ('output', 'project') AND component_type.ct_code = 'OUTPUT')
        OR (LOWER(TRIM(component.comp_name)) IN ('practical', 'practical examination', 'prac exam') AND component_type.ct_code = 'PRAC_EXAM')
        OR (LOWER(TRIM(component.comp_name)) IN ('lab exercise', 'laboratory exercise', 'exercise') AND component_type.ct_code = 'LAB_EXERCISE')
        OR (LOWER(TRIM(component.comp_name)) IN ('lab quiz', 'laboratory quiz') AND component_type.ct_code = 'LAB_QUIZ')
        OR (LOWER(TRIM(component.comp_name)) IN ('performance', 'lab performance', 'laboratory performance', 'attitude') AND component_type.ct_code = 'LAB_PERF')
    LIMIT 1
);

ALTER TABLE component
    MODIFY ct_id INT UNSIGNED NOT NULL,
    ADD CONSTRAINT fk_component_component_type FOREIGN KEY (ct_id)
        REFERENCES component_type (ct_id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT;
