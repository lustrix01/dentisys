-- Store class-section semesters as the canonical codes the seed and grading
-- configurations use ('1ST', '2ND'). Classes created from the form were saved
-- as '1st Semester' / '2nd Semester', which split one course offering into two
-- grading configurations. Additive data fix; rows that would collide with an
-- existing canonical grading configuration are left unchanged.
WITH mapped AS (
    SELECT gc.config_id,
           CASE WHEN upper(btrim(gc.semester)) IN ('1ST SEMESTER', 'FIRST SEMESTER') THEN '1ST'
                ELSE '2ND' END AS canonical
      FROM grading_configs gc
     WHERE upper(btrim(gc.semester)) IN ('1ST SEMESTER', 'FIRST SEMESTER', '2ND SEMESTER', 'SECOND SEMESTER')
)
UPDATE grading_configs gc
   SET semester = m.canonical
  FROM mapped m
 WHERE gc.config_id = m.config_id
   AND NOT EXISTS (
        SELECT 1 FROM grading_configs other
         WHERE other.faculty_user_id = gc.faculty_user_id
           AND other.course_id = gc.course_id
           AND other.school_year = gc.school_year
           AND other.semester = m.canonical
   );

UPDATE class_sections cs
   SET semester = CASE WHEN upper(btrim(cs.semester)) IN ('1ST SEMESTER', 'FIRST SEMESTER') THEN '1ST' ELSE '2ND' END,
       term_code = cs.school_year || '-' || CASE WHEN upper(btrim(cs.semester)) IN ('1ST SEMESTER', 'FIRST SEMESTER') THEN '1ST' ELSE '2ND' END
 WHERE upper(btrim(cs.semester)) IN ('1ST SEMESTER', 'FIRST SEMESTER', '2ND SEMESTER', 'SECOND SEMESTER')
   AND NOT EXISTS (
        -- keep the old spelling if its grading configuration could not move
        SELECT 1 FROM grading_configs gc
         WHERE gc.faculty_user_id = cs.instructor_user_id
           AND gc.course_id = cs.course_id
           AND gc.school_year = upper(cs.school_year)
           AND gc.semester = upper(cs.semester)
   );
