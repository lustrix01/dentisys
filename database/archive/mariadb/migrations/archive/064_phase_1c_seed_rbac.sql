INSERT INTO access_role (role_name, description) VALUES
('admin',     'Dean/Administrator'),
('faculty',   'Faculty Member'),
('secretary', 'Class Secretary');

INSERT INTO permission (perm_code, resource, action, description) VALUES
('account.read',             'user_account',        'read',    'Read user account details'),
('account.approve',          'user_account',        'approve', 'Approve faculty registration'),
('account.reject',           'user_account',        'reject',  'Reject faculty registration'),
('role_permission.read',     'role_permission',     'read',    'Read role-permission bindings'),
('faculty_approval.read',    'faculty_approval',    'read',    'Read faculty approval history'),
('student.read',             'student',             'read',    'Read student records'),
('student.create',           'student',             'create',  'Create student records'),
('student.update',           'student',             'update',  'Update student records'),
('student.delete',           'student',             'delete',  'Delete student records'),
('course.read',              'course',              'read',    'Read course information'),
('component_type.read',      'component_type',      'read',    'Read component type taxonomy'),
('grading_component.read',   'component',           'read',    'Read grading component configuration'),
('grading_component.write',  'component',           'write',   'Write grading component configuration'),
('academic_term.read',       'academic_term',       'read',    'Read academic terms'),
('academic_term.write',      'academic_term',       'write',   'Write academic terms'),
('class_section.read',       'class_section',       'read',    'Read class sections'),
('class_section.write',      'class_section',       'write',   'Write class sections'),
('enrollment.read',          'enrollment',          'read',    'Read enrollment records'),
('enrollment.write',         'enrollment',          'write',   'Write enrollment records'),
('assessment.read',          'assessment',          'read',    'Read assessments'),
('assessment.create',        'assessment',          'create',  'Create assessments'),
('assessment.update',        'assessment',          'update',  'Update assessments'),
('assessment.delete',        'assessment',          'delete',  'Delete assessments'),
('assessment_score.write',   'assessment_score',    'write',   'Write assessment scores'),
('term_grade.read',          'student_term_grade',  'read',    'Read term grades'),
('term_grade.write',         'student_term_grade',  'write',   'Write term grades'),
('attendance_session.read',  'attendance_session',  'read',    'Read attendance sessions'),
('attendance_session.create','attendance_session',  'create',  'Create attendance sessions'),
('attendance_record.read',   'attendance_record',   'read',    'Read attendance records'),
('attendance_override.create','attendance_override', 'create',  'Create attendance overrides'),
('retention_policy.read',    'retention_policy',    'read',    'Read retention policies'),
('retention_policy.write',   'retention_policy',    'write',   'Write retention policies'),
('retention_case.read',      'retention_case',      'read',    'Read retention cases'),
('remedial_attempt.read',    'remedial_attempt',    'read',    'Read remedial attempts'),
('remedial_attempt.create',  'remedial_attempt',    'create',  'Create remedial attempts'),
('remedial_attempt.update',  'remedial_attempt',    'update',  'Update remedial attempts'),
('risk_result.read',         'retention_risk',      'read',    'Read retention risk results'),
('invitation.create',        'secretary_invitation', 'create', 'Create secretary invitations'),
('invitation.revoke',        'secretary_invitation', 'revoke', 'Revoke secretary invitations'),
('assignment.read',          'secretary_assignment', 'read',    'Read secretary assignments'),
('biometric_consent.read',   'biometric_consent',   'read',    'Read biometric consent records'),
('biometric_consent.write',  'biometric_consent',   'write',   'Write biometric consent records'),
('student_image.read',       'student_image',       'read',    'Read student images'),
('student_image.write',      'student_image',       'write',   'Write student images'),
('facial_template.metadata', 'facial_template',     'metadata', 'Read facial template metadata'),
('facial_template.enroll',   'facial_template',     'enroll',   'Enroll facial templates'),
('facial_template.verify',   'facial_template',     'verify',   'Verify against facial templates'),
('facial_template.revoke',   'facial_template',     'revoke',   'Revoke facial templates'),
('cctv.read',                'cctv',               'read',    'Read CCTV feeds'),
('email.send',               'email_delivery',      'send',    'Send emails'),
('report.read',              'report',              'read',    'Read reports'),
('report.export',            'report',              'export',  'Export reports'),
('audit.read',               'audit_event',         'read',    'Read audit events'),
('audit.export',             'audit_event',         'export',  'Export audit events'),
('device.read',              'device',              'read',    'Read device information'),
('session.read',             'auth_session',        'read',    'Read authentication sessions'),
('session.force_logout',     'auth_session',        'force_logout', 'Force logout sessions'),
('mfa.read',                 'mfa_credential',      'read',    'Read MFA credentials'),
('mfa.write',                'mfa_credential',      'write',   'Write MFA credentials'),
('recovery_code.generate',   'mfa_recovery_code',   'generate', 'Generate MFA recovery codes'),
('recovery_code.consume',    'mfa_recovery_code',   'consume',  'Consume MFA recovery codes'),
('recovery_code.revoke',     'mfa_recovery_code',   'revoke',   'Revoke MFA recovery codes'),
('profile.read',             'user_account',        'read',    'Read own profile'),
('profile.update',           'user_account',        'update',  'Update own profile'),
('preference.read',          'user_preference',     'read',    'Read user preferences'),
('preference.update',        'user_preference',     'update',  'Update user preferences');

INSERT INTO role_permission (role_id, perm_id, scope_type)
SELECT r.role_id, p.perm_id, 'system_wide'
FROM access_role r, permission p
WHERE r.role_name = 'admin'
  AND p.perm_code IN (
    'account.read', 'account.approve', 'account.reject',
    'role_permission.read', 'faculty_approval.read',
    'student.read',
    'academic_term.write', 'class_section.write',
    'grading_component.write',
    'retention_policy.write', 'facial_template.revoke',
    'report.read', 'report.export',
    'audit.read', 'audit.export',
    'session.read', 'session.force_logout'
  );

INSERT INTO role_permission (role_id, perm_id, scope_type)
SELECT r.role_id, p.perm_id, 'aggregate'
FROM access_role r, permission p
WHERE r.role_name = 'admin'
  AND p.perm_code IN (
    'course.read', 'component_type.read', 'grading_component.read',
    'academic_term.read', 'class_section.read', 'enrollment.read',
    'assessment.read', 'term_grade.read',
    'attendance_session.read', 'attendance_record.read',
    'retention_policy.read', 'retention_case.read', 'remedial_attempt.read',
    'risk_result.read', 'assignment.read',
    'biometric_consent.read', 'student_image.read', 'facial_template.metadata',
    'device.read'
  );

INSERT INTO role_permission (role_id, perm_id, scope_type)
SELECT r.role_id, p.perm_id, 'own'
FROM access_role r, permission p
WHERE r.role_name = 'admin'
  AND p.perm_code IN (
    'mfa.read', 'mfa.write',
    'recovery_code.generate', 'recovery_code.consume', 'recovery_code.revoke',
    'profile.read', 'profile.update',
    'preference.read', 'preference.update'
  );

INSERT INTO role_permission (role_id, perm_id, scope_type)
SELECT r.role_id, p.perm_id, 'assigned_class'
FROM access_role r, permission p
WHERE r.role_name = 'faculty'
  AND p.perm_code IN (
    'student.read', 'student.create', 'student.update', 'student.delete',
    'class_section.read', 'enrollment.read', 'enrollment.write',
    'attendance_session.read', 'attendance_session.create',
    'attendance_record.read',
    'retention_case.read', 'remedial_attempt.read', 'remedial_attempt.create', 'remedial_attempt.update',
    'invitation.create', 'invitation.revoke', 'assignment.read',
    'biometric_consent.read', 'biometric_consent.write',
    'student_image.read', 'student_image.write',
    'facial_template.metadata', 'facial_template.enroll', 'facial_template.verify', 'facial_template.revoke',
    'email.send',
    'report.read', 'report.export'
  );

INSERT INTO role_permission (role_id, perm_id, scope_type)
SELECT r.role_id, p.perm_id, 'aggregate'
FROM access_role r, permission p
WHERE r.role_name = 'faculty'
  AND p.perm_code IN (
    'course.read', 'component_type.read', 'academic_term.read',
    'retention_policy.read', 'risk_result.read', 'device.read'
  );

INSERT INTO role_permission (role_id, perm_id, scope_type)
SELECT r.role_id, p.perm_id, 'assigned_course'
FROM access_role r, permission p
WHERE r.role_name = 'faculty'
  AND p.perm_code IN (
    'grading_component.read', 'grading_component.write',
    'assessment.read', 'assessment.create', 'assessment.update', 'assessment.delete',
    'assessment_score.write', 'term_grade.read', 'term_grade.write'
  );

INSERT INTO role_permission (role_id, perm_id, scope_type)
SELECT r.role_id, p.perm_id, 'own'
FROM access_role r, permission p
WHERE r.role_name = 'faculty'
  AND p.perm_code IN (
    'audit.read',
    'session.read',
    'mfa.read', 'mfa.write',
    'recovery_code.generate', 'recovery_code.consume', 'recovery_code.revoke',
    'profile.read', 'profile.update',
    'preference.read', 'preference.update'
  );

INSERT INTO role_permission (role_id, perm_id, scope_type)
SELECT r.role_id, p.perm_id, 'assigned_class'
FROM access_role r, permission p
WHERE r.role_name = 'secretary'
  AND p.perm_code IN (
    'class_section.read', 'enrollment.read',
    'attendance_session.read', 'attendance_record.read',
    'attendance_override.create', 'assignment.read', 'cctv.read'
  );

INSERT INTO role_permission (role_id, perm_id, scope_type)
SELECT r.role_id, p.perm_id, 'own'
FROM access_role r, permission p
WHERE r.role_name = 'secretary'
  AND p.perm_code IN (
    'audit.read',
    'session.read',
    'mfa.read', 'mfa.write',
    'recovery_code.generate', 'recovery_code.consume', 'recovery_code.revoke',
    'profile.read', 'profile.update',
    'preference.read', 'preference.update'
  );


