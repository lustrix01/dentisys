-- Relax assessment transmutation link check constraint to allow saving assessments in advance before attendance session is conducted
ALTER TABLE assessments
    DROP CONSTRAINT IF EXISTS ck_assessments_transmutation_link;
