-- Make the existing retention-policy threshold the authoritative value for
-- the provisional professional-course trigger. Migration 027 recorded the
-- inclusive operator and compatibility grade key, but active computation and
-- Admin settings already consume retention_policy.retention_threshold.
--
-- Keep the older keys synchronized for compatibility. This changes no saved
-- grade, remedial result, or historical outcome.
UPDATE system_settings
   SET setting_value = jsonb_set(
           jsonb_set(
               jsonb_set(setting_value, '{retention_threshold}', to_jsonb(2.50::numeric), true),
               '{initial_trigger_grade}', to_jsonb(2.50::numeric), true
           ),
           '{initial_trigger_operator}', to_jsonb('GTE'::text), true
       ),
       updated_at = CURRENT_TIMESTAMP(6)
 WHERE setting_key = 'retention_policy';

UPDATE system_settings
   SET setting_value = jsonb_set(
           setting_value,
           '{retention_gwa_threshold}',
           to_jsonb(2.50::numeric),
           true
       ),
       updated_at = CURRENT_TIMESTAMP(6)
 WHERE setting_key = 'grading_defaults';
