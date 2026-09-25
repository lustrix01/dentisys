-- A legacy account may have only an unsplit display value. When a structured
-- Student record is first linked to that otherwise-empty canonical person,
-- enrich the canonical fields from the structured Student record. This is
-- initialization, not a role-specific overwrite of an existing identity.

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

    IF NULLIF(btrim(canonical.first_name), '') IS NULL
       AND NULLIF(btrim(canonical.last_name), '') IS NULL
       AND NULLIF(btrim(NEW.first_name), '') IS NOT NULL
       AND NULLIF(btrim(NEW.last_name), '') IS NOT NULL THEN
        UPDATE person_identities
           SET name_prefix = NEW.name_prefix,
               first_name = NEW.first_name,
               middle_name = NEW.middle_name,
               last_name = NEW.last_name,
               name_suffix = NEW.name_suffix,
               updated_at = CURRENT_TIMESTAMP(6)
         WHERE person_id = NEW.person_id;
        canonical.name_prefix := NEW.name_prefix;
        canonical.first_name := NEW.first_name;
        canonical.middle_name := NEW.middle_name;
        canonical.last_name := NEW.last_name;
        canonical.name_suffix := NEW.name_suffix;
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
