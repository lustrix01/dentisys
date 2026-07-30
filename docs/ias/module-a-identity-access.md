# IAS Module A: Identity and Access Fortification

> Implementation update: DentiSys now uses optional authenticator-app 2FA and recovery codes. Email-code verification and MFA method selection are retired; Google-only sign-in remains planned.

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

## Complete RBAC Matrix (125 Static Grants)

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

Total: 125 rows (= 62 admin + 47 faculty + 16 secretary)

### Secretary Restrictions

- No access to: assessment_scores, grades, retention_cases, remedial_exams, facial_templates (enrollment or metadata), system_settings, student update or disable.
- Attendance: read_records and override only. No create_session or mark. Automated CCTV/device ingestion is a device/service policy, not a Secretary role action.
- Facial enrollment is performed from the Faculty Student Management page, not from any Secretary page.

### Faculty Delete = Enrollment Archive

The Faculty Student Management "delete" action maps to `enrollments.archive` (setting `retention_state='archived'` on the enrollment row for the faculty's class section). The student record is NOT globally disabled or deleted. Global student disable (`students.disable`) is admin-only (system_wide).

### Public Endpoint Policies (Outside RBAC Matrix)

- `POST /api/auth/login` — unauthenticated
- `POST /api/auth/register` — unauthenticated
- `POST /api/auth/password/reset-request` — unauthenticated
- `POST /api/activate-secretary` — invitation token based
- `GET /api/health` — unauthenticated

## Design Rationale

- **Hashing/MAC strategy**: Passwords use `PASSWORD_DEFAULT`. Recovery codes use `PASSWORD_DEFAULT`. Token digests use SHA-256. MFA secrets use AES-256-GCM authenticated encryption. Audit chain uses HMAC-SHA-256.
- **Privilege management**: Server-side authorization only. Never trusts browser-supplied role or scope. Scope derived from class_sections FK relationships (instructor_user_id, secretary_user_id), not from user_accounts JSON fields.
- **Least privilege**: Secretary has 16 grants compared to admin's 62 and faculty's 47. Secretary has read-only student, attendance, and audit access within assigned class only.
