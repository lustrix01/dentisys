# IAS Module A: Identity and Access Fortification

> Implementation update: DentiSys now uses optional authenticator-app 2FA and recovery codes. Email-code verification and MFA method selection are retired. Google Sign-In is available alongside password authentication, with explicit password ownership, existing MFA/recovery, and DentiSys sessions remaining authoritative. Faculty onboarding requires an Admin invitation (the approval); Student onboarding requires a Faculty invitation tied to a canonical Student and class enrollment. Google is optional identity verification at invitation acceptance, while a DentiSys password remains mandatory.

## P03 Student identity and sessions

Student authentication uses the existing server-issued access/refresh session machinery for password and Google provenance. `auth_sessions.authentication_source` records `password`, `google`, or the explicitly development-only `development_mock` source. Access-token verification calls `auth_assert_student_eligible()` to re-check the canonical Student identity invariant (role, account status, Student status, institutional-email match, and exactly one canonical link) without requiring a current enrollment. Enrollment is checked during Faculty invitation issuance and class-scoped activation, and by `require_owned_enrollment()` object scoping.

Student onboarding uses authenticated `POST /api/faculty/student-invitations`, public `GET /api/auth/student/invitation`, and public `POST /api/auth/student/activate`. Faculty must own the specified active class enrollment, and the canonical Student must be active, have an approved institutional email, and have no conflicting Secretary/account link. The 24-hour one-time token is bound to both Student and class; legacy tokens without class scope are rejected. Inspection and activation recheck the canonical identity and exact active enrollment. Activation requires a DentiSys password; optional Google verification must match the invited email and is never an authority to begin onboarding. Tokens are stored as digests and never returned outside the development-only mechanism. Password reset, MFA enrollment/verification/recovery, refresh rotation, and logout retain their existing server-side lifecycle and re-check Student eligibility where an account is acted upon.

### Explicit identity decisions

- **Provisioning/link invariant:** Faculty invitation issuance provisions or explicitly reauthorizes one non-login-capable `Pending Activation` account. Faculty-issued Student invitations provision one `Pending Activation` `user_accounts` row and set `students.student_account_user_id`; they never backfill `students.user_id`. Student onboarding requires an active enrollment in the specific inviting class. Existing conflicting links require manual reconciliation. P06 owns legacy Secretary reconciliation.
- **Google Sign-In and invitation verification:** GIS ID tokens are verified server-side with `Google\Auth\AccessToken`, expected audience/issuer/expiry/subject/email/domain/Workspace checks, and `google` session provenance. An unlinked existing account requires explicit password confirmation and existing MFA before the nullable unique `google_subject` is atomically bound. At invitation acceptance Google is optional, must match the invited identity, and grants no invitation authority; every account remains password-backed.
- **Student/Secretary relationship:** one canonical Student account may not be converted to admin/faculty; a legacy Secretary-only `students.user_id` link remains valid and separate. Secretary activation rejects a Student canonical link, and P03 does not merge or migrate the two identities.

## TOTP Enrollment and Verification Flow

```
User                    Backend                         Database
 |                        |                               |
 |--POST /login (pwd)---->|                               |
 |                        |--verify password (bcrypt)     |
 |                        |--check mfa_status='enabled'  |
 |<--mfa_required:true----|                               |
 |  (mfa_session_token)   |                               |
 |                        |                               |
 |--POST /mfa/verify----->|                               |
 |  (token + code)        |                               |
 |                        |--decrypt ciphertext           |
 |                        |--compute TOTP(current_step)   |
 |                        |--identify matched_step        |
 |                        |--matched_step >               |
 |                        |  last_accepted_step?          |
 |                        |--UPDATE last_accepted_step--> |
 |                        |--issue access_token +         |
 |                        |  refresh_token                |
 |                        |--INSERT auth_sessions-------->|
 |                        |  (issued_token_version)       |
 |                        |--INSERT security_tokens------>|
 |                        |  (purpose=refresh)            |
 |<--access_token +       |                               |
 |  refresh cookie        |                               |
```

### MFA Enrollment

```
User                    Backend                         Database
 |                        |                               |
 |--POST /mfa/enroll/--->|                               |
 |  (enrollment_token)   |                               |
 |                        |--generate 20B random secret   |
 |                        |--AES-256-GCM encrypt          |
 |                        |  ( openssl_cipher_iv_length ) |
 |                        |--INSERT security_tokens------>|
 |                        |  (purpose=mfa_credential,     |
 |                        |   status='pending')           |
 |<--base32_secret +      |                               |
 |  otpauth:// URI        |                               |
 |                        |                               |
 |--POST /mfa/enroll/--->|                               |
 |  confirm (code)        |                               |
 |                        |--decrypt, verify TOTP         |
 |                        |--UPDATE mfa_status='enabled'  |
 |                        |  last_accepted_step=matched   |
 |                        |--generate 8 recovery codes    |
 |                        |  (password_hash)              |
 |                        |--INSERT security_tokens------>|
 |                        |  (purpose=mfa_recovery,       |
 |                        |   secret_hash)                |
 |<--recovery codes-------|                               |
 |  (display once)        |                               |
```

### Key Design Points

- **Password hashing**: `password_hash($password, PASSWORD_DEFAULT)`, VARCHAR(255) storage.
- **TOTP secret encryption**: AES-256-GCM. IV length validated via `openssl_cipher_iv_length('aes-256-gcm')` (12 bytes). Auth tag verified during decryption.
- **Replay protection**: Identify exact matched_step (`current_step-1`, `current_step`, or `current_step+1`). Accept only when `matched_step > last_accepted_step`. Update `last_accepted_step` to `matched_step` atomically.
- **Recovery codes**: 8 codes, each hashed with `password_hash(PASSWORD_DEFAULT)`. Consumed via `used_at` timestamp. Marked used, never deleted.
- **No QR dependency**: Only base32 secret text and otpauth URI returned. QR rendering is not approved for Stage 1.

### Challenge Token Design

- `enrollment_token` claims: `{sub: user_id, purpose: "mfa_enrollment", jti: "unique", iat, exp: iat+300}`
- `mfa_session_token` claims: `{sub: user_id, purpose: "mfa_challenge", jti: "unique", iat, exp: iat+300}`
- Lifetime: 5-minute expiry.
- Normal access-token middleware rejects tokens with a `purpose` claim.
- **Attempt limit**: Enforced by the filesystem rate limiter using the challenge JTI as part of the rate-limit key. The rate limiter is implemented in a later stage. A verification-attempt counter is NOT maintained inside the signed challenge JWT because client-side state is not authoritative.
- No new database table or security_tokens purpose is added for challenge attempts.

## Complete RBAC Matrix (125 Baseline + 7 P03 Student Grants)

| Role | Resource | Action | Scope |
|------|----------|--------|-------|
| **Admin** | mfa | enroll_own, verify_own, recover_own | own |
| | mfa | force_disable_any | system_wide |
| | user_accounts | read_own, update_own | own |
| | user_accounts | read, update_status | system_wide |
| | sessions | read_own, revoke_own | own |
| | sessions | read_any, revoke_any | system_wide |
| | students | create, update, disable | system_wide |
| | students | read | aggregate |
| | class_sections | read | aggregate |
| | class_sections | create, update | system_wide |
| | courses | read | aggregate |
| | courses | create, update | system_wide |
| | enrollments | read | aggregate |
| | enrollments | create, archive, update_grade | system_wide |
| | assessments | create, update, archive | system_wide |
| | assessments | read | aggregate |
| | assessment_scores | create, update, bulk_submit | system_wide |
| | assessment_scores | read | aggregate |
| | grades | read | aggregate |
| | grades | override | system_wide |
| | attendance | create_session, override | system_wide |
| | attendance | read_records | aggregate |
| | retention_policy | read | aggregate |
| | retention_policy | configure | system_wide |
| | retention_cases | read | aggregate |
| | retention_cases | override | system_wide |
| | remedial_exams | read | aggregate |
| | remedial_exams | create, score | system_wide |
| | biometric_consent | read | aggregate |
| | biometric_consent | manage | system_wide |
| | facial_templates | enroll, revoke, read_metadata | system_wide |
| | invitations | read, create, revoke | system_wide |
| | email | send, read_history | system_wide |
| | reports | generate | aggregate |
| | audit_trail | read_own | own |
| | audit_trail | read_module, read_all | system_wide |
| | system_settings | read, update | system_wide |
| **Faculty** | mfa | enroll_own, verify_own, recover_own | own |
| | user_accounts | read_own, update_own | own |
| | sessions | read_own, revoke_own | own |
| | students | create, read, update | assigned_class |
| | class_sections | read | assigned_class |
| | class_sections | update | assigned_course |
| | courses | read | assigned_course |
| | enrollments | read | assigned_class |
| | enrollments | create, archive, update_grade | assigned_course |
| | assessments | create, read, update, archive | assigned_course |
| | assessment_scores | create, read, update, bulk_submit | assigned_course |
| | grades | read | assigned_class |
| | grades | override | assigned_course |
| | attendance | create_session, override | assigned_course |
| | attendance | read_records | assigned_class |
| | retention_policy | read | assigned_class |
| | retention_cases | read | assigned_class |
| | remedial_exams | read, create, score | assigned_course |
| | biometric_consent | read | assigned_class |
| | facial_templates | enroll, revoke, read_metadata | assigned_class |
| | invitations | read, create, revoke | assigned_class |
| | email | send | assigned_class |
| | email | read_history | own |
| | reports | generate | assigned_class |
| | audit_trail | read_own | own |
| | audit_trail | read_module | assigned_class |
| **Secretary** | mfa | enroll_own, verify_own, recover_own | own |
| | user_accounts | read_own, update_own | own |
| | sessions | read_own, revoke_own | own |
| | students | read | assigned_class |
| | class_sections | read | assigned_class |
| | courses | read | assigned_class |
| | enrollments | read | assigned_class |
| | attendance | read_records | assigned_class |
| | attendance | override | assigned_class |
| | audit_trail | read_own | own |
| | audit_trail | read_module | assigned_class |
| | secretary_invitation_own | accept | own |

Baseline total: 125 rows (= 62 admin + 47 faculty + 16 secretary). P03 adds
seven Student self-scoped grants, for 132 active grants.

### Student P03 Grants

| Role | Resource | Action | Scope |
|------|----------|--------|-------|
| **Student** | mfa | enroll_own, verify_own, recover_own | own |
| | user_accounts | read_own, update_own | own |
| | sessions | read_own, revoke_own | own |

### Secretary Restrictions

- No access to: assessment_scores, grades, retention_cases, remedial_exams, facial_templates (enrollment or metadata), system_settings, student update or disable.
- Attendance: read_records and override only. No create_session or mark. Automated CCTV/device ingestion is a device/service policy, not a Secretary role action.
- Facial enrollment is performed from the Faculty Student Management page, not from any Secretary page.

### Faculty Delete = Enrollment Archive

The Faculty Student Management "delete" action maps to `enrollments.archive` (setting `retention_state='archived'` on the enrollment row for the faculty's class section). The student record is NOT globally disabled or deleted. Global student disable (`students.disable`) is admin-only (system_wide).

### Public Endpoint Policies (Outside RBAC Matrix)

- `POST /api/auth/login` — unauthenticated
- `POST /api/admin/faculty-invitations` — authenticated Admin; invitation is Faculty approval
- `POST /api/faculty/student-invitations` — authenticated Faculty; invitation must match an owned active class enrollment
- `POST /api/auth/password/reset-request` — unauthenticated
- `POST /api/activate-secretary` — invitation token based
- `GET /api/health` — unauthenticated

## Design Rationale

- **Hashing/MAC strategy**: Passwords use `PASSWORD_DEFAULT`. Recovery codes use `PASSWORD_DEFAULT`. Token digests use SHA-256. MFA secrets use AES-256-GCM authenticated encryption. Audit chain uses HMAC-SHA-256.
- **Privilege management**: Server-side authorization only. Never trusts browser-supplied role or scope. Scope derived from class_sections FK relationships (instructor_user_id, secretary_user_id), not from user_accounts JSON fields.
- **Least privilege**: Secretary has 16 grants compared to admin's 62 and faculty's 47. Secretary has read-only student, attendance, and audit access within assigned class only.
