-- Course components (lecture and/or laboratory units) and a per-class display
-- title. Additive only: existing courses keep their total units and NULL
-- component units (component split not yet recorded).
ALTER TABLE courses ADD COLUMN IF NOT EXISTS lecture_units DECIMAL(3,1) NULL;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS lab_units DECIMAL(3,1) NULL;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS created_by_user_id INTEGER NULL
    REFERENCES user_accounts (user_id) ON UPDATE RESTRICT ON DELETE SET NULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_courses_component_units') THEN
        ALTER TABLE courses ADD CONSTRAINT ck_courses_component_units CHECK (
            (lecture_units IS NULL OR (lecture_units >= 0 AND lecture_units <= 20))
            AND (lab_units IS NULL OR (lab_units >= 0 AND lab_units <= 20))
        );
    END IF;
END
$$;

-- The course code and catalog name are shared by every section. A Faculty
-- member may show their own title for their class without renaming the
-- shared course for other Faculty.
ALTER TABLE class_sections ADD COLUMN IF NOT EXISTS course_title VARCHAR(255) NULL;

COMMENT ON COLUMN courses.lecture_units IS 'Lecture units; NULL when the lecture/lab split was never recorded.';
COMMENT ON COLUMN courses.lab_units IS 'Laboratory units; NULL when the lecture/lab split was never recorded.';
COMMENT ON COLUMN courses.created_by_user_id IS 'Faculty who created this catalog course, when created from Create Class.';
COMMENT ON COLUMN class_sections.course_title IS 'Optional per-class display title; NULL means use courses.name.';
