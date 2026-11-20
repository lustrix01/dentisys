-- GRD-004 (13.8): grade submission, per-term deadline and Dean-approved grade changes. Additive only.
ALTER TABLE academic_terms
    ADD COLUMN grade_deadline date NULL,
    ADD CONSTRAINT chk_academic_terms_grade_deadline
        CHECK (grade_deadline IS NULL OR grade_deadline >= end_date);

ALTER TABLE class_sections
    ADD COLUMN grades_submitted_at timestamptz NULL,
    ADD COLUMN grades_submitted_by integer NULL REFERENCES user_accounts(user_id) ON DELETE SET NULL,
    ADD COLUMN grades_grace_until timestamptz NULL;

CREATE TABLE grade_change_batches (
    batch_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    cs_id integer NOT NULL REFERENCES class_sections(cs_id),
    faculty_user_id integer NOT NULL REFERENCES user_accounts(user_id),
    status varchar(10) NOT NULL CHECK (status IN ('draft', 'pending', 'approved', 'rejected', 'discarded')),
    reason text NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    sent_at timestamptz NULL,
    decided_at timestamptz NULL,
    decided_by_user_id integer NULL REFERENCES user_accounts(user_id),
    decision_reason text NULL,
    snapshot jsonb NULL,
    draft_results jsonb NULL,
    changes jsonb NULL
);
CREATE UNIQUE INDEX ux_grade_change_batches_open ON grade_change_batches(cs_id)
    WHERE status IN ('draft', 'pending');

-- Rule 15: classes of past school years that are not archived count as submitted at their term end, with no grace.
UPDATE class_sections cs
   SET grades_submitted_at = COALESCE(
           (SELECT (t.end_date + 1)::timestamp AT TIME ZONE 'Asia/Manila' - interval '1 second'
              FROM academic_terms t
             WHERE t.school_year = cs.school_year
               AND t.semester = CASE
                     WHEN upper(cs.semester) LIKE '%1ST%' OR upper(cs.semester) LIKE '%FIRST%' THEN '1ST'
                     WHEN upper(cs.semester) LIKE '%2ND%' OR upper(cs.semester) LIKE '%SECOND%' THEN '2ND'
                     WHEN upper(cs.semester) LIKE '%SUMMER%' THEN 'Summer' END),
           (cs.term_end_date + 1)::timestamp AT TIME ZONE 'Asia/Manila' - interval '1 second',
           now())
 WHERE cs.archive_reason IS NULL
   AND cs.school_year < (SELECT COALESCE(setting_value::jsonb ->> 'schoolYear', setting_value::jsonb ->> 'school_year', setting_value::jsonb #>> '{}')
                           FROM system_settings WHERE setting_key = 'academic.current_school_year');

-- Rule 8: a class archived as Finished before GRD-004 counts as submitted when it was archived (never Late).
UPDATE class_sections
   SET grades_submitted_at = archived_at
 WHERE archive_reason = 'finished' AND grades_submitted_at IS NULL;
-- apply-migrations.sh grants the configured app role all tables/sequences and default privileges.
