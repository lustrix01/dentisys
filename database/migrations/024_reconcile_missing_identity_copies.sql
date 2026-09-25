-- Migration 023 correctly preserves non-empty legacy identity conflicts. This
-- follow-up handles databases that already applied its first pass: empty role
-- name fields are absent compatibility values, not conflicting identities.

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
   SET legacy_conflicts_json = NULL
 WHERE NOT EXISTS (
       SELECT 1
         FROM user_accounts ua
        WHERE ua.person_id = pi.person_id
          AND identity_legacy_values_conflict(
                ua.name_prefix, ua.first_name, ua.middle_name, ua.last_name, ua.name_suffix,
                pi.name_prefix, pi.first_name, pi.middle_name, pi.last_name, pi.name_suffix
              )
   )
   AND NOT EXISTS (
       SELECT 1
         FROM students s
        WHERE s.person_id = pi.person_id
          AND identity_legacy_values_conflict(
                s.name_prefix, s.first_name, s.middle_name, s.last_name, s.name_suffix,
                pi.name_prefix, pi.first_name, pi.middle_name, pi.last_name, pi.name_suffix
              )
   );

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
