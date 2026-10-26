-- Lecture-only courses: a period configuration may use component_mode = 'lecture'
-- (Lecture share 100, no Laboratory share). Existing branches are unchanged and no rows are touched.

ALTER TABLE grading_configs
    DROP CONSTRAINT ck_grading_configs_component_weights;

ALTER TABLE grading_configs
    ADD CONSTRAINT ck_grading_configs_component_weights
    CHECK (
        (component_mode = 'combined'
            AND component_lecture_weight IS NULL
            AND component_laboratory_weight IS NULL)
        OR
        (component_mode = 'lecture_laboratory'
            AND schema_mode = 'periods'
            AND component_lecture_weight IS NOT NULL
            AND component_laboratory_weight IS NOT NULL
            AND component_lecture_weight > 0
            AND component_laboratory_weight > 0
            AND component_lecture_weight <= 100
            AND component_laboratory_weight <= 100
            AND component_lecture_weight + component_laboratory_weight = 100)
        OR
        (component_mode = 'lecture'
            AND schema_mode = 'periods'
            AND component_lecture_weight = 100
            AND component_laboratory_weight IS NULL)
    );
