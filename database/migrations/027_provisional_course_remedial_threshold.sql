-- Record the Owner-approved provisional professional-course trigger in the
-- existing retention-policy setting.  The established-precision authoritative
-- final grade is allowed below 2.50 and requires remediation at 2.50 or above.
-- Keep legacy policy fields for compatibility; do not rewrite historical
-- enrollment outcomes or infer remedial attempts from them.
UPDATE system_settings
   SET setting_value = jsonb_set(
           jsonb_set(setting_value, '{initial_trigger_operator}', to_jsonb('GTE'::text), true),
           '{initial_trigger_grade}', to_jsonb(2.50::numeric), true
       ),
       updated_at = CURRENT_TIMESTAMP(6)
 WHERE setting_key = 'retention_policy';
