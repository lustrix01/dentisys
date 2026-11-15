-- UI-001 wording rule 7 (2026-11-15): a comma before academic degrees in composed names
-- ("Roberto Lim Santos, DMD"; "Maria Villareal Santos, DMD, PhD"); none before Jr., Sr., II, III, IV, V.
-- Same rule as account_identity_composed_name() in backend/app/account_identity.php.
-- 1) identity_composed_name() holds the rule; the user_accounts identity trigger uses it instead of a plain concat_ws.
-- 2) user_accounts.display_name is stored, so existing rows are recomposed from person_identities, but ONLY rows whose
--    display_name still equals the old composition (words joined by single spaces, no comma). Hand-edited or legacy
--    display names are left untouched, and so are rows whose role-table identity copy conflicts with the canonical person.
-- Additive: no column, table or data is removed; running it twice changes nothing.

CREATE OR REPLACE FUNCTION identity_composed_name(
    p_prefix TEXT, p_first TEXT, p_middle TEXT, p_last TEXT, p_suffix TEXT
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT concat_ws(' ', NULLIF(btrim(p_prefix), ''), NULLIF(btrim(p_first), ''),
                     NULLIF(btrim(p_middle), ''), NULLIF(btrim(p_last), ''))
        || CASE
               WHEN NULLIF(btrim(p_suffix), '') IS NULL THEN ''
               WHEN btrim(p_suffix) ~* '^((jr|sr)\.?|ii|iii|iv|v)$' THEN ' ' || btrim(p_suffix)
               ELSE ', ' || btrim(p_suffix)
           END
$$;

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
            NEW.display_name := identity_composed_name(NEW.name_prefix, NEW.first_name, NEW.middle_name, NEW.last_name, NEW.name_suffix);
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
        NEW.display_name := identity_composed_name(canonical.name_prefix, canonical.first_name, canonical.middle_name,
                                                   canonical.last_name, canonical.name_suffix);
    END IF;

    RETURN NEW;
END
$$;

UPDATE user_accounts ua
   SET display_name = identity_composed_name(pi.name_prefix, pi.first_name, pi.middle_name, pi.last_name, pi.name_suffix)
  FROM person_identities pi
 WHERE pi.person_id = ua.person_id
   AND pi.first_name IS NOT NULL AND pi.last_name IS NOT NULL
   AND NULLIF(btrim(pi.name_suffix), '') IS NOT NULL
   AND ua.display_name = concat_ws(' ', NULLIF(btrim(pi.name_prefix), ''), NULLIF(btrim(pi.first_name), ''),
                                   NULLIF(btrim(pi.middle_name), ''), NULLIF(btrim(pi.last_name), ''), NULLIF(btrim(pi.name_suffix), ''))
   AND ua.display_name <> identity_composed_name(pi.name_prefix, pi.first_name, pi.middle_name, pi.last_name, pi.name_suffix)
   AND NOT identity_legacy_values_conflict(
        ua.name_prefix, ua.first_name, ua.middle_name, ua.last_name, ua.name_suffix,
        pi.name_prefix, pi.first_name, pi.middle_name, pi.last_name, pi.name_suffix);
