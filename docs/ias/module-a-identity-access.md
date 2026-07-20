# IAS Module A: Identity and Access Fortification

## TOTP Enrollment and Verification Flow

```
User                    Backend                         Database
 |                        |                               |
 |--POST /enroll--------->|                               |
 |                        |--generate TOTP secret-------->|
 |                        |--AES-256-GCM encrypt--------->|
 |                        |  (random nonce, auth tag)     |
 |                        |--INSERT mfa_credential------->|
 |                        |  status='pending'             |
 |<--otpauth URI + QR-----|                               |
 |                        |                               |
 |--POST /verify (code)--->|                               |
 |                        |--SELECT mfa_credential------->|
 |                        |--decrypt ciphertext           |
 |                        |--compute expected TOTP        |
 |                        |--check last_accepted_step     |
 |                        |--UPDATE status='enabled'----->|
 |                        |--generate recovery codes----->|
 |                        |  (store bcrypt hashes)        |
 |<--recovery codes-------|                               |
 |  (display once)        |                               |
 |                        |                               |
 |--POST /login----------->|                               |
 |  (password + TOTP)     |                               |
 |                        |--verify password (bcrypt)     |
 |                        |--decrypt TOTP secret          |
 |                        |--compute & verify TOTP        |
 |                        |--update last_accepted_step    |
 |                        |--INSERT auth_session--------->|
 |<--session token--------|                               |
```

## Complete RBAC Matrix

### 66 Permissions × 3 Roles

| perm_code | Admin | Faculty | Secretary | Scope perms for each role |
|-----------|-------|---------|-----------|--------------------------|
| account.read | system_wide | — | — |
| account.approve | system_wide | — | — |
| account.reject | system_wide | — | — |
| role_permission.read | system_wide | — | — |
| faculty_approval.read | system_wide | — | — |
| student.read | system_wide | assigned_class | — |
| student.create | — | assigned_class | — |
| student.update | — | assigned_class | — |
| student.delete | — | assigned_class | — |
| course.read | aggregate | aggregate | — |
| component_type.read | aggregate | aggregate | — |
| grading_component.read | aggregate | assigned_course | — |
| grading_component.write | system_wide | assigned_course | — |
| academic_term.read | aggregate | aggregate | — |
| academic_term.write | system_wide | — | — |
| class_section.read | aggregate | assigned_class | assigned_class |
| class_section.write | system_wide | — | — |
| enrollment.read | aggregate | assigned_class | assigned_class |
| enrollment.write | — | assigned_class | — |
| assessment.read | aggregate | assigned_course | — |
| assessment.create | — | assigned_course | — |
| assessment.update | — | assigned_course | — |
| assessment.delete | — | assigned_course | — |
| assessment_score.write | — | assigned_course | — |
| term_grade.read | aggregate | assigned_course | — |
| term_grade.write | — | assigned_course | — |
| attendance_session.read | aggregate | assigned_class | assigned_class |
| attendance_session.create | — | assigned_class | — |
| attendance_record.read | aggregate | assigned_class | assigned_class |
| attendance_override.create | — | — | assigned_class |
| retention_policy.read | aggregate | aggregate | — |
| retention_policy.write | system_wide | — | — |
| retention_case.read | aggregate | assigned_class | — |
| remedial_attempt.read | aggregate | assigned_class | — |
| remedial_attempt.create | — | assigned_class | — |
| remedial_attempt.update | — | assigned_class | — |
| risk_result.read | aggregate | aggregate | — |
| invitation.create | — | assigned_class | — |
| invitation.revoke | — | assigned_class | — |
| assignment.read | aggregate | assigned_class | assigned_class |
| biometric_consent.read | aggregate | assigned_class | — |
| biometric_consent.write | — | assigned_class | — |
| student_image.read | aggregate | assigned_class | — |
| student_image.write | — | assigned_class | — |
| facial_template.metadata | aggregate | assigned_class | — |
| facial_template.enroll | — | assigned_class | — |
| facial_template.verify | — | assigned_class | — |
| facial_template.revoke | system_wide | assigned_class | — |
| cctv.read | — | — | assigned_class |
| email.send | — | assigned_class | — |
| report.read | system_wide | assigned_class | — |
| report.export | system_wide | assigned_class | — |
| audit.read | system_wide | own | own |
| audit.export | system_wide | — | — |
| device.read | aggregate | aggregate | — |
| session.read | system_wide | own | own |
| session.force_logout | system_wide | — | — |
| mfa.read | own | own | own |
| mfa.write | own | own | own |
| recovery_code.generate | own | own | own |
| recovery_code.consume | own | own | own |
| recovery_code.revoke | own | own | own |
| profile.read | own | own | own |
| profile.update | own | own | own |
| preference.read | own | own | own |
| preference.update | own | own | own |

**Totals**: Admin 45, Faculty 54, Secretary 18, Combined 117 bindings.

No permission grants raw TOTP secrets, recovery codes, passwords, refresh/access tokens, or raw LBPH facial-template vectors.

## Design Rationale

The TOTP design uses AES-256-GCM authenticated encryption rather than a one-way hash because the shared secret is symmetric key material that the server must recover to compute time-based HMAC codes per RFC 6238. This mirrors the fundamental principle behind HOTP/TOTP: the shared secret is an input to an HMAC computation, not a user-supplied value to compare. By contrast, passwords and recovery codes are stored as irreversible bcrypt hashes because they are compared against user-submitted input rather than used as computational input. The normalized RBAC model separates three concerns: identity (which `access_role` a user holds), capability (which `permission` codes that role grants), and boundary (the `scope_type` on each `role_permission` binding plus assignment records). A Secretary user holds the SECRETARY role which grants `attendance_override.create`, but the `scope_type = 'assigned_class'` combined with `secretary_assignment.cs_id` constrains which class_section records they may act upon — achieving least-privilege without granting broad system-wide access merely through role membership.
