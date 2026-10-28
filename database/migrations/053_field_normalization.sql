-- FLD-001 (2026-10-28): field normalization for existing data, matching the new input rules.
-- Student sex is stored as M/F, contact as a Philippine mobile number (09XXXXXXXXX), and course
-- code / block as trimmed, single-spaced upper case. Data only, nothing deleted or blanked:
-- values that do not match a known form are left as they are.
UPDATE students SET sex = 'M' WHERE lower(btrim(sex)) IN ('m', 'male') AND sex <> 'M';
UPDATE students SET sex = 'F' WHERE lower(btrim(sex)) IN ('f', 'female') AND sex <> 'F';

UPDATE students
SET contact = '09' || right(regexp_replace(contact, '[\s\-()]', '', 'g'), 9)
WHERE contact IS NOT NULL
  AND regexp_replace(contact, '[\s\-()]', '', 'g') ~ '^(09|\+639|639)[0-9]{9}$'
  AND contact <> '09' || right(regexp_replace(contact, '[\s\-()]', '', 'g'), 9);

-- uq_courses_course_code is case-sensitive: skip a row whose upper-case form is already taken
-- by another course, and update only one of several rows that would become the same code.
WITH target AS (
    SELECT course_id, upper(regexp_replace(btrim(course_code), '\s+', ' ', 'g')) AS new_code
    FROM courses
)
UPDATE courses c
SET course_code = t.new_code
FROM target t
WHERE c.course_id = t.course_id
  AND c.course_code <> t.new_code
  AND NOT EXISTS (SELECT 1 FROM courses o WHERE o.course_id <> c.course_id AND o.course_code = t.new_code)
  AND NOT EXISTS (SELECT 1 FROM target o WHERE o.course_id < c.course_id AND o.new_code = t.new_code);

UPDATE class_sections
SET block = upper(regexp_replace(btrim(block), '\s+', ' ', 'g'))
WHERE block IS NOT NULL AND block <> upper(regexp_replace(btrim(block), '\s+', ' ', 'g'));

DO $$
DECLARE
    leftovers TEXT;
    total INTEGER;
BEGIN
    SELECT count(*), string_agg(student_number, ', ' ORDER BY student_number) INTO total, leftovers
    FROM students
    WHERE (sex IS NOT NULL AND sex NOT IN ('M', 'F'))
       OR (btrim(COALESCE(contact, '')) <> '' AND contact !~ '^09[0-9]{9}$');
    RAISE NOTICE 'Students still needing review (sex not M/F or contact not 09XXXXXXXXX): %', total;
    IF total > 0 THEN
        RAISE NOTICE 'Student numbers: %', leftovers;
    END IF;
END $$;
