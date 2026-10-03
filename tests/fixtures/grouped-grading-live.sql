-- Additive live PostgreSQL fixture for Lecture/Laboratory grading E2E.
-- Loaded by check-postgres.ps1 into its disposable integration database.
-- The fixture creates identities and an empty grouped-results offering, plus
-- a separate unconfigured offering with a legacy ambiguous Quiz. Browser tests
-- own configuration, explicit mapping, assessments, scores and recomputation.
BEGIN;

INSERT INTO courses
    (course_code, name, units, semester, grading_config)
SELECT 'INT-GROUPED', 'Grouped Grading Integration Course', 1.0, '1ST', '{}'::jsonb
 WHERE NOT EXISTS (
    SELECT 1 FROM courses WHERE course_code = 'INT-GROUPED'
 );

INSERT INTO user_accounts
    (login_email, password_hash, role, display_name, title, status, approved_at,
     name_prefix, first_name, middle_name, last_name, name_suffix)
SELECT 'live.grouped.faculty@bicol-u.edu.ph', seeded.password_hash, 'faculty',
       'Live Grouped Faculty', 'Faculty', 'Active', CURRENT_TIMESTAMP,
       NULL, 'Live', NULL, 'Grouped Faculty', NULL
  FROM user_accounts seeded
 WHERE seeded.login_email = 'faculty@bicol-u.edu.ph'
   AND NOT EXISTS (
        SELECT 1 FROM user_accounts existing
         WHERE existing.login_email = 'live.grouped.faculty@bicol-u.edu.ph'
   );

INSERT INTO class_sections
    (cs_name, course_id, instructor_user_id, semester, school_year, status, term_code)
SELECT 'GROUPED-1A', c.course_id, f.user_id, '1ST', sy.school_year, 'Active', sy.school_year || '-1ST'
  FROM courses c
  JOIN user_accounts f ON f.login_email = 'live.grouped.faculty@bicol-u.edu.ph' AND f.role = 'faculty'
 CROSS JOIN LATERAL (
    SELECT COALESCE(
        setting_value #>> '{schoolYear}',
        setting_value #>> '{school_year}',
        setting_value #>> '{}'
    ) AS school_year
      FROM system_settings
     WHERE setting_key = 'academic.current_school_year'
     LIMIT 1
 ) sy
 WHERE c.course_code = 'INT-GROUPED'
   AND NOT EXISTS (
        SELECT 1
          FROM class_sections existing
         WHERE existing.cs_name = 'GROUPED-1A'
           AND existing.course_id = c.course_id
           AND existing.instructor_user_id = f.user_id
           AND upper(existing.semester) = '1ST'
           AND upper(existing.school_year) = upper(sy.school_year)
   );

INSERT INTO user_accounts
    (login_email, password_hash, role, display_name, title, status, approved_at,
     name_prefix, first_name, middle_name, last_name, name_suffix)
SELECT 'live.grouped.student@bicol-u.edu.ph', seeded.password_hash, 'student',
       'Live Grouped Student', 'Student', 'Active', CURRENT_TIMESTAMP,
       NULL, 'Live', NULL, 'Grouped', NULL
  FROM user_accounts seeded
 WHERE seeded.login_email = 'student@bicol-u.edu.ph'
   AND NOT EXISTS (
        SELECT 1 FROM user_accounts existing
         WHERE existing.login_email = 'live.grouped.student@bicol-u.edu.ph'
   );

INSERT INTO students
    (student_number, first_name, middle_name, last_name, bu_email, status,
     admission_date, user_id, student_account_user_id)
SELECT 'INT-GROUPED-001', 'Live', NULL, 'Grouped', account.login_email,
       'active', CURRENT_DATE, NULL, account.user_id
  FROM user_accounts account
 WHERE account.login_email = 'live.grouped.student@bicol-u.edu.ph'
   AND account.role = 'student'
   AND NOT EXISTS (
        SELECT 1 FROM students existing
         WHERE existing.student_number = 'INT-GROUPED-001'
            OR existing.student_account_user_id = account.user_id
   );

INSERT INTO enrollments (student_id, cs_id, status, date_enrolled)
SELECT student.student_id, section.cs_id, 'Active', CURRENT_DATE
  FROM students student
  JOIN user_accounts account ON account.user_id = student.student_account_user_id
  JOIN courses course ON course.course_code = 'INT-GROUPED'
  JOIN class_sections section ON section.course_id = course.course_id
       AND section.instructor_user_id = (SELECT user_id FROM user_accounts WHERE login_email = 'live.grouped.faculty@bicol-u.edu.ph')
       AND section.cs_name = 'GROUPED-1A'
       AND upper(section.semester) = '1ST'
       AND upper(section.school_year) = upper(COALESCE(
            (SELECT setting_value #>> '{schoolYear}' FROM system_settings WHERE setting_key = 'academic.current_school_year'),
            (SELECT setting_value #>> '{school_year}' FROM system_settings WHERE setting_key = 'academic.current_school_year'),
            (SELECT setting_value #>> '{}' FROM system_settings WHERE setting_key = 'academic.current_school_year')
       ))
 WHERE student.student_number = 'INT-GROUPED-001'
   AND account.login_email = 'live.grouped.student@bicol-u.edu.ph'
   AND NOT EXISTS (
        SELECT 1 FROM enrollments existing
         WHERE existing.student_id = student.student_id AND existing.cs_id = section.cs_id
   );

DO $$
DECLARE
    current_year TEXT;
    course_count INTEGER;
    section_count INTEGER;
    offering_count INTEGER;
    faculty_count INTEGER;
    student_count INTEGER;
    enrollment_count INTEGER;
    source_faculty_password_hash TEXT;
    fixture_faculty_password_hash TEXT;
    source_password_hash TEXT;
    fixture_password_hash TEXT;
    fixture_class_id INTEGER;
BEGIN
    SELECT COALESCE(
        setting_value #>> '{schoolYear}',
        setting_value #>> '{school_year}',
        setting_value #>> '{}'
    )
      INTO current_year
      FROM system_settings
     WHERE setting_key = 'academic.current_school_year';

    SELECT COUNT(*) INTO course_count
      FROM courses
     WHERE course_code = 'INT-GROUPED' AND name = 'Grouped Grading Integration Course' AND units = 1.0;
    IF course_count <> 1 THEN
        RAISE EXCEPTION 'Grouped grading fixture course is missing or conflicts with an existing course code';
    END IF;

    SELECT COUNT(*) INTO faculty_count
      FROM user_accounts faculty
      JOIN person_identities person ON person.person_id = faculty.person_id
     WHERE faculty.login_email = 'live.grouped.faculty@bicol-u.edu.ph'
       AND faculty.role = 'faculty'
       AND faculty.status = 'Active'
       AND faculty.approved_at IS NOT NULL
       AND person.first_name = 'Live'
       AND person.last_name = 'Grouped Faculty';
    IF faculty_count <> 1 THEN
        RAISE EXCEPTION 'Grouped grading fixture Faculty account or canonical identity is missing or conflicts with an existing identity';
    END IF;

    SELECT password_hash INTO source_faculty_password_hash
      FROM user_accounts WHERE login_email = 'faculty@bicol-u.edu.ph';
    SELECT password_hash INTO fixture_faculty_password_hash
      FROM user_accounts WHERE login_email = 'live.grouped.faculty@bicol-u.edu.ph';
    IF source_faculty_password_hash IS NULL OR fixture_faculty_password_hash IS DISTINCT FROM source_faculty_password_hash THEN
        RAISE EXCEPTION 'Grouped grading fixture Faculty password hash must match the seeded Faculty';
    END IF;

    SELECT COUNT(*) INTO section_count
      FROM class_sections section
      JOIN courses course ON course.course_id = section.course_id
      JOIN user_accounts faculty ON faculty.user_id = section.instructor_user_id
     WHERE course.course_code = 'INT-GROUPED'
       AND section.cs_name = 'GROUPED-1A'
       AND faculty.login_email = 'live.grouped.faculty@bicol-u.edu.ph'
       AND upper(section.semester) = '1ST'
       AND upper(section.school_year) = upper(current_year)
       AND section.status = 'Active';
    SELECT COUNT(*) INTO offering_count
      FROM class_sections section
      JOIN courses course ON course.course_id = section.course_id
     WHERE course.course_code = 'INT-GROUPED'
       AND section.cs_name = 'GROUPED-1A'
       AND upper(section.semester) = '1ST'
       AND upper(section.school_year) = upper(current_year)
       AND section.status = 'Active';
    IF section_count <> 1 OR offering_count <> 1 THEN
        RAISE EXCEPTION 'Grouped grading fixture section is missing or conflicts with an existing section';
    END IF;

    SELECT COUNT(*) INTO student_count
      FROM students student
      JOIN user_accounts account ON account.user_id = student.student_account_user_id
     WHERE student.student_number = 'INT-GROUPED-001'
       AND student.first_name = 'Live'
       AND student.last_name = 'Grouped'
       AND account.login_email = 'live.grouped.student@bicol-u.edu.ph'
       AND account.role = 'student'
       AND account.status = 'Active';
    IF student_count <> 1 THEN
        RAISE EXCEPTION 'Grouped grading fixture Student is missing or conflicts with an existing identity';
    END IF;

    SELECT password_hash INTO source_password_hash
      FROM user_accounts WHERE login_email = 'student@bicol-u.edu.ph';
    SELECT password_hash INTO fixture_password_hash
      FROM user_accounts WHERE login_email = 'live.grouped.student@bicol-u.edu.ph';
    IF source_password_hash IS NULL OR fixture_password_hash IS DISTINCT FROM source_password_hash THEN
        RAISE EXCEPTION 'Grouped grading fixture Student password hash must match the seeded Student';
    END IF;

    SELECT section.cs_id INTO fixture_class_id
      FROM class_sections section
      JOIN courses course ON course.course_id = section.course_id
     WHERE course.course_code = 'INT-GROUPED' AND section.cs_name = 'GROUPED-1A';

    SELECT COUNT(*) INTO enrollment_count
      FROM enrollments enrollment
      JOIN students student ON student.student_id = enrollment.student_id
     WHERE enrollment.cs_id = fixture_class_id AND student.student_number = 'INT-GROUPED-001';
    IF enrollment_count <> 1 THEN
        RAISE EXCEPTION 'Grouped grading fixture enrollment is missing';
    END IF;

    IF EXISTS (
        SELECT 1 FROM grading_configs config
        JOIN courses course ON course.course_id = config.course_id
        JOIN class_sections section ON section.course_id = course.course_id
        WHERE course.course_code = 'INT-GROUPED' AND section.cs_id = fixture_class_id
    ) OR EXISTS (
        SELECT 1 FROM assessments WHERE cs_id = fixture_class_id
    ) OR EXISTS (
        SELECT 1 FROM enrollments WHERE cs_id = fixture_class_id AND (final_percentage IS NOT NULL OR grade_components_json IS NOT NULL)
    ) THEN
        RAISE EXCEPTION 'Grouped grading live fixture must start without grading configuration, assessments or saved grades';
    END IF;
END
$$;

-- A separate offering exercises automatic syllabus defaults and real first-save
-- mapping without manufacturing an assessment through the guarded runtime API.
INSERT INTO courses (course_code, name, units, semester, grading_config)
SELECT 'INT-SPLIT-DRAFT', 'Split Defaults Integration Course', 1.0, '1ST', '{}'::jsonb
 WHERE NOT EXISTS (SELECT 1 FROM courses WHERE course_code = 'INT-SPLIT-DRAFT');

INSERT INTO class_sections
    (cs_name, course_id, instructor_user_id, semester, school_year, status, term_code)
SELECT 'SPLIT-DRAFT-1A', course.course_id, faculty.user_id, '1ST', sy.school_year,
       'Active', sy.school_year || '-1ST'
  FROM courses course
  JOIN user_accounts faculty ON faculty.login_email = 'live.grouped.faculty@bicol-u.edu.ph'
 CROSS JOIN LATERAL (
    SELECT COALESCE(setting_value #>> '{schoolYear}', setting_value #>> '{school_year}',
                    setting_value #>> '{}') AS school_year
      FROM system_settings WHERE setting_key = 'academic.current_school_year'
 ) sy
 WHERE course.course_code = 'INT-SPLIT-DRAFT'
   AND NOT EXISTS (
    SELECT 1 FROM class_sections existing
     WHERE existing.course_id = course.course_id
       AND existing.instructor_user_id = faculty.user_id
       AND existing.cs_name = 'SPLIT-DRAFT-1A'
       AND upper(existing.semester) = '1ST'
       AND upper(existing.school_year) = upper(sy.school_year)
   );

INSERT INTO assessments (cs_id, title, type, grading_period, max_score, status)
SELECT section.cs_id, 'Live ambiguous default Quiz', 'Quiz', 'Midterm', 100, 'Active'
  FROM class_sections section
  JOIN courses course ON course.course_id = section.course_id
 WHERE course.course_code = 'INT-SPLIT-DRAFT' AND section.cs_name = 'SPLIT-DRAFT-1A'
   AND NOT EXISTS (
    SELECT 1 FROM assessments existing
     WHERE existing.cs_id = section.cs_id AND existing.title = 'Live ambiguous default Quiz'
   );

DO $$
BEGIN
    IF (SELECT count(*) FROM assessments assessment
         JOIN class_sections section ON section.cs_id = assessment.cs_id
         JOIN courses course ON course.course_id = section.course_id
        WHERE course.course_code = 'INT-SPLIT-DRAFT'
          AND section.cs_name = 'SPLIT-DRAFT-1A'
          AND assessment.title = 'Live ambiguous default Quiz'
          AND assessment.type = 'Quiz' AND assessment.grading_period = 'Midterm'
          AND assessment.max_score = 100 AND assessment.grading_category_id IS NULL) <> 1
       OR EXISTS (SELECT 1 FROM grading_configs config
                   JOIN courses course ON course.course_id = config.course_id
                  WHERE course.course_code = 'INT-SPLIT-DRAFT') THEN
        RAISE EXCEPTION 'Split defaults live fixture must have one unmapped Quiz and no saved configuration';
    END IF;
END
$$;

COMMIT;
