-- Add explicit Lecture/Laboratory components while retaining all existing
-- configuration, category, membership and assessment identifiers.

ALTER TABLE grading_configs
    ADD COLUMN component_mode TEXT NOT NULL DEFAULT 'combined',
    ADD COLUMN component_lecture_weight NUMERIC(7,4),
    ADD COLUMN component_laboratory_weight NUMERIC(7,4);

ALTER TABLE grading_configs
    ADD CONSTRAINT ck_grading_configs_component_weights
    CHECK (
        (component_mode = 'combined'
            AND component_lecture_weight IS NULL
            AND component_laboratory_weight IS NULL)
        OR
        (component_mode = 'lecture_laboratory'
            AND schema_mode = 'periods'
            AND component_lecture_weight IS NOT NULL
            AND component_laboratory_weight IS NOT NULL
            AND component_lecture_weight > 0
            AND component_laboratory_weight > 0
            AND component_lecture_weight <= 100
            AND component_laboratory_weight <= 100
            AND component_lecture_weight + component_laboratory_weight = 100)
    );

ALTER TABLE grading_category_periods
    ADD COLUMN component TEXT NOT NULL DEFAULT 'Combined';

ALTER TABLE grading_category_periods
    ADD CONSTRAINT ck_grading_category_periods_component
    CHECK (component IN ('Combined', 'Lecture', 'Laboratory'));

ALTER TABLE grading_category_period_memberships
    ADD COLUMN component TEXT NOT NULL DEFAULT 'Combined';

ALTER TABLE grading_category_period_memberships
    ADD CONSTRAINT ck_gcpm_component
    CHECK (component IN ('Combined', 'Lecture', 'Laboratory'));

-- Period category uniqueness includes the explicit component, so a label such
-- as Quiz may safely appear once in Lecture and once in Laboratory.
DROP INDEX IF EXISTS uq_grading_categories_config_period_name;
CREATE UNIQUE INDEX uq_grading_categories_overall_name
    ON grading_categories (config_id, lower(btrim(name)))
    WHERE grading_period IS NULL;

DROP INDEX IF EXISTS uq_grading_category_periods_name;
CREATE UNIQUE INDEX uq_grading_category_periods_name_component
    ON grading_category_periods (
        config_id,
        grading_period,
        component,
        lower(btrim(name))
    );

-- Membership is the canonical write relation; the application validates
-- attendance uniqueness across components while preserving legacy duplicate
-- rows so recomputation can continue to report them as incomplete.
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
        weight, sort_order, source_kind, component, created_at, updated_at
    ) VALUES (
        NEW.category_period_id, membership_config_id, NEW.category_id,
        NEW.grading_period, NEW.name, NEW.weight, NEW.sort_order,
        NEW.source_kind, NEW.component, NEW.created_at, NEW.updated_at
    )
    ON CONFLICT (category_period_id) DO UPDATE SET
        config_id = EXCLUDED.config_id,
        category_id = EXCLUDED.category_id,
        grading_period = EXCLUDED.grading_period,
        name = EXCLUDED.name,
        weight = EXCLUDED.weight,
        sort_order = EXCLUDED.sort_order,
        source_kind = EXCLUDED.source_kind,
        component = EXCLUDED.component,
        updated_at = EXCLUDED.updated_at;

    RETURN NEW;
END
$$;

COMMENT ON COLUMN grading_configs.component_mode IS
    'combined preserves current grading; lecture_laboratory enables explicit grouped grading.';

COMMENT ON COLUMN grading_category_period_memberships.component IS
    'Component associated with a period-specific category membership; Combined preserves prior configurations.';
