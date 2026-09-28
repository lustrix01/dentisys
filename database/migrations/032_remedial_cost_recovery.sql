-- Cost recovery program result, the last step after two failed remedial
-- attempts (retention policy). Passing clears the Student for that course;
-- the original course grade is never changed.
CREATE TABLE IF NOT EXISTS enrollment_cost_recovery (
    enrollment_id INTEGER PRIMARY KEY REFERENCES enrollments (enrollment_id)
        ON UPDATE RESTRICT ON DELETE CASCADE,
    final_grade NUMERIC(3,2) NOT NULL,
    outcome TEXT NOT NULL,
    actor_user_id INTEGER NOT NULL REFERENCES user_accounts (user_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
    recorded_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT ck_cost_recovery_grade CHECK (final_grade >= 1.00 AND final_grade <= 5.00),
    CONSTRAINT ck_cost_recovery_outcome CHECK (outcome IN ('passed', 'failed'))
);

COMMENT ON TABLE enrollment_cost_recovery IS
    'Cost recovery program result recorded after both remedial attempts failed.';
