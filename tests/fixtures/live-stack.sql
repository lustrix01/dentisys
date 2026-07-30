-- Disposable PostgreSQL integration fixture. Loaded explicitly by check-postgres.ps1.
BEGIN;

INSERT INTO user_accounts
    (user_id, login_email, password_hash, role, display_name, title, status, created_at, approved_at)
VALUES
    (1, 'admin@bicol-u.edu.ph', '$2y$10$0tYRcP7zAjkSDhMCQ15Dk.6JhJs4nmuqIPhyFdWRp3kdphwW4BwV.', 'admin', 'Integration Admin', 'Administrator', 'Active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (2, 'faculty@bicol-u.edu.ph', '$2y$10$2ZtP1tEJ4.xf/H5K62LjtOAscT82f9Z01GULXkFL4NbJFM1fqAwGC', 'faculty', 'Integration Faculty', 'Faculty', 'Active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;

INSERT INTO courses
    (course_id, course_code, name, units, year_level, semester, description, is_clinical, grading_config)
VALUES
    (1, 'INT101', 'Integration Course', 3, 1, '1ST', 'Disposable integration fixture course', 0, '{"quizzes":30,"exams":50,"attendance":20}'::jsonb)
ON CONFLICT DO NOTHING;

INSERT INTO class_sections
    (cs_id, cs_name, course_id, instructor_user_id, semester, school_year, year_level, status, term_code, term_start_date, term_end_date)
VALUES
    (1, 'INT-1A', 1, 2, '1ST', '2026-2027', 1, 'Active', '2026-1ST', CURRENT_DATE, CURRENT_DATE + 120)
ON CONFLICT DO NOTHING;

SELECT setval(pg_get_serial_sequence('user_accounts', 'user_id'), GREATEST((SELECT COALESCE(MAX(user_id), 1) FROM user_accounts), 1), true);
SELECT setval(pg_get_serial_sequence('courses', 'course_id'), GREATEST((SELECT COALESCE(MAX(course_id), 1) FROM courses), 1), true);
SELECT setval(pg_get_serial_sequence('class_sections', 'cs_id'), GREATEST((SELECT COALESCE(MAX(cs_id), 1) FROM class_sections), 1), true);
COMMIT;
