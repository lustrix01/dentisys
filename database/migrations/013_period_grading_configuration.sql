-- Add period-aware grading configuration while preserving existing overall rows
-- and assessment category references.

ALTER TABLE grading_configs
    ADD COLUMN schema_mode TEXT NOT NULL DEFAULT 'overall',
    ADD COLUMN term_midterm_weight NUMERIC(7,4),
    ADD COLUMN term_final_weight NUMERIC(7,4);

ALTER TABLE grading_configs
    ADD CONSTRAINT ck_grading_configs_schema_mode
    CHECK (schema_mode IN ('overall', 'periods'));

ALTER TABLE grading_configs
    ADD CONSTRAINT ck_grading_configs_term_weights
    CHECK (
        (schema_mode = 'overall'
            AND term_midterm_weight IS NULL
            AND term_final_weight IS NULL)
        OR
        (schema_mode = 'periods'
            AND term_midterm_weight IS NOT NULL
            AND term_final_weight IS NOT NULL
            AND term_midterm_weight >= 0
            AND term_midterm_weight <= 100
            AND term_final_weight >= 0
            AND term_final_weight <= 100
            AND term_midterm_weight + term_final_weight = 100)
    );

ALTER TABLE grading_categories
    ADD COLUMN grading_period TEXT;

ALTER TABLE grading_categories
    ADD CONSTRAINT ck_grading_categories_period
    CHECK (grading_period IS NULL OR grading_period IN ('Midterm', 'Final'));

DROP INDEX uq_grading_categories_config_name;

CREATE UNIQUE INDEX uq_grading_categories_config_period_name
    ON grading_categories (
        config_id,
        COALESCE(grading_period, '__overall__'),
        lower(btrim(name))
    );
