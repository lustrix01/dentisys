-- Store Faculty-defined attendance ranges on the versioned offering config and
-- preserve the semantic source of each period category membership.

ALTER TABLE grading_configs
    ADD COLUMN midterm_start_date DATE NULL,
    ADD COLUMN midterm_end_date DATE NULL,
    ADD COLUMN final_start_date DATE NULL,
    ADD COLUMN final_end_date DATE NULL;

ALTER TABLE grading_category_periods
    ADD COLUMN source_kind TEXT NOT NULL DEFAULT 'assessment';

ALTER TABLE grading_category_periods
    ADD CONSTRAINT ck_grading_category_periods_source_kind
    CHECK (source_kind IN ('attendance', 'assessment'));

-- A pre-existing exact "Attendance" row is authoritative attendance only when
-- no assessment already points at that membership.  This keeps legacy custom
-- categories with that label attached to their existing assessment semantics.
UPDATE grading_category_periods gcp
   SET source_kind = 'attendance'
 WHERE lower(btrim(gcp.name)) = 'attendance'
   AND NOT EXISTS (
       SELECT 1
         FROM assessments a
        WHERE a.grading_category_id = gcp.category_id
          AND a.grading_period = gcp.grading_period
   );

CREATE INDEX ix_grading_category_periods_source_kind
    ON grading_category_periods (config_id, grading_period, source_kind);
