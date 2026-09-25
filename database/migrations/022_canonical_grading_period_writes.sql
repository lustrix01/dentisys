-- Make grading_category_period_memberships the authoritative write relation.
-- The older config_id-bearing table remains as a controlled compatibility
-- projection for existing API/database consumers. Existing identifiers are
-- preserved; no legacy data is discarded.

ALTER TABLE grading_category_period_memberships
    DROP CONSTRAINT IF EXISTS grading_category_period_memberships_category_period_id_fkey;

CREATE SEQUENCE IF NOT EXISTS grading_category_period_memberships_category_period_id_seq;

ALTER TABLE grading_category_period_memberships
    ALTER COLUMN category_period_id SET DEFAULT nextval('grading_category_period_memberships_category_period_id_seq');

ALTER SEQUENCE grading_category_period_memberships_category_period_id_seq
    OWNED BY grading_category_period_memberships.category_period_id;

SELECT setval(
    'grading_category_period_memberships_category_period_id_seq',
    COALESCE((SELECT MAX(category_period_id) FROM grading_category_period_memberships), 0) + 1,
    false
);

-- Migration 020 made the legacy table authoritative. Remove only that trigger
-- edge; the compatibility table itself and every preserved row remain.
DROP TRIGGER IF EXISTS trg_grading_category_period_membership ON grading_category_periods;

CREATE OR REPLACE FUNCTION project_grading_category_period_compatibility()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    membership_config_id BIGINT;
BEGIN
    IF TG_OP = 'DELETE' THEN
        DELETE FROM grading_category_periods
         WHERE category_period_id = OLD.category_period_id;
        RETURN OLD;
    END IF;

    SELECT gc.config_id
      INTO membership_config_id
      FROM grading_categories gc
     WHERE gc.category_id = NEW.category_id;

    IF membership_config_id IS NULL THEN
        RAISE EXCEPTION 'Cannot project grading-period membership without category ownership';
    END IF;

    INSERT INTO grading_category_periods (
        category_period_id, config_id, category_id, grading_period, name,
        weight, sort_order, source_kind, created_at, updated_at
    ) VALUES (
        NEW.category_period_id, membership_config_id, NEW.category_id,
        NEW.grading_period, NEW.name, NEW.weight, NEW.sort_order,
        NEW.source_kind, NEW.created_at, NEW.updated_at
    )
    ON CONFLICT (category_period_id) DO UPDATE SET
        config_id = EXCLUDED.config_id,
        category_id = EXCLUDED.category_id,
        grading_period = EXCLUDED.grading_period,
        name = EXCLUDED.name,
        weight = EXCLUDED.weight,
        sort_order = EXCLUDED.sort_order,
        source_kind = EXCLUDED.source_kind,
        updated_at = EXCLUDED.updated_at;

    RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION reject_direct_grading_category_period_compatibility_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    -- A canonical projection trigger is one level deeper than an application
    -- statement. This keeps the compatibility copy controlled without a
    -- reverse trigger and therefore avoids recursive/circular synchronization.
    IF pg_trigger_depth() <= 1 THEN
        RAISE EXCEPTION
            'grading_category_periods is a read-only compatibility projection; write grading_category_period_memberships instead';
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
$$;

DROP TRIGGER IF EXISTS trg_grading_category_period_compatibility_guard ON grading_category_periods;
CREATE TRIGGER trg_grading_category_period_compatibility_guard
BEFORE INSERT OR UPDATE OR DELETE ON grading_category_periods
FOR EACH ROW EXECUTE FUNCTION reject_direct_grading_category_period_compatibility_write();

DROP TRIGGER IF EXISTS trg_project_grading_category_period_compatibility ON grading_category_period_memberships;
CREATE TRIGGER trg_project_grading_category_period_compatibility
AFTER INSERT OR UPDATE OR DELETE ON grading_category_period_memberships
FOR EACH ROW EXECUTE FUNCTION project_grading_category_period_compatibility();

COMMENT ON TABLE grading_category_period_memberships IS
    'Authoritative period-category relation; configuration ownership is derived through grading_categories.';

COMMENT ON TABLE grading_category_periods IS
    'Read-only compatibility projection of grading_category_period_memberships; retained for legacy consumers and preserved identifiers.';
