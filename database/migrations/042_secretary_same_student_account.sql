-- REG-006 / BIO-010: a Class Secretary is a Student appointed to one section
-- and uses the Student's own account. Existing Secretary accounts that were
-- the only account of their Student become that Student's canonical account.
-- Where a Student also has a separate Student account, the appointment moves
-- to the Student account and the old Secretary account is disabled (kept for
-- history; nothing is deleted).

-- 1. Secretary account is the Student's only account: link it canonically.
UPDATE students s
   SET student_account_user_id = s.user_id
  FROM user_accounts ua
 WHERE ua.user_id = s.user_id
   AND ua.role = 'secretary'
   AND s.student_account_user_id IS NULL
   AND lower(trim(ua.login_email)) = lower(trim(s.bu_email));

-- 2. Student has both accounts: appoint the Student account instead.
CREATE TEMP TABLE secretary_account_merge ON COMMIT DROP AS
SELECT s.student_id, s.user_id AS secretary_user_id, s.student_account_user_id AS student_user_id
  FROM students s
  JOIN user_accounts sec ON sec.user_id = s.user_id AND sec.role = 'secretary'
 WHERE s.student_account_user_id IS NOT NULL
   AND s.student_account_user_id <> s.user_id;

UPDATE class_sections cs
   SET secretary_user_id = m.student_user_id
  FROM secretary_account_merge m
 WHERE cs.secretary_user_id = m.secretary_user_id;

UPDATE students s
   SET user_id = m.student_user_id
  FROM secretary_account_merge m
 WHERE s.student_id = m.student_id;

UPDATE user_accounts ua
   SET role = 'secretary'
  FROM secretary_account_merge m
 WHERE ua.user_id = m.student_user_id
   AND EXISTS (SELECT 1 FROM class_sections cs WHERE cs.secretary_user_id = m.student_user_id);

UPDATE user_accounts ua
   SET status = 'Disabled'
  FROM secretary_account_merge m
 WHERE ua.user_id = m.secretary_user_id;
