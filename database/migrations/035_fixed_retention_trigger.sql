-- The retention trigger is fixed college policy (a course GWA of 2.5 or worse
-- triggers remedial) and is no longer an Admin setting. Store the fixed value
-- so any report that still reads the settings rows agrees with the code.
UPDATE system_settings
   SET setting_value = setting_value || jsonb_build_object(
           'retention_threshold', 2.5,
           'initial_trigger_grade', 2.5),
       updated_at = CURRENT_TIMESTAMP(6)
 WHERE setting_key = 'retention_policy';

UPDATE system_settings
   SET setting_value = setting_value || jsonb_build_object('retention_gwa_threshold', 2.5),
       updated_at = CURRENT_TIMESTAMP(6)
 WHERE setting_key = 'grading_defaults';
