-- DentiSys P03 Student identity and authentication.
-- Additive PostgreSQL migration. Legacy Secretary links are intentionally
-- preserved; P06 owns their migration and reconciliation.

ALTER TABLE students
    ADD COLUMN IF NOT EXISTS student_account_user_id INTEGER NULL;

-- The baseline role/purpose checks predate the Student role and activation
-- token family. Replace those checks in this additive migration; no existing
-- role or token rows are rewritten.
ALTER TABLE user_accounts DROP CONSTRAINT IF EXISTS ck_user_accounts_role;
ALTER TABLE user_accounts
    ADD CONSTRAINT ck_user_accounts_role
    CHECK (role IN ('admin', 'faculty', 'secretary', 'student'));

ALTER TABLE role_permissions DROP CONSTRAINT IF EXISTS ck_role_permissions_role;
ALTER TABLE role_permissions
    ADD CONSTRAINT ck_role_permissions_role
    CHECK (role_name IN ('admin', 'faculty', 'secretary', 'student'));

ALTER TABLE security_tokens DROP CONSTRAINT IF EXISTS ck_security_tokens_purpose;
ALTER TABLE security_tokens
    ADD CONSTRAINT ck_security_tokens_purpose
    CHECK (purpose IN ('mfa_credential', 'mfa_recovery', 'password_reset',
                       'access_token_blacklist', 'secretary_invitation',
                       'refresh', 'student_activation'));

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conname = 'uq_students_student_account_user_id'
           AND conrelid = 'students'::regclass
    ) THEN
        ALTER TABLE students
            ADD CONSTRAINT uq_students_student_account_user_id
            UNIQUE (student_account_user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conname = 'fk_students_student_account_user'
           AND conrelid = 'students'::regclass
    ) THEN
        ALTER TABLE students
            ADD CONSTRAINT fk_students_student_account_user
            FOREIGN KEY (student_account_user_id)
            REFERENCES user_accounts (user_id)
            ON DELETE RESTRICT
            ON UPDATE RESTRICT
            DEFERRABLE INITIALLY DEFERRED;
    END IF;
END
$$;

CREATE OR REPLACE FUNCTION validate_student_account_identity_user(target_user_id INTEGER)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    account_role TEXT;
    account_email TEXT;
    canonical_count INTEGER;
    mismatch_count INTEGER;
BEGIN
    SELECT role, login_email
      INTO account_role, account_email
      FROM user_accounts
     WHERE user_id = target_user_id;

    -- A deleted/non-existent account is handled by the FK. There is no
    -- account invariant to evaluate when the row is absent.
    IF account_role IS NULL THEN
        RETURN;
    END IF;

    SELECT count(*), count(*) FILTER (
        WHERE s.bu_email IS NULL
           OR lower(trim(s.bu_email)) <> lower(trim(account_email))
        )
      INTO canonical_count, mismatch_count
      FROM students s
     WHERE s.student_account_user_id = target_user_id;

    IF account_role = 'student' AND canonical_count <> 1 THEN
        RAISE EXCEPTION 'Student account must have exactly one canonical Student link'
            USING ERRCODE = '23514';
    END IF;

    IF account_role NOT IN ('student', 'secretary') AND canonical_count > 0 THEN
        RAISE EXCEPTION 'Canonical Student account cannot become an administrator or faculty account'
            USING ERRCODE = '23514';
    END IF;

    IF mismatch_count > 0 THEN
        RAISE EXCEPTION 'Canonical Student account email does not match student email'
            USING ERRCODE = '23514';
    END IF;

END;
$$;

CREATE OR REPLACE FUNCTION validate_student_identity_link()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    linked_role TEXT;
    linked_email TEXT;
BEGIN
    -- Revalidate the old account whenever a canonical link moves or is
    -- removed. Constraint-trigger deferral evaluates the final transaction
    -- state, so an atomic A -> B reassignment can satisfy both accounts.
    IF TG_OP = 'DELETE' THEN
        IF OLD.student_account_user_id IS NOT NULL THEN
            PERFORM validate_student_account_identity_user(OLD.student_account_user_id);
        END IF;
        RETURN OLD;
    END IF;

    IF TG_OP = 'UPDATE'
       AND OLD.student_account_user_id IS DISTINCT FROM NEW.student_account_user_id
       AND OLD.student_account_user_id IS NOT NULL THEN
        PERFORM validate_student_account_identity_user(OLD.student_account_user_id);
    END IF;

    -- A legacy Secretary-only link remains valid and is deliberately not
    -- canonicalized by this migration.
    IF NEW.student_account_user_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT role, login_email
      INTO linked_role, linked_email
      FROM user_accounts
     WHERE user_id = NEW.student_account_user_id;

    IF linked_role IS NULL OR linked_role NOT IN ('student', 'secretary') THEN
        RAISE EXCEPTION 'Canonical Student account must have role student or secretary'
            USING ERRCODE = '23514';
    END IF;

    IF NEW.bu_email IS NULL
       OR lower(trim(linked_email)) <> lower(trim(NEW.bu_email)) THEN
        RAISE EXCEPTION 'Canonical Student account email does not match student email'
            USING ERRCODE = '23514';
    END IF;

    IF NEW.user_id IS NOT NULL AND NEW.user_id <> NEW.student_account_user_id THEN
        RAISE EXCEPTION 'Legacy Secretary and canonical Student links must identify the same account'
            USING ERRCODE = '23514';
    END IF;

    -- Revalidate the destination account as well; the user_accounts trigger
    -- does not fire when only the Student row changes.
    PERFORM validate_student_account_identity_user(NEW.student_account_user_id);
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_student_account_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    PERFORM validate_student_account_identity_user(NEW.user_id);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_students_identity_link ON students;
CREATE CONSTRAINT TRIGGER trg_students_identity_link
AFTER INSERT OR UPDATE OR DELETE ON students
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validate_student_identity_link();

DROP TRIGGER IF EXISTS trg_user_accounts_student_identity ON user_accounts;
CREATE CONSTRAINT TRIGGER trg_user_accounts_student_identity
AFTER INSERT OR UPDATE ON user_accounts
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validate_student_account_identity();

ALTER TABLE auth_sessions
    ADD COLUMN IF NOT EXISTS authentication_source TEXT NOT NULL DEFAULT 'password';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conname = 'ck_auth_sessions_authentication_source'
           AND conrelid = 'auth_sessions'::regclass
    ) THEN
        ALTER TABLE auth_sessions
            ADD CONSTRAINT ck_auth_sessions_authentication_source
            CHECK (authentication_source IN ('password', 'development_mock'));
    END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_security_tokens_student_activation_live
    ON security_tokens (user_id)
    WHERE purpose = 'student_activation'
      AND used_at IS NULL
      AND revoked_at IS NULL;

INSERT INTO role_permissions (role_name, resource, action, scope) VALUES
    ('student', 'mfa', 'enroll_own', 'own'),
    ('student', 'mfa', 'verify_own', 'own'),
    ('student', 'mfa', 'recover_own', 'own'),
    ('student', 'user_accounts', 'read_own', 'own'),
    ('student', 'user_accounts', 'update_own', 'own'),
    ('student', 'sessions', 'read_own', 'own'),
    ('student', 'sessions', 'revoke_own', 'own')
ON CONFLICT (role_name, resource, action, scope) DO NOTHING;
