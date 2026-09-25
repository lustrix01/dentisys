-- Make person_identities authoritative for structured names. Role-table name
-- columns remain compatibility copies and historical conflict evidence; they
-- must not be allowed to overwrite a canonical person.

ALTER TABLE person_identities
    ADD COLUMN IF NOT EXISTS legacy_conflicts_json JSONB NULL;

COMMENT ON COLUMN person_identities.legacy_display_name IS
    'Historical unsplit display value retained for reconciliation; not an independently editable identity.';

COMMENT ON COLUMN person_identities.legacy_conflicts_json IS
    'Historical structured role values that disagreed during additive backfill; snapshot only, never a current identity source.';

CREATE OR REPLACE FUNCTION identity_legacy_values_conflict(
    legacy_prefix TEXT, legacy_first_name TEXT, legacy_middle_name TEXT,
    legacy_last_name TEXT, legacy_suffix TEXT,
    canonical_prefix TEXT, canonical_first_name TEXT, canonical_middle_name TEXT,
    canonical_last_name TEXT, canonical_suffix TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT (
        (NULLIF(btrim(legacy_prefix), '') IS NOT NULL AND NULLIF(btrim(legacy_prefix), '') IS DISTINCT FROM canonical_prefix)
        OR (NULLIF(btrim(legacy_first_name), '') IS NOT NULL AND NULLIF(btrim(legacy_first_name), '') IS DISTINCT FROM canonical_first_name)
        OR (NULLIF(btrim(legacy_middle_name), '') IS NOT NULL AND NULLIF(btrim(legacy_middle_name), '') IS DISTINCT FROM canonical_middle_name)
        OR (NULLIF(btrim(legacy_last_name), '') IS NOT NULL AND NULLIF(btrim(legacy_last_name), '') IS DISTINCT FROM canonical_last_name)
        OR (NULLIF(btrim(legacy_suffix), '') IS NOT NULL AND NULLIF(btrim(legacy_suffix), '') IS DISTINCT FROM canonical_suffix)
    )
$$;

UPDATE person_identities pi
   SET legacy_conflicts_json = jsonb_strip_nulls(jsonb_build_object(
       'accounts', (
           SELECT jsonb_agg(jsonb_build_object(
               'userId', ua.user_id,
               'displayName', ua.display_name,
               'prefix', ua.name_prefix,
               'firstName', ua.first_name,
               'middleName', ua.middle_name,
               'lastName', ua.last_name,
               'suffix', ua.name_suffix
           ) ORDER BY ua.user_id)
             FROM user_accounts ua
            WHERE ua.person_id = pi.person_id
              AND identity_legacy_values_conflict(
                    ua.name_prefix, ua.first_name, ua.middle_name, ua.last_name, ua.name_suffix,
                    pi.name_prefix, pi.first_name, pi.middle_name, pi.last_name, pi.name_suffix
                  )
       ),
       'students', (
           SELECT jsonb_agg(jsonb_build_object(
               'studentId', s.student_id,
               'prefix', s.name_prefix,
               'firstName', s.first_name,
               'middleName', s.middle_name,
               'lastName', s.last_name,
               'suffix', s.name_suffix
           ) ORDER BY s.student_id)
             FROM students s
            WHERE s.person_id = pi.person_id
              AND identity_legacy_values_conflict(
                    s.name_prefix, s.first_name, s.middle_name, s.last_name, s.name_suffix,
                    pi.name_prefix, pi.first_name, pi.middle_name, pi.last_name, pi.name_suffix
                  )
       )
   ))
 WHERE EXISTS (
       SELECT 1
         FROM user_accounts ua
        WHERE ua.person_id = pi.person_id
          AND identity_legacy_values_conflict(
                ua.name_prefix, ua.first_name, ua.middle_name, ua.last_name, ua.name_suffix,
                pi.name_prefix, pi.first_name, pi.middle_name, pi.last_name, pi.name_suffix
              )
   )
    OR EXISTS (
       SELECT 1
         FROM students s
        WHERE s.person_id = pi.person_id
          AND identity_legacy_values_conflict(
                s.name_prefix, s.first_name, s.middle_name, s.last_name, s.name_suffix,
                pi.name_prefix, pi.first_name, pi.middle_name, pi.last_name, pi.name_suffix
              )
   );

CREATE OR REPLACE FUNCTION sync_user_account_person_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    canonical RECORD;
BEGIN
    IF NEW.person_id IS NULL THEN
        INSERT INTO person_identities (
            name_prefix, first_name, middle_name, last_name, name_suffix, legacy_display_name
        ) VALUES (
            NEW.name_prefix, NEW.first_name, NEW.middle_name, NEW.last_name,
            NEW.name_suffix, NEW.display_name
        ) RETURNING person_id INTO NEW.person_id;
        IF NEW.first_name IS NOT NULL AND NEW.last_name IS NOT NULL THEN
            NEW.display_name := concat_ws(' ', NULLIF(btrim(NEW.name_prefix), ''),
                NULLIF(btrim(NEW.first_name), ''), NULLIF(btrim(NEW.middle_name), ''),
                NULLIF(btrim(NEW.last_name), ''), NULLIF(btrim(NEW.name_suffix), ''));
        END IF;
        RETURN NEW;
    END IF;

    SELECT name_prefix, first_name, middle_name, last_name, name_suffix
      INTO canonical
      FROM person_identities
     WHERE person_id = NEW.person_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'User account references a missing canonical person identity';
    END IF;

    IF identity_legacy_values_conflict(
        NEW.name_prefix, NEW.first_name, NEW.middle_name, NEW.last_name, NEW.name_suffix,
        canonical.name_prefix, canonical.first_name, canonical.middle_name,
        canonical.last_name, canonical.name_suffix
    ) THEN
        RAISE EXCEPTION
            'Role identity fields conflict with the canonical person; reconcile the preserved values before changing them';
    END IF;

    IF canonical.first_name IS NOT NULL AND canonical.last_name IS NOT NULL THEN
        NEW.display_name := concat_ws(' ', NULLIF(btrim(canonical.name_prefix), ''),
            NULLIF(btrim(canonical.first_name), ''), NULLIF(btrim(canonical.middle_name), ''),
            NULLIF(btrim(canonical.last_name), ''), NULLIF(btrim(canonical.name_suffix), ''));
    END IF;

    RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION sync_student_person_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    account_person BIGINT;
    canonical RECORD;
BEGIN
    SELECT person_id
      INTO account_person
      FROM user_accounts
     WHERE user_id = COALESCE(NEW.student_account_user_id, NEW.user_id)
       AND person_id IS NOT NULL;

    IF account_person IS NOT NULL THEN
        NEW.person_id := account_person;
    ELSIF NEW.person_id IS NULL THEN
        INSERT INTO person_identities (
            name_prefix, first_name, middle_name, last_name, name_suffix
        ) VALUES (
            NEW.name_prefix, NEW.first_name, NEW.middle_name, NEW.last_name, NEW.name_suffix
        ) RETURNING person_id INTO NEW.person_id;
    END IF;

    SELECT name_prefix, first_name, middle_name, last_name, name_suffix
      INTO canonical
      FROM person_identities
     WHERE person_id = NEW.person_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Student references a missing canonical person identity';
    END IF;

    IF identity_legacy_values_conflict(
        NEW.name_prefix, NEW.first_name, NEW.middle_name, NEW.last_name, NEW.name_suffix,
        canonical.name_prefix, canonical.first_name, canonical.middle_name,
        canonical.last_name, canonical.name_suffix
    ) THEN
        RAISE EXCEPTION
            'Student identity fields conflict with the canonical person; reconcile the preserved values before changing them';
    END IF;

    RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_user_accounts_person_identity ON user_accounts;
CREATE TRIGGER trg_user_accounts_person_identity
BEFORE INSERT OR UPDATE OF display_name, name_prefix, first_name, middle_name, last_name, name_suffix, person_id
ON user_accounts
FOR EACH ROW EXECUTE FUNCTION sync_user_account_person_identity();

DROP TRIGGER IF EXISTS trg_students_person_identity ON students;
CREATE TRIGGER trg_students_person_identity
BEFORE INSERT OR UPDATE OF user_id, student_account_user_id, name_prefix, first_name, middle_name, last_name, name_suffix, person_id
ON students
FOR EACH ROW EXECUTE FUNCTION sync_student_person_identity();

-- Fill only absent role-cache parts. A non-empty mismatch remains preserved
-- in legacy_conflicts_json and is not silently selected or overwritten.
UPDATE user_accounts ua
   SET name_prefix = pi.name_prefix,
       first_name = pi.first_name,
       middle_name = pi.middle_name,
       last_name = pi.last_name,
       name_suffix = pi.name_suffix,
       updated_at = CURRENT_TIMESTAMP(6)
  FROM person_identities pi
 WHERE ua.person_id = pi.person_id
   AND NOT identity_legacy_values_conflict(
       ua.name_prefix, ua.first_name, ua.middle_name, ua.last_name, ua.name_suffix,
       pi.name_prefix, pi.first_name, pi.middle_name, pi.last_name, pi.name_suffix
   );

UPDATE students s
   SET name_prefix = pi.name_prefix,
       first_name = pi.first_name,
       middle_name = pi.middle_name,
       last_name = pi.last_name,
       name_suffix = pi.name_suffix,
       updated_at = CURRENT_TIMESTAMP(6)
  FROM person_identities pi
 WHERE s.person_id = pi.person_id
   AND NOT identity_legacy_values_conflict(
       s.name_prefix, s.first_name, s.middle_name, s.last_name, s.name_suffix,
       pi.name_prefix, pi.first_name, pi.middle_name, pi.last_name, pi.name_suffix
   );
